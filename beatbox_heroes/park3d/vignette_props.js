// VIGNETTE PROPS (shared vignette kit, owner VIG): the small procedural props the action vignettes hand to the cast (VIGNETTES.md section 6). Low poly, flat shaded,
// one material per colour (cached here, flagged persist so a world unload keeps them), every prop a plain THREE.Group. A prop with states exposes them on userData:
//   food(kind)  banana | oats | dates | bowl | smoothie | tea  -> userData.bite(k 0..1) (the food gets eaten), userData.peel(k) (banana), userData.kind, userData.len (hand to tip, m)
//   spoon() fork() dateBall() glass() mug() bowlOats() bowlBurrito() tub()       phone(o) -> userData.draw(fn(g2d, w, h)) redraws its screen
//   screen(w, h, px) -> a lit canvas card (the stream overlay on the monitor, the phone, a TV card): userData.draw(fn)   blanket(w, d)   pads() -> userData.light(i, k)
//   steam(n) -> userData.step(T) (wisps rise and fade, a pure function of time)   glowBall(color, r) (an additive halo: lamp, ring light, REC lamp)   halo(color, w, h) (a soft card)
// Nothing here knows about a world; vignette_kit.js places and animates them.
import { THREE } from './kit.js';

const MATS = {};
// the cast is chibi: big heads, big fists. Hand props are built at real size and scaled by HAND, table props by TABLE, so they read at the cast's scale
export const HAND = 1.8, TABLE = 1.45;
const sc = (g, k) => { g.scale.setScalar(k); return g; };
export function mat(color, o) {
  const k = color + (o ? JSON.stringify(o) : ''); if (MATS[k]) return MATS[k];
  const m = o && o.basic ? new THREE.MeshBasicMaterial(Object.assign({ color: new THREE.Color(color), toneMapped: false }, o.basic === true ? {} : o.basic))
    : new THREE.MeshLambertMaterial(Object.assign({ color: new THREE.Color(color), flatShading: true }, o || {}));
  m.userData.persist = true; MATS[k] = m; return m;
}
const mesh = (g, m, x, y, z) => { const o = new THREE.Mesh(g, m); o.position.set(x || 0, y || 0, z || 0); o.castShadow = false; o.receiveShadow = false; return o; };
const grp = (name) => { const g = new THREE.Group(); g.name = 'vig_' + name; return g; };
function lathe(pts, seg, m) { return new THREE.Mesh(new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), seg || 10), m); }

