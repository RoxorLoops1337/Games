// The title screen as a little 3D diorama: a floating island of grass blocks with trees, the player's blockhead on a
// turntable, and the same sky as the game (cube sun, voxel clouds, hills).
import * as THREE from 'three';
import { SEA } from '../../shared/data.js';
import { Sky, FOV } from './sky.js';
import { buildPerson, setHeld, poseCharacter, newTint } from './entities.js';
import { I } from '../../shared/data.js';

export class Menu3D {
  constructor(atlas) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.5, 600);
    this.scene.add(this.camera);
    this.sky = new Sky(this.scene, this.camera);
    this.atlas = atlas;
    this.g = { time: 150, cam: { x: 0, y: SEA - 4 }, t: 0, biome: 'plains', weather: { k: 0 } };
    this.tint = newTint();
    this.person = null; this.lookKey = '';
    this.buildIsland();
  }
  boxGeo(top, side, bottom) {
    const g = new THREE.BoxGeometry(1, 1, 1), uv = g.attributes.uv;
    const tiles = [side, side, top, bottom, side, side]; // +x -x +y -y +z -z
    for (let f = 0; f < 6; f++) { const t = tiles[f]; const q = [[t[0], t[3]], [t[2], t[3]], [t[0], t[1]], [t[2], t[1]]]; for (let v = 0; v < 4; v++) uv.setXY(f * 4 + v, q[v][0], q[v][1]); }
    const shade = [0.78, 0.7, 1.05, 0.5, 0.95, 0.72], col = new Float32Array(24 * 3);
    for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = (f * 4 + v) * 3; col[i] = col[i + 1] = col[i + 2] = shade[f]; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }
  buildIsland() {
    const a = this.atlas, mat = new THREE.MeshBasicMaterial({ map: a.texture, vertexColors: true });
    const grass = this.boxGeo(a.extra('grass_top'), a.tile(2 - 1 + 0, 0), a.tile(2, 0)); // placeholder replaced below
    const ids = { grass: 1, dirt: 2, stone: 3, log: 11, leaves: 12 };
    const make = (top, side, bottom, cells) => {
      const m = new THREE.InstancedMesh(this.boxGeo(top, side, bottom), mat, cells.length);
      const o = new THREE.Object3D();
      cells.forEach((c, i) => { o.position.set(...c); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
      m.frustumCulled = false; this.scene.add(m); return m;
    };
    const top = [], dirt = [], stone = [];
    const surf = -SEA;
    for (let x = -11; x <= 11; x++) for (let z = -3; z <= 3; z++) {
      const edge = Math.abs(x) > 8 ? 1 : 0;
      const h = (Math.abs(x) > 9 ? -1 : 0) + ((x * 7 + z * 3) % 5 === 0 ? 0 : 0);
      top.push([x, surf - 0.5 + h * 0, z + 0.5]);
      void edge;
      for (let d = 1; d <= 3; d++) if (Math.abs(x) <= 11 - d && Math.abs(z) <= 3) dirt.push([x, surf - 0.5 - d, z + 0.5]);
      for (let d = 4; d <= 6; d++) if (Math.abs(x) <= 11 - d) stone.push([x, surf - 0.5 - d, z + 0.5]);
    }
    make(a.extra('grass_top'), a.tile(1, 0), a.tile(2, 0), top);
    make(a.tile(2, 0), a.tile(2, 0), a.tile(2, 0), dirt);
    make(a.tile(3, 0), a.tile(3, 0), a.tile(3, 0), stone);
    // trees
    const logs = [], leaves = [];
    for (const [tx, tz, h] of [[-8, -1, 5], [8, 0, 6], [-5, -3, 4], [6, -3, 5], [-10, 2, 4]]) {
      for (let k = 0; k < h; k++) logs.push([tx, surf + 0.5 + k, tz + 0.5]);
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = 0; dy < 3; dy++) if (Math.abs(dx) + Math.abs(dz) + dy < 4 + (dy === 2 ? -1 : 0) && !(dx === 0 && dz === 0 && dy < 1)) leaves.push([tx + dx, surf + h - 0.5 + dy + 0.5, tz + dz + 0.5]);
    }
    make(a.extra('log_end'), a.tile(ids.log, 0), a.extra('log_end'), logs);
    make(a.tile(ids.leaves, 0), a.tile(ids.leaves, 0), a.tile(ids.leaves, 0), leaves);
    mat.alphaTest = 0.5;
    // a few flowers and a torch
    this.flowers = [];
    for (const [fx, fz, c] of [[-2, 2, 0xe04a5a], [3, 2, 0xf2d33c], [-4, 1, 0xf2d33c], [5, 1, 0xe04a5a], [1, -2, 0xffffff]]) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), new THREE.MeshBasicMaterial({ color: 0x3f8a2a })); st.position.set(fx, surf + 0.25, fz + 0.5);
      const hd = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshBasicMaterial({ color: c })); hd.position.set(fx, surf + 0.6, fz + 0.5);
      this.scene.add(st, hd);
    }
  }
  setLook(look) {
    const key = JSON.stringify(look);
    if (key === this.lookKey) return;
    this.lookKey = key;
    if (this.person) this.scene.remove(this.person.root);
    this.person = buildPerson({ skin: 0, eyes: 0, hair: 0, hairStyle: 1, shirt: 4, pants: 2, ...look }, this.tint, this.atlas);
    setHeld(this.person, I.wood_pickaxe);
    this.person.root.position.set(0, -SEA, 0.5); this.person.root.scale.setScalar(1.25);
    this.scene.add(this.person.root);
  }
  frame(renderer, w, h, t, look) {
    this.setLook(look);
    this.g.t = t; this.g.time = 100 + t * 3.5;
    this.camera.aspect = w / h;
    const sway = Math.sin(t * 0.25) * 3;
    this.camera.position.set(sway, -SEA + 3.2, 17); this.camera.lookAt(sway * 0.3, -SEA + 2.6, 0);
    this.camera.updateProjectionMatrix(); this.camera.updateMatrixWorld();
    this.sky.update(this.g, w / h);
    poseCharacter(this.person, { dir: 1, t, t2: t, speed: 0, air: false, climb: false, swing: (Math.sin(t * 1.4) > 0.8 ? 0.6 : 0), dead: false, hurt: false, blink: Math.sin(t * 0.9) > 0.97, vy: 0 }, 0.016);
    this.person.root.rotation.y = 0.55 + Math.sin(t * 0.5) * 0.5;
    renderer.render(this.scene, this.camera);
  }
}
