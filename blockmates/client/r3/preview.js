// A tiny offscreen 3D view of one blockhead: the turntable in the character editor and the portraits in the player list.
import * as THREE from 'three';
import { buildPerson, setArmor, setHeld, poseCharacter, newTint } from './entities.js';

let shared = null;
export class Preview {
  constructor(w = 220, h = 300) {
    this.canvas = document.createElement('canvas'); this.canvas.width = w; this.canvas.height = h;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1); this.renderer.setSize(w, h, false); this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(26, w / h, 0.1, 60);
    this.camera.position.set(0, 1.05, 6.4); this.camera.lookAt(0, 0.95, 0);
    this.tint = newTint(); this.rec = null; this.key = '';
  }
  set(look, armor = [0, 0, 0], held = 0) {
    const key = JSON.stringify(look);
    if (key !== this.key) {
      if (this.rec) this.scene.remove(this.rec.root);
      this.rec = buildPerson({ skin: 0, eyes: 0, hair: 0, hairStyle: 1, shirt: 4, pants: 2, ...look }, this.tint, null);
      this.scene.add(this.rec.root); this.key = key;
    }
    setArmor(this.rec, armor); setHeld(this.rec, held);
  }
  render(yaw, t = 0) {
    poseCharacter(this.rec, { dir: 1, t, t2: t, speed: 0, air: false, climb: false, swing: 0, dead: false, hurt: false, blink: Math.sin(t * 0.9) > 0.97, vy: 0 }, 1);
    this.rec.root.rotation.y = yaw;
    this.renderer.render(this.scene, this.camera);
    return this.canvas;
  }
}
export function getPreview() { if (!shared) shared = new Preview(); return shared; }

// small cached portraits for lists
const portraits = new Map();
let small = null;
export function portraitURL(look) {
  const key = JSON.stringify(look);
  let u = portraits.get(key);
  if (!u) {
    if (!small) small = new Preview(104, 136);
    small.set(look); small.render(0.7, 0);
    u = small.canvas.toDataURL('image/png'); portraits.set(key, u);
  }
  return u;
}
