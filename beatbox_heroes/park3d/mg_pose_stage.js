// SHOWMANSHIP stage (POSE): the Friday showcase venue (venue_showcase.js, reused as is) re-dressed as a dance class: Coach Vibe stage left, the hero stage right,
// BeeAmGee on a speaker crate keeping time with his boombox (med / high), a front-row crowd between the stage and the camera, coloured light pools that show whose turn it is,
// the LED wall shouting the current move, sparks / confetti / rings from the rhythm fx pool, and a camera director with hard cuts and beat punches.
//   buildPoseStage(ctx, opts) -> { group, venue, lighting, coach, hero, bee, fx, update(dt, t, v), cut(name, o), camera(dt, t), render(), resize(w,h,dpr), setLook(l), led(lines), stats(), dispose() }
//   v = { beat, energy 0..1, active: 'coach'|'hero'|null, bpm }
import { THREE, disposeTree, rng } from './kit.js';
import { createCharacter, createNPC, createCrowd } from './characters.js';
import { buildLighting } from './lighting.js';
import { buildVenue } from './venue.js';
import { createFx, glowSheet } from './mg_rhythm_fx.js';
import { rootMotion, groove } from './mg_pose_moves.js';

export const STAGE_H = 0.6, SCALE = 1.6, COACH_X = -1.3, HERO_X = 1.3;
export const COACH_LOOK = { name: 'Coach Vibe', body: 'girl', skin: '#9a6440', hair: { style: 'buns', color: '#ff3ea5' }, eyes: { style: 'happy', color: '#3a2418' }, brows: 'arched', top: { id: 'tracktop', color: '#2ee6ff', color2: '#fff6e8' }, bottom: { id: 'trackpants', color: '#1d1636' }, shoes: { id: 'hightops', color: '#ffd23f' }, hat: { id: 'headband', color: '#ff3ea5' }, glasses: { id: 'none' }, acc: { wrist: { id: 'wristband', color: '#ffd23f' }, neck: { id: 'chain', color: '#ffd23f' } } };
const FALLBACK_LOOK = { name: 'You', body: 'neutral', skin: '#c68b5e', hair: { style: 'twists', color: '#1a1420' }, top: { id: 'oversized', color: '#ffd23f', color2: '#e63946' }, bottom: { id: 'camo', color: '#5a6b3a' }, shoes: { id: 'retro', color: '#f7f2e8' } };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), lerp = (a, b, t) => a + (b - a) * t;

// camera shots in world space (the venue sits at the origin, deck top at STAGE_H). fov is the 9:16 value; other aspects keep the horizontal framing.
const SHOTS = {
  coach: { p: [-0.45, 2.25, 8.6], l: [-0.62, 1.3, 0], fov: 38 },          // coach on the left third, the callout on the right
  hero: { p: [0.45, 2.25, 8.6], l: [0.62, 1.3, 0], fov: 38 },             // hero on the right third, your callout and judgement on the left
  duo: { p: [0, 2.5, 11.2], l: [0, 1.35, 0], fov: 40 },
  wide: { p: [0, 3.6, 15.5], l: [0, 1.5, 0], fov: 42 },
  hype: { p: [2.2, 1.35, 4.6], l: [1.05, 2.0, 0], fov: 50 },               // low hero angle for a perfect round
  sel: { p: [-3.2, 3.1, 12.5], l: [0, 2.2, 0], fov: 44 },
  result: { p: [1.0, 2.6, 9.5], l: [1.1, 0.55, 0], fov: 40 },             // hero in the top half, the card in the bottom half
};

