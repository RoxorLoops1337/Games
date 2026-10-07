// THE BAR (Stage and Club Artist INT-B): world `bar`, 12 x 10 m club dollhouse, always night, profile 'club'. Camera looks in from the south-east: north and west walls full height,
// south and east cut low. Layout (metres, +z toward the camera, origin = middle of the room, x -6..6, z -5..5):
//   stage right-back x 1..6, z -5..-2.5 (5 x 2.5 m, h 0.38) with curtain + LED screen + PA + mic stand | counter along the west wall x -4.75..-4 with 6 stools (x -3.4), Rohzel behind it (anchor rohzel),
//   green juice machine on the back bar | chalkboard + banquette + jukebox on the north wall | tables, dance floor (x 0.3..5.7, z -2.2..1.5) with the crowd | door in the low south wall at x -1..0.4.
// Contract: buildBar(ctx, args) -> terrain { group, interior, bounds, blocked, heightAt, pathDist, keepout, paths, anchors, spotDefs, camera, lights, windows, emissive, outside, ceilY, update, api, stats }
//   anchors: start, door, doorSpot, stageSpot, counterSpot, rohzel, regular0..regular2 {x,z,rot,seatY}, stool0..5, stageCenter, discoBall, rig[6], jukebox
//   spots: stage (label from the programme), counter (JUICE), door (kind 'door').   NPC slots: rohzel, regular0..2 (see world_bar.js)
//   api: setClock({hour, day}) setProgramme(p) setCrowd(n 0..24) setBeat(0..1) setEnergy(0..1) setLyrics(lines|null, opts) setTheme('pink'|'cyan'|'lime'|'gold') programme() state()
// Budget (measured, see the report): <= 100k tris, <= 70 calls. Static geometry is 6 merged meshes; live parts: chalkboard, banner, LED screen, disco ball, 2 dance floor meshes, 1 crowd mesh.
import { THREE } from './kit.js';
import { makeStore, meshesFromStore, makeLed, K, storeTris } from './venue_kit.js';
import { createCrowd } from './char_crowd.js';
import { makeBarAtlas, programmeFor, dayNameFor, PROGRAMMES } from './bar_atlas.js';
import { BAR, buildShell, buildRig } from './bar_shell.js';
import { buildStage, drawLedProgramme } from './bar_stage.js';
import { buildCounter } from './bar_counter.js';
import { buildDecor, buildDanceFloor, buildBoards, buildDiscoBall, SEATS } from './bar_decor.js';

