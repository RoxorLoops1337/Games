// RUN mini game (park jog tracker) in low-poly 3D. Same rules as the 2D Sprint Pace in ../minigames.js:
//   alternate LEFT / RIGHT taps (A D, arrows, F J, or the big pads). Each valid tap adds GAIN to the cadence bar, the bar drains DRAIN per second,
//   a 2.5 s block is GOOD when the average bar value is >= LO, 12 blocks, every 3 good blocks = +1 max energy. Tapping the same side twice is a miss.
// Look: third-person chase camera on the jogging path at golden hour, endless looping park, a sweet-spot ring under the runner's ideal pace,
//   milestone gates every 3 good bars with an energy fountain, pigeons that scatter, speed streaks, dust and leaves, lens glare.
// Test hooks (window.__park.game): start(o), press('L'|'R'), tick(sec), state(), result(), render(), setTime(t), setQuality(q).
import { THREE, disposeTree } from './kit.js';
import { createCharacter } from './characters.js';
import { buildLighting } from './lighting.js';
import { buildWorld, CH_L } from './mg_run_world.js';
import { makeParticles, makeStreaks, makePigeons, makeGate, makeRing } from './mg_run_fx.js';
import { createHud } from './mg_run_hud.js';

// the 2D constants, seconds instead of ms for BLOCK
export const RUN = { GAIN: 12, DRAIN: 25, LO: 60, HI: 85, BLOCK: 2.5, BLOCKS: 12 };
const SCALE = 1.5;                                  // the runner is drawn 1.5x so the stride reads at jog speed
const vAnim = (bar) => 0.9 + bar * 0.0185;          // gait speed (rig m/s): 0.9 walk .. 2.75 sprint. World speed = vAnim * SCALE
const V_MAX = vAnim(100), V_MIN = vAnim(0), V_REF = vAnim((RUN.LO + RUN.HI) / 2);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), lerp = (a, b, t) => a + (b - a) * t, ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const DEFAULT_LOOK = { name: 'Tay', body: 'neutral', skin: '#c68b5e', hair: { style: 'twists', color: '#1a1420' }, hat: { id: 'fitted', color: '#17141f' }, top: { id: 'oversized', color: '#ffd23f', color2: '#e63946' }, bottom: { id: 'camo', color: '#5a6b3a' }, shoes: { id: 'retro', color: '#f7f2e8' } };
const PACER_LOOK = { name: 'Pace', body: 'neutral', skin: '#8d5a36', hair: { style: 'crop', color: '#17102b' }, top: { id: 'tee', color: '#ff3ea5' }, bottom: { id: 'jeans', color: '#27214a' }, shoes: { id: 'sneakers', color: '#9dff4a' } };

// plays on the game's shared BBH.Audio context (never creates its own); E.settings.muted silences it, the volume is applied by E.applyAudioSettings
function playSfx(name, st) { if (st && st.muted) return; try { const A = typeof window !== 'undefined' && window.BBH && window.BBH.Audio; if (A && A.sfx) { A.unlock && A.unlock(); A.sfx(name); } } catch (e) { /* audio must never break the game */ } }

