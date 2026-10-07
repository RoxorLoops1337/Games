// World module: the TITLE alley (SHELL). A neon brick alley at night: pallet stage with the hero beatboxing, Foxy dancing, BeeAmGee on a crate, a hanging BEATBOX HEROES sign
// (gold bevel logo, marquee bulbs, beat pulse, one dead letter), string lights, drifting rain, steam vents, wet street with neon reflections and a slow dolly camera.
// Slots reuse it: world.ctx.title.setShot('slots') pushes the camera in.  <= 60k tris (see stats()).  Budget line: ~45k tris incl. 3 characters, ~35 calls.
//   ctx.title = { setShot('title'|'slots', ms), setBpm(bpm), setPhase(absBeat|null), pose(who, clip), stats(), shots }
//   spec.setBeat(0..1 pulse) is driven by the game (E.beat()) or by an internal 100 bpm clock when no music runs. No em dashes.
import { THREE } from './kit.js';
import { brickTex, muralTex, bladeTex, posterTex } from './w_title_tex.js';
import { buildSet, AL, LIGHTS } from './w_title_set.js';
import { buildSign, buildStringLights, buildRain, buildSteam, buildWet, buildShafts } from './w_title_fx.js';

const NOP = () => {};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const bounce = (x) => { const n = 7.5625, d = 2.75; if (x < 1 / d) return n * x * x; if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75; if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375; return n * (x -= 2.625 / d) * x + 0.984375; };
// camera shots: position, look-at, vertical fov at the reference aspect 9:16
const SHOTS = {
  title: { p: [0.0, 2.1, 5.6], l: [0, 0.75, -3.2], fov: 50 },
  slots: { p: [0.35, 1.5, 3.0], l: [0.0, 2.05, -2.6], fov: 50 },
};

