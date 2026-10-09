// VIGNETTE PROPS for the town interiors (owner VIG town crew: the thrift shop, the Sound Lab, the bar; VIGNETTES.md 6.4). Same rules as vignette_props.js: low poly, flat shaded,
// shared cached materials (persist), every prop a plain THREE.Group. Hand props have their origin at the fist and +y running to the far end; table props stand on their origin.
//   scanner()          the clerk's price gun with a red beam (userData.beam(v 0..1))          shopBag(o)  a paper bag with a folded top and a sticky note (userData.note(kind), userData.fill(k))
//   cash(n)            a small fan of green notes (n 1..4)                                    envelope()  a cash envelope (userData.open(k))
//   hanger()           a wire hanger                                                          jumper()    a terrible knitted jumper held up by the shoulders (a garish reindeer)
//   lanyard()          the old office lanyard with its ID card (the intro: the hero was fired)   box()       a cardboard donation box with clothes sticking out (userData.flap(k))
//   folded(color)      a folded garment for the counter (the item just bought)                 napkin(o)   a paper napkin with a hand drawn beat grid (userData.turn(k): the drawing makes sense sideways)
//   juice(color)       a tall juice glass with a straw (userData.fill(k)), the bar's green juice by default      bottle()   a water bottle        clipboard(names)   the open mic sign up sheet
//   apron()            a bar apron that ties at the waist (worn: follow the hips)              sink()      a bar sink with a dish rack and a tap (userData.drip(T))   glassStack(n)  stacked glasses (userData.wobble(k))
//   jacket(color)      a jacket left on a stool (the regular saved you a seat)                 headphones() studio cans that sit on the head bone (userData.fit(headBone))   notebook()  a lyric pad
//   moth()             a little grey moth (the empty pocket)                                   dots(n)     a row of LED vote dots for a canvas card (drawn by the reels)
import { THREE } from './kit.js';
import { mat, screen, glass, HAND, TABLE } from './vignette_props.js';

const mesh = (g, m, x, y, z) => { const o = new THREE.Mesh(g, m); o.position.set(x || 0, y || 0, z || 0); return o; };
const grp = (name) => { const g = new THREE.Group(); g.name = 'vig_' + name; return g; };
const sc = (g, k) => { g.scale.setScalar(k); return g; };
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

