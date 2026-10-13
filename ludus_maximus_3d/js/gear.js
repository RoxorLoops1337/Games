// Ludus Maximus 3D gear: weapons, shields, helms, armour, trims, rarity accents, laurel pips.
// Everything is authored as geometry in the local frame of a joint / socket / holder and merged per material into the rig's
// skinned body (rig.add), so a fully dressed gladiator costs 9 to 13 draw calls. Only cloth (flaps, plume, cloak, net) is separate.
// Weapon convention: authored along +Y with the grip at the origin; the hand sockets map +Y onto the forearm axis.
import * as THREE from 'three';
import { lathe, capsule, boxG, sphereG, cylG, coneG, torusG, quadG, xf, paint, ribbon, tabRing, extrude, sm01, addCloak, addPlume, ClothGrid, mergeCloths, shadePatch, clamp, lerp, HEAD_SX, HEAD_SZ, skullR, FACES } from './rig.js';

const V3 = THREE.Vector3;
const sq = (v) => v * v;
const PI = Math.PI;
const ps = (...a) => new V3(...a);
// everything queued while fn runs carries `tag`, so rig.detachPart(tag) can take it off the merged body later
const tg = (rig, tag, fn) => { const old = rig.tag; rig.tag = tag; try { return fn(); } finally { rig.tag = old || ''; } };
const hdk = (rig) => ((rig.detail | 0) > 0 ? 1 : 0); // medium / high bodies have bulging muscles: armour radii get a margin

// ---------------------------------------------------------------- shared helpers
const CHEST = [[-0.045, 0.166], [-0.035, 0.166], [0.035, 0.206], [0.11, 0.236], [0.19, 0.256], [0.265, 0.244], [0.325, 0.17], [0.358, 0.095]];
function chestR(y, B = 1, sh = 1) { // chest x-radius at local y (matches rig.js torso lathe)
  const k = (i) => (i >= 4 && i <= 5 ? B * (0.94 + 0.06 * sh) : B);
  for (let i = 0; i < CHEST.length - 1; i++) if (y <= CHEST[i + 1][0]) { const t = clamp((y - CHEST[i][0]) / (CHEST[i + 1][0] - CHEST[i][0]), 0, 1); return lerp(CHEST[i][1] * (i === 0 ? B : k(i)), CHEST[i + 1][1] * k(i + 1), t); }
  return 0.09;
}
// point on the chest front at (x, y) lifted by off, plus its outward normal
function chestPt(x, y, B, sh, off = 0.03) {
  const r = chestR(y, B, sh), rz = r * 0.72, u = clamp(x / r, -0.97, 0.97), z = rz * Math.sqrt(1 - u * u);
  return { p: ps(x, y, z + off), n: ps(x / (r * r), 0, z / (rz * rz)).normalize() };
}
function mulb(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const tint = (hex, k) => { const c = new THREE.Color(hex); return [c.r * k, c.g * k, c.b * k]; };

// per-slot rarity helper: r 0..4; col = D.RAR colour
function rarOf(o, slot) { const r = (o.rar && o.rar[slot]) | 0; return { r, col: (o.rarCol && o.rarCol[r]) || '#f6b82d' }; }
// gem: faceted stone (gem material, emissive) for epic and above; a coloured inlay (non emissive) for rare
function gem(rig, obj, p, size, rr, rot) {
  if (rr.r < 2) return;
  const g = xf(new THREE.OctahedronGeometry(size, 0), p, rot || [0, 0, 0], [1, 1.25, 0.8]);
  if (rr.r >= 3) rig.add('gem', paint(g, tint(rr.col, 1.4)), obj); else rig.add('trim', paint(g, tint(rr.col, 1.0)), obj);
}

// ---------------------------------------------------------------- canvas textures (cached by kind + colour)
const texCache = new Map();
function css(hex, other, t) { return new THREE.Color(hex).lerp(new THREE.Color(other), t).getStyle(); }
function lum(hex) { const c = new THREE.Color(hex); return 0.3 * c.r + 0.6 * c.g + 0.1 * c.b; }
export function shieldTexture(kind, hex) {
  const key = kind + hex; if (texCache.has(key)) return texCache.get(key);
  if (typeof document === 'undefined') return null;
  const W = kind === 'scutum' ? 256 : 192, H = kind === 'scutum' ? 400 : 192, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'), R = mulb(hex.length * 977 + hex.charCodeAt(1) * 31 + kind.length);
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, css(hex, '#ffffff', 0.12)); g.addColorStop(1, css(hex, '#000000', 0.18)); x.fillStyle = g; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 70; i++) { x.strokeStyle = R() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.06)'; x.lineWidth = 1 + R() * 2; const xx = R() * W; x.beginPath(); x.moveTo(xx, 0); x.lineTo(xx + (R() - 0.5) * 10, H); x.stroke(); }
  const em = lum(hex) > 0.5 ? '#2a1a10' : '#f0cd68', em2 = lum(hex) > 0.5 ? '#4a3020' : '#fff1c8';
  x.strokeStyle = css(hex, '#000000', 0.45); x.lineWidth = W * 0.07; x.strokeRect(W * 0.035, W * 0.035, W - W * 0.07, H - W * 0.07);
  x.strokeStyle = em; x.lineWidth = Math.max(2, W * 0.016); x.strokeRect(W * 0.1, W * 0.1, W - W * 0.2, H - W * 0.2);
  x.save(); x.translate(W / 2, H / 2);
  if (kind === 'scutum') {
    for (const sg of [-1, 1]) for (let i = 0; i < 6; i++) { // wing feathers
      x.save(); x.scale(sg, 1); x.rotate(-0.12 - i * 0.2); x.fillStyle = i % 2 ? em : css(em, '#ffffff', 0.12); x.strokeStyle = css(hex, '#000000', 0.5); x.lineWidth = 2;
      x.beginPath(); x.ellipse(52 + (5 - i) * 4, 0, 52 - i * 4, 13 - i * 0.6, 0, 0, PI * 2); x.fill(); x.stroke(); x.restore();
    }
    x.fillStyle = em2; x.strokeStyle = css(hex, '#000000', 0.55); x.lineWidth = 3; x.beginPath(); // thunderbolt
    x.moveTo(-6, -118); x.lineTo(14, -118); x.lineTo(6, -44); x.lineTo(26, -44); x.lineTo(-10, 96); x.lineTo(-4, 8); x.lineTo(-22, 8); x.closePath(); x.fill(); x.stroke();
    x.fillStyle = css(hex, '#000000', 0.25); x.beginPath(); x.arc(0, 0, 30, 0, PI * 2); x.fill(); x.strokeStyle = em; x.lineWidth = 3; x.stroke();
  } else {
    x.strokeStyle = em; x.lineWidth = 6; for (const r of [70, 48]) { x.beginPath(); x.arc(0, 0, r, 0, PI * 2); x.stroke(); }
    x.fillStyle = em; for (let i = 0; i < 12; i++) { x.save(); x.rotate(i * PI / 6); x.beginPath(); x.moveTo(52, -6); x.lineTo(80, 0); x.lineTo(52, 6); x.closePath(); x.fill(); x.restore(); }
    x.fillStyle = em2; x.beginPath(); x.arc(0, 0, 14, 0, PI * 2); x.fill();
  }
  x.restore();
  const vg = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.38)'); x.fillStyle = vg; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 14; i++) { x.strokeStyle = 'rgba(255,240,210,0.22)'; x.lineWidth = 1; const x0 = R() * W, y0 = R() * H; x.beginPath(); x.moveTo(x0, y0); x.lineTo(x0 + (R() - 0.5) * 30, y0 + (R() - 0.5) * 30); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; texCache.set(key, t); return t;
}
let netTex = null;
function netTexture() {
  if (netTex || typeof document === 'undefined') return netTex;
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.clearRect(0, 0, 128, 128); x.strokeStyle = '#ffffff'; x.lineWidth = 7; x.lineCap = 'round';
  x.beginPath(); for (let i = -2; i <= 2; i++) { x.moveTo(i * 64, 0); x.lineTo(i * 64 + 128, 128); x.moveTo(i * 64 + 128, 0); x.lineTo(i * 64, 128); } x.stroke();
  netTex = new THREE.CanvasTexture(c); netTex.colorSpace = THREE.SRGBColorSpace; netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping; netTex.repeat.set(2.5, 3); netTex.anisotropy = 4; return netTex;
}