const BBH = () => (typeof window !== 'undefined' && window.BBH) || {};
const CROWD_BY = { closed: 8, openmic: 12, showcase: 22, battle: 24, karaoke: 14 }, ENERGY_BY = { closed: 0.1, openmic: 0.35, showcase: 0.55, battle: 0.65, karaoke: 0.45 };
const THEME_BY = { closed: ['#9a8ab0', '#5a4a78'], openmic: ['#ff3d9a', '#35f2e0'], showcase: ['#ffc83d', '#ff6a3d'], battle: ['#ff3d6a', '#7a3dff'], karaoke: ['#a6ff3d', '#2bd9a0'] };
const STAGE_LABEL = { openmic: 'OPEN MIC', showcase: 'SHOWCASE', battle: 'BATTLE', karaoke: 'KARAOKE', closed: 'STAGE' };
export const DEF_REG = ['luca', 'mira', 'sky'];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function buildBar(ctx, args) {
  args = args || {}; const Core = args.Core || BBH().Core || null;
  const group = new THREE.Group(); group.name = 'bar';
  const S = makeStore(); S.atlas = makeBarAtlas(); S.group = group; const guard = (n, fn) => { try { return fn(S); } catch (e) { console.error('[bar3d] ' + n + ' failed: ' + (e && e.stack || e)); return null; } };
  guard('shell', buildShell); guard('rig', buildRig); const stg = guard('stage', buildStage); guard('counter', buildCounter); guard('decor', buildDecor);
  const M = meshesFromStore(S, group, { prefix: 'bar' });

  // ---------------------------------------------------------------- live parts
  const boards = buildBoards(group);
  const led = stg && stg.led; if (led) group.add(led.mesh);
  const ball = buildDiscoBall(S.discoPos || { x: 3.4, y: 2.6, z: 0.2 }); group.add(ball.mesh);
  const dance = buildDanceFloor(0.3, 5.7, -2.2, 1.5, 0.54); group.add(dance.group);
  const outside = null;
  // the instanced crowd (24 slots, count set by setCrowd)
  const quality = ctx.quality || 'high', MAXC = 24;
  const crowd = createCrowd(ctx, MAXC, { area: { x0: 0.3, x1: 5.7, z0: -2.1, z1: 1.6 }, facing: { x: 3.4, z: -5.5 }, keepout: [{ x0: 2.85, x1: 4.35, z0: -2.6, z1: 2.4 }], seed: args.seed || 11, energy: 0.35, bpm: 100 }); group.add(crowd.object);

  // ---------------------------------------------------------------- state
  const A = S.anchors; Object.assign(A, SEATS);
  A.start = { x: -0.3, z: 2.9, rot: Math.PI }; A.doorSpot = { x: A.door ? A.door.x : -0.3, z: 4.55, rot: 0 }; A.door = A.doorSpot;
  const st = { day: args.day !== undefined ? args.day : (args.clock && args.clock.day !== undefined ? args.clock.day : 2), hour: args.clock && args.clock.hour !== undefined ? args.clock.hour : 21, prog: null, dayName: '', crowd: 12, energy: 0.35, beat: 0, beatSet: -99, auto: true, beatN: 0, prevB: 0, lastPulse: 0, theme: 'pink', lyrics: null, t: 0, regulars: [], people: null, inited: false };
  if (args.programme) st.prog = typeof args.programme === 'string' ? (PROGRAMMES[args.programme] || null) : args.programme;
  function applyProgramme(p, fromClock) {
    st.prog = p; st.dayName = dayNameFor(st.day, Core); st.crowd = CROWD_BY[p.id] === undefined ? 12 : CROWD_BY[p.id]; if (args.crowd !== undefined && !fromClock) st.crowd = args.crowd; st.energy = ENERGY_BY[p.id] === undefined ? 0.35 : ENERGY_BY[p.id];
    boards.set({ programme: p, dayName: st.dayName, hour: 18 }); if (led && !st.lyrics) drawLedProgramme(led, p, st.dayName);
    const th = THEME_BY[p.id] || THEME_BY.openmic; dance.setTheme(th[0], th[1]); setCrowd(st.crowd);
  }
  function setCrowd(n) { n = Math.round(clamp(+n || 0, 0, MAXC)); st.crowd = n; crowd.mesh.count = n; crowd.object.visible = n > 0; crowd.state.n = n; return n; }
  const api = {
    setClock(c) { if (!c) return; if (c.day !== undefined) st.day = c.day; if (c.hour !== undefined) st.hour = c.hour; applyProgramme(programmeFor(st.day, Core), true); },
    setProgramme(p) { applyProgramme(typeof p === 'string' ? (PROGRAMMES[p] || PROGRAMMES.openmic) : p); },
    setCrowd, setBeat(b) { b = clamp(+b || 0, 0, 1); st.beatSet = st.t; if (b > 0.55 && st.prevB <= 0.55) st.beatN++; st.prevB = b; st.beat = b; st.auto = false; },
    setEnergy(e) { st.energy = clamp(+e || 0, 0, 1); },
    setTheme(name) { const T = { pink: ['#ff3d9a', '#35f2e0'], cyan: ['#35f2e0', '#3d7aff'], lime: ['#a6ff3d', '#2bd9a0'], gold: ['#ffc83d', '#ff6a3d'] }[name]; if (T) { dance.setTheme(T[0], T[1]); st.theme = name; } },
    setLyrics(lines, o) { if (!led) return; if (!lines || !lines.length) { st.lyrics = null; drawLedProgramme(led, st.prog, st.dayName); return; } st.lyrics = lines; led.text(lines.map((l, i) => (typeof l === 'string' ? { t: l, c: i === 0 ? '#ffe9a0' : '#cfe8ff', k: i === 0 ? 1.1 : 0.8 } : l)), Object.assign({ bg: ['#1b0a46', '#0a0620'], rays: ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0)'] }, o || {})); },
    programme() { return st.prog; }, state() { return { day: st.day, hour: st.hour, programme: st.prog && st.prog.id, dayName: st.dayName, crowd: st.crowd, energy: st.energy, beatN: st.beatN, theme: st.theme }; },
    regularOf(slot) { const r = st.regulars.find((x) => x.slot === slot); return r ? r.who : null; },
  };

  // ---------------------------------------------------------------- spots
  const prog0 = st.prog || programmeFor(st.day, Core);
  const mk = (id, anchor, label, icon, color, color2, clip, extra, kind) => ({ id, anchor, label, icon, color, color2, kind: kind || undefined, cine: Object.assign({ snap: true, face: 'rot', clip, zoom: 0.2 }, extra || {}) });
  const spotDefs = [
    mk('stage', 'stageSpot', STAGE_LABEL[prog0.id] || 'STAGE', 'stage', '#ff3ea5', '#ffe14d', 'beatbox'),
    mk('counter', 'counterSpot', 'JUICE', 'counter', '#9dff4a', '#ffe14d', 'talk'),
    mk('door', 'doorSpot', 'LEAVE', 'door', '#9dff4a', '#2ee6ff', 'wave', { snap: false }, 'door'),
  ];

  // ---------------------------------------------------------------- collision and the terrain contract
  const bounds = { minX: -5.65, maxX: 5.65, minZ: -4.65, maxZ: 5.0 }, hit = S.hit;
  const blocked = (x, z) => x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ || hit.test(x, z);
  const keepout = (x, z, r) => { r = r || 0.3; if (blocked(x, z)) return true; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; if (blocked(x + Math.cos(a) * r, z + Math.sin(a) * r)) return true; } return false; };
  const paths = [{ id: 'main', w: 1.6, points: [{ x: -0.3, z: 4.6 }, { x: -0.3, z: 2.0 }, { x: -2.5, z: -0.9 }] }, { id: 'stage', w: 1.6, points: [{ x: -0.3, z: 2.0 }, { x: 3.4, z: -1.2 }] }];
  const segs = []; paths.forEach((p) => { for (let i = 0; i < p.points.length - 1; i++) segs.push([p.points[i], p.points[i + 1]]); });
  const pathDist = (x, z) => { let best = 1e9; for (const [a, b] of segs) { const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1, t = clamp(((x - a.x) * dx + (z - a.z) * dz) / l2, 0, 1), d = Math.hypot(a.x + dx * t - x, a.z + dz * t - z); if (d < best) best = d; } return best; };

  // ---------------------------------------------------------------- per frame
  const scrMat = M.scrMat; let flick = 0;
  function update(dt, t) {
    st.t = t; if (!st.inited) init();
    // beat: driven by setBeat from the game; a 100 bpm metronome keeps the room alive when nobody feeds it (dev page, screenshots)
    let pulse, beatN;
    if (t - st.beatSet > 1.5) { st.auto = true; const bp = (t * 100) / 60; beatN = Math.floor(bp); pulse = Math.exp(-(bp % 1) * 4.5); st.beatN = beatN; } else { pulse = st.beat; beatN = st.beatN; }
    const e = clamp(st.energy + 0.22 * pulse, 0, 1);
    dance.update(t, beatN, e, pulse); ball.update(dt, t, pulse);
    crowd.setEnergy(e); crowd.setBeat(100); crowd.update(dt, t);
    flick += dt; if (scrMat) { const k = 0.93 + 0.07 * Math.sin(t * 11.0) * Math.sin(t * 3.7) + 0.08 * pulse; scrMat.color.setRGB(k, k, k); }
    if (st.people) st.people(dt, t, pulse);
  }
  // first frame: NPC slots exist now (the host builds npcSpecs after create()), seat the regulars and put Rohzel behind the counter
  function init() {
    st.inited = true; const npcs = ctx.npcs || [], by = (id) => npcs.find((n) => n && n.id === id);
    const roh = by('rohzel'); if (roh) { roh.place(A.rohzel.x, A.rohzel.z, A.rohzel.rot); roh.play('idle', {}); roh.tapRadius = 1.4; roh.slot = 'rohzel'; }
    ['regular0', 'regular1', 'regular2'].forEach((slot, i) => { const n = by(slot), a = A[slot]; if (!n || !a) return; n.place(a.x, a.z, a.rot, a.seatY, 0); n.play('sit', { seat: a.seatY, bpm: 98, amp: 0.4 + 0.1 * i, slump: 0.4 }); n.tapRadius = 1.2; n.slot = slot; n.who = (args.regulars || DEF_REG)[i]; st.regulars[i] = { slot, who: n.who }; });
    let ph = 0, nextT = 3; const talk = [roh]; st.people = (dt, t) => { if (t > nextT) { nextT = t + 3.5 + Math.random() * 3; ph ^= 1; talk.forEach((n) => { if (n) n.play(ph ? 'talk' : 'idle', {}); }); } };
    // the world methods (setCrowd...) hang off the world object for the game: the host world has no generic passthrough, so attach once it exists
    const W = ctx.host && ctx.host.world; if (W) attachApi(W);
  }
  function attachApi(W) { ['setCrowd', 'setProgramme', 'setEnergy', 'setLyrics', 'setTheme', 'programme', 'regularOf'].forEach((k) => { if (typeof W[k] !== 'function') W[k] = api[k]; }); W.bar = api; }
  api.attach = attachApi;

  applyProgramme(st.prog || programmeFor(st.day, Core));
  const lights = S.lights; group.userData.tris = storeTris(S);
  return {
    group, interior: true, bounds, blocked, heightAt: () => 0, pathDist, keepout, paths, ceilY: BAR.ceilY, profile: 'club',
    emissive: [M.glow], anchors: Object.assign(A, { stageCenter: A.stageCenter || { x: 3.5, z: -3.6 } }), spotDefs, windows: [], lights, outside,
    camera: { dist: 12.5, pitch: 50, yaw: 35, fov: 34, minDist: 8, maxDist: 16, focusY: 0.8 },
    update, api, setClock: api.setClock, setBeat: api.setBeat, crowd, led, boards, M,
    stats() { return { tris: storeTris(S) + (crowd.mesh.count * crowd.trisPer) + dance.tris, crowd: crowd.mesh.count, colliders: hit.count() }; },
  };
}
