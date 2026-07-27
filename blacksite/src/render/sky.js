// STUB — owned by the sky/IBL agent.
import * as THREE from "three";
export function createSky(G, engine){
  const scene = engine.scene;
  scene.background = new THREE.Color(0x1b2028);
  scene.fog = new THREE.FogExp2(0x1b2028, 0.012);
  const sunDir = new THREE.Vector3(-0.42, 0.34, -0.62).normalize();
  return { sunDir, envMap:null, sunColor:new THREE.Color(1,0.86,0.68), update(){} };
}