// ---------------------------------------------------------------- weapons
function blade(len, w, thick, curve = 0) {
  // leaf blade, diamond section (4-sided lathe): ridge faces darker, edges bright, so the fuller reads without extra triangles
  const f = len / 0.58, prof = [[0, 0], [1.0 * w, 0.1 * f], [1.04 * w, 0.26 * f], [0.62 * w, 0.46 * f], [0, len]];
  const g = lathe(prof, 4, 1, thick, 0, 1);
  const P = g.attributes.position; if (curve) for (let i = 0; i < P.count; i++) { const y = P.getY(i); P.setZ(i, P.getZ(i) + curve * y * y); }
  return paint(g, (x, y, z) => 0.72 + 0.5 * sm01(0, w * 0.5, Math.abs(x)) - 0.12 * sm01(0.8 * len, len, y));
}
const band = (r, y0, y1, seg = 6) => cylG(r, r, y1 - y0, seg, true).translate(0, (y0 + y1) / 2, 0); // open ring (12 tris at 6 seg), double-sided materials
function swordParts(rig, grp, o, rr, sica) {
  const A = (m, g) => rig.add(m, g, grp);
  const len = sica ? 0.5 : 0.6, w = sica ? 0.042 : 0.036;
  A('steel', xf(blade(len, w, sica ? 0.2 : 0.13, sica ? 0.55 : 0), [0, 0.075, 0]));
  if (rr.r >= 3) A('gem', paint(xf(boxG(0.006, len * 0.5, 0.006), [0, 0.3, sica ? 0.012 : 0.0062]), tint(rr.col, 1.3)));
  else if (rr.r === 2) A('trim', paint(xf(boxG(0.005, len * 0.4, 0.005), [0, 0.27, 0.0062]), tint(rr.col, 1)));
  A('trim', xf(boxG(sica ? 0.07 : 0.1, 0.016, 0.03), [0, 0.068, 0])); // guard
  A('leather', lathe([[0.016, -0.068], [0.019, -0.02], [0.019, 0.025], [0.015, 0.062]], 5, 1, 1, 0, 1));
  A('trim', xf(sphereG(0.026, 5, 3), [0, -0.08, 0]));
  gem(rig, grp, [0, -0.1, 0.018], 0.012, rr);
}
function makeSword(rig, o, rr, sica = false, side = 'R') {
  const grp = new THREE.Object3D(); grp.name = sica ? 'sica' : 'gladius'; rig.joints['hand' + side].add(grp); tg(rig, side === 'L' ? 'weaponL' : 'weapon', () => swordParts(rig, grp, o, rr, sica));
  const tip = new THREE.Object3D(); tip.position.y = 0.66; grp.add(tip); grp.userData.tip = tip; return grp;
}
function spearParts(rig, grp, trident, rr, o) {
  const A = (m, g) => rig.add(m, g, grp), L = trident ? 1.85 : 2.0, y0 = L - 0.45;
  A('leather', paint(xf(cylG(0.016, 0.019, L, 5), [0, L / 2 - 0.45, 0]), (x, y) => 0.9 + 0.2 * Math.sin(y * 9)));
  A('trim', xf(band(0.021, -0.006, 0.006))); A('trim', xf(band(0.021, 0.354, 0.366)));
  A('steel', xf(coneG(0.022, 0.1, 5), [0, -0.5, 0], [PI, 0, 0])); A('trim', xf(band(0.022, -0.456, -0.444), [0, 0, 0]));
  A('metal', xf(lathe([[0.03, 0], [0.02, 0.09]], 5, 1, 1, 0, 1), [0, y0 - 0.06, 0]));
  A('trim', xf(band(0.027, y0 - 0.026, y0 - 0.014)));
  if (trident) {
    A('metal', xf(boxG(0.15, 0.022, 0.026), [0, y0 + 0.012, 0]));
    A('steel', xf(blade(0.26, 0.017, 0.7), [0, y0 + 0.02, 0])); // centre prong
    for (const sg of [-1, 1]) {
      A('steel', xf(blade(0.22, 0.014, 0.7), [sg * 0.068, y0 + 0.02, 0], [0, 0, sg * -0.05]));
      A('steel', xf(coneG(0.012, 0.07, 4), [sg * 0.075, y0 + 0.12, 0], [0, 0, sg * -2.4])); // barb
    }
    if (rr.r >= 3) A('gem', paint(xf(boxG(0.008, 0.1, 0.008), [0, y0 + 0.12, 0.002]), tint(rr.col, 1.3)));
  } else {
    A('steel', xf(blade(0.33, 0.05, 0.22), [0, y0 - 0.03, 0]));
    A('plume', xf(band(0.023, y0 - 0.1, y0 - 0.085)));
    A('plume', xf(quadG(0.03, 0.12), [0, y0 - 0.16, 0.018], [0, 0, 0.05]));
    if (rr.r >= 3) A('gem', paint(xf(boxG(0.006, 0.17, 0.006), [0, y0 + 0.1, 0.0068]), tint(rr.col, 1.3)));
  }
  gem(rig, grp, [0, 0.0, 0.026], 0.012, rr);
}
function makeSpear(rig, o, rr, trident = false) {
  const grp = new THREE.Object3D(); grp.name = trident ? 'trident' : 'spear'; rig.joints.handR.add(grp); tg(rig, 'weapon', () => spearParts(rig, grp, trident, rr, o));
  const gb = new THREE.Object3D(); gb.name = 'gripB'; gb.position.y = o.gripB ?? 0.42; grp.add(gb); grp.userData.gripB = gb;
  const tip = new THREE.Object3D(); tip.position.y = trident ? 1.55 : 1.9; grp.add(tip); grp.userData.tip = tip; return grp;
}
// Retiarius net: one verlet cloth with a diamond-mesh alpha texture, draped from the left forearm. net.setAnchor(obj) re-parents the
// pin point (e.g. to a free Object3D when the net is thrown later).
function makeNet(rig, o) {
  const mat = rig.addMaterial('net', new THREE.MeshStandardMaterial({ color: '#cdbb8a', map: netTexture(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.95, vertexColors: true }), 'cloth');
  const rows = 7, cols = 6, len = 0.62, rl = len / (rows - 1);
  const net = new ClothGrid({
    anchor: rig.joints.wristL, rows, cols, rowLen: rl, stiff: 0.05, stiffFall: 0.95, damping: 0.94, gravity: -8, side: new V3(1, 0, 0),
    shape: (r) => new V3(0.0, 0.0 - r * rl * 0.98 * 0.2 + 0.05, 0.05 + r * 0.0), widthFn: (r) => 0.16 + 0.34 * (r / (rows - 1)), material: mat, name: 'net', tipShade: 0.8, fold: false,
  });
  net.setAnchor = (obj) => { net.anchor = obj; };
  rig.addSecondary(net); return net;
}

// ---------------------------------------------------------------- shields
// Curved shell (cylindrical section) with a rounded-rectangle outline. P(u,v) in [0,1]^2 -> point; centre at z = sag.
function shell(R, halfW, h, nu, nv, corner = 6, steps = 4) {
  const hang = Math.asin(clamp(halfW / R, 0, 0.99));
  const P = (u, v) => { const t = v * 2 - 1, k = 1 - 0.2 * Math.pow(Math.abs(t), corner), a = (u * 2 - 1) * hang * k; return ps(R * Math.sin(a), t * h / 2, R * Math.cos(a) - R * Math.cos(hang)); };
  const N = (u, v) => { const p = P(u, v); return ps(p.x / R, 0, (p.z + R * Math.cos(hang)) / R).normalize(); };
  const pos = [], nor = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const p = P(i / nu, j / nv), n = N(i / nu, j / nv); pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); uv.push(i / nu, j / nv); }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.length).fill(1), 3));
  // perimeter loop: bottom -> right -> top -> left, with inward directions
  const per = [], add = (u, v) => { const p = P(u, v), n = N(u, v), c = P(0.5, 0.5), inn = ps(c.x - p.x, c.y - p.y, 0).normalize(); per.push({ p, n, inn }); };
  for (let i = 0; i < steps; i++) add(i / steps, 0); for (let j = 0; j < steps; j++) add(1, j / steps); for (let i = 0; i < steps; i++) add(1 - i / steps, 1); for (let j = 0; j < steps; j++) add(0, 1 - j / steps);
  per.push(per[0]); return { g, P, N, per, hang, sag: R * (1 - Math.cos(hang)) };
}
function rimOf(sh, lip, wall) {
  const lipPts = sh.per.map((q) => q.p.clone().addScaledVector(q.inn, lip / 2).addScaledVector(q.n, 0.007)), wallPts = sh.per.map((q) => q.p.clone().addScaledVector(q.n, -wall / 2 + 0.004));
  return [ribbon(lipPts, lip, (p, i) => sh.per[i].n), ribbon(wallPts, wall, (p, i) => sh.per[i].inn.clone().multiplyScalar(-1))];
}
// Shield held on the forearm: a holder bone (child of the wrist) whose orientation is stabilised each frame: the face looks along the
// forearm axis projected on the ground plane (so it never flops flat when the arm hangs) and its height axis stays along body up.
export function mountShield(rig, kind, o = {}, rr = { r: 0, col: '#fff' }) { return tg(rig, 'shield', () => mountShieldInner(rig, kind, o, rr)); }
function mountShieldInner(rig, kind, o, rr) {
  const wrist = rig.joints.wristL, holder = new THREE.Object3D(); holder.name = 'shield-' + kind; holder.position.set(0, -0.07, 0); wrist.add(holder); rig.addBone(holder);
  const cloth = '#' + new THREE.Color(rig.palette.cloth).getHexString(), sc = kind === 'scutum';
  const R = sc ? 0.46 : 0.5, hw = sc ? 0.31 : 0.205, hh = sc ? 0.98 : 0.4, sh = shell(R, hw, hh, sc ? 5 : 4, sc ? 5 : 3, sc ? 8 : 4, sc ? 4 : 3), zc = sc ? 0.2 : 0.14, dy = sc ? 0.04 : 0, cx = sc ? -0.1 : -0.04;
  const mat = rig.addMaterial('shield', new THREE.MeshStandardMaterial({ color: '#ffffff', map: shieldTexture(kind, cloth), roughness: 0.72, metalness: 0.05, vertexColors: true, side: THREE.DoubleSide }), 'cloth', { back: true });
  if (!mat.map) mat.color.set(cloth);
  const place = (g) => xf(g, [cx, dy, zc - sh.sag]);
  rig.add('shield', place(sh.g.clone()), holder);
  const [lip, wall] = rimOf(sh, sc ? 0.05 : 0.036, sc ? 0.04 : 0.032);
  rig.add('metal', paint(place(lip), 1.1), holder); rig.add('metal', paint(place(wall), 0.7), holder);
  const bz = zc + 0.012;
  { const br = sc ? 0.088 : 0.066; rig.add('metal', xf(lathe([[br, 0], [br * 0.92, br * 0.22], [br * 0.5, br * 0.46], [0, br * 0.52]], 8, 1, 1, 0, 1).rotateX(PI / 2), [cx, dy, bz - 0.01]), holder); }
  if (rr.r >= 1) gem(rig, holder, [cx, dy, bz + (sc ? 0.05 : 0.04)], sc ? 0.026 : 0.02, { r: Math.max(2, rr.r), col: rr.col });
  if (rr.r >= 3) for (const sy of [-1, 1]) gem(rig, holder, [cx, dy + sy * hh * 0.42, zc - sh.sag * 0.15 + 0.012], 0.014, rr);
  rig.add('leather', xf(boxG(0.16, 0.026, 0.02), [cx * 0.4, 0, 0.04]), holder); // grip bar (the back faces show bare leather via the shader)
  rig.add('leather', xf(quadG(0.07, 0.05), [0, 0.12, 0.05]), holder); rig.add('leather', xf(quadG(0.07, 0.05), [0, -0.12, 0.05]), holder);
  const f = new V3(), n = new V3(), up = new V3(), x = new V3(), M = new THREE.Matrix4(), qb = new THREE.Quaternion(), qw = new THREE.Quaternion(), qi = new THREE.Quaternion(), qn = new THREE.Quaternion(), bf = new V3(0, 0, 1), w2 = new V3();
  rig.postUpdate.push(() => {
    wrist.getWorldQuaternion(qw); rig.body.getWorldQuaternion(qb); qi.copy(qb).invert();
    f.set(0, -1, 0).applyQuaternion(qw).applyQuaternion(qi); // forearm axis in body space
    const hl = Math.hypot(f.x, f.z); n.set(f.x, 0, f.z); w2.copy(bf).multiplyScalar(Math.max(0, 0.6 - hl)); n.add(w2).normalize();
    up.set(0, 1, 0); x.crossVectors(up, n).normalize(); up.crossVectors(n, x);
    M.makeBasis(x, up, n); qn.setFromRotationMatrix(M); qb.multiply(qn);
    holder.quaternion.copy(qw.invert()).multiply(qb);
  });
  rig.gear.shieldHolder = holder; return holder;
}

