// Minimal hub used until js/hub.js (full 3D school with buildings) is available: sky, light, courtyard, slow camera drift.
import * as THREE from 'three';
import { createSky, createLightRig, applyTOD, TOD } from './sky.js';
import { createLudus } from './env_ludus.js';

export function createHubStub({ renderer, camera, tier = 'high' }) {
  const scene = new THREE.Scene();
  const sky = createSky(); scene.add(sky.mesh);
  const rig = createLightRig(scene, { shadowSize: tier === 'low' ? 1024 : 2048, shadowRadius: 40, shadowCenter: new THREE.Vector3(0, 0, 0), far: 300 });
  const ludus = createLudus({ density: tier === 'low' ? 0.5 : 1 }); scene.add(ludus.group);
  applyTOD(Object.assign({}, TOD.golden), { rig, scene, sky, renderer, nightUniforms: [{ set value(v) { ludus.setNight(v); } }] });
  let t0 = 0;
  const api = {
    scene, onPick: null,
    enter() { camera.fov = 42; camera.updateProjectionMatrix(); },
    exit() {}, refresh() {}, resize() {}, pick() { return null; }, focusHome() {},
    update(dt, t) {
      t0 += dt; const a = t0 * 0.05 + 0.6;
      camera.position.set(Math.sin(a) * 26, 12, 24 + Math.cos(a) * 6); camera.lookAt(0, 1.5, 0); camera.updateMatrixWorld();
      sky.update(camera, t); ludus.update(t, dt, camera);
    },
  };
  return api;
}
