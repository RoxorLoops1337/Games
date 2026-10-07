// Encore Island 3D — lead: renderer, post-processing, camera, input, small gameplay loop, test hooks.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { C, SCALE } from './palette.js';
import { buildWorld } from './environment.js';
import { buildProps } from './props.js';
import { makeJasmin, makeRoxor, makeCreature, makeFan } from './characters.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch (e) { $('err').style.display = 'flex'; throw e; }
let pr = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(pr);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 400);
const world = buildWorld(scene, renderer);
const props = buildProps(scene);

// ---- post: bloom makes lamps, plates and coins glow ----
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.65, 0.88);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---- cast ----
const jasmin = makeJasmin(), roxor = makeRoxor();
scene.add(jasmin.group, roxor.group);
const P = { x: 0, z: 5.2, vx: 0, vz: 0, face: 0, sing: 0, shoot: 0 };
const R = { x: -1.6, z: 6.4, face: 0, sp: 0 };
jasmin.group.position.set(P.x, 0, P.z); roxor.group.position.set(R.x, 0, R.z);
const fans = [];
const FAN_HOME = [[-3.2, 4.2], [3.4, 3.6], [-2.2, -3.2], [2.6, -3.4], [5.4, 1.6], [-5.2, 4.6]];
FAN_HOME.forEach(([x, z], i) => { const f = makeFan(i + 1); f.group.position.set(x, 0, z); scene.add(f.group); fans.push({ ...f, o: f, x, z, hx: x, hz: z, tx: x, tz: z, wait: Math.random() * 3, face: Math.random() * 6, sp: 0 }); });
const foes = [];
let coins = 0, shownCoins = 0, shake = 0, cheer = 0;

// ---- music notes (Jasmin's attack) ----
const noteGeo = { head: new THREE.SphereGeometry(0.13, 10, 8), stem: new THREE.CylinderGeometry(0.025, 0.025, 0.42, 6), flag: new THREE.BoxGeometry(0.2, 0.05, 0.04) };
const noteMat = new THREE.MeshStandardMaterial({ color: C.hotPink, emissive: C.hotPink, emissiveIntensity: 2.4, flatShading: true });
const notes = [];
function fireNote(from, to) {
  const g = new THREE.Group(), h = new THREE.Mesh(noteGeo.head, noteMat), s = new THREE.Mesh(noteGeo.stem, noteMat), f = new THREE.Mesh(noteGeo.flag, noteMat);
  h.scale.set(1.2, 0.9, 1); s.position.set(0.1, 0.2, 0); f.position.set(0.2, 0.4, 0); f.rotation.z = -0.5; g.add(h, s, f);
  g.position.set(from.x, 1.35, from.z); scene.add(g);
  const dx = to.x - from.x, dz = to.z - from.z, l = Math.hypot(dx, dz) || 1;
  notes.push({ g, vx: dx / l * 13, vz: dz / l * 13, life: 1.1, spin: Math.random() * 6 });
}

// ---- creatures ----
function spawnFoe() {
  const sp = world.spawnPoints[(Math.random() * world.spawnPoints.length) | 0]; if (!sp) return;
  const kind = ['kappa', 'oni', 'slime'][(Math.random() * 3) | 0], c = makeCreature(kind);
  c.group.position.set(sp.x, 0, sp.z); scene.add(c.group);
  foes.push({ c, x: sp.x, z: sp.z, hp: 3, face: Math.random() * 6, tx: sp.x, tz: sp.z, wait: 0, atk: 0, hurt: 0, dying: false });
}
let spawnCd = 0.5;