export default function create(ctx, args) {
  args = args || {}; { const tv = args.time === undefined ? 0.85 : args.time; ctx.todInit = tv; }
  ctx.embedded = true;                                   // controls: no debug UI, no intro cinematic
  const low = ctx.quality === 'low', group = new THREE.Group(); group.name = 'title_world';
  const T = { brick: brickTex(), brickG: brickTex(true), mural: muralTex(), bladeL: bladeTex('BEATS', '#2ee6ff', 'LIVE'), bladeR: bladeTex('OPEN', '#ffe14d', 'MIC'), posters: [posterTex(0, '#ff3ea5', '#2ee6ff'), posterTex(1, '#2ee6ff', '#ffe14d'), posterTex(2, '#a86bff', '#ff3ea5'), posterTex(3, '#ffe14d', '#9dff4a')] };
  const set = buildSet(ctx, T); group.add(set.group);
  const S = AL.stage;
  // ---- moving parts
  const sign = buildSign(); sign.group.position.set(0, 4.3, -4.7); group.add(sign.group);
  const strings = buildStringLights(); group.add(strings.group);
  const rain = buildRain(low ? 420 : 900); group.add(rain.mesh);
  const steam = buildSteam([[-1.55, 0.14, 1.0, 0.4], [1.5, 0.14, 0.4, 0.4], [0.1, 0.03, -5.6, 1.5], [-0.9, 0.03, -6.8, 1.3], [-2.3, 3.0, -3.7, 0.55]]); group.add(steam.mesh);
  const wet = buildWet(); group.add(wet.mesh);
  const shafts = buildShafts(set.lens); group.add(shafts.group);
  // real point lights (the bricks carry baked neon washes, these light the characters, the stage and the props)
  const pl = [];
  if (!low) [['#ff3ea5', [1.9, 2.8, -4.2], 7, 6.5], ['#2ee6ff', [-1.9, 2.8, -4.2], 7, 6.5], ['#ff3ea5', [0, 4.6, -3.4], 6, 6], ['#ffd8a8', [0.3, 2.8, 2.2], 2.6, 7]].forEach(([c, p, i, d]) => { const l = new THREE.PointLight(c, i, d, 2); l.position.set(p[0], p[1], p[2]); group.add(l); pl.push({ l, i }); });
  ctx.scene.add(group);

  // ---- terrain contract (flat, walls are visual only)
  const lamps = set.lamps.map((l) => ({ x: l.x, y: l.y, z: l.z }));
  const terrain = { group: new THREE.Group(), bounds: { minX: -2.2, maxX: 2.2, minZ: -8.4, maxZ: 8.4 }, blocked: () => false, heightAt: (x, z) => (Math.abs(x - S.x) < S.w / 2 - 0.1 && Math.abs(z - S.z) < S.d / 2 - 0.1 ? S.h : 0),
    pathDist: () => 1e9, keepout: () => false, paths: [], spotDefs: [], anchors: { start: { x: S.x, z: S.z + 0.1, rot: 0 }, fountain: { x: 0, z: -3 }, lamps }, camera: { dist: 8, pitch: 10, yaw: 0, fov: 44, focusY: 1.8 } };

  // ---- state
  const st = { t: 0, shot: 'title', cam: { p: new THREE.Vector3(...SHOTS.title.p), l: new THREE.Vector3(...SHOTS.title.l), fov: SHOTS.title.fov }, to: SHOTS.title, ms: 0, bpm: 100, phase: null, ext: -1, extT: -9, beat: 0, pulse: 0, dead: { next: 4.5, until: 0, on: 0 }, ready: false, off: 0, dropT: 0, w: null, flipT: 0, flip: 0, swing: 0 };
  const sz = new THREE.Vector2(), look = new THREE.Vector3(), tmp = new THREE.Vector3();
  const api = ctx.title = {
    shots: Object.keys(SHOTS),
    setShot(name, ms) { const s = SHOTS[name]; if (!s) return false; st.shot = name; st.to = s; st.ms = ms === undefined ? 900 : ms; if (st.ms <= 0) { st.cam.p.set(...s.p); st.cam.l.set(...s.l); st.cam.fov = s.fov; } return true; },
    setBpm(b) { if (b > 30 && b < 260) st.bpm = b; }, setPhase(p) { st.phase = p === null || p === undefined ? null : p; },
    pose(who, clip, o) { const w = st.w; if (!w) return false; const c = who === 'hero' || who === 'tay' ? w.player : w.npcs.find((n) => n.id === who); if (!c) return false; c.play(clip, o || { bpm: st.bpm }); return true; },
    skip(sec) { st.off += sec; st.ms = 0; api.setShot(st.shot, 0); return st.off; },
    stats() { return { shot: st.shot, pulse: +st.pulse.toFixed(2), bpm: st.bpm, ready: st.ready }; },
  };

  // ---- cast placement once the host has built the player and the NPCs
  function cast() {
    const w = ctx.host && ctx.host.world; if (!w || !w.player) return; st.w = w;
    const hero = w.player, foxy = w.npcs.find((n) => n.id === 'foxy'), bee = w.npcs.find((n) => n.id === 'beeamgee');
    w.lighting && w.lighting.group && w.lighting.group.traverse((o) => { if (o.isHemisphereLight) st.hemi = o; else if (o.isDirectionalLight && o.castShadow === false) st.rim = o; });
    if (w.controls && w.controls.setEnabled) w.controls.setEnabled(false);
    if (w.controls && w.controls.teleportTo) w.controls.teleportTo(S.x, S.z + 0.1);
    hero.object.position.set(S.x, S.h, S.z + 0.1); hero.object.rotation.y = 0; hero.play('beatbox', { bpm: st.bpm, amp: 1 }); hero.setMood && hero.setMood('happy', true);
    if (foxy) { foxy.place(S.x - 1.0, S.z + 0.15, 0.4, undefined, 0); foxy.object.position.y = S.h; foxy.play('dance', { bpm: st.bpm }); foxy.setMood && foxy.setMood('happy', true); foxy.lookAt && foxy.lookAt(null); }
    if (bee) { bee.place(set.crate.x + Math.sin(-0.45) * -0.14, set.crate.z + Math.cos(-0.45) * -0.14, -0.45, 0.55, 0); bee.object.position.y = S.h + 0.0; bee.object.position.x += 0.0; bee.setMusic && bee.setMusic(st.bpm, 1); if (bee.boombox) { bee.boombox.position.set(-0.7, 0.135, 0.3); bee.boombox.rotation.y = 0.5; } }
    st.ready = true;
  }
  ctx.events.on('worldReady', cast);

  // ---------------------------------------------------------------- per frame
  function update(dt, t0) {
    const t = t0 + st.off; st.t = t; if (!st.ready) cast();
    // beat: external pulse when the game feeds it, else an internal clock
    const phase = st.phase !== null ? st.phase : t * st.bpm / 60, frac = phase - Math.floor(phase), internal = Math.exp(-frac * 5);
    const pulse = t - st.extT < 0.3 ? st.ext : internal; st.pulse = pulse; st.beat = phase;
    // the sign: drops in with a bounce, then sways; marquee chase; brightness on the beat; the 7th letter is a dying tube
    const dk = clamp((t - 0.3) / 1.25, 0, 1), drop = (1 - bounce(dk)) * 7.5;
    sign.pivot.position.y = drop; sign.pivot.rotation.z = Math.sin(t * 0.8) * 0.014 + (1 - dk) * Math.sin(t * 6) * 0.05; sign.pivot.rotation.y = Math.sin(t * 0.5 + 1) * 0.03;
    const step = Math.floor(phase * 2) & 1; if (step !== st.flip) { st.flip = step; sign.mat.map = step ? sign.texB : sign.texA; }
    const bright = 0.92 + 0.5 * pulse; sign.mat.color.setScalar(bright); sign.hal.opacity = 0.32 + 0.4 * pulse; sign.hal.color.setHSL(0.9 - 0.05 * Math.sin(t * 0.4), 1, 0.55);
    const D = st.dead; if (t > D.next) { D.until = t + 0.55; D.next = t + 5 + (Math.sin(t * 12.9898) * 43758.5453 % 1 + 1) * 3; } sign.dead.opacity = t < D.until ? ((Math.floor(t * 17) % 3) ? 0.95 : 0.15) : 0;
    for (let i = 0; i < set.washMats.length; i++) set.washMats[i].color.setScalar(0.8 + 0.5 * pulse);
    strings.U.uTime.value = t; strings.U.uBeat.value = pulse; rain.U.uTime.value = t; wet.U.uTime.value = t; wet.U.uBeat.value = pulse; steam.U.uTime.value = t; steam.U.uBeat.value = pulse;
    for (let i = 0; i < shafts.mats.length; i++) shafts.mats[i].uniforms.uK.value = 0.3 + 0.45 * pulse * (i ? 1 : 0.8);
    for (let i = 0; i < pl.length; i++) pl[i].l.intensity = pl[i].i * (0.8 + 0.45 * pulse);
    // grade: less flat violet fill so the neon and the rim lights carry the picture (lighting resets these every frame, we scale after it)
    if (st.hemi) st.hemi.intensity *= 0.55; if (st.rim) st.rim.intensity *= 0.7; ctx.renderer.toneMappingExposure *= 0.92;
    // cast rides the music phase when there is one
    if (st.w && st.phase !== null) { st.w.player.play('beatbox', { bpm: st.bpm, phase: st.phase, amp: 1 }); for (const n of st.w.npcs) if (n.id === 'foxy') n.play('dance', { bpm: st.bpm, phase: st.phase }); }
    // camera dolly with parallax, aspect aware
    const c = st.cam, s = st.to, k = 1 - Math.exp(-dt * (st.ms > 0 ? 1000 / st.ms * 2.4 : 40));
    c.p.x += (s.p[0] - c.p.x) * k; c.p.y += (s.p[1] - c.p.y) * k; c.p.z += (s.p[2] - c.p.z) * k; c.l.x += (s.l[0] - c.l.x) * k; c.l.y += (s.l[1] - c.l.y) * k; c.l.z += (s.l[2] - c.l.z) * k; c.fov += (s.fov - c.fov) * k;
    const slots = st.shot === 'slots', amp = ctx.reduceMotion ? 0 : 1, sw = slots ? 0.35 : 1;
    ctx.camera.position.set(c.p.x + Math.sin(t * 0.23) * 0.34 * sw * amp, c.p.y + Math.sin(t * 0.31) * 0.05 * amp, c.p.z + (Math.sin(t * 0.17) * 0.5 - 0.4) * sw * amp);
    look.set(c.l.x + Math.sin(t * 0.19 + 1) * 0.12 * amp, c.l.y, c.l.z); ctx.camera.lookAt(look);
    const asp = ctx.camera.aspect || 0.5625, hf = 2 * Math.atan(Math.tan(c.fov * Math.PI / 360) * 0.5625), vf = clamp(2 * Math.atan(Math.tan(hf / 2) / asp) * 180 / Math.PI, 30, 78);
    if (Math.abs(ctx.camera.fov - vf) > 0.01) { ctx.camera.fov = vf; ctx.camera.updateProjectionMatrix(); }
    ctx.renderer.getDrawingBufferSize(sz); const us = sz.y * 0.5 / Math.tan(ctx.camera.fov * Math.PI / 360); steam.U.uScale.value = us; strings.U.uScale.value = us * 0.12;
    void tmp;
  }
  return {
    terrain, flora: { group: new THREE.Group(), update: NOP }, npcSpecs: [{ id: 'foxy', flat: false }, { id: 'beeamgee' }], profile: 'out', camera: { fov: 44, near: 0.3, far: 160 }, update,
    setBeat(b) { st.ext = clamp(+b || 0, 0, 1); st.extT = st.t; },
    setLook() { },
    dispose() { ctx.title = null; },
  };
}