// ---------------------------------------------------------------- helms
function faceBars(rig, head, R, y0, y1, xs) {
  for (const x of xs) { const a = Math.asin(clamp(x / (R * 0.95), -0.95, 0.95)), z = R * 1.06 * Math.cos(a); rig.add('metal', xf(cylG(0.0045, 0.0045, y1 - y0, 3), [x, (y0 + y1) / 2, z]), head); }
}
// helmet skull: a cap above the brow line (full circle) plus a bowl behind and beside the head, open at the front so the face shows through the visor
function helmShell(rig, head, R, top, yb, yc = 0.15, sx = 0.95, sz = 1.06) {
  const h = top - yc;
  rig.add('metal', lathe([[R * 1.01, yc], [R * 0.96, yc + h * 0.34], [R * 0.74, yc + h * 0.7], [R * 0.42, yc + h * 0.92], [0, top]], 12, sx, sz, 0.1, 0.85), head);
  rig.add('metal', lathe([[R * 0.99, yb], [R * 1.01, yc]], 8, sx, sz, 0.1, 0.85, PI * 0.36, PI * 1.28), head);
}
const mask = (y0, y1, sw, r0, r1, seg = 8) => lathe([[r0, y0], [r1, y1]], seg, 0.96, 1.06, 0, 1, -sw / 2, sw);
function helmMurmillo(rig, o, rr) { tg(rig, 'helm', () => helmMurmilloB(rig, o, rr)); }
function helmMurmilloB(rig, o, rr) {
  const H = rig.joints.head, A = (m, g) => rig.add(m, g, H);
  helmShell(rig, H, 0.122, 0.275, -0.005);
  A('metal', lathe([[0.18, -0.075], [0.122, -0.005]], 6, 0.95, 1.05, 0, 1, PI * 0.45, PI * 1.1)); // flared neck guard
  A('metal', paint(mask(-0.025, 0.098, PI * 1.32, 0.118, 0.131), (x, y) => 0.82 + 0.25 * sm01(-0.02, 0.1, y)));
  A('metal', mask(0.148, 0.205, PI * 1.32, 0.132, 0.13));
  A('trim', mask(0.142, 0.15, PI * 1.32, 0.134, 0.134, 8));
  faceBars(rig, H, 0.132, 0.098, 0.15, [0, -0.074, 0.074, -0.106, 0.106]);
  A('metal', paint(xf(quadG(0.07, 0.007), [0, 0.03, 0.138]), 0.12)); A('metal', paint(xf(quadG(0.07, 0.007), [0, 0.05, 0.138]), 0.12));
  // fish crest: extruded fin
  A('metal', xf(extrude([[0.12, 0.2], [0.125, 0.3], [0.04, 0.385], [-0.06, 0.4], [-0.15, 0.34], [-0.215, 0.215], [-0.17, 0.2], [-0.2, 0.15], [-0.05, 0.195], [0.08, 0.212]], 0.026), [0, 0.03, 0], [0, -PI / 2, 0]));
  A('trim', xf(sphereG(0.02, 5, 3), [0, 0.268, 0.1], [0, 0, 0], [0.8, 0.8, 1.2]));
  if (rr.r >= 3) { gem(rig, H, [0, 0.17, 0.139], 0.016, rr); for (const sg of [-1, 1]) gem(rig, H, [sg * 0.095, 0.2, 0.09], 0.01, rr); }
  if (rr.r >= 4) for (const sg of [-1, 1]) A('trim', xf(extrude([[0, 0], [0.09, 0.02], [0.17, 0.09], [0.1, 0.08], [0.06, 0.1]], 0.008), [sg * 0.125, 0.12, -0.02], [0, sg * PI / 2, sg * 0.4]));
}
function helmThraex(rig, o, rr) { tg(rig, 'helm', () => helmThraexB(rig, o, rr)); }
function helmThraexB(rig, o, rr) {
  const H = rig.joints.head, A = (m, g) => rig.add(m, g, H);
  helmShell(rig, H, 0.121, 0.272, 0.0);
  A('metal', lathe([[0.215, 0.026], [0.135, 0.056]], 8, 1.0, 1.12, 0, 1));
  A('metal', mask(-0.02, 0.09, PI * 1.25, 0.118, 0.13)); A('metal', mask(0.138, 0.172, PI * 1.25, 0.131, 0.13));
  faceBars(rig, H, 0.131, 0.09, 0.138, [-0.07, 0, 0.07]);
  A('metal', paint(xf(quadG(0.03, 0.06), [0, 0.03, 0.133]), 0.12));
  // griffin crest: a high curved comb with a beak head at the front
  A('metal', xf(extrude([[-0.15, 0.2], [-0.19, 0.3], [-0.12, 0.4], [0.0, 0.45], [0.15, 0.41], [0.24, 0.33], [0.15, 0.345], [0.145, 0.27], [0.135, 0.2], [0.0, 0.25]], 0.026), [0, 0.02, 0], [0, -PI / 2, 0]));
  A('trim', xf(extrude([[0.15, 0.41], [0.24, 0.33], [0.19, 0.345], [0.2, 0.375]], 0.034), [0, 0.02, 0], [0, -PI / 2, 0]));
  for (const sg of [-1, 1]) for (let i = 0; i < 3; i++) { // side feather fans: curved tapered blades
    const L = [0.3, 0.36, 0.3][i], ang = 0.05 + i * 0.3, pts = [];
    for (let k = 0; k < 4; k++) { const t = k / 3; pts.push(ps(sg * (0.115 + Math.sin(ang) * L * t + 0.05 * t * t), 0.2 + Math.cos(ang) * L * t, -0.02 - i * 0.018 - 0.07 * t * t)); }
    A('plume', paint(ribbon(pts, (t) => 0.05 * (1 - 0.85 * t) + 0.006, () => ps(0, 0, 1)), (x, y) => 0.8 + 0.3 * sm01(0.2, 0.55, y)));
  }
  if (rr.r >= 3) gem(rig, H, [0, 0.165, 0.131], 0.014, rr);
  if (rr.r >= 4) A('trim', xf(torusG(0.126, 0.006, 3, 10), [0, 0.185, 0.0], [PI / 2, 0, 0], [0.95, 1.1, 1]));
}
function helmHoplo(rig, o, rr) { tg(rig, 'helm', () => helmHoploB(rig, o, rr)); }
function helmHoploB(rig, o, rr) {
  const H = rig.joints.head, A = (m, g) => rig.add(m, g, H);
  helmShell(rig, H, 0.121, 0.268, 0.005, 0.17);
  A('metal', lathe([[0.16, -0.065], [0.122, 0.0]], 6, 0.95, 1.05, 0, 1, PI * 0.5, PI)); // nape guard
  A('metal', lathe([[0.134, 0.15], [0.128, 0.19]], 8, 0.95, 1.06, 0, 1, -PI * 0.5, PI)); // brow band
  A('metal', xf(boxG(0.026, 0.12, 0.014), [0, 0.095, 0.138], [-0.05, 0, 0])); // nose guard
  for (const sg of [-1, 1]) A('metal', lathe([[0.118, -0.045], [0.128, 0.11]], 5, 0.95, 1.06, 0, 1, sg > 0 ? PI * 0.28 : -PI * 0.28 - PI * 0.34, PI * 0.34)); // cheek guards
  A('metal', xf(extrude([[-0.13, 0.22], [-0.1, 0.31], [0.12, 0.3], [0.13, 0.22], [0.0, 0.25]], 0.024), [0, 0.04, 0], [0, -PI / 2, 0])); // crest holder
  A('trim', xf(boxG(0.03, 0.02, 0.2), [0, 0.3, 0.0]));
  if (rr.r >= 3) gem(rig, H, [0, 0.178, 0.14], 0.014, rr);
  if (rr.r >= 4) for (const sg of [-1, 1]) A('trim', xf(extrude([[0, 0], [0.09, 0.03], [0.15, 0.1], [0.08, 0.08]], 0.008), [sg * 0.122, 0.12, -0.02], [0, sg * PI / 2, sg * 0.4]));
}
function headband(rig, o) { tg(rig, 'helm', () => headbandB(rig, o)); }
function headbandB(rig, o) {
  const H = rig.joints.head, hd = (rig.detail | 0) > 0, r0 = hd ? 0.128 : 0.115, r1 = hd ? 0.131 : 0.118; rig.add('cloth', lathe([[r0, 0.15], [r1, 0.184]], 10, 0.95, 1.06, 0, 1), H);
  rig.add('cloth', xf(quadG(0.045, 0.13), [0.03, 0.1, -0.12], [0.3, 0, -0.35]), H); rig.add('cloth', xf(quadG(0.045, 0.1), [-0.025, 0.1, -0.125], [0.4, 0, 0.3]), H);
  rig.add('trim', xf(sphereG(0.014, 4, 3), [0, 0.168, 0.126], [0, 0, 0], [1, 1, 0.5]), H);
}

