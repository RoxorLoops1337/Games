// VIGNETTE PROPS: THE PARK (owner VIG park crew). Small procedural props for the park scenes (VIGNETTES.md 2.8, 2.9, 2.13 and section 6.3), on top of the shared
// vignette_props.js (same rules: low poly, flat shaded, cached materials flagged persist, every prop a plain THREE.Group named vig_*, states on userData).
//   tin()        the tip tin of the busk spot (origin = bottom centre): userData.fill(k 0..1) raises the coin pile, userData.water(k) (rain day), userData.mouth (world-free local top point)
//   coin()       one coin, a gold disc (spins while it flies: userData.spin(T))          cap()   a bottle cap (the D rank tin)
//   crate()      the low busking crate the hero stands on (top at CRATE_H)                 pigeon(o)  userData.step(T, mode 'idle'|'peck'|'bob'|'fly', k) a pure function of time
//   flyer(o)     a single flyer card (canvas: OPEN MIC TUESDAY AT THE BAR, o.name adds the hero's name)   stack()  the stack of flyers (origin = the fist)
//   plane()      a paper plane folded from a flyer       envelope()  the cash envelope       notes()  folded bank notes ($50)       earbud()
//   cloudMic()   a cloud shaped like a microphone, far up in the sky (soft white, unlit)     leaf()  one leaf that tumbles past (the empty plaza)
import { THREE } from './kit.js';
import { mat, screen, HAND } from './vignette_props.js';

const mesh = (g, m, x, y, z) => { const o = new THREE.Mesh(g, m); o.position.set(x || 0, y || 0, z || 0); o.castShadow = false; o.receiveShadow = false; return o; };
const grp = (name) => { const g = new THREE.Group(); g.name = 'vig_' + name; return g; };
const lathe = (pts, seg, m) => new THREE.Mesh(new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), seg || 10), m);
export const CRATE_H = 0.3;

// ------------------------------------------------------------------ the busk spot
export function tin() {
  const g = grp('tin'), side = mat('#c9ced9'), band = mat('#ff3ea5'), dark = mat('#2b2438');
  g.add(lathe([[0, 0.004], [0.11, 0.004], [0.115, 0.1], [0.122, 0.105], [0.118, 0.11], [0.108, 0.104], [0.104, 0.012], [0, 0.012]], 14, side));
  g.add(mesh(new THREE.CylinderGeometry(0.116, 0.113, 0.035, 14, 1, true), band, 0, 0.055, 0));
  const pile = new THREE.Group(); g.add(pile); const gold = mat('#ffd35c'), gold2 = mat('#e0a934'), silver = mat('#dfe3ea');
  for (let i = 0; i < 9; i++) { const a = i * 2.39, r = i ? 0.025 + (i % 3) * 0.022 : 0, c = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.006, 8), [gold, gold2, silver][i % 3], Math.cos(a) * r, 0.016 + (i % 4) * 0.004, Math.sin(a) * r); c.rotation.set(0.2 * Math.sin(i), 0, 0.25 * Math.cos(i * 1.7)); pile.add(c); }
  const water = mesh(new THREE.CylinderGeometry(0.102, 0.102, 0.004, 14), mat('#7fb6e6', { transparent: true, opacity: 0.6, depthWrite: false }), 0, 0.02, 0); water.visible = false; g.add(water);
  const inside = mesh(new THREE.CircleGeometry(0.103, 14), dark, 0, 0.013, 0); inside.rotation.x = -Math.PI / 2; g.add(inside);
  g.userData.fill = (k) => { k = Math.max(0, Math.min(1, k)); pile.visible = k > 0.02; pile.children.forEach((c, i) => { c.visible = k > i / 9; }); pile.position.y = 0.085 * k; };
  g.userData.water = (k) => { water.visible = k > 0.02; water.position.y = 0.015 + 0.07 * k; };
  g.userData.fill(0); g.scale.setScalar(1.25); return g;
}
export function coin() {
  const g = grp('coin'), c = mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.006, 10), mat('#ffd35c')); c.rotation.x = Math.PI / 2; g.add(c);
  const f = mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.007, 8), mat('#e0a934')); f.rotation.x = Math.PI / 2; g.add(f);
  g.userData.spin = (T) => { g.rotation.y = T * 14; g.rotation.x = T * 5; }; g.scale.setScalar(2.2); return g;
}
export function cap() { const g = grp('cap'); g.add(mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.008, 10), mat('#d8534a'))); g.scale.setScalar(1.25); return g; }
export function crate() {
  const g = grp('crate'), w = mat('#b98652'), d = mat('#8a5f3a'), W = 0.7, D = 0.5, H = CRATE_H;
  for (let i = 0; i < 3; i++) g.add(mesh(new THREE.BoxGeometry(W, H / 3 - 0.012, 0.03), i % 2 ? d : w, 0, H / 6 + i * H / 3, D / 2 - 0.015), mesh(new THREE.BoxGeometry(W, H / 3 - 0.012, 0.03), i % 2 ? w : d, 0, H / 6 + i * H / 3, -D / 2 + 0.015));
  for (let i = 0; i < 2; i++) g.add(mesh(new THREE.BoxGeometry(0.03, H, D), d, (i ? 1 : -1) * (W / 2 - 0.015), H / 2, 0));
  for (let i = 0; i < 4; i++) g.add(mesh(new THREE.BoxGeometry(W - 0.02, 0.02, D / 4 - 0.012), i % 2 ? w : mat('#c99a62'), 0, H - 0.01, -D / 2 + D / 8 + i * D / 4));
  return g;
}

