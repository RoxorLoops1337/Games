// 3D thumbnails for the UI: buildings, monument stages and villager portraits, rendered ONE AT A TIME into a small offscreen
// WebGL canvas, cached as data URLs, and released again when idle. If WebGL cannot be created, callers get the icon fallback.
import * as THREE from 'three';
import { BUILD, farmModel } from '../art/buildings.js';
import { monumentModel } from '../art/monument.js';
import { villagerModel, setPose } from '../art/characters.js';
import { icon } from './icons.js';

const SZ = 168;
let r = null, scene = null, cam = null, broken = false, running = false, idleT = 0;
const cache = new Map(), pending = new Set(), queue = [];
const V3 = new THREE.Vector3(), BX = new THREE.Box3(), SP = new THREE.Sphere();

function ensure() {
  if (r) return true; if (broken) return false;
  try {
    const cv = document.createElement('canvas'); cv.width = cv.height = SZ;
    r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    r.setPixelRatio(1); r.setSize(SZ, SZ, false); r.setClearColor(0x000000, 0); r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.92;
    scene = new THREE.Scene(); cam = new THREE.PerspectiveCamera(28, 1, 0.1, 200);
    scene.add(new THREE.HemisphereLight('#e4f4ff', '#9fd07e', 1.25));
    const sun = new THREE.DirectionalLight('#fff1d0', 2.5); sun.position.set(3, 5, 4); scene.add(sun);
    const fill = new THREE.DirectionalLight('#cdd6ff', 0.5); fill.position.set(-4, 2, -3); scene.add(fill);
    r.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); r = null; });
    return true;
  } catch (e) { broken = true; r = null; return false; }
}
function release() { if (!r || queue.length || running) return; try { r.dispose(); r.forceContextLoss(); } catch { /* ignore */ } r = null; scene = null; cam = null; }

const keyOf = (kind, a, b = '') => kind + '|' + a + '|' + b;
function make(kind, a, b) {
  if (kind === 'b') { const info = { id: 3, color: b || '#e8564a', lvl: 1 }; return a === 'farm' ? farmModel(info) : (BUILD[a] || BUILD.house)(info); }
  if (kind === 'm') return monumentModel(+a);
  if (kind === 'v') { const g = villagerModel(b || '#e8564a', +a, { tool: 'none', seed: +a }); try { setPose(g, 'idle', 0, 0); } catch { /* ignore */ } g.scale.setScalar(1.3); return g; }
  return null;
}
function frameFor(kind, g) {
  BX.setFromObject(g); BX.getBoundingSphere(SP); const c = SP.center, rad = SP.radius;
  const h = BX.max.y - BX.min.y; let yaw = 0.72, pitch = 0.5, R = rad * 0.8, cy = c.y;
  if (kind === 'v') { cy = BX.max.y - 0.26 * h; R = 0.4 * h; yaw = 0.3; pitch = 0.08; }
  if (kind === 'm') { pitch = 0.42; yaw = 0.55; R = rad * 0.95; cy = c.y; }
  const dist = R / Math.sin((cam.fov * Math.PI) / 360);
  cam.position.set(c.x + Math.sin(yaw) * Math.cos(pitch) * dist, cy + Math.sin(pitch) * dist, c.z + Math.cos(yaw) * Math.cos(pitch) * dist); cam.lookAt(c.x, cy, c.z); cam.updateMatrixWorld();
}
function step() {
  if (running) return; const job = queue.shift(); if (!job) { clearTimeout(idleT); idleT = setTimeout(release, 20000); return; }
  running = true; const { key, kind, a, b } = job; let url = null;
  try {
    if (ensure()) {
      const g = make(kind, a, b);
      if (g) {
        scene.add(g); frameFor(kind, g); r.render(scene, cam); url = r.domElement.toDataURL('image/png'); scene.remove(g);
        g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      }
    }
  } catch (e) { url = null; }
  cache.set(key, url || 'fail'); pending.delete(key); running = false;
  if (url) for (const el of document.querySelectorAll(`[data-th="${CSS.escape(key)}"]`)) { el.innerHTML = `<img alt="" src="${url}">`; }
  setTimeout(step, 24);
}
/** queue a render (no-op when cached or already queued) */
export function want(kind, a, b = '') {
  const key = keyOf(kind, a, b); if (cache.has(key) || pending.has(key) || broken) return key;
  pending.add(key); queue.push({ key, kind, a, b }); clearTimeout(idleT); setTimeout(step, 30); return key;
}
/** html for a thumbnail inside a .th bubble: the image when ready, else the fallback icon (patched in later) */
export function thumbHtml(kind, a, b = '', fallbackIcon = 'house', size = 40) {
  const key = want(kind, a, b), hit = cache.get(key);
  if (hit && hit !== 'fail') return `<span data-th="${key}"><img alt="" src="${hit}"></span>`;
  return `<span data-th="${key}">${icon(fallbackIcon, size)}</span>`;
}
export const thumbUrl = (kind, a, b = '') => { const h = cache.get(keyOf(kind, a, b)); return h && h !== 'fail' ? h : null; };
export const thumbsWork = () => !broken;