// ---------------------------------------------------------------- armour pieces
function loinFlap(rig, anchor, o = {}) {
  const rows = o.rows || 4, cols = o.cols || 3, len = o.len || 0.3, rl = len / (rows - 1), back = !!o.back, w = o.w || 0.2;
  const thighs = [['hipL', 'kneeL', 'ankleL'], ['hipR', 'kneeR', 'ankleR']], a = new V3(), b = new V3(), ab = new V3(), cap = new Float64Array(32);
  const J = rig.joints, R = 0.108 * (rig.build.bulk || 1) * (rig.build.leg || 1) + 0.012;
  const g = new ClothGrid({
    anchor, rows, cols, rowLen: rl, stiff: 0.3, stiffFall: 0.55, damping: 0.9, gravity: -9, side: new V3(1, 0, 0),
    shape: (r) => new V3(o.x || 0, (o.y || 0) - r * rl * 0.97, (back ? -1 : 1) * ((o.z || 0.145) + r * 0.014)), widthFn: (r) => w * (1 + 0.15 * r / (rows - 1)), material: o.material || rig.mats.clothF || rig.mats.cloth, name: 'flap', tipShade: 0.62, fold: true,
    // PERF: the four leg capsules (world space) are measured once per verlet step (prep), not once per vertex per iteration; the joints do not move inside a step
    prep: () => {
      const hh = rig.build.height || 1;
      for (let t = 0; t < 2; t++) for (let s = 0; s < 2; s++) {
        const k = (t * 2 + s) * 8; a.setFromMatrixPosition(J[thighs[t][s]].matrixWorld); b.setFromMatrixPosition(J[thighs[t][s + 1]].matrixWorld); ab.subVectors(b, a);
        cap[k] = a.x; cap[k + 1] = a.y; cap[k + 2] = a.z; cap[k + 3] = ab.x; cap[k + 4] = ab.y; cap[k + 5] = ab.z; cap[k + 6] = ab.lengthSq(); cap[k + 7] = R * (s ? 0.8 : 1) * hh;
      }
    },
    collide: (p) => { // keep out of the thighs and shins
      for (let n = 0; n < 4; n++) {
        const k = n * 8, ax = cap[k], ay = cap[k + 1], az = cap[k + 2], bx = cap[k + 3], by = cap[k + 4], bz = cap[k + 5];
        const px = p.x - ax, py = p.y - ay, pz = p.z - az; let q = (px * bx + py * by + pz * bz) / cap[k + 6]; q = q < 0 ? 0 : q > 1 ? 1 : q;
        const dx = px - bx * q, dy = py - by * q, dz = pz - bz * q, d = Math.sqrt(dx * dx + dy * dy + dz * dz), rr = cap[k + 7];
        if (d < rr && d > 1e-5) { const m = rr / d; p.x = ax + bx * q + dx * m; p.y = ay + by * q + dy * m; p.z = az + bz * q + dz * m; }
      }
    },
  });
  rig.addSecondary(g);
  // PERF: front + back flaps share the cloth material: one mesh (one draw call, one shadow draw) instead of two
  const fl = rig._flaps || (rig._flaps = []); if (!fl.length || fl[0].mesh.material === g.mesh.material) { fl.push(g); if (fl.length > 1) mergeCloths(rig, fl); }
  return g;
}
function pteruges(rig, obj, n, r, y, len, w, mat = 'leather', o = {}) { rig.add(mat, tabRing(n, r, y, len, w, Object.assign({ sz: 0.82, flare: 0.045 }, o)), obj); }
function ring(rig, obj, r0, r1, y0, y1, seg = 12, sz = 0.76, mat = 'leather', k = 1) { rig.add(mat, paint(lathe([[r0, y0], [r1, y1]], seg, 1, sz, 0, 1), k), obj); }
function beltPlates(rig, B, o = {}) {
  const S = rig.joints.spine;
  ring(rig, S, 0.158 * B, 0.17 * B, -0.075, 0.02, 12, 0.76);
  for (let i = -2; i <= 2; i++) { const a = i * 0.34, r = 0.176 * B; rig.add('metal', xf(quadG(0.062, 0.07), [Math.sin(a) * r, -0.028, Math.cos(a) * r * 0.76 + 0.004], [0, a * 0.95, 0]), S); }
  rig.add('trim', xf(new THREE.CircleGeometry(0.03, 6), [0, -0.028, 0.176 * B * 0.76 + 0.008]), S);
}
function pouch(rig, side, o = {}) {
  const obj = rig.sockets['belt' + side], sg = side === 'L' ? 1 : -1;
  rig.add('leather', xf(boxG(0.075, 0.085, 0.05), [sg * 0.015, -0.055, 0.02], [0, 0, sg * 0.05]), obj); rig.add('leather', paint(xf(quadG(0.08, 0.04), [sg * 0.015, -0.03, 0.047], [0.2, 0, sg * 0.05]), 0.8), obj);
}
function greave(rig, side, B = 1, o = {}) { tg(rig, 'greave' + side, () => greaveB(rig, side, B, o)); }
function greaveB(rig, side, B, o) {
  const K = rig.joints['knee' + side], LG = rig.build.leg || 1; const prof = [], ts = [0.08, 0.45, 0.92];
  for (const t of ts) prof.push([(lerp(0.066, 0.045, t) * (1 + 0.14 * Math.sin(Math.PI * t))) * B * LG * (1 + 0.1 * hdk(rig)) + 0.012 + 0.006 * hdk(rig), -t * 0.43]);
  prof.reverse();
  rig.add('metal', lathe(prof, 7, 1.03, 1.1, 0.12, 0.8, -PI * 0.78, PI * 1.56), K);
  rig.add('trim', xf(sphereG(0.014, 4, 3), [0, 0.0, 0.07 * B]), K);
}
function laceUp(rig, side, B = 1) { // sandal lacing wound up the shin
  const K = rig.joints['knee' + side], LG = rig.build.leg || 1;
  for (let i = 0; i < 3; i++) { const t = 0.66 + i * 0.1, r = lerp(0.066, 0.045, t) * B * LG * 1.14 + 0.004; rig.add('leather', lathe([[r, -t * 0.43 - 0.009], [r + 0.004, -t * 0.43 + 0.009]], 6, 1, 1, 0, 1), K); }
}
function wrap(rig, side, mat = 'cloth', y0 = -0.2, y1 = -0.27, B = 1) { // wrist wrap on the forearm
  const E = rig.joints['elbow' + side], rf = (y) => lerp(0.054, 0.04, -y / 0.27) * B * (rig.build.arm || 1) + 0.007 + 0.011 * hdk(rig);
  rig.add(mat, lathe([[rf(y1), y1], [rf(y0), y0]], 6, 1, 1, 0.1, 0.8), E);
}
function manica(rig, side, B = 1) { tg(rig, 'manica' + side, () => manicaB(rig, side, B)); }
function manicaB(rig, side, B) { // segmented arm guard on upper arm + forearm
  const AR = rig.build.arm || 1;
  for (let i = 0; i < 2; i++) { const y = -0.07 - i * 0.1, r = (lerp(0.068, 0.054, (-y) / 0.3) * AR * B) + 0.01 + 0.014 * hdk(rig); rig.add('metal', lathe([[r * 0.94, y - 0.07], [r, y]], 6, 1, 1, 0.3, 0.7), rig.joints['shoulder' + side]); }
  for (let i = 0; i < 3; i++) { const y = -0.015 - i * 0.075, r = (lerp(0.054, 0.04, (-y) / 0.27) * AR * B) + 0.009 + 0.014 * hdk(rig); rig.add('metal', lathe([[r * 0.93, y - 0.07], [r, y]], 6, 1, 1, 0.3, 0.7), rig.joints['elbow' + side]); }
}
function galerus(rig, rr, B = 1) { tg(rig, 'galerus', () => galerusB(rig, rr, B)); }
function galerusB(rig, rr, B) {
  const S = rig.joints.shoulderL, A = (m, g) => rig.add(m, g, S);
  A('metal', lathe([[0.112, -0.02], [0.11, 0.05], [0.04, 0.095], [0, 0.11]], 8, 1.18, 1.0, 0.1, 0.8));
  A('metal', xf(extrude([[-0.02, 0.0], [0.18, 0.0], [0.17, 0.12], [0.12, 0.23], [0.02, 0.27], [-0.03, 0.2]], 0.014, 0), [-0.005, 0.0, 0.0], [0, PI / 2, -0.52]));
  A('trim', xf(new THREE.TorusGeometry(0.108, 0.006, 3, 8), [0, -0.02, 0], [PI / 2, 0, 0], [1.18, 1.0, 1]));
  gem(rig, S, [0.0, 0.1, 0.0], 0.014, rr);
}
function laurel(rig, B, sh, stars, lvl, onShell = 0) {
  const C = rig.joints.chest, n = clamp(stars | 0, 1, 5), gold = lvl >= 5 ? [1, 1, 1] : [0.72, 0.5, 0.3], cy = 0.2, Rr = 0.056;
  for (const sg of [-1, 1]) for (let i = 0; i < n; i++) {
    const a = (0.45 + i * 0.39) * 0.9, x = sg * Math.sin(a) * Rr, y = cy - Math.cos(a) * Rr, cp = chestPt(x, y, B, sh, 0.034 + onShell);
    rig.add('trim', paint(xf(quadG(0.02, 0.034), cp.p.toArray(), [-0.2, 0, sg * (a - PI / 2 + 0.45)]), gold), C);
  }
  const cp = chestPt(0, cy, B, sh, 0.036 + onShell);
  rig.add(lvl >= 8 ? 'gem' : 'trim', paint(xf(new THREE.CircleGeometry(0.014, 5), cp.p.toArray()), lvl >= 8 ? [1.4, 1.1, 0.5] : gold), C);
}
function baldric(rig, B, sh, dir = 1, o = {}) { tg(rig, 'armor', () => baldricB(rig, B, sh, dir, o)); }
function baldricB(rig, B, sh, dir, o) { // leather strap across the chest, optionally with a phalera disc
  const pts = [], n = 6, C = rig.joints.chest;
  for (let i = 0; i < n; i++) { const t = i / (n - 1), x = lerp(-dir * 0.19, dir * 0.15, t) * B, y = lerp(0.3, 0.0, t), cp = chestPt(x, y, B, sh, 0.026 + (o.off || 0)); pts.push(cp.p); }
  rig.add(o.mat || 'leather', ribbon(pts, o.w || 0.04, (p, i) => chestPt(pts[i].x, pts[i].y, B, sh, 0).n), C);
  if (o.disc) { const cp = chestPt(0.0, 0.16, B, sh, 0.034 + (o.off || 0)); rig.add('trim', xf(new THREE.CircleGeometry(0.034, 6), cp.p.toArray(), [-0.1, 0, 0]), C); }
}
function segmentata(rig, B, sh, rr) { tg(rig, 'armor', () => segmentataB(rig, B, sh, rr)); }
function segmentataB(rig, B, sh, rr) { // lorica segmentata: stacked overlapping bands + shoulder lames
  const C = rig.joints.chest;
  for (let i = 0; i < 4; i++) { const y0 = -0.03 + i * 0.075, y1 = y0 + 0.09; rig.add('metal', lathe([[chestR(y0, B, sh) + 0.022, y0], [chestR(y1, B, sh) + 0.012, y1]], 12, 1, 0.72, 0.25, 0.72), C); }
  ring(rig, C, chestR(0.29, B, sh) + 0.02, chestR(0.298, B, sh) + 0.02, 0.29, 0.298, 12, 0.72, 'trim');
  for (const s of ['L', 'R']) for (let i = 0; i < 2; i++) { const y = 0.02 - i * 0.05, r = 0.093 - i * 0.004; rig.add('metal', lathe([[r * 0.94, y - 0.06], [r, y]], 6, 1.05, 1.0, 0.3, 0.7, -PI * 0.5, PI * 1.0), rig.joints['shoulder' + s]); }
  gem(rig, C, chestPt(0, 0.12, B, sh, 0.03).p.toArray(), 0.016, rr);
}
function jerkin(rig, B, sh, rr) { tg(rig, 'armor', () => jerkinB(rig, B, sh, rr)); }
function jerkinB(rig, B, sh, rr) { // thraex leather jerkin: shoulder straps, gold neckline, hem tabs
  const C = rig.joints.chest, prof = []; for (const y of [-0.04, 0.09, 0.2, 0.3]) prof.push([chestR(y, B, sh) + 0.016, y]);
  rig.add('leather', paint(lathe(prof, 12, 1, 0.72, 0.1, 0.8), (x, y, z) => 0.95 - 0.12 * Math.exp(-sq((y - 0.13) / 0.01)) * sm01(-0.05, 0.08, z)), C);
  ring(rig, C, chestR(0.298, B, sh) + 0.02, chestR(0.305, B, sh) + 0.021, 0.29, 0.305, 12, 0.72, 'trim');
  rig.add('leather', tabRing(12, chestR(-0.03, B, sh) + 0.012, -0.03, 0.1, 0.075, { sz: 0.72, flare: 0.03, tip: 0.8, shade: 0.7 }), C);
  for (const sg of [-1, 1]) { // shoulder straps front -> over the shoulder -> back
    const pts = [ps(sg * 0.1 * B, 0.29, chestR(0.29, B, sh) * 0.72 * 0.9 + 0.02), ps(sg * 0.14 * B, 0.345, 0.02), ps(sg * 0.1 * B, 0.29, -chestR(0.29, B, sh) * 0.72 * 0.9 - 0.02)];
    rig.add('leather', ribbon(pts, 0.055, (p, i) => ps(sg * 0.3, 1, i === 0 ? 0.3 : i === 2 ? -0.3 : 0)), C);
  }
  for (const s of ['L', 'R']) rig.add('leather', tabRing(4, 0.09, 0.03, 0.13, 0.075, { sz: 1, flare: 0.03, tip: 0.85, arc: PI, a0: s === 'L' ? 0 : PI, shade: 0.7 }), rig.joints['shoulder' + s]);
  gem(rig, C, chestPt(0, 0.15, B, sh, 0.03).p.toArray(), 0.016, rr);
}

