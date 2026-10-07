// World module: the battle ARENA (venue_arena.js + this file, Stage and Club Artist INT-B). Contract: see host.js and worlds.js. Profile 'stage' (key spots and rim in the theme colour).
//   args: { opp: index into Core.OPPONENTS | Core.OPPONENTS entry | look | Core.FINALS entry, you: 'TAY' (name on the VS wall), crowd: 18..44, Core, round: 1, look (player look; the host builds the player on the left podium) }
//   The player stands on the left podium (anchors.start), the opponent on the right; five judges behind their desks; the crowd ring; LED wall for the VS splash. Nothing is walkable (blocked everywhere).
//   Extra world methods (attached to the world object on the first frame, also on world.arena): setOpponent(i | opp), vs({you, opp, round, sub}) = splash + camera whip, setScores([5] | null, animate), reveal(i, score),
//   setRound(n), splash(text, sub), cheer(sec), mood('angry'|'happy'|'neutral'|'sad'|'shout'), setTheme('pink'|'cyan'|'lime'|'gold'), camera(name | null, { ms }), cameras (names), whip(opts), release() back to the host camera.
//   Camera presets: wide, vs, oppClose, youClose, over (over the shoulder), judges, crowd. The default shot is 'wide'. The world drives the camera itself (the controls are idle: nothing is walkable).
import { THREE } from './kit.js';
import { buildVenue } from './venue.js';
import { ARENA } from './venue_arena.js';