// ------------------------------------------------------------------ the pigeon (origin = between the feet, faces +z)
export function pigeon(o) {
  o = o || {}; const g = grp('pigeon'), grey = mat(o.color || '#8e93a6'), dark = mat('#5d6274'), neck = mat('#5aa38f'), beak = mat('#3a3440'), foot = mat('#d9707a');
  const body = new THREE.Group(); g.add(body);
  const b = mesh(new THREE.SphereGeometry(0.1, 8, 6), grey, 0, 0.12, 0); b.scale.set(0.85, 0.8, 1.25); body.add(b);
  const head = new THREE.Group(); head.position.set(0, 0.2, 0.09); body.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.05, 7, 5), dark, 0, 0.02, 0.02)); head.add(mesh(new THREE.SphereGeometry(0.045, 6, 4), neck, 0, -0.03, 0));
  const bk = mesh(new THREE.ConeGeometry(0.012, 0.04, 4), beak, 0, 0.015, 0.075); bk.rotation.x = Math.PI / 2; head.add(bk);
  [-1, 1].forEach((s) => head.add(mesh(new THREE.SphereGeometry(0.009, 4, 3), mat('#ff8a3d'), s * 0.028, 0.035, 0.05)));
  const tail = mesh(new THREE.BoxGeometry(0.08, 0.015, 0.1), dark, 0, 0.12, -0.14); tail.rotation.x = -0.35; body.add(tail);
  const wings = [-1, 1].map((s) => { const w = new THREE.Group(); w.position.set(s * 0.07, 0.15, 0); const m = mesh(new THREE.BoxGeometry(0.12, 0.012, 0.16), dark, s * 0.05, 0, -0.01); w.add(m); body.add(w); return w; });
  if (o.ring) { const r = mesh(new THREE.TorusGeometry(0.012, 0.005, 4, 8), mat('#ffd35c'), 0.025, 0.035, 0); r.rotation.x = Math.PI / 2; g.add(r); }
  [-1, 1].forEach((s) => g.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.06, 4), foot, s * 0.025, 0.03, 0.01)));
  g.userData.step = (T, mode, k) => {
    k = k === undefined ? 1 : k; body.position.set(0, 0, 0); body.rotation.set(0, 0, 0); head.position.set(0, 0.2, 0.09); head.rotation.set(0, 0, 0); wings.forEach((w) => { w.rotation.set(0, 0, 0); });
    if (mode === 'peck') { const p = Math.max(0, Math.sin(T * 9)) * k; head.position.y -= 0.08 * p; head.position.z += 0.05 * p; body.rotation.x = 0.35 * p; }
    else if (mode === 'bob') { const p = Math.sin(T * (o.bpm || 100) / 60 * Math.PI * 2); head.position.z += 0.035 * p * k; head.position.y += 0.01 * Math.abs(p) * k; }
    else if (mode === 'fly') { const f = Math.sin(T * 40); wings.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * (0.2 + 1.0 * f) * k; }); body.rotation.x = -0.4 * k; }
    else { head.rotation.y = 0.5 * Math.sin(T * 1.7) * Math.sign(Math.sin(T * 0.9)); head.position.z += 0.01 * Math.sin(T * 6); }
  };
  g.userData.step(0, 'idle'); g.scale.setScalar(o.scale || 1.15); return g;
}

