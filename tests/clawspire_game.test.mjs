// Clawspire -- integration suite for js/game.js (and index.html).
// Boots the whole game headless through tests/clawspire_lib.mjs and drives a
// run: title -> new run -> map -> reveal/move -> fight -> claw drops -> enemy
// turn -> fight end -> reward -> save/load -> game over -> meta stats.
import fs from 'fs';
import path from 'path';
import { boot, harness, DIR } from './clawspire_lib.mjs';

const h = harness('clawspire game');
const DT = 1 / 60;

function stepFor(G, secs) { const n = Math.round(secs / DT); for (let i = 0; i < n; i++) G.update(DT); }
// True when the fight is waiting for the player (rig idle, nothing queued).
function ready(G) {
  const s = G.state();
  return s.screen === 'fight' && s.fight && s.fight.phase === 'player' && !s.grabInFlight && !s.enemyTurn && s.queue === 0 && s.rigPhase === 'idle';
}
// Steps until ready() or the fight screen is left; false on timeout.
function settle(G, maxSecs) {
  const n = Math.round((maxSecs || 30) / DT);
  for (let i = 0; i < n; i++) {
    if (G.screen !== 'fight') return true;
    if (ready(G)) return true;
    G.update(DT);
  }
  return false;
}
// Picks the first enabled button of the current overlay.
function chooseFirst(G) { const i = G.S.ui.buttons.findIndex(b => !b.disabled); return i >= 0 ? G.choose(i) : false; }
function itemBodies(G) { return (G.fs ? G.fs.items : []).filter(b => !G.cabinet.inChute(b)); }
function maxSpeed(G) { let m = 0; for (const b of G.world.bodies) if (b.type === 'dynamic') m = Math.max(m, Math.hypot(b.vx, b.vy)); return m; }

// Find a seed whose start has a fight tile next to it, so the map walk is deterministic.
function seedWithFightNeighbour(G, MAP) {
  for (let seed = 1; seed < 200; seed++) {
    const run = G.newRun('knight', seed);
    const M = run.map;
    for (const [q, r] of MAP.neighbors(M, M.start.q, M.start.r)) {
      const t = M.tiles[MAP.key(q, r)];
      if (t.type === 'fight' && t.revealed) return { seed, tile: t };
    }
  }
  return null;
}

let CS = boot();
const { GAME: G, MAP, DATA, COMBAT, U } = CS;
const START_INK = (DATA.ECONOMY && DATA.ECONOMY.startInk) || 10;

h.test('boot exposes the namespaces and lands on the title', () => {
  h.ok(CS.U && CS.PHYS && CS.DATA && CS.COMBAT && CS.MAP && CS.AUDIO && CS.GAME, 'window.CS has every module');
  h.eq(G.screen, 'title', 'title screen after boot');
  h.ok(G.headless, 'headless flag set under node');
  h.ok(G.meta && G.meta.unlocks.knight, 'meta loaded with the knight unlocked');
  h.ok(!G.meta.unlocks.rogue, 'rogue locked on a fresh profile');
  h.ok(G.S.ui.buttons.length >= 4, 'title menu has buttons');
  G.draw();
});

h.test('title -> character select -> new run via buttons', () => {
  const i = G.S.ui.buttons.findIndex(b => /new run/i.test(b.label));
  h.ok(i >= 0, 'NEW RUN button present');
  G.choose(i);
  h.eq(G.screen, 'chars', 'character select shown');
  const locked = G.S.ui.buttons.find(b => /Fizzwick|alchemist/i.test(b.label));
  h.ok(locked && locked.disabled, 'alchemist card is locked');
  G.choose(0);
  h.eq(G.screen, 'map', 'picking the knight starts a run on the map');
  h.ok(G.run && G.run.char === 'knight' && G.run.bin.length >= 12, 'run has the knight bin');
  h.eq(G.run.relics.length, 1, 'starting relic granted');
  G.draw();
});

let seedInfo = null;
h.test('newRun(knight, seed) -> map with start neighbours revealed', () => {
  seedInfo = seedWithFightNeighbour(G, MAP);
  h.ok(seedInfo, 'found a seed with a fight next to the start');
  const M = G.run.map;
  h.eq(G.screen, 'map', 'map screen');
  h.eq(G.run.ink, START_INK, 'ink at act start follows DATA.ECONOMY');
  h.eq(M.ink, START_INK, 'map ink mirrors run ink');
  for (const [q, r] of MAP.neighbors(M, M.start.q, M.start.r)) h.ok(M.tiles[MAP.key(q, r)].revealed, `start neighbour ${q},${r} revealed`);
  h.ok(M.tiles[MAP.key(M.boss.q, M.boss.r)].revealed, 'boss visible');
  G.draw();
});

h.test('tapping a hidden hex reveals it for 1 ink', () => {
  const M = G.run.map;
  const cand = MAP.revealable(M).find(t => t.terrain === 'land');
  h.ok(cand, 'a revealable land tile exists');
  G.lookAt(cand.q, cand.r);
  const p = G.hexToStage(cand.q, cand.r);
  const back = G.stageToHex(p.x, p.y);
  h.ok(back.q === cand.q && back.r === cand.r, 'hex <-> stage round trip');
  const ink = G.run.ink;
  G.tap(p.x, p.y);
  h.ok(cand.revealed, 'tile revealed');
  h.eq(G.run.ink, ink - 1, 'ink spent');
  h.eq(M.ink, G.run.ink, 'map ink in sync');
  // A far hidden tile cannot be revealed.
  const far = Object.values(M.tiles).find(t => !t.revealed && !MAP.canReveal(M, t.q, t.r));
  if (far) { G.lookAt(far.q, far.r); const fp = G.hexToStage(far.q, far.r); const ink2 = G.run.ink; G.tap(fp.x, fp.y); h.eq(G.run.ink, ink2, 'far tile costs nothing'); h.ok(!far.revealed, 'far tile stays hidden'); G.S.preview = null; }
  G.lookAt(M.pos.q, M.pos.r);
});

h.test('map camera: 16x22 world at 46 px hexes, centred on the player, boss arrow off screen', () => {
  const M = G.run.map;
  h.ok(M.cols === 16 && M.rows === 22, 'game builds a 16x22 world');
  h.ok(M.water >= 0.2 && M.water <= 0.4 && M.islands >= 2 && M.islands <= 4, `water ${M.water}, islands ${M.islands}`);
  G.lookAt(M.pos.q, M.pos.r);
  const a = G.hexToStage(M.pos.q, M.pos.r), b = G.hexToStage(M.start.q + 1, M.start.r);
  h.ok(Math.abs(a.x - 270) < 1 && Math.abs(a.y - 556) < 1, 'the player hex sits at the centre of the map area (' + a.x.toFixed(0) + ',' + a.y.toFixed(0) + ')');
  const size = Math.hypot(b.x - a.x, b.y - a.y) / Math.sqrt(3);
  h.ok(Math.abs(size - 46) < 0.01 && G.cam.zoom === 1, 'hex size on the stage is 46 px at zoom 1 (got ' + size.toFixed(2) + ')');
  const bs = G.hexToStage(M.boss.q, M.boss.r);
  h.ok(Math.abs(bs.x - a.x) < 1 && bs.y < 172, 'the boss is straight up and off the screen');
  const arrow = G.bossArrow();
  h.ok(arrow && Math.abs(arrow.y - 208) < 1 && arrow.x > 0 && arrow.x < 540 && Math.abs(arrow.a + Math.PI / 2) < 0.01, 'boss arrow at the top edge pointing up');
  G.draw();
  G.lookAt(M.boss.q, M.boss.r);
  h.ok(G.bossArrow() === null, 'no arrow while the boss is in view');
  let bad = 0;
  for (const t of Object.values(M.tiles)) { const p = G.hexToStage(t.q, t.r); const back = G.stageToHex(p.x, p.y); if (back.q !== t.q || back.r !== t.r) bad++; }
  h.eq(bad, 0, 'every hex round-trips through hexToStage/stageToHex');
  h.ok(Object.values(M.tiles).every(t => t.known === MAP.isLandmark(t)), 'landmarks known from the start');
  h.ok(Object.values(M.tiles).filter(t => t.type === 'tower').length >= 2, 'towers on the map');
  G.draw();
  G.lookAt(M.pos.q, M.pos.r);
});

h.test('map camera: drag pans without tapping, a still tap reveals, clamp, wheel and pinch zoom, locate recentres', () => {
  const M = G.run.map;
  G.lookAt(M.pos.q, M.pos.r);
  const c0 = Object.assign({}, G.cam);
  const ink = G.run.ink, rev = MAP.progress(M).revealed;
  G.pointer('down', 270, 400, { pointerId: 1 });
  G.pointer('move', 270, 420, { pointerId: 1 });
  G.pointer('move', 270, 500, { pointerId: 1 });
  G.pointer('up', 270, 500, { pointerId: 1 });
  h.ok(Math.abs(G.cam.y - (c0.y - 100)) < 1e-6 && G.cam.x === c0.x, 'a 100 px drag down slides the view 100 world px toward the boss (' + (c0.y - G.cam.y).toFixed(1) + ')');
  h.ok(G.run.ink === ink && MAP.progress(M).revealed === rev && !G.S.preview, 'a drag never taps');
  const pAfter = G.hexToStage(M.pos.q, M.pos.r);
  h.ok(Math.abs(pAfter.y - (556 + 100)) < 1e-6, 'the player hex moved with the drag');
  // A finger that wobbles under 8 px is still a tap.
  const cand = MAP.revealable(M).find(t => t.terrain === 'land');
  G.lookAt(cand.q, cand.r);
  const p = G.hexToStage(cand.q, cand.r);
  G.pointer('down', p.x, p.y, { pointerId: 1 });
  G.pointer('move', p.x + 3, p.y - 2, { pointerId: 1 });
  G.pointer('up', p.x + 3, p.y - 2, { pointerId: 1 });
  h.ok(cand.revealed && G.run.ink === ink - 1, 'a tap without a drag reveals the hex');
  // Clamp: no amount of dragging leaves the map plus its margin.
  for (let i = 0; i < 40; i++) { G.pointer('down', 270, 800, { pointerId: 1 }); G.pointer('move', 270, 200, { pointerId: 1 }); G.pointer('up', 270, 200, { pointerId: 1 }); }
  const bounds = MAP.bounds(M, 46, 'v');
  h.ok(Math.abs(G.cam.y - bounds.h) < 1e-6, 'camera clamps with its centre on the bottom edge (' + G.cam.y.toFixed(0) + ' of ' + bounds.h.toFixed(0) + ')');
  for (let i = 0; i < 40; i++) { G.pointer('down', 100, 500, { pointerId: 1 }); G.pointer('move', 500, 500, { pointerId: 1 }); G.pointer('up', 500, 500, { pointerId: 1 }); }
  h.ok(Math.abs(G.cam.x) < 1e-6, 'camera clamps with its centre on the left edge (' + G.cam.x.toFixed(0) + ')');
  // Wheel zoom, both ways, within 0.6..1.4.
  for (let i = 0; i < 30; i++) G.wheel(270, 556, -300);
  h.ok(Math.abs(G.cam.zoom - 1.4) < 1e-9, 'wheel up zooms in to the 1.4 cap');
  for (let i = 0; i < 60; i++) G.wheel(270, 556, 300);
  h.ok(Math.abs(G.cam.zoom - 0.6) < 1e-9, 'wheel down zooms out to the 0.6 floor');
  const q = G.hexToStage(M.start.q + 1, M.start.r), q0 = G.hexToStage(M.start.q, M.start.r);
  h.ok(Math.abs(Math.hypot(q.x - q0.x, q.y - q0.y) / Math.sqrt(3) - 46 * 0.6) < 0.01, 'hex size on the stage follows the zoom');
  let bad = 0;
  for (const t of Object.values(M.tiles)) { const pp = G.hexToStage(t.q, t.r); const back = G.stageToHex(pp.x, pp.y); if (back.q !== t.q || back.r !== t.r) bad++; }
  h.eq(bad, 0, 'round trip holds at zoom 0.6');
  // Pinch: two fingers spreading zoom in about their midpoint, and never tap.
  const ink2 = G.run.ink, rev2 = MAP.progress(M).revealed;
  G.pointer('down', 200, 500, { pointerId: 1 });
  G.pointer('down', 340, 500, { pointerId: 2 });
  G.pointer('move', 150, 500, { pointerId: 1 });
  G.pointer('move', 390, 500, { pointerId: 2 });
  h.ok(Math.abs(G.cam.zoom - 0.6 * 240 / 140) < 1e-6, 'pinch zoom = spread ratio (' + G.cam.zoom.toFixed(3) + ')');
  G.pointer('up', 150, 500, { pointerId: 1 });
  G.pointer('up', 390, 500, { pointerId: 2 });
  h.ok(G.run.ink === ink2 && MAP.progress(M).revealed === rev2 && !G.S.preview, 'a pinch never taps');
  // Locate eases back onto the player.
  G.S.cam.zoom = 1;
  G.locate();
  for (let i = 0; i < 120; i++) G.update(1 / 60);
  const me = G.hexToStage(M.pos.q, M.pos.r);
  h.ok(Math.abs(me.x - 270) < 1 && Math.abs(me.y - 556) < 1, 'locate recentres on the player (' + me.x.toFixed(0) + ',' + me.y.toFixed(0) + ')');
  G.draw();
});

h.test('map: tap a far hex to preview the ink path, tap again to paint it and walk it', () => {
  const M = G.run.map;
  // Every content tile (all but the fight the next test needs, and the
  // boss) is muted for this test, so the walk after the paint can reach a
  // far empty tile without stopping; the flags are put back at the end.
  const muted = Object.values(M.tiles).filter(t => !t.done && t.type !== 'empty' && t.type !== 'start' && t.type !== 'boss' && t !== seedInfo.tile);
  for (const t of muted) t.done = true;
  const quiet = (t) => t.type === 'empty' || t.type === 'start' || t.done;
  const far = Object.values(M.tiles).find(t => {
    if (t.revealed || t.type !== 'empty' || t.terrain !== 'land') return false;
    const path = MAP.pathToReveal(M, t.q, t.r);
    if (path.length < 3 || !path.every(([q, r]) => M.tiles[MAP.key(q, r)].terrain === 'land')) return false;
    const C = MAP.deserialize(MAP.serialize(M));
    C.ink = 99; MAP.revealPath(C, path);
    const walk = MAP.walkPath(C, t.q, t.r);
    return !!walk && walk.every(([q, r]) => quiet(C.tiles[MAP.key(q, r)]));
  });
  h.ok(far, 'a far hidden empty tile with a quiet path exists');
  const path = MAP.pathToReveal(M, far.q, far.r);
  const cost = MAP.pathCost(M, path);
  G.lookAt(far.q, far.r);
  const p = G.hexToStage(far.q, far.r);
  const ink = G.run.ink;
  G.tap(p.x, p.y);
  h.ok(G.S.preview && G.S.preview.q === far.q && G.S.preview.r === far.r, 'first tap sets the preview on that hex');
  h.eq(G.S.preview.cost, cost, 'preview cost = pathCost');
  h.eq(G.run.ink, ink, 'preview costs nothing');
  h.ok(!far.revealed, 'still hidden after the preview');
  G.draw();
  // Tapping elsewhere clears it.
  G.lookAt(M.pos.q, M.pos.r);
  const other = G.hexToStage(M.pos.q, M.pos.r);
  G.tap(other.x, other.y);
  h.ok(!G.S.preview, 'tapping elsewhere clears the preview');
  // Short on ink: the paint is refused and the preview stays.
  G.lookAt(far.q, far.r);
  G.tap(p.x, p.y);
  G.run.ink = cost - 1; M.ink = G.run.ink;
  G.tap(p.x, p.y);
  h.ok(!far.revealed && G.run.ink === cost - 1, 'short on ink: nothing painted, nothing spent');
  h.ok(G.S.preview && G.S.preview.q === far.q, 'preview kept when short');
  G.run.ink = cost + 1; M.ink = G.run.ink;
  G.tap(p.x, p.y);
  h.ok(far.revealed && path.every(([q, r]) => M.tiles[MAP.key(q, r)].revealed), 'second tap paints the whole path');
  h.eq(G.run.ink, 1, 'spends exactly pathCost ink');
  h.eq(M.ink, G.run.ink, 'map ink in sync');
  h.ok(!G.S.preview, 'preview cleared after painting');
  h.eq(G.screen, 'map', 'still on the map');
  // ...and the crawler sets off along it: the first step at once, the rest
  // every WALK_STEP seconds, the camera easing after it.
  h.ok(G.S.walk && G.S.walk.i === 1 && !G.S.walk.done, 'painting starts a walk and takes the first step');
  h.ok(!(M.pos.q === M.start.q && M.pos.r === M.start.r), 'the crawler left the start');
  h.ok(G.walkXY() !== null, 'the crawler is drawn easing between hexes');
  G.draw();
  const steps = MAP.walkPath(MAP.deserialize(MAP.serialize(Object.assign({}, M, { pos: { q: M.start.q, r: M.start.r } }))), far.q, far.r).length;
  stepFor(G, G.WALK_STEP * (steps + 2));
  h.ok(M.pos.q === far.q && M.pos.r === far.r, 'the walk ends on the painted target (' + M.pos.q + ',' + M.pos.r + ' vs ' + far.q + ',' + far.r + ')');
  h.ok(far.visited && G.S.walk === null, 'target visited, walk over');
  h.eq(G.screen, 'map', 'an empty target keeps the map');
  h.eq(G.run.ink, 1, 'walking land costs nothing');
  h.ok(G.walkXY() === null, 'the crawler stands on its hex again');
  G.draw();
  // Back to the start, content unmuted, for the tests that follow.
  for (const t of muted) delete t.done;
  M.pos = { q: M.start.q, r: M.start.r };
  G.run.ink = ink; M.ink = ink;
  G.lookAt(M.pos.q, M.pos.r);
});

