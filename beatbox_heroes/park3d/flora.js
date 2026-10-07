// FLORA module (Environment Artist B). Owns: trees (3 species, instanced), bushes, hedges, flowers, grass tufts, fallen leaves, planters, skyline backdrop
// (low-poly buildings with emissive windows), clouds, pigeons and other animated life. CONTRACT: buildFlora(ctx, terrain) -> { group, update(dt,t) }.
// Use terrain.blocked() / terrain.anchors to keep clear of paths, spots and props. Budget: <= 30k triangles for the whole module, <= 12 draw calls.
import { THREE } from './kit.js';
export function buildFlora(ctx, terrain) { const group = new THREE.Group(); return { group, update() {} }; }