// ------------------------------------------------------------------ flyers, the plane, the envelope, notes
function drawFlyer(g, w, h, o) {
  g.fillStyle = '#fff6e8'; g.fillRect(0, 0, w, h); g.fillStyle = '#ff3ea5'; g.fillRect(0, 0, w, h * 0.26);
  g.fillStyle = '#fff6e8'; g.font = '800 ' + Math.round(w * 0.2) + 'px sans-serif'; g.textAlign = 'center'; g.fillText('OPEN', w / 2, h * 0.11); g.fillText('MIC', w / 2, h * 0.225);
  g.fillStyle = '#17141f'; g.font = '800 ' + Math.round(w * 0.11) + 'px sans-serif'; g.fillText('TUESDAY', w / 2, h * 0.37); g.font = '700 ' + Math.round(w * 0.085) + 'px sans-serif'; g.fillText('AT THE BAR', w / 2, h * 0.46);
  g.fillStyle = '#2ee6ff'; g.fillRect(w * 0.12, h * 0.52, w * 0.76, h * 0.26);
  g.fillStyle = '#17141f'; g.font = '800 ' + Math.round(w * 0.12) + 'px sans-serif'; g.fillText('B t K t', w / 2, h * 0.68);
  if (o && o.name) { g.fillStyle = '#ff3ea5'; g.font = '800 ' + Math.round(w * 0.075) + 'px sans-serif'; g.fillText('feat. ' + String(o.name).slice(0, 12).toUpperCase(), w / 2, h * 0.88); }
  else { g.fillStyle = '#6b6180'; g.font = '600 ' + Math.round(w * 0.06) + 'px sans-serif'; g.fillText('every voice welcome', w / 2, h * 0.88); }
}
export function flyer(o) {
  const g = grp('flyer'), s = screen(0.105, 0.148, 128); s.material.side = THREE.DoubleSide; s.userData.draw((c, w, h) => drawFlyer(c, w, h, o)); g.add(s); g.userData.screen = s; g.scale.setScalar(HAND); return g;
}
export function stack(o) {
  const g = grp('stack'), paper = mat('#f4ead8'), edge = mat('#ff9dba');
  for (let i = 0; i < 4; i++) g.add(mesh(new THREE.BoxGeometry(0.11, 0.006, 0.152), i % 2 ? edge : paper, 0.002 * (i % 2), 0.02 + i * 0.007, 0.004 * (i % 3)));
  const top = screen(0.105, 0.148, 128); top.rotation.x = -Math.PI / 2; top.position.y = 0.05; top.userData.draw((c, w, h) => drawFlyer(c, w, h, o)); g.add(top);
  g.userData.count = (k) => { g.children.forEach((c, i) => { if (i < 4) c.visible = k > i / 4; }); top.visible = k > 0.05; };
  g.rotation.x = -0.4; const w = new THREE.Group(); w.name = 'vig_stack'; w.add(g); w.userData.count = g.userData.count; w.scale.setScalar(HAND); return w;
}
export function plane() {
  const g = grp('plane'), m = mat('#fff6e8', { side: THREE.DoubleSide }), m2 = mat('#ff9dba', { side: THREE.DoubleSide });
  const geo = (pts) => { const b = new THREE.BufferGeometry(); b.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); b.computeVertexNormals(); return b; };
  g.add(new THREE.Mesh(geo([0, 0, 0.12, -0.07, 0.01, -0.06, 0, -0.012, -0.06]), m), new THREE.Mesh(geo([0, 0, 0.12, 0, -0.012, -0.06, 0.07, 0.01, -0.06]), m2));
  g.scale.setScalar(HAND); return g;
}
export function envelope() {
  const g = grp('envelope'); g.add(mesh(new THREE.BoxGeometry(0.16, 0.1, 0.006), mat('#efe1c0')));
  const fl = mesh(new THREE.BoxGeometry(0.16, 0.05, 0.004), mat('#e0cd9c'), 0, 0.028, 0.004); fl.rotation.x = 0.25; g.add(fl);
  g.add(mesh(new THREE.BoxGeometry(0.14, 0.05, 0.004), mat('#7fc97a'), 0, 0.05, -0.002));   // notes peek out of the top
  g.scale.setScalar(HAND); return g;
}
export function notes() {
  const g = grp('notes'); for (let i = 0; i < 3; i++) { const n = mesh(new THREE.BoxGeometry(0.075, 0.004, 0.035), mat(i % 2 ? '#6fbf6a' : '#8fd58a'), 0, i * 0.004, 0); n.rotation.y = i * 0.12; g.add(n); }
  g.scale.setScalar(HAND); return g;
}
export function earbud() { const g = grp('earbud'); g.add(mesh(new THREE.SphereGeometry(0.012, 6, 4), mat('#f7f2e8'))); g.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.025, 4), mat('#f7f2e8'), 0, -0.016, 0)); g.scale.setScalar(HAND); return g; }
export function leaf() {
  const g = grp('leaf'), m = mesh(new THREE.CircleGeometry(0.05, 5), mat('#d98a3a', { side: THREE.DoubleSide })); m.scale.set(1, 1.6, 1); g.add(m); return g;
}
// the mic cloud: soft white puffs (unlit, so the sky shading does not grey it), a grille ball on a handle, far up in the sky
export function cloudMic() {
  const g = grp('cloudmic'), m = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fbfbff'), transparent: true, opacity: 0.92, fog: false, toneMapped: false });
  [[0, 2.2, 0, 1.25], [0.75, 2.6, 0.1, 0.8], [-0.8, 2.5, 0, 0.85], [0.2, 3.1, 0, 0.8], [-0.4, 1.4, 0.1, 0.7]].forEach(([x, y, z, r]) => g.add(mesh(new THREE.IcosahedronGeometry(r, 1), m, x, y, z)));
  for (let i = 0; i < 5; i++) g.add(mesh(new THREE.IcosahedronGeometry(0.42 - i * 0.03, 1), m, 0.05 * Math.sin(i), 0.9 - i * 0.55, 0));
  g.userData.dispose = () => m.dispose(); return g;
}