const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
export default function create(ctx, args) {
  args = args || {}; ctx.todInit = 'night'; const Core = args.Core || (typeof window !== 'undefined' && window.BBH && window.BBH.Core) || null;
  const venue = buildVenue(ctx, 'arena', { x: 0, z: 0, scale: 1, opp: args.opp !== undefined ? args.opp : 0, you: args.you || args.name || 'YOU', crowd: args.crowd, Core, theme: args.theme });
  const A = ARENA, podium = (x, z, cx) => Math.hypot(x - cx, z - A.podiumZ) < A.podiumR;
  let prev = null; const heightAt = (x, z) => prev ? prev.stageH : (podium(x, z, -A.podiumX) || podium(x, z, A.podiumX) ? A.podiumTop : Math.hypot(x, z) < 9.5 ? A.deckH : 0);
  const anchors = Object.assign({}, venue.anchors, { start: { x: -A.podiumX, z: A.podiumZ, rot: 1.05 }, door: { x: 0, z: 20, rot: 0 }, opponent: { x: A.podiumX, z: A.podiumZ, rot: -1.05 } });
  // camera driver
  const cam = { mode: args.camera === null ? null : (args.camera || 'wide'), from: null, to: null, t: 1, ms: 0, tl: null, tlT: 0, lastFov: 0 }, P = new THREE.Vector3(), L = new THREE.Vector3(), Lt = new THREE.Vector3(), pp = new THREE.Vector3(), ll = new THREE.Vector3();
  const preset = (n) => venue.cams[n] || venue.cams.wide;
  const snap = (c) => ({ p: c.pos.slice(), l: c.look.slice(), f: c.fov });
  function setCamera(name, o) { o = o || {}; if (name === null) { cam.mode = null; cam.tl = null; return false; } const pr = preset(name); cam.mode = name; cam.from = cam.cur ? { p: cam.cur.p.slice(), l: cam.cur.l.slice(), f: cam.cur.f } : snap(pr); cam.to = snap(pr); cam.t = 0; cam.ms = o.ms === undefined ? 0 : o.ms; if (!cam.ms) { cam.cur = snap(pr); cam.t = 1; } return true; }
  function whip(o) { o = o || {}; const hold = o.hold === undefined ? 0.9 : o.hold; cam.tl = [{ n: 'oppClose', ms: 0, hold }, { n: 'youClose', ms: 380, hold }, { n: 'vs', ms: 520, hold: hold * 1.2 }, { n: 'wide', ms: 800, hold: 0 }]; cam.tlT = 0; cam.tlI = -1; }
  setCamera(cam.mode || 'wide', { ms: 0 }); if (cam.mode === null) cam.mode = null;
  function drive(dt, c) {
    if (cam.tl) { cam.tlT -= dt; if (cam.tlT <= 0) { cam.tlI++; const s = cam.tl[cam.tlI]; if (!s) { cam.tl = null; } else { setCamera(s.n, { ms: s.ms }); cam.tlT = s.ms / 1000 + s.hold; } } }
    if (!cam.mode || !cam.to) return;
    if (cam.t < 1) { cam.t = Math.min(1, cam.t + dt / Math.max(0.001, cam.ms / 1000)); const e = ease(cam.t), a = cam.from, b = cam.to; cam.cur = { p: [0, 1, 2].map((i) => a.p[i] + (b.p[i] - a.p[i]) * e), l: [0, 1, 2].map((i) => a.l[i] + (b.l[i] - a.l[i]) * e), f: a.f + (b.f - a.f) * e }; } else if (!cam.cur) cam.cur = cam.to;
    const s = cam.cur; const sway = cam.mode === 'wide' ? 1 : cam.mode === 'preview' ? 0 : 0.4, tt = ctx.__arenaT || 0;
    c.position.set(s.p[0] + Math.sin(tt * 0.35) * 0.25 * sway, s.p[1] + Math.sin(tt * 0.27) * 0.08 * sway, s.p[2]); c.lookAt(s.l[0], s.l[1], s.l[2]);
    if (Math.abs(c.fov - s.f) > 0.01) { c.fov = s.f; c.updateProjectionMatrix(); }
  }
  let inited = false, lighting = null, tAbs = 0;
  function init() {
    inited = true; const W = ctx.host && ctx.host.world; if (!W) return; lighting = W.lighting;
    const plug = (k, f) => { if (typeof W[k] !== 'function') W[k] = f; };
    const w = { setOpponent: (o) => venue.setOpponent(o), vs(o) { venue.vs(o); whip(o); }, setScores: venue.setScores, reveal: venue.reveal, setRound: venue.setRound, splash: venue.splash, cheer: venue.cheer, mood: venue.mood, setTheme: (n) => venue.setTheme(n), camera: setCamera, whip, release: () => setCamera(null), cameras: Object.keys(venue.cams) };
    Object.keys(w).forEach((k) => plug(k, w[k])); W.arena = venue; W.cameraName = () => cam.mode; W.previewVenue = previewVenue; W.camAt = (p, l, f) => { cam.mode = 'preview'; cam.tl = null; cam.to = { p, l, f: f || 50 }; cam.cur = cam.to; cam.t = 1; return true; };
    venue.onThemeChange = (n) => { if (lighting && lighting.setStageTheme) lighting.setStageTheme(n); }; if (lighting && lighting.setStageTheme) lighting.setStageTheme(venue.theme, true);
    if (W.player) { try { venue.attachPlayer({ object: W.player.object, play: (a, b) => W.player.play(a, b), setMood: (m) => { if (W.player.setMood) W.player.setMood(m); } }); W.player.object.position.set(-A.podiumX, A.podiumTop, A.podiumZ); } catch (e) { console.error('[arena] player ' + e); } }
  }
  // DEV / REVIEW: previewVenue('bar'|'showcase'|'booth'|'arena', opts) swaps the dressing for a rhythm venue (stage at z -12.4 like mg_rhythm), the player stands on it at 1.75x with a lane placeholder, camera = the rhythm play cam
  function previewVenue(name, o) {
    if (prev) { try { prev.dispose(); } catch (e) { /* ignore */ } prev = null; } const W = ctx.host && ctx.host.world;
    if (!name || (name === 'arena' && !o)) { venue.group.visible = true; setCamera('wide', { ms: 0 }); if (lighting) { lighting.setProfile('stage', true); lighting.setStageTheme(venue.theme, true); } if (W && W.player) { W.player.object.scale.setScalar(1); venue.rig.add(W.player.object); W.player.object.position.set(-A.podiumX, A.podiumTop, A.podiumZ); W.player.object.rotation.y = 1.05; } return venue; }
    if (W && W.controls) W.controls.update = () => {};
    venue.group.visible = false; prev = buildVenue(ctx, name, Object.assign({ Core, q: ctx.quality }, o || {})); prev.stageH = prev.options.stageH; ctx.scene.add(prev.group);
    if (lighting) { lighting.setProfile(prev.hint.profile, true); lighting.setStageTheme(prev.theme, true); }
    if (W && W.player) { const pp = W.player.object, an = prev.anchors; if (an.performer) { ctx.scene.add(pp); pp.scale.setScalar(1.75); pp.position.set(prev.group.position.x + an.performer.x, prev.stageH, prev.group.position.z + an.performer.z); pp.rotation.y = 0; } else { prev.attachPlayer({ object: pp, play: (a, b) => W.player.play(a, b) }); pp.scale.setScalar(1.75 / (prev.options.scale || 1)); prev.stageH = 0; }
      try { W.player.play('beatbox', { bpm: 100, amp: 0.8 }); } catch (e) { /* ignore */ } }
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(4.24, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color('#5a4a90'), transparent: true, opacity: 0.35, depthWrite: false })); lane.rotation.x = -Math.PI / 2; lane.position.set(0, 0.03, -2.4); ctx.scene.add(lane); prev.group.userData.lane = lane;
    const c = prev.cams.play; cam.mode = 'preview'; cam.to = { p: c.pos, l: c.look, f: c.fov || 52.4 }; cam.cur = cam.to; cam.t = 1; cam.tl = null; return prev;
  }
  const update = (dt, t) => { if (!inited) init(); tAbs = t; ctx.__arenaT = t; if (prev) prev.update(dt, t, { energy: 0.6, beat: (t * 100) / 60, spb: 0.6, approach: 1.43 }); else venue.update(dt, t, { energy: 0.5 }); };
  const terrain = { group: venue.group, previewVenue, interior: true, bounds: { minX: -9.2, maxX: 9.2, minZ: -5.5, maxZ: 9 }, blocked: () => true, heightAt, pathDist: () => 1e9, keepout: () => true, paths: [], spotDefs: [], anchors, lights: [], windows: [], ceilY: 12, camera: { dist: 14, pitch: 22, yaw: 0, fov: 50, minDist: 10, maxDist: 20, focusY: 1.6 }, update, stats: () => venue.stats(), venue };
  return { terrain, flora: null, npcSpecs: [], profile: 'stage', setBeat: (b) => venue.setBeat(b), update: (dt, t) => drive(dt, ctx.camera), dispose() { try { venue.dispose(); } catch (e) { /* ignore */ } } };
}
