// STUB — owned by the viewmodel agent.
import * as THREE from "three";
export function createViewmodel(G, engine, materials){
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.07,0.09,0.55), materials.get("dark"));
  body.position.set(0.13,-0.11,-0.34);
  g.add(body);
  engine.view.add(g);
  return { group:g, update(){
    const c = engine.viewCam;
    g.position.copy(c.position); g.quaternion.copy(c.quaternion);
  } };
}
