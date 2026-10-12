// lab_boot.js : tiny shared harness for the lab pages (renderer, post, scripted camera, screenshot hook).
import * as THREE from 'three';
import { createPost, createDynamicRes, TIERS } from './post_ref.js';

export function bootLab({ tier = 'high' } = {}) {
  const q = new URLSearchParams(location.search);
  tier = q.get('tier') || tier;
  const canvas = document.createElement('canvas'); document.body.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled = true; renderer.info.autoReset = false;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.3, 1500);
  const post = createPost(renderer, scene, camera, { tier });
  const dyn = createDynamicRes(post);
  const resize = () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); post.setSize(innerWidth, innerHeight); };
  resize(); addEventListener('resize', resize);
  const lab = { q, tier, renderer, scene, camera, post, dyn, T: TIERS[tier], t: 0 };
  lab.stats = () => { const i = renderer.info; return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs ? i.programs.length : 0 }; };
  /** frame(t, dt) must update scene + camera; this renders through the composer. */
  lab.run = (frame, shotFrames = 2) => {
    let last = performance.now(), t0 = 0;
    const step = (t, dt) => { frame(t, dt); renderer.info.reset(); post.render(dt, t); };
    window.__labShot = async (secs) => {
      const base = secs || 1.5; lab.t = base;
      for (let i = 0; i < shotFrames; i++) step(base + i * 0.016, 0.016);
      // scene-only numbers (no post passes)
      renderer.info.reset(); renderer.render(scene, camera); const sceneOnly = lab.stats();
      renderer.info.reset(); post.render(0.016, base + 0.05); const total = lab.stats();
      window.__stat = { scene: sceneOnly, withPost: total, tier: lab.tier };
      return window.__stat;
    };
    window.__labReady = Promise.resolve();
    if (!navigator.webdriver) {
      const tick = (now) => { const dt = Math.min(0.05, (now - last) / 1000); last = now; lab.t += dt; step(lab.t, dt); dyn.tick(dt * 1000); requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }
  };
  return lab;
}