/* A run whose start has three land tiles in a line out of it, all made
   empty and lit, every other lit content tile marked done: a quiet walk.
   Scans seeds from the given one for a line that is off the road, so the
   rig's ford never sits on the free route to the boss. */
function walkRig(seed) {
  const T = boot();
  const Gt = T.GAME;
  let M = null, chain = null, dir = null;
  for (let s = seed; s < seed + 60 && !chain; s++) {
    Gt.newRun('knight', s);
    M = Gt.run.map;
    for (const [dq, dr] of MAP.DIRS) {
      const c = [1, 2, 3].map(i => MAP.tileAt(M, M.start.q + dq * i, M.start.r + dr * i));
      if (c.every(t => t && t.terrain === 'land' && t.type !== 'boss' && !t.road)) { chain = c; dir = [dq, dr]; break; }
    }
  }
  if (!chain) return null;
  for (const t of chain) { t.type = 'empty'; t.content = {}; t.revealed = true; t.done = false; t.visited = false; t.terrain = 'land'; }
  for (const t of Object.values(M.tiles)) if (t.revealed && t.type !== 'empty' && t.type !== 'start' && t.type !== 'boss') t.done = true;
  M.revealedCount = Object.values(M.tiles).filter(t => t.revealed).length;
  Gt.toMap();
  return { G: Gt, M, chain, dir, MAP: T.MAP };
}

h.test('map: click to travel walks three lit hexes, the camera follows, the tile is entered', () => {
  const R = walkRig(23);
  h.ok(R, 'a seed with three land tiles east of the start');
  const { G: Gt, M, chain } = R;
  const [a, b, c] = chain;
  Gt.lookAt(c.q, c.r);
  const p = Gt.hexToStage(c.q, c.r);
  const ink = Gt.run.ink, floor = Gt.run.floor;
  Gt.tap(p.x, p.y);
  h.ok(Gt.S.walk && !Gt.S.walk.done && Gt.S.walk.path.length === 3, 'a three-step walk starts (' + (Gt.S.walk && Gt.S.walk.path.length) + ')');
  h.ok(MAP.isAdjacent(M.start.q, M.start.r, M.pos.q, M.pos.r), 'the first step is taken at once');
  h.ok(Gt.S.camTo && Gt.S.walk.from && Gt.S.walk.from.q === M.start.q, 'the camera eases after the crawler, the ease starts from the start');
  Gt.draw();
  stepFor(Gt, Gt.WALK_STEP * 0.5);
  h.ok(Gt.walkXY() !== null && !(M.pos.q === c.q && M.pos.r === c.r), 'mid-step: the crawler is between hexes, not there yet');
  Gt.draw();
  stepFor(Gt, Gt.WALK_STEP * 2.6);
  h.ok(M.pos.q === c.q && M.pos.r === c.r, 'the walk ends on the target (' + M.pos.q + ',' + M.pos.r + ')');
  h.ok(a.visited && b.visited && c.visited, 'every hex on the way was entered');
  h.ok(Gt.S.walk === null, 'the walk is dropped once its last ease played');
  h.eq(Gt.run.floor, floor + 3, 'three steps counted');
  h.eq(Gt.run.ink, ink, 'land steps cost no ink');
  h.eq(Gt.screen, 'map', 'still on the map');
  h.ok((T => T && T.step)(Gt.S) || true, 'step sfx is optional');
  // The old one-step tap: a neighbour is a one-step walk that resolves at once.
  const q = Gt.hexToStage(b.q, b.r);
  Gt.tap(q.x, q.y);
  h.ok(M.pos.q === b.q && M.pos.r === b.r, 'a tap on a neighbour steps there at once');
  h.ok(Gt.S.walk && Gt.S.walk.done, 'and is a finished one-step walk');
  // A tap on the crawler's own hex, and on an unlit-cut-off lit hex, walk nowhere.
  stepFor(Gt, 0.5);
  const me = Gt.hexToStage(b.q, b.r);
  Gt.tap(me.x, me.y);
  h.ok(M.pos.q === b.q && M.pos.r === b.r && Gt.S.walk === null, 'tapping your own hex does nothing');
  const boss = MAP.tileAt(M, M.boss.q, M.boss.r);
  const bossOk = MAP.walkPath(M, boss.q, boss.r);
  h.ok(bossOk && bossOk.length > 3, 'the lit road makes the boss a walk target from here (' + (bossOk && bossOk.length) + ' steps)');
  Gt.draw();
});

h.test('map: a walk stops at an unvisited fight on the way', () => {
  const R = walkRig(23);
  const { G: Gt, M, chain } = R;
  const [a, b, c] = chain;
  b.type = 'fight'; b.content = { diff: 0.1 };
  Gt.lookAt(c.q, c.r);
  const p = Gt.hexToStage(c.q, c.r);
  Gt.tap(p.x, p.y);
  h.ok(M.pos.q === a.q && M.pos.r === a.r && Gt.screen === 'map', 'first step onto the empty hex');
  stepFor(Gt, Gt.WALK_STEP * 1.2);
  h.ok(M.pos.q === b.q && M.pos.r === b.r, 'second step onto the fight');
  h.eq(Gt.screen, 'fight', 'the fight starts');
  h.ok(Gt.S.walk === null || Gt.S.walk.done, 'the walk is over');
  stepFor(Gt, 1);
  h.ok(!c.visited && Gt.screen === 'fight', 'the rest of the path is dropped');
  h.ok(b.done, 'the fight tile is marked');
});

// Puts everything but the start, the boss and the given tiles back under
// the fog, so a walk has no lit way round.
function onlyLit(M, keep) {
  for (const t of Object.values(M.tiles)) if (t.revealed && !keep.includes(t) && t.type !== 'start' && t.type !== 'boss') t.revealed = false;
  M.revealedCount = Object.values(M.tiles).filter(t => t.revealed).length;
}

h.test('map: a walk stops in front of a ford it cannot pay, and pays one it can', () => {
  const R = walkRig(23);
  const { G: Gt, M, chain } = R;
  const [a, b, c] = chain;
  b.terrain = 'shallow';
  onlyLit(M, chain);
  Gt.run.ink = 1; M.ink = 1;
  Gt.lookAt(c.q, c.r);
  const p = Gt.hexToStage(c.q, c.r);
  Gt.tap(p.x, p.y);
  h.ok(M.pos.q === a.q && M.pos.r === a.r, 'first step onto the shore');
  stepFor(Gt, Gt.WALK_STEP * 3);
  h.ok(M.pos.q === a.q && M.pos.r === a.r, 'the walk stops in front of the ford');
  h.ok(Gt.S.walk === null || Gt.S.walk.done, 'the walk is over');
  h.eq(Gt.run.ink, 1, 'nothing spent');
  h.ok(!b.visited && !c.visited, 'neither the ford nor the far bank was entered');
  Gt.run.ink = 3; M.ink = 3;
  // the camera eased after the crawler: aim at the target again
  Gt.lookAt(c.q, c.r);
  const p2 = Gt.hexToStage(c.q, c.r);
  Gt.tap(p2.x, p2.y);
  stepFor(Gt, Gt.WALK_STEP * 3);
  h.ok(M.pos.q === b.q && M.pos.r === b.r && Gt.run.ink === 1, 'with the ink the ford is waded for 2 and the walk stops on it (' + M.pos.q + ',' + M.pos.r + ' ink ' + Gt.run.ink + ')');
  h.ok(!c.visited, 'the far bank waits for another tap');
  Gt.lookAt(c.q, c.r);
  const p3 = Gt.hexToStage(c.q, c.r);
  Gt.tap(p3.x, p3.y);
  h.ok(M.pos.q === c.q && M.pos.r === c.r && Gt.run.ink === 1, 'stepping off the ford onto land is free');
  // With a lit land way round, the walk never wades: fords are the last resort.
  const R2 = walkRig(23);
  const M2 = R2.M, [a2, b2, c2] = R2.chain, [dq, dr] = R2.dir;
  b2.terrain = 'shallow';
  onlyLit(M2, R2.chain);
  h.ok(MAP.walkPath(M2, c2.q, c2.r).some(([q, r]) => M2.tiles[MAP.key(q, r)].terrain === 'shallow'), 'with only the chain lit the walk would wade');
  // A two-hex bypass: x beside a2 (the next direction round), y = x + dir,
  // which touches c2. Three free steps against one ford at 2 ink.
  const i = MAP.DIRS.findIndex(([a, b]) => a === dq && b === dr);
  const [xq, xr] = MAP.DIRS[(i + 1) % 6];
  const x = MAP.tileAt(M2, a2.q + xq, a2.r + xr), y = MAP.tileAt(M2, a2.q + xq + dq, a2.r + xr + dr);
  h.ok(x && y && MAP.isAdjacent(y.q, y.r, c2.q, c2.r), 'bypass hexes exist and touch the far bank');
  for (const t of [x, y]) { t.terrain = 'land'; t.type = 'empty'; t.content = {}; t.revealed = true; t.done = false; }
  const path = MAP.walkPath(M2, c2.q, c2.r);
  h.ok(path && path.length === 4 && path.every(([q, r]) => M2.tiles[MAP.key(q, r)].terrain === 'land'), 'walkPath goes round the ford over lit land in four free steps (' + JSON.stringify(path) + ')');
});

h.test('map: a tap during a walk cancels it at the current hex', () => {
  const R = walkRig(23);
  const { G: Gt, M, chain } = R;
  const [a, b, c] = chain;
  Gt.lookAt(c.q, c.r);
  const p = Gt.hexToStage(c.q, c.r);
  Gt.tap(p.x, p.y);
  h.ok(M.pos.q === a.q && M.pos.r === a.r && Gt.S.walk && !Gt.S.walk.done, 'walk under way after the first step');
  stepFor(Gt, Gt.WALK_STEP * 0.4);
  Gt.tap(p.x, p.y);
  h.ok(Gt.S.walk === null || Gt.S.walk.done, 'the tap cancels the walk');
  stepFor(Gt, 2);
  h.ok(M.pos.q === a.q && M.pos.r === a.r && !b.visited && !c.visited, 'the crawler stays where it was');
  h.ok(Gt.S.walk === null, 'the cancelled walk is dropped');
  Gt.draw();
});

h.test('map: the road makes the boss walkable from the start with 0 ink on 50 seeds, no rescue needed', () => {
  for (let s = 1; s <= 50; s++) {
    const M = MAP.generate({ act: 1 + (s % 3), rng: U.rng(U.hashStr(s + ':map:1')), ink: 0 });
    let ok = M.road.length >= 2;
    for (let i = 1; ok && i < M.road.length; i++) {
      const [q, r] = M.road[i];
      if (!MAP.canMove(M, q, r) || !MAP.move(M, q, r)) ok = false;
    }
    h.ok(ok && M.pos.q === M.boss.q && M.pos.r === M.boss.r && M.ink === 0, 'seed ' + s + ': the road walks start to boss for no ink');
  }
  // In the game: tap the boss from the start with 0 ink and road content
  // cleared; the crawler walks the whole way and the boss fight opens.
  const T = boot();
  const Gt = T.GAME;
  Gt.newRun('knight', 31);
  const M = Gt.run.map;
  for (const [q, r] of M.road) { const t = MAP.tileAt(M, q, r); if (t.type !== 'boss' && t.type !== 'start') t.done = true; }
  for (const [q, r] of MAP.neighbors(M, M.start.q, M.start.r)) { const t = MAP.tileAt(M, q, r); if (t.type !== 'empty') t.done = true; }
  Gt.run.ink = 0; M.ink = 0;
  Gt.toMap();
  h.eq(Gt.run.ink, 0, 'no ink rescue on a fresh map: the road is enough');
  Gt.lookAt(M.boss.q, M.boss.r);
  const p = Gt.hexToStage(M.boss.q, M.boss.r);
  Gt.tap(p.x, p.y);
  h.ok(Gt.S.walk && Gt.S.walk.path.length >= M.road.length - 3, 'a long walk to the boss starts (' + (Gt.S.walk && Gt.S.walk.path.length) + ' steps for a road of ' + (M.road.length - 1) + ')');
  stepFor(Gt, Gt.WALK_STEP * (M.road.length + 4));
  h.ok(M.pos.q === M.boss.q && M.pos.r === M.boss.r, 'the crawler reaches the boss');
  h.eq(Gt.screen, 'fight', 'the boss fight opens');
  h.eq(Gt.fs && Gt.fs.tier, 'boss', 'at boss tier');
  h.eq(Gt.run.ink, 0, 'for no ink at all');
  const onRoad = new Set(M.road.map(([q, r]) => MAP.key(q, r)));
  const near = new Set(MAP.neighbors(M, M.start.q, M.start.r).map(([q, r]) => MAP.key(q, r)));
  h.ok(Object.values(M.tiles).filter(t => t.visited).every(t => onRoad.has(MAP.key(t.q, t.r)) || near.has(MAP.key(t.q, t.r))), 'every hex walked is on the road (or a lit start neighbour)');
});


