// The sky of the 3D world: gradient backdrop, stars, a cube sun and moon, voxel clouds and layered voxel hills.
import * as THREE from 'three';
import { SEA } from '../../shared/data.js';
import { daylight, phaseOf, clamp } from '../../shared/util.js';
import { skyColors } from '../render.js';

const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const BIOME_TINT = { tundra: [200, 220, 240], forest: [58, 130, 70], plains: [110, 176, 80], desert: [214, 186, 120], mountains: [128, 134, 150] };
const FOV = 42;

export class Sky {
  constructor(scene, camera) {
    this.scene = scene; this.camera = camera;
    // backdrop: a full screen quad drawn first, no depth
    const gm = new THREE.ShaderMaterial({
      uniforms: { top: { value: new THREE.Color() }, bot: { value: new THREE.Color() }, dark: { value: 0 } },
      vertexShader: 'varying float vY; void main(){ vY = position.y * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.9999, 1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bot; uniform float dark; varying float vY; void main(){ vec3 c = mix(bot, top, pow(vY, 1.2)); gl_FragColor = vec4(c * (1.0 - dark), 1.0); }',
      depthTest: false, depthWrite: false,
    });
    this.back = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), gm); this.back.renderOrder = -100; this.back.frustumCulled = false; scene.add(this.back);
    this.group = new THREE.Group(); camera.add(this.group); // sky objects ride with the camera
    // stars
    const n = 160, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() * 2 - 1) * 1.1; pos[i * 3 + 1] = Math.random() * 1.0 - 0.1; pos[i * 3 + 2] = 0; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starBase = pos.slice();
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false }));
    this.stars.frustumCulled = false; this.group.add(this.stars);
    // sun and moon are cubes with a soft glow card
    const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const r = g.createRadialGradient(64, 64, 4, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
    this.sun = new THREE.Group(); this.moon = new THREE.Group();
    const sunCube = new THREE.Mesh(new THREE.BoxGeometry(9, 9, 9), new THREE.MeshBasicMaterial({ color: 0xfff2a0 }));
    const sunGlow = new THREE.Mesh(new THREE.PlaneGeometry(46, 46), new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffe28a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
    this.sun.add(sunGlow, sunCube); this.sunCube = sunCube;
    const moonCube = new THREE.Mesh(new THREE.BoxGeometry(7, 7, 7), new THREE.MeshBasicMaterial({ color: 0xe8ecff }));
    for (const [x, y] of [[-1.4, 1.2], [1.6, -1.2], [0.4, 2]]) { const cr = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.8, 0.4), new THREE.MeshBasicMaterial({ color: 0xaab2d8 })); cr.position.set(x, y, 3.6); moonCube.add(cr); }
    const moonGlow = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ map: glowTex, color: 0x9fb2ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.45 }));
    this.moon.add(moonGlow, moonCube); this.moonCube = moonCube;
    this.group.add(this.sun, this.moon);
    // voxel clouds
    this.cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
    this.clouds = [];
    const bx = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 12; i++) {
      const cl = new THREE.Group(); const cubes = 5 + (i * 3) % 5;
      for (let k = 0; k < cubes; k++) { const m = new THREE.Mesh(bx, this.cloudMat); m.scale.set(4 + ((k * 7 + i) % 4), 1.6 + (k % 3) * 0.6, 3 + (k % 2) * 2); m.position.set(k * 3.2 - cubes * 1.6, ((k * 5) % 3) * 0.5, ((k * 3) % 3) * 0.8); cl.add(m); }
      cl.userData = { base: i * 31 + ((i * 17) % 23), y: 8 + (i * 7) % 14, z: -26 - (i % 4) * 7, sp: 1.1 + (i % 3) * 0.5 };
      scene.add(cl); this.clouds.push(cl);
    }
    // hills: instanced columns in three depth layers
    this.hills = [];
    const colGeo = new THREE.BoxGeometry(1, 1, 1);
    [[-12, 2.4, 0.12], [-26, 3.4, 0.3], [-46, 4.8, 0.55]].forEach(([z, w, fog], li) => {
      const count = 110;
      const m = new THREE.InstancedMesh(colGeo, new THREE.MeshBasicMaterial({ color: 0x808080 }), count);
      m.frustumCulled = false; m.userData = { z, w, fog, li, count, lastX: 1e9 }; scene.add(m); this.hills.push(m);
    });
    this.tmp = new THREE.Object3D();
    this.biome = 'plains';
  }

  update(G, aspect) {
    const dl = daylight(G.time), sunH = phaseOf(G.time);
    const [top, bot] = skyColors(G.time);
    const gm = this.back.material.uniforms;
    gm.top.value.setRGB(top[0] / 255, top[1] / 255, top[2] / 255); gm.bot.value.setRGB(bot[0] / 255, bot[1] / 255, bot[2] / 255);
    const depth = clamp((G.cam.y - SEA) / 30, 0, 1);
    gm.dark.value = depth * 0.95;
    const fov = FOV * Math.PI / 180, Z = 120, halfH = Z * Math.tan(fov / 2), halfW = halfH * aspect;
    // sun and moon travel along an arc
    const ph = sunH * Math.PI * 2;
    const place = (obj, ang) => { obj.position.set(-Math.cos(ang) * 0.9 * halfW, -0.24 * halfH + Math.sin(ang) * 1.0 * halfH, -Z); obj.rotation.set(0.3, ang * 2, 0); obj.visible = obj.position.y > -halfH * 1.1 && depth < 0.9; };
    place(this.sun, ph); place(this.moon, ph + Math.PI);
    // stars fade in at night
    const na = clamp(1 - dl * 1.6, 0, 1);
    this.stars.material.opacity = na * (0.7 + 0.3 * Math.sin(G.t * 3));
    const sp = this.stars.geometry.attributes.position;
    for (let i = 0; i < sp.count; i++) sp.setXYZ(i, this.starBase[i * 3] * halfW, this.starBase[i * 3 + 1] * halfH, -Z - 10);
    sp.needsUpdate = true; this.stars.visible = na > 0.02 && depth < 0.9;
    // clouds
    const camX = G.cam.x, cy = -G.cam.y;
    this.cloudMat.color.setRGB(0.55 + 0.45 * dl, 0.58 + 0.42 * dl, 0.7 + 0.3 * dl); this.cloudMat.opacity = 0.35 + 0.6 * dl + 0.1;
    for (const c of this.clouds) {
      const u = c.userData, wx = u.base * 20 + G.t * u.sp, span = 300;
      const x = camX + ((((wx - camX) % span) + span * 1.5) % span) - span / 2;
      c.position.set(x, -(SEA - u.y) , u.z); c.visible = depth < 0.9 && G.cam.y < SEA + 40;
      void cy;
    }
    // hills
    this.biome = G.biome || this.biome;
    const tint = BIOME_TINT[this.biome] || BIOME_TINT.plains;
    for (const m of this.hills) {
      const u = m.userData;
      m.visible = depth < 0.9;
      if (!m.visible) continue;
      const fogC = mixc(mixc(tint, [30, 40, 70], 1 - dl), bot, u.fog);
      m.material.color.setRGB(fogC[0] / 255, fogC[1] / 255, fogC[2] / 255);
      const step = u.w, x0 = Math.floor((camX - u.count * step / 2 * 0.9) / step) * step;
      if (m.userData.lastX === x0 && m.userData.lastBiome === this.biome) continue;
      m.userData.lastX = x0; m.userData.lastBiome = this.biome;
      const mount = this.biome === 'mountains' ? 1.9 : 1;
      for (let i = 0; i < u.count; i++) {
        const wx = x0 + i * step, k = wx / 5 + u.li * 40;
        const hh = (Math.sin(k * 0.37 + u.li * 2) * 1.6 + Math.sin(k * 0.11 + u.li) * 3.2 + Math.sin(k * 0.9 + u.li * 5) * 0.6 + 4.2 + u.li * 2.2) * mount;
        const hgt = Math.max(1.5, hh);
        this.tmp.position.set(wx, -SEA + (hgt - 40) / 2, u.z); this.tmp.scale.set(step * 1.02, hgt + 40, u.w * 2.2); this.tmp.rotation.set(0, 0, 0); this.tmp.updateMatrix();
        m.setMatrixAt(i, this.tmp.matrix);
      }
      m.instanceMatrix.needsUpdate = true;
    }
  }
}
export { FOV };