// ---------------------------------------------------------------- equip a full style
export const STYLES = ['murmillo', 'retiarius', 'thraex', 'hoplomachus', 'dimachaerus'];
// o: { rar:{weapon,shield,armor,helm,charm} 0..4, rarCol:[5 hex], stars, lvl }. Returns { weapon, weaponL, shield, helm, net, cloak, plume }.
export function equipStyle(rig, style, o = {}) {
  const J = rig.joints, out = rig.gear, B = rig.build.bulk || 1, sh = rig.build.shoulder || 1;
  rig.animator.style = style; // per-style victory pose (setWeapon below rebuilds the clips)
  const rw = rarOf(o, 'weapon'), rs = rarOf(o, 'shield'), ra = rarOf(o, 'armor'), rh = rarOf(o, 'helm'), rc = rarOf(o, 'charm');
  if (style === 'murmillo') {
    rig.animator.setWeapon('sword');
    out.weapon = makeSword(rig, o, rw); out.shield = mountShield(rig, 'scutum', o, rs); helmMurmillo(rig, o, rh);
    manica(rig, 'R', B); greave(rig, 'L', B);
    baldric(rig, B, sh, 1, { disc: true }); beltPlates(rig, B); pteruges(rig, J.hips, 12, 0.2 * B, -0.03, 0.18, 0.08, 'leather', { shade: 0.62 });
    out.flap = loinFlap(rig, J.hips, { len: 0.34, w: 0.2 }); loinFlap(rig, J.hips, { len: 0.3, w: 0.22, back: true, z: 0.135 });
    gem(rig, J.chest, chestPt(0.0, 0.16, B, sh, 0.034).p.toArray(), 0.014, ra);
  } else if (style === 'retiarius') {
    rig.animator.setWeapon('spear');
    out.weapon = makeSpear(rig, o, rw, true); rig.animator.ik.hand = { target: out.weapon.userData.gripB, w: 1, side: 'L' };
    galerus(rig, rs.r ? rs : ra, B); manica(rig, 'R', B); wrap(rig, 'L', 'cloth', -0.12, -0.25, B); laceUp(rig, 'L', B); laceUp(rig, 'R', B);
    baldric(rig, B, sh, -1, { w: 0.032 }); baldric(rig, B, sh, 1, { w: 0.03, off: 0.004 });
    ring(rig, J.spine, 0.156 * B, 0.164 * B, -0.07, 0.0); pouch(rig, 'L'); pouch(rig, 'R');
    out.flap = loinFlap(rig, J.hips, { len: 0.42, w: 0.19 }); loinFlap(rig, J.hips, { len: 0.38, w: 0.2, back: true, z: 0.135 });
    out.net = makeNet(rig, o);
    gem(rig, J.chest, chestPt(0.0, 0.2, B, sh, 0.034).p.toArray(), 0.012, ra);
  } else if (style === 'thraex') {
    rig.animator.setWeapon('sword');
    out.weapon = makeSword(rig, o, rw, true); out.shield = mountShield(rig, 'parmula', o, rs); helmThraex(rig, o, rh);
    jerkin(rig, B, sh, ra); greave(rig, 'L', B); greave(rig, 'R', B);
    beltPlates(rig, B); pouch(rig, 'L'); pteruges(rig, J.hips, 12, 0.2 * B, -0.03, 0.2, 0.082, 'leather', { shade: 0.6 }); pteruges(rig, J.hips, 12, 0.2 * B, -0.12, 0.1, 0.082, 'cloth', { a0: 0.26, shade: 0.7 });
    out.flap = loinFlap(rig, J.hips, { len: 0.3, w: 0.18 });
  } else if (style === 'hoplomachus') {
    rig.animator.setWeapon('spear');
    out.weapon = makeSpear(rig, o, rw, false); rig.animator.ik.hand = { target: out.weapon.userData.gripB, w: 1, side: 'L' };
    helmHoplo(rig, o, rh); segmentata(rig, B, sh, ra); greave(rig, 'L', B); greave(rig, 'R', B); wrap(rig, 'L', 'leather', -0.17, -0.25, B); wrap(rig, 'R', 'leather', -0.17, -0.25, B);
    ring(rig, J.spine, 0.156 * B, 0.166 * B, -0.07, 0.01);
    pteruges(rig, J.hips, 12, 0.2 * B, -0.03, 0.19, 0.08, 'cloth', { shade: 0.65 }); pteruges(rig, J.hips, 12, 0.2 * B, -0.1, 0.11, 0.08, 'leather', { a0: 0.26, shade: 0.7 });
    out.flap = loinFlap(rig, J.hips, { len: 0.3, w: 0.2, material: rig.mats.plumeF || rig.mats.plume });
    out.plume = addPlume(rig, { tall: 1.35, cols: 3, w: 0.085, z: 0.0 }); out.cloak = addCloak(rig);
  } else if (style === 'dimachaerus') {
    rig.animator.setWeapon('dual');
    out.weapon = makeSword(rig, o, rw, false, 'R'); out.weaponL = makeSword(rig, o, rw, false, 'L');
    headband(rig, o); baldric(rig, B, sh, 1, { disc: true, w: 0.045 }); baldric(rig, B, sh, -1, { w: 0.045, off: 0.004 });
    for (const s of ['L', 'R']) { wrap(rig, s, 'cloth', -0.08, -0.26, B); ring(rig, J['shoulder' + s], 0.078 * B * (1 + 0.16 * hdk(rig)), 0.07 * B * (1 + 0.16 * hdk(rig)), -0.12, -0.05, 6, 1); laceUp(rig, s, B); }
    ring(rig, J.spine, 0.156 * B, 0.166 * B, -0.065, 0.012); pouch(rig, 'L');
    out.flap = loinFlap(rig, J.hips, { len: 0.26, w: 0.2 }); loinFlap(rig, J.hips, { len: 0.22, w: 0.2, back: true, z: 0.135 });
  }
  // pips and charm
  laurel(rig, B, sh, o.stars || 1, o.lvl || 1, style === 'thraex' || style === 'hoplomachus' ? 0.012 : 0);
  if (o.rar && o.rar.charm !== undefined && o.rar.charm >= 0 && o.hasCharm) { // pendant on a cord
    const pts = [chestPt(-0.05, 0.3, B, sh, 0.012).p, chestPt(-0.03, 0.22, B, sh, 0.012).p, chestPt(0, 0.17, B, sh, 0.014).p, chestPt(0.03, 0.22, B, sh, 0.012).p, chestPt(0.05, 0.3, B, sh, 0.012).p];
    rig.add('leather', ribbon(pts, 0.008, (p, i) => chestPt(pts[i].x, pts[i].y, B, sh, 0).n), J.chest); gem(rig, J.chest, [0, 0.165, chestPt(0, 0.165, B, sh, 0.03).p.z], 0.013, { r: Math.max(2, rc.r), col: rc.col });
  }
  // glow: strongest rarity among equipped items drives the emissive accent colour; legendary pulses
  const best = [rw, rs, ra, rh, rc].reduce((a, b) => (b.r > a.r ? b : a), { r: 0, col: '#fff' });
  if (best.r >= 3) rig.setGlow(best.col, best.r >= 4 ? 0.75 : 0.4, best.r >= 4 ? 0.4 : 0.0, 3.2);
  if (o.g) { try { addMarks(rig, o.g); } catch (e) { /* marks are cosmetic */ } } // SCARS: scars and bandages
  rig.rebuild();
  return out;
}

