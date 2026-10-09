// CINE (owner CINE): the cutscene engine. A data driven timeline that plays INSIDE whatever world the host has loaded (its set, its cast, its lights and post chain),
// or in the dedicated cutscene world 'cine' (w_cine.js). Portrait first (9:16), right on a landscape box too. Never blocks the game: every cue runs in a try/catch, a watchdog ends a
// stuck cine, skip always works, and the end restores the world exactly (actors back on their marks, camera blended back to the controls, timeScale 1, controls enabled).
// Full guide with recipes for the action vignette team: park3d/CINE.md.
//
//   import { createCine, createScreen } from './cine.js'        (the game loads it lazily: entry.js loadCine())
//   const cine = createCine(world, reel, opts)                  world = host world object (host.load resolves it), reel = { id, cast?, events: [...], end?, tail?, letterbox?, max? }
//   cine.play() -> Promise<{ id, skipped, t, errors, fired }>   cine.skip()  cine.tap()  cine.advance(sec)  cine.seek(sec) (run without rendering until sec real seconds into the reel)  cine.pause(b)  cine.end()  cine.state()  cine.actor(id)  cine.pulse  cine.dispose()
//   opts: { screen (createScreen(), else the cine makes and owns one), audio: { sfx(name, o), drum(id, o), now(), music(id, o), stop(fade) }, names: { id: 'Name' }, colors: { id: '#hex' },
//           looks: { id: look } (looks for spawned characters by id), reduce (reduce motion), low (low quality: no CSS blur), blendOut (ms, camera glides back to the controls at the end),
//           controls: false (leave the controls enabled), onCue(e, i), onFinish(info) (the last cue is done, the blend back starts), onEnd(info), max (watchdog seconds, default 240) }
//
// TIMELINE. reel.events is an ordered list. Each event starts at  t  (seconds on the reel clock) or  dt  after the previous event's start (default 0 = together with it).
// Blocking events (say, wait, and any event with wait:true) pause the reel clock until they finish, so a dialog scene reads in order: shot, say, say, shot, say.
// The reel clock runs in REAL seconds (a slow motion does not stretch it); camera moves and actors follow the world clock (they slow down with a speed ramp).
//
// CUES ({ do: <name>, ... }):
//   camera   shot  { on: 'hero'|'foxy'|[x,y,z]|['hero','foxy'], yaw (deg, relative to the actor's facing at the cut; 0 = in front of its face, 180 = behind), w (shot size: metres of frame
//                    width at the subject, 9:16 reference; the cast is 1.72 m tall with a 0.9 m head: ECU 0.7, CU 1.15, MCU 1.6, FS 2.4, WS 5) or dist (m), h (camera height), lookH, fov,
//                    shift (m, slides the frame sideways: subject to the left third with +), lift, roll (deg, dutch angle), rel (false: yaw in world degrees) }
//                  or { pos: [x,y,z], look: [x,y,z]|'hero'|'hero:head'|'hero:mouth', fov, roll }
//                  + to: { any of the same keys } with dur (s) and ease ('io' default, 'in', 'out', 'linear', 'soft', 'expo'): a dolly, crane, push in, orbit (lerp yaw) or a pull back
//                  + cut: 'cut' (default) | 'blend' (glide from the live camera, ms) | 'xfade' (true crossfade of the last frame, ms) | 'dip' (through a colour, ms, color) | 'whip' (fast blurred pan)
//                  + hand (handheld amplitude, m), shake: { amp, dur }
//                  + port: { any of the same keys, to } overrides for a portrait box (cam.aspect < 0.9): a phone held upright gets its own lens, distance or angle
//            shake { amp, dur }    blur { px, ms } (focus pull feel)    vignette { v, ms }    speed { v, ms } (time ramp: 0.25 = slow motion)
//   actors   place { who, at: [x,z], face, y }   walk { who, to: [x,z] | [[x,z],...], speed, run, face, then: clip, wait }   face { who, to: deg|'cam'|actor id|[x,z], ms }
//            clip { who, clip, opts }   mood { who, mood }   look { who, at: actor id|'id:head'|[x,y,z]|null }   prop { who, kind: 'box'|null, plant }   show { who, v }
//            spawn { id, look: look|'npcId', npc: 'beeamgee' (seated NPC behaviour), at, face, clip, opts }   despawn { id }
//            who: 'hero' (the player), a world NPC id (foxy, rohzel, beeamgee...), a park jam regular (mira, luca) or a spawned id. Face: degrees (0 = +z), 'cam', an actor id or a point.
//   words    say { who, name, text, mood, clip, dur, wait (default true) }   title { style: 'chapter'|'card'|'logo', text, sub, ms }   untitle { ms }   stamp { text: 'TUE 17:12|REC', ms }
//            word { text, at: actor id|'id:mouth'|[fx,fy], color, size, ms }   logo { text, sub, step (s per letter), drums: ['B','t',...], slam: true }
//   sound    sfx { name, o }   drum { id }   beat { who, pattern: 'B . t . K . t .', bpm, step (beats per token), words, rings, pulse }   music { id|null, fade }
//   light    light { time, weather, instant, theme }   pulse { v } (neon and stage lights on the beat)   cone { id, at, to, color, r, v } (a fake volumetric spot, v 0 fades it out)   flicker { ms }
//            fx { kind: 'rings'|'sparks'|'confetti'|'ripple', at, color, n }
//   screen   letterbox { v, ms }   dip { v, ms, color }   flash { color, ms }
//   flow     wait { s, tap }   call { fn(api) }   end {}
// Reel options: reel.cast = { id: { rest: { clip, opts } } } (the clip an actor goes back to at the end), reel.end = { hero: { at: [x,z], face } } (where the player stands afterwards),
//   reel.keep = ['id'] (actors that stay where the reel left them), reel.tail (seconds after the last cue, default 0.4), reel.max (watchdog).
import { THREE } from './kit.js';
import { createCharacter } from './characters.js';
import { createNPC, NPC_LOOKS } from './char_npc.js';
import { createScreen } from './cine_screen.js';
export { createScreen };

