// Park3D entry. Builds renderer, scene, camera and the modules below, runs the loop, exposes window.Park3D for the game and for tests.
//   Park3D.init(canvasOrSelector, { look, quality, time, seed, onSpot }) -> Promise<api>
//   api: { setLook(look), setTime(t), setQuality(q), teleport(spotId), activate(id), player, scene, camera, renderer, stats(), dispose(), ready:true }
import * as THREE from 'three';
import * as kit from './kit.js';
import { PAL } from './palette.js';
import { buildTerrain } from './terrain.js';
import { buildFlora } from './flora.js';
import { createCharacter, createNPC } from './characters.js';
import { buildLighting } from './lighting.js';
import { buildSpots } from './spots.js';
import { createControls } from './controls.js';

const DEFAULT_LOOK = { name: 'Tay', body: 'neutral', skin: '#c68b5e', hair: { style: 'twists', color: '#1a1420' }, hat: { id: 'fitted', color: '#17141f' }, top: { id: 'oversized', color: '#ffd23f', color2: '#e63946' }, bottom: { id: 'camo', color: '#5a6b3a' }, shoes: { id: 'retro', color: '#f7f2e8' } };

// a half-finished module must never blank the whole scene: build each part in a guard and fall back to an empty stub
function safe(name, fn, fallback) { try { return fn(); } catch (e) { console.error('[park3d] ' + name + ' failed: ' + (e && e.stack || e)); return fallback; } }
const NOP = () => {};

async function init(target, opts) {
  opts = opts || {};
  const canvas = typeof target === 'string' ? document.querySelector(target) : target;
  const q = opts.quality || (Math.min(window.devicePixelRatio || 1, 3) >= 2.5 ? 'med' : 'high');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserve });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(38, 9 / 16, 0.5, 200);
  const events = kit.emitter(); const ctx = { THREE, kit, PAL, scene, camera, renderer, events, rng: kit.rng(opts.seed || 1337), quality: q, canvas };
  const terrain = safe('terrain', () => buildTerrain(ctx), { group: new THREE.Group(), bounds: { minX: -17, maxX: 17, minZ: -27, maxZ: 27 }, blocked: () => false, anchors: { start: { x: 0, z: 10, rot: Math.PI }, buskSpot: { x: 8, z: -8, rot: 0 }, bench: { x: -9, z: -4, rot: 0 }, gate: { x: 0, z: 26, rot: 0 }, runStart: { x: 12, z: 14, rot: 0 }, fountain: { x: 0, z: 0, rot: 0 }, graffiti: { x: 0, z: -26, rot: 0 }, flyers: { x: 4, z: 22, rot: 0 }, lamps: [] } });
  scene.add(terrain.group);
  const flora = safe('flora', () => buildFlora(ctx, terrain), { group: new THREE.Group(), update: NOP }); scene.add(flora.group);
  const lighting = safe('lighting', () => buildLighting(ctx, terrain), { group: new THREE.Group(), setTimeOfDay: NOP, update: NOP }); scene.add(lighting.group);
  const spots = safe('spots', () => buildSpots(ctx, terrain), { group: new THREE.Group(), spots: [], update: NOP, nearest: () => null, activate: NOP }); scene.add(spots.group);
  const player = safe('characters', () => createCharacter(ctx, opts.look || DEFAULT_LOOK), { object: new THREE.Group(), setLook: NOP, play: NOP, update: NOP, anchors: {}, height: 1.6 }); scene.add(player.object);
  const npcs = ['beeamgee'].map((id) => { const n = safe('npc ' + id, () => createNPC(ctx, id), { object: new THREE.Group(), update: NOP }); scene.add(n.object); return n; });
  const controls = safe('controls', () => createControls(ctx, { player, terrain, spots, dom: canvas.parentElement || document.body }), { update: NOP });
  if (opts.onSpot) events.on('spot', opts.onSpot);
  if (opts.time !== undefined && lighting.setTimeOfDay) lighting.setTimeOfDay(opts.time);

  function resize() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight, dpr = Math.min(window.devicePixelRatio || 1, ctx.quality === 'high' ? 2 : 1.5);
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); if (lighting.resize) lighting.resize(w, h, dpr);
  }
  window.addEventListener('resize', resize); resize();

  let last = performance.now(), t = 0, frames = 0, fpsT = 0, fps = 60, running = true, raf = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame); if (!running) return; const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; t += dt;
    controls.update(dt, t); player.update(dt, t); npcs.forEach((n) => n.update(dt, t)); flora.update(dt, t); if (terrain.update) terrain.update(dt, t); spots.update(dt, t, player.object.position); lighting.update(dt, t);
    if (lighting.render) lighting.render(); else renderer.render(scene, camera);
    frames++; fpsT += dt; if (fpsT >= 0.5) { fps = frames / fpsT; frames = 0; fpsT = 0; }
  }
  raf = requestAnimationFrame(frame);

  const api = { ready: true, scene, camera, renderer, player, terrain, spots, lighting, controls, ctx,
    setLook(l) { player.setLook(l); }, setTime(v) { lighting.setTimeOfDay(v); }, setQuality(v) { ctx.quality = v; if (lighting.setQuality) lighting.setQuality(v); resize(); },
    teleport(id) { const s = spots.spots.find((x) => x.id === id); if (s) { const px = s.x + 1.5, pz = s.z + 1.5; if (controls && controls.teleportTo) controls.teleportTo(px, pz); else player.object.position.set(px, 0, pz); } }, activate(id) { spots.activate(id); },
    stats() { return { fps: Math.round(fps), calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures }; },
    pause(v) { running = !v; }, dispose() { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); renderer.dispose(); } };
  window.__park = api; return api;
}
const Park3D = { init, THREE, kit, PAL };
window.Park3D = Park3D;
export default Park3D;
