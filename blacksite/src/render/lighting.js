// STUB — owned by the lighting agent.
import * as THREE from "three";
export function createLighting(G, engine, sky){
  const sun = new THREE.DirectionalLight(0xffd9b0, 3.0);
  sun.position.copy(sky.sunDir).multiplyScalar(60);
  sun.castShadow = engine.tier.shadow > 0;
  if (sun.shadow) {
    sun.shadow.mapSize.set(engine.tier.shadow, engine.tier.shadow);
    const d = 42; Object.assign(sun.shadow.camera, {left:-d,right:d,top:d,bottom:-d,near:1,far:180});
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.035;
    sun.shadow.camera.updateProjectionMatrix();
  }
  engine.scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0x8fb4d8, 0x37312a, 0.65);
  engine.scene.add(hemi);
  return { sun, hemi, update(){
    const p = G.player.pos;
    sun.target.position.set(p.x, 0, p.z);
    sun.position.set(p.x + sky.sunDir.x*60, sky.sunDir.y*60, p.z + sky.sunDir.z*60);
    sun.target.updateMatrixWorld();
  } };
}
