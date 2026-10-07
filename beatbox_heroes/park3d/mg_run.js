// Mini game stub (run). Replace with the real one, see MINI_PLAN.md.
import { THREE } from './kit.js';
export function createRun(ctx, opts) { const group = new THREE.Group(); ctx.camera.position.set(0, 6, 10); ctx.camera.lookAt(0, 0, 0); return { group, update() {}, start() {} }; }
