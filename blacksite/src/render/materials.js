// STUB — owned by the materials agent.
import * as THREE from "three";
export async function createMaterials(G, engine){
  const cache = new Map();
  const mk = (c, r, m) => new THREE.MeshStandardMaterial({ color:c, roughness:r, metalness:m });
  const defs = {
    concrete:[0x8d8880,0.92,0.0], metal:[0x6e747a,0.45,0.9], rust:[0x7a4a2c,0.82,0.5],
    sand:[0xbfa274,0.98,0.0], wood:[0x7a5a38,0.86,0.0], glass:[0x9fc4d0,0.08,0.0],
    paint:[0xc8562a,0.62,0.1], dark:[0x2a2d33,0.8,0.2], flesh:[0x9a5b4c,0.75,0.0],
  };
  for (const k in defs) cache.set(k, mk(...defs[k]));
  return { get(n){ return cache.get(n) || cache.get("concrete"); }, cache, update(){} };
}