// ---- input: WASD/arrows + floating touch/mouse stick ----
const K = {}; addEventListener('keydown', (e) => { K[e.key.toLowerCase()] = true; $('hint').style.opacity = 0; }); addEventListener('keyup', (e) => { K[e.key.toLowerCase()] = false; });
const stick = { on: false, ax: 0, ay: 0, dx: 0, dy: 0, id: null };
const sEl = $('stick'), sKnob = sEl.firstElementChild;
renderer.domElement.addEventListener('pointerdown', (e) => { stick.on = true; stick.id = e.pointerId; stick.ax = e.clientX; stick.ay = e.clientY; stick.dx = stick.dy = 0; sEl.style.display = 'block'; sEl.style.left = e.clientX + 'px'; sEl.style.top = e.clientY + 'px'; $('hint').style.opacity = 0; renderer.domElement.setPointerCapture(e.pointerId); });
renderer.domElement.addEventListener('pointermove', (e) => { if (!stick.on || e.pointerId !== stick.id) return; let dx = (e.clientX - stick.ax) / 50, dy = (e.clientY - stick.ay) / 50; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; } stick.dx = dx; stick.dy = dy; sKnob.style.transform = `translate(${dx * 38}px,${dy * 38}px)`; });
const endStick = (e) => { if (e.pointerId !== stick.id) return; stick.on = false; stick.dx = stick.dy = 0; sEl.style.display = 'none'; sKnob.style.transform = ''; };
renderer.domElement.addEventListener('pointerup', endStick); renderer.domElement.addEventListener('pointercancel', endStick);

// ---- camera rig ----
const cam = { x: 0, y: 0, z: 0, fov: 40, shotMode: null };
const camOff = new THREE.Vector3(0, 10.5, 12.5);
const CAM_PRESETS = {
  hero: [[0, 9.5, 13], [0, 0.8, 0]], wide: [[-2, 26, 30], [-4, 0, 6]], top: [[0, 30, 0.1], [0, 0, 0]], water: [[-14, 2.6, 22], [-4, 1.5, 4]], meadow: [[-12.7, 8, 22], [-12.7, 0.5, 13]],
  stage: [[0, 3.4, 8], [0, 1.4, 0.8]], close: [[1.2, 2.4, 8.4], [-0.2, 1.1, 5.6]],
};
function applyCam(dt) {
  const t = Q.get('cam') && CAM_PRESETS[Q.get('cam')];
  if (t) { camera.position.set(...t[0]); camera.lookAt(...t[1]); return; }
  const lead = 0.35, tx = P.x + P.vx * lead, tz = P.z + P.vz * lead;
  cam.x = damp(cam.x, tx, 5, dt); cam.z = damp(cam.z, tz, 5, dt);
  const sx = shake > 0 ? (Math.random() - 0.5) * shake * 0.25 : 0, sy = shake > 0 ? (Math.random() - 0.5) * shake * 0.25 : 0;
  const aspect = innerWidth / innerHeight, zoom = aspect < 0.8 ? 1.22 : 1; // portrait phones sit a little farther back
  camera.position.set(cam.x + camOff.x * zoom + sx, camOff.y * zoom + sy, cam.z + camOff.z * zoom);
  camera.lookAt(cam.x, 0.9, cam.z - 0.5);
  shake = Math.max(0, shake - dt * 9);
}