// ---------------------------------------------------------------- SCARS and bandages (g.scars ids, g.wounds): painted on the skin as raised pale / dark patches, plus wraps
// All geometry is merged into the rig like gear; nothing here moves. Call addMarks(rig, g) before rig.rebuild(). Marks sit on the 'skin' material (vertex colour multiplies the skin tone,
// so a pale scar stays visible on every skin), bandages use a 'linen' material added to the rig. Parts: rig.detachPart('marks') is not needed (they are tiny).
const SCAR_PALE = [1.45, 1.2, 1.15], SCAR_PINK = [1.2, 0.93, 0.9], SCAR_DARK = [0.6, 0.4, 0.37], STITCH = [0.2, 0.12, 0.1];
const HSKULL = (j) => [[0, -0.022], [0.040 * j, -0.014], [0.068 * j, 0.012], [0.086 * j, 0.048], [0.097, 0.088], [0.105, 0.13], [0.104, 0.17], [0.092, 0.215], [0.058, 0.248], [0, 0.262]];
function headSurface(rig) { // head-local surface point with the face sculpt (brow, cheek, chin) so marks do not sink into the bulges
  const F = FACES[(((rig.look && rig.look.face) | 0) % 3 + 3) % 3], prof = HSKULL(F.j);
  const base = (x, y) => { const R = skullR(prof, y), u = clamp(x / (R * HEAD_SX + 1e-5), -0.98, 0.98); return ps(x, y, HEAD_SZ * R * Math.sqrt(1 - u * u)); };
  const blobs = []; for (const sg of [-1, 1]) blobs.push({ p: base(sg * 0.04, 0.142), r: 0.034, a: F.brow }, { p: base(sg * 0.037, 0.122), r: 0.021, a: -0.006 }, { p: base(sg * 0.068, 0.088), r: 0.034, a: F.cheek });
  blobs.push({ p: base(0, 0.002), r: 0.028, a: F.chin }, { p: base(0, 0.19), r: 0.05, a: 0.004 });
  return (x, y, off = 0.004) => {
    const p = base(x, y), R = skullR(prof, y); let d = 0;
    for (const b of blobs) d += b.a * Math.exp(-(sq(p.x - b.p.x) + sq(p.y - b.p.y) + sq(p.z - b.p.z)) / (b.r * b.r));
    const n = ps(x / (HEAD_SX * HEAD_SX), (y - 0.1) * 0.12, p.z / (HEAD_SZ * HEAD_SZ)).normalize();
    return { p: p.addScaledVector(n, d + off), n, R };
  };
}
function scarLine(rig, obj, pts, nrm, wf, dark) { // a healed seam: darker red rim under a pale raised core
  const W = typeof wf === 'function' ? wf : () => wf;
  rig.add('skin', paint(ribbon(pts, (t) => W(t) * 2.1, (p, i) => nrm[i]), dark || [0.78, 0.42, 0.4]), obj);
  rig.add('skin', paint(ribbon(pts.map((p, i) => p.clone().addScaledVector(nrm[i], 0.0016)), W, (p, i) => nrm[i]), SCAR_PALE), obj);
}
const faceTo = (geo, p, n) => { const q = new THREE.Quaternion().setFromUnitVectors(ps(0, 0, 1), n), m = new THREE.Matrix4().compose(p, q, ps(1, 1, 1)); geo.applyMatrix4(m); return geo; };
function headStrap(rig, hs, mat, col, w = 0.011, off = 0.011) { // band around the head that starts at the left eye (+x) and runs over the brow and round the back
  const n = 26, pts = [], nor = [], th0 = 0.42;
  for (let i = 0; i <= n; i++) {
    const t = i / n, th = th0 - t * Math.PI * 2, y = 0.122 + 0.034 * sm01(0, 0.18, t) * sm01(1, 0.82, t) - 0.012 * Math.sin(t * PI), R = skullR(HSKULL(1), y) + off;
    const p = ps(Math.sin(th) * R * HEAD_SX, y, Math.cos(th) * R * HEAD_SZ); if (t < 0.12 || t > 0.88) { const h = hs(p.x, y, off + 0.002); p.copy(h.p); }
    pts.push(p); nor.push(ps(p.x / (HEAD_SX * HEAD_SX), 0, p.z / (HEAD_SZ * HEAD_SZ)).normalize());
  }
  rig.add(mat, paint(ribbon(pts, w, (p, i) => nor[i]), col), rig.joints.head);
}
function eyeCover(rig, mat, col, linen) {
  const hs = headSurface(rig), e = hs(0.037, 0.121, linen ? 0.014 : 0.012), r = linen ? 0.031 : 0.025;
  rig.add(mat, paint(faceTo(xf(sphereG(r, 9, 5, 1, 0.92, 0.38), [0, 0, 0]), e.p, e.n), col), rig.joints.head);
  headStrap(rig, hs, mat, col, linen ? 0.016 : 0.011, linen ? 0.014 : 0.011);
}
function bodyPt(B, sh, x, y, off, back) { const c = chestPt(x, y, B, sh, off); if (back) { c.p.z = -c.p.z + 2 * off * 0; c.n.z = -c.n.z; } return c; }

