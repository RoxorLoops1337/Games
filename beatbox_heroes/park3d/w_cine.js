// World module: CINE, the dedicated cutscene stage (owner CINE). Sets that exist only for films, built from code, lit by the interior pipeline.
//   args.set: 'office' (default): the open plan office of the opening at 17:12. Three desk pods under fluorescent panels, a long window on the dusk city, a wall clock at 5:12,
//   the exit door on the right with its green sign. The hero's desk is the middle one (anchors.desk, anchors.chair), the boss stands at anchors.boss, the exit is anchors.exit.
//   ctx.cineSet = { flicker(ms), screens(on) } for cine.js (the 'flicker' cue blinks the middle tube), terrain.stats() -> { tris }.
// Contract: see worlds.js (create(ctx, args) -> { terrain, npcSpecs, profile }). Nothing is walkable on purpose: the player is driven by the cine, the controls never move it.
import { THREE, box, cyl, merged, flatMat, mesh, canvasTex } from './kit.js';

const C = (h) => new THREE.Color(h);
function glow(color, k) { return new THREE.MeshBasicMaterial({ color: C(color).multiplyScalar(k || 1), toneMapped: false }); }

// the dusk city through the window: gradient sky, two rows of towers, lit windows
function cityTex() {
  return canvasTex(1024, 256, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#3b2a6b'); sky.addColorStop(0.45, '#c2577e'); sky.addColorStop(0.75, '#ff9a5c'); sky.addColorStop(1, '#ffd08a'); g.fillStyle = sky; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,236,190,.9)'; g.beginPath(); g.arc(w * 0.68, h * 0.78, 34, 0, Math.PI * 2); g.fill();
    let seed = 7; const R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    [['#5a3d78', 0.5, 0.95], ['#2d2148', 0.68, 1.0]].forEach(([col, top, bot]) => {
      for (let x = -10; x < w; ) {
        const bw = 26 + R() * 70, bh = h * (top - R() * 0.42); g.fillStyle = col; g.fillRect(x, bh, bw, h * bot - bh + 40);
        if (col === '#2d2148') for (let yy = bh + 8; yy < h - 6; yy += 11) for (let xx = x + 5; xx < x + bw - 6; xx += 9) if (R() < 0.33) { g.fillStyle = R() < 0.5 ? '#ffd27a' : '#ffb35c'; g.fillRect(xx, yy, 4, 5); }
        x += bw + 2 + R() * 6;
      }
    });
  });
}
function clockTex() {
  return canvasTex(128, 128, (g, w) => {
    g.fillStyle = '#f2ece0'; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill(); g.lineWidth = 6; g.strokeStyle = '#2a2433'; g.stroke();
    g.fillStyle = '#2a2433'; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.fillRect(64 + Math.sin(a) * 48 - 2, 64 - Math.cos(a) * 48 - 2, 4, 4); }
    const hand = (a, l, wd, col) => { g.strokeStyle = col; g.lineWidth = wd; g.lineCap = 'round'; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.sin(a) * l, 64 - Math.cos(a) * l); g.stroke(); };
    hand((5 + 12 / 60) / 12 * Math.PI * 2, 30, 7, '#2a2433'); hand(12 / 60 * Math.PI * 2, 44, 4, '#2a2433'); hand(0.6, 46, 2, '#d6203f'); return w;
  });
}
function exitTex() { return canvasTex(128, 48, (g, w, h) => { g.fillStyle = '#0f7a3a'; g.fillRect(0, 0, w, h); g.fillStyle = '#d9ffe2'; g.font = '800 30px system-ui,Arial,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('EXIT', w / 2, h / 2 + 2); }); }

function buildOffice(ctx) {
  const group = new THREE.Group(); group.name = 'cine_office'; const P = [], low = ctx.quality === 'low';
  // carpet tiles, walls, skirting
  for (let i = -7; i < 7; i++) for (let j = -5; j < 6; j++) P.push(box(1, 0.06, 1, (i + j) & 1 ? '#3c4160' : '#353a56', i + 0.5, -0.03, j + 0.5));
  P.push(box(14, 3.4, 0.2, '#57506f', 0, 1.7, -4.4), box(0.2, 3.4, 10, '#4d4766', -7, 1.7, 0.6), box(0.2, 3.4, 10, '#4d4766', 7, 1.7, 0.6));
  P.push(box(14, 0.12, 0.06, '#2c2840', 0, 0.06, -4.28), box(0.06, 0.12, 10, '#2c2840', -6.88, 0.06, 0.6), box(0.06, 0.12, 10, '#2c2840', 6.88, 0.06, 0.6));
  // the window band on the back wall (frames over the city plate)
  P.push(box(11.2, 0.12, 0.3, '#e9e3f2', 0, 0.92, -4.2), box(11.2, 0.1, 0.24, '#d8d0e6', 0, 2.62, -4.25));
  for (let k = 0; k <= 6; k++) P.push(box(0.08, 1.72, 0.18, '#e9e3f2', -5.6 + k * (11.2 / 6), 1.77, -4.22));
  const city = new THREE.Mesh(new THREE.PlaneGeometry(11.1, 1.66), new THREE.MeshBasicMaterial({ map: cityTex(), toneMapped: false, fog: false })); city.position.set(0, 1.77, -4.29); group.add(city);
  // desk pods: top, legs, monitor, keyboard, chair. The hero's is the middle one; its screen glows, the others are dark
  const pods = [[-3.4, -1.0], [0, -1.0], [3.4, -1.0], [-3.4, 1.9], [3.4, 1.9]], screens = [];
  pods.forEach(([x, z], i) => {
    P.push(box(1.7, 0.06, 0.82, '#d9cdb8', x, 0.75, z), box(1.66, 0.4, 0.04, '#9a8f86', x, 0.52, z - 0.38));
    [-0.8, 0.8].forEach((dx) => P.push(box(0.05, 0.72, 0.74, '#6f6874', x + dx, 0.36, z)));
    P.push(box(0.5, 0.03, 0.18, '#2a2733', x - 0.05, 0.795, z + 0.12), box(0.12, 0.22, 0.08, '#2a2733', x - 0.45, 0.9, z - 0.2), box(0.62, 0.4, 0.05, '#23202c', x - 0.45, 1.2, z - 0.2));
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.34), i === 1 ? glow('#9fd2ff', 1.25) : new THREE.MeshLambertMaterial({ color: '#1b1a24' })); scr.position.set(x - 0.45, 1.2, z - 0.17); group.add(scr); screens.push(scr);
    const cz = i === 1 ? z - 0.7 : z - 0.55, cx = x + (i === 1 ? 0 : 0.1);
    P.push(box(0.5, 0.08, 0.5, '#2e3550', cx, 0.46, cz), box(0.48, 0.55, 0.07, '#2e3550', cx, 0.8, cz - 0.24), cyl(0.035, 0.035, 0.4, 6, '#55505e', cx, 0.24, cz), box(0.56, 0.04, 0.08, '#3b3846', cx, 0.04, cz), box(0.08, 0.04, 0.56, '#3b3846', cx, 0.04, cz));
    if (i !== 1) P.push(box(0.26, 0.2, 0.3, '#b98b5e', x + 0.45, 0.88, z + 0.05));
  });
  // the hero's desk: a mug, a photo frame, papers
  P.push(cyl(0.045, 0.04, 0.1, 8, '#ff3ea5', 0.55, 0.83, -1.15), box(0.14, 0.18, 0.02, '#e9e3f2', 0.3, 0.87, -1.3), box(0.3, 0.01, 0.22, '#f7f2e8', 0.2, 0.785, -0.9));
  // filing cabinets, a water cooler, a tired ficus, the wall clock, the exit door (light spills through the gap)
  [-6.3, -5.7].forEach((x) => P.push(box(0.55, 1.3, 0.6, '#7d7790', x, 0.65, -3.8)));
  P.push(box(0.4, 1.0, 0.4, '#e9e3f2', 5.6, 0.5, -3.8), cyl(0.15, 0.15, 0.42, 10, '#8ad0ff', 5.6, 1.22, -3.8));
  P.push(cyl(0.22, 0.17, 0.4, 8, '#8a5a3a', -6.3, 0.2, 2.8), cyl(0.03, 0.03, 0.9, 5, '#5a3d28', -6.3, 0.85, 2.8));
  [[0, 1.6, 0.42], [0.14, 1.35, 0.32], [-0.12, 1.2, 0.3]].forEach(([dx, y, r]) => P.push(box(r * 2, r * 1.4, r * 2, '#3f8a52', -6.3 + dx, y, 2.8)));
  P.push(box(0.12, 2.3, 1.3, '#3a3550', 6.95, 1.15, 1.6), box(0.06, 2.2, 1.1, '#6a6280', 6.86, 1.1, 1.75));
  const clock = new THREE.Mesh(new THREE.CircleGeometry(0.34, 28), new THREE.MeshBasicMaterial({ map: clockTex(), toneMapped: false })); clock.position.set(2.3, 2.95, -4.28); group.add(clock);
  const exit = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.19), new THREE.MeshBasicMaterial({ map: exitTex(), toneMapped: false })); exit.position.set(6.86, 2.52, 1.6); exit.rotation.y = -Math.PI / 2; group.add(exit);
  const spill = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 2.1), glow('#fff3d6', 1.6)); spill.position.set(6.84, 1.05, 1.08); spill.rotation.y = -Math.PI / 2; group.add(spill);
  // fluorescent panels (the middle one is the one that dies)
  const tubes = []; [[-3.4, -1.0], [0, -1.0], [3.4, -1.0], [-3.4, 1.9], [3.4, 1.9]].forEach(([x, z]) => { P.push(box(1.5, 0.05, 0.5, '#cfcadc', x, 3.32, z)); const t = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.02, 0.38), glow('#eef4ff', 1.5)); t.position.set(x, 3.29, z); group.add(t); tubes.push(t); });
  const m = mesh(merged(P), flatMat()); m.name = 'office'; group.add(m);
  let tris = 0; group.traverse((o) => { if (o.isMesh && o.geometry) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
  const lights = [{ x: 0, y: 2.9, z: -1.0, color: '#e8f0ff', r: 7, i: 1.15, kind: 'lamp' }, { x: -3.4, y: 2.9, z: -1.0, color: '#e8f0ff', r: 6, i: 0.6, kind: 'lamp' }, { x: 3.4, y: 2.9, z: -1.0, color: '#e8f0ff', r: 6, i: 0.6, kind: 'lamp' }, { x: 6.4, y: 1.4, z: 1.2, color: '#9dffb8', r: 3, i: 0.4, kind: 'neon' }];
  if (low) lights.length = 2;
  return { group, tubes, screens, tris, lights };
}

export default function create(ctx, args) {
  args = args || {};
  const o = buildOffice(ctx);
  const anchors = { start: { x: 0, z: -1.7, rot: 0 }, chair: { x: 0, z: -1.7, rot: 0 }, desk: { x: 0, z: -1.0, rot: 0 }, boss: { x: 1.55, z: -0.15, rot: -2.2 }, exit: { x: 6.3, z: 1.6, rot: Math.PI / 2 }, lamps: [] };
  const terrain = { group: o.group, bounds: { minX: -7, maxX: 7, minZ: -4.3, maxZ: 5.5 }, blocked: () => false, heightAt: () => 0, pathDist: () => 1e9, keepout: () => false, paths: [], spotDefs: [], anchors, interior: true,
    windows: [{ x: 0, y: 1.77, z: -4.3, w: 11, h: 1.7, nx: 0, nz: -1 }], lights: o.lights, ceilY: 3.4, camera: { dist: 9, pitch: 30, yaw: 0, fov: 40, minDist: 6, maxDist: 12, focusY: 1.0 }, stats: () => ({ tris: o.tris }) };
  ctx.scene.add(o.group);
  let fl = 0; const mid = o.tubes[1];
  ctx.cineSet = {
    flicker(ms) { fl = (ms || 500) / 1000; },
    screens(on) { const s = o.screens[1]; if (s) s.visible = on !== false; },
  };
  const update = (dt) => { if (fl > 0) { fl -= dt; mid.visible = fl <= 0 || Math.sin(fl * 60) > -0.2; } };
  return { terrain, flora: null, npcSpecs: [], profile: 'in', update, dispose() { ctx.cineSet = null; } };
}