export function buildPoseStage(ctx, opts) {
  opts = opts || {}; const { scene, camera } = ctx, q = ctx.quality || 'high', tier = q === 'low' ? 0 : q === 'med' ? 1 : 2;
  const group = new THREE.Group(); group.name = 'pose_stage';
  // ---------------------------------------------------------------- venue (the showcase, at the origin, gold theme)
  let venue = null;
  try { venue = buildVenue(ctx, 'showcase', { x: 0, z: 0, stageH: STAGE_H, theme: 'gold', title: 'SHOWTIME', sub: 'COPY THE COACH', q, crowd: tier === 0 ? 10 : tier === 1 ? 16 : 24, seed: 7 }); group.add(venue.group); } catch (e) { console.error('[pose] venue failed: ' + (e && e.stack || e)); }
  const fake = { group: new THREE.Group(), interior: true, profile: (venue && venue.hint && venue.hint.profile) || 'stage', ceilY: 10, bounds: { minX: -15, maxX: 15, minZ: -6, maxZ: 20 }, blocked: () => false,
    anchors: { start: { x: 0, z: 4, rot: 0 }, buskSpot: { x: 0, z: 0 }, graffiti: { x: 0, z: -3 }, fountain: { x: 0, z: 6 }, lamps: [{ x: -6.3, y: 3.8, z: 4 }, { x: 6.3, y: 3.8, z: 4 }], stageCenter: { x: 0, z: 0 }, rig: venue && venue.anchors.rig ? venue.anchors.rig : undefined } };
  const lighting = buildLighting(ctx, fake); group.add(lighting.group);
  lighting.setTimeOfDay(1, true); lighting.state.tilt = 0.22;
  try { lighting.setProfile(fake.profile, true); lighting.setStageTheme('gold', true); } catch (e) { /* ignore */ }
  try { lighting.setMusic(false); } catch (e) { /* ignore */ }
  if (opts.reduce) { try { lighting.setReduce(true); } catch (e) { /* ignore */ } }
  const follow = new THREE.Object3D(); follow.position.set(0, 0, 1); group.add(follow); lighting.follow(follow);
  // ---------------------------------------------------------------- front-row crowd between the stage lip and the camera (the venue's own crowd stands on the flanks)
  // two flank blocks leave the sight lines of the close shots clear, a back row behind the close-shot cameras fills the bottom of the wide shot
  let front = null; const nF = tier === 0 ? 10 : tier === 1 ? 16 : 24;
  try {
    const R = rng(31), pos = []; for (let i = 0; i < nF; i++) { const back = i % 4 === 3, side = i % 2 ? 1 : -1; const x = back ? (R() - 0.5) * 6.4 : side * (1.75 + R() * 2.7), z = back ? 9.6 + R() * 2.2 : 4.5 + R() * 2.8; pos.push([x, z, Math.atan2(-x * 0.6, -z) + (R() - 0.5) * 0.3]); }
    front = createCrowd(ctx, nF, { positions: pos, seed: 31, energy: 0.4, bpm: 96 }); group.add(front.object);
  } catch (e) { console.error('[pose] crowd failed: ' + e); }
  // ---------------------------------------------------------------- characters
  const mk = (look) => { const c = createCharacter(ctx, look); c.object.scale.setScalar(SCALE); c.object.position.y = STAGE_H; group.add(c.object); c.play('pz_groove', {}); if (q === 'low') c.object.traverse((o) => { if (o.isMesh) o.castShadow = false; }); return c; };
  const coach = mk(COACH_LOOK); coach.object.position.x = COACH_X; coach.setMood('happy');
  const hero = mk(opts.look || (window.BBH && window.BBH.CATALOG && window.BBH.CATALOG.DEFAULT_LOOK) || FALLBACK_LOOK); hero.object.position.x = HERO_X;
  const YAW = { coach: 0.16, hero: -0.16 };
  // BeeAmGee on a speaker crate stage left, nodding to the shaker (med / high)
  let bee = null, crate = null;
  if (tier > 0) {
    try {
      const NPCS = window.BBH && window.BBH.Core && window.BBH.Core.NPCS, look = NPCS && NPCS.beeamgee && NPCS.beeamgee.look;
      bee = createNPC(ctx, 'beeamgee', look ? { look } : {}); bee.object.scale.setScalar(1.25); const bx = -4.25, bz = 0.9, rot = 0.55; bee.place(bx, bz, rot, 0.46); bee.object.position.y = STAGE_H; group.add(bee.object);
      const g = new THREE.BoxGeometry(1.0, 0.58, 0.62); const m = new THREE.MeshLambertMaterial({ color: '#241c38', flatShading: true }); crate = new THREE.Mesh(g, m); crate.position.set(bee.object.position.x, STAGE_H + 0.29, bee.object.position.z); crate.rotation.y = rot; crate.castShadow = crate.receiveShadow = true; group.add(crate);
      const grille = new THREE.Mesh(new THREE.CircleGeometry(0.2, 14), new THREE.MeshBasicMaterial({ color: '#3a2f5a' })); grille.position.set(0, 0, 0.312); crate.add(grille);
    } catch (e) { console.error('[pose] beeamgee failed: ' + e); bee = null; }
  }
  // ---------------------------------------------------------------- whose turn: additive light pools on the deck + a soft back glow
  const pools = glowSheet(2, 'soft', 1, 1); pools.rotation.x = -Math.PI / 2; group.add(pools);
  const poolCol = [new THREE.Color('#ffc83d'), new THREE.Color('#35f2e0')], tmpC = new THREE.Color(), m4 = new THREE.Matrix4(), poolK = [0.5, 0.5];
  const fx = createFx(ctx, q, camera); group.add(fx.group);
  // ---------------------------------------------------------------- LED wall
  let ledKey = '';
  function led(lines, o) { const k = JSON.stringify(lines); if (k === ledKey || !venue || !venue.led) return; ledKey = k; try { venue.led.text(lines, Object.assign({ bg: ['#3a1466', '#120a2c'], rays: ['rgba(255,220,120,0.10)', 'rgba(255,255,255,0)'] }, o || {})); } catch (e) { /* ignore */ } }
  if (venue && venue.led && venue.led.mat) venue.led.mat.color.setScalar(0.72);       // the wall is backdrop here: the HUD carries the words
  led([{ t: 'SHOWTIME', c: '#ffd23f', k: 1.1 }, { t: 'COPY THE COACH', c: '#ff9ab8', k: 0.45 }]);

  // ---------------------------------------------------------------- per frame
  let beatPulse = 0, W = 540, H = 960;
  function update(dt, t, v) {
    v = v || {}; const beat = v.beat || 0, E = clamp(v.energy === undefined ? 0.4 : v.energy, 0, 1); beatPulse = Math.exp(-((beat % 1 + 1) % 1) * 5);
    groove(coach, beat, v.active === 'coach' ? 1 : 0.7); groove(hero, beat, v.active === 'hero' ? 1 : 0.7);
    coach.lookAt(v.lookCoach || null); hero.lookAt(v.lookHero || null);
    coach.update(dt, t); hero.update(dt, t); rootMotion(coach, dt, YAW.coach); rootMotion(hero, dt, YAW.hero);
    if (bee) { bee.setMusic(v.bpm || 96, 0.9); bee.update(dt, t); }
    // pools: the active performer's pool glows and pulses on the beat
    const act = [v.active === 'coach' ? 1 : 0.18, v.active === 'hero' ? 1 : 0.18];
    for (let i = 0; i < 2; i++) { poolK[i] += (act[i] - poolK[i]) * (1 - Math.exp(-8 * dt)); const s = 2.6 + 0.25 * beatPulse * poolK[i]; m4.makeScale(s, s, s); m4.setPosition(i ? HERO_X : COACH_X, -0.1, STAGE_H + 0.015); pools.setMatrixAt(i, m4); tmpC.copy(poolCol[i]).multiplyScalar(0.55 * poolK[i] * (0.8 + 0.5 * beatPulse)); pools.setColorAt(i, tmpC); }
    pools.instanceMatrix.needsUpdate = true; if (pools.instanceColor) pools.instanceColor.needsUpdate = true;
    if (venue) { venue.update(dt, t, { energy: E, beat }); if (venue.crowd) venue.crowd.setBeat(v.bpm || 96); }
    if (front) { front.setEnergy(clamp(E + 0.15 * beatPulse, 0, 1)); front.setBeat(v.bpm || 96); front.update(dt, t); }
    fx.update(dt, t);
    lighting.setBeat && lighting.setBeat(beatPulse * (0.4 + 0.6 * E));
    lighting.update(dt, t); if (scene.fog) { scene.fog.near = 30; scene.fog.far = 140; }
  }
  // ---------------------------------------------------------------- camera director: hard cuts between shots, a slow push while a shot holds, punches on the beat and on moves
  const cam = { name: 'sel', T: 0, punch: 0, roll: 0, shake: 0, from: null, blend: 1, blendT: 0 }, pv = new THREE.Vector3(), lv = new THREE.Vector3();
  function cut(name, o) { o = o || {}; if (!SHOTS[name]) return; if (cam.name === name && !o.force) return; cam.from = o.blend ? { name: cam.name, T: cam.T } : null; cam.blendT = o.blend || 0; cam.blend = o.blend ? 0 : 1; cam.name = name; cam.T = 0; }
  const fovFor = (base) => clamp(2 * Math.atan(Math.tan(base * Math.PI / 360) * (0.5625 / Math.max(0.3, W / H))) * 180 / Math.PI, base * 0.72, base * 1.38);
  function shotPose(name, T, out) {
    const s = SHOTS[name], push = 1 - Math.exp(-T * 0.35), orbit = name === 'result' || name === 'sel' ? T : 0;
    let px = s.p[0], py = s.p[1], pz = s.p[2];
    if (orbit) { const a = Math.sin(orbit * 0.22) * 0.12, dx = px - s.l[0], dz = pz - s.l[2]; px = s.l[0] + dx * Math.cos(a) - dz * Math.sin(a); pz = s.l[2] + dx * Math.sin(a) + dz * Math.cos(a); }
    else { const dx = s.l[0] - px, dz = s.l[2] - pz; px += dx * 0.07 * push; pz += dz * 0.07 * push; }
    out.p.set(px, py, pz); out.l.set(s.l[0], s.l[1], s.l[2]); out.fov = s.fov; return out;
  }
  const A = { p: new THREE.Vector3(), l: new THREE.Vector3(), fov: 40 }, B = { p: new THREE.Vector3(), l: new THREE.Vector3(), fov: 40 };
  function cameraUpdate(dt, t, reduce) {
    cam.T += dt; cam.punch *= Math.exp(-7 * dt); cam.roll *= Math.exp(-5 * dt); cam.shake *= Math.exp(-6 * dt);
    shotPose(cam.name, cam.T, A);
    if (cam.from && cam.blend < 1) { cam.blend = Math.min(1, cam.blend + dt / Math.max(0.01, cam.blendT)); cam.from.T += dt; shotPose(cam.from.name, cam.from.T, B); const e = cam.blend * cam.blend * (3 - 2 * cam.blend); A.p.lerpVectors(B.p, A.p, e); A.l.lerpVectors(B.l, A.l, e); A.fov = lerp(B.fov, A.fov, e); }
    const rm = reduce ? 0.2 : 1, sw = Math.sin(t * 0.5) * 0.06;
    pv.copy(A.p); lv.copy(A.l); pv.x += sw; pv.y += Math.sin(t * 0.37) * 0.03;
    pv.lerp(lv, 0.05 * cam.punch * rm);                                        // punch = a quick dolly towards the subject
    if (cam.shake > 0.01 && !reduce) { pv.x += (Math.random() - 0.5) * cam.shake * 0.12; pv.y += (Math.random() - 0.5) * cam.shake * 0.1; }
    camera.position.copy(pv); camera.lookAt(lv); camera.rotateZ(cam.roll * 0.06 * rm);
    const f = fovFor(A.fov) * (1 - 0.035 * cam.punch * rm); if (Math.abs(camera.fov - f) > 0.01) { camera.fov = f; camera.updateProjectionMatrix(); }
  }
  function render() { const S2 = lighting.state; if (S2 && S2.gHigh) { S2.gHigh.set('#fff8ee'); S2.gShadow.set('#f0eaff'); S2.sat = 1.25; } if (lighting.post && lighting.post.update) lighting.post.update(performance.now() / 1000); lighting.render(); }
  function resize(w, h, dpr) { W = w; H = h; lighting.resize(w, h, dpr || 1); }
  function stats() { let tris = 0; const v = venue && venue.stats ? venue.stats() : { tris: 0, draws: 0 }; tris += v.tris + coach.tris + hero.tris + (bee ? bee.tris : 0) + (front ? front.tris : 0); return { tris: Math.round(tris), venue: v }; }
  function dispose() {
    try { if (venue) venue.dispose(); } catch (e) { /* ignore */ }
    try { lighting.dispose(); } catch (e) { /* ignore */ }
    try { if (front) front.dispose(); } catch (e) { /* ignore */ }
    for (const c of [coach, hero, bee]) { if (!c) continue; try { disposeTree(c.object); c.dispose(); } catch (e) { /* ignore */ } }   // tree first (bone texture), then the character
    try { disposeTree(group); } catch (e) { /* ignore */ } if (group.parent) group.parent.remove(group);
  }
  return { group, venue, lighting, coach, hero, bee, fx, front, update, cut, camera: cameraUpdate, shot: () => cam.name, punch(k, roll) { cam.punch = Math.max(cam.punch, k || 1); if (roll) cam.roll = roll; }, shake(k) { cam.shake = Math.max(cam.shake, k || 1); }, render, resize, led, stats, dispose,
    setLook(l) { if (l) hero.setLook(l); }, SHOTS, YAW, crate };
}