export function createRun(ctx, opts) {
  // opts (all optional): hud (DOM div), look, time, seed, offsetMs (E.settings.offset, accepted for contract parity: the run has no hit windows, so it is only reported in state()),
  //   settings (the live E.settings object: muted, reduce), again:false (in the game: no free second run, the card only has DONE), embedded
  opts = opts || {}; const { camera, scene, events } = ctx; let quality = ctx.quality || 'high';
  const offsetMs = +opts.offsetMs || 0, sfx = (n) => playSfx(n, opts.settings), reduceM = () => (opts.settings && opts.settings.reduce ? 0.2 : 1);
  let rewards = null, disposed = false;
  const tier = () => (quality === 'low' ? 0 : quality === 'med' ? 1 : 2);
  const group = new THREE.Group(); group.name = 'mg_run'; const root = new THREE.Group(); root.name = 'run_root'; group.add(root);
  ctx.todInit = opts.time !== undefined ? opts.time : 'dusk'; ctx.timeName = String(ctx.todInit);
  // ---------- lighting (sky, sun and shadows following the runner, fog, bloom, grade). A fake terrain keeps the park's static lamp glows far away. ----------
  const FAR = 1e5, fakeTerrain = { group: new THREE.Group(), bounds: { minX: -60, maxX: 60, minZ: -60, maxZ: 60 }, blocked: () => false, anchors: { start: { x: 0, z: 0 }, lamps: [{ x: FAR, y: 3.6, z: FAR }], fountain: { x: FAR, z: FAR }, buskSpot: { x: FAR, z: FAR }, graffiti: { x: FAR, z: FAR } } };
  let lighting = null; try { lighting = buildLighting(ctx, fakeTerrain); group.add(lighting.group); } catch (e) { console.error('[mg_run] lighting failed: ' + (e && e.stack || e)); }
  scene.add(camera); // streaks are children of the camera
  let world = buildWorld(ctx, root, quality), worldTier = tier();
  const dust = makeParticles(root, 320, false), sparks = makeParticles(root, 420, true), streaks = makeStreaks(camera, 34);
  const ring = makeRing(root), gates = [makeGate(root)], pigeons = makePigeons(root, 2, 3);
  pigeons.place(0, 40); pigeons.place(1, 85);
  // ---------- characters ----------
  let runner = null, pacer = null;
  try { runner = createCharacter(ctx, opts.look || DEFAULT_LOOK); root.add(runner.object); runner.object.scale.setScalar(SCALE); runner.play('idle', {}); } catch (e) { console.error('[mg_run] runner failed: ' + (e && e.stack || e)); }
  try { pacer = createCharacter(ctx, PACER_LOOK); root.add(pacer.object); pacer.object.scale.setScalar(SCALE); pacer.play('idle', {}); pacer.object.visible = tier() > 0; } catch (e) { console.error('[mg_run] pacer failed: ' + (e && e.stack || e)); }
  if (lighting && runner) lighting.follow(runner.object);
  // ---------- state ----------
  const S = { phase: 'ready', bar: 0, last: null, blockT: 0, sum: 0, n: 0, burn: 0, good: 0, blocksDone: 0, results: [], taps: 0, misses: 0, energy: 0, burnBars: 0, time: 0 };
  let gatesPassed = 0, holdT = 0, holdV = 0, anchor = 0, startAnchor = 0, vS = 0, vPace = 0, off = 0, offT = 0, doneT = 0, cardT = -1, result = null, kick = 0, stumble = 0, fovPulse = 0, clock = 0, camPhase = 0, leafAcc = 0, gateAcc = 0, W = 540, H = 960, dpr = 1, tClock = 0;
  const RUNNER_X = 0.42, PACER_X = -1.35, RING_LEAD = 1.2;
  const sunScreen = new THREE.Vector3(), tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
  const hud = createHud(opts.hud, { onTap: (s) => press(s), onQuit: () => quit(), onStart: () => { if (S.phase === 'ready') startRun(); } }, RUN, { again: opts.again !== false, acts: opts.acts });
  // leaving: 'quit' {game, finished} (new contract) and 'minigameQuit' (legacy name); the game decides what a quit means from `finished`
  function quit() { if (disposed) return; events.emit('quit', { game: 'run', finished: S.phase === 'done' }); events.emit('minigameQuit'); }
  function applyYaw() { // line the track up so the low sun sits ahead and slightly to the left (glare, rim light, long shadows towards the camera)
    const st = lighting && lighting.getState(); if (!st) return; const a = Math.atan2(st.sunDir.x, st.sunDir.z); root.rotation.y = a - 0.2; root.updateMatrixWorld(true);
  }
  applyYaw();
  const toWorld = (x, y, z, out) => out.set(x, y, z).applyMatrix4(root.matrixWorld);

  // ---------- rules ----------
  function startRun(o) {
    o = o || {}; if (o.look && runner) runner.setLook(o.look);
    Object.assign(S, { phase: 'run', bar: 0, last: null, blockT: 0, sum: 0, n: 0, burn: 0, good: 0, blocksDone: 0, results: [], taps: 0, misses: 0, energy: 0, burnBars: 0, time: 0 });
    startAnchor = anchor; gatesPassed = 0; result = null; doneT = 0; cardT = -1; off = 0; offT = 0; hud.hideCard(); hud.reset(); gates.forEach((g) => { g.visible = false; g.userData.active = false; });
    if (runner) runner.play('run', { speed: vS / SCALE + 0.01 }); if (pacer) pacer.play('run', { speed: vPace });
  }
  function press(side) {
    side = side === 'l' || side === 'left' || side === 0 ? 'L' : side === 'r' || side === 'right' || side === 1 ? 'R' : side; if (side !== 'L' && side !== 'R') return false;
    if (S.phase === 'done') return false; if (S.phase === 'ready') startRun();
    if (side === S.last) { S.misses++; hud.flash(side, false); sfx('miss'); stumble = 1; return false; }
    S.last = side; S.bar = Math.min(100, S.bar + RUN.GAIN); S.taps++; hud.flash(side, true); sfx('step'); kick = 1; footstrike(side); return true;
  }
  function footstrike(side) {
    const px = RUNNER_X + (side === 'L' ? 0.2 : -0.2) * SCALE * 0.7, pz = anchor + RING_LEAD + off - 0.15;
    for (let i = 0; i < 5; i++) dust.emit({ x: px + (Math.random() - 0.5) * 0.3, y: 0.08, z: pz + (Math.random() - 0.5) * 0.3, vx: (Math.random() - 0.5) * 1.6 + (side === 'L' ? 0.6 : -0.6), vy: 0.7 + Math.random() * 0.9, vz: -vS * 0.45 - Math.random() * 0.8, g: 1.2, drag: 1.5, s0: 0.2, s1: 0.5, life: 0.5 + Math.random() * 0.3, c: Math.random() < 0.5 ? '#e9c79d' : '#d8a77a', a: 0.4 });
    for (let i = 0; i < 4; i++) sparks.emit({ x: px, y: 0.1, z: pz, vx: (side === 'L' ? 1 : -1) * (0.8 + Math.random() * 1.6), vy: 1.4 + Math.random() * 1.6, vz: -vS * 0.3 + (Math.random() - 0.5), g: 7, s0: 0.1, s1: 0.03, life: 0.3 + Math.random() * 0.2, c: '#9dff4a', a: 1 });
  }
  function finishBlock() {
    const avg = S.sum / Math.max(1, S.n), burnR = S.burn / Math.max(1, S.n), ok = avg >= RUN.LO;
    S.results.push(ok ? 1 : 0); if (ok) { S.good++; sfx('hit_good'); if (S.good % 3 === 0) { S.energy = Math.floor(S.good / 3); spawnGate(); } } else sfx('miss');
    if (burnR > 0.5) { S.burnBars++; hud.toast('TOO FAST! BURNING ENERGY', true); }
    S.sum = 0; S.n = 0; S.burn = 0; S.blocksDone++; fovPulse = Math.max(fovPulse, ok ? 0.5 : 0);
    if (S.blocksDone >= RUN.BLOCKS) finish();
  }
  function finish() {
    S.phase = 'done'; doneT = 0; holdV = vAnim(S.bar); holdT = gates.some((g) => g.userData.active && !g.userData.passed) ? 4 : 0; const q = S.good / RUN.BLOCKS;
    result = { q, goodBars: S.good, good: S.good, blocks: RUN.BLOCKS, energy: Math.floor(S.good / 3), stamina: Math.floor(S.good / 3), pace: Math.round(q * 100), distance: Math.round((anchor - startAnchor) * 10) / 10, taps: S.taps, misses: S.misses, burnBars: S.burnBars };
    sfx('win'); cardT = 0; hud.toast(''); events.emit('minigame', { game: 'run', result });
  }
  function spawnGate() {
    const g = gates.find((x) => !x.userData.active) || gates[0]; const z = anchor + Math.max(18, vS * 2.4) + RING_LEAD; g.position.set(0, 0, z); g.visible = true; g.userData = { z, active: true, passed: false };
  }
  function gatePass(g) {
    g.userData.passed = true; gatesPassed++; fovPulse = 1; hud.toast('+1 MAX ENERGY'); sfx('levelup');
    for (const sx of [-2.5, 2.5]) for (let i = 0; i < 46; i++) { const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 2.5, c = ['#9dff4a', '#ffe14d', '#2ee6ff', '#fff6e8'][i & 3];
      sparks.emit({ x: sx + Math.cos(a) * 0.2, y: 0.3, z: g.userData.z + Math.sin(a) * 0.2, vx: -Math.sign(sx) * (0.5 + Math.random() * 2.2), vy: 6 + Math.random() * 4.5, vz: Math.sin(a) * sp * 0.4 + vS * 0.3, g: 9, drag: 0.2, s0: 0.2, s1: 0.06, life: 1 + Math.random() * 0.7, c, a: 1 }); }
    for (let i = 0; i < 60; i++) { const a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 1.8; sparks.emit({ x: RUNNER_X + Math.cos(a) * 0.5, y: 0.2, z: anchor + RING_LEAD + off + Math.sin(a) * 0.5, vx: Math.cos(a) * sp, vy: 4 + Math.random() * 4, vz: Math.sin(a) * sp + vS * 0.5, g: 8, drag: 0.3, s0: 0.16, s1: 0.04, life: 0.9 + Math.random() * 0.6, c: ['#9dff4a', '#ffe14d', '#2ee6ff', '#fff6e8'][i & 3], a: 1 }); }
    for (let i = 0; i < 40; i++) sparks.emit({ x: (Math.random() - 0.5) * 5, y: 4.1 + Math.random() * 0.6, z: g.userData.z + (Math.random() - 0.5), vx: (Math.random() - 0.5) * 2, vy: -0.5 - Math.random() * 1.5, vz: vS * 0.4, g: 1.5, s0: 0.16, s1: 0.04, life: 1.2 + Math.random(), c: i & 1 ? '#ffe14d' : '#9dff4a', a: 1 });
  }

  // ---------- one fixed simulation step (also drives the visuals so headless ticks look the same as live play) ----------
  function step(dt) {
    tClock += dt; clock += dt;
    if (S.phase === 'run') {
      S.time += dt; S.bar = Math.max(0, S.bar - RUN.DRAIN * dt); S.sum += S.bar; S.n++; if (S.bar > RUN.HI) S.burn++;
      S.blockT += dt; if (S.blockT >= RUN.BLOCK - 1e-9) { S.blockT -= RUN.BLOCK; if (S.blockT < 1e-6) S.blockT = 0; finishBlock(); }
    } else if (S.phase === 'done') { if (holdT > 0) { holdT -= dt; if (!gates.some((g) => g.userData.active && !g.userData.passed)) holdT = Math.min(holdT, 0.5); } else doneT += dt; if (cardT >= 0) { if (holdT <= 0) cardT += dt; if (cardT > 2.1 && result) { cardT = -1; hud.card(result, () => { startRun(); }, () => quit()); } } }
    // motion: gait speed follows the cadence bar; the anchor (camera focus) travels at world speed; the runner drifts ahead of / behind the ring with the bar
    const tv = S.phase === 'run' ? vAnim(S.bar) : S.phase === 'done' && holdT > 0 ? holdV : 0; vS += (tv * SCALE - vS) * (1 - Math.exp(-(S.phase === 'done' ? 2.2 : 3.2) * dt)); anchor += vS * dt;
    vPace += ((S.phase === 'run' ? V_REF : 0) - vPace) * (1 - Math.exp(-3 * dt));
    offT = S.phase === 'run' ? clamp((S.bar - (RUN.LO + RUN.HI) / 2) * 0.075, -1.8, 2.3) : 0; off += (offT - off) * (1 - Math.exp(-4.5 * dt));
    const rz = anchor + RING_LEAD + off, va = vS / SCALE;
    if (runner) { runner.object.position.set(RUNNER_X, 0, rz); const moving = va > 0.25; if (S.phase === 'done' && doneT > 1.6) runner.play('cheer', { amp: 1, fade: 0.25 }); else if (moving || S.phase === 'run') runner.play('run', { speed: va }); else runner.play('idle', {}); runner.update(dt, clock); }
    if (pacer && pacer.object.visible) { pacer.object.position.set(PACER_X, 0, anchor + RING_LEAD); if (S.phase === 'done' && doneT > 1.6 && vPace < 0.3) pacer.play('cheer', { amp: 0.8, fade: 0.25 }); else if (vPace > 0.3) pacer.play('run', { speed: vPace }); else pacer.play('idle', {}); pacer.update(dt, clock); }
    // gates
    for (const g of gates) if (g.userData.active) { if (!g.userData.passed && rz >= g.userData.z) gatePass(g); if (rz > g.userData.z + 14) { g.visible = false; g.userData.active = false; } }
    // pigeons
    pigeons.update(dt, rz, RUNNER_X, vS, (x, z) => { for (let i = 0; i < 6; i++) dust.emit({ x: x + (Math.random() - 0.5) * 0.4, y: 0.1, z, vx: (Math.random() - 0.5) * 2, vy: 0.8 + Math.random(), vz: 0.4, g: 0.6, drag: 1, s0: 0.14, s1: 0.4, life: 0.6, c: '#e6dde8', a: 0.5 }); for (let i = 0; i < 3; i++) dust.emit({ x, y: 0.4, z, vx: (Math.random() - 0.5) * 2.4, vy: 1.4 + Math.random() * 1.6, vz: 0.6 + Math.random(), g: 1.8, drag: 0.6, s0: 0.12, s1: 0.1, life: 1.2, c: '#fff6e8', a: 0.9, sway: 0.7 }); });
    // ambient leaves blowing across the path, dust streaks at speed
    leafAcc += dt * (3 + 8 * ss(V_MIN, V_MAX, va)) * (tier() === 0 ? 0.5 : 1); while (leafAcc > 1) { leafAcc -= 1; const sgn = Math.random() < 0.5 ? -1 : 1; dust.emit({ x: sgn * (1 + Math.random() * 6), y: 1 + Math.random() * 3.5, z: anchor + 16 + Math.random() * 18, vx: -sgn * (0.2 + Math.random() * 0.8), vy: -0.2, vz: -0.3, g: 0.12, drag: 0.1, s0: 0.17, s1: 0.15, life: 5, c: ['#e0a43a', '#cf5f36', '#7ac96c', '#f0a040'][Math.floor(Math.random() * 4)], a: 0.95, sway: 0.8 }); }
    dust.update(dt); sparks.update(dt); kick *= Math.exp(-9 * dt); stumble *= Math.exp(-5 * dt); fovPulse *= Math.exp(-2.4 * dt);
    camPhase += dt * (2.2 + va * 2.4) * Math.PI;
    // sweet-spot ring: colour tells the zone, a pulse and flowing chevrons lead the eye
    const zone = S.bar >= RUN.HI ? 'burn' : S.bar >= RUN.LO ? 'target' : 'slow', col = zone === 'burn' ? '#ffd23f' : zone === 'target' ? '#7dff6a' : '#2ee6ff';
    ring.group.position.set(RUNNER_X, 0, anchor + RING_LEAD); ring.group.visible = S.phase !== 'done'; const pulse = 1 + 0.035 * Math.sin(clock * 6) + kick * 0.06; ring.group.scale.set(pulse, 1, pulse);
    for (const m of [ring.outer, ring.disc, ring.inner]) m.material.color.set(col); ring.disc.material.opacity = 0.14 + (zone === 'target' ? 0.12 : 0) + 0.05 * Math.sin(clock * 6); ring.outer.material.opacity = zone === 'target' ? 1 : 0.7;
    ring.chev.forEach((c, i) => { const u = ((clock * 1.6 + i / 2) % 1); c.position.set(0, 0.06, (1.7 + u * 3.2) / pulse); c.material.color.set(col); c.material.opacity = 0.7 * Math.sin(Math.PI * u) * (S.phase === 'run' ? 1 : 0); c.scale.setScalar(1 - u * 0.25); });
    world.update(anchor, lighting ? lighting.getState().lamp : 1);
  }

  // ---------- camera ----------
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), camTgt = new THREE.Vector3(); let camInit = false;
  function placeCamera(dt) {
    const va = vS / SCALE, sf = ss(V_MIN, V_MAX, va), rz = anchor + RING_LEAD + off, ph = camPhase;
    const orbit = S.phase === 'done' ? ss(0.2, 1.6, doneT) : 0;
    // chase: low, behind and above; sways with the stride, dips on taps, stumbles on misses
    let cx = Math.sin(ph * 0.5) * 0.07 * (0.3 + sf) + RUNNER_X * 0.35, cy = 2.35 + Math.sin(ph) * 0.03 * (0.3 + sf) - kick * 0.05 - stumble * 0.12, cz = anchor - 5.0 - sf * 0.9 - kick * 0.12 - Math.max(0, -off) * 0.8;
    let lx = RUNNER_X * 0.8 + Math.sin(ph * 0.5 + 1) * 0.05, ly = 0.85 + sf * 0.2, lz = anchor + 5.5 + sf * 1.5;
    if (orbit > 0) { // arc round the pair to a front 3/4 view instead of cutting through them
      const fx = (RUNNER_X + PACER_X) / 2, dx0 = cx - fx, dz0 = cz - rz; let t0 = Math.atan2(dx0, dz0); if (t0 < 0) t0 += Math.PI * 2; const t1 = Math.atan2(1.3, 8.4), r0 = Math.hypot(dx0, dz0), r1 = Math.hypot(1.3, 8.4);
      const th = lerp(t0, t1, orbit), rr = lerp(r0, r1, orbit) - 1.6 * Math.sin(Math.PI * orbit); cx = fx + Math.sin(th) * rr; cz = rz + Math.cos(th) * rr; cy = lerp(cy, 1.5, orbit);
      lx = lerp(lx, fx, orbit); ly = lerp(ly, 2.2, orbit); lz = lerp(lz, rz, orbit);
    }
    toWorld(cx, cy, cz, camTgt); camera.position.copy(camTgt); toWorld(lx, ly, lz, camLook); camera.lookAt(camLook);
    camera.rotateZ((Math.sin(ph * 0.5) * 0.012 * (0.3 + sf) + stumble * 0.03) * reduceM()); // slight roll with the stride
    const rm = reduceM(), fov = 52 + 12 * sf + 6 * fovPulse * rm - orbit * 6; if (Math.abs(camera.fov - fov) > 0.01) { camera.fov += (fov - camera.fov) * (camInit ? Math.min(1, dt * 7) : 1); camera.updateProjectionMatrix(); }
    camInit = true;
    streaks.update(anchor * 1.0, S.phase === 'run' ? clamp(0.12 + ss(0.35, 0.95, sf) * 0.85 + fovPulse * 0.3, 0, 1) * (tier() === 0 ? 0.7 : 1) : 0);
    // lens glare at the sun disc
    const st = lighting && lighting.getState(); if (st) {
      tmpV.copy(camera.position).addScaledVector(st.sunDir, 200); camera.getWorldDirection(tmpV2); const facing = tmpV2.dot(st.sunDir); sunScreen.copy(tmpV).project(camera);
      const sx = (sunScreen.x * 0.5 + 0.5) * W, sy = (-sunScreen.y * 0.5 + 0.5) * H, edge = Math.max(Math.abs(sunScreen.x), Math.abs(sunScreen.y * 0.8));
      const a = facing > 0.2 ? ss(1.6, 0.4, edge) * (1 - st.night) * (0.7 + 0.5 * sf) * (0.9 + 0.1 * Math.sin(clock * 3)) : 0; hud.glare(sx, sy, clamp(a * 0.9, 0, 0.95) * (reduceM() < 1 ? 0.3 : 1), W / 2, H / 2);
    }
  }
  function stateOut() {
    const zone = S.bar >= RUN.HI ? 'burn' : S.bar >= RUN.LO ? 'target' : 'slow';
    return { phase: S.phase, bar: S.bar, zone, last: S.last, blockT: S.blockT, blockFrac: S.blockT / RUN.BLOCK, blocksDone: S.blocksDone, good: S.good, results: S.results.slice(), taps: S.taps, misses: S.misses, energy: S.energy, burnBars: S.burnBars, time: S.time, distance: Math.round((anchor - startAnchor) * 10) / 10, speed: vS, offset: off, gates: gates.filter((g) => g.userData.active && !g.userData.passed).length, gatesPassed, pigeonsScattered: pigeons.scattered, done: S.phase === 'done', quality, camFov: camera.fov, offsetMs, rewards, cardOpen: !!(hud.hasCard && hud.hasCard()), startShown: S.phase === 'ready' };
  }
  function advance(dt, full) {
    let left = dt; while (left > 1e-6) { const d = Math.min(1 / 60, left); left -= d; step(d); }
    placeCamera(Math.min(dt, 0.05)); hud.set(stateOut());
    if (full && lighting) lighting.update(dt, tClock);
  }

  // ---------- keyboard ----------
  const KEYS = { KeyA: 'L', ArrowLeft: 'L', KeyF: 'L', KeyD: 'R', ArrowRight: 'R', KeyJ: 'R' };
  const onKey = (e) => { const s = KEYS[e.code]; if (!s || e.repeat) return; e.preventDefault(); press(s); };
  if (typeof window !== 'undefined') window.addEventListener('keydown', onKey);

  const api = {
    group,
    update(dt, t) { advance(Math.min(dt, 0.1), true); },
    render() { if (lighting) lighting.render(); else ctx.renderer.render(scene, camera); },
    resize(w, h, d) { W = w; H = h; dpr = d || 1; if (lighting) lighting.resize(w, h, dpr); const px = h * dpr; dust.setPixelHeight(px); sparks.setPixelHeight(px); world.setPixelHeight(px); },
    setLook(look) { if (runner) runner.setLook(look); },
    setTime(t) { if (lighting) { lighting.setTimeOfDay(t, true); lighting.update(0.016, tClock); applyYaw(); } },
    setQuality(q) { quality = q; ctx.quality = q; if (lighting) lighting.setQuality(q); if (pacer) pacer.object.visible = tier() > 0; if (tier() !== worldTier) { world.dispose(); world = buildWorld(ctx, root, quality); worldTier = tier(); world.setPixelHeight(H * dpr); } },
    start(o) { startRun(o); },
    press, quit, tick(sec) { advance(sec, false); if (lighting) lighting.update(0.016, tClock); },
    // the game applies the real action (G.doHold) when the run ends and hands the true reward numbers back so the result card shows them:
    //   rw = { maxEnergy, energy (negative = spent), xp, mood, tech, cash, fans, ... } (any subset, numbers are deltas)
    setRewards(rw) { rewards = rw || null; hud.setRewards && hud.setRewards(rewards); },
    state: stateOut,
    result() { return result; },
    stats() { return { worldTris: world.stats(), chars: runner ? runner.tris : 0 }; },
    // full teardown: listeners, DOM, lighting (post targets, shadow map), every geometry / material / texture of the track, particles, streaks and both characters
    dispose() {
      if (disposed) return; disposed = true; if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey); hud.dispose();
      try { for (const c of [runner, pacer]) if (c) { disposeTree(c.object); c.dispose(); } } catch (e) { /* ignore */ }   // object first: the character's own textures, then its geometry / props
      try { world.dispose(); } catch (e) { /* ignore */ }
      try { if (lighting && lighting.dispose) lighting.dispose(); } catch (e) { /* ignore */ }
      if (streaks.mesh.parent) streaks.mesh.parent.remove(streaks.mesh); disposeTree(streaks.mesh); disposeTree(group); if (group.parent) group.parent.remove(group); scene.remove(camera);
    },
  };
  advance(0.016, true); void CH_L;
  return api;
}