const D2R = Math.PI / 180, TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), lerp = (a, b, t) => a + (b - a) * t;
const wrapPi = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const nop = () => {};
export const EASE = { linear: (u) => u, in: (u) => u * u * u, out: (u) => 1 - Math.pow(1 - u, 3), io: (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2), soft: (u) => u * u * (3 - 2 * u), expo: (u) => (u >= 1 ? 1 : 1 - Math.pow(2, -10 * u)) };
const BLOCK = { say: 1, wait: 1 };
const NUM = ['yaw', 'dist', 'w', 'h', 'lookH', 'fov', 'shift', 'lift', 'roll'];
const HIT = { B: 'kick', b: 'kick', t: 'hat', K: 'snare', k: 'snare', Pf: 'snare', pf: 'snare', LR: 'kick' };
// speaker colours (the name chip of a subtitle)
export const COLORS = { hero: '#2ee6ff', foxy: '#9dff4a', beeamgee: '#ffd35c', bmg: '#ffd35c', pigpen: '#ff4f6a', rohzel: '#ffbe55', penny: '#ff6ec7', boss: '#c9c3dd', famous: '#fff6e8', mira: '#ffb703', luca: '#ff7b7b' };
// default line length in real seconds: typing at 40 cps plus a reading pause
export const lineDur = (text) => clamp(1.0 + String(text || '').length * 0.062, 2.0, 8.5);

