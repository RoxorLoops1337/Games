// Lab stage: the game's lighting and camera in a tiny page, so art modules can be reviewed without running the game.
// Use: const st = mountStage(); st.add(group, x, z); st.ready();  Camera via URL: ?yaw=0.4&pitch=0.7&dist=8&x=0&z=0&night=0&bg=sky
import * as THREE from 'three';
export function mountStage({ width = innerWidth, height = innerHeight } = {}) {
  const q = new URLSearchParams(location.search), num = (k, d) => (q.has(k) ? +q.get(k) : d);
  const canvas = document.createElement('canvas'); canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%'; document.body.appendChild(canvas); document.body.style.margin = 0;
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true }); r.setPixelRatio(1); r.setSize(width, height, false); r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
  const scene = new THREE.Scene(); const night = num('night', 0);
  scene.background = new THREE.Color(night ? '#3a5496' : '#a9dcf3');
  scene.add(new THREE.HemisphereLight(night ? '#8aa0e0' : '#dff3ff', '#7da05a', night ? 1.1 : 1.05));
  const sun = new THREE.DirectionalLight(night ? '#9db4ff' : '#fff1d0', night ? 1.0 : 2.4); sun.position.set(30, 50, 20); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 140; sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.06; scene.add(sun, sun.target);
  if (q.get('ground') !== '0') { const g = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshStandardMaterial({ color: '#9ad464', roughness: 1 })); g.rotation.x = -Math.PI / 2; g.receiveShadow = true; scene.add(g); }
  const cam = new THREE.PerspectiveCamera(42, width / height, 0.1, 400);
  const L = { x: num('x', 0), z: num('z', 0), y: num('y', 0), dist: num('dist', 12), yaw: num('yaw', 0.5), pitch: num('pitch', 0.7) };
  const place = () => { const cp = Math.cos(L.pitch), sp = Math.sin(L.pitch); cam.position.set(L.x + Math.sin(L.yaw) * cp * L.dist, L.y + sp * L.dist, L.z + Math.cos(L.yaw) * cp * L.dist); cam.lookAt(L.x, L.y, L.z); sun.target.position.set(L.x, 0, L.z); sun.position.set(L.x + 30, 50, L.z + 20); };
  let drag = null; canvas.onpointerdown = (e) => { drag = [e.clientX, e.clientY]; }; addEventListener('pointerup', () => { drag = null; });
  addEventListener('pointermove', (e) => { if (!drag) return; L.yaw -= (e.clientX - drag[0]) * 0.008; L.pitch = Math.max(0.1, Math.min(1.5, L.pitch + (e.clientY - drag[1]) * 0.006)); drag = [e.clientX, e.clientY]; });
  addEventListener('wheel', (e) => { L.dist = Math.max(2, Math.min(80, L.dist * Math.exp(e.deltaY * 0.001))); });
  const clock = new THREE.Clock(), ticks = [];
  const api = { THREE, scene, cam, renderer: r, look: L, sun,
    add(obj, x = 0, z = 0, y = 0) { obj.position.set(x, y, z); scene.add(obj); return obj; },
    /** callback(dt, t) every frame, for animation previews */ onTick(f) { ticks.push(f); },
    /** lay objects out in a grid: items = [{ obj, label }] */ grid(items, cols = 5, gap = 4) { items.forEach((it, i) => { const c = i % cols, rw = Math.floor(i / cols); this.add(it.obj || it, (c - (cols - 1) / 2) * gap, (rw - (Math.ceil(items.length / cols) - 1) / 2) * gap); }); L.dist = Math.max(L.dist, cols * gap * 0.9); },
    ready() { window.__ready = true; } };
  r.setAnimationLoop(() => { const dt = Math.min(0.1, clock.getDelta()); for (const f of ticks) f(dt, clock.elapsedTime); place(); r.render(scene, cam); });
  place(); return api;
}