export function addMarks(rig, g) {
  const scars = g.scars || [], wounds = g.wounds || []; if (!scars.length && !wounds.length) return 0;
  const J = rig.joints, B = rig.build.bulk || 1, sh = rig.build.shoulder || 1, AR = rig.build.arm || 1, LG = rig.build.leg || 1, hd = hdk(rig), has = (id) => scars.indexOf(id) >= 0;
  let n = 0; const hs = headSurface(rig);
  const linen = () => { if (!rig.mats.linen) rig.addMaterial('linen', new THREE.MeshStandardMaterial({ color: '#e6dcc2', roughness: 0.95, metalness: 0, vertexColors: true, side: THREE.DoubleSide }), 'cloth'); return 'linen'; };
  const wrapLinen = (obj, r0, r1, y0, y1, bands = 3, sz = 1) => { const L = linen(); for (let i = 0; i < bands; i++) { const a = y0 + (y1 - y0) * (i / bands), b = y0 + (y1 - y0) * ((i + 1.15) / bands), t0 = i / bands, t1 = (i + 1.15) / bands; rig.add(L, paint(lathe([[lerp(r0, r1, t0), a], [lerp(r0, r1, t1) + 0.003, b]].sort((p, q) => p[1] - q[1]), 12, 1, sz, 0.15, 0.85), i % 2 ? 0.86 : 1), obj); } n++; };
  const armR = (y) => lerp(0.054, 0.04, clamp(-y / 0.27, 0, 1)) * AR * B + 0.007 + 0.011 * hd;
  // ---- scars
  if (has('gash_scar')) { // slash down the left brow, across the eye socket, to the cheek, with stitch marks
    const path = [[0.066, 0.17], [0.059, 0.14], [0.056, 0.118], [0.066, 0.092], [0.078, 0.066]], pts = path.map(([x, y]) => hs(x, y, 0.006)); 
    scarLine(rig, J.head, pts.map((q) => q.p), pts.map((q) => q.n), (t) => 0.0078 * (0.55 + 0.9 * Math.sin(Math.PI * t) ** 0.6));
    for (let i = 1; i < 4; i++) { const q = pts[i], tp = ps(1, 0, 0).cross(q.n).normalize(); const a = q.p.clone().addScaledVector(tp, 0.0), b = q.p.clone().addScaledVector(ps(1, 0, 0), 0.012); rig.add('skin', paint(ribbon([a.addScaledVector(ps(1, 0, 0), -0.012), b], 0.0022, () => q.n), STITCH), J.head); }
    n++;
  }
  if (has('lost_eye') && !wounds.some((w) => (w.part || w.id) === 'eye')) { eyeCover(rig, 'leather', 0.5, false); n++; }
  if (has('ringing')) { // a dented, bruised temple on the right side of the head
    const q = hs(-0.09, 0.148, 0.003), g2 = faceTo(xf(sphereG(0.026, 8, 4, 1, 1.15, 0.22), [0, 0, 0]), q.p, q.n);
    rig.add('skin', paint(g2, SCAR_DARK), J.head);
    const pts = [[-0.092, 0.168], [-0.099, 0.15], [-0.094, 0.13]].map(([x, y]) => hs(x, y, 0.007)); scarLine(rig, J.head, pts.map((p) => p.p), pts.map((p) => p.n), 0.005); n++;
  }
  if (has('old_ribs')) { // raised welts across the left lower ribs
    for (let k = 0; k < 3; k++) { const pts = []; for (let i = 0; i <= 5; i++) { const t = i / 5; pts.push(chestPt(0.04 + t * 0.15, 0.05 + k * 0.035 + t * 0.07, B, sh, 0.012 + 0.012 * hd)); }
      scarLine(rig, J.chest, pts.map((p) => p.p), pts.map((p) => p.n), (t) => 0.007 * (0.5 + Math.sin(PI * t))); } n++;
  }
  if (has('whip')) { // four old lashes across the back
    for (let k = 0; k < 4; k++) { const pts = []; for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(bodyPt(B, sh, -0.17 + t * 0.34 + (k % 2 ? 0.02 : -0.02), 0.07 + k * 0.045 + (k % 2 ? t : 1 - t) * 0.075, 0.012 + 0.012 * hd, true)); }
      scarLine(rig, J.chest, pts.map((p) => p.p), pts.map((p) => p.n), (t) => 0.0055 * (0.4 + Math.sin(PI * t)), k % 2 ? [0.55, 0.3, 0.28] : null); } n++;
  }
  if (has('stiff_arm')) { // right arm bound in leather, held a little tight
    for (const [y0, y1] of [[-0.03, -0.08], [-0.11, -0.16], [-0.18, -0.23]]) rig.add('leather', paint(lathe([[armR(y1), y1], [armR(y0) + 0.003, y0]], 8, 1, 1, 0.1, 0.8), 0.9), J.elbowR);
    rig.add('leather', paint(lathe([[0.062 * B * AR + 0.012 + 0.012 * hd, -0.19], [0.064 * B * AR + 0.012 + 0.012 * hd, -0.12]], 8, 1, 1, 0.1, 0.8), 0.8), J.shoulderR); n++;
  }
  if (has('bad_knee')) { // left knee brace: two straps and a hinge plate
    const r = 0.07 * B * LG * (1 + 0.1 * hd) + 0.016;
    for (const [y0, y1, rr] of [[0.01, 0.06, r * 1.12], [-0.1, -0.05, r * 0.92]]) rig.add('leather', paint(lathe([[rr, y0], [rr + 0.004, y1]], 10, 1, 1, 0.1, 0.8), 0.85), J.kneeL);
    rig.add('metal', xf(boxG(0.012, 0.15, 0.03), [r * 1.1, -0.02, 0.0], [0, 0, 0]), J.kneeL); rig.add('trim', xf(sphereG(0.012, 5, 3), [r * 1.1 + 0.008, -0.02, 0.0]), J.kneeL); n++;
  }
  if (has('burn')) { // blotchy tight shiny skin over the right forearm and elbow
    const prof = []; for (let i = 0; i <= 9; i++) { const y = 0.03 - i * 0.032; prof.push([armR(Math.min(y, 0)) + 0.002, y]); } prof.reverse();
    const nz = (a, y) => { const s = Math.sin(a * 3.1 + y * 41) + Math.sin(a * 5.3 - y * 23 + 1.7) * 0.7; return s; };
    const burn = lathe(prof, 12, 1, 1, 0, 1, -PI * 0.5, PI * 1.6);
    paint(burn, (x, y, z) => { const a = Math.atan2(x, z), v = nz(a, y); return v > 0.35 ? (v > 0.95 ? [0.5, 0.3, 0.28] : [0.72, 0.5, 0.46]) : [1, 1, 1]; });
    rig.add('skin', burn, J.elbowR); n++;
  }
  // ---- bandages for current wounds
  for (const wd of wounds) {
    const id = wd.part || wd.id, L = linen(); if (!(wd.w > 0) && wd.w != null) continue;
    if (id === 'ribs') { const y0 = 0.05, y1 = 0.17, o = 0.012 + 0.012 * hd; wrapLinen(J.chest, chestR(y0, B, sh) + o, chestR(y1, B, sh) + o, y0, y1, 4, 0.72); rig.add(L, paint(faceTo(xf(sphereG(0.02, 6, 3, 1, 1, 0.3), [0, 0, 0]), chestPt(0.09, 0.11, B, sh, 0.02).p, chestPt(0.09, 0.11, B, sh, 0).n), [1, 0.5, 0.48]), J.chest); }
    else if (id === 'gash') { const pts = [], o = 0.016 + 0.012 * hd; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(chestPt(0.2 - t * 0.31, 0.25 - t * 0.17, B, sh, o)); } rig.add(L, paint(ribbon(pts.map((p) => p.p), 0.052, (p, i) => pts[i].n), (x, y, z) => { const d = Math.exp(-(sq(x - 0.03) + sq(y - 0.17)) / 0.002); return [1, 1 - 0.75 * d, 1 - 0.8 * d]; }), J.chest); n++; }
    else if (id === 'arm') { wrapLinen(J.elbowR, armR(-0.2) + 0.006, armR(-0.02) + 0.006, -0.2, -0.02, 5); wrapLinen(J.shoulderR, 0.056 * B * AR + 0.016 + 0.012 * hd, 0.064 * B * AR + 0.016 + 0.012 * hd, -0.19, -0.05, 3); n++; }
    else if (id === 'knee') { const K = J.kneeR; const r = 0.07 * B * LG * (1 + 0.1 * hd) + 0.02; wrapLinen(J.kneeR, r, r * 1.04, -0.11, 0.07, 4); rig.add(L, paint(xf(sphereG(0.02, 5, 3, 1, 1, 0.4), [0, -0.02, r + 0.004]), [1, 0.5, 0.48]), K); n++; }
    else if (id === 'head') { const R = skullR(HSKULL(1), 0.15); const prof = []; for (const [y, k] of [[0.115, 0], [0.135, 1], [0.16, 1], [0.178, 0]]) prof.push([skullR(HSKULL(1), y) + 0.026 * (k ? 1 : 0.5), y]); rig.add(L, paint(lathe(prof, 14, HEAD_SX, HEAD_SZ, 0.15, 0.85), (x, y, z) => { const d = Math.exp(-(sq(x - 0.045) + sq(z - 0.1)) / 0.0012); return [1, 1 - 0.8 * d, 1 - 0.85 * d]; }), J.head); n++; }
    else if (id === 'eye') { eyeCover(rig, L, 1, true); n++; }
  }
  return n;
}