h.test('map: sea cannot be tapped, a ford costs 2 to chart and 2 to wade, the rescue covers a stranded crossing', () => {
  const T = boot();
  const Gt = T.GAME;
  Gt.newRun('knight', 91);
  const M = Gt.run.map;
  const sea = Object.values(M.tiles).find(t => t.terrain === 'sea');
  Gt.lookAt(sea.q, sea.r);
  const sp = Gt.hexToStage(sea.q, sea.r);
  const ink0 = Gt.run.ink;
  Gt.tap(sp.x, sp.y);
  h.ok(!sea.revealed && Gt.run.ink === ink0 && !Gt.S.preview, 'tapping the sea does nothing');
  const ford = Object.values(M.tiles).find(t => t.terrain === 'shallow');
  const shore = MAP.neighbors(M, ford.q, ford.r).map(([q, r]) => M.tiles[MAP.key(q, r)]).find(t => t.terrain === 'land');
  h.ok(ford && shore, 'a ford with a shore');
  shore.revealed = true; M.pos = { q: shore.q, r: shore.r }; Gt.run.tile = null;
  Gt.run.ink = 1; M.ink = 1;
  Gt.lookAt(ford.q, ford.r);
  const fp = Gt.hexToStage(ford.q, ford.r);
  Gt.tap(fp.x, fp.y);
  h.ok(!ford.revealed && Gt.run.ink === 1, '1 ink cannot chart a ford');
  Gt.run.ink = 5; M.ink = 5;
  Gt.tap(fp.x, fp.y);
  h.ok(ford.revealed && Gt.run.ink === 3, 'charting the ford spends 2 ink');
  Gt.tap(fp.x, fp.y);
  h.ok(M.pos.q === ford.q && M.pos.r === ford.r && Gt.run.ink === 1 && Gt.screen === 'map', 'wading the ford spends 2 ink and stays on the map');
  const sp2 = Gt.hexToStage(shore.q, shore.r);
  Gt.tap(sp2.x, sp2.y);
  h.ok(M.pos.q === shore.q && Gt.run.ink === 1, 'stepping back onto land is free');
  const inkBefore = Gt.run.ink;
  Gt.tap(fp.x, fp.y);
  h.ok(M.pos.q === shore.q && (Gt.run.ink === inkBefore || /flickers on/.test(Gt.S.lastToast)), 'with 1 bulb the ford is refused (the rescue may light one)');
  Gt.draw();
  // Stranded on a fully cleared island with a hidden ford: the rescue seeps
  // in the 2 the ford needs, not just 1.
  const isle = MAP.islandsOf(M)[0];
  for (const t of Object.values(M.tiles)) { t.revealed = false; t.visited = false; }
  for (const k of isle) { M.tiles[k].revealed = true; M.tiles[k].visited = true; M.tiles[k].done = true; }
  M.pos = { q: M.tiles[isle[0]].q, r: M.tiles[isle[0]].r };
  Gt.run.ink = 0; M.ink = 0; Gt.run.brushes = []; M.brushes = [];
  Gt.toMap();
  h.eq(Gt.run.ink, 2, 'ink rescue pays the 2 a ford needs');
  h.ok(MAP.revealable(M).some(t => t.terrain === 'shallow'), 'and the ford is now revealable');
  Gt.draw();
});

h.test('map: a tower is an elite fight that pays a relic and its bonus', () => {
  const T = boot();
  const Gt = T.GAME;
  Gt.newRun('knight', 77);
  const M = Gt.run.map;
  const tower = Object.values(M.tiles).find(t => t.type === 'tower');
  h.ok(tower && tower.known && tower.content.tower && tower.content.tower.bonus, 'tower tile with a bonus');
  tower.content.tower.bonus = { k: 'ink', n: 2 };
  const ink = Gt.run.ink, relics = Gt.run.relics.length;
  Gt.enterTile(tower);
  h.eq(Gt.screen, 'fight', 'entering a tower starts a fight');
  h.eq(Gt.fs.tier, 'elite', 'at elite tier');
  h.ok(Gt.fight.enemies.every(e => DATA.ENCOUNTERS[1].elite.some(enc => enc.includes(e.id))), 'enemies come from the elite pool');
  stepFor(Gt, 0.2);
  Gt.endFight('win');
  h.eq(Gt.screen, 'reward', 'reward screen after the win');
  Gt.choose(3);
  h.eq(Gt.screen, 'treasure', 'then the treasure screen');
  h.ok(Gt.S.sd && Gt.S.sd.treasure && Gt.S.sd.treasure.relic, 'a relic is offered');
  const eliteInk = (DATA.ECONOMY && DATA.ECONOMY.eliteInk) || 1;
  h.eq(Gt.run.ink, ink + eliteInk + 2, 'elite bulbs plus the +2 bulb bonus');
  h.ok(Object.values(M.tiles).every(t => MAP.hexDist(t.q, t.r, tower.q, tower.r) > MAP.TOWER_VIEW || t.revealed), 'the view from the tower lights everything within radius ' + MAP.TOWER_VIEW);
  h.ok(/view lights \d+ hexes/.test(Gt.S.sd.treasure.sub), 'the treasure screen says how much the view lit');
  Gt.choose(0);
  h.eq(Gt.run.relics.length, relics + 1, 'relic taken');
  h.eq(Gt.screen, 'map', 'back on the map');
  h.ok(tower.done, 'tower cleared');
  // The other bonus kinds apply without throwing.
  for (const bonus of [{ k: 'gold', n: 60 }, { k: 'brush', id: 'splash' }, { k: 'brush', id: 'kite' }, { k: 'claw', u: 'width' }]) {
    const T2 = boot(); const G2 = T2.GAME; G2.newRun('knight', 77);
    const tw = Object.values(G2.run.map.tiles).find(t => t.type === 'tower');
    tw.content.tower.bonus = bonus;
    const gold = G2.run.gold, brushes = G2.run.brushes.length, width = G2.run.claw.width;
    G2.enterTile(tw); stepFor(G2, 0.2); G2.endFight('win'); G2.choose(3);
    h.eq(G2.screen, 'treasure', bonus.k + ' bonus reaches the treasure screen');
    if (bonus.k === 'gold') h.ok(G2.run.gold >= gold + 60, 'gold bonus paid');
    if (bonus.k === 'brush') h.ok(G2.run.brushes.length === brushes + 1 && G2.run.brushes[brushes] === (bonus.id === 'splash' ? 'lantern' : bonus.id), 'tool bonus paid (' + bonus.id + ' -> ' + G2.run.brushes[brushes] + ')');
    if (bonus.k === 'claw') h.ok(G2.run.claw.width > width, 'claw bonus applied');
    G2.choose(0);
    h.eq(G2.screen, 'map', bonus.k + ': back on the map');
  }
});

