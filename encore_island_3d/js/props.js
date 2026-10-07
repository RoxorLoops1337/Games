// Encore Island 3D — props & landmarks (stage, marquee, stall, vault, monument, forge, plates, lamps, meadow, coins).
// Procedural geometry + canvas textures only. Static geometry is merged per material (vertex-coloured "solid" bucket).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { C, SCALE } from './palette.js';

const TAU = Math.PI * 2, PI = Math.PI;
const INK = '#2d170f';
const UP = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------- small utils
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

function canvasTex(w, h, draw, opt = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = opt.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = 4; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
function rrPath(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function starPath(g, cx, cy, ro, ri, n = 5, rot = -PI / 2) { g.beginPath(); for (let i = 0; i < n * 2; i++) { const a = rot + i / (n * 2) * TAU, r = i % 2 ? ri : ro; const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); }
const FONT = '"Arial Rounded MT Bold","Trebuchet MS","Segoe UI",system-ui,-apple-system,sans-serif';
function fitFont(g, txt, maxW, size) { g.font = `900 ${size}px ${FONT}`; const w = g.measureText(txt).width; return w > maxW ? size * maxW / w : size; }
// sticker lettering: dark ink outline, cream rim, candy gradient fill, glossy highlight
function stickerText(g, txt, cx, cy, size, c1, c2, sw) {
  g.font = `900 ${size}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.miterLimit = 2;
  const off = size * 0.07;
  g.strokeStyle = INK; g.lineWidth = sw + 10; g.strokeText(txt, cx, cy + off);
  g.strokeStyle = INK; g.lineWidth = sw; g.strokeText(txt, cx, cy);
  g.strokeStyle = '#fff4e6'; g.lineWidth = sw * 0.55; g.strokeText(txt, cx, cy);
  const gr = g.createLinearGradient(0, cy - size * 0.5, 0, cy + size * 0.5); gr.addColorStop(0, c1); gr.addColorStop(1, c2);
  g.fillStyle = gr; g.fillText(txt, cx, cy);
  g.save(); g.globalAlpha = 0.35; g.fillStyle = '#fff'; g.beginPath(); g.rect(cx - 2000, cy - size * 0.46, 4000, size * 0.14); g.globalCompositeOperation = 'source-atop'; g.fillText(txt, cx, cy); g.restore();
}

// ---------------------------------------------------------------- materials
const mk = (o) => new THREE.MeshStandardMaterial(Object.assign({ flatShading: true, roughness: 0.8, metalness: 0 }, o));
const bas = (r, g, b, o) => new THREE.MeshBasicMaterial(Object.assign({ color: new THREE.Color(r, g, b) }, o));
const M = {
  solid: mk({ vertexColors: true }),
  gold: mk({ vertexColors: true, roughness: 0.3, metalness: 0.25, emissive: 0x6a4000, emissiveIntensity: 0.55 }),
  goldPlain: mk({ color: 0xffd84d, roughness: 0.3, metalness: 0.25, emissive: 0xc88400, emissiveIntensity: 0.6 }),
  goldD: mk({ vertexColors: true, roughness: 0.3, metalness: 0.25, emissive: 0x6a4000, emissiveIntensity: 0.55, side: THREE.DoubleSide }),
  gem: new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.8, 1.8, 1.8) }),
  lamp: bas(1.9, 1.3, 0.5),
  flame: bas(2.0, 1.2, 0.3),
  mouth: bas(1.5, 0.55, 0.12),
  bulbA: bas(1, 1, 1), bulbB: bas(1, 1, 1), bulbC: bas(1, 1, 1),
  rim: bas(2.4, 0.6, 1.2),
  smoke: mk({ color: 0xe6dcf8, emissive: 0x4a3a7a, emissiveIntensity: 0.5, transparent: true, opacity: 0.62, depthWrite: false }),
  coin: mk({ vertexColors: true, roughness: 0.3, metalness: 0.3, emissive: 0xc88400, emissiveIntensity: 0.5 }),
};
for (const k of ['gem', 'lamp', 'mouth', 'bulbA', 'bulbB', 'bulbC', 'rim']) M[k].userData.noCast = true;
M.smoke.userData.noCast = true;
const GOLD = { m: M.gold, c: C.gold }, GOLD2 = { m: M.gold, c: 0xffe98a }, GOLD3 = { m: M.gold, c: 0xe8a420 };

// ---------------------------------------------------------------- merged-geometry collector
const gc = {};
const G = (key, fn) => gc[key] || (gc[key] = (() => { const g = fn(); return g.index ? g.toNonIndexed() : g; })());
const GB = {
  box: () => G('box', () => new THREE.BoxGeometry(1, 1, 1)),
  cyl: (n, rt = 1) => G('cyl' + n + '_' + rt, () => new THREE.CylinderGeometry(rt, 1, 1, n)),
  tube: (n) => G('tube' + n, () => new THREE.CylinderGeometry(1, 1, 1, n, 1, true)),
  cone: (n) => G('cone' + n, () => new THREE.ConeGeometry(1, 1, n)),
  ico: (d) => G('ico' + d, () => new THREE.IcosahedronGeometry(1, d)),
  oct: () => G('oct', () => new THREE.OctahedronGeometry(1, 0)),
  tor: (tube, n, seg) => G('tor' + tube + '_' + n + '_' + seg, () => new THREE.TorusGeometry(1, tube, n, seg)),
};
let cur = new Map();
const ORG = new THREE.Matrix4();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);
function setOrigin(x, y, z, yaw) { ORG.compose(_p.set(x, y, z), _q.setFromAxisAngle(UP, yaw || 0), _one); }
function put(g, mat, color, m) {
  const src = g.index ? g.toNonIndexed() : g;
  const n = src.attributes.position.count;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(new Float32Array(src.attributes.position.array), 3));
  out.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(src.attributes.normal.array), 3));
  out.applyMatrix4(m);
  if (mat.vertexColors) {
    const c = new THREE.Color(color), a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    out.setAttribute('color', new THREE.BufferAttribute(a, 3));
  }
  let b = cur.get(mat); if (!b) cur.set(mat, b = []); b.push(out);
}
function part(g, c, x, y, z, sx, sy, sz, rx, ry, rz) {
  const mat = typeof c === 'number' ? M.solid : c.m, col = typeof c === 'number' ? c : c.c;
  _e.set(rx || 0, ry || 0, rz || 0); _q.setFromEuler(_e);
  _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)); _m.premultiply(ORG);
  put(g, mat, col, _m);
}
const box = (c, x, y, z, w, h, d, rx, ry, rz) => part(GB.box(), c, x, y, z, w, h, d, rx, ry, rz);
const bbox = (c, x, y, z, w, h, d, rx, ry, rz) => part(GB.box(), c, x, y + h / 2, z, w, h, d, rx, ry, rz);
const cylc = (c, x, y, z, r, h, n = 10, rx, ry, rz, rt = 1, sz) => part(GB.cyl(n, rt), c, x, y, z, r, h, sz || r, rx, ry, rz);
const cyl = (c, x, y, z, r, h, n = 10, rt = 1) => part(GB.cyl(n, rt), c, x, y + h / 2, z, r, h, r, 0, 0, 0);
const conec = (c, x, y, z, r, h, n = 8, rx, ry, rz) => part(GB.cone(n), c, x, y, z, r, h, r, rx, ry, rz);
const cone = (c, x, y, z, r, h, n = 8) => part(GB.cone(n), c, x, y + h / 2, z, r, h, r, 0, 0, 0);
const ball = (c, x, y, z, r, d = 1, sy = 1, sz) => part(GB.ico(d), c, x, y, z, r, r * sy, sz ? r * sz : r, 0, 0, 0);
const tor = (c, x, y, z, R, tube, n = 6, seg = 14, rx, ry, rz) => part(GB.tor(tube / R, n, seg), c, x, y, z, R, R, R, rx, ry, rz);
const shp = (g, c, x, y, z, s, rx, ry, rz) => part(g, c, x, y, z, s, s, s, rx, ry, rz);

function flush(map) {
  const grp = new THREE.Group();
  for (const [mat, list] of map) {
    const geom = mergeGeometries(list, false); list.forEach(d => d.dispose());
    const m = new THREE.Mesh(geom, mat);
    m.castShadow = !mat.userData.noCast; m.receiveShadow = !!mat.isMeshStandardMaterial;
    grp.add(m);
  }
  return grp;
}
function local(fn) { const sc = cur, so = ORG.clone(); cur = new Map(); ORG.identity(); fn(); const g = flush(cur); cur = sc; ORG.copy(so); return g; }
function geoOf(fn) { const sc = cur, so = ORG.clone(); cur = new Map(); ORG.identity(); fn(); const list = [...cur.values()][0]; const g = mergeGeometries(list, false); cur = sc; ORG.copy(so); return g; }

// shapes
function starShape(n, ro, ri) { const s = new THREE.Shape(); for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * TAU + PI / 2, r = i % 2 ? ri : ro; const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? s.lineTo(x, y) : s.moveTo(x, y); } s.closePath(); return s; }
function rrShape(w, h, r) { const s = new THREE.Shape(), x = -w / 2, y = -h / 2; s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s; }
function extr(shape, depth, bev, key) { return G(key, () => { const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelSegments: 1, curveSegments: 5 }); g.translate(0, 0, -depth / 2); return g; }); }

// ---------------------------------------------------------------- textures
function glintAtlas() {
  return canvasTex(256, 128, (g) => {
    let gr = g.createRadialGradient(64, 64, 0, 64, 64, 62); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.14)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    // 4-point glint
    g.save(); g.translate(192, 64);
    gr = g.createRadialGradient(0, 0, 0, 0, 0, 14); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(-20, -20, 40, 40);
    g.fillStyle = '#fff';
    for (let i = 0; i < 2; i++) { g.rotate(i * PI / 2); g.beginPath(); g.moveTo(-60, 0); g.quadraticCurveTo(-5, -3, 0, -60); g.quadraticCurveTo(5, -3, 60, 0); g.quadraticCurveTo(5, 3, 0, 60); g.quadraticCurveTo(-5, 3, -60, 0); g.fill(); }
    g.restore();
  }, { linear: true });
}
function ringTex(dashes, thick) {
  return canvasTex(512, 512, (g) => {
    g.clearRect(0, 0, 512, 512);
    const gr = g.createRadialGradient(256, 256, 40, 256, 256, 250); gr.addColorStop(0, 'rgba(255,255,255,0.0)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.0)'); gr.addColorStop(0.78, 'rgba(255,255,255,0.35)'); gr.addColorStop(0.88, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
    g.strokeStyle = '#fff'; g.lineCap = 'round';
    g.lineWidth = thick; g.beginPath(); g.arc(256, 256, 190, 0, TAU); if (dashes) g.setLineDash([TAU * 190 / dashes * 0.6, TAU * 190 / dashes * 0.4]); g.stroke(); g.setLineDash([]);
    g.lineWidth = thick * 0.45; g.globalAlpha = 0.7; g.beginPath(); g.arc(256, 256, 218, 0, TAU); g.stroke(); g.globalAlpha = 1;
  }, { linear: false });
}
function brickTex() {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = '#b9a8f0'; g.fillRect(0, 0, 256, 256);
    const cols = ['#7a5cd8', '#6c4fcb', '#8a6ce0', '#6247bd'];
    const r = rng(7);
    for (let row = 0; row < 8; row++) for (let c = -1; c < 4; c++) {
      const x = c * 64 + (row % 2 ? 32 : 0), y = row * 32;
      g.fillStyle = cols[(r() * 4) | 0]; rrPath(g, x + 3, y + 3, 58, 26, 5); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(x + 7, y + 5, 50, 4);
      g.fillStyle = 'rgba(30,10,80,0.25)'; g.fillRect(x + 7, y + 24, 50, 4);
    }
  });
}

// ---------------------------------------------------------------- plate icons (256px stickers)
function stickerBase(g, c1, c2) {
  g.clearRect(0, 0, 256, 256);
  g.fillStyle = '#fff4e6'; g.beginPath(); g.arc(128, 128, 124, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 9; g.stroke();
  const gr = g.createRadialGradient(100, 84, 8, 128, 128, 112); gr.addColorStop(0, c1); gr.addColorStop(1, c2);
  g.fillStyle = gr; g.beginPath(); g.arc(128, 128, 102, 0, TAU); g.fill(); g.lineWidth = 8; g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 8; g.beginPath(); g.arc(128, 128, 88, PI * 1.12, PI * 1.55); g.stroke();
  g.strokeStyle = INK; g.lineWidth = 9; g.lineJoin = 'round'; g.lineCap = 'round';
}
const fs = (g, f) => { g.fillStyle = f; g.fill(); g.stroke(); };
const ICONS = {
  shoe(g) {
    g.beginPath(); g.moveTo(66, 168); g.lineTo(70, 100); g.quadraticCurveTo(72, 88, 86, 88); g.lineTo(108, 90); g.quadraticCurveTo(124, 122, 156, 128); g.quadraticCurveTo(198, 134, 200, 158); g.lineTo(200, 170); g.closePath(); fs(g, '#fff4e6');
    g.beginPath(); g.moveTo(70, 100); g.quadraticCurveTo(72, 88, 86, 88); g.lineTo(108, 90); g.lineTo(104, 112); g.lineTo(72, 116); g.closePath(); fs(g, '#ff4d8d');
    rrPath(g, 60, 164, 148, 24, 12); fs(g, '#ffd84d');
    g.lineWidth = 6; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(112 + i * 16, 112 + i * 7); g.lineTo(124 + i * 16, 104 + i * 7); g.stroke(); }
    g.lineWidth = 7; g.strokeStyle = '#fff4e6'; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(34, 112 + i * 20); g.lineTo(58 - i * 6, 112 + i * 20); g.stroke(); } g.strokeStyle = INK;
  },
  backpack(g) {
    g.beginPath(); g.arc(128, 70, 26, PI, 0); g.lineWidth = 12; g.stroke(); g.lineWidth = 9;
    rrPath(g, 78, 72, 100, 122, 30); fs(g, '#ff9a2e');
    rrPath(g, 78, 72, 100, 42, 22); fs(g, '#ffc24d');
    rrPath(g, 94, 128, 68, 50, 12); fs(g, '#ffe5a8');
    g.beginPath(); g.moveTo(112, 128); g.lineTo(112, 140); g.lineTo(144, 140); g.lineTo(144, 128); g.stroke();
    g.beginPath(); g.arc(128, 150, 7, 0, TAU); fs(g, '#ff4d8d');
  },
  drum(g) {
    for (const s of [-1, 1]) {
      g.save(); g.translate(128, 132); g.rotate(s * 0.72);
      rrPath(g, -12, -80, 24, 150, 12); fs(g, '#ffd9a0');
      g.beginPath(); g.arc(0, -84, 22, 0, TAU); fs(g, '#fff4e6');
      g.beginPath(); g.arc(0, 70, 15, 0, TAU); fs(g, '#ff4d8d');
      g.restore();
    }
    g.beginPath(); g.ellipse(128, 176, 48, 16, 0, 0, TAU); fs(g, '#ff4d8d');
  },
  metronome(g) {
    g.beginPath(); g.moveTo(104, 52); g.lineTo(152, 52); g.lineTo(186, 192); g.lineTo(70, 192); g.closePath(); fs(g, '#ffd84d');
    g.beginPath(); g.moveTo(112, 72); g.lineTo(144, 72); g.lineTo(166, 168); g.lineTo(90, 168); g.closePath(); fs(g, '#7a5cd8');
    g.lineWidth = 9; g.beginPath(); g.moveTo(128, 160); g.lineTo(150, 66); g.stroke();
    g.beginPath(); g.arc(144, 92, 13, 0, TAU); fs(g, '#ff4d8d');
    g.beginPath(); g.arc(128, 160, 8, 0, TAU); fs(g, '#fff4e6');
  },
  heart(g) {
    g.beginPath(); g.moveTo(128, 196); g.bezierCurveTo(40, 138, 56, 66, 100, 72); g.bezierCurveTo(116, 74, 124, 84, 128, 94); g.bezierCurveTo(132, 84, 140, 74, 156, 72); g.bezierCurveTo(200, 66, 216, 138, 128, 196); g.closePath(); fs(g, '#ff4d6a');
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.ellipse(92, 100, 12, 7, -0.7, 0, TAU); g.fill();
  },
  magnet(g) {
    g.lineCap = 'butt';
    g.strokeStyle = INK; g.lineWidth = 56; g.beginPath(); g.arc(128, 124, 44, PI, 0); g.lineTo(172, 176); g.moveTo(84, 124); g.lineTo(84, 176); g.stroke();
    g.strokeStyle = '#ff4d6a'; g.lineWidth = 40; g.beginPath(); g.arc(128, 124, 44, PI, 0); g.lineTo(172, 172); g.moveTo(84, 124); g.lineTo(84, 172); g.stroke();
    g.fillStyle = '#fff4e6'; g.strokeStyle = INK; g.lineWidth = 8; for (const x of [64, 152]) { g.beginPath(); g.rect(x, 168, 40, 28); g.fill(); g.stroke(); }
    g.lineCap = 'round'; g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 8; g.beginPath(); g.arc(128, 124, 54, PI * 1.1, PI * 1.5); g.stroke(); g.strokeStyle = INK;
  },
  burst(g) {
    starPath(g, 128, 128, 94, 52, 9, -PI / 2); g.lineWidth = 9; fs(g, '#fff4e6');
    starPath(g, 128, 128, 70, 36, 9, -PI / 2); fs(g, '#ffd84d');
    g.beginPath(); g.arc(128, 128, 22, 0, TAU); fs(g, '#ff4d8d');
  },
  coin(g) {
    g.beginPath(); g.arc(128, 128, 76, 0, TAU); fs(g, '#ffd84d');
    g.beginPath(); g.arc(128, 128, 54, 0, TAU); g.lineWidth = 6; fs(g, '#ffe98a');
    starPath(g, 128, 130, 36, 16, 5); g.lineWidth = 7; fs(g, '#f0a020');
  },
  portal(g) {
    g.beginPath(); g.arc(128, 128, 82, 0, TAU); fs(g, '#2a1a70');
    const cols = ['#46c8f0', '#ff7eb6', '#fff4e6'];
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      for (let i = 0; i <= 60; i++) { const a = i / 60 * TAU * 1.6 + k * TAU / 3, r = 8 + i / 60 * 66; const x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r; i ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.strokeStyle = INK; g.lineWidth = 20; g.stroke(); g.strokeStyle = cols[k]; g.lineWidth = 10; g.stroke();
    }
    g.strokeStyle = INK;
    starPath(g, 128, 128, 16, 7, 4); g.lineWidth = 5; fs(g, '#fff4e6');
  },
};
function iconTexture(kind, c1, c2) { return canvasTex(256, 256, (g) => { stickerBase(g, c1, c2); ICONS[kind](g); }); }

// ================================================================= BUILD
export function buildProps(scene) {
  const S = SCALE;
  const root = new THREE.Group(); root.name = 'props'; scene.add(root);
  const anim = {};            // handles for update()
  const glints = [];          // billboard glows / twinkles (one draw call)
  const obstacles = [];       // for lamp placement
  const addG = (x, y, z, size, kind, r, g, b, phase, speed) => glints.push(x, y, z, size, phase ?? Math.random() * 6.28, kind, speed ?? 3, 0, r, g, b);
  const R = rng(1337);

  cur = new Map(); ORG.identity();

  // ------------------------------------------------------------ STAGE (0,0.8)
  const SX = 0, SZ = 0.8;
  obstacles.push([SX, SZ, 3.0]);
  setOrigin(SX, 0, SZ, 0);
  cyl(0xd45a96, 0, 0, 0, 2.42, 0.14, 28);
  cyl(C.pink, 0, 0.14, 0, 2.3, 0.4, 28);
  cyl(C.cream, 0, 0.54, 0, 2.18, 0.06, 28);
  cyl(C.blossom, 0, 0.6, 0, 1.62, 0.012, 28);
  cyl(C.cream, 0, 0.612, 0, 1.5, 0.012, 28);
  { const sg = G('stage_star', () => { const g = new THREE.ShapeGeometry(starShape(5, 1.0, 0.45)); g.rotateX(-PI / 2); return g; }); shp(sg, C.hotPink, 0, 0.628, 0, 1.0); }
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; ball(i % 2 ? C.gold : C.mint, Math.cos(a) * 2.32, 0.34, Math.sin(a) * 2.32, 0.07, 0); }
  bbox(C.pink, 0, 0, 2.62, 1.6, 0.26, 0.55);
  bbox(C.cream, 0, 0.26, 2.62, 1.5, 0.03, 0.45);
  // speaker stacks standing on stage back corners
  const cones = [];
  for (const s of [-1, 1]) {
    const x = s * 1.5, z = -0.35 - SZ + 0.8; // local to stage origin: world z -0.35
    const lz = -0.35 - SZ;
    bbox(C.deepViolet, x, 0.6, lz, 0.74, 0.92, 0.56);
    bbox(C.deepViolet, x, 1.52, lz, 0.62, 0.62, 0.5);
    bbox(C.violet, x, 2.14, lz, 0.66, 0.06, 0.54);
    bbox(0x6a54c8, x, 0.6, lz + 0.285, 0.7, 0.06, 0.02);
    box(0x22134f, x, 1.05, lz + 0.285, 0.58, 0.76, 0.02);
    box(0x22134f, x, 1.83, lz + 0.255, 0.48, 0.5, 0.02);
    for (const sx of [-1, 1]) bbox(GOLD, x + sx * 0.35, 0.6, lz + 0.28, 0.04, 0.92, 0.04);
    const cg = local(() => {
      cylc(C.cream, 0, 0, 0, 0.27, 0.05, 12, PI / 2); tor(C.cream, 0, 0, 0.02, 0.27, 0.035, 5, 12);
      conec(0x3a2a86, 0, 0, 0.04, 0.2, 0.2, 10, PI / 2); ball(C.pink, 0, 0, 0.14, 0.07, 0);
    });
    cg.position.set(SX + x, 1.06, SZ + lz + 0.3); cg.userData.base = 0;
    const cg2 = local(() => { cylc(C.cream, 0, 0, 0, 0.19, 0.05, 10, PI / 2); conec(0x3a2a86, 0, 0, 0.04, 0.14, 0.15, 8, PI / 2); ball(C.gold, 0, 0, 0.12, 0.05, 0); });
    cg.add(cg2); cg2.position.set(0, 0.78, -0.03);
    cones.push(cg); root.add(cg);
  }
  // floor monitors (wedges)
  for (const s of [-1, 1]) { bbox(0x3a2a86, s * 0.95, 0.6, 2.05 - SZ + 0.0, 0.62, 0.3, 0.42, -0.5, 0, 0); box(C.pink, s * 0.95, 0.77, 2.2 - SZ + 0.0, 0.5, 0.02, 0.2, -0.5, 0, 0); }
  // truss rigs + lamp heads (poles merged, heads separate groups)
  const rigPos = [[-2.8, -0.05, -1], [2.8, -0.05, 1], [-2.55, 2.1, -1], [2.55, 2.1, 1]];
  const beamCols = [[1.0, 0.35, 0.7], [0.3, 0.95, 1.0], [1.0, 0.85, 0.25], [0.45, 1.0, 0.55]];
  const rigs = [];
  const beamG = (() => { const len = 4.2, rad = 1.05; const g = new THREE.ConeGeometry(rad, len, 18, 1, true); g.translate(0, -len / 2, 0); g.rotateX(-PI / 2); const p = g.attributes.position, a = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) { const t = p.getZ(i) / len; const v = Math.pow(1 - t, 1.4) * 0.9 + 0.02; a[i * 3] = a[i * 3 + 1] = a[i * 3 + 2] = v; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; })();
  rigPos.forEach((rp, i) => {
    const px = rp[0], pz = rp[1], H = 2.75;
    setOrigin(px, 0, pz, 0);
    cyl(0x3a2a86, 0, 0, 0, 0.26, 0.1, 10); cyl(0x6a54c8, 0, 0.1, 0, 0.055, H - 0.1, 6); cyl(C.gold, 0, 0.5, 0, 0.09, 0.08, 6); cyl(C.gold, 0, 1.3, 0, 0.08, 0.06, 6);
    const head = local(() => {
      cylc(C.gold, 0, 0, -0.02, 0.15, 0.3, 8, PI / 2); cylc(0x2d170f, 0, 0, -0.18, 0.11, 0.06, 8, PI / 2);
      cylc(0xfff4e6, 0, 0, 0.16, 0.15, 0.04, 8, PI / 2); box(0x3a2a86, 0, -0.14, -0.02, 0.08, 0.1, 0.08);
      cylc({ m: M['glow' + i] || (M['glow' + i] = (() => { const m = bas(beamCols[i][0] * 2.4, beamCols[i][1] * 2.4, beamCols[i][2] * 2.4); m.userData.noCast = true; return m; })()) }, 0, 0, 0.185, 0.11, 0.03, 8, PI / 2);
    });
    head.position.set(px, H, pz); root.add(head);
    const bm = new THREE.MeshBasicMaterial({ color: new THREE.Color(beamCols[i][0] * 0.2, beamCols[i][1] * 0.2, beamCols[i][2] * 0.2), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const beam = new THREE.Mesh(beamG, bm); beam.frustumCulled = false; beam.position.set(0, 0, 0.18); head.add(beam);
    rigs.push({ head, ph: i * 1.7, dir: rp[2] });
    addG(px, H, pz, 0.4, 0, beamCols[i][0] * 0.7, beamCols[i][1] * 0.7, beamCols[i][2] * 0.7, i, 2);
  });
  // stage sparkles
  for (let i = 0; i < 10; i++) { const a = R() * TAU, r = 0.5 + R() * 2.2; addG(Math.cos(a) * r, 0.9 + R() * 1.8, SZ + Math.sin(a) * r, 0.34 + R() * 0.2, 1, 1.5, 1.2, 1.4, R() * 6, 2 + R() * 2); }
  // glowing rim (separate: pulsing material)
  { const rg = new THREE.Mesh(G('stage_rim', () => { const g = new THREE.TorusGeometry(2.3, 0.075, 6, 56); g.rotateX(PI / 2); return g; }), M.rim); rg.position.set(SX, 0.55, SZ); root.add(rg); }

  // ------------------------------------------------------------ MARQUEE SIGN (0,-1.3)
  const MZ = -1.3, BW = 5.0, BH = 1.9, BY = 3.5;
  setOrigin(0, 0, MZ, 0);
  obstacles.push([0, MZ, 2.2]);
  for (const s of [-1, 1]) {
    bbox(C.gold, s * 2.15, 0, 0, 0.24, BY - 0.6, 0.24); bbox(0xe8a420, s * 2.15, 0, 0, 0.3, 0.1, 0.3); bbox(0xe8a420, s * 2.15, 0.1, 0, 0.27, 0.06, 0.27);
    ball(C.gold, s * 2.15, BY - 0.55, 0, 0.17, 1);
    bbox(0xe8a420, s * 2.15, 0.0, -0.4, 0.1, 2.2, 0.1, -0.5, 0, 0); // back brace
  }
  part(extr(rrShape(BW, BH, 0.35), 0.22, 0.04, 'board_main'), C.violet, 0, BY, 0, 1, 1, 1);
  { const tg = G('topstar', () => { const g = new THREE.ExtrudeGeometry(starShape(5, 0.4, 0.18), { depth: 0.1, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 }); g.translate(0, 0, -0.05); return g; });
    anim.topStar = new THREE.Mesh(tg, M.goldPlain); anim.topStar.castShadow = true; anim.topStar.position.set(0, BY + BH / 2 + 0.38, MZ); root.add(anim.topStar); }
  // bulb border
  const bulbs = [];
  { const hx = 2.42, hy = 0.87, step = 0.3, per = 2 * (2 * hx + 2 * hy); const n = Math.round(per / step); let idx = 0;
    for (let i = 0; i < n; i++) {
      let d = i / n * per, x, y; const wL = 2 * hx, hL = 2 * hy;
      if (d < wL) { x = -hx + d; y = hy; } else if ((d -= wL) < hL) { x = hx; y = hy - d; } else if ((d -= hL) < wL) { x = hx - d; y = -hy; } else { d -= wL; x = -hx; y = -hy + d; }
      const grp = idx++ % 3; bulbs.push([x, y, grp]);
    }
  }
  const bulbMats = [M.bulbA, M.bulbB, M.bulbC];
  for (const [x, y, g] of bulbs) { ball({ m: bulbMats[g] }, x, BY + y, 0.2, 0.075, 0); }
  // lettering plane + glowing tex
  const signTex = canvasTex(1536, 519, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#5a3fc0'); gr.addColorStop(1, '#2c1d78'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const r = rng(5);
    for (let i = 0; i < 46; i++) { g.fillStyle = `rgba(255,244,230,${0.15 + r() * 0.35})`; g.beginPath(); g.arc(r() * w, r() * h, 2 + r() * 4, 0, TAU); g.fill(); }
    g.save(); g.fillStyle = 'rgba(255,126,182,0.14)'; for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(w * (i + 0.5) / 5, h + 20, 140, PI, 0); g.fill(); } g.restore();
    const txt = 'ENCORE ISLAND'; const size = fitFont(g, txt, w - 330, 330);
    stickerText(g, txt, w / 2, h * 0.5, size, '#ff9bc9', '#ff4d8d', 30);
    g.lineWidth = 9; g.strokeStyle = INK; g.lineJoin = 'round';
    for (const [x, y, s] of [[110, 130, 44], [w - 110, 130, 44], [124, h - 110, 28], [w - 124, h - 110, 28]]) { starPath(g, x, y, s, s * 0.45, 5); g.fillStyle = '#ffd84d'; g.fill(); g.stroke(); }
    for (const x of [96, w - 96]) { g.fillStyle = '#fff4e6'; g.beginPath(); g.ellipse(x, h * 0.55, 26, 19, -0.4, 0, TAU); g.fill(); g.stroke(); g.beginPath(); g.moveTo(x + 22, h * 0.55 - 8); g.lineTo(x + 22, h * 0.55 - 88); g.lineTo(x + 56, h * 0.55 - 66); g.stroke(); }
  });
  const signMat = new THREE.MeshStandardMaterial({ map: signTex, emissiveMap: signTex, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.8 });
  { const pl = new THREE.Mesh(new THREE.PlaneGeometry(BW - 0.32, (BW - 0.32) * 519 / 1536), signMat); pl.position.set(0, BY, MZ + 0.165); root.add(pl); }
  // little glints on sign
  addG(-2.3, BY + 0.75, MZ + 0.3, 0.5, 1, 1.6, 1.4, 1.2, 0, 2.6); addG(2.3, BY - 0.7, MZ + 0.3, 0.5, 1, 1.6, 1.4, 1.2, 2, 2.2);

  // ------------------------------------------------------------ SELL STALL (-5.1,-2.3)
  const STX = -5.1, STZ = -2.3;
  obstacles.push([STX, STZ, 2.2]);
  setOrigin(STX, 0, STZ, 0);
  bbox(0xc9a070, 0, 0, -0.2, 3.1, 0.12, 2.6);
  bbox(0xa8703c, 0, 0.02, 1.12, 3.1, 0.06, 0.06);
  for (const [px, pz] of [[-1.45, -1.35], [1.45, -1.35], [-1.45, 1.0], [1.45, 1.0]]) { bbox(0x5a3a28, px, 0.12, pz, 0.14, 2.6, 0.14); ball(C.gold, px, 2.78, pz, 0.1, 0); }
  // back wall
  bbox(0xd9a468, 0, 0.12, -1.35, 3.0, 1.75, 0.1);
  for (let i = 0; i < 5; i++) box(0xb8824c, -1.2 + i * 0.6, 1.0, -1.29, 0.03, 1.75, 0.02);
  bbox(0xa8703c, 0, 1.15, -1.18, 2.8, 0.07, 0.34);
  // shelf goods
  for (let i = 0; i < 5; i++) { const cc = [C.mint, C.pink, C.sky, C.gold, C.blossom2][i]; cyl(cc, -1.0 + i * 0.5, 1.22, -1.15, 0.1, 0.22, 7); ball(0xfff4e6, -1.0 + i * 0.5, 1.48, -1.15, 0.05, 0); }
  // counter
  bbox(0xa8703c, 0, 0.12, 0.55, 2.8, 0.86, 0.7);
  bbox(0xd9a468, 0, 0.98, 0.55, 3.0, 0.08, 0.85);
  box(C.pink, 0, 0.55, 0.915, 2.4, 0.5, 0.03);
  cylc(GOLD, 0, 0.55, 0.94, 0.2, 0.04, 12, PI / 2); { const sg = G('coin_star_small', () => new THREE.ShapeGeometry(starShape(5, 0.14, 0.06))); shp(sg, 0xf0a020, 0, 0.55, 0.962, 1); }
  for (const s of [-1, 1]) { box(C.cream, s * 0.95, 0.55, 0.915, 0.28, 0.4, 0.03); box(C.gold, s * 0.95, 0.55, 0.93, 0.18, 0.04, 0.02); box(C.gold, s * 0.95, 0.55, 0.93, 0.04, 0.2, 0.02); }
  // counter top goods: coin stack, register, sign tag
  for (let i = 0; i < 4; i++) cyl(i % 2 ? GOLD2 : GOLD, -0.95, 1.06 + i * 0.045, 0.45, 0.14, 0.045, 10);
  for (let i = 0; i < 3; i++) cyl(i % 2 ? GOLD2 : GOLD, -0.68, 1.06 + i * 0.045, 0.6, 0.14, 0.045, 10);
  bbox(0x46c8c0, 0.95, 1.06, 0.5, 0.6, 0.24, 0.4); bbox(0x2d170f, 0.95, 1.3, 0.55, 0.5, 0.2, 0.3, 0.5, 0, 0); box(C.mint, 0.95, 1.43, 0.45, 0.4, 0.14, 0.02, 0.5, 0, 0);
  box(C.cream, 0.15, 1.12, 0.85, 0.34, 0.2, 0.03, -0.2, 0, 0);
  // awning: pink / cream stripes tilted toward front
  { const th = 0.13, n = 10, w = 3.4 / n;
    for (let i = 0; i < n; i++) {
      const cc = i % 2 ? 0xfff4e6 : C.pink, x = -1.7 + w * (i + 0.5);
      box(cc, x, 2.8, -0.2, w * 1.002, 0.09, 2.5, th, 0, 0);
      const fy = 2.8 - Math.sin(th) * 1.25 - 0.04, fz = -0.2 + Math.cos(th) * 1.25;
      part(GB.cone(3), cc, x, fy - 0.1, fz, w * 0.62, 0.3, 0.12, PI, 0, 0);
    }
    box(0x7a5cd8, 0, 3.0, -1.42, 3.4, 0.14, 0.18, th, 0, 0);
  }
  // SELL sign on top of the awning
  { const sellTex = canvasTex(512, 224, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#6a4ccc'); gr.addColorStop(1, '#3a2a86'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255,244,230,0.55)'; g.lineWidth = 8; rrPath(g, 14, 14, w - 28, h - 28, 22); g.stroke();
      g.fillStyle = '#ffd84d'; g.strokeStyle = INK; g.lineWidth = 9; g.beginPath(); g.arc(88, h / 2, 50, 0, TAU); g.fill(); g.stroke(); g.fillStyle = '#ffe98a'; g.beginPath(); g.arc(88, h / 2, 33, 0, TAU); g.fill(); g.lineWidth = 6; g.stroke();
      starPath(g, 88, h / 2 + 2, 21, 9, 5); g.fillStyle = '#f0a020'; g.fill(); g.stroke();
      stickerText(g, 'SELL', 322, h / 2 + 4, fitFont(g, 'SELL', 300, 170), '#ffffff', '#cfe8ff', 18);
    });
    for (const s of [-1, 1]) bbox(0x5a3a28, s * 0.62, 2.95, -1.45, 0.09, 0.8, 0.09);
    part(extr(rrShape(1.5, 0.66, 0.14), 0.08, 0.02, 'sell_board'), C.violet, 0, 3.6, -1.45, 1, 1, 1);
    const m = new THREE.MeshStandardMaterial({ map: sellTex, emissiveMap: sellTex, emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 0.8 });
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.38, 1.38 * 224 / 512), m); pl.position.set(STX, 3.6, STZ - 1.45 + 0.072); root.add(pl);
  }
  // shopkeeper
  const keeper = local(() => {
    cyl(C.teal, 0, 0, 0, 0.32, 0.72, 8, 0.74);
    box(0xfff4e6, 0, 0.36, 0.25, 0.36, 0.5, 0.05); box(C.pink, 0, 0.62, 0.285, 0.12, 0.08, 0.02);
    for (const s of [-1, 1]) { box(C.teal, s * 0.34, 0.5, 0.2, 0.14, 0.14, 0.5, 0.15, 0, 0); ball(0xffcf9e, s * 0.34, 0.54, 0.52, 0.09, 0); }
    ball(0xffcf9e, 0, 0.98, 0, 0.27, 1);
    ball(0x6a3f28, 0, 1.08, -0.07, 0.3, 1, 0.78); ball(0x6a3f28, 0, 1.34, -0.07, 0.1, 0);
    for (const s of [-1, 1]) { ball(C.ink, s * 0.1, 0.99, 0.24, 0.035, 0); tor(0xe8a420, s * 0.1, 1.0, 0.255, 0.085, 0.02, 5, 10); ball(0xff9cc6, s * 0.18, 0.9, 0.22, 0.045, 0, 0.6); }
    box(0xe8a420, 0, 1.01, 0.26, 0.06, 0.02, 0.02); box(0xc0553a, 0, 0.9, 0.262, 0.07, 0.016, 0.02);
    ball(C.teal, 0, 1.2, 0, 0.27, 1, 0.45); box(C.teal, 0, 1.16, 0.2, 0.34, 0.04, 0.2, -0.2, 0, 0);
  });
  keeper.position.set(STX, 0.12, STZ - 0.45); keeper.scale.setScalar(1.15); root.add(keeper); anim.keeper = keeper;

  // ------------------------------------------------------------ VAULT (-5.1,0.9)
  const VX = -5.1, VZ = 0.9;
  obstacles.push([VX, VZ, 2.1]);
  setOrigin(VX, 0, VZ, 0);
  // dashed ring
  for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; box(C.gold, Math.cos(a) * 1.75, 0.012, Math.sin(a) * 1.75, 0.22, 0.024, 0.07, 0, -a - PI / 2, 0); }
  bbox(0x7a4a2c, 0, 0.0, 0, 2.05, 0.1, 1.4);
  bbox(0x9a6a48, 0, 0.1, 0, 1.9, 0.62, 1.2);
  for (let i = 0; i < 4; i++) box(0x7e5238, 0, 0.18 + i * 0.15, 0.605, 1.8, 0.012, 0.01);
  for (const x of [-0.7, 0, 0.7]) bbox(GOLD, x, 0.1, 0.0, 0.16, 0.64, 1.24);
  for (const x of [-0.95, 0.95]) for (const z of [-0.6, 0.6]) { bbox(GOLD, x, 0.06, z, 0.16, 0.7, 0.16); ball(GOLD2, x, 0.78, z, 0.09, 0); }
  box(GOLD2, 0, 0.42, 0.63, 0.34, 0.3, 0.05); cylc(0x2d170f, 0, 0.44, 0.665, 0.045, 0.02, 8, PI / 2); box(0x2d170f, 0, 0.38, 0.665, 0.03, 0.09, 0.02);
  bbox(0x4a2c1c, 0, 0.72, 0, 1.76, 0.02, 1.06);
  for (const [x, z, w, d] of [[0, -0.55, 1.9, 0.12], [0, 0.55, 1.9, 0.12], [-0.9, 0, 0.12, 1.2], [0.9, 0, 0.12, 1.2]]) bbox(0xb98558, x, 0.72, z, w, 0.1, d);
  // open lid (hinged at back-top)
  { const a = -1.95, hy = 0.82, hz = -0.58, ca = Math.cos(a), sa = Math.sin(a);
    const L = (c, lx, ly, lz, w, h, d) => part(GB.box(), c, VX * 0 + lx, hy + ly * ca - lz * sa, hz + ly * sa + lz * ca, w, h, d, a, 0, 0);
    L(0x9a6a48, 0, 0.06, 0.62, 1.9, 0.12, 1.24);
    L(0x7a2f78, 0, -0.005, 0.62, 1.7, 0.02, 1.06);
    for (const x of [-0.7, 0, 0.7]) { L(GOLD, x, 0.06, 0.62, 0.16, 0.14, 1.28); L(GOLD, x, -0.03, 0.62, 0.12, 0.04, 1.2); }
    for (const x of [-0.95, 0.95]) L(GOLD, x, 0.06, 0.62, 0.1, 0.16, 1.28);
    L(GOLD, 0, 0.04, 1.2, 1.9, 0.14, 0.1);
  }
  // heap of coins
  { const r = rng(21); const cg = GB.cyl(10);
    for (let i = 0; i < 90; i++) {
      const u = Math.sqrt(r()), a = r() * TAU, nx = Math.cos(a) * u, nz = Math.sin(a) * u;
      const x = nx * 0.78, z = nz * 0.46, h = 0.2 * Math.pow(Math.max(0, 1 - u * u), 0.8) + 0.4 * Math.pow(Math.max(0, 1 - u * u * 1.15), 2);
      cyl2(x, 0.74 + h + r() * 0.04, z, 0.15 + r() * 0.03, (r() - 0.5) * 1.0, r() * TAU, (r() - 0.5) * 1.0, i % 3 === 0 ? GOLD2 : i % 3 === 1 ? GOLD : GOLD3, cg);
    }
    for (let i = 0; i < 9; i++) { const a = r() * TAU, d = 0.9 + r() * 0.75; cyl2(Math.cos(a) * d * 0.6, 0.1 + 0.035 * (i % 2), 0.9 + Math.abs(Math.sin(a)) * 0.5, 0.16, (i % 3) * 0.04, r() * TAU, 0, i % 2 ? GOLD2 : GOLD, cg); }
    // gold bars beside
    for (let i = 0; i < 3; i++) bbox(i % 2 ? GOLD2 : GOLD, 1.35, i * 0.14, 0.55, 0.5, 0.14, 0.26, 0, 0.25 * (i - 1), 0);
    bbox(GOLD, 1.35, 0.14 * 3, 0.55, 0.5, 0.14, 0.26, 0, 0.1, 0);
  }
  function cyl2(x, y, z, r, rx, ry, rz, c, g) { part(g, c, x, y, z, r, 0.05, r, rx, ry, rz); }
  addG(VX, 1.35, VZ + 0.3, 2.3, 0, 1.3, 0.9, 0.22, 0, 1.4);
  for (let i = 0; i < 7; i++) addG(VX + (R() - 0.5) * 1.5, 1.0 + R() * 0.8, VZ + (R() - 0.5) * 0.9 + 0.2, 0.3 + R() * 0.18, 1, 1.3, 1.1, 0.5, R() * 6, 2.4 + R() * 2.4);

  // ------------------------------------------------------------ CROWN MONUMENT (0,-6.3)
  const MNX = 0, MNZ = -6.3;
  obstacles.push([MNX, MNZ, 2.4]);
  setOrigin(MNX, 0, MNZ, PI / 8);
  cyl(0x9aa2b8, 0, 0, 0, 1.75, 0.22, 8); cyl(C.stone, 0, 0.22, 0, 1.48, 0.28, 8); cyl(0xd8dcea, 0, 0.5, 0, 1.12, 0.12, 8);
  cyl(0xcfd4e6, 0, 0.62, 0, 0.82, 0.95, 8, 0.86);
  tor(GOLD, 0, 0.66, 0, 0.88, 0.07, 5, 8, PI / 2); tor(GOLD, 0, 1.5, 0, 0.74, 0.06, 5, 8, PI / 2);
  cyl(C.stone, 0, 1.57, 0, 1.02, 0.16, 8); cyl(GOLD, 0, 1.73, 0, 0.94, 0.05, 8); cyl(0x8a2f72, 0, 1.78, 0, 0.8, 0.1, 12, 0.8);
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + PI / 4; box(C.gold, Math.cos(a) * 0.86, 1.05, Math.sin(a) * 0.86, 0.08, 0.7, 0.04, 0, -a + PI / 2, 0); }
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; ball(C.blossom, Math.cos(a) * 1.42, 0.36, Math.sin(a) * 1.42, 0.12, 0); }
  // crown (floating, spinning)
  const crown = local(() => {
    const gT = GB.tube(10);
    part(gT, { m: M.goldD, c: C.gold }, 0, 0.17, 0, 0.5, 0.34, 0.5, 0, 0, 0);
    tor(GOLD2, 0, 0.0, 0, 0.5, 0.06, 5, 10, PI / 2); tor(GOLD2, 0, 0.34, 0, 0.5, 0.055, 5, 10, PI / 2);
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU;
      part(GB.cone(5), GOLD, Math.cos(a) * 0.5, 0.52, Math.sin(a) * 0.5, 0.2, 0.4, 0.2, 0, 0, 0);
      ball({ m: M.gem, c: [0xff3b6b, 0x46d8ff, 0x7dffa8, 0xffe14d, 0xd070ff][i] }, Math.cos(a) * 0.5, 0.78, Math.sin(a) * 0.5, 0.095, 0);
      ball({ m: M.gem, c: [0x46d8ff, 0xff3b6b, 0xffe14d, 0xd070ff, 0x7dffa8][i] }, Math.cos(a + PI / 5) * 0.51, 0.17, Math.sin(a + PI / 5) * 0.51, 0.07, 0, 1, 0.7);
      part(GB.oct(), { m: M.goldD, c: C.gold }, Math.cos(a + PI / 5) * 0.5, 0.45, Math.sin(a + PI / 5) * 0.5, 0.07, 0.14, 0.07, 0, 0, 0);
    }
    ball({ m: M.solid, c: 0xc8264f }, 0, 0.3, 0, 0.42, 1, 0.55);
  });
  crown.position.set(MNX, 2.55, MNZ); crown.scale.setScalar(1.15); root.add(crown); anim.crown = crown;
  const orbit = local(() => { for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; ball({ m: M.gem, c: i % 2 ? 0xffe14d : 0xff9bd0 }, Math.cos(a) * 1.0, Math.sin(a * 2) * 0.2, Math.sin(a) * 1.0, 0.06, 0); } });
  orbit.position.set(MNX, 2.85, MNZ); root.add(orbit); anim.orbit = orbit;
  addG(MNX, 2.85, MNZ - 0.1, 3.2, 0, 1.6, 1.2, 0.35, 0, 1.2); addG(MNX, 3.05, MNZ + 0.2, 0.8, 1, 2, 1.8, 1.0, 1, 2.2); addG(MNX + 0.7, 2.6, MNZ + 0.3, 0.5, 1, 2, 1.7, 0.9, 3, 3); addG(MNX - 0.65, 2.9, MNZ + 0.2, 0.45, 1, 2, 1.7, 0.9, 5, 2.6);
  // plaque lectern
  { const pz = MNZ + 2.25, tilt = -0.5; setOrigin(MNX, 0, pz, 0);
    bbox(0x7a4a2c, -0.7, 0, 0.05, 0.12, 0.62, 0.12); bbox(0x7a4a2c, 0.7, 0, 0.05, 0.12, 0.62, 0.12);
    part(GB.box(), 0xd9a468, 0, 0.82, 0, 2.0, 0.68, 0.1, tilt, 0, 0);
    part(GB.box(), GOLD, 0, 0.82, 0.0, 2.1, 0.74, 0.08, tilt, 0, 0);
    const tex = canvasTex(768, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#4a35a8'); gr.addColorStop(1, '#2a1b6e'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255,216,77,0.6)'; g.lineWidth = 8; rrPath(g, 14, 14, w - 28, h - 28, 20); g.stroke();
      g.strokeStyle = INK; g.lineWidth = 7; g.lineJoin = 'round';
      for (const x of [58, w - 58]) { starPath(g, x, h / 2, 30, 13, 5); g.fillStyle = '#ffd84d'; g.fill(); g.stroke(); }
      stickerText(g, 'ENCORE TOUR', w / 2, h / 2 + 4, fitFont(g, 'ENCORE TOUR', w - 220, 130), '#ffe98a', '#ffb62e', 20);
    });
    const m = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 0.8 });
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.88, 0.62), m);
    const ny = -Math.sin(tilt), nz = Math.cos(tilt);
    pl.position.set(MNX, 0.82 + ny * 0.055, pz + nz * 0.055); pl.rotation.x = tilt; root.add(pl);
  }

  // ------------------------------------------------------------ FORGE (4.9,-3.3)
  const FX = 4.9, FZ = -3.3;
  obstacles.push([FX, FZ, 2.3]);
  setOrigin(FX, 0, FZ, 0);
  bbox(0x4a3a8a, 0, 0, 0, 2.5, 0.16, 2.0);
  // brick furnace body: textured separate mesh
  const bt = brickTex(); bt.wrapS = bt.wrapT = THREE.RepeatWrapping; bt.repeat.set(2, 2);
  const brickMat = new THREE.MeshStandardMaterial({ map: bt, roughness: 0.85, flatShading: true });
  { const bm = new THREE.Mesh(GB.box(), brickMat); bm.scale.set(1.9, 1.62, 1.45); bm.position.set(FX, 0.16 + 0.81, FZ); bm.castShadow = bm.receiveShadow = true; root.add(bm); }
  bbox(C.stone, 0, 1.78, 0.0, 2.2, 0.16, 1.7); bbox(0xd8dcea, 0, 1.94, 0.0, 2.0, 0.06, 1.5);
  for (const s of [-1, 1]) { bbox(0x8a6ac0, s * 1.0, 0.16, 0.72, 0.16, 1.62, 0.16); }
  bbox(GOLD, 0, 0.9, 0.735, 1.9, 0.07, 0.05);
  // mouth: stone surround, ink recess, glowing fire
  bbox(0xd8dcea, 0, 0.16, 0.74, 1.12, 0.92, 0.06); cylc(0xd8dcea, 0, 1.08, 0.74, 0.56, 0.06, 14, PI / 2);
  bbox(0x2d170f, 0, 0.16, 0.77, 0.9, 0.9, 0.04); cylc(0x2d170f, 0, 1.06, 0.77, 0.45, 0.04, 14, PI / 2);
  bbox({ m: M.mouth }, 0, 0.16, 0.795, 0.78, 0.9, 0.02); cylc({ m: M.mouth }, 0, 1.06, 0.795, 0.39, 0.02, 14, PI / 2);
  for (let i = 0; i < 4; i++) { part(GB.cone(4), { m: M.flame }, -0.27 + i * 0.18, 0.45 + (i % 2) * 0.1, 0.815, 0.1, 0.5 + (i % 2) * 0.2, 0.02, 0, 0, 0); }
  bbox(0x2d170f, 0, 0.16, 0.805, 0.8, 0.07, 0.02);
  // pink chimney with cream cap (as in the 2D forge)
  bbox(0xff9ac8, 0.55, 2.0, -0.35, 0.5, 1.35, 0.5); bbox(0xffc9de, 0.55, 3.35, -0.35, 0.7, 0.14, 0.7);
  for (let i = 0; i < 3; i++) bbox(0xf06aa6, 0.55, 2.35 + i * 0.4, -0.35, 0.56, 0.07, 0.56);
  // pipes + dial
  cyl(C.gold, -1.15, 0.2, -0.3, 0.1, 1.5, 8); cylc(C.gold, -0.95, 1.65, -0.3, 0.1, 0.5, 8, 0, 0, PI / 2);
  cylc(GOLD2, -0.98, 1.2, 0.35, 0.2, 0.06, 12, PI / 2, 0, PI / 2); ball(0x2d170f, -1.03, 1.2, 0.35, 0.1, 0, 1, 0.3);
  // anvil
  bbox(0x555a74, 1.55, 0.0, 0.75, 0.55, 0.28, 0.34); bbox(0x555a74, 1.55, 0.28, 0.75, 0.3, 0.16, 0.24); bbox(0x6a708c, 1.55, 0.44, 0.75, 0.8, 0.16, 0.3); conec(0x6a708c, 2.05, 0.52, 0.75, 0.15, 0.3, 4, 0, 0, -PI / 2);
  // coal basket + ingots
  cyl(0x7a4a2c, -1.4, 0, 1.05, 0.4, 0.45, 9, 1.25); for (let i = 0; i < 6; i++) ball(0x2d2640, -1.4 + (R() - 0.5) * 0.4, 0.52, 1.05 + (R() - 0.5) * 0.4, 0.13, 0);
  ball({ m: M.lamp }, -1.35, 0.6, 1.1, 0.08, 0); ball({ m: M.lamp }, -1.5, 0.55, 0.98, 0.06, 0);
  for (let i = 0; i < 3; i++) bbox(i % 2 ? GOLD2 : GOLD, 0.6 + i * 0.0, i * 0.12, 1.15, 0.5, 0.12, 0.24, 0, 0.1 * i, 0);
  addG(FX, 0.8, FZ + 1.35, 3.0, 0, 1.0, 0.36, 0.1, 0, 5.5);
  addG(FX, 0.6, FZ + 0.95, 1.2, 0, 1.0, 0.5, 0.15, 2, 7.5);
  for (let i = 0; i < 5; i++) addG(FX + (R() - 0.5) * 0.8, 0.5 + R() * 1.3, FZ + 0.9, 0.2 + R() * 0.14, 1, 2.2, 1.0, 0.3, R() * 6, 3 + R() * 3);
  // smoke puffs (instanced)
  const puffs = new THREE.InstancedMesh(G('puff', () => new THREE.IcosahedronGeometry(1, 1)), M.smoke, 7); puffs.frustumCulled = false; puffs.castShadow = false; root.add(puffs);
  anim.puffs = puffs;

  // ------------------------------------------------------------ LAMP POSTS
  // (built after plates so that obstacles are known)

  // ------------------------------------------------------------ PLATES
  const PLATE_DEFS = [
    { id: 'speed', px: -228, pz: 300, icon: 'shoe', col: 0x4fb4d4, c1: '#9ae8ff', c2: '#2f90c0' },
    { id: 'cap', px: -113, pz: 350, icon: 'backpack', col: 0xff9a2e, c1: '#ffd08a', c2: '#e86a10' },
    { id: 'dmg', px: 0, pz: 372, icon: 'drum', col: 0xff7eb6, c1: '#ffc4de', c2: '#e83f8a' },
    { id: 'rate', px: 113, pz: 350, icon: 'metronome', col: 0x7a5cd8, c1: '#c4b0ff', c2: '#5a3fb8' },
    { id: 'hp', px: 226, pz: 300, icon: 'heart', col: 0xff4d6a, c1: '#ffb0bc', c2: '#e02a52' },
    { id: 'magnet', px: -125, pz: -290, icon: 'magnet', col: 0x46c8c0, c1: '#a6f4ec', c2: '#1fa09a' },
    { id: 'crit', px: 125, pz: -290, icon: 'burst', col: 0xffc83a, c1: '#fff0a0', c2: '#f0a000' },
    { id: 'coin', px: -250, pz: 168, icon: 'coin', col: 0x6fd36a, c1: '#c8f8b0', c2: '#3ea83c' },
  ];
  const NEWLAND = { id: 'newland', x: 7.0, z: 1.4, icon: 'portal', col: 0x9a6aff, c1: '#d6c0ff', c2: '#5a30d0', big: true };
  const plateList = PLATE_DEFS.map(d => ({ id: d.id, x: d.px * S, z: d.pz * S, icon: d.icon, col: d.col, c1: d.c1, c2: d.c2, big: false })).concat([NEWLAND]);
  const ringTexA = ringTex(18, 14);
  const glintTex = glintAtlas();
  const plates = [];
  const plateTopTex = canvasTex(256, 256, (g) => { g.fillStyle = '#dcdcdc'; g.fillRect(0, 0, 256, 256); const gr = g.createRadialGradient(100, 90, 4, 128, 128, 128); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.7, '#f2f2f2'); gr.addColorStop(1, '#d8d8d8'); g.fillStyle = gr; g.beginPath(); g.arc(128, 128, 126, 0, TAU); g.fill(); g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 5; g.beginPath(); g.arc(128, 128, 100, 0, TAU); g.stroke(); g.strokeStyle = 'rgba(150,150,150,0.7)'; g.lineWidth = 4; g.setLineDash([14, 12]); g.beginPath(); g.arc(128, 128, 82, 0, TAU); g.stroke(); });
  const plateGeoTop = new THREE.CylinderGeometry(0.74, 0.78, 0.16, 22);
  const plateGlowGeo = new THREE.PlaneGeometry(1, 1); plateGlowGeo.rotateX(-PI / 2);
  for (const d of plateList) {
    const sc = d.big ? 1.55 : 1;
    obstacles.push([d.x, d.z, d.big ? 1.8 : 1.35]);
    setOrigin(d.x, 0, d.z, 0);
    cyl(0x3a2a86, 0, 0, 0, 0.98 * sc, 0.05, 22);
    cyl(C.cream, 0, 0.05, 0, 0.92 * sc, 0.17, 22, 0.97);
    tor(0xe9d9c4, 0, 0.215, 0, 0.9 * sc, 0.045, 5, 22, PI / 2);
    cyl(0xcbb6e6, 0, 0.1, 0, 0.7 * sc, 0.13, 22);  // inner well (dark-ish lilac)
    const topMat = new THREE.MeshStandardMaterial({ map: plateTopTex, color: d.col, emissive: d.col, emissiveIntensity: 0.12, roughness: 0.22, metalness: 0.05, flatShading: true });
    const top = new THREE.Mesh(plateGeoTop, topMat); top.scale.set(sc, 1, sc); top.position.set(d.x, 0.2, d.z); top.castShadow = true; top.receiveShadow = true; root.add(top);
    const gMat = new THREE.MeshBasicMaterial({ map: ringTexA, color: new THREE.Color(d.col).multiplyScalar(1.7), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const gm = new THREE.Mesh(plateGlowGeo, gMat); gm.scale.setScalar(3.1 * sc); gm.position.set(d.x, 0.03, d.z); gm.renderOrder = 2; root.add(gm);
    const tex = iconTexture(d.icon, d.c1, d.c2);
    const sMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
    const spr = new THREE.Sprite(sMat); const ss = 1.12 * (d.big ? 1.35 : 1); spr.scale.set(ss, ss, 1); spr.position.set(d.x, 1.3 * (d.big ? 1.15 : 1), d.z); root.add(spr);
    if (d.big) { addG(d.x, 0.7, d.z, 5.0, 0, 0.5, 0.35, 1.3, 0, 1.6); for (let i = 0; i < 6; i++) addG(d.x + Math.cos(i) * 0.9, 0.5 + i * 0.28, d.z + Math.sin(i) * 0.9, 0.34, 1, 1.0, 0.9, 2.0, i, 2.4); }
    const pl = { id: d.id, x: d.x, z: d.z, r: d.big ? 1.7 : 1.15, setGlow(v) { this._gt = clamp(+v || 0, 0, 1); }, _gt: 0, _g: 0, _top: top, _topMat: topMat, _glow: gm, _gMat: gMat, _spr: spr, _sc: sc, _ss: ss, _base: new THREE.Color(d.col), _ph: Math.random() * 6.28, _sy: spr.position.y };
    plates.push(pl);
  }

  // ------------------------------------------------------------ MEADOW (-12.7,13.1)
  const MEX = -12.7, MEZ = 13.1;
  const towers = [];
  for (const s of [-1, 1]) {
    const tx = MEX + s * 2.5, tz = MEZ - 1.5, yaw = Math.atan2(MEX - tx, MEZ - tz);
    setOrigin(tx, 0, tz, yaw);
    cyl(0x3a2a86, 0, 0, 0, 1.0, 0.1, 16); cyl(C.cream, 0, 0.1, 0, 0.92, 0.14, 16); cyl(C.violet, 0, 0.24, 0, 0.72, 0.05, 16); tor(GOLD, 0, 0.3, 0, 0.74, 0.04, 5, 16, PI / 2);
    bbox(0x5a46b8, 0, 0.3, 0, 0.98, 1.9, 0.8); bbox(C.violet, 0, 2.2, 0, 1.06, 0.1, 0.88); bbox(GOLD, 0, 0.3, 0, 1.06, 0.07, 0.88);
    for (const x of [-0.5, 0.5]) bbox(GOLD, x, 0.3, 0.38, 0.06, 1.9, 0.06);
    box(0x22134f, 0, 0.98, 0.405, 0.82, 0.62, 0.02); box(0x22134f, 0, 1.68, 0.405, 0.82, 0.42, 0.02);
    ball({ m: M.gem, c: 0xff6ab4 }, 0, 2.42, 0, 0.17, 1); cyl(C.gold, 0, 2.3, 0, 0.12, 0.08, 8);
    box(C.pink, -0.3, 1.5, 0.4, 0.06, 0.06, 0.02); box(C.pink, 0.3, 1.5, 0.4, 0.06, 0.06, 0.02);
    const cg = local(() => {
      cylc(C.cream, 0, 0, 0, 0.33, 0.05, 14, PI / 2); tor(C.cream, 0, 0, 0.02, 0.33, 0.04, 5, 14);
      conec(0x3a2a86, 0, 0, 0.05, 0.25, 0.24, 12, PI / 2); ball(C.pink, 0, 0, 0.18, 0.09, 0);
    });
    cg.position.set(0, 0.98, 0.41); cg.userData.pz = 0.41;
    const cg2 = local(() => { cylc(C.cream, 0, 0, 0, 0.2, 0.05, 12, PI / 2); conec(0x3a2a86, 0, 0, 0.04, 0.14, 0.14, 10, PI / 2); ball(C.gold, 0, 0, 0.11, 0.05, 0); });
    cg2.position.set(0, 0.7, 0); cg.add(cg2);
    const holder = new THREE.Group(); holder.position.set(tx, 0, tz); holder.rotation.y = yaw; holder.add(cg); root.add(holder);
    towers.push({ cone: cg, x: tx, z: tz });
    addG(tx, 2.45, tz, 0.9, 0, 1.6, 0.4, 1.0, 0, 3);
  }
  const spawnMat = new THREE.MeshBasicMaterial({ map: ringTex(14, 16), color: new THREE.Color(2.2, 0.6, 2.6), transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const spawnMat2 = spawnMat.clone(); spawnMat2.map = ringTex(9, 9); spawnMat2.color = new THREE.Color(0.5, 2.0, 2.4); spawnMat2.opacity = 0.9;
  const spawn1 = new THREE.Mesh(plateGlowGeo, spawnMat); spawn1.scale.setScalar(4.4); spawn1.position.set(MEX, 0.04, MEZ); spawn1.renderOrder = 2;
  const spawn2 = new THREE.Mesh(plateGlowGeo, spawnMat2); spawn2.scale.setScalar(3.0); spawn2.position.set(MEX, 0.05, MEZ); spawn2.renderOrder = 2;
  root.add(spawn1, spawn2); anim.spawn1 = spawn1; anim.spawn2 = spawn2;
  for (let i = 0; i < 4; i++) addG(MEX + Math.cos(i * 1.6) * 1.2, 0.4 + i * 0.1, MEZ + Math.sin(i * 1.6) * 1.2, 0.4, 1, 1.5, 0.8, 2.0, i * 1.7, 2.8);

  // ------------------------------------------------------------ LAMP POSTS
  const lampPos = [];
  const NL = 16;
  for (let i = 0; i < NL; i++) {
    const a = (i + 0.5) / NL * TAU;
    for (const rad of [7.4, 8.2]) {
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      if (obstacles.every(o => Math.hypot(x - o[0], z - o[1]) > o[2] + 0.35)) { lampPos.push([x, z]); break; }
    }
  }
  for (const [x, z] of lampPos) {
    setOrigin(x, 0, z, 0);
    cyl(0x3a2a86, 0, 0, 0, 0.22, 0.12, 8); cyl(0x5a46b8, 0, 0.12, 0, 0.1, 0.12, 8, 0.7);
    cyl(0x5a46b8, 0, 0.2, 0, 0.055, 1.55, 6);
    tor(GOLD, 0, 0.9, 0, 0.09, 0.025, 4, 8, PI / 2);
    cyl(GOLD, 0, 1.72, 0, 0.17, 0.06, 6);
    cyl({ m: M.lamp }, 0, 1.78, 0, 0.14, 0.4, 6, 0.9);
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; box(GOLD, Math.cos(a) * 0.13, 1.98, Math.sin(a) * 0.13, 0.03, 0.4, 0.03); }
    cone(GOLD, 0, 2.18, 0, 0.25, 0.2, 6); ball(C.pink, 0, 2.42, 0, 0.05, 0);
    addG(x, 2.0, z, 1.5, 2, 1.4, 0.9, 0.35, x * 3, 1);
  }

  // ------------------------------------------------------------ COINS
  const coinGeo = geoOf(() => {
    cylc(GCOIN(0xffd84d), 0, 0, 0, 0.3, 0.07, 12, PI / 2);
    tor(GCOIN(0xffb62e), 0, 0, 0, 0.3, 0.045, 4, 12);
    const sg = G('coin_star', () => new THREE.ShapeGeometry(starShape(5, 0.15, 0.065)));
    shp(sg, GCOIN(0xf29a1c), 0, 0.005, 0.042, 1); shp(sg, GCOIN(0xf29a1c), 0, 0.005, -0.042, 1, 0, PI, 0);
    cylc(GCOIN(0xffe98a), 0, 0, 0.037, 0.22, 0.012, 12, PI / 2);
    cylc(GCOIN(0xffe98a), 0, 0, -0.037, 0.22, 0.012, 12, PI / 2);
  });
  function GCOIN(c) { return { m: M.coin, c }; }
  const COIN_POS = [[-2.8, 3.6], [2.8, 3.6], [3.6, 0.6], [-3.0, -4.2], [2.2, -4.7], [-1.4, -3.9], [4.2, 3.4], [1.5, 5.0], [-1.3, 5.2],
    [-9.6, 14.9], [-15.2, 15.5], [-14.9, 10.7], [-10.2, 10.9], [-12.7, 16.8]];
  const coinMesh = new THREE.InstancedMesh(coinGeo, M.coin, COIN_POS.length); coinMesh.frustumCulled = false; coinMesh.castShadow = true; root.add(coinMesh);
  const coinGroup = new THREE.Group(); root.add(coinGroup);
  const coins = COIN_POS.map(([x, z]) => { const mesh = new THREE.Object3D(); mesh.position.set(x, 0.62, z); coinGroup.add(mesh); return { mesh, x, z, taken: false }; });
  // burst pool
  const POOL = 160;
  const burstGeo = geoOf(() => { cylc(GCOIN(0xffd84d), 0, 0, 0, 0.3, 0.07, 7, PI / 2); cylc(GCOIN(0xffe98a), 0, 0, 0.04, 0.2, 0.012, 7, PI / 2); });
  const burst = new THREE.InstancedMesh(burstGeo, M.coin, POOL); burst.frustumCulled = false; burst.castShadow = false; root.add(burst);
  const bp = new Float32Array(POOL * 9), blife = new Float32Array(POOL), bage = new Float32Array(POOL);
  blife.fill(0); let bnext = 0, bactive = 0;
  const dummy = new THREE.Object3D();
  const zeroM = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < POOL; i++) burst.setMatrixAt(i, zeroM);
  function addCoinBurst(x, z, n) {
    n = (n === undefined || !(n > 0)) ? 1 : n;
    const cnt = Math.min(48, Math.round(16 * (1 + 0.25 * (n - 1))));
    for (let k = 0; k < cnt; k++) {
      const i = bnext; bnext = (bnext + 1) % POOL; const o = i * 9;
      const a = Math.random() * TAU, sp = 0.8 + Math.random() * 2.6;
      bp[o] = x + Math.cos(a) * 0.1; bp[o + 1] = 0.7; bp[o + 2] = z + Math.sin(a) * 0.1;
      bp[o + 3] = Math.cos(a) * sp; bp[o + 4] = 3.2 + Math.random() * 3.6; bp[o + 5] = Math.sin(a) * sp;
      bp[o + 6] = Math.random() * TAU; bp[o + 7] = (Math.random() - 0.5) * 16; bp[o + 8] = 0.3 + Math.random() * 0.22;
      blife[i] = 0.75 + Math.random() * 0.5; bage[i] = 0;
    }
    bactive = Math.max(bactive, 1);
  }

  // ------------------------------------------------------------ finalise merged world mesh(es)
  const world = flush(cur); world.name = 'props_static'; root.add(world);
  cur = new Map(); ORG.identity();
  // ------------------------------------------------------------ glint billboards
  const N = glints.length / 11;
  const ig = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  ig.index = quad.index; ig.setAttribute('position', quad.attributes.position); ig.setAttribute('uv', quad.attributes.uv);
  const iPos = new Float32Array(N * 3), iData = new Float32Array(N * 4), iCol = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const o = i * 11;
    iPos.set([glints[o], glints[o + 1], glints[o + 2]], i * 3);
    iData.set([glints[o + 3], glints[o + 4], glints[o + 5], glints[o + 6]], i * 4);
    iCol.set([glints[o + 8], glints[o + 9], glints[o + 10]], i * 3);
  }
  ig.setAttribute('iPos', new THREE.InstancedBufferAttribute(iPos, 3)); ig.setAttribute('iData', new THREE.InstancedBufferAttribute(iData, 4)); ig.setAttribute('iCol', new THREE.InstancedBufferAttribute(iCol, 3));
  ig.instanceCount = N;
  const glintMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uBeat: { value: 0 }, uMap: { value: glintTex } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `attribute vec3 iPos; attribute vec4 iData; attribute vec3 iCol; uniform float uTime; uniform float uBeat;
      varying vec2 vUv; varying vec3 vCol; varying float vKind; varying float vA;
      void main(){ float k=iData.z; float s=iData.x; float a=1.0;
        if(k>1.5){ a=0.7+0.4*uBeat+0.07*sin(uTime*7.0+iData.y); s*=1.0+0.14*uBeat; }
        else if(k>0.5){ float tw=max(0.0,sin(uTime*iData.w+iData.y)); tw=tw*tw*tw; a=tw; s*=0.25+0.95*tw; }
        else { a=0.82+0.18*sin(uTime*iData.w+iData.y); s*=1.0+0.05*sin(uTime*iData.w*0.7+iData.y); }
        vec4 mv=modelViewMatrix*vec4(iPos,1.0); mv.xy+=position.xy*s; gl_Position=projectionMatrix*mv;
        vUv=uv; vCol=iCol; vKind=k; vA=a; }`,
    fragmentShader: `uniform sampler2D uMap; varying vec2 vUv; varying vec3 vCol; varying float vKind; varying float vA;
      void main(){ float off=step(0.5,vKind)*step(vKind,1.5)*0.5; vec4 t=texture2D(uMap,vec2(vUv.x*0.5+off,vUv.y));
        gl_FragColor=vec4(vCol*vA, t.a*vA*(vKind>1.5?0.55:(vKind>0.5?1.0:0.5))); }`,
  });
  const glintMesh = new THREE.Mesh(ig, glintMat); glintMesh.frustumCulled = false; glintMesh.renderOrder = 3; root.add(glintMesh);

  // ================================================================= UPDATE
  const _v = new THREE.Vector3();
  const colTmp = new THREE.Color();
  function update(dt, t, focus) {
    dt = Math.min(dt || 0.016, 0.1);
    const beatPh = (t * 2) % 1, beat = Math.exp(-beatPh * 5);
    glintMat.uniforms.uTime.value = t; glintMat.uniforms.uBeat.value = beat;
    // stage rim pulse (~2Hz)
    const pr = 0.5 + 0.5 * Math.sin(t * TAU * 2);
    M.rim.color.setRGB(1.5 + pr * 1.9, 0.35 + pr * 0.5, 0.8 + pr * 0.8);
    // beams sweep
    for (let i = 0; i < rigs.length; i++) {
      const r = rigs[i], p = t * 0.55 + r.ph;
      r.head.lookAt(Math.sin(p) * 1.5 * (r.dir > 0 ? 1 : 1) + (i < 2 ? 0 : 0), 0.55, SZ + Math.cos(p * 0.8 + r.ph) * 1.2);
    }
    for (const cg of cones) { cg.scale.z = 1 + 0.9 * beat; }
    for (const tw of towers) { tw.cone.scale.z = 1 + 0.8 * beat; }
    // marquee bulbs chase-blink
    for (let g = 0; g < 3; g++) {
      const k = Math.pow(Math.max(0, Math.sin(t * 6.5 - g * TAU / 3)), 2);
      bulbMats[g].color.setRGB(0.28 + 2.3 * k, 0.2 + 1.6 * k, 0.08 + 0.55 * k);
    }
    anim.topStar.rotation.y = t * 1.4; anim.topStar.position.y = BY + BH / 2 + 0.42 + Math.sin(t * 2.2) * 0.05; const sp = 1 + 0.08 * beat; anim.topStar.scale.set(sp, sp, sp);
    // shopkeeper
    { const k = anim.keeper; k.position.y = 0.12 + Math.abs(Math.sin(t * 2.4)) * 0.035;
      let ty = 0; if (focus) { ty = clamp(Math.atan2(focus.x - STX, focus.z - (STZ - 0.55)), -0.6, 0.6); }
      k.rotation.y += (ty - k.rotation.y) * Math.min(1, dt * 4); k.rotation.z = Math.sin(t * 1.6) * 0.03; }
    // crown
    { const c = anim.crown; c.rotation.y = t * 1.3; c.rotation.z = Math.sin(t * 1.1) * 0.08; c.position.y = 2.55 + Math.sin(t * 1.8) * 0.12; anim.orbit.rotation.y = -t * 1.1; anim.orbit.position.y = c.position.y + 0.15; }
    // forge fire + smoke
    { const f = 0.8 + 0.35 * Math.sin(t * 11) * Math.sin(t * 7.3 + 1) + 0.15 * Math.sin(t * 23); M.mouth.color.setRGB(1.25 * f + 0.2, 0.5 * f + 0.05, 0.1 * f); M.lamp.color.setRGB(1.55 + 0.4 * beat, 1.05 + 0.3 * beat, 0.4 + 0.08 * beat);
      const pf = anim.puffs;
      for (let i = 0; i < 7; i++) {
        const p = (t * 0.22 + i / 7) % 1, fade = Math.sin(Math.min(1, p * 1.0) * PI), s = (0.14 + p * 0.5) * Math.pow(fade, 0.5);
        dummy.position.set(FX + 0.55 + Math.sin(p * 5 + i * 2.1) * 0.16 + p * 0.9, 3.55 + p * 3.0, FZ - 0.35 + Math.cos(p * 4 + i) * 0.1 - p * 0.3);
        dummy.rotation.set(i, p * 2 + i, 0); dummy.scale.setScalar(Math.max(0.0001, s)); dummy.updateMatrix(); pf.setMatrixAt(i, dummy.matrix);
      }
      pf.instanceMatrix.needsUpdate = true; }
    // plates
    for (let i = 0; i < plates.length; i++) {
      const p = plates[i], k = 1 - Math.exp(-dt * 9); p._g += (p._gt - p._g) * k; const g = p._g;
      const pop = 1 + 0.1 * g * (1 + 0.5 * Math.sin(t * 8 + p._ph));
      p._top.position.y = 0.2 + Math.sin(t * 2 + p._ph) * 0.025 + g * 0.05; p._top.scale.set(p._sc * pop, 1, p._sc * pop);
      p._topMat.emissiveIntensity = 0.1 + g * (0.5 + 0.18 * Math.sin(t * 9));
      const rp = 1 + (0.045 + 0.07 * g) * Math.sin(t * (3 + 4 * g) + p._ph);
      p._glow.scale.setScalar(3.1 * p._sc * rp * (1 + 0.1 * g)); p._glow.rotation.y = t * 0.3 * (1 + g * 2);
      p._gMat.opacity = 0.3 + 0.12 * Math.sin(t * 2.5 + p._ph) * (0.4 + g) + 0.3 * g;
      const ss = p._ss * (1 + 0.2 * g); p._spr.scale.set(ss, ss, 1);
      p._spr.position.y = p._sy + Math.sin(t * 2.3 + p._ph) * 0.07 + g * 0.12; p._spr.material.rotation = Math.sin(t * 1.5 + p._ph) * 0.06;
    }
    // meadow
    anim.spawn1.rotation.y = t * 0.35; anim.spawn2.rotation.y = -t * 0.6;
    const sp2 = 1 + 0.04 * Math.sin(t * 3); anim.spawn1.scale.setScalar(4.4 * sp2); anim.spawn2.scale.setScalar(3.0 / sp2);
    // coins
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      if (c.taken) { dummy.scale.setScalar(0.0001); dummy.position.set(c.x, -5, c.z); }
      else { dummy.position.set(c.x, 0.62 + Math.sin(t * 2.4 + i * 1.3) * 0.08, c.z); dummy.rotation.set(0, t * 2.6 + i * 0.9, 0); dummy.scale.setScalar(1); c.mesh.position.y = dummy.position.y; }
      c.mesh.visible = !c.taken;
      dummy.updateMatrix(); coinMesh.setMatrixAt(i, dummy.matrix);
    }
    coinMesh.instanceMatrix.needsUpdate = true;
    // coin burst
    if (bactive) {
      let live = 0;
      for (let i = 0; i < POOL; i++) {
        if (blife[i] <= 0) continue;
        const o = i * 9; bage[i] += dt;
        if (bage[i] >= blife[i]) { blife[i] = 0; burst.setMatrixAt(i, zeroM); continue; }
        live++;
        bp[o + 4] -= 11 * dt; bp[o] += bp[o + 3] * dt; bp[o + 1] += bp[o + 4] * dt; bp[o + 2] += bp[o + 5] * dt;
        if (bp[o + 1] < 0.05) { bp[o + 1] = 0.05; bp[o + 4] *= -0.35; bp[o + 3] *= 0.7; bp[o + 5] *= 0.7; }
        bp[o + 6] += bp[o + 7] * dt;
        const a = 1 - bage[i] / blife[i], sc = bp[o + 8] * Math.min(1, a * 3.5);
        dummy.position.set(bp[o], bp[o + 1], bp[o + 2]); dummy.rotation.set(bp[o + 6] * 0.7, bp[o + 6], 0); dummy.scale.setScalar(Math.max(0.0001, sc)); dummy.updateMatrix(); burst.setMatrixAt(i, dummy.matrix);
      }
      burst.instanceMatrix.needsUpdate = true; if (!live) bactive = 0;
    }
  }

  return { update, plates, coins, addCoinBurst, stage: { x: SX, z: SZ }, vault: { x: VX, z: VZ }, sell: { x: STX, z: STZ }, monument: { x: MNX, z: MNZ }, forge: { x: FX, z: FZ }, meadow: { x: MEX, z: MEZ }, towers: towers.map(t => ({ x: t.x, z: t.z })), group: root };
}
