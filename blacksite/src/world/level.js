// STUB — owned by the level agent.
import * as THREE from "three";
import { makeBox, boxFromCenter, buildGrid } from "./collision.js";
import { SURFACE } from "../core/constants.js";
export function buildLevel(G, engine, materials){
  const group = new THREE.Group();
  const statics = [];
  const add = (box, mat) => {
    statics.push(box);
    const sx=box.max.x-box.min.x, sy=box.max.y-box.min.y, sz=box.max.z-box.min.z;
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz), materials.get(mat));
    m.position.set((box.min.x+box.max.x)/2,(box.min.y+box.max.y)/2,(box.min.z+box.max.z)/2);
    m.castShadow = sy > 0.6; m.receiveShadow = true;
    group.add(m);
  };
  add(boxFromCenter(0,-1,0, 120,2,120, SURFACE.CONCRETE), "concrete");
  for (let i=0;i<14;i++){
    const a = i/14*Math.PI*2, r = 12+((i*7)%14);
    add(boxFromCenter(Math.cos(a)*r, 1.2, Math.sin(a)*r, 3, 2.4, 1.2, SURFACE.CONCRETE), "concrete");
  }
  add(boxFromCenter(0,3,-26, 40,6,1, SURFACE.CONCRETE), "concrete");
  engine.scene.add(group);
  G.world.statics = statics;
  G.world.grid = buildGrid(statics);
  G.world.spawns = [{x:14,y:1.7,z:14},{x:-14,y:1.7,z:14},{x:0,y:1.7,z:-20}];
  return { group, statics, spawn:{x:0,y:1.72,z:8}, spawnYaw:0, update(){} };
}
