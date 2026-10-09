// Encore Island 3D lab: a tiny deterministic preview stage for model modules (same look patch, lights and tone mapping as the game).
//   <script type="importmap"> three -> ../../encore_island_3d/vendor/three.module.min.js, three/addons/ -> .../jsm/ </script>
//   <script type="module"> import { lab } from './lab.js'; lab({ build(V) { ...add things to V.scene...; return { update(dt, t) {} }; } }); </script>
// URL params: az, el, d (orbit), tx ty tz (target), fov, w h (canvas size), ground=0 to hide the pastel ground, shadows=0, detail=0|1|2.
// Automation: await window.__labReady; window.__labShot(seconds) steps the update() in 1/60 s ticks and renders once.
import * as THREE from 'three';
import { installLook, LOOK, Q, makeLightRig, DEFAULT_MOOD, lerpMood } from './kit.js';
import * as kit from './kit.js';

export async function lab(opts = {}) {
  const P = new URLSearchParams(location.search), num = (k, d) => (P.has(k) ? parseFloat(P.get(k)) : d);
  Q.detail = P.has('detail') ? +P.get('detail') : 2;
  installLook();
  const W = num('w', innerWidth), H = num('h', innerHeight);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = P.get('shadows') !== '0'; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement); document.body.style.margin = '0'; document.body.style.background = '#bfe8f4';
  const scene = new THREE.Scene(), mood = Object.assign({}, DEFAULT_MOOD, opts.mood || {});
  scene.background = new THREE.Color(mood.skyMid); scene.fog = new THREE.Fog(mood.fog, mood.fogNear, mood.fogFar);
  const camera = new THREE.PerspectiveCamera(num('fov', 38), W / H, 0.05, 600);
  const rig = makeLightRig(scene, { shadows: P.get('shadows') !== '0', size: 2048, extent: opts.extent || 14 }); rig.apply(mood); rig.follow(num('tx', 0), num('tz', 0));
  if (P.get('ground') !== '0' && opts.ground !== false) { const g = new THREE.Mesh(new THREE.CircleGeometry(opts.groundR || 30, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: opts.groundColor || 0xa4e59c, roughness: 1 })); g.receiveShadow = true; scene.add(g); }
  // V mirrors what the game engine hands to modules (see README.md), minus post-processing
  const world = new THREE.Group(), dyn = new THREE.Group(); world.name = 'world'; dyn.name = 'dyn'; scene.add(world, dyn);
  const blobs = new kit.BlobShadows(256); scene.add(blobs.mesh);
  const labels = { items: [], pill(txt, x, y, z, o) { this.items.push({ k: 'pill', txt, x, y, z, o }); }, price(v, x, y, z, o) { this.items.push({ k: 'price', v, x, y, z, o }); }, clear() { this.items.length = 0; } };
  const V = { THREE, kit, scene, camera, renderer, rig, Q, LOOK, mood, W: kit.W, world, dyn, blobs, labels, quality: { tier: 'high', detail: Q.detail, shadows: true, dpr: 1 }, mods: {}, lab: true, heightAt: () => 0 };
  const api = (await opts.build(V)) || {};
  const O = { az: num('az', opts.az ?? 25) * Math.PI / 180, el: num('el', opts.el ?? 22) * Math.PI / 180, d: num('d', opts.d ?? 9), t: new THREE.Vector3(num('tx', opts.tx ?? 0), num('ty', opts.ty ?? 1), num('tz', opts.tz ?? 0)) };
  function place() { camera.position.set(O.t.x + Math.sin(O.az) * Math.cos(O.el) * O.d, O.t.y + Math.sin(O.el) * O.d, O.t.z + Math.cos(O.az) * Math.cos(O.el) * O.d); camera.lookAt(O.t); }
  let T = 0, down = null;
  function step(dt) { T += dt; labels.clear(); LOOK.t.value = T; LOOK.beat.value = Math.max(0, 1 - (T % 0.5) * 3); if (api.update) api.update(dt, T); }
  function render() { place(); blobs.end && 0; renderer.render(scene, camera); }
  renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, az: O.az, el: O.el }; });
  addEventListener('pointerup', () => { down = null; });
  addEventListener('pointermove', (e) => { if (!down) return; O.az = down.az - (e.clientX - down.x) * 0.008; O.el = Math.max(0.02, Math.min(1.5, down.el + (e.clientY - down.y) * 0.006)); });
  addEventListener('wheel', (e) => { O.d = Math.max(1, Math.min(80, O.d * (1 + Math.sign(e.deltaY) * 0.08))); });
  window.__lab = { THREE, kit, V, scene, camera, renderer, api, O, step, render, info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures }) };
  window.__labShot = (secs = 0) => { for (let i = 0; i < Math.round(secs * 60); i++) step(1 / 60); render(); return window.__lab.info(); };
  window.__labReady = Promise.resolve(true);
  if (P.get('live') !== '0' && !P.has('shot')) { let last = performance.now(); (function loop(now) { requestAnimationFrame(loop); const dt = Math.min(0.05, (now - last) / 1000); last = now; step(dt); render(); })(last); }
  else render();
  return window.__lab;
}