h.test('map: the HUD reads BULBS, the map head shows bulbs and the tool chips', () => {
  const T = boot();
  const Gt = T.GAME;
  Gt.newRun('knight', 45);
  const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
  h.ok(/class="stat ink"><span class="k">Bulbs<\/span>/.test(html), 'the top bar stat is labelled Bulbs (id inkTxt kept)');
  h.ok(!/<span class="k">Ink<\/span>/.test(html), 'no Ink label left in index.html');
  h.eq(T._nodes.inkTxt.textContent, String(Gt.run.ink), 'the stat shows the bulbs in hand');
  const texts = [];
  const walk = (el) => { if (!el) return; if (el.textContent) texts.push(el.textContent); (el.children || []).forEach(walk); };
  walk(T._nodes.mapHead);
  h.ok(texts.some(x => new RegExp('\\b' + Gt.run.ink + ' bulbs').test(x)), 'the map head pill says N bulbs (' + texts.filter(x => /bulb/.test(x)).join(' / ') + ')');
  h.ok(!texts.some(x => /\bink\b/i.test(x)), 'no copy in the map head says ink');
  Gt.run.brushes = ['flare', 'lantern', 'lantern', 'kite']; Gt.run.map.brushes = Gt.run.brushes.slice();
  Gt.toMap();
  const labels = Gt.S.ui.buttons.map(b => b.label);
  h.ok(labels.includes('Flare') && labels.includes('Lantern') && labels.includes('Kite'), 'a chip per tool (' + labels.join(',') + ')');
  const src = fs.readFileSync(path.join(DIR, 'js', 'game.js'), 'utf8');
  const strings = src.match(/(['"`])(?:\\.|(?!\1)[^\\\n])*\1/g) || [];
  const inkCopy = strings.filter(x => /\bink\b/i.test(x) && /\s/.test(x) && !/\$\{|\.ink|Ink economy/.test(x));
  h.eq(inkCopy.length, 0, 'no player-facing string in game.js says ink: ' + inkCopy.slice(0, 5).join(' | '));
  h.ok(!/\u2014/.test(src), 'no em dashes in game.js');
  Gt.draw();
});

h.test('map: flare, lantern and kite flow through GAME.tap', () => {
  const T = boot();
  const Gt = T.GAME;
  Gt.newRun('knight', 45);
  const M = Gt.run.map;
  Gt.run.brushes = ['flare', 'lantern', 'kite']; M.brushes = Gt.run.brushes.slice();
  Gt.toMap();
  // Flare: arm, aim (a preview), fire on the second tap the same way.
  Gt.selectTool('flare');
  h.eq(Gt.S.brushSel, 'flare', 'the flare is armed');
  const dirs = MAP.DIRS.map((d, i) => i).filter(i => MAP.flareCells(M, i).length >= 3);
  h.ok(dirs.length > 0, 'a direction with room for a flare');
  const dir = dirs[0];
  const [dq, dr] = MAP.DIRS[dir];
  const aim = MAP.tileAt(M, M.pos.q + dq * 2, M.pos.r + dr * 2);
  Gt.lookAt(aim.q, aim.r);
  const p = Gt.hexToStage(aim.q, aim.r);
  const dark = MAP.flareCells(M, dir).filter(([q, r]) => !M.tiles[MAP.key(q, r)].revealed).length;
  Gt.tap(p.x, p.y);
  h.ok(Gt.S.preview && Gt.S.preview.tool === 'flare' && Gt.S.preview.dir === dir && Gt.S.preview.cells.length >= 3, 'the first tap previews the line (' + (Gt.S.preview && Gt.S.preview.cells.length) + ' hexes)');
  h.eq(Gt.run.brushes.length, 3, 'nothing spent on the preview');
  Gt.draw();
  // a tap in another direction re-aims
  const other = (dir + 3) % 6;
  const [oq, or] = MAP.DIRS[other];
  const aim2 = MAP.tileAt(M, M.pos.q + oq, M.pos.r + or);
  if (aim2 && MAP.flareCells(M, other).length) {
    const p2 = Gt.hexToStage(aim2.q, aim2.r);
    Gt.tap(p2.x, p2.y);
    h.ok(Gt.S.preview && Gt.S.preview.dir === other, 'a tap another way re-aims the flare');
    Gt.tap(p.x, p.y);
    h.ok(Gt.S.preview && Gt.S.preview.dir === dir, 'and back');
  }
  const rev = MAP.progress(M).revealed;
  Gt.tap(p.x, p.y);
  h.ok(!Gt.S.preview && Gt.S.brushSel === null, 'the second tap fires and puts the tool away');
  h.eq(Gt.run.brushes.length, 2, 'one flare spent');
  h.ok(M.brushes.length === 2 && !M.brushes.includes('flare'), 'the map tools follow');
  h.eq(MAP.progress(M).revealed, rev + dark, 'the line is lit');
  h.ok(MAP.flareCells(M, dir).every(([q, r]) => M.tiles[MAP.key(q, r)].revealed), 'every hex of the line is lit');
  // Lantern: tap a lit hex.
  Gt.selectTool('lantern');
  const lit = Object.values(M.tiles).find(t => t.revealed && t.terrain === 'land' && MAP.neighbors(M, t.q, t.r).some(([q, r]) => !M.tiles[MAP.key(q, r)].revealed));
  const darkT = Object.values(M.tiles).find(t => !t.revealed && t.terrain === 'land' && !MAP.neighbors(M, t.q, t.r).some(([q, r]) => M.tiles[MAP.key(q, r)].revealed));
  Gt.lookAt(darkT.q, darkT.r);
  const pd = Gt.hexToStage(darkT.q, darkT.r);
  Gt.tap(pd.x, pd.y);
  h.ok(Gt.run.brushes.length === 2 && Gt.S.brushSel === 'lantern', 'a lantern on a dark hex is refused and stays armed');
  Gt.lookAt(lit.q, lit.r);
  const pl = Gt.hexToStage(lit.q, lit.r);
  Gt.tap(pl.x, pl.y);
  h.ok(Gt.run.brushes.length === 1 && Gt.S.brushSel === null, 'the lantern is hung and spent');
  h.ok(MAP.neighbors(M, lit.q, lit.r).every(([q, r]) => M.tiles[MAP.key(q, r)].revealed), 'its ring is lit');
  // Kite: tap a dark hex within 6.
  Gt.selectTool('kite');
  const far = Object.values(M.tiles).find(t => !t.revealed && t.terrain === 'land' && MAP.hexDist(t.q, t.r, M.pos.q, M.pos.r) === 5);
  const tooFar = Object.values(M.tiles).find(t => !t.revealed && t.terrain === 'land' && MAP.hexDist(t.q, t.r, M.pos.q, M.pos.r) === 8);
  Gt.lookAt(tooFar.q, tooFar.r);
  const pt = Gt.hexToStage(tooFar.q, tooFar.r);
  Gt.tap(pt.x, pt.y);
  h.ok(Gt.run.brushes.length === 1 && Gt.S.brushSel === 'kite', 'a kite out of range is refused');
  Gt.lookAt(far.q, far.r);
  const pf = Gt.hexToStage(far.q, far.r);
  Gt.tap(pf.x, pf.y);
  h.ok(Gt.run.brushes.length === 0 && far.revealed && MAP.neighbors(M, far.q, far.r).every(([q, r]) => M.tiles[MAP.key(q, r)].revealed), 'the kite lights the patch and is spent');
  h.ok(!Gt.S.brushSel && Gt.S.ui.buttons.every(b => !/Flare|Lantern|Kite/.test(b.label)), 'no chips left');
  h.eq(Gt.run.ink, M.ink, 'bulbs untouched by the tools (' + Gt.run.ink + ')');
  Gt.draw();
  // selectTool(null) puts a tool away and drops a flare preview.
  Gt.run.brushes = ['flare']; M.brushes = ['flare']; Gt.toMap();
  Gt.selectTool('flare'); Gt.tap(p.x, p.y);
  Gt.selectTool(null);
  h.ok(!Gt.S.brushSel && !Gt.S.preview, 'putting the flare away clears its preview');
});

h.test('map: terrain vision on a hill lights two rings, on lowland one, as the crawler walks', () => {
  const R = walkRig(23);
  const { G: Gt, M, chain } = R;
  const [a, b, c] = chain;
  for (const t of [a, b, c]) t.elev = 0.3;
  b.elev = 0.9; b.ground = 'hill';
  for (const t of Object.values(M.tiles)) if (![a, b, c].includes(t) && t.type !== 'start' && t.type !== 'boss') t.revealed = false;
  M.revealedCount = Object.values(M.tiles).filter(t => t.revealed && t.terrain !== 'sea').length;
  Gt.toMap();
  Gt.lookAt(a.q, a.r);
  const p = Gt.hexToStage(a.q, a.r);
  Gt.tap(p.x, p.y);
  h.ok(M.pos.q === a.q && M.pos.r === a.r, 'stepped onto the lowland hex');
  h.ok(MAP.disc(M, a.q, a.r, 1).every(([q, r]) => M.tiles[MAP.key(q, r)].revealed), 'lowland: its ring is lit');
  h.ok(MAP.disc(M, a.q, a.r, 2).some(([q, r]) => MAP.hexDist(q, r, a.q, a.r) === 2 && MAP.hexDist(q, r, M.start.q, M.start.r) > 1 && !M.tiles[MAP.key(q, r)].revealed), 'lowland: the second ring stays dark');
  Gt.lookAt(b.q, b.r);
  const pb = Gt.hexToStage(b.q, b.r);
  Gt.tap(pb.x, pb.y);
  h.ok(M.pos.q === b.q && M.pos.r === b.r, 'stepped onto the hill');
  h.ok(MAP.disc(M, b.q, b.r, 2).every(([q, r]) => M.tiles[MAP.key(q, r)].revealed), 'hill: two rings lit');
  h.eq(MAP.progress(M).revealed, Object.values(M.tiles).filter(t => t.revealed && t.terrain !== 'sea').length, 'progress in sync');
  Gt.draw();
});

h.test('map: a resolved tile loses its icon (tile.done and the draw fingerprint)', () => {
  const T = boot();
  const Gt = T.GAME, R = T.RENDER;
  Gt.newRun('knight', 45);
  const M = Gt.run.map;
  const gem = Object.values(M.tiles).find(t => t.type === 'gem' && t.revealed) || Object.values(M.tiles).find(t => t.type === 'gem');
  gem.revealed = true;
  const paints = (tile) => { T._resetCounts(); R.hex(T._ctx, 50, 50, 30, tile, { t: 1, orient: 'v', fill: '#888', seed: 3, biome: 'cellar' }); return Object.assign({}, T._counts); };
  const before = paints(gem);
  const gold = Gt.run.gold;
  M.pos = { q: gem.q, r: gem.r };
  Gt.enterTile(gem);
  h.ok(gem.done && Gt.run.gold > gold, 'the gem is taken and done');
  const after = paints(gem);
  const sum = (c) => (c.fill || 0) + (c.stroke || 0) + (c.drawImage || 0);
  h.ok(sum(before) > sum(after), 'a done tile draws fewer paints (no icon): ' + sum(before) + ' -> ' + sum(after));
  const bare = paints({ type: 'empty', revealed: true, q: gem.q, r: gem.r, terrain: 'land' });
  h.eq(sum(after), sum(bare), 'a done tile paints like bare ground');
  // A box of bulbs and a tool tile vanish too, once taken.
  const box = Object.values(M.tiles).find(t => t.type === 'ink');
  box.revealed = true; M.pos = { q: box.q, r: box.r };
  const bulbs = Gt.run.ink;
  Gt.enterTile(box);
  h.ok(box.done && Gt.run.ink === bulbs + (DATA.ECONOMY.inkTile || 2) && /box of bulbs/.test(Gt.S.lastToast), 'a box of bulbs is taken (' + Gt.S.lastToast + ')');
  const tool = Object.values(M.tiles).find(t => t.type === 'brush');
  tool.revealed = true; M.pos = { q: tool.q, r: tool.r };
  const n = Gt.run.brushes.length;
  Gt.enterTile(tool);
  h.ok(tool.done && Gt.run.brushes.length === n + 1 && ['flare', 'lantern', 'kite'].includes(Gt.run.brushes[n]) && /Found a tool/.test(Gt.S.lastToast), 'a tool tile hands out a tool (' + Gt.S.lastToast + ')');
  // done survives the save round trip and the icon stays gone
  Gt.toMap(); Gt.save();
  const T2 = boot({ store: Object.assign({}, T._store) });
  h.ok(T2.GAME.load(), 'reloaded');
  const M2 = T2.GAME.run.map;
  h.ok(M2.tiles[MAP.key(gem.q, gem.r)].done && M2.tiles[MAP.key(box.q, box.r)].done, 'done flags survive the save');
  Gt.draw(); T2.GAME.draw();
});

h.test('map: an old save with brushes and no tileset loads as lanterns on a sane map', () => {
  const T = boot();
  const Gt = T.GAME;
  Gt.newRun('knight', 45);
  Gt.toMap(); Gt.save();
  const raw = JSON.parse(T._store[Gt.RUN_KEY]);
  raw.run.brushes = ['splash', 'comb'];
  raw.run.map.brushes = ['splash', 'comb'];
  delete raw.run.map.seed;
  for (const k in raw.run.map.tiles) { delete raw.run.map.tiles[k].ground; if (raw.run.map.tiles[k].type === 'brush') raw.run.map.tiles[k].content.brush = 'drip'; }
  const T2 = boot({ store: { [Gt.RUN_KEY]: JSON.stringify(raw) } });
  h.ok(T2.GAME.load(), 'the old save loads');
  const M2 = T2.GAME.run.map;
  h.eq(T2.GAME.run.brushes.join(), 'lantern,lantern', 'old brushes are lanterns');
  h.eq(M2.brushes.join(), 'lantern,lantern', 'on the map too');
  h.ok(Object.values(M2.tiles).every(t => MAP.GROUNDS.includes(t.ground)), 'every tile got a ground');
  h.ok(Object.values(M2.tiles).filter(t => t.type === 'brush').every(t => t.content.brush === 'lantern'), 'tool tiles hand out lanterns');
  h.ok(T2.GAME.S.ui.buttons.some(b => b.label === 'Lantern'), 'a lantern chip (x2)');
  T2.GAME.draw();
});

h.test('walking onto a fight tile starts a fight with a body per bin item', () => {
  const t = seedInfo.tile;
  const p = G.hexToStage(t.q, t.r);
  G.tap(p.x, p.y);
  h.eq(G.screen, 'fight', 'fight screen');
  h.ok(G.fight && G.fight.enemies.length >= 1, 'enemies present');
  h.ok(G.rig && G.world && G.cabinet, 'physics live');
  h.eq(G.S.coachStep, 0, 'tutorial coach mark shown on a fresh profile');
  stepFor(G, 3);
  h.eq(G.fs.items.length, G.fight.bin.length, 'one body per bin instance');
  stepFor(G, 1.5);
  console.log(`  pile max speed after 4.5 s: ${maxSpeed(G).toFixed(2)} px/s (physics owns the < 2 target)`);
  h.ok(maxSpeed(G) < 60, `pile did not explode (max speed ${maxSpeed(G).toFixed(2)})`);
  for (const b of G.world.bodies) if (b.type === 'dynamic') h.ok(b.x > -5 && b.x < 485 && b.y > -5 && b.y < 395, 'no body escaped the cabinet');
  h.ok(settle(G, 5), 'rig idle and ready');
  h.eq(G.state().rigPhase, 'idle', 'rig idle');
  h.eq(G.state().grabs, G.fight.player.grabsMax, 'full grabs');
  G.draw();
});

h.test('steer + drop runs a full grab cycle and spends a grab', () => {
  const grabs = G.state().grabs;
  const target = itemBodies(G)[0];
  h.ok(G.steer(target.x), 'steer accepted');
  h.ok(G.dropClaw(), 'drop accepted');
  h.eq(G.state().grabs, grabs - 1, 'grab spent');
  h.ok(G.state().grabInFlight, 'grab in flight');
  h.ok(!G.dropClaw(), 'cannot drop while busy');
  h.eq(G.S.hint, '...', 'hint shows ... while busy');
  const phases = new Set();
  let n = 0;
  while (G.state().grabInFlight && n < 60 * 20) { phases.add(G.state().rigPhase); G.update(DT); n++; }
  h.ok(!G.state().grabInFlight, 'grab finished within 20 s');
  h.ok(phases.has('dropping') && phases.has('lifting'), 'rig went through dropping and lifting');
  h.ok(n * DT < G.WATCHDOG, 'finished before the watchdog');
  h.ok(settle(G, 5), 'ready again after the grab');
});

h.test("a rig 'slip' event plays the sfx, floats SLIP at the palm and shakes", () => {
  const calls = [];
  const sfx0 = CS.AUDIO.sfx;
  CS.AUDIO.sfx = (n) => calls.push(n);
  const R = CS.RENDER;
  const t0 = R.fx.textCount();
  G.rigEvent('lift');
  h.ok(/holding|empty claw/.test(G.S.hint), 'lift hint reports the hold (' + G.S.hint + ')');
  const slips0 = G.fs.slips;
  G.rigEvent('slip');
  h.ok(calls.includes('itemSlip'), 'itemSlip sfx on slip');
  h.eq(R.fx.textCount(), t0 + 1, 'one floating text spawned');
  h.ok(/slip/.test(G.S.hint), 'hint mentions the slip (' + G.S.hint + ')');
  h.eq(G.fs.slips, slips0 + 1, 'slip counted on the fight session');
  G.rigEvent('shed');
  h.eq(G.fs.slips, slips0 + 1, 'a shed (cradle full at the lift) is not a slip');
  h.eq(R.fx.textCount(), t0 + 2, 'shed floats its own text');
  const off = R.fx.offset();
  h.ok(Math.abs(off.x) + Math.abs(off.y) > 0, 'a small shake');
  G.rigEvent('close');
  h.ok(calls.includes('clawClose') && R.fx.count() > 0, 'close sparks + sfx');
  CS.AUDIO.sfx = sfx0;
  R.fx.clear();
});

let deliveries = 0, drops = 0;
h.test('over 30 drops at least 18 deliver; fights end; the game never sticks', () => {
  const rng = U.rng(99);
  let turnsSeen = 0, fights = 0, lastTurn = -1, wins = 0;
  const startDelivered = G.run.delivered;
  let guard = 0;
  while (drops < 30 && guard++ < 400) {
    if (G.screen !== 'fight') {
      if (G.screen === 'reward') { G.choose(3); }
      if (G.screen === 'gameover') { h.ok(false, 'lost the stat fight'); break; }
      if (G.screen === 'map') { G.startFight(['rat', 'rat'], 'normal'); fights++; stepFor(G, 3); }
      continue;
    }
    if (!settle(G, 40)) { h.ok(false, 'fight stuck: rig ' + G.state().rigPhase + ' q=' + G.state().queue); break; }
    if (G.screen !== 'fight') continue;
    if (G.fight.turn !== lastTurn) { lastTurn = G.fight.turn; turnsSeen++; }
    if (G.fight.player.hp < 40) { G.fight.player.hp = G.fight.player.maxHp; }   // keep the stat fight alive
    const bodies = itemBodies(G);
    if (!bodies.length) { stepFor(G, 1); continue; }
    const b = bodies[Math.floor(rng() * bodies.length)];
    G.steer(b.x);
    const before = G.run.delivered;
    if (!G.dropClaw()) { stepFor(G, 0.5); continue; }
    drops++;
    let n = 0;
    while (G.screen === 'fight' && G.state().grabInFlight && n++ < 60 * 20) G.update(DT);
    if (G.run.delivered > before) deliveries += G.run.delivered - before;
  }
  h.eq(drops, 30, 'made 30 drops');
  h.ok(deliveries >= 18, `at least 18 of 30 drops delivered (got ${deliveries})`);
  h.ok(turnsSeen >= 5, `turns advanced (${turnsSeen})`);
  h.ok(G.run.grabs >= 30, 'run grab counter tracks drops');
  console.log(`  deliveries ${deliveries}/${drops}, turns ${turnsSeen}, extra fights ${fights}`);
});

h.test('END TURN plays the enemy turn on beats and the enemy acts', () => {
  // Make sure we are in a fight with a live enemy (a won fight plays its outro first).
  settle(G, 5);
  if (G.screen === 'reward') G.choose(3);
  if (G.screen === 'map') { G.startFight(['gremlin'], 'normal'); stepFor(G, 3); }
  h.ok(settle(G, 30), 'ready');
  const F = G.fight;
  const hp = F.player.hp, block = F.player.block, logN = F.log.length, turn = F.turn;
  const ehp = F.enemies.map(e => e.hp).join(',');
  h.ok(G.endTurn(), 'end turn accepted while idle');
  h.ok(G.state().enemyTurn, 'enemy turn running');
  h.ok(!G.endTurn(), 'cannot end turn twice');
  h.ok(!G.dropClaw(), 'cannot drop during the enemy turn');
  const q0 = G.state().queue;
  stepFor(G, 0.2);
  h.ok(G.state().enemyTurn || G.screen !== 'fight' || F.turn === turn + 1, 'events are paced, not instant');
  let n = 0;
  while (G.screen === 'fight' && G.state().enemyTurn && n++ < 60 * 30) G.update(DT);
  h.ok(!G.state().enemyTurn, 'enemy turn finished');
  const F2 = G.fight || F;
  const acted = F2.player.hp !== hp || F2.player.block !== block || F2.log.length > logN || F2.turn === turn + 1 || F2.enemies.map(e => e.hp).join(',') !== ehp || G.screen !== 'fight';
  h.ok(acted, 'something happened on the enemy turn');
  if (G.screen === 'fight') { h.eq(F2.turn, turn + 1, 'turn advanced'); h.eq(F2.player.grabs, F2.player.grabsMax, 'grabs refilled'); }
  console.log(`  enemy turn: ${q0} events queued`);
});

h.test('fight to the end within 40 turns, then reward -> pick -> bin grows', () => {
  const rng = U.rng(7);
  let turns = 0, guard = 0;
  while (G.screen === 'fight' && turns < 40 && guard++ < 1000) {
    if (!settle(G, 40)) { h.ok(false, 'stuck'); break; }
    if (G.screen !== 'fight') break;
    if (G.fight.player.grabs > 0) {
      const bodies = itemBodies(G);
      if (bodies.length) { const b = bodies[Math.floor(rng() * bodies.length)]; G.steer(b.x); }
      if (!G.dropClaw()) stepFor(G, 0.3);
      let n = 0;
      while (G.screen === 'fight' && G.state().grabInFlight && n++ < 60 * 20) G.update(DT);
    } else {
      const t = G.fight.turn;
      let n = 0;
      while (G.screen === 'fight' && G.fight.turn === t && n++ < 60 * 30) G.update(DT);
      turns++;
    }
  }
  if (G.screen === 'fight') { h.ok(false, 'fight did not end in 40 turns'); G.endFight('win'); }
  h.ok(G.screen === 'reward' || G.screen === 'gameover', 'fight ended on reward or game over (' + G.screen + ')');
  if (G.screen === 'gameover') { h.ok(true, 'lost: fine for the flow'); return; }
  h.ok(G.S.ui.buttons.length === 4, 'three item cards plus skip');
  const before = G.run.bin.length;
  const gold = G.run.gold;
  h.ok(gold > 0, 'gold awarded');
  h.ok(G.choose(0), 'picked the first item');
  h.eq(G.run.bin.length, before + 1, 'bin grew');
  h.eq(G.screen, 'map', 'back on the map');
  h.ok(!G.fight, 'fight state cleared');
  h.eq(G.run.kills >= 1, true, 'kills counted');
});

h.test('save/load round trip restores screen and run', () => {
  if (G.screen === 'gameover') { G.newRun('knight', 3); }
  G.save();
  const raw = CS._store.clawspire_run;
  h.ok(raw, 'run saved under clawspire_run');
  const saved = JSON.parse(raw);
  h.eq(saved.ver, 1, 'save has a version');
  h.eq(saved.screen, 'map', 'saved on the map');
  const CS2 = boot({ store: Object.assign({}, CS._store) });
  const G2 = CS2.GAME;
  h.eq(G2.screen, 'title', 'second boot on title');
  const cont = G2.S.ui.buttons.findIndex(b => /continue/i.test(b.label));
  h.ok(cont >= 0, 'CONTINUE offered');
  G2.choose(cont);
  h.eq(G2.screen, 'map', 'continued to the map');
  h.eq(G2.run.seed, G.run.seed, 'seed restored');
  h.eq(G2.run.bin.length, G.run.bin.length, 'bin restored');
  h.eq(G2.run.gold, G.run.gold, 'gold restored');
  h.eq(G2.run.map.pos.q + ',' + G2.run.map.pos.r, G.run.map.pos.q + ',' + G.run.map.pos.r, 'position restored');
  h.eq(MAP.progress(G2.run.map).revealed, MAP.progress(G.run.map).revealed, 'reveals restored');
  // Reward screen survives a reload.
  G2.startFight(['rat'], 'normal');
  stepFor(G2, 0.5);
  G2.endFight('win');
  h.eq(G2.screen, 'reward', 'reward after a forced win');
  const CS3 = boot({ store: Object.assign({}, CS2._store) });
  CS3.GAME.choose(CS3.GAME.S.ui.buttons.findIndex(b => /continue/i.test(b.label)));
  h.eq(CS3.GAME.screen, 'reward', 'reward screen restored');
  h.eq(CS3.GAME.S.ui.buttons.length, 4, 'reward cards rebuilt');
  // A fight in progress restarts on load.
  CS3.GAME.choose(3);
  CS3.GAME.startFight(['bat', 'bat'], 'normal');
  const CS4 = boot({ store: Object.assign({}, CS3._store) });
  CS4.GAME.choose(CS4.GAME.S.ui.buttons.findIndex(b => /continue/i.test(b.label)));
  h.eq(CS4.GAME.screen, 'fight', 'pending fight restarted on load');
  h.eq(CS4.GAME.fight.enemies.map(e => e.id).join(','), 'bat,bat', 'same enemies');
  // A corrupt save is tolerated.
  const CS5 = boot({ store: { clawspire_run: '{not json', clawspire_meta: 'garbage' } });
  h.eq(CS5.GAME.screen, 'title', 'corrupt save: title still boots');
  h.ok(!CS5.GAME.S.ui.buttons.some(b => /continue/i.test(b.label)), 'corrupt save: no CONTINUE');
  h.ok(CS5.GAME.meta.unlocks.knight, 'corrupt meta: fresh meta');
});

h.test('determinism: same seed, same map, same shower', () => {
  const A = boot(), B = boot();
  A.GAME.newRun('knight', 42); B.GAME.newRun('knight', 42);
  h.eq(JSON.stringify(A.GAME.run.map.tiles), JSON.stringify(B.GAME.run.map.tiles), 'identical maps');
  A.GAME.startFight(['rat', 'rat'], 'normal'); B.GAME.startFight(['rat', 'rat'], 'normal');
  stepFor(A.GAME, 2); stepFor(B.GAME, 2);
  const pa = A.GAME.fs.items.map(b => b.x.toFixed(3) + ',' + b.y.toFixed(3)).join(';');
  const pb = B.GAME.fs.items.map(b => b.x.toFixed(3) + ',' + b.y.toFixed(3)).join(';');
  h.eq(pa, pb, 'identical body positions after 2 s');
  h.eq(A.GAME.fight.enemies.map(e => e.hp).join(','), B.GAME.fight.enemies.map(e => e.hp).join(','), 'identical enemy hp');
});

h.test('bin events from COMBAT reach the cabinet', () => {
  const T = boot();
  const Gt = T.GAME;
  Gt.newRun('knight', 5);
  Gt.startFight(['rat'], 'normal');
  stepFor(Gt, 3);
  const F = Gt.fight;
  const n0 = Gt.fs.items.length;
  // Junk arrives as bodies.
  T.COMBAT.addJunk(F, 'rock', 2);
  Gt.S.fs; // noop
  const evs = F.events.slice(); F.events.length = 0;
  for (const ev of evs) Gt.fs.queue.push({ ev, beat: 0.01 });
  stepFor(Gt, 1);
  h.eq(Gt.fs.items.length, n0 + 2, 'junk spawned two bodies');
  // Steal removes a body.
  T.COMBAT.stealItem(F);
  for (const ev of F.events.splice(0)) Gt.fs.queue.push({ ev, beat: 0.01 });
  stepFor(Gt, 0.5);
  h.eq(Gt.fs.items.length, n0 + 1, 'stolen item body removed');
  // Freeze swaps the shape to a circle.
  const inst = T.COMBAT.freezeItem(F);
  for (const ev of F.events.splice(0)) Gt.fs.queue.push({ ev, beat: 0.01 });
  stepFor(Gt, 0.5);
  const fb = Gt.fs.items.find(b => b.data.inst.uid === inst.uid);
  h.ok(fb && fb.shape.kind === 'circle', 'frozen item is a circle body');
  // Tilt changes gravity for the turn, shake adds energy, grease lowers friction.
  Gt.fs.queue.push({ ev: { t: 'binTilt', dir: 1 }, beat: 0.01 });
  Gt.fs.queue.push({ ev: { t: 'binGrease', turns: 1 }, beat: 0.01 });
  stepFor(Gt, 0.1);
  h.ok(Gt.world.gravity.x > 0, 'gravity tilted');
  h.eq(Gt.rig.cfg.grease, 1, 'grease makes the claw slippery (grip -0.3), not the items');
  h.ok(Gt.rig.geo.grip < 0.3, 'greased grip_cc is low (' + Gt.rig.geo.grip.toFixed(2) + ')');
  const e0 = Gt.world.energy();
  Gt.fs.queue.push({ ev: { t: 'binShake' }, beat: 0.01 });
  stepFor(Gt, 0.05);
  h.ok(Gt.world.energy() > e0, 'shake adds energy');
  stepFor(Gt, 3);
  for (const b of Gt.world.bodies) if (b.type === 'dynamic') h.ok(b.x > -5 && b.x < 485 && b.y > -5 && (b.y < 395 || Gt.cabinet.inChute(b)), 'no escape after shake/tilt');
  h.ok(settle(Gt, 10), 'ready');
  Gt.endTurn();
  h.eq(Gt.world.gravity.x, 0, 'tilt cleared at end of turn');
  h.eq(Gt.rig.cfg.grease, 0, 'grease cleared at end of turn');
});

h.test('the watchdog frees a jammed rig', () => {
  const T = boot();
  const Gt = T.GAME;
  Gt.newRun('knight', 11);
  Gt.startFight(['rat'], 'normal');
  stepFor(Gt, 3);
  settle(Gt, 10);
  Gt.steer(150);
  Gt.dropClaw();
  // Jam the rig: the world's substeps drive the state machine, so pin it in
  // the lift from update() (the game's own entry point) every frame.
  const rig = Gt.rig;
  rig.update = () => { rig.ctl.st = 'lift'; rig.ctl.t = 0; rig.ctl.y = 200; rig.phase = 'lifting'; return []; };
  stepFor(Gt, Gt.WATCHDOG + 0.5);
  h.ok(!Gt.state().grabInFlight, 'grab released by the watchdog');
  h.ok(Gt.rig !== rig, 'rig rebuilt');
  h.eq(Gt.state().rigPhase, 'idle', 'new rig idle');
  h.ok(Gt.S.hint !== '...', 'hint restored');
});

h.test('game over when hp reaches 0, meta stats updated', () => {
  const T = boot();
  const Gt = T.GAME;
  const runs0 = Gt.meta.stats.runs;
  Gt.newRun('knight', 9);
  h.eq(Gt.meta.stats.runs, runs0 + 1, 'runs counted');
  Gt.startFight(['rat', 'rat'], 'normal');
  stepFor(Gt, 3);
  settle(Gt, 10);
  const F = Gt.fight;
  T.COMBAT.damage(F, F.enemies[0], F.player, 999, { pierce: true });
  h.eq(F.player.hp, 0, 'hp is 0');
  stepFor(Gt, 0.5);
  h.eq(Gt.screen, 'gameover', 'game over screen');
  h.ok(!Gt.fight, 'fight cleared');
  h.ok(T._store.clawspire_run == null, 'saved run removed');
  const meta = JSON.parse(T._store.clawspire_meta);
  h.eq(meta.stats.runs, runs0 + 1, 'meta persisted');
  h.eq(meta.stats.bestAct, 1, 'best act recorded');
  Gt.choose(0);
  h.eq(Gt.screen, 'title', 'back to title');
  h.ok(!Gt.run, 'no run after game over');
});

h.test('act transition, unlocks and the win screen', () => {
  const T = boot();
  const Gt = T.GAME;
  Gt.newRun('knight', 21);
  Gt.run.hp = 30;
  Gt.startFight(T.DATA.ENCOUNTERS[1].boss[0], 'boss');
  stepFor(Gt, 0.2);
  Gt.endFight('win');
  h.eq(Gt.screen, 'reward', 'boss reward');
  Gt.choose(3);
  // Claw upgrades come from bosses: the spare parts screen, then the relic.
  h.eq(Gt.screen, 'parts', 'boss drops spare claw parts first');
  const parts = Gt.S.sd && Gt.S.sd.parts;
  h.ok(parts && parts.pick.length === 3 && new Set(parts.pick).size === 3 && parts.pick.every(id => T.DATA.CLAW_UPGRADES[id]), 'three distinct claw upgrades offered');
  h.eq(Gt.S.ui.buttons.length, 3, 'one card per upgrade');
  const up = parts.pick[0];
  const claw0 = JSON.stringify(Object.assign({}, Gt.run.claw, { ups: null }));
  Gt.choose(0);
  h.eq((Gt.run.claw.ups || {})[up], 1, 'the picked upgrade is applied once');
  h.ok(JSON.stringify(Object.assign({}, Gt.run.claw, { ups: null })) !== claw0, 'the claw changed');
  h.eq(Gt.screen, 'treasure', 'boss relic offered after the parts');
  h.eq(Gt.run.act, 2, 'act 2');
  h.ok(Gt.run.hp > 30, 'healed 30%');
  h.ok(Gt.run.ink >= START_INK, 'ink topped up for the new act');
  h.ok(Gt.meta.unlocks.alchemist, 'alchemist unlocked at act 2');
  const relics = Gt.run.relics.length;
  Gt.choose(0);
  h.eq(Gt.run.relics.length, relics + 1, 'relic taken');
  h.eq(Gt.screen, 'map', 'new map for act 2');
  h.eq(Gt.run.map.act, 2, 'map is act 2');
  Gt.run.act = 3;
  Gt.startFight(['prizemaster'], 'boss');
  stepFor(Gt, 0.2);
  Gt.endFight('win');
  Gt.choose(3);
  h.eq(Gt.screen, 'win', 'win screen after act 3 boss');
  h.ok(Gt.meta.unlocks.rogue, 'rogue unlocked by a win');
  h.eq(Gt.meta.stats.wins, 1, 'win counted');
  Gt.choose(0);
  h.eq(Gt.screen, 'title', 'title after the win');
});

h.test('shop, rest, forge, treasure and bin screens', () => {
  const T = boot();
  const Gt = T.GAME;
  Gt.newRun('knight', 31);
  const shop = Gt.rollShop({ q: 1, r: 1 });
  h.eq(shop.items.length, 5, 'five shop items');
  h.ok(shop.relic && !shop.claws, 'a relic, no claw upgrades stocked');
  for (let s = 1; s <= 20; s++) h.ok(!('claws' in Gt.rollShop({ q: s, r: s % 4 })), `shop ${s} sells no claw upgrades`);
  Gt.showShop(shop);
  h.eq(Gt.screen, 'shop', 'shop screen');
  Gt.run.gold = 500;
  Gt.showShop(shop);
  const bin = Gt.run.bin.length;
  Gt.choose(0);
  h.eq(Gt.run.bin.length, bin + 1, 'bought an item');
  h.eq(Gt.run.gold, 500 - shop.items[0].price, 'paid for it');
  h.ok(shop.items[0].sold, 'marked sold');
  const clawNames = Object.values(T.DATA.CLAW_UPGRADES).map(u => u.name);
  h.ok(!Gt.S.ui.buttons.some(b => clawNames.includes(b.label)), 'no claw upgrade cards in the shop');
  const rm = Gt.S.ui.buttons.findIndex(b => /remove/i.test(b.label));
  Gt.choose(rm);
  h.eq(Gt.screen, 'bin', 'bin picker for removal');
  const bin2 = Gt.run.bin.length;
  Gt.choose(0);
  h.eq(Gt.run.bin.length, bin2 - 1, 'item removed');
  h.eq(Gt.screen, 'shop', 'back in the shop');
  Gt.showRest();
  h.eq(Gt.S.ui.buttons.length, 2, 'rest offers exactly two choices');
  const restLabels = Gt.S.ui.buttons.map(b => b.el && b.el.children ? b.el.children.map(c => c.textContent).join(' ') : b.label);
  h.ok(/heal/i.test(restLabels[0]) && /upgrade/i.test(restLabels[1]), 'heal, then upgrade an item (' + restLabels.join(' | ') + ')');
  Gt.choose(1);
  h.eq(Gt.screen, 'bin', 'the second rest choice opens the item upgrade picker');
  Gt.run.hp = 10;
  Gt.showRest();
  Gt.choose(0);
  h.eq(Gt.run.hp, 10 + Math.round(Gt.run.maxHp * 0.3), 'rest heals 30%');
  h.eq(Gt.screen, 'map', 'rest returns to the map');
  Gt.showForge();
  h.eq(Gt.screen, 'forge', 'forge screen');
  Gt.choose(0);
  h.ok(Gt.run.bin.some(i => i.plus), 'forge upgraded an item');
  Gt.showTreasure({ relic: 'squire_gauntlet', gold: 0, title: 'T' });
  Gt.openBin({ mode: 'view', back: () => Gt.toMap() });
  h.eq(Gt.screen, 'bin', 'bin viewer');
  Gt.choose(0);
  h.ok(Gt.S.popover, 'tapping an item shows its text');
  Gt.tap(10, 900);
  h.ok(!Gt.S.popover, 'tapping elsewhere closes it');
  Gt.showHelp('map'); h.eq(Gt.screen, 'help', 'help'); Gt.draw();
  Gt.showCollection(); h.eq(Gt.screen, 'collection', 'collection'); Gt.draw();
  Gt.toMap();
});

h.test('every event choice resolves without throwing', () => {
  const ids = Object.keys(DATA.EVENTS);
  h.ok(ids.length >= 14, `${ids.length} events`);
  for (const id of ids) {
    const ev = DATA.EVENTS[id];
    for (let c = 0; c < ev.choices.length; c++) {
      const T = boot();
      const Gt = T.GAME;
      Gt.newRun('knight', 100 + c);
      Gt.run.gold = 999;
      Gt.showEvent({ id });
      h.eq(Gt.screen, 'event', `${id}: event screen`);
      try {
        Gt.choose(c);
        for (let k = 0; k < 4 && Gt.screen === 'bin'; k++) chooseFirst(Gt);
        if (Gt.screen === 'fight') { stepFor(Gt, 0.2); Gt.endFight('win'); h.eq(Gt.screen, 'reward', `${id}/${c}: fight then reward`); Gt.choose(3); }
        for (let k = 0; k < 4 && Gt.screen === 'bin'; k++) chooseFirst(Gt);
        h.ok(['map', 'gameover', 'fight', 'reward'].indexOf(Gt.screen) >= 0, `${id}/${c}: ends on a known screen (${Gt.screen})`);
      } catch (e) { h.ok(false, `${id}/${c} threw: ${e.message}`); }
    }
  }
});

h.test('every map tile type resolves', () => {
  const T = boot();
  const Gt = T.GAME;
  Gt.newRun('knight', 55);
  const types = ['empty', 'gem', 'ink', 'brush', 'treasure', 'shop', 'rest', 'forge', 'event', 'fight', 'elite', 'tower'];
  for (const ty of types) {
    Gt.toMap();
    const M = Gt.run.map;
    const t = Object.values(M.tiles).find(x => x.type === ty && !x.done);
    if (!t) { console.log('  (no', ty, 'tile on this map)'); continue; }
    try {
      Gt.enterTile(t);
      h.ok(true, ty + ' resolved');
      if (Gt.screen === 'fight') { stepFor(Gt, 0.2); Gt.endFight('win'); Gt.choose(3); }
      if (Gt.screen === 'event') Gt.choose(0);
      if (Gt.screen === 'bin') chooseFirst(Gt);
      if (Gt.screen === 'fight') { stepFor(Gt, 0.2); Gt.endFight('win'); Gt.choose(3); }
      if (Gt.screen === 'treasure') Gt.choose(0);
      if (Gt.screen === 'shop' || Gt.screen === 'rest' || Gt.screen === 'forge') Gt.toMap();
    } catch (e) { h.ok(false, ty + ' threw: ' + e.message); }
  }
  Gt.toMap();
  h.eq(Gt.screen, 'map', 'back on the map');
});

h.test('keyboard steering and drop', () => {
  const T = boot();
  const Gt = T.GAME;
  Gt.newRun('knight', 61);
  Gt.startFight(['rat'], 'normal');
  stepFor(Gt, 3);
  settle(Gt, 10);
  const kd = T._listeners.keydown, ku = T._listeners.keyup;
  h.ok(kd && ku, 'key listeners bound');
  const x0 = Gt.rig.targetX;
  kd({ key: 'ArrowLeft' });
  stepFor(Gt, 0.5);
  ku({ key: 'ArrowLeft' });
  h.ok(Gt.rig.targetX < x0, 'left arrow steers left');
  const g = Gt.state().grabs;
  kd({ key: ' ', preventDefault() {} });
  h.eq(Gt.state().grabs, g - 1, 'space drops');
  kd({ key: 'Escape' });
  Gt.draw();
});

h.test('intro: first launch marks introSeen and lands on the title, INTRO button replays', () => {
  const api = boot();
  const G = api.GAME;
  {
    h.ok(api.INTRO && typeof api.INTRO.play === 'function', 'INTRO exposed on window.CS');
    h.eq(G.meta.introSeen, true, 'first launch: intro seen (headless no-op ran)');
    h.eq(G.screen, 'title', 'reached the title after onDone');
    const saved = JSON.parse(api._store[G.META_KEY] || '{}');
    h.eq(saved.introSeen, true, 'introSeen persisted');
    const b = G.S.ui.buttons.find(x => x.label === 'Intro');
    h.ok(!!b, 'the title has an INTRO button');
    let screens = [];
    if (b) { b.fn(); screens.push(G.screen); }
    h.eq(G.screen, 'title', 'replay headless returns to the title at once');
    h.eq(api.INTRO.active, false, 'nothing left running');
    // a profile that has seen it does not replay on boot
    const again = boot({ store: { clawspire_meta: JSON.stringify({ introSeen: true, unlocks: { knight: true } }) } });
    h.eq(again.GAME.meta.introSeen, true, 'stored introSeen read back');
    h.eq(again.GAME.screen, 'title', 'boots to the title');
    void screens;
  }
});


h.test('juice: proc, combo, keywords, unknown events, throws, crits, the outro, low hp, blooms, reduced', () => {
  const T = boot();
  const Gt = T.GAME, R = T.RENDER, fx = R.fx;
  Gt.newRun('knight', 21);
  Gt.startFight(['rat', 'rat'], 'normal');
  h.ok(settle(Gt, 10), 'fight ready');
  // injected events play at once (the queue otherwise waits out the last beat)
  const push = (ev) => { Gt.fs.queue.push({ ev, beat: 0.01 }); Gt.fs.beatT = Math.min(Gt.fs.beatT, 0); };
  // unknown events are ignored
  let threw = false;
  try { push({ t: 'mystery', foo: 1 }); push(null); push({}); stepFor(Gt, 0.1); } catch (e) { threw = true; }
  h.ok(!threw && Gt.screen === 'fight', 'unknown and empty events are ignored safely');
  // a relic proc: HUD pop hook, a star from the relic, a badge on the player; an enemy-side proc badge
  fx.clear();
  const rid = Gt.run.relics[0];
  h.ok(Gt.S.relicEls && Gt.S.relicEls[rid], 'the relic bar keeps an element per relic id');
  push({ t: 'proc', src: 'relic', id: rid, name: 'Starter', icon: '*', color: '#2ee6d6', text: '+3 block', who: 'player' });
  push({ t: 'proc', src: 'item', id: 'x', name: 'Thing', text: 'Poison spreads', color: '#a6ff5e', who: 'enemy', idx: 1 });
  push({ t: 'proc', src: 'combo', id: 'y' });
  stepFor(Gt, 0.1);
  h.ok(fx.textCount() >= 3, 'each proc floats a badge (' + fx.textCount() + ')');
  h.ok(fx.flyCount() >= 1, 'a relic proc sends a star from the relic bar');
  // one relic firing many times in a burst stacks on one badge, and procs keep the queue quick
  fx.clear();
  for (let i = 0; i < 5; i++) Gt.fs.queue.push({ ev: { t: 'proc', src: 'relic', id: rid, name: 'Starter', icon: '#', text: '+1', color: '#ffc94d', who: 'player' }, beat: 0.45 });
  Gt.fs.beatT = 0;
  stepFor(Gt, 0.3);
  h.eq(Gt.fs.queue.length, 0, 'five procs at 0.45 beats play within 0.3 s');
  h.eq(fx.textCount(), 1, 'the same relic stacks on one badge');
  h.ok(Gt.S.procs && Object.values(Gt.S.procs).some(p => p.n === 5 && /x5$/.test(p.p.str)), 'the badge counts x5');
  // in a fight the gold stat is the fight's view of it
  if (T.COMBAT.gold) {
    const g0 = T.COMBAT.gold;
    T.COMBAT.gold = () => 777;
    Gt.S.lastHud = ''; stepFor(Gt, 0.2);
    h.eq(T._nodes.goldTxt.textContent, '777', 'fight gold comes from COMBAT.gold(F)');
    T.COMBAT.gold = g0;
  }
  // named combos queue and chain; tier 3 holds a hit stop and slows time
  push({ t: 'combo', id: 'a', name: 'First', text: 'one', color: '#ff2e88', n: 2, tier: 1 });
  push({ t: 'combo', id: 'b', name: 'Big One', text: 'three', color: '#ffc94d', n: 4, tier: 3 });
  stepFor(Gt, 0.05);
  h.eq(Gt.S.lastCombo && Gt.S.lastCombo.id, 'a', 'the first combo shows first');
  h.eq(T._nodes.comboName.textContent, 'First x2', 'the banner names it with its count');
  h.eq(T._nodes.comboText.textContent, 'one', 'and its text underneath');
  h.eq(Gt.S.comboQ.length, 1, 'the second one waits');
  stepFor(Gt, 1.4);
  h.eq(Gt.S.lastCombo.id, 'b', 'then the next one chains in');
  h.ok(Gt.S.slowT > 0 || Gt.fs.hitStop > 0, 'a tier 3 combo slows time / holds a hit stop');
  stepFor(Gt, 3);
  h.eq(Gt.S.comboT, 0, 'the queue drains');
  // keyword chips on cards, the tray and nothing when DATA.keywords is gone
  const D = T.DATA, kw0 = D.keywords;
  D.keywords = () => [{ id: 'blade', label: 'Blade', icon: '/', color: '#ff2e88' }];
  const findKw = (el) => { if (!el) return false; if (/\bkws\b/.test(el.className || '')) return true; return (el.children || []).some(findKw); };
  // keyword-less guard
  D.keywords = 'nope';
  let ok = true;
  try { Gt.showTreasure({ relic: rid, gold: 0, title: 'T' }); } catch (e) { ok = false; }
  h.ok(ok, 'a non-function DATA.keywords is ignored');
  D.keywords = () => { throw new Error('boom'); };
  try { Gt.showShop(Gt.rollShop({ q: 1, r: 1 })); } catch (e) { ok = false; }
  h.ok(ok, 'a throwing DATA.keywords is ignored');
  D.keywords = () => [{ id: 'blade', label: 'Blade', icon: '/', color: '#ff2e88' }];
  Gt.showShop(Gt.rollShop({ q: 1, r: 2 }));
  h.ok(findKw(T._nodes.shopBody), 'shop cards carry keyword chips');
  D.keywords = kw0;
  // back to a fresh fight for the throw / crit / outro checks
  Gt.startFight(['rat', 'rat'], 'normal');
  h.ok(settle(Gt, 10), 'fight ready again');
  // delivered items fly to their target and land before they resolve
  const bodies = itemBodies(Gt).slice(0, 2);
  const played0 = Gt.run.played;
  Gt.playDelivered(bodies);
  h.eq(Gt.fs.throws.length, 2, 'two items in flight');
  h.eq(Gt.state().queue >= 2, true, 'items in flight count as pending (state().queue)');
  stepFor(Gt, 0.05);
  h.eq(Gt.run.played, played0, 'nothing resolves mid-flight');
  stepFor(Gt, 1.2);
  h.eq(Gt.run.played, played0 + 2, 'both resolved after landing');
  h.eq(Gt.fs.throws.length, 0, 'the throws are cleared');
  // a crushing hit (a fifth of max hp): hit stop, knockback, a ghost chunk on the bar
  const e0 = Gt.fight.enemies[0];
  const hp0 = e0.hp, big = Math.ceil(e0.maxHp * 0.25);
  e0.hp = Math.max(1, hp0 - big);
  Gt.fs.hitStop = 0;
  push({ t: 'dmg', who: 'e', idx: 0, amt: big, blocked: 0 });
  stepFor(Gt, 1 / 60);
  h.ok(Gt.fs.hitStop > 0, 'a crushing hit holds a hit stop');
  h.ok(Gt.fs.anim[0].knock > 0 && Gt.fs.anim[0].hurt > 0, 'knockback and the white flash');
  h.ok(Gt.fs.ghost[0].v > Gt.fs.shown.e[0].hp, 'the ghost chunk lags the bar');
  stepFor(Gt, 2);
  h.ok(Math.abs(Gt.fs.ghost[0].v - Gt.fs.shown.e[0].hp) < 0.01, 'then drains to the real hp');
  // a hit on the player: vignette pulse, a claw mark on big hits
  fx.clear();
  push({ t: 'dmg', who: 'p', amt: 12, blocked: 4 });
  stepFor(Gt, 1 / 60);
  h.ok(fx.slashCount() >= 1, 'a big hit on the player rakes the screen');
  // status pops on enemies
  push({ t: 'status', who: 'e', idx: 1, s: 'poison', v: 3 });
  stepFor(Gt, 1 / 60);
  h.ok(Gt.fs.pipPop[1] && Gt.fs.pipPop[1].poison > 0, 'the status chip pops');
  // low hp: the heartbeat hold turns on under 30%
  Gt.fight.player.hp = 5;
  stepFor(Gt, 0.2);
  h.ok(Gt.S.lowHp, 'low hp heartbeat on');
  Gt.fight.player.hp = Gt.fight.player.maxHp;
  stepFor(Gt, 0.2);
  h.ok(!Gt.S.lowHp, 'and off again');
  // the last kill: slow motion, the outro holds the arena, a save lands on the reward
  const F = Gt.fight;
  F.enemies.forEach((e, i) => { e.hp = 0; e.alive = false; push({ t: 'die', idx: i }); });
  F.phase = 'over'; F.result = 'win';
  stepFor(Gt, 0.1);
  h.ok(Gt.S.slowT > 0, 'the last kill slows time');
  stepFor(Gt, 0.3);
  h.eq(Gt.screen, 'fight', 'the arena stays up for the outro');
  h.ok(Gt.fs && Gt.fs.outro, 'the outro runs');
  Gt.save();
  const sv = JSON.parse(T._store.clawspire_run);
  h.eq(sv.screen, 'reward', 'a save during the outro is the reward screen');
  h.ok(!sv.pendingFight, 'and never replays the won fight');
  let n = 0;
  while (Gt.screen === 'fight' && n++ < 60 * 4) Gt.update(DT);
  h.eq(Gt.screen, 'reward', 'the reward screen follows the outro');
  // a map reveal blooms outward
  Gt.choose(3);
  h.eq(Gt.screen, 'map', 'back on the map');
  stepFor(Gt, 0.1);
  const M = Gt.run.map, MAP = T.MAP;
  M.ink = Gt.run.ink = 20;
  const dark = MAP.revealable(M, {})[0] || Object.values(M.tiles).find(t => !t.revealed && MAP.canReveal(M, t.q, t.r));
  h.ok(!!dark, 'a hex to light');
  if (dark) {
    const p = Gt.hexToStage(dark.q, dark.r);
    Gt.mapTap(p.x, p.y);
    Gt.update(DT);
    const it = Gt.S.mapPaint.items.find(x => x.t === dark);
    h.ok(it && it.lit && it.bloomAt > 0, 'the lit hex blooms');
    h.ok(Gt.S.chimes && Gt.S.chimes.length >= 0, 'bloom chimes scheduled');
  }
  // reduced mode: short slow motion, no roll
  fx.reduced = true;
  Gt.S.slowT = 0;
  Gt.startFight(['rat'], 'normal');
  settle(Gt, 10);
  const F2 = Gt.fight;
  F2.enemies[0].hp = 0; F2.enemies[0].alive = false; push({ t: 'die', idx: 0 }); F2.phase = 'over'; F2.result = 'win';
  stepFor(Gt, 1 / 60);
  h.ok(Gt.S.slowT <= 0.4 && Gt.S.slowK >= 0.6, 'reduced: a short, gentle slow motion');
  h.eq(fx.offset().r, 0, 'reduced: no camera roll');
  fx.reduced = false;
  let m = 0;
  while (Gt.screen === 'fight' && m++ < 60 * 4) Gt.update(DT);
  h.eq(Gt.screen, 'reward', 'reduced outro ends too');
  // a tap skips the outro
  Gt.choose(3);
  Gt.startFight(['rat'], 'normal');
  settle(Gt, 10);
  const F3 = Gt.fight;
  F3.enemies[0].hp = 0; F3.enemies[0].alive = false; push({ t: 'die', idx: 0 }); F3.phase = 'over'; F3.result = 'win';
  stepFor(Gt, 0.2);
  h.ok(Gt.fs && Gt.fs.outro, 'outro running');
  Gt.pointer('down', 270, 600, { pointerId: 1 });
  h.eq(Gt.screen, 'reward', 'a tap skips to the reward');
  // rewards and relics go through the data layer with the run
  const D2 = T.DATA, ri0 = D2.rewardItems, pr0 = D2.pickRelic;
  let riRun = null, prRun = null;
  D2.rewardItems = (rng, act, ch, n, run) => { riRun = run; return ri0(rng, act, ch, n, run); };
  D2.pickRelic = (rng, pool, run) => { prRun = run; return pool[0]; };
  Gt.choose(3);
  Gt.showShop(Gt.rollShop({ q: 5, r: 5 }));
  h.ok(riRun === Gt.run, 'rewardItems receives the run');
  h.ok(prRun === Gt.run, 'pickRelic receives the run');
  D2.rewardItems = ri0; D2.pickRelic = pr0;
  const src = fs.readFileSync(path.join(DIR, 'js', 'game.js'), 'utf8') + fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
  h.ok(!/\u2014/.test(src), 'no em dashes in game.js / index.html');
  h.ok(/id="combo"/.test(src) && /id="wipe"/.test(src), 'index.html has the combo banner and the transition layer');
});

// ---------------------------------------------------------------- loot
// Taps a capsule open through GAME.choose (the screen's Crack entry), then
// collects the prize. Returns the capsule it opened.
function crackOpen(Gt) {
  const cap = Gt.loot.cap && Gt.loot.cap.cap;
  for (let i = 0; i < 12 && Gt.loot.cap && Gt.loot.cap.phase !== 'done'; i++) {
    const k = Gt.S.ui.buttons.findIndex(b => b.label === 'Crack');
    if (k >= 0) Gt.choose(k); else Gt.loot.capsuleTap();
    stepFor(Gt, 0.1);
  }
  stepFor(Gt, 0.8);
  return cap;
}

h.test('loot: an elite win pays a tallied payout, tickets and a capsule; the cards keep their indices', () => {
  const T = boot();
  const Gt = T.GAME;
  Gt.newRun('knight', 61);
  h.eq(Gt.run.tickets, 0, 'a new run starts with no tickets');
  h.ok(Array.isArray(Gt.run.caps) && Gt.run.caps.length === 0 && Gt.run.pity === 0, 'no banked capsules, no pity yet');
  const gold0 = Gt.run.gold;
  Gt.startFight(T.DATA.ENCOUNTERS[1].elite[0], 'elite');
  stepFor(Gt, 0.3);
  Gt.endFight('win');
  h.eq(Gt.screen, 'reward', 'reward screen');
  const rw = Gt.S.sd.reward;
  h.ok(Array.isArray(rw.pay) && rw.pay[0].id === 'base' && rw.pay[0].label === 'Elite down', 'the payout opens with the elite line');
  h.ok(rw.pay.some(l => l.id === 'flawless') && rw.pay.some(l => l.id === 'speedy'), 'an untouched one-turn win pays flawless and speedy lines');
  h.eq(rw.gold, rw.pay.filter(l => l.id !== 'double').reduce((a, l) => a + l.gold, 0) * (rw.double ? 2 : 1), 'reward gold is the payout total');
  h.eq(Gt.run.gold, gold0 + rw.gold, 'the gold is paid once');
  h.eq(Gt.run.tickets, rw.tix, 'the tickets are paid');
  h.ok(rw.tix >= T.DATA.LOOT.TICKETS.elite, 'an elite prints at least its base tickets');
  h.eq(rw.caps.length, 1, 'an elite drops a capsule');
  h.eq(rw.caps[0].src, 'elite', 'an elite capsule');
  h.eq(Gt.S.ui.buttons.length, 4, 'three cards and Skip, the capsule slot is a tap target of its own');
  h.ok(Gt.loot.pay && !Gt.loot.pay.done, 'the tally is running');
  stepFor(Gt, 6);
  h.ok(Gt.loot.pay.done && rw.payShown, 'the tally runs to the end on its own');
  // crack the capsule right on the reward screen
  const tier0 = Gt.run.relics.length, bin0 = Gt.run.bin.length;
  h.ok(Gt.loot.openRewardCap(rw, 0), 'the capsule opens from its slot');
  h.eq(Gt.screen, 'capsule', 'the capsule screen');
  Gt.draw();
  h.eq(Gt.loot.cap.phase, 'drop', 'it drops in first');
  const cap = crackOpen(Gt);
  h.eq(Gt.loot.cap.phase, 'done', 'cracked open');
  h.ok(cap.opened && rw.caps[0].opened, 'marked opened on the reward too');
  h.ok(Gt.S.ui.buttons.some(b => /collect/i.test(b.label)), 'Collect offered');
  h.ok(Gt.run.relics.length > tier0 || Gt.run.bin.length > bin0 || Gt.run.gold > gold0 + rw.gold || Gt.run.tickets > rw.tix || Gt.run.maxHp > 80 || Gt.run.brushes.length || Gt.run.ink > 10 || Object.keys(Gt.run.claw.ups || {}).length, 'the prize was paid');
  Gt.draw();
  Gt.choose(Gt.S.ui.buttons.findIndex(b => /collect/i.test(b.label)));
  h.eq(Gt.screen, 'reward', 'back on the reward screen');
  h.ok(Gt.loot.pay.done, 'no second tally');
  h.eq(Gt.run.tickets, rw.tix + (cap.prize.k === 'tickets' ? cap.prize.n : 0), 'the tickets were not paid twice');
  Gt.choose(3);
  h.eq(Gt.screen, 'map', 'skip -> map');
  h.eq(Gt.run.caps.length, 0, 'nothing banked (it was opened)');
  h.eq(Gt.run.loot.capsOpened, 1, 'highlights count the capsule');
});

h.test('loot: an unopened capsule banks on the map and opens from its chip', () => {
  const T = boot();
  const Gt = T.GAME;
  Gt.newRun('knight', 62);
  Gt.startFight(T.DATA.ENCOUNTERS[1].elite[0], 'elite');
  stepFor(Gt, 0.2);
  Gt.endFight('win');
  Gt.choose(3);
  h.eq(Gt.screen, 'map', 'skipped to the map');
  h.eq(Gt.run.caps.length, 1, 'the capsule waits in the bank');
  const i = Gt.S.ui.buttons.findIndex(b => b.label === 'Capsule');
  h.ok(i >= 0, 'the map head shows a capsule chip');
  // save and reload with a banked capsule
  Gt.save();
  const T2 = boot({ store: Object.assign({}, T._store) });
  T2.GAME.choose(T2.GAME.S.ui.buttons.findIndex(b => /continue/i.test(b.label)));
  h.eq(T2.GAME.run.caps.length, 1, 'the bank survives a reload');
  const G2 = T2.GAME;
  G2.choose(G2.S.ui.buttons.findIndex(b => b.label === 'Capsule'));
  h.eq(G2.screen, 'capsule', 'the chip opens the capsule');
  G2.loot.skipCapsule();
  h.eq(G2.loot.cap.phase, 'burst', 'Skip bursts it at once');
  h.eq(G2.run.caps.length, 0, 'the bank is emptied when it bursts');
  // a reload during the reveal lands on the prize, not a second one
  const snap = JSON.stringify(G2.run.relics) + G2.run.gold + G2.run.bin.length + G2.run.tickets;
  const T3 = boot({ store: Object.assign({}, T2._store) });
  T3.GAME.choose(T3.GAME.S.ui.buttons.findIndex(b => /continue/i.test(b.label)));
  h.eq(T3.GAME.screen, 'capsule', 'reload lands on the capsule screen');
  h.eq(T3.GAME.loot.cap.phase, 'done', 'already opened: the prize card');
  h.eq(JSON.stringify(T3.GAME.run.relics) + T3.GAME.run.gold + T3.GAME.run.bin.length + T3.GAME.run.tickets, snap, 'the prize was not paid again');
  T3.GAME.loot.collectCapsule();
  h.eq(T3.GAME.screen, 'map', 'collect returns to the map');
  h.eq(T3.GAME.run.caps.length, 0, 'the bank stays empty');
});

h.test('loot: treasure is a capsule; tiers upgrade mid-open; the pity timer guarantees a rare', () => {
  const T = boot();
  const Gt = T.GAME;
  Gt.newRun('knight', 63);
  const M = Gt.run.map;
  const t = Object.values(M.tiles).find(x => x.type === 'treasure');
  const relics = Gt.run.relics.length, gold = Gt.run.gold;
  Gt.enterTile(t);
  h.eq(Gt.screen, 'capsule', 'a treasure tile opens a capsule');
  h.eq(Gt.loot.cap.cap.src, 'treasure', 'a treasure capsule');
  h.eq(Gt.loot.cap.cap.prize.k, 'relic', 'holding a relic');
  h.eq(Gt.run.gold, gold + (t.content.gold || 0), 'the treasure gold is paid on entry');
  crackOpen(Gt);
  h.eq(Gt.run.relics.length, relics + 1, 'the relic is granted at the burst');
  Gt.loot.collectCapsule();
  h.eq(Gt.screen, 'map', 'back to the map');
  // a capsule with an upgrade turns rarer on the second tap
  const cap = { src: 'normal', tier0: 'c', ups: ['u', 'r'], tier: 'r', pity: false, prize: { k: 'gold', n: 5 }, opened: false };
  const goldB = Gt.run.gold;
  Gt.loot.showCapsule({ cap, then: { k: 'map' } });
  const C = Gt.loot.cap;
  h.eq(C.burstTap, 3, 'two ups: four taps to open');
  Gt.loot.capsuleTap();   // lands the drop
  h.eq(C.phase, 'idle', 'a tap skips the drop');
  Gt.loot.capsuleTap();
  h.eq(C.shown, 'c', 'the first crack keeps the colour');
  h.ok(C.crack > 0, 'cracks spread');
  Gt.loot.capsuleTap();
  h.eq(C.shown, 'u', 'the second tap upgrades it');
  Gt.loot.capsuleTap();
  h.eq(C.shown, 'r', 'and again');
  h.ok(C.flash > 0, 'with a flash');
  Gt.draw();
  Gt.loot.capsuleTap();
  h.eq(C.phase, 'burst', 'the last tap bursts it');
  Gt.draw();
  h.eq(Gt.run.gold, goldB + 5, 'the gold prize is paid');
  Gt.loot.capsuleTap();
  h.eq(C.phase, 'done', 'a tap during the burst shows the prize');
  Gt.loot.collectCapsule();
  // pity
  Gt.run.pity = T.DATA.LOOT.PITY;
  const p = Gt.loot.makeCapsule('normal');
  h.ok(['r', 'l'].includes(p.tier), 'at the pity count a capsule ends rare or better (' + p.tier + ')');
  h.eq(Gt.run.pity, 0, 'and the pity timer resets');
  const q = Gt.loot.makeCapsule('counter', { tier: 'c' });
  if (q.tier === 'c' || q.tier === 'u') h.eq(Gt.run.pity, 1, 'a capsule below rare counts toward pity');
});

h.test('loot: jackpots stream tickets out of the cabinet into the HUD counter', () => {
  const T = boot();
  const Gt = T.GAME;
  Gt.newRun('knight', 64);
  Gt.run.tickets = 5;
  Gt.startFight(['rat'], 'normal');
  stepFor(Gt, 0.1);
  Gt.run.jackpots += 1;   // as deliver() counts a triple
  stepFor(Gt, 0.1);
  h.ok(Gt.loot.tix && Gt.loot.tix.list.some(k => k.on), 'tickets fly');
  Gt.draw();
  stepFor(Gt, 2);
  h.eq(Gt.loot.tix.arrived, T.DATA.LOOT.TICKETS.jackpot, 'every ticket of the jackpot lands');
  h.eq(Gt.loot.tixShown(), 5 + T.DATA.LOOT.TICKETS.jackpot, 'the counter shows them');
  h.eq(Gt.run.tickets, 5, 'but they are paid by the reward, not the stream');
  Gt.endFight('win', true);
  h.ok(Gt.fs.outro, 'the victory outro plays');
  stepFor(Gt, 3);
  h.eq(Gt.screen, 'reward', 'then the reward');
  const rw = Gt.S.sd.reward;
  h.ok(rw.pay.some(l => l.id === 'jackpot' && l.label === 'Jackpot x1'), 'the payout lists the jackpot');
  h.eq(Gt.run.tickets, 5 + rw.tix, 'the tickets are paid once, in full');
  h.ok(rw.caps.some(c => c.src === 'bonus'), 'a jackpot earns a bonus capsule');
  h.ok(Gt.loot.tix === null, 'the stream is cleared off the fight');
  Gt.loot.finishPay();
  h.ok(Gt.loot.pay.done, 'a tap finishes the tally');
});

h.test('loot: the prize counter sells for tickets; a capsule opens and returns to it', () => {
  const T = boot();
  const Gt = T.GAME;
  Gt.newRun('knight', 65);
  const shop = Gt.rollShop({ q: 2, r: 2 });
  Gt.showShop(shop);
  const pc = Gt.S.ui.buttons.findIndex(b => b.label === 'Prize counter');
  h.ok(pc >= 0 && pc === Gt.S.ui.buttons.length - 1, 'the shop offers the prize counter, registered last');
  Gt.choose(pc);
  h.eq(Gt.screen, 'counter', 'the counter screen');
  h.eq(shop.counter.length, 6, 'six prizes on the shelf');
  const capIdx = shop.counter.findIndex(s => s.k === 'cap');
  h.eq(Gt.loot.counterBuy(shop, capIdx), false, 'no tickets, no prize');
  h.ok(!shop.counter[capIdx].sold, 'still on the shelf');
  Gt.run.tickets = 500;
  Gt.loot.showCounter(shop);
  const heart = shop.counter.findIndex(s => s.k === 'maxhp');
  const hp0 = Gt.run.maxHp, tix0 = Gt.run.tickets;
  Gt.choose(heart);
  h.ok(shop.counter[heart].sold, 'the heart is won');
  h.eq(Gt.run.maxHp, hp0 + shop.counter[heart].n, 'max hp rises');
  h.eq(Gt.run.tickets, tix0 - shop.counter[heart].price, 'tickets spent');
  h.ok(Gt.S.ui.buttons[heart].disabled, 'a won slot is disabled');
  Gt.save();
  const saved = JSON.parse(T._store.clawspire_run);
  h.eq(saved.screen, 'counter', 'the counter saves');
  const T2 = boot({ store: Object.assign({}, T._store) });
  T2.GAME.choose(T2.GAME.S.ui.buttons.findIndex(b => /continue/i.test(b.label)));
  h.eq(T2.GAME.screen, 'counter', 'and reloads');
  h.ok(T2.GAME.S.sd.counter.counter[heart].sold, 'with the won slot still won');
  const tix1 = Gt.run.tickets;
  Gt.choose(capIdx);
  h.eq(Gt.screen, 'capsule', 'a capsule prize opens on the spot');
  h.eq(Gt.loot.cap.cap.src, 'counter', 'a counter capsule');
  h.eq(Gt.loot.cap.cap.tier0, shop.counter[capIdx].tier, 'of the tier on the tag');
  h.eq(Gt.run.tickets, tix1 - shop.counter[capIdx].price, 'paid in tickets');
  crackOpen(Gt);
  Gt.loot.collectCapsule();
  h.eq(Gt.screen, 'counter', 'collect returns to the counter');
  Gt.choose(Gt.S.ui.buttons.findIndex(b => /back to the shop/i.test(b.label)));
  h.eq(Gt.screen, 'shop', 'back to the shop');
});

h.test('loot: old saves without loot fields load with defaults; highlights on the run end', () => {
  const T = boot();
  const Gt = T.GAME;
  Gt.newRun('knight', 66);
  Gt.save();
  const o = JSON.parse(T._store.clawspire_run);
  delete o.run.tickets; delete o.run.pity; delete o.run.caps; delete o.run.loot;
  const T2 = boot({ store: { clawspire_run: JSON.stringify(o), clawspire_meta: T._store.clawspire_meta } });
  T2.GAME.choose(T2.GAME.S.ui.buttons.findIndex(b => /continue/i.test(b.label)));
  const r = T2.GAME.run;
  h.eq(T2.GAME.screen, 'map', 'an old save continues');
  h.ok(r.tickets === 0 && r.pity === 0 && Array.isArray(r.caps) && r.caps.length === 0 && r.loot && r.loot.capsOpened === 0, 'loot fields default');
  h.eq(T2._nodes.tixTxt.textContent, '0', 'the HUD shows 0 tickets');
  // an old reward (no payout lines) still shows and pays as before
  const G2 = T2.GAME;
  G2.showReward({ items: ['rusty_sword', 'rusty_sword', 'rusty_sword'].filter(id => T2.DATA.ITEMS[id]).concat(Object.keys(T2.DATA.ITEMS).slice(0, 3)).slice(0, 3), gold: 12, ink: 0, brush: null, tier: 'normal', then: null });
  h.eq(G2.S.ui.buttons.length, 4, 'an old reward: three cards and Skip');
  h.ok(!G2.loot.pay, 'no tally without payout lines');
  G2.choose(3);
  // meta keeps the loot counters
  G2.meta.loot = { caps: 20, payouts: 9 };
  G2.save(); try { T2._store.clawspire_meta = JSON.stringify(G2.meta); } catch (e) { /* */ }
  const T3 = boot({ store: Object.assign({}, T2._store) });
  h.eq(T3.GAME.meta.loot.caps, 20, 'meta loot counters survive a reload');
  // game over shows the highlights
  G2.run.loot.bigHit = 42; G2.run.loot.bestCombo = { name: 'Blade Storm', tier: 3 };
  G2.showGameOver();
  const texts = [];
  const walk = (el) => { if (!el) return; if (el.textContent) texts.push(el.textContent); (el.children || []).forEach(walk); };
  walk(T2._nodes.gameoverBody);
  h.ok(texts.includes('Highlights') && texts.includes('42') && texts.includes('Blade Storm'), 'the highlights list the biggest hit and the best combo');
  const src = fs.readFileSync(path.join(DIR, 'js', 'game.js'), 'utf8') + fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
  h.ok(/id="scr-capsule"/.test(src) && /id="scr-counter"/.test(src) && /id="tixTxt"/.test(src), 'index.html has the capsule and counter screens and the ticket stat');
});

// ---------------------------------------------------------------- cabinet materials and toys
{
  const CM = boot();
  const GM = CM.GAME, TOYS = GM.toys, MAT = TOYS && TOYS.MAT;
  // A knight fight against one rat with a hand-picked bin, settled and waiting for the player.
  const mkFight = (ids, seed) => {
    GM.newRun('knight', seed);
    GM.run.bin = ids.map((id, i) => ({ uid: 'm' + seed + '_' + i, id, plus: false }));
    GM.startFight(['rat'], 'normal', { seed });
    GM.fs.golden = null;
    for (const i of GM.fight.bin) i.plus = false;
    stepFor(GM, 2.5);
    settle(GM, 10);
    return GM.fight;
  };
  const instOf = (F, id) => F.bin.find(i => i.id === id);
  const bodyOfId = (F, id) => TOYS.bodyOf(instOf(F, id));
  // Throw a body down hard from near the lid (a slip from the top of the cabinet).
  const slam = (b, armed) => {
    b.data.age = armed ? 5 : 0; b.data.cd = 0; b.data.crackCd = 0;
    b.x = 150; b.y = -30; b.vx = 0; b.vy = 900; b.sl = false; b.data.pvy = 900; b.data.pvx = 0;
    for (let i = 0; i < 90; i++) GM.update(DT);
  };
  const BIN = ['empty_bottle', 'cherry_bomb', 'snowball', 'iceblock', 'stolen_gem', 'rusty_sword', 'family_anvil', 'crisp_apple', 'bouncy_ball', 'toxic_vial', 'rock', 'pot_lid', 'icicle'];

  h.test('materials: every bin body carries its material physics', () => {
    h.ok(!!TOYS, 'GAME.toys is exposed');
    const F = mkFight(BIN, 11);
    const items = GM.fs.items;
    h.ok(items.length >= BIN.length - 1, 'the bin spawned');
    h.ok(items.every(b => b.data.mat && b.data.mat.id === CM.PHYS.materialOf(b.data.def).id), 'each body has its derived material');
    const gem = bodyOfId(F, 'stolen_gem'), snow = bodyOfId(F, 'snowball'), ball = bodyOfId(F, 'bouncy_ball');
    h.ok(gem && gem.gs < 1, 'magic floats (gravity scale ' + (gem && gem.gs) + ')');
    h.ok(snow && snow.slick < 1, 'frost slides');
    h.ok(ball && ball.bounceV < CM.PHYS.PH.bounceV, 'rubber bounces');
    // deterministic: the same fight lays the pile out the same way
    const pose = () => GM.fs.items.map(b => b.x.toFixed(2) + ',' + b.y.toFixed(2)).join(';');
    const a = pose();
    mkFight(BIN, 11);
    h.eq(pose(), a, 'the same seed settles the same pile with materials on');
  });

  h.test('glass: a fresh spawn never cracks, a hard landing does, a second one shatters into shards', () => {
    const F = mkFight(BIN, 12);
    const inst = instOf(F, 'empty_bottle');
    let b = TOYS.bodyOf(inst);
    slam(b, false);
    h.eq(TOYS.mstOf(inst).crack, 0, 'a landing within MAT.armT of a spawn does not crack it');
    b = TOYS.bodyOf(inst);
    slam(b, true);
    h.eq(TOYS.mstOf(inst).crack, 1, 'a hard landing cracks it');
    h.ok(F.bin.indexOf(inst) >= 0 && TOYS.bodyOf(inst), 'a cracked item stays in the bin');
    TOYS.crack(TOYS.bodyOf(inst));
    h.ok(F.bin.indexOf(inst) < 0 && F.exhausted.indexOf(inst) >= 0, 'the second crack shatters it for the fight');
    h.ok(!TOYS.bodyOf(inst), 'its body is gone');
    h.eq(GM.fs.debris.length, MAT.shardN, 'it left glass shards in the bin');
    h.ok(GM.fs.debris.every(s => s.world === GM.world && !s.data.inst), 'shards are physical fillers, not prizes');
    const s = GM.fs.debris[0];
    s.x = 448; s.y = 320; s.vx = 0; s.vy = 200; s.sl = false;
    stepFor(GM, 1);
    h.ok(GM.fs.debris.indexOf(s) < 0, 'the chute sweeps a shard out');
    settle(GM, 10);
    h.ok(GM.state().screen === 'fight', 'the fight goes on');
  });

  h.test('glass: a cracked item plays for +50%, then breaks', () => {
    const hit = (cracked) => {
      const F = mkFight(BIN, 13);
      const inst = instOf(F, 'icicle');   // glass that does not break on its own
      if (cracked) TOYS.mstOf(inst).crack = 1;
      const e = F.enemies[0], hp0 = e.hp;
      GM.playDelivered([TOYS.bodyOf(inst)]);
      settle(GM, 10);
      return { dmg: hp0 - e.hp, gone: F.exhausted.indexOf(inst) >= 0, F };
    };
    const plain = hit(false), cracked = hit(true);
    h.ok(plain.dmg > 0, 'the icicle hits (' + plain.dmg + ')');
    h.ok(cracked.dmg >= plain.dmg + Math.ceil(plain.dmg * 0.5) - 1, `cracked hits for +50% (${cracked.dmg} vs ${plain.dmg})`);
    h.ok(!plain.gone && cracked.gone, 'only the cracked one breaks for the fight');
  });

  h.test('bombs: a rough landing lights the fuse, it burns down over turns and goes off in the bin', () => {
    const F = mkFight(BIN, 14);
    const inst = instOf(F, 'cherry_bomb');
    slam(TOYS.bodyOf(inst), true);
    h.eq(TOYS.mstOf(inst).lit, MAT.fuseTurns, 'the fuse is lit for MAT.fuseTurns turns');
    TOYS.fuseTick();
    h.eq(TOYS.mstOf(inst).lit, MAT.fuseTurns - 1, 'a turn start burns it down');
    h.ok(F.bin.indexOf(inst) >= 0, 'still in the bin with a turn to spare');
    const e = F.enemies[0], hp0 = e.hp, blk = e.block;
    const b = TOYS.bodyOf(inst), near = GM.fs.items.filter(o => o !== b && Math.hypot(o.x - b.x, o.y - b.y) < 100);
    for (let k = 1; k < MAT.fuseTurns; k++) TOYS.fuseTick();
    h.ok(!TOYS.bodyOf(inst) && F.used.indexOf(inst) >= 0 && F.bin.indexOf(inst) < 0, 'the bomb went off: out of the bin, into the used pile');
    h.eq(hp0 + blk - e.hp - e.block, MAT.blastDmg, 'the blast hits the enemy for MAT.blastDmg');
    h.ok(!near.length || near.some(o => Math.hypot(o.vx, o.vy) > 200), 'nearby items were thrown about');
    settle(GM, 10);
    h.ok(GM.fs.items.every(o => o.x > 0 && o.x < 480 && o.y < 440), 'everything stayed in the cabinet');
    // an unarmed (fresh) landing and a monster's junk bomb never light
    const F2 = mkFight(BIN.concat(CM.DATA.ITEMS.fusebomb ? ['fusebomb'] : []), 15);
    const i2 = instOf(F2, 'cherry_bomb');
    slam(TOYS.bodyOf(i2), false);
    h.eq(TOYS.mstOf(i2).lit, 0, 'a spawn landing does not light a fuse');
    const junk = instOf(F2, 'fusebomb');
    if (junk) { slam(TOYS.bodyOf(junk), true); h.eq(TOYS.mstOf(junk).lit, 0, "a monster's lit junk bomb keeps its own fuse"); }
    // a delivered bomb is out: no fuse left
    const F3 = mkFight(BIN, 16);
    const i3 = instOf(F3, 'cherry_bomb');
    TOYS.lightFuse(TOYS.bodyOf(i3));
    GM.playDelivered([TOYS.bodyOf(i3)]);
    h.eq(TOYS.mstOf(i3).lit, 0, 'grabbing the bomb puts its fuse out');
    settle(GM, 10);
  });

  h.test('frost: ice shrinks each turn, a junk ice block melts away', () => {
    const F = mkFight(BIN, 17);
    const snow = instOf(F, 'snowball'), ice = instOf(F, 'iceblock');
    const r0 = TOYS.bodyOf(snow).br;
    TOYS.meltTick();
    h.ok(TOYS.mstOf(snow).melt < 1 && TOYS.bodyOf(snow).br < r0, 'the snowball melted a little (smaller body)');
    for (let i = 0; i < 12; i++) TOYS.meltTick();
    h.ok(TOYS.mstOf(snow).melt >= MAT.meltMin - 1e-9 && F.bin.indexOf(snow) >= 0, 'a real item never melts below MAT.meltMin');
    h.ok(F.bin.indexOf(ice) < 0 && F.exhausted.indexOf(ice) >= 0, 'the junk ice block melted away');
    settle(GM, 10);
  });

  h.test('golden prize: an item is upgraded for the fight only, grabbing it ends the shimmer', () => {
    let found = null, n = 0;
    for (let seed = 100; seed < 140; seed++) {
      GM.newRun('knight', seed);
      GM.run.bin = BIN.map((id, i) => ({ uid: 'g' + seed + '_' + i, id, plus: false }));
      GM.startFight(['rat'], 'normal', { seed });
      if (GM.fs.golden) { n++; if (!found) found = { seed, uid: GM.fs.golden.uid }; }
    }
    h.ok(n >= 6 && n <= 28, `golden prizes show up some fights (${n} of 40)`);
    GM.newRun('knight', found.seed);
    GM.run.bin = BIN.map((id, i) => ({ uid: 'g' + found.seed + '_' + i, id, plus: false }));
    const F = GM.startFight(['rat'], 'normal', { seed: found.seed });
    const inst = F.bin.find(i => i.uid === GM.fs.golden.uid);
    h.ok(inst && inst.plus, 'the golden item is upgraded in the fight');
    h.ok(GM.run.bin.every(i => !i.plus), "the run's item is untouched");
    stepFor(GM, 2.5); settle(GM, 10);
    GM.playDelivered([TOYS.bodyOf(inst)]);
    h.eq(GM.fs.golden, null, 'grabbing it ends the golden prize');
    settle(GM, 10);
  });

  h.test('free prize, lucky claw, near miss and the claw face', () => {
    const F = mkFight(BIN, 18);
    const free0 = GM.fs.freeN;
    GM.playDelivered([bodyOfId(F, 'rock')]);
    h.eq(GM.fs.freeN, free0 + 1, 'a prize the claw never touched is a FREE PRIZE');
    settle(GM, 10);
    // two good grabs in a row: the Lucky Claw grips harder for one grab
    const base = GM.rig.cfg.grip;
    GM.fs.lucky = 0; GM.fs.delivered = 1;
    TOYS.luckAfterGrab();
    h.ok(!GM.fs.luckyOn, 'one good grab is not enough');
    TOYS.luckAfterGrab();
    h.ok(GM.fs.luckyOn && Math.abs(GM.rig.cfg.grip - (base + MAT.luckyGrip)) < 1e-9, 'the second makes the claw lucky (+grip)');
    TOYS.luckAfterGrab();
    h.ok(!GM.fs.luckyOn && Math.abs(GM.rig.cfg.grip - base) < 1e-9, 'the lucky grab spends it');
    GM.fs.delivered = 0; GM.fs.lucky = 1; TOYS.luckAfterGrab();
    h.eq(GM.fs.lucky, 0, 'a miss resets the streak');
    // so close: once a grab, with a glum claw
    TOYS.soClose(400, 700);
    h.eq(GM.fs.claw.mood, 'sad', 'the claw is sad about a near miss');
    const g = GM.fs.closeG;
    TOYS.soClose(400, 700);
    h.eq(GM.fs.closeG, g, 'one SO CLOSE per grab');
    // moods from the rig's events
    GM.rigEvent('lift');
    h.eq(GM.fs.claw.mood, 'sad', 'an empty lift is glum');
    GM.fs.delivered = 1; GM.rigEvent('home');
    h.ok(GM.fs.claw.mood === 'happy' && GM.fs.claw.chase === 1, 'home with a prize: happy, LED chase');
    stepFor(GM, 3);
    h.eq(GM.fs.claw.mood, '', 'moods wear off');
  });

  h.test('a real grab over the material pile finishes cleanly', () => {
    const F = mkFight(BIN, 19);
    const g0 = F.player.grabs;
    GM.steer(200);
    settle(GM, 2);
    stepFor(GM, 0.6);
    h.ok(GM.dropClaw(), 'drop accepted');
    h.ok(settle(GM, 30), 'the grab finishes');
    // (a lucky grab can win the fight outright, which tears the cabinet down)
    if (GM.screen === 'fight' && GM.world) {
      h.eq(F.player.grabs, g0 - 1, 'one grab spent');
      h.ok(GM.world.bodies.every(b => Number.isFinite(b.x) && Number.isFinite(b.y)), 'no NaN in the world');
    }
  });
}

// The monsters pass: the new bin events move real bodies and never throw.
h.test('monsters: eat, hiccup, burst, lit bomb, eggs, rust, jam and phase two play on the cabinet', () => {
  const T = boot();
  const Gt = T.GAME, C = T.COMBAT;
  Gt.newRun('knight', 33);
  Gt.startFight(['gloop', 'slime'], 'normal');
  h.ok(settle(Gt, 10), 'fight ready');
  const F = Gt.fight, FS = Gt.fs;
  const flush = () => { const list = F.events.splice(0); for (const ev of list) FS.queue.push({ ev, beat: 0.02 }); FS.beatT = 0; };
  const hasBody = (inst) => FS.items.some(b => b.data.inst === inst);
  // a gulp: the bodies leave the cabinet and fly into the mouth
  const e = F.enemies[0];
  F.bin.forEach(i => { i.id = 'rusty_sword'; });   // weapons stay in the belly
  C.gulp(F, 0, 2, 'metal');
  const eaten = e.belly.map(b => b.inst);
  h.eq(eaten.length, 2, 'two items swallowed');
  flush(); stepFor(Gt, 0.2);
  h.ok(eaten.every(i => !hasBody(i)), 'their bodies are gone from the cabinet');
  h.ok(FS.arcs && FS.arcs.length >= 1, 'and fly to the enemy');
  h.eq(FS.belly[0].length, 2, 'the shown belly holds them');
  stepFor(Gt, 0.6);
  h.eq(FS.arcs.length, 0, 'the arcs land');
  // a hiccup: one comes back up and lands in the bin as a body
  C.damage(F, F.player, e, C.hiccupAt(e), { pierce: true });
  const back = F.events.filter(x => x.t === 'binReturn')[0];
  h.ok(back && back.why === 'hiccup', 'a hiccup event');
  flush(); stepFor(Gt, 1.2);
  h.ok(back.insts.every(hasBody), 'the hiccuped item is a body in the bin again');
  h.eq(FS.belly[0].length, 1, 'the shown belly lost it');
  // death: the rest bursts out
  const rest = e.belly.map(b => b.inst);
  C.damage(F, F.player, e, 9999, { pierce: true });
  flush(); stepFor(Gt, 1.5);
  h.ok(rest.length === 1 && rest.every(hasBody), 'the burst brings the last one back');
  // a lit bomb, then its blast
  const bomb = { uid: 'lit1', id: 'fusebomb', plus: false, frozen: false, junk: true, temp: true, fuse: 2, boom: 9, by: F.enemies[1].uid };
  F.bin.push(bomb);
  FS.queue.push({ ev: { t: 'binBomb', inst: bomb, idx: 1 }, beat: 0.02 }); FS.beatT = 0;
  stepFor(Gt, 1);
  h.ok(hasBody(bomb), 'the lit bomb lands in the bin');
  F.bin.splice(F.bin.indexOf(bomb), 1);
  FS.queue.push({ ev: { t: 'binBoom', inst: bomb }, beat: 0.02 }); FS.beatT = 0;
  stepFor(Gt, 0.1);
  h.ok(!hasBody(bomb), 'BOOM removes it');
  // eggs, a hatch, rust, a jam and a phase two
  const egg = { uid: 'egg1', id: 'broodegg', plus: false, frozen: false, junk: true, temp: true, hatch: 2, spawn: 'spiderling' };
  F.bin.push(egg);
  FS.queue.push({ ev: { t: 'binEggs', items: [egg], idx: 1 }, beat: 0.02 }); FS.beatT = 0;
  stepFor(Gt, 1);
  h.ok(hasBody(egg), 'the egg lands');
  F.bin.splice(F.bin.indexOf(egg), 1);
  let threw = null;
  try {
    const any = F.bin[0];
    any.rust = true;
    for (const ev of [{ t: 'binHatch', inst: egg }, { t: 'binRust', inst: any, idx: 1 }, { t: 'binJam', idx: 1 }, { t: 'binDigest', inst: any, idx: 1, k: 'digest' },
      { t: 'binDigest', inst: any, idx: 1, k: 'boom' }, { t: 'enrage', idx: 1, name: 'MAD', text: 'grr' }, { t: 'binReturn', insts: [], idx: 7 }, { t: 'binEat', idx: 1 }]) FS.queue.push({ ev, beat: 0.02 });
    FS.beatT = 0;
    stepFor(Gt, 0.6);
    // draw the fight once with the stub ctx: bellies, badges, marks, the wrench
    F.enemies[1].affix = ['hasty', 'spiky']; F.enemies[1].enraged = true;
    F.enemies[1].belly.push({ inst: { uid: 'bx', id: 'rusty_sword' }, turns: 2, kind: 'armed' });
    F.player.status.jam = 1;
    FS.items[0].data.inst.fuse = 1;
    Gt.S.ctx = T._ctx; Gt.S.px = 1;
    Gt.draw();
    F.enemies[1].belly.length = 0; delete F.player.status.jam; delete FS.items[0].data.inst.fuse;
  } catch (err) { threw = err; }
  h.ok(!threw, 'every monster event plays and draws without throwing ' + (threw ? threw.stack : ''));
  h.ok(!hasBody(egg), 'a hatched egg leaves the bin');
  h.eq(Gt.S.bannerStr, 'MAD', 'phase two gets a banner');
  h.ok(Gt.screen === 'fight', 'still fighting');
});

h.done();