// ------------------------------------------------------------------ food (held by the left hand: the prop's +y runs from the fist to the bite end, origin = the fist)
export function food(kind) {
  const g = grp('food_' + kind); g.userData.kind = kind; g.userData.bite = () => {}; g.userData.len = 0.14;
  if (kind === 'banana') {
    const body = mat('#f6d43a'), dark = mat('#b98a1e'), peelM = mat('#f2c62a'), inner = mat('#fff2c4');
    const segs = []; for (let i = 0; i < 4; i++) { const s = mesh(new THREE.CylinderGeometry(i === 3 ? 0.012 : 0.02, 0.021, 0.045, 7), i ? inner : body, 0, 0.03 + i * 0.042, -0.006 * i * i); s.rotation.x = -0.12 * i; g.add(s); segs.push(s); }
    const stem = mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.03, 5), dark, 0, -0.01, 0); g.add(stem);
    // three peel strips hinged at the bottom of the bare part: closed they wrap it, open they hang down around the fist
    const peels = []; for (let i = 0; i < 3; i++) { const p = new THREE.Group(), a = i / 3 * Math.PI * 2; p.position.set(Math.sin(a) * 0.016, 0.05, Math.cos(a) * 0.016); p.rotation.y = a; const q = mesh(new THREE.BoxGeometry(0.026, 0.11, 0.006), peelM, 0, 0.055, 0.004); p.add(q); g.add(p); peels.push(p); }
    g.userData.peel = (k) => { peels.forEach((p, i) => { p.rotation.x = Math.min(1, Math.max(0, k * 3 - i)) * 2.6; }); };
    g.userData.bite = (k) => { const n = Math.round(k * 3); segs.forEach((s, i) => { s.visible = i === 0 || i < 4 - n; }); };
    g.userData.len = 0.19; g.userData.peel(0);
  } else if (kind === 'dates') {
    const b = dateBall(); b.position.y = 0.03; g.add(b); g.userData.bite = (k) => { b.visible = k < 0.5; }; g.userData.len = 0.05;
  } else if (kind === 'smoothie') {
    const gl = glass(); g.add(gl); g.userData.bite = gl.userData.fill ? (k) => gl.userData.fill(1 - k) : () => {}; g.userData.len = 0.16;
  } else if (kind === 'tea') {
    const m = mug(); g.add(m); g.userData.bite = (k) => m.userData.fill(1 - k * 0.6); g.userData.len = 0.11;
  } else if (kind === 'spoon' || kind === 'fork') {
    const s = kind === 'spoon' ? spoon(true) : fork(true); g.add(s); g.userData.len = 0.15; g.userData.bite = (k) => { if (s.userData.load) s.userData.load.visible = k < 0.5; };
  }
  g.userData.len *= HAND; return sc(g, HAND);
}
export function dateBall() { const m = mesh(new THREE.IcosahedronGeometry(0.022, 0), mat('#6b3a1f')); m.scale.set(1, 0.9, 1.05); return m; }
export function tub() { const g = sc(grp('tub'), TABLE); g.add(lathe([[0, 0], [0.05, 0], [0.055, 0.05], [0.05, 0.05], [0, 0.012]], 9, mat('#f1e6cf'))); for (let i = 0; i < 4; i++) { const b = dateBall(); b.position.set(Math.cos(i * 1.7) * 0.022, 0.05, Math.sin(i * 1.7) * 0.022); g.add(b); } return g; }
export function spoon(loaded) {
  const g = grp('spoon'), m = mat('#c9d3e6'); const h = mesh(new THREE.BoxGeometry(0.008, 0.11, 0.004), m, 0, 0.055, 0); g.add(h);
  const b = mesh(new THREE.SphereGeometry(0.016, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, 0.12, 0); b.rotation.x = Math.PI / 2; b.scale.set(1, 1.3, 0.5); g.add(b);
  if (loaded) { const l = mesh(new THREE.IcosahedronGeometry(0.012, 0), mat('#e8d3a0'), 0, 0.122, 0.006); g.add(l); g.userData.load = l; }
  return g;
}
export function fork(loaded) {
  const g = grp('fork'), m = mat('#c9d3e6'); g.add(mesh(new THREE.BoxGeometry(0.008, 0.1, 0.004), m, 0, 0.05, 0));
  for (let i = 0; i < 3; i++) g.add(mesh(new THREE.BoxGeometry(0.003, 0.035, 0.003), m, (i - 1) * 0.007, 0.115, 0));
  if (loaded) { const l = mesh(new THREE.IcosahedronGeometry(0.014, 0), mat('#d9573a'), 0, 0.12, 0.006); g.add(l); g.userData.load = l; }
  return g;
}
// bowls stand on a table (origin = bottom centre). setFill(k) lowers the food and takes the toppings away
export function bowlOats() {
  const g = sc(grp('oats'), TABLE); g.add(lathe([[0, 0], [0.045, 0], [0.08, 0.05], [0.083, 0.055], [0.076, 0.055], [0.04, 0.008], [0, 0.008]], 12, mat('#5fb8b0')));
  const s = mesh(new THREE.CylinderGeometry(0.072, 0.06, 0.012, 12), mat('#e6cf98'), 0, 0.04, 0); g.add(s);
  const berries = []; [['#5b2a6e', 0.02, 0.01], ['#c2304a', -0.025, 0.015], ['#5b2a6e', 0.005, -0.03], ['#3a3a8e', -0.03, -0.02], ['#c2304a', 0.035, -0.012]].forEach(([c, x, z]) => { const b = mesh(new THREE.IcosahedronGeometry(0.011, 0), mat(c), x, 0.05, z); g.add(b); berries.push(b); });
  g.userData.fill = (k) => { s.position.y = 0.012 + 0.03 * k; s.scale.setScalar(0.75 + 0.25 * k); berries.forEach((b, i) => { b.visible = k > i / 5; b.position.y = s.position.y + 0.01; }); };
  g.userData.fill(1); return g;
}
export function bowlBurrito() {
  const g = sc(grp('burrito'), TABLE); g.add(lathe([[0, 0], [0.05, 0], [0.095, 0.07], [0.1, 0.075], [0.092, 0.075], [0.045, 0.01], [0, 0.01]], 12, mat('#f2ead8')));
  const cols = ['#f4f0e0', '#6b3a2a', '#5fae4a', '#d9573a'], parts = [];
  cols.forEach((c, i) => { const w = mesh(new THREE.CylinderGeometry(0.085, 0.07, 0.02, 10, 1, false, i * Math.PI / 2, Math.PI / 2), mat(c), 0, 0.058, 0); g.add(w); parts.push(w); });
  g.userData.fill = (k) => { parts.forEach((p, i) => { p.position.y = 0.02 + 0.04 * k; p.visible = k > 0.08 + i * 0.05; }); };
  g.userData.fill(1); return g;
}
export function glass() {
  const g = grp('glass'), gm = mat('#d8f4ff', { transparent: true, opacity: 0.35, depthWrite: false });
  const sh = mesh(new THREE.CylinderGeometry(0.032, 0.026, 0.13, 10, 1, true), gm, 0, 0.065, 0); g.add(sh);
  const fill = mesh(new THREE.CylinderGeometry(0.029, 0.024, 0.12, 10), mat('#7ccf3a'), 0, 0.06, 0); g.add(fill);
  const straw = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.16, 5), mat('#ff3ea5'), 0.012, 0.12, 0); straw.rotation.z = -0.2; g.add(straw);
  g.userData.fill = (k) => { k = Math.max(0.02, k); fill.scale.y = k; fill.position.y = 0.004 + 0.06 * k; }; g.userData.fill(1);
  return g;
}
export function mug() {
  const g = grp('mug'), m = mat('#f4efe2');
  g.add(lathe([[0, 0], [0.036, 0], [0.038, 0.08], [0.034, 0.08], [0.032, 0.008], [0, 0.008]], 10, m));
  const hd = mesh(new THREE.TorusGeometry(0.022, 0.006, 4, 8, Math.PI), m, 0.038, 0.042, 0); hd.rotation.z = -Math.PI / 2; g.add(hd);
  const tea = mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.004, 10), mat('#b8742e'), 0, 0.07, 0); g.add(tea);
  g.add(mesh(new THREE.CylinderGeometry(0.0385, 0.0385, 0.022, 10, 1, true), mat('#2a9d8f'), 0, 0.045, 0));   // a teal band
  const tag = mesh(new THREE.BoxGeometry(0.018, 0.022, 0.002), mat('#f7f2e8'), -0.042, 0.05, 0.012); g.add(tag); g.add(mesh(new THREE.BoxGeometry(0.001, 0.04, 0.001), mat('#f7f2e8'), -0.04, 0.075, 0.006));
  g.userData.fill = (k) => { tea.position.y = 0.012 + 0.058 * k; }; return g;
}
// ------------------------------------------------------------------ screens (canvas cards): the phone, the stream overlay, a VHS card
export function screen(w, h, px, o) {
  o = o || {}; const cv = document.createElement('canvas'); cv.width = px || 256; cv.height = Math.round((px || 256) * h / w);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  const m = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: !!o.transparent, depthWrite: !o.transparent, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
  const card = mesh(new THREE.PlaneGeometry(w, h), m); card.renderOrder = 4; const g2 = cv.getContext('2d');
  card.userData.draw = (fn) => { try { g2.clearRect(0, 0, cv.width, cv.height); fn(g2, cv.width, cv.height); } catch (e) { console.error('[vig] screen draw failed', e); } tex.needsUpdate = true; };
  card.userData.dispose = () => { tex.dispose(); m.dispose(); }; card.name = 'vig_screen';
  return card;
}
export function phone(o) {
  const g = grp('phone'); g.add(mesh(new THREE.BoxGeometry(0.075, 0.14, 0.01), mat('#17141f')));
  const s = screen(0.066, 0.128, 160, o); s.position.z = 0.0055; g.add(s); g.userData.draw = s.userData.draw; g.userData.screen = s; g.userData.len = 0.08;
  return sc(g, HAND);
}
// a patchwork blanket (lies over a body on a bed): w along x, d along z, origin at its centre top
export function blanket(w, d) {
  const g = grp('blanket'), cols = ['#2a9d8f', '#ff6ec7', '#f2b134', '#7b4fe0', '#55d6c2', '#ff7b5c', '#5a6fd6', '#2a9d8f', '#ffb3d9'], nx = 3, nz = 3;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const p = mesh(new THREE.BoxGeometry(w / nx - 0.004, 0.05 + ((i + j) % 2) * 0.008, d / nz - 0.004), mat(cols[(i * 3 + j * 2 + i) % 9]), -w / 2 + w / nx * (i + 0.5), -0.025, -d / 2 + d / nz * (j + 0.5)); g.add(p); }
  return g;
}
// the 4x4 pad grid that lights up (sits on the pad controller of the desk)
export function pads(size) {
  const g = grp('pads'), n = 4, s = size || 0.06, cols = ['#ff3ea5', '#2ee6ff', '#ffe14d', '#9dff4a'], list = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(cols[(i + j) % 4]), toneMapped: false, transparent: true, opacity: 0 }); const p = mesh(new THREE.BoxGeometry(s * 0.82, 0.004, s * 0.82), m, (i - 1.5) * s, 0, (j - 1.5) * s); p.renderOrder = 5; g.add(p); list.push(p); }
  g.userData.light = (i, k) => { const p = list[((i % 16) + 16) % 16]; if (p) p.material.opacity = Math.max(0, Math.min(1, k)); };
  g.userData.dispose = () => list.forEach((p) => p.material.dispose());
  return g;
}
// steam wisps: n soft quads that rise, sway and fade on a loop (step(T) is a pure function of the reel clock)
export function steam(n, color) {
  const g = grp('steam'), list = [];
  for (let i = 0; i < (n || 4); i++) { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color || '#ffffff'), transparent: true, opacity: 0, depthWrite: false, toneMapped: false }); const p = mesh(new THREE.IcosahedronGeometry(0.018, 0), m); p.renderOrder = 6; g.add(p); list.push(p); }
  g.userData.step = (T, k) => { k = k === undefined ? 1 : k; list.forEach((p, i) => { const u = ((T * 0.55 + i / list.length) % 1); p.position.set(Math.sin(T * 1.7 + i * 2) * 0.02 * u, 0.02 + u * 0.22, Math.cos(T * 1.3 + i) * 0.015 * u); p.scale.setScalar(0.6 + u * 1.8); p.material.opacity = 0.32 * Math.sin(u * Math.PI) * k; }); };
  g.userData.dispose = () => list.forEach((p) => p.material.dispose());
  return g;
}
// an additive glow (a lamp bulb, the ring light, the REC lamp): a camera facing soft sprite, r = its radius; setV(0..1)
let GLOW_TEX = null;
function glowTex() {
  if (GLOW_TEX) return GLOW_TEX; const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g2 = cv.getContext('2d'), gr = g2.createRadialGradient(32, 32, 1, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g2.fillStyle = gr; g2.fillRect(0, 0, 64, 64);
  GLOW_TEX = new THREE.CanvasTexture(cv); GLOW_TEX.userData.persist = true; return GLOW_TEX;
}
export function glowBall(color, r) {
  const m = new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(color || '#ffd9a0'), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const o = new THREE.Sprite(m); o.scale.setScalar((r || 0.2) * 2); o.renderOrder = 6; o.name = 'vig_glow';
  o.userData.setV = (v) => { m.opacity = Math.max(0, Math.min(1, v)) * 0.9; o.visible = v > 0.005; }; o.userData.setV(0);
  o.userData.dispose = () => { m.map = null; m.dispose(); }; return o;
}
// a soft-edged card in screen colours (a window light patch, a TV glow on a face): setV(0..1)
export function halo(color, w, h) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g2 = cv.getContext('2d'), gr = g2.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g2.fillStyle = gr; g2.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(cv), m = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(color || '#ffd9a0'), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const o = mesh(new THREE.PlaneGeometry(w || 1, h || 1), m); o.renderOrder = 6; o.userData.setV = (v) => { m.opacity = Math.max(0, Math.min(1, v)); o.visible = v > 0.005; }; o.userData.setV(0);
  o.userData.dispose = () => { tex.dispose(); m.dispose(); }; return o;
}