// ---- main update ----
const plateState = {};
function update(dt, t) {
  // movement
  let ix = (K.d || K.arrowright ? 1 : 0) - (K.a || K.arrowleft ? 1 : 0) + stick.dx, iz = (K.s || K.arrowdown ? 1 : 0) - (K.w || K.arrowup ? 1 : 0) + stick.dy;
  const il = Math.hypot(ix, iz); if (il > 1) { ix /= il; iz /= il; }
  const SPD = 5.4, tvx = ix * SPD, tvz = iz * SPD;
  P.vx = damp(P.vx, tvx, 14, dt); P.vz = damp(P.vz, tvz, 14, dt);
  let nx = P.x + P.vx * dt, nz = P.z + P.vz * dt;
  if (world.isWalkable(nx, nz)) { P.x = nx; P.z = nz; } else if (world.isWalkable(nx, P.z)) { P.x = nx; P.vz = 0; } else if (world.isWalkable(P.x, nz)) { P.z = nz; P.vx = 0; } else { P.vx = P.vz = 0; }
  const sp = Math.hypot(P.vx, P.vz);
  // nearest foe in range
  let tgt = null, td = 7.5 * 7.5;
  for (const f of foes) if (!f.dying) { const d = (f.x - P.x) ** 2 + (f.z - P.z) ** 2; if (d < td) { td = d; tgt = f; } }
  P.sing = damp(P.sing, tgt ? 1 : 0, 10, dt);
  if (tgt) { P.face = Math.atan2(tgt.x - P.x, tgt.z - P.z); P.shoot -= dt; if (P.shoot <= 0) { P.shoot = 0.55; fireNote(P, tgt); jasmin.attack && jasmin.attack(); } }
  else if (sp > 0.3) P.face = Math.atan2(P.vx, P.vz);
  jasmin.group.position.set(P.x, 0, P.z); jasmin.group.rotation.y = lerpAngle(jasmin.group.rotation.y, P.face, 1 - Math.exp(-14 * dt));
  jasmin.update(dt, t, { speed: clamp(sp / SPD, 0, 1), singing: P.sing > 0.5 || cheer > 0, carry: 0, hurt: 0 });
  cheer = Math.max(0, cheer - dt);
  // Roxor trails behind and hauls the loot
  const bx = P.x - Math.sin(P.face) * 1.9 + Math.cos(P.face) * 0.5, bz = P.z - Math.cos(P.face) * 1.9 - Math.sin(P.face) * 0.5;
  const rdx = bx - R.x, rdz = bz - R.z, rd = Math.hypot(rdx, rdz); let rs = 0;
  if (rd > 0.5) { rs = Math.min(rd * 3.2, SPD * 1.08); const mx = rdx / rd * rs * dt, mz = rdz / rd * rs * dt; if (world.isWalkable(R.x + mx, R.z + mz)) { R.x += mx; R.z += mz; } R.face = Math.atan2(rdx, rdz); }
  roxor.group.position.set(R.x, 0, R.z); roxor.group.rotation.y = lerpAngle(roxor.group.rotation.y, R.face, 1 - Math.exp(-12 * dt));
  roxor.update(dt, t, { speed: clamp(rs / SPD, 0, 1), singing: false, carry: Math.min(12, Math.floor(coins / 3)), hurt: 0 });
  roxor.setCarry && roxor.setCarry(Math.min(12, Math.floor(coins / 3)));
  // fans wander & cheer
  for (const f of fans) {
    f.wait -= dt; let fs = 0;
    const near = (f.x - P.x) ** 2 + (f.z - P.z) ** 2 < 16;
    if (f.wait <= 0 && Math.hypot(f.tx - f.x, f.tz - f.z) < 0.2) { const a = Math.random() * 6.28, r = 1 + Math.random() * 1.6; f.tx = f.hx + Math.cos(a) * r; f.tz = f.hz + Math.sin(a) * r; f.wait = 1 + Math.random() * 3; }
    const dx = f.tx - f.x, dz = f.tz - f.z, dl = Math.hypot(dx, dz);
    if (dl > 0.15 && f.wait <= 0.0001 + 3.5 && world.isWalkable(f.x + dx / dl * 0.03, f.z + dz / dl * 0.03)) { fs = 1.6; f.x += dx / dl * fs * dt; f.z += dz / dl * fs * dt; f.face = Math.atan2(dx, dz); }
    if (near) f.face = Math.atan2(P.x - f.x, P.z - f.z);
    f.group.position.set(f.x, 0, f.z); f.group.rotation.y = lerpAngle(f.group.rotation.y, f.face, 1 - Math.exp(-8 * dt));
    f.update(dt, t, { speed: fs / SPD, singing: near || P.sing > 0.5, carry: 0, hurt: 0 });
  }
  // creatures
  spawnCd -= dt; if (spawnCd <= 0 && foes.filter((f) => !f.dying).length < 4 && world.spawnPoints.length) { spawnFoe(); spawnCd = 2.2; }
  for (let i = foes.length - 1; i >= 0; i--) {
    const f = foes[i];
    if (f.dying) { f.c.update(dt, t, { speed: 0 }); if (f.c.dead || (f.c.isDead && f.c.isDead())) { scene.remove(f.c.group); foes.splice(i, 1); } continue; }
    const pd = Math.hypot(P.x - f.x, P.z - f.z); let fs = 0;
    if (pd < 11 && pd > 1.3) { const dx = P.x - f.x, dz = P.z - f.z; fs = 1.7; const mx = dx / pd * fs * dt, mz = dz / pd * fs * dt; if (world.isWalkable(f.x + mx, f.z + mz)) { f.x += mx; f.z += mz; } f.face = Math.atan2(dx, dz); }
    else if (pd >= 11) { f.wait -= dt; if (f.wait <= 0) { f.tx = f.x + (Math.random() - 0.5) * 4; f.tz = f.z + (Math.random() - 0.5) * 4; f.wait = 2 + Math.random() * 2; } const dx = f.tx - f.x, dz = f.tz - f.z, dl = Math.hypot(dx, dz); if (dl > 0.2 && world.isWalkable(f.x + dx / dl * 0.05, f.z + dz / dl * 0.05)) { fs = 0.9; f.x += dx / dl * fs * dt; f.z += dz / dl * fs * dt; f.face = Math.atan2(dx, dz); } }
    f.atk -= dt; if (pd < 1.5 && f.atk <= 0) { f.atk = 1.4; f.c.attack && f.c.attack(); P.vx += (P.x - f.x) * 2.5; P.vz += (P.z - f.z) * 2.5; shake = Math.max(shake, 0.6); }
    f.hurt = Math.max(0, f.hurt - dt * 4);
    f.c.group.position.set(f.x, 0, f.z); f.c.group.rotation.y = lerpAngle(f.c.group.rotation.y, f.face, 1 - Math.exp(-8 * dt));
    f.c.update(dt, t, { speed: fs / 1.7, hurt: f.hurt });
  }
  // notes
  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i]; n.life -= dt; n.g.position.x += n.vx * dt; n.g.position.z += n.vz * dt; n.g.rotation.y += dt * 8; n.g.position.y = 1.35 + Math.sin((1.1 - n.life) * 9) * 0.12;
    let hit = null; for (const f of foes) if (!f.dying && (f.x - n.g.position.x) ** 2 + (f.z - n.g.position.z) ** 2 < 0.8) { hit = f; break; }
    if (hit) { hit.hp--; hit.hurt = 1; hit.x += n.vx * 0.02; hit.z += n.vz * 0.02; n.life = 0; props.addCoinBurst(hit.x, hit.z, 4); if (hit.hp <= 0) { hit.dying = true; hit.c.die && hit.c.die(); props.addCoinBurst(hit.x, hit.z, 14); coins += 3; shake = Math.max(shake, 0.5); } }
    if (n.life <= 0) { scene.remove(n.g); notes.splice(i, 1); }
  }
  // coins
  for (const c of props.coins) if (!c.taken && (c.x - P.x) ** 2 + (c.z - P.z) ** 2 < 1.1) { c.taken = true; coins += 1; props.addCoinBurst(c.x, c.z, 8); }
  shownCoins += (coins - shownCoins) * Math.min(1, dt * 8); $('coinN').textContent = Math.round(shownCoins);
  // plates: glow when you stand near; pay coins into them
  for (const pl of props.plates) {
    const st = plateState[pl.id] || (plateState[pl.id] = { g: 0, paid: 0 }), d = Math.hypot(pl.x - P.x, pl.z - P.z), on = d < pl.r + 0.35;
    st.g = damp(st.g, on ? 1 : (d < pl.r + 3 ? 0.25 : 0), 8, dt); pl.setGlow(st.g);
    if (on && coins >= 1) { st.paid += dt * 12; const take = Math.floor(st.paid); if (take > 0) { const k = Math.min(take, Math.floor(coins)); coins -= k; st.paid -= take; if (Math.random() < 0.3) props.addCoinBurst(pl.x, pl.z, 2); } }
  }
  world.update(dt, t, new THREE.Vector3(P.x, 0, P.z));
  props.update(dt, t, new THREE.Vector3(P.x, 0, P.z));
  spawnCd = Math.max(spawnCd, 0);
}
function lerpAngle(a, b, k) { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * k; }

// ---- loop ----
function resize() { renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight); composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight); bloom.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);
const at = Q.get('at'); if (at) { const [x, z] = at.split(',').map(Number); P.x = x; P.z = z; cam.x = x; cam.z = z; }
else { cam.x = P.x; cam.z = P.z; }
let last = performance.now(), T = 0, slow = 0, frames = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now; T += dt; frames++;
  update(dt, T); applyCam(dt);
  composer.render();
  // adaptive resolution: back off the pixel ratio if the device struggles
  if (dt > 0.034) slow++; else slow = Math.max(0, slow - 1);
  if (slow > 40 && pr > 1) { pr = Math.max(1, pr - 0.25); slow = 0; resize(); }
}
resize(); requestAnimationFrame(frame);
setTimeout(() => { if ($('hint')) $('hint').style.opacity = 0; }, 9000);
window.__E3D = { THREE, scene, camera, renderer, world, props, P, R, foes, fans, get coins() { return coins; }, set coins(v) { coins = v; }, update, info: () => ({ ...renderer.info.render, ...renderer.info.memory, frames }) };