export function createCine(world, reel, opts) {
  opts = opts || {}; reel = reel || { events: [] };
  const ctx = world.ctx, cam = (ctx && ctx.camera) || world.camera, scene = world.scene, host = world.host || ctx.host, A = opts.audio || {}, reduce = !!opts.reduce;
  const ownScreen = !opts.screen, scr = opts.screen || createScreen({ box: ctx.canvas && ctx.canvas.parentElement, canvas: ctx.canvas, reduce, low: opts.low });
  const events = (reel.events || []).filter(Boolean);
  const S = { T: 0, real: 0, wt: 0, i: 0, last: 0, block: null, done: false, skipped: false, ending: false, endT: -1, errors: 0, fired: 0, frames: 0, fast: false, rate: 1, rateFrom: 1, rateTo: 1, rateT: 1, rateMs: 0,
    pulse: 0, timers: [], line: null, title: null, started: false, resolve: null, promise: null, dead: false, out: null, xpend: null, ctrlWas: null, post: null };
  const actors = {}, fx = [], extras = [];
  const call = (f, ...a) => { try { if (typeof f === 'function') return f(...a); } catch (e) { console.error('[cine] audio/callback failed', e); } return undefined; };
  const later = (sec, fn) => S.timers.push({ at: S.real + sec, fn });

  // ---------------------------------------------------------------- actors
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
  function findWorldActor(id) {
    if (id === 'hero' || id === 'player') return world.player || null;
    const n = (world.npcs || []).find((x) => x && x.id === id); if (n) return n;
    const st = world.terrain && world.terrain.story, crew = st && st.jam && st.jam.crew; if (crew) { const c = crew.find((x) => x && x.id === id); if (c) return c; }
    return null;
  }
  function reg(id, c, own) {
    const o = c.object; o.updateMatrixWorld(true);
    const a = { id, c, o, own, save: own ? null : { x: o.position.x, y: o.position.y, z: o.position.z, r: o.rotation.y, vis: o.visible }, pos: null, y: null, rot: null, rotTo: null, turn: 8, walk: null, look: null, moved: false, touched: { clip: 0, mood: 0, prop: 0, look: 0 } };
    actors[id] = a; return a;
  }
  function actor(id) { if (!id) return null; if (actors[id]) return actors[id]; const c = findWorldActor(id); return c ? reg(id, c, false) : null; }
  const lookOf = (l) => (typeof l === 'string' ? (opts.looks && opts.looks[l]) || NPC_LOOKS[l] || null : l);
  function spawn(e) {
    if (actors[e.id]) return actors[e.id]; let c = null;
    if (e.npc) c = createNPC(ctx, e.npc, { look: lookOf(e.look || e.npc) || undefined });
    else c = createCharacter(ctx, lookOf(e.look) || NPC_LOOKS.foxy);
    c.object.userData.cineSpawn = 1; scene.add(c.object); const a = reg(e.id, c, true);
    if (e.at) placeAt(a, e.at, e.face, e.y); if (e.clip) c.play(e.clip, e.opts || {});
    return a;
  }
  function placeAt(a, at, face, y) {
    a.pos = [at[0], at[1]]; if (y !== undefined) a.y = y; a.moved = true; a.o.position.x = at[0]; a.o.position.z = at[1]; if (a.y !== null) a.o.position.y = a.y;
    if (face !== undefined) { a.rot = faceAngle(a, face); a.rotTo = null; a.o.rotation.y = a.rot; }
  }
  function faceAngle(a, f) {
    if (typeof f === 'number') return f * D2R;
    const p = a.o.getWorldPosition(v1);
    if (f === 'cam') return Math.atan2(cam.position.x - p.x, cam.position.z - p.z);
    if (Array.isArray(f)) return Math.atan2(f[0] - p.x, (f.length > 2 ? f[2] : f[1]) - p.z);
    const b = actor(f); if (b) { const q = b.o.getWorldPosition(v2); return Math.atan2(q.x - p.x, q.z - p.z); }
    return a.o.rotation.y;
  }
  // a world point: [x,y,z], 'id' (feet), 'id:head', 'id:mouth', 'id:top'
  function point(v, out, hy) {
    if (Array.isArray(v)) return out.set(v[0], v.length > 2 ? v[1] : 0, v.length > 2 ? v[2] : v[1]);
    if (typeof v === 'string') {
      const k = v.indexOf(':'), id = k >= 0 ? v.slice(0, k) : v, part = k >= 0 ? v.slice(k + 1) : '', a = actor(id); if (!a) return out.set(0, 1, 0);
      if (part && a.c.anchors && a.c.anchors[part]) { a.o.updateMatrixWorld(true); return a.c.anchors[part].getWorldPosition(out); }
      a.o.getWorldPosition(out); out.y += hy || 0; return out;
    }
    if (v && v.isVector3) return out.copy(v);
    return out.set(0, 1, 0);
  }
  function target(on, out) {
    if (Array.isArray(on) && typeof on[0] === 'string') { out.set(0, 0, 0); for (const id of on) out.add(point(id, v3)); return out.multiplyScalar(1 / on.length); }
    return point(on, out);
  }

  // ---------------------------------------------------------------- camera rig
  const pose = () => ({ p: new THREE.Vector3(), l: new THREE.Vector3(), fov: 38, roll: 0 });
  const C = { shot: null, blend: null, hand: 0, shakeA: 0, shakeT: 0, shakeD: 1, A: pose(), B: pose(), cur: pose(), q0: new THREE.Quaternion(), q1: new THREE.Quaternion(), live: false, fov: -1 };
  function baseYaw(spec) { if (spec.rel === false || spec.pos || !spec.on || Array.isArray(spec.on)) return 0; const a = actor(String(spec.on).split(':')[0]); return a ? (a.rotTo !== null ? a.rotTo : a.rot !== null ? a.rot : a.o.rotation.y) : 0; }
  function solve(spec, base, out) {
    if (spec.pos) { point(spec.pos, out.p); point(spec.look || [0, 1, 0], out.l, 1.2); }
    else {
      target(spec.on || [0, 0, 0], v1); const yaw = base + (spec.yaw || 0) * D2R, d = spec.w !== undefined ? fitDist(spec.w, spec.fov === undefined ? 38 : spec.fov) : spec.dist === undefined ? 4 : spec.dist;
      out.l.set(v1.x, v1.y + (spec.lookH === undefined ? 1.15 : spec.lookH), v1.z); out.p.set(v1.x + Math.sin(yaw) * d, v1.y + (spec.h === undefined ? 1.4 : spec.h), v1.z + Math.cos(yaw) * d);
    }
    if (spec.shift || spec.lift) { v2.subVectors(out.l, out.p).normalize(); v3.crossVectors(v2, up).normalize().multiplyScalar(spec.shift || 0); out.p.add(v3); out.l.add(v3); out.p.y += spec.lift || 0; out.l.y += spec.lift || 0; }
    out.fov = spec.fov === undefined ? 38 : spec.fov; out.roll = (spec.roll || 0) * D2R; return out;
  }
  // shot size by width: the camera distance at which a frame `w` metres wide fits the subject plane. The aspect is capped at 9:16, so a landscape box keeps the portrait framing
  // (same subject height, more room left and right) and a phone narrower than 9:16 steps back until the width still fits.
  // FRAME: every width-framed shot (films and vignettes) is pulled back by this much, so a medium shot shows the whole figure with room around it
  // (the owner found the shots too close). Close ups keep their size relative to the others. A landscape box (a film gone wide on desktop) steps back
  // a little more (FRAME_LAND), since the 9:16 cap would otherwise keep the phone's subject height on a wide screen.
  const FRAME = 1.35, FRAME_LAND = 1.25;
  function fitDist(w, fov) { const a = Math.min(cam.aspect > 0 ? cam.aspect : 0.5625, 0.5625), k = FRAME * (cam.aspect > 1 ? FRAME_LAND : 1); return w * k / (2 * Math.tan(fov * D2R / 2) * a); }
  function mix(a, b, e) { const m = Object.assign({}, a, b); for (const k of NUM) if (a[k] !== undefined || b[k] !== undefined) { const x = a[k] === undefined ? DEF[k] : a[k], y = b[k] === undefined ? x : b[k]; m[k] = lerp(x, y, e); } if (Array.isArray(a.pos) && Array.isArray(b.pos)) m.pos = a.pos.map((x, i) => lerp(x, b.pos[i], e)); if (Array.isArray(a.look) && Array.isArray(b.look)) m.look = a.look.map((x, i) => lerp(x, b.look[i], e)); return m; }
  const DEF = { yaw: 0, dist: 4, w: 1.6, h: 1.4, lookH: 1.15, fov: 38, shift: 0, lift: 0, roll: 0 };
  function setShot(e) {
    // port: { ...keys, to: {...} } replaces keys of the shot on a portrait box (a phone held upright), for frames that need a different lens or distance there
    const port = e.port && cam.aspect > 0 && cam.aspect < 0.9 ? e.port : null;
    const spec = Object.assign({}, e, port || {}); delete spec.do; delete spec.t; delete spec.dt; delete spec.port; if (port && port.pos) delete spec.on; if (port && port.on) { delete spec.pos; delete spec.look; } const to = port && port.to ? Object.assign({}, e.to || {}, port.to) : e.to || null; delete spec.to;
    const paramMode = !!to && !to.pos && !spec.pos && (to.on === undefined || JSON.stringify(to.on) === JSON.stringify(spec.on)) && !(to.look && !Array.isArray(to.look));
    C.shot = { a: spec, b: to, dur: Math.max(0.001, e.dur || 0), u: to ? 0 : 1, ease: EASE[e.ease || 'io'] || EASE.io, base: baseYaw(spec), baseB: to ? baseYaw(Object.assign({}, spec, to)) : 0, paramMode };
    C.hand = reduce ? 0 : (e.hand || 0); if (e.shake && !reduce) { C.shakeA = e.shake.amp || 0.05; C.shakeD = C.shakeT = e.shake.dur || 0.4; }
  }
  function grabLive(dst) { dst.p.copy(cam.position); cam.getWorldDirection(v1); dst.l.copy(cam.position).add(v1); dst.fov = cam.fov; dst.roll = 0; C.q0.copy(cam.quaternion); return dst; }
  function startBlend(ms, ease) { C.blend = { from: grabLive(pose()), q: C.q0.clone(), fov: cam.fov, u: 0, ms: Math.max(1, ms), ease: EASE[ease || 'io'] || EASE.io }; }
  function applyPose(P, wt) {
    let hx = 0, hy = 0, hz = 0;
    if (C.hand) { const t = S.real; hx = C.hand * (Math.sin(t * 1.13) + 0.5 * Math.sin(t * 2.71 + 1.3)); hy = C.hand * 0.6 * (Math.sin(t * 1.71 + 2.1) + 0.5 * Math.sin(t * 3.07)); hz = C.hand * 0.4 * Math.sin(t * 0.93 + 0.4); }
    if (C.shakeT > 0) { const k = C.shakeA * (C.shakeT / C.shakeD); hx += (Math.random() - 0.5) * 2 * k; hy += (Math.random() - 0.5) * 2 * k; }
    cam.position.set(P.p.x + hx * 0.35, P.p.y + hy * 0.35, P.p.z + hz * 0.35); cam.up.set(0, 1, 0); cam.lookAt(P.l.x + hx, P.l.y + hy, P.l.z + hz); if (P.roll) cam.rotateZ(P.roll);
    let fov = P.fov;
    if (C.blend) { const b = C.blend; b.u = Math.min(1, b.u + wt * 1000 / b.ms); const k = b.ease(b.u); cam.position.lerpVectors(b.from.p, cam.position, k); C.q1.copy(cam.quaternion); cam.quaternion.copy(b.q).slerp(C.q1, k); fov = lerp(b.fov, fov, k); if (b.u >= 1) C.blend = null; }
    if (Math.abs(cam.fov - fov) > 1e-4 || C.fov !== fov) { cam.fov = fov; C.fov = fov; } cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
  }
  function camStep(wt) {
    const sh = C.shot; if (!sh) return; if (sh.b && sh.u < 1) sh.u = Math.min(1, sh.u + wt / sh.dur); const e = sh.b ? sh.ease(sh.u) : 1;
    if (!sh.b) solve(sh.a, sh.base, C.cur);
    else if (sh.paramMode) solve(mix(sh.a, sh.b, e), lerp(sh.base, sh.base + wrapPi(sh.baseB - sh.base), e), C.cur);
    else { solve(sh.a, sh.base, C.A); solve(Object.assign({}, sh.a, sh.b), sh.baseB, C.B); C.cur.p.lerpVectors(C.A.p, C.B.p, e); C.cur.l.lerpVectors(C.A.l, C.B.l, e); C.cur.fov = lerp(C.A.fov, C.B.fov, e); C.cur.roll = lerp(C.A.roll, C.B.roll, e); }
    if (C.shakeT > 0) C.shakeT = Math.max(0, C.shakeT - wt);
    applyPose(C.cur, wt); C.live = true;
  }
  function shotCue(e) {
    const cut = reduce && e.cut === 'whip' ? 'cut' : (e.cut || 'cut'), ms = e.ms || (cut === 'whip' ? 260 : cut === 'dip' ? 700 : 600);
    if (cut === 'xfade' && !S.fast) { S.xpend = { e, ms }; return; }
    if (cut === 'dip' && !S.fast) { scr.dip(1, ms / 2, e.color); later(ms / 2000, () => { setShot(e); C.blend = null; scr.dip(0, ms / 2, e.color); }); return; }
    if ((cut === 'blend' || cut === 'whip') && C.live && !S.fast) { startBlend(ms, cut === 'whip' ? 'io' : e.blendEase); if (cut === 'whip') { scr.blur(3, 60); later(ms / 1000 * 0.7, () => scr.blur(0, 160)); } }
    else C.blend = null;
    setShot(e);
  }

  // ---------------------------------------------------------------- fx: sound rings, sparks, ripples, cones (all additive, created on first use)
  const FXC = { rings: null, sparks: null, cones: {} };
  const addMat = (color, o) => new THREE.MeshBasicMaterial(Object.assign({ color: new THREE.Color(color), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide, fog: false }, o));
  function ringFx(at, color, flat, n) {
    if (!FXC.rings) { FXC.rings = { g: new THREE.RingGeometry(0.86, 1, 48), list: [] }; }
    for (let i = 0; i < (n || 1); i++) {
      const m = new THREE.Mesh(FXC.rings.g, addMat(color || '#2ee6ff', { opacity: 0 })); m.renderOrder = 6; point(at, m.position); if (flat) { m.rotation.x = -Math.PI / 2; m.position.y += 0.04; }
      scene.add(m); FXC.rings.list.push({ m, t: -i * 0.12, life: flat ? 1.6 : 0.9, flat, s0: flat ? 0.15 : 0.08, s1: flat ? 2.2 : 0.9 });
    }
  }
  function sparkFx(at, color, n, kind) {
    const N = Math.min(120, n || 60), g = new THREE.BufferGeometry(), pos = new Float32Array(N * 3), col = new Float32Array(N * 3), vel = new Float32Array(N * 3), c = new THREE.Color();
    const pal = kind === 'confetti' ? ['#ffd35c', '#ff3ea5', '#2ee6ff', '#9dff4a', '#fff6e8'] : [color || '#ffd35c']; point(at, v1);
    for (let i = 0; i < N; i++) { pos.set([v1.x, v1.y, v1.z], i * 3); const a = Math.random() * TAU, s = (kind === 'confetti' ? 2.5 : 1.6) * (0.4 + Math.random()), u = (kind === 'confetti' ? 3.5 : 1.8) * (0.3 + Math.random()); vel.set([Math.cos(a) * s, u, Math.sin(a) * s], i * 3); c.set(pal[i % pal.length]); col.set([c.r, c.g, c.b], i * 3); }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Points(g, new THREE.PointsMaterial({ size: kind === 'confetti' ? 0.09 : 0.06, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
    m.frustumCulled = false; m.renderOrder = 6; scene.add(m); fx.push({ m, vel, t: 0, life: kind === 'confetti' ? 2.6 : 1.3, grav: kind === 'confetti' ? 2.2 : 3.5, drag: kind === 'confetti' ? 1.6 : 0.6 });
  }
  function coneCue(e) {
    const id = e.id || 'spot'; let k = FXC.cones[id];
    if (!k) {
      const r = e.r || 1.1, g = new THREE.Group(), h = 6, cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 28, 1, true), addMat(e.color || '#fff1c9', { opacity: 0 })); cone.geometry.translate(0, -h / 2, 0); cone.renderOrder = 5;
      const pool = new THREE.Mesh(new THREE.CircleGeometry(r * 1.05, 32), addMat(e.color || '#fff1c9', { opacity: 0 })); pool.rotation.x = -Math.PI / 2; pool.renderOrder = 5;
      g.add(cone); scene.add(g, pool); k = FXC.cones[id] = { g, cone, pool, h, v: 0, vt: 0, to: null };
    }
    if (e.at) point(e.at, k.g.position); if (e.to !== undefined) k.to = e.to; k.vt = e.v === undefined ? 1 : e.v; k.ms = e.ms || 500;
  }
  function fxStep(wt) {
    if (FXC.rings) for (let i = FXC.rings.list.length - 1; i >= 0; i--) { const r = FXC.rings.list[i]; r.t += wt; const u = clamp(r.t / r.life, 0, 1); r.m.visible = r.t >= 0; if (!r.flat) r.m.quaternion.copy(cam.quaternion); r.m.scale.setScalar(lerp(r.s0, r.s1, EASE.out(u))); r.m.material.opacity = r.t < 0 ? 0 : (1 - u) * (r.flat ? 0.7 : 0.9); if (u >= 1) { scene.remove(r.m); r.m.material.dispose(); FXC.rings.list.splice(i, 1); } }
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i]; f.t += wt; const p = f.m.geometry.attributes.position, a = p.array, n = a.length / 3, dr = Math.exp(-f.drag * wt);
      for (let j = 0; j < n; j++) { f.vel[j * 3 + 1] -= f.grav * wt; f.vel[j * 3] *= dr; f.vel[j * 3 + 2] *= dr; a[j * 3] += f.vel[j * 3] * wt; a[j * 3 + 1] = Math.max(0.02, a[j * 3 + 1] + f.vel[j * 3 + 1] * wt); a[j * 3 + 2] += f.vel[j * 3 + 2] * wt; }
      p.needsUpdate = true; f.m.material.opacity = 1 - clamp((f.t - f.life * 0.6) / (f.life * 0.4), 0, 1);
      if (f.t >= f.life) { scene.remove(f.m); f.m.geometry.dispose(); f.m.material.dispose(); fx.splice(i, 1); }
    }
    for (const id in FXC.cones) {
      const k = FXC.cones[id]; k.v += (k.vt - k.v) * (1 - Math.exp(-wt * 1000 / Math.max(60, k.ms) * 2.2)); const o = k.v * (0.11 + 0.012 * Math.sin(S.real * 9.3) + 0.09 * S.pulse);
      if (k.to) point(k.to, v1); else v1.set(k.g.position.x, 0, k.g.position.z);
      v2.subVectors(v1, k.g.position); const len = Math.max(0.5, v2.length()); k.g.quaternion.setFromUnitVectors(DOWN, v2.normalize()); k.cone.scale.set(1, len / k.h, 1); k.pool.position.set(v1.x, v1.y + 0.03, v1.z);
      k.cone.material.opacity = o * 0.32; k.pool.material.opacity = o * 0.9; k.g.visible = k.pool.visible = k.v > 0.01;
    }
  }

  // ---------------------------------------------------------------- actors per frame
  function actorStep(wt, t) {
    for (const id in actors) {
      const a = actors[id];
      if (a.walk) {
        const w = a.walk, p = w.pts[w.i], dx = p[0] - a.pos[0], dz = p[1] - a.pos[1], d = Math.hypot(dx, dz), s = w.speed * wt;
        if (d <= s || d < 1e-3) { a.pos[0] = p[0]; a.pos[1] = p[1]; w.i++; if (w.i >= w.pts.length) { a.walk = null; call(() => a.c.play(w.then || (w.prop ? 'hold' : 'idle'), w.prop ? { prop: w.prop, speed: 0 } : {})); if (w.face !== undefined) { a.rotTo = faceAngle(a, w.face); } if (w.done) w.done(); } }
        else { a.pos[0] += dx / d * s; a.pos[1] += dz / d * s; a.rotTo = Math.atan2(dx, dz); }
      }
      if (a.rotTo !== null) { if (a.rot === null) a.rot = a.o.rotation.y; const dr = wrapPi(a.rotTo - a.rot); a.rot += dr * (1 - Math.exp(-a.turn * wt)); if (Math.abs(dr) < 0.002) { a.rot = a.rotTo; a.rotTo = null; } }
      if (a.pos) { a.o.position.x = a.pos[0]; a.o.position.z = a.pos[1]; if (a.y !== null) a.o.position.y = a.y; else if (a.own && world.terrain && world.terrain.heightAt) { const h = world.terrain.heightAt(a.pos[0], a.pos[1]); if (isFinite(h)) a.o.position.y = h; } }
      if (a.rot !== null) a.o.rotation.y = a.rot;
      if (a.look) { a.c.lookAt(point(a.look, a.lookV || (a.lookV = new THREE.Vector3()), 1.45)); }
      if (a.own) a.c.update(wt, t);
    }
  }

  // ---------------------------------------------------------------- beats (audio scheduled ahead, animation and pulses on the reel clock)
  function beatCue(e) {
    const who = e.who ? actor(e.who) : null, bpm = e.bpm || 92, step = 60 / bpm * (e.step || 0.5), toks = String(e.pattern || 'B').trim().split(/\s+/), now = call(A.now) || 0;
    if (who && e.clip !== false) call(() => who.c.play('beatbox', { external: true, bpm, amp: 0.9 }));
    toks.forEach((tk, i) => {
      if (tk === '.' || tk === '-') return; const id = tk === 'P' ? 'Pf' : tk, when = i * step;
      if (!S.fast) call(A.drum, id, { when: now + when + 0.03, vel: e.vel || 0.95 });
      later(when, () => {
        if (who && who.c.hit) call(() => who.c.hit(HIT[id] || 'kick', id === 't' ? 0.6 : 1));
        if (e.pulse !== false) S.pulse = id === 't' ? Math.max(S.pulse, 0.45) : 1;
        if (e.rings && who) ringFx(e.who + ':mouth', id === 'B' ? '#ff3ea5' : id === 't' ? '#2ee6ff' : '#ffd35c', false, 1);
        if (e.words && who) wordCue({ text: id === 'Pf' ? 'Pf' : id, at: e.who + ':mouth', size: id === 't' ? 3.4 : 5.4, color: id === 'B' ? '#ffd35c' : id === 't' ? '#2ee6ff' : '#ff3ea5', ms: 700, jitter: true });
      });
    });
    return toks.length * step;
  }
  function wordCue(e) {
    let x = 0.5, y = 0.42;
    if (Array.isArray(e.at) && e.at.length === 2) { x = e.at[0]; y = e.at[1]; }
    else if (e.at) { point(e.at, v1); v1.project(cam); x = (v1.x + 1) / 2; y = (1 - v1.y) / 2; }
    if (e.jitter) { x += (Math.random() - 0.5) * 0.22; y -= 0.06 + Math.random() * 0.1; }
    scr.word(e.text, clamp(x, 0.08, 0.92), clamp(y, 0.12, 0.85), { color: e.color, size: e.size, ms: e.ms, rot: e.rot !== undefined ? e.rot : e.jitter ? (Math.random() - 0.5) * 18 : 0 });
  }
  function logoCue(e) {
    const h = scr.title({ style: 'logo', text: e.text || 'BEATBOX HEROES', sub: e.sub }); S.title = h; const n = h.letters, step = reduce ? 0 : (e.step || 0.13), drums = e.drums || ['B', 't', 'K', 't', 'B', 'B', 'K', 'B', 't', 'K', 't', 'B', 'Pf'], now = call(A.now) || 0;
    for (let i = 0; i < n; i++) { const id = drums[i % drums.length]; if (!S.fast && !reduce) call(A.drum, id, { when: now + i * step + 0.03, vel: 0.9 }); later(i * step, () => { h.land(i); S.pulse = 1; }); }
    if (e.slam !== false) later(n * step + (e.hold || 0.25), () => { h.slam(); if (!reduce) { scr.flash('#fff6e8', 420); C.shakeA = 0.06; C.shakeD = C.shakeT = 0.45; } call(A.drum, 'B', { vel: 1 }); call(A.sfx, e.sfx || 'crowd_cheer'); S.pulse = 1; });
    return n * step + 0.6;
  }

  // ---------------------------------------------------------------- cues
  function say(e) {
    const a = e.who ? actor(e.who) : null, name = e.name !== undefined ? e.name : e.who ? ((opts.names && opts.names[e.who]) || e.who.toUpperCase()) : '';
    if (a && e.mood) { call(() => a.c.setMood(e.mood)); a.touched.mood = 1; }
    if (a && e.clip) { call(() => a.c.play(e.clip, e.opts || {})); a.touched.clip = 1; }
    const typer = scr.sub({ name, text: e.text, color: e.color || (opts.colors && opts.colors[e.who]) || COLORS[e.who] || '#ffd35c', kind: e.who ? '' : 'narr' }, { cps: S.fast ? 0 : 40, onChar: () => call(A.sfx, 'click', { quiet: true, pitch: 1.5 }) });
    const dur = e.dur || lineDur(e.text), t0 = S.real; S.line = { typer, e };
    return { done: () => S.real - t0 >= dur, tap() { if (!typer.done()) { typer.finish(); return false; } return true; }, end() { if (S.line && S.line.typer === typer) { S.line = null; if (e.clear !== false) scr.clearSub(220); } if (a && e.clip && e.after) call(() => a.c.play(e.after, {})); } };
  }
  const CUE = {
    shot: shotCue,
    shake(e) { if (!reduce) { C.shakeA = e.amp || 0.06; C.shakeD = C.shakeT = e.dur || 0.4; } },
    blur(e) { scr.blur(e.px || 0, e.ms || 500); },
    vignette(e) { scr.vignette(e.v === undefined ? 1 : e.v, e.ms); },
    letterbox(e) { scr.letterbox(e.v === undefined ? 'scope' : e.v, e.ms); },
    dip(e) { scr.dip(e.v === undefined ? 1 : e.v, e.ms || 600, e.color); },
    flash(e) { scr.flash(e.color, e.ms); },
    flicker(e) { scr.flicker(e.ms || 500); const set = ctx.cineSet; if (set && set.flicker) set.flicker(e.ms || 500); },
    speed(e) { if (reduce) return; S.rateFrom = S.rate; S.rateTo = clamp(e.v === undefined ? 1 : e.v, 0.05, 2); S.rateMs = e.ms || 400; S.rateT = 0; },
    place(e) { const a = actor(e.who); if (a) placeAt(a, e.at || [a.o.position.x, a.o.position.z], e.face, e.y); },
    walk(e) {
      const a = actor(e.who); if (!a) return null; if (!a.pos) a.pos = [a.o.position.x, a.o.position.z]; a.moved = true; a.touched.clip = 1;
      const pts = Array.isArray(e.to[0]) ? e.to : [e.to], speed = e.speed || (e.run ? 4.2 : 1.35), prop = e.prop || (a.c.propKind || null), w = a.walk = { pts, i: 0, speed, then: e.then, face: e.face, prop, done: null };
      call(() => a.c.play(prop ? 'hold' : e.run ? 'run' : 'walk', prop ? { prop, speed } : { speed }));
      let fin = false; w.done = () => { fin = true; }; return { done: () => fin || a.walk !== w };
    },
    face(e) { const a = actor(e.who); if (!a) return; a.rotTo = faceAngle(a, e.to); if (a.rot === null) a.rot = a.o.rotation.y; a.turn = e.ms ? 4000 / e.ms : 8; if (e.ms === 0) { a.rot = a.rotTo; a.rotTo = null; } },
    clip(e) { const a = actor(e.who); if (a) { a.c.play(e.clip, e.opts || {}); a.touched.clip = 1; } },
    mood(e) { const a = actor(e.who); if (a && a.c.setMood) { a.c.setMood(e.mood || 'neutral', !!e.instant); a.touched.mood = 1; } },
    look(e) { const a = actor(e.who); if (a) { a.look = e.at === undefined ? null : e.at; a.touched.look = 1; if (!a.look) a.c.lookAt(null); } },
    prop(e) {
      const a = actor(e.who); if (!a || !a.c.setProp) return;
      // drop: the prop leaves the hands and stays where it is (on the floor, y = e.y), it is removed with the reel
      if (e.drop && a.c.prop) { const g = a.c.prop; g.updateMatrixWorld(true); g.getWorldPosition(v1); const yaw = a.o.rotation.y; if (a.c.anim && a.c.anim.setProp) a.c.anim.setProp(null); a.c.prop = null; a.c.propKind = null; g.position.set(v1.x, e.y === undefined ? 0.11 : e.y, v1.z); g.rotation.set(0, yaw, 0); scene.add(g); extras.push(g); a.touched.prop = 1; a.c.play(e.then || 'idle', {}); return; }
      a.c.setProp(e.kind || null, e.opts); a.touched.prop = 1;
      if (e.kind && e.plant && a.c.prop) { const pl = plant(); pl.position.set(0.04, 0.115, -0.03); a.c.prop.add(pl); extras.push(pl); }
      if (e.kind && e.hold !== false) { a.c.play('hold', { prop: e.kind }); a.touched.clip = 1; }
    },
    show(e) { const a = actor(e.who); if (a) a.o.visible = e.v !== false; },
    spawn(e) { spawn(e); },
    despawn(e) { const a = actors[e.id]; if (a && a.own) { call(() => a.c.dispose()); delete actors[e.id]; } },
    say,
    title(e) { if (S.title) S.title.out(250); S.title = scr.title(e); },
    untitle(e) { if (S.title) { S.title.out(e.ms); S.title = null; } },
    stamp(e) { scr.stamp(e.text, e.ms); S.stamped = !!e.text; },
    word: wordCue,
    logo(e) { const end = S.real + logoCue(e); return e.wait ? { done: () => S.real >= end } : null; },
    sfx(e) { if (!S.fast) call(A.sfx, e.name, e.o || {}); },
    drum(e) { if (!S.fast) call(A.drum, e.id || 'B', { vel: e.vel || 1 }); if (e.who) { const a = actor(e.who); if (a && a.c.hit) call(() => a.c.hit(HIT[e.id] || 'kick', 1)); } if (e.pulse !== false) S.pulse = 1; if (e.rings && e.who) ringFx(e.who + ':mouth', e.color || '#ff3ea5', false, e.rings === true ? 2 : e.rings); },
    beat(e) { const d = beatCue(e); if (e.wait) { const end = S.real + d; return { done: () => S.real >= end }; } return null; },
    music(e) { if (S.fast) return; if (e.id) call(A.music, e.id, { fade: e.fade === undefined ? 1 : e.fade }); else call(A.stop, e.fade === undefined ? 1 : e.fade); },
    light(e) { if (e.time !== undefined) call(() => world.setTime(e.time, !!e.instant)); if (e.weather) call(() => world.setWeather(e.weather)); if (e.theme && world.lighting && world.lighting.setStageTheme) call(() => world.lighting.setStageTheme(e.theme, !!e.instant)); },
    pulse(e) { S.pulse = e.v === undefined ? 1 : e.v; },
    cone: coneCue,
    fx(e) { const k = e.kind || 'sparks'; if (k === 'rings') ringFx(e.at || 'hero:mouth', e.color, false, e.n || 2); else if (k === 'ripple') ringFx(e.at || 'hero', e.color || '#9fd8ff', true, e.n || 1); else sparkFx(e.at || 'hero:head', e.color, e.n, k); },
    wait(e) { const end = S.real + (e.s === undefined ? (e.tap ? 1e9 : 1) : e.s); let tapped = false; return { done: () => tapped || S.real >= end, tap() { if (e.tap) tapped = true; return !!e.tap; } }; },
    call(e) { return e.fn ? e.fn(api) : null; },
    end() { S.i = events.length; },
  };
  // a small potted plant (rides on the cardboard box: "a box, a plant and $40")
  function plant() {
    const g = new THREE.Group(), pot = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.07, 8), new THREE.MeshLambertMaterial({ color: '#c0623a', flatShading: true }));
    pot.position.y = 0.035; g.add(pot); const lm = new THREE.MeshLambertMaterial({ color: '#3fae5a', flatShading: true });
    for (let i = 0; i < 5; i++) { const l = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.13, 4), lm); const a = i / 5 * TAU; l.position.set(Math.cos(a) * 0.02, 0.12, Math.sin(a) * 0.02); l.rotation.set(Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45); g.add(l); }
    return g;
  }

  // ---------------------------------------------------------------- the clock
  function startOf(e) { return e.t !== undefined ? e.t : S.last + (e.dt || 0); }
  function fire(e, idx) {
    S.fired++; if (opts.onCue) call(opts.onCue, e, idx);
    let r = null; try { const f = CUE[e.do]; if (!f) { console.warn('[cine] unknown cue ' + e.do); return; } r = f(e); } catch (err) { S.errors++; console.error('[cine] cue ' + e.do + ' failed in ' + (reel.id || 'reel'), err); r = null; }
    const blocks = e.wait !== undefined ? !!e.wait : !!BLOCK[e.do];
    if (blocks && r && typeof r.done === 'function') S.block = r;
  }
  function timeline(rdt) {
    if (S.block) { let d = false; try { d = S.block.done(); } catch (err) { d = true; } if (d) { const b = S.block; S.block = null; call(() => b.end && b.end()); } }
    if (!S.block) S.T += rdt;
    while (!S.block && S.i < events.length) { const e = events[S.i], st = startOf(e); if (S.T < st) break; S.last = st; S.i++; fire(e, S.i - 1); }
    if (!S.block && S.i >= events.length && S.endT < 0) S.endT = S.T + (reel.tail === undefined ? 0.4 : reel.tail);
    if (S.endT >= 0 && S.T >= S.endT && !S.block) finish(false);
  }
  function step(wdt, rdt, t) {
    if (S.done) return; S.frames++;
    if (S.paused) { actorStep(0, t); camStep(0); return; }
    S.real += rdt; S.wt += wdt;
    for (let i = S.timers.length - 1; i >= 0; i--) { const tm = S.timers[i]; if (S.real >= tm.at) { S.timers.splice(i, 1); try { tm.fn(); } catch (err) { S.errors++; console.error('[cine] timer failed', err); } } }
    if (S.rateT < 1) { S.rateT = Math.min(1, S.rateT + rdt * 1000 / Math.max(1, S.rateMs)); S.rate = lerp(S.rateFrom, S.rateTo, EASE.io(S.rateT)); if (host) host.timeScale = S.rate; }
    timeline(rdt); if (S.done) return;
    actorStep(wdt, t); camStep(wdt); fxStep(wdt);
    S.pulse *= Math.exp(-rdt * 5); if (S.pulse < 0.004) S.pulse = 0; if (opts.beatDirect !== false && world.setBeat) call(() => world.setBeat(S.pulse));
    if (S.real > (reel.max || opts.max || 240)) { console.warn('[cine] watchdog ended ' + (reel.id || 'reel')); finish(true); }
    if (S.frames % 20 === 0) scr.layout();
  }
  // the end: restore everything the reel touched, then (optionally) glide the camera back to the controls
  function finish(skipped) {
    if (S.done) return; S.done = true; S.skipped = S.skipped || skipped;
    if (S.line) { S.line.typer.finish(); scr.clearSub(200); S.line = null; } if (S.title && S.skipped) { S.title.out(200); S.title = null; }
    const keep = reel.keep || [], endHero = reel.end && reel.end.hero, ctl = world.controls;
    for (const id in actors) {
      const a = actors[id]; if (a.own) { call(() => a.c.dispose()); continue; }
      const kept = keep.indexOf(id) >= 0;
      if (a.touched.look) call(() => a.c.lookAt(null)); if (a.touched.mood && !kept) call(() => a.c.setMood('neutral')); if (a.touched.prop && !kept) call(() => a.c.setProp(null));
      const rest = reel.cast && reel.cast[id] && reel.cast[id].rest;
      if (a.touched.clip || a.touched.prop) call(() => a.c.play(rest ? rest.clip : 'idle', rest ? rest.opts || {} : {}));
      if (id === 'hero' && endHero && ctl && ctl.teleportTo) { const f = endHero.face === undefined ? undefined : endHero.face * D2R; call(() => ctl.teleportTo(endHero.at[0], endHero.at[1], { face: f, free: true })); continue; }
      if (kept || !a.save) continue;
      if (a.moved || a.rot !== null) { a.o.position.set(a.save.x, a.save.y, a.save.z); a.o.rotation.y = a.save.r; if (id === 'hero' && a.moved && ctl && ctl.teleportTo) call(() => ctl.teleportTo(a.save.x, a.save.z, { face: a.save.r })); }
      a.o.visible = a.save.vis;
    }
    for (const k in actors) delete actors[k];
    extras.forEach((m) => { if (m.parent) m.parent.remove(m); m.traverse((x) => { if (x.geometry) x.geometry.dispose(); if (x.material && !(x.material.userData && x.material.userData.persist) && !x.userData.sharedMat) x.material.dispose(); }); }); extras.length = 0;
    cleanFx();
    if (host) host.timeScale = 1; if (world.setBeat) call(() => world.setBeat(0));
    if (S.spotsVis !== undefined && world.spots && world.spots.group) world.spots.group.visible = S.spotsVis; if (S.stamped) scr.stamp('');
    if (S.ctrlWas !== null && ctl && ctl.setEnabled) call(() => ctl.setEnabled(S.ctrlWas));
    scr.blur(0, 200);
    const info = { id: reel.id || '', skipped: S.skipped, t: +S.real.toFixed(2), errors: S.errors, fired: S.fired };
    const blendMs = !S.skipped && opts.blendOut && C.live ? opts.blendOut : 0; call(opts.onFinish, info);
    if (blendMs) { S.out = { from: grabLive(pose()), q: cam.quaternion.clone(), fov: cam.fov, u: 0, ms: blendMs, info }; } else close(info);
  }
  function close(info) { S.out = null; detach(); if (ownScreen) scr.dispose(); call(opts.onEnd, info); if (S.resolve) { const r = S.resolve; S.resolve = null; r(info); } }
  function cleanFx() {
    if (FXC.rings) { FXC.rings.list.forEach((r) => { scene.remove(r.m); r.m.material.dispose(); }); FXC.rings.g.dispose(); FXC.rings = null; }
    fx.forEach((f) => { scene.remove(f.m); f.m.geometry.dispose(); f.m.material.dispose(); }); fx.length = 0;
    for (const id in FXC.cones) { const k = FXC.cones[id]; scene.remove(k.g, k.pool); [k.cone, k.pool].forEach((m) => { m.geometry.dispose(); m.material.dispose(); }); delete FXC.cones[id]; }
  }
  // the blend back to the controls camera (the controls have already placed the camera this frame: glide from our last pose to it)
  function outStep(wdt) {
    // real time, not frame time: a slow first frame after a build must not stretch the glide back
    const o = S.out; if (!o.t0) o.t0 = performance.now(); o.u = Math.min(1, Math.max(o.u + wdt * 1000 / o.ms, (performance.now() - o.t0) / o.ms)); const k = EASE.io(o.u);
    C.q1.copy(cam.quaternion); v1.copy(cam.position); const f1 = cam.fov;
    cam.position.lerpVectors(o.from.p, v1, k); cam.quaternion.copy(o.q).slerp(C.q1, k); cam.fov = lerp(o.fov, f1, k); cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    if (o.u >= 1) close(o.info);
  }

  // ---------------------------------------------------------------- frame hooks
  let offPre = null, offPost = null;
  const scale = () => (host && host.timeScale > 0 ? host.timeScale : 1);
  function pre(dt, t) { if (S.out) { outStep(dt / scale()); return; } if (!S.done && S.started) step(dt, dt / scale(), t); }
  function postHook() { if (S.xpend && !S.done) { const x = S.xpend; S.xpend = null; scr.xfade(x.ms); C.blend = null; setShot(x.e); } }
  function attach() { if (offPre || !world.onFrame) return; offPre = world.onFrame(pre, 'pre'); offPost = world.onFrame(postHook, 'post'); }
  function detach() { if (offPre) offPre(); if (offPost) offPost(); offPre = offPost = null; S.dead = true; }

  const api = {
    id: reel.id || '', world, screen: scr, camera: cam, actor, names: opts.names || {}, spawn: (e) => spawn(e), point: (v) => point(v, new THREE.Vector3()), set: ctx.cineSet || null,
    get pulse() { return S.pulse; }, get done() { return S.done; }, get T() { return S.T; },
    play() {
      if (S.promise) return S.promise;
      S.promise = new Promise((res) => { S.resolve = res; });
      const ctl = world.controls; if (opts.controls !== false && ctl && ctl.setEnabled) { S.ctrlWas = ctl.enabled !== undefined ? !!ctl.enabled : true; call(() => ctl.setEnabled(false)); }
      if (reel.letterbox !== undefined) scr.letterbox(reel.letterbox, reel.letterboxMs);
      if (opts.hideSpots !== false && world.spots && world.spots.group) { S.spotsVis = world.spots.group.visible; world.spots.group.visible = false; }
      // the world goes away under the film (a scene change, a context loss): end at once, nothing to restore
      if (world.events && world.events.on) world.events.on('unload', () => { if (S.dead) return; S.skipped = true; if (!S.done) finish(true); if (S.out) close(S.out.info); });
      S.started = true; attach(); if (!world.onFrame) { console.error('[cine] the world has no onFrame hook'); finish(true); }
      return S.promise;
    },
    skip() { if (S.done) { if (S.out) close(S.out.info); return; } S.skipped = true; finish(true); },
    // hold the reel clock (the camera and the actors keep their pose): the shot tool freezes a moment with it
    pause(b) { S.paused = !!b; },
    tap() { if (S.block && S.block.tap) { let r = false; try { r = S.block.tap(); } catch (e) { r = true; } if (r) { const b = S.block; S.block = null; call(() => b.end && b.end()); } } },
    // run the reel without rendering (fixed 1/30 steps, sound off): tests and the shot tool use it to jump to a moment
    advance(sec) { const pz = S.paused; S.paused = false; S.fast = true; const n = Math.max(1, Math.ceil(sec * 30)), d = sec / n; for (let i = 0; i < n && !S.done; i++) { step(d, d, S.wt + d); call(() => world.player && world.player.update(d, S.wt)); } S.fast = false; S.paused = pz; return api.state(); },
    seek(T) { const pz = S.paused; S.paused = false; S.fast = true; let n = 0; while (!S.done && S.real < T && n++ < 20000) { step(1 / 30, 1 / 30, S.wt + 1 / 30); if (n % 3 === 0) call(() => world.player && world.player.update(0.1, S.wt)); } S.fast = false; S.paused = pz; return api.state(); },
    // end this reel now as if it had played out (a film goes on with its next reel; skip() ends the whole film)
    end() { if (!S.done) finish(false); },
    state() { return { id: reel.id || '', T: +S.T.toFixed(2), real: +S.real.toFixed(2), i: S.i, n: events.length, blocked: S.block ? (events[S.i - 1] || {}).do || 'cue' : null, done: S.done, skipped: S.skipped, errors: S.errors, fired: S.fired, frames: S.frames, line: S.line ? S.line.e.text : null, rate: +S.rate.toFixed(2) }; },
    dispose() { if (!S.done) finish(true); if (S.out) close(S.out.info); },
  };
  return api;
}
