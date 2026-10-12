// Ludus Maximus 3D: boot, renderer, post, quality governor, main loop, test hooks (window.__LM3D).
import * as THREE from 'three';
import { createPost, createDynamicRes, TIERS, detectTier } from './post.js';
import { createAudio } from './audio.js';
import { FightView } from './fightview.js';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('gl'), ui = document.getElementById('ui');
const fail = (m) => { const e = document.getElementById('err'); e.textContent = m || e.textContent; e.style.display = 'flex'; };

let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' }); } catch (e) { fail(); throw e; }
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.9;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.localClippingEnabled = true; renderer.info.autoReset = false;

const tier = q.get('tier') || detectTier();
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.3, 1500);
const audio = createAudio({ seed: 1337 });
const dummy = new THREE.Scene();
const post = createPost(renderer, dummy, camera, { tier });
const dyn = createDynamicRes(post, { onTierDemote() { const order = ['high', 'medium', 'low']; const i = order.indexOf(post.tier); if (i < order.length - 1) post.setTier(order[i + 1]); } });
post.setScene = (s) => { post.composer.passes[0].scene = s; };

const view = new FightView({ renderer, post, camera, audio, host: ui, tier });
post.setScene(view.scene);

const resize = () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); post.setSize(innerWidth, innerHeight); view.resize(innerWidth, innerHeight); };
resize(); addEventListener('resize', resize);

// audio unlock on the first gesture (iOS needs touchend)
const unlock = () => { audio.unlock && audio.unlock().then((ok) => { if (ok) for (const ev of ['pointerdown', 'touchend', 'keydown']) removeEventListener(ev, unlock, true); }); };
for (const ev of ['pointerdown', 'touchend', 'keydown']) addEventListener(ev, unlock, true);
document.addEventListener('visibilitychange', () => { if (document.hidden) audio.music.stop && audio.music.stop(0.2); });

// ---------------------------------------------------------------- demo / slice
function makeDemoFight(o = {}) {
  const LM = globalThis.LM, D = globalThis.LM_D;
  const mk = (style, lvl, id, name) => LM.makeGlad({ style, lvl, id, name, r: LM.mulberry(id * 977 + lvl) });
  const a = mk(o.a || 'murmillo', o.lvl || 5, 1, o.an || 'Spartacus'), b = mk(o.b || 'thraex', o.lvl || 5, 2, o.bn || 'Crixus');
  if (o.ult2) a.ult2 = o.ult2;
  const A = [a], B = [b];
  if (o.team) { A.push(mk('retiarius', o.lvl || 5, 3, 'Oenomaus')); B.push(mk('hoplomachus', o.lvl || 5, 4, 'Gannicus')); }
  if (o.team >= 3) { A.push(mk('dimachaerus', o.lvl || 5, 5, 'Varro')); B.push(mk('murmillo', o.lvl || 5, 6, 'Castus')); }
  const ua = LM.mkUnits(A, 'A', {}), ub = LM.mkUnits(B, 'B', {});
  return LM.createFight(ua, ub, { autoA: o.auto !== false, hazards: o.haz ? 1 : 0 });
}

let last = performance.now(), clock = 0, frames = 0;
function loop(now) {
  if (q.get('manual')) { requestAnimationFrame(loop); last = now; return; }
  const dt = Math.min(0.1, (now - last) / 1000); last = now; clock += dt; frames++;
  dyn.tick(dt * 1000);
  view.frame(dt, clock);
  renderer.info.reset(); post.render(dt, clock);
  requestAnimationFrame(loop);
}

const api = window.__LM3D = {
  THREE, renderer, camera, post, view, audio, tier,
  stats() { const i = renderer.info; return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, tier: post.tier, scale: post.scale, frames, cam: [camera.position.x, camera.position.y, camera.position.z].map((v) => +v.toFixed(1)), fov: +camera.fov.toFixed(1), phase: view.phase, shot: view.dir.pose.shot }; },
  makeDemoFight,
  startDemo(o = {}) { const F = makeDemoFight(o); api.F = F; return view.start(F, o); },
  // deterministic stepping for screenshots (headless software GL is slow): advance N frames of dt
  advance(seconds, dt = 1 / 30) { const n = Math.round(seconds / dt); for (let i = 0; i < n; i++) { clock += dt; view.frame(dt, clock); } renderer.info.reset(); post.render(dt, clock); return api.stats(); },
};
requestAnimationFrame(loop);
setTimeout(() => { const b = document.getElementById('boot'); b.style.opacity = 0; setTimeout(() => b.remove(), 700); }, 200);
if (q.get('demo')) {
  const o = { a: q.get('a') || undefined, b: q.get('b') || undefined, lvl: +(q.get('lvl') || 5), team: +(q.get('team') || 0), auto: q.get('auto') !== '0', haz: q.get('haz') === '1' };
  api.startDemo(o);
}