// ------------------------------------------------------------------ the shop
export function scanner() {
  const g = grp('scanner'), body = mat('#2b2438'), yel = mat('#ffd23f');
  g.add(mesh(box(0.03, 0.09, 0.035), body, 0, 0.03, 0));                                   // the grip (the fist)
  const head = mesh(box(0.05, 0.045, 0.12), yel, 0, 0.085, 0.04); head.rotation.x = -0.25; g.add(head);
  g.add(mesh(box(0.035, 0.03, 0.006), mat('#ff3a3a', { basic: true }), 0, 0.098, 0.1));      // the window
  const bm = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff2a2a'), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const beam = mesh(new THREE.PlaneGeometry(0.012, 0.32), bm, 0, 0.11, 0.26); beam.rotation.x = -Math.PI / 2 - 0.25; beam.renderOrder = 6; g.add(beam);
  g.userData.beam = (v) => { bm.opacity = Math.max(0, Math.min(1, v)) * 0.85; beam.visible = v > 0.01; }; g.userData.beam(0);
  g.userData.dispose = () => bm.dispose();
  return sc(g, HAND);
}
// the sticky note doodles: crown (expensive), cat (Cat Ears), cowboy hat with a question mark (Cowboy Hat), a heart, a star
const DOODLE = {
  crown: (c, w, h) => { c.strokeStyle = '#c99a12'; c.fillStyle = '#ffd23f'; c.lineWidth = 6; c.beginPath(); c.moveTo(w * 0.2, h * 0.7); c.lineTo(w * 0.22, h * 0.35); c.lineTo(w * 0.38, h * 0.55); c.lineTo(w * 0.5, h * 0.28); c.lineTo(w * 0.62, h * 0.55); c.lineTo(w * 0.78, h * 0.35); c.lineTo(w * 0.8, h * 0.7); c.closePath(); c.fill(); c.stroke(); },
  cat: (c, w, h) => { c.strokeStyle = '#2b2438'; c.lineWidth = 6; c.beginPath(); c.arc(w / 2, h * 0.58, w * 0.24, 0, Math.PI * 2); c.moveTo(w * 0.3, h * 0.45); c.lineTo(w * 0.32, h * 0.18); c.lineTo(w * 0.44, h * 0.36); c.moveTo(w * 0.7, h * 0.45); c.lineTo(w * 0.68, h * 0.18); c.lineTo(w * 0.56, h * 0.36); c.stroke(); c.fillStyle = '#2b2438'; c.fillRect(w * 0.4, h * 0.52, 8, 8); c.fillRect(w * 0.56, h * 0.52, 8, 8); },
  cowboy: (c, w, h) => { c.strokeStyle = '#7a4a22'; c.fillStyle = '#c98a4a'; c.lineWidth = 5; c.beginPath(); c.ellipse(w / 2, h * 0.62, w * 0.36, h * 0.08, 0, 0, Math.PI * 2); c.fill(); c.stroke(); c.fillRect(w * 0.36, h * 0.36, w * 0.28, h * 0.26); c.strokeRect(w * 0.36, h * 0.36, w * 0.28, h * 0.26); c.fillStyle = '#ff3ea5'; c.font = '700 ' + Math.round(h * 0.34) + 'px sans-serif'; c.textAlign = 'center'; c.fillText('?', w * 0.82, h * 0.42); },
  heart: (c, w, h) => { c.fillStyle = '#ff3ea5'; c.beginPath(); c.moveTo(w / 2, h * 0.78); c.bezierCurveTo(w * 0.05, h * 0.45, w * 0.3, h * 0.12, w / 2, h * 0.36); c.bezierCurveTo(w * 0.7, h * 0.12, w * 0.95, h * 0.45, w / 2, h * 0.78); c.fill(); },
  star: (c, w, h) => { c.fillStyle = '#2ee6ff'; c.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? w * 0.14 : w * 0.32, a = -Math.PI / 2 + i * Math.PI / 5; c.lineTo(w / 2 + Math.cos(a) * r, h * 0.52 + Math.sin(a) * r); } c.closePath(); c.fill(); },
};
export function shopBag(o) {
  o = o || {}; const g = grp('bag'), kraft = mat('#c8a06a'), dark = mat('#a37c48');
  const body = mesh(box(0.22, 0.24, 0.12), kraft, 0, 0.12, 0); g.add(body);
  const fold = mesh(box(0.225, 0.04, 0.125), dark, 0, 0.255, 0); g.add(fold);
  const logo = screen(0.13, 0.08, 96); logo.position.set(0, 0.13, 0.0615); g.add(logo);
  logo.userData.draw((c, w, h) => { c.fillStyle = '#c8a06a'; c.fillRect(0, 0, w, h); c.fillStyle = '#7a2f5a'; c.font = '700 22px sans-serif'; c.textAlign = 'center'; c.fillText('THRIFT', w / 2, h * 0.48); c.font = '600 14px sans-serif'; c.fillText('& found', w / 2, h * 0.8); });
  const note = screen(0.09, 0.09, 96); note.position.set(0.055, 0.2, 0.063); note.rotation.z = -0.18; note.visible = false; g.add(note);
  g.userData.note = (kind) => { note.visible = !!kind; if (!kind) return; note.userData.draw((c, w, h) => { c.fillStyle = '#fff07a'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(0,0,0,.08)'; c.fillRect(0, 0, w, 10); (DOODLE[kind] || DOODLE.star)(c, w, h); }); };
  // fill(k): the item drops into the bag (the fold closes over it)
  g.userData.fill = (k) => { fold.position.y = 0.255 - 0.02 * k; fold.scale.y = 1 + k; };
  g.userData.dispose = () => { logo.userData.dispose(); note.userData.dispose(); };
  return sc(g, TABLE);
}
export function cash(n) {
  const g = grp('cash'), m = mat('#7fc97a'), d = mat('#4f9a52');
  for (let i = 0; i < (n || 2); i++) { const p = mesh(box(0.15, 0.075, 0.003), i % 2 ? d : m, 0, 0.04 + i * 0.004, i * 0.003); p.rotation.z = (i - (n || 2) / 2) * 0.22; g.add(p); }
  return sc(g, HAND);
}
export function envelope() {
  const g = grp('envelope'), m = mat('#f3ead6'), flapM = mat('#e6d7b6');
  g.add(mesh(box(0.17, 0.1, 0.006), m, 0, 0.05, 0));
  const flap = new THREE.Group(); flap.position.set(0, 0.1, 0.004); const f = mesh(new THREE.ConeGeometry(0.06, 0.085, 3), flapM, 0, -0.03, 0); f.rotation.z = Math.PI; f.scale.set(1.4, 1, 0.08); flap.add(f); g.add(flap);
  const notes = mesh(box(0.15, 0.05, 0.002), mat('#7fc97a'), 0, 0.1, 0); notes.visible = false; g.add(notes);
  g.userData.open = (k) => { flap.rotation.x = -2.6 * k; notes.visible = k > 0.3; notes.position.y = 0.08 + 0.04 * k; };
  return sc(g, HAND);
}
export function hanger() {
  const g = grp('hanger'), m = mat('#c9d3e6');
  const l = mesh(box(0.2, 0.006, 0.006), m, 0, 0, 0); g.add(l);
  [-1, 1].forEach((s) => { const a = mesh(box(0.12, 0.006, 0.006), m, s * 0.05, 0.03, 0); a.rotation.z = -s * 0.55; g.add(a); });
  const hook = mesh(new THREE.TorusGeometry(0.018, 0.003, 4, 8, Math.PI * 1.4), m, 0, 0.075, 0); g.add(hook);
  return sc(g, TABLE);
}
export function jumper() {
  const g = grp('jumper'), red = mat('#c2304a'), grn = mat('#2f8a4a'), wht = mat('#f7f2e8');
  const body = mesh(box(0.42, 0.4, 0.05), red, 0, -0.2, 0); g.add(body);
  [-1, 1].forEach((s) => { const sl = mesh(box(0.14, 0.34, 0.05), red, s * 0.27, -0.16, 0); sl.rotation.z = s * 0.55; g.add(sl); const cuff = mesh(box(0.15, 0.04, 0.055), grn, s * 0.36, -0.31, 0); cuff.rotation.z = s * 0.55; g.add(cuff); });
  g.add(mesh(box(0.43, 0.05, 0.055), grn, 0, -0.38, 0), mesh(box(0.16, 0.04, 0.055), grn, 0, 0.0, 0));
  // the reindeer, the snowflakes: the worst knit in the donation box
  const face = screen(0.3, 0.26, 128); face.position.set(0, -0.2, 0.027); g.add(face);
  face.userData.draw((c, w, h) => { c.fillStyle = '#c2304a'; c.fillRect(0, 0, w, h); c.fillStyle = '#f7f2e8'; for (let i = 0; i < 7; i++) c.fillRect(8 + i * 18, 6, 8, 8); c.fillStyle = '#8a5a2e'; c.beginPath(); c.ellipse(w / 2, h * 0.62, 26, 22, 0, 0, Math.PI * 2); c.fill(); c.fillRect(w / 2 - 34, h * 0.24, 10, 30); c.fillRect(w / 2 + 24, h * 0.24, 10, 30); c.fillStyle = '#ff2a2a'; c.beginPath(); c.arc(w / 2, h * 0.74, 9, 0, Math.PI * 2); c.fill(); c.fillStyle = '#17141f'; c.fillRect(w / 2 - 12, h * 0.55, 6, 6); c.fillRect(w / 2 + 6, h * 0.55, 6, 6); });
  g.userData.dispose = () => face.userData.dispose();
  return g;
}
export function lanyard() {
  const g = grp('lanyard'), strap = mat('#3a5fcd');
  // held by the strap: the fist at the top (origin), the card hangs below it
  [-1, 1].forEach((s) => { const st = mesh(box(0.012, 0.16, 0.002), strap, s * 0.02, -0.08, 0); st.rotation.z = -s * 0.12; g.add(st); });
  const card = screen(0.07, 0.095, 96); card.position.set(0, -0.2, 0.002); g.add(card); g.add(mesh(box(0.074, 0.099, 0.003), mat('#e8e8f0'), 0, -0.2, -0.001));
  card.userData.draw((c, w, h) => { c.fillStyle = '#f2f2f6'; c.fillRect(0, 0, w, h); c.fillStyle = '#3a5fcd'; c.fillRect(0, 0, w, 26); c.fillStyle = '#fff'; c.font = '700 15px sans-serif'; c.textAlign = 'center'; c.fillText('VISITOR', w / 2, 18); c.fillStyle = '#c9c3dd'; c.fillRect(w / 2 - 20, 36, 40, 44); c.fillStyle = '#6b6b80'; c.font = '600 11px sans-serif'; c.fillText('ACCOUNTS', w / 2, 100); c.fillText('LVL 4', w / 2, 116); });
  g.userData.dispose = () => card.userData.dispose();
  return sc(g, HAND);
}
export function donationBox() {
  const g = grp('dbox'), cb = mat('#b8874e'), cbD = mat('#94683a');
  g.add(mesh(box(0.5, 0.32, 0.38), cb, 0, 0.16, 0)); g.add(mesh(box(0.505, 0.03, 0.385), cbD, 0, 0.3, 0));
  const flaps = []; [[-1, 0], [1, 0]].forEach(([s]) => { const f = new THREE.Group(); f.position.set(s * 0.25, 0.32, 0); f.add(mesh(box(0.25, 0.006, 0.38), cbD, -s * 0.125, 0, 0)); f.rotation.z = s * 1.9; g.add(f); flaps.push({ f, s }); });
  [['#ff6ec7', -0.1, 0.05], ['#2ee6ff', 0.08, -0.06], ['#ffd23f', 0.0, 0.08]].forEach(([c, x, z], i) => { const p = mesh(box(0.2, 0.08, 0.16), mat(c), x, 0.33 + i * 0.02, z); p.rotation.y = i * 0.6; g.add(p); });
  g.userData.flap = (k) => flaps.forEach(({ f, s }) => { f.rotation.z = s * (0.2 + 1.7 * k); });
  return g;
}
export function folded(color) {
  const g = grp('folded'), m = mat(color || '#ff6ec7'), d = mat(new THREE.Color(color || '#ff6ec7').multiplyScalar(0.75).getStyle());
  g.add(mesh(box(0.26, 0.05, 0.2), m, 0, 0.025, 0)); g.add(mesh(box(0.265, 0.012, 0.03), d, 0, 0.051, 0.06));
  return sc(g, TABLE);
}
// ------------------------------------------------------------------ the bar
export function napkin() {
  const g = grp('napkin'), s = screen(0.17, 0.17, 160); s.rotation.x = -Math.PI / 2; s.position.y = 0.004; g.add(s); g.add(mesh(box(0.172, 0.003, 0.172), mat('#f7f2e8'), 0, 0.001, 0));
  // a beat grid that only makes sense one way round (turn(k) turns the drawing a quarter)
  s.userData.draw((c, w, h) => {
    c.fillStyle = '#fbf8f0'; c.fillRect(0, 0, w, h); c.strokeStyle = 'rgba(40,30,60,.25)'; c.lineWidth = 1; for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(i * w / 4, 8); c.lineTo(i * w / 4, h - 8); c.stroke(); }
    c.fillStyle = '#2b2438'; c.font = '700 26px sans-serif'; c.textAlign = 'center'; ['B', 't', 'K', 't'].forEach((k, i) => c.fillText(k, w / 8 + i * w / 4, h * 0.32));
    c.strokeStyle = '#ff3ea5'; c.lineWidth = 4; c.beginPath(); c.moveTo(18, h * 0.55); c.quadraticCurveTo(w / 2, h * 0.85, w - 18, h * 0.55); c.stroke(); c.beginPath(); c.moveTo(w - 30, h * 0.48); c.lineTo(w - 16, h * 0.56); c.lineTo(w - 32, h * 0.62); c.stroke();
    c.fillStyle = '#3a5fcd'; c.font = '600 16px sans-serif'; c.fillText('x2 !!', w * 0.5, h * 0.9);
  });
  g.userData.turn = (k) => { s.rotation.z = -k * Math.PI / 2; };
  g.userData.dispose = () => s.userData.dispose();
  return sc(g, TABLE);
}
export function juice(color) {
  const gl = glass(); const fill = gl.children[1]; if (color && fill) fill.material = mat(color);
  const g = grp('juice'); g.add(gl); g.userData.fill = gl.userData.fill; g.userData.len = 0.16 * HAND; return sc(g, HAND);
}
export function bottle() {
  const g = grp('bottle'), bl = mat('#7fd6ff', { transparent: true, opacity: 0.55, depthWrite: false }), cap = mat('#2a9d8f'), lab = mat('#f7f2e8');
  g.add(mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.15, 9), bl, 0, 0.07, 0), mesh(new THREE.CylinderGeometry(0.0285, 0.0285, 0.05, 9), lab, 0, 0.07, 0), mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.03, 8), bl, 0, 0.16, 0), mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.02, 8), cap, 0, 0.18, 0));
  return sc(g, HAND);
}
export function clipboard(lines) {
  const g = grp('clipboard'); g.add(mesh(box(0.17, 0.23, 0.008), mat('#8a5a2e'))); g.add(mesh(box(0.06, 0.02, 0.014), mat('#c9d3e6'), 0, 0.105, 0.005));
  const s = screen(0.15, 0.19, 128); s.position.set(0, -0.012, 0.0045); g.add(s);
  s.userData.draw((c, w, h) => { c.fillStyle = '#fbf8f0'; c.fillRect(0, 0, w, h); c.fillStyle = '#2b2438'; c.font = '700 14px sans-serif'; c.fillText('OPEN MIC', 10, 18); c.font = '500 13px sans-serif'; (lines || []).forEach((l, i) => { c.fillStyle = i === (lines.length - 1) ? '#ff3ea5' : '#3a3550'; c.fillText((i + 1) + '. ' + l, 10, 40 + i * 20); if (i < lines.length - 1) { c.strokeStyle = '#3a3550'; c.beginPath(); c.moveTo(10, 36 + i * 20); c.lineTo(w - 12, 34 + i * 20); c.stroke(); } }); });
  g.userData.dispose = () => s.userData.dispose();
  return sc(g, HAND);
}
// the apron: a cloth panel and two ties; worn it is placed every frame at the hips of the wearer (see the bar reels)
export function apron() {
  const g = grp('apron'), m = mat('#2a9d8f'), d = mat('#1f6a74');
  g.add(mesh(box(0.42, 0.42, 0.02), m, 0, -0.18, 0)); g.add(mesh(box(0.44, 0.04, 0.025), d, 0, 0.03, 0)); g.add(mesh(box(0.16, 0.08, 0.024), d, 0, -0.18, 0.003));
  return g;
}
export function sink() {
  const g = grp('sink'), steel = mat('#b9c2d6'), dark = mat('#5a6178'), wat = mat('#7fd6ff', { transparent: true, opacity: 0.55, depthWrite: false });
  g.add(mesh(box(0.56, 0.05, 0.4), steel, 0, 0.0, 0)); g.add(mesh(box(0.46, 0.012, 0.3), dark, 0, 0.026, 0)); g.add(mesh(box(0.44, 0.01, 0.28), wat, 0, 0.034, 0));
  const tap = new THREE.Group(); tap.position.set(0, 0.03, -0.17); tap.add(mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.2, 6), steel, 0, 0.1, 0)); const sp = mesh(box(0.02, 0.02, 0.12), steel, 0, 0.2, 0.05); tap.add(sp); g.add(tap);
  const drop = mesh(new THREE.SphereGeometry(0.008, 5, 4), wat, 0, 0.18, -0.06); g.add(drop);
  // the dish rack next to the sink with four glasses upside down
  const rack = new THREE.Group(); rack.position.set(0.48, 0.0, 0); g.add(rack); for (let i = 0; i < 5; i++) rack.add(mesh(box(0.008, 0.08, 0.3), steel, -0.14 + i * 0.07, 0.04, 0)); rack.add(mesh(box(0.3, 0.01, 0.3), steel, 0, 0.0, 0));
  for (let i = 0; i < 4; i++) { const gl = glass(); gl.rotation.x = Math.PI; gl.position.set(-0.1 + i * 0.065, 0.14, 0); gl.scale.setScalar(0.8); rack.add(gl); }
  g.userData.drip = (T) => { const u = (T * 1.66) % 1; drop.position.y = 0.18 - u * 0.15; drop.visible = u < 0.95; };
  return sc(g, 1.15);
}
export function glassStack(n) {
  const g = grp('stack'), list = [];
  for (let i = 0; i < (n || 5); i++) { const p = new THREE.Group(); p.position.y = i * 0.12; const gl = glass(); gl.children[1].visible = false; gl.children[2].visible = false; p.add(gl); (list[i - 1] ? list[i - 1] : g).add(p); if (i) p.position.y = 0.12; list.push(p); }
  g.userData.wobble = (k) => { list.forEach((p, i) => { p.rotation.z = Math.sin(i * 1.3) * 0.06 * k * (i + 1) / list.length; p.rotation.x = Math.cos(i * 0.9) * 0.04 * k; }); };
  return sc(g, HAND);
}
export function jacket(color) {
  const g = grp('jacket'), m = mat(color || '#3a5fcd'), d = mat('#17141f');
  const b = mesh(box(0.34, 0.08, 0.3), m, 0, 0.04, 0); b.rotation.y = 0.3; g.add(b);
  const sl = mesh(box(0.3, 0.06, 0.08), m, 0.08, 0.1, 0.12); sl.rotation.y = -0.4; g.add(sl); g.add(mesh(box(0.06, 0.25, 0.05), m, 0.2, -0.1, 0.05), mesh(box(0.08, 0.01, 0.3), d, -0.05, 0.085, 0));
  return sc(g, TABLE);
}
export function notebook() {
  const g = grp('notebook'), s = screen(0.12, 0.15, 112); s.position.z = 0.004; g.add(s); g.add(mesh(box(0.125, 0.155, 0.008), mat('#ff5cb0')));
  s.userData.draw((c, w, h) => { c.fillStyle = '#fffdf4'; c.fillRect(0, 0, w, h); c.strokeStyle = '#9ad0ff'; for (let i = 1; i < 8; i++) { c.beginPath(); c.moveTo(4, i * 18); c.lineTo(w - 4, i * 18); c.stroke(); } c.fillStyle = '#2b2438'; c.font = '600 15px sans-serif'; c.fillText('B . t K', 8, 32); c.fillText('Pf t B ?', 8, 68); c.fillStyle = '#ff3ea5'; c.fillText('LR !!', 8, 104); });
  g.userData.dispose = () => s.userData.dispose();
  return sc(g, HAND);
}
// studio cans: a band over the top of the head and two cups, parented to the head bone (fit() measures the head once, so any hair or hat still fits)
export function headphones() {
  const g = grp('headphones'), band = mat('#17141f'), cup = mat('#ff3ea5'), pad = mat('#2b2438');
  const arc = mesh(new THREE.TorusGeometry(0.5, 0.045, 5, 14, Math.PI), band); arc.rotation.z = 0; g.add(arc);
  [-1, 1].forEach((s) => { const c = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 10), cup, s * 0.5, 0, 0); c.rotation.z = Math.PI / 2; g.add(c); const p = mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.04, 10), pad, s * 0.44, 0, 0); p.rotation.z = Math.PI / 2; g.add(p); });
  return g;
}
export function moth() {
  const g = grp('moth'), m = mat('#c9b9a0'), d = mat('#8a7a68'); g.add(mesh(box(0.012, 0.012, 0.04), d));
  const wings = []; [-1, 1].forEach((s) => { const w = new THREE.Group(); const q = mesh(box(0.05, 0.003, 0.035), m, s * 0.025, 0, 0); w.add(q); g.add(w); wings.push({ w, s }); });
  g.userData.flap = (T) => wings.forEach(({ w, s }) => { w.rotation.z = s * (0.3 + 0.9 * Math.abs(Math.sin(T * 30))); });
  return sc(g, HAND);
}
// a canvas card for the bar's LED wall votes and the shop chalkboard: card(w, h, px) -> screen with draw(fn)
export const card = (w, h, px) => screen(w, h, px || 256);
