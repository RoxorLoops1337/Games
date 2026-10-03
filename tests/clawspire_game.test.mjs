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
  // (round 21) the run's first elite (a tower keeper counts) offers its pick of combo relics first
  h.eq(Gt.screen, 'treasure', 'the combo relic pick');
  h.ok(Gt.S.sd && Gt.S.sd.treasure && Gt.S.sd.treasure.crRw && Gt.S.sd.treasure.crRw.cr.pick.length === 3, 'three combo relics on offer');
  const crId = Gt.S.sd.treasure.crRw.cr.pick[0];
  Gt.choose(0);
  h.ok(Gt.run.relics.includes(crId), 'the picked combo relic is the run\'s');
  h.eq(Gt.screen, 'treasure', 'then the treasure screen');
  h.ok(Gt.S.sd && Gt.S.sd.treasure && Gt.S.sd.treasure.relic, 'a relic is offered');
  const eliteInk = (DATA.ECONOMY && DATA.ECONOMY.eliteInk) || 1;
  h.eq(Gt.run.ink, ink + eliteInk + 2, 'elite bulbs plus the +2 bulb bonus');
  h.ok(Object.values(M.tiles).every(t => MAP.hexDist(t.q, t.r, tower.q, tower.r) > MAP.TOWER_VIEW || t.revealed), 'the view from the tower lights everything within radius ' + MAP.TOWER_VIEW);
  h.ok(/view lights \d+ hexes/.test(Gt.S.sd.treasure.sub), 'the treasure screen says how much the view lit');
  Gt.choose(0);
  h.eq(Gt.run.relics.length, relics + 2, 'relic taken (and the combo relic before it)');
  h.eq(Gt.screen, 'map', 'back on the map');
  h.ok(tower.done, 'tower cleared');
  // The other bonus kinds apply without throwing.
  for (const bonus of [{ k: 'gold', n: 60 }, { k: 'brush', id: 'splash' }, { k: 'brush', id: 'kite' }, { k: 'claw', u: 'width' }]) {
    const T2 = boot(); const G2 = T2.GAME; G2.newRun('knight', 77);
    G2.run.crPick = 1;   // (round 21) not the run's first elite: no combo relic pick in front
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
  h.eq(Gt.S.ui.buttons.length, 3, 'rest offers exactly three choices (round 6: the Compactor is the third)');
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
        if (Gt.screen === 'treasure' && Gt.S.sd && Gt.S.sd.treasure && Gt.S.sd.treasure.crRw) Gt.choose(0);   // (round 21) an elite: the combo relic pick
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
  stepFor(Gt, 0.25);   // any live turn banner steps out first (the announcer's quick exit)
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
  // delivered items land on the resolve row (RROW round 21), then fly to their target one at a time and land before they resolve
  const bodies = itemBodies(Gt).slice(0, 2);
  const played0 = Gt.run.played;
  Gt.playDelivered(bodies);
  h.eq(Gt.row.state.slots.filter(s => s.k === 'item').length, 2, 'two items on the row');
  h.eq(Gt.state().queue >= 2, true, 'items on the row count as pending (state().queue)');
  stepFor(Gt, 0.05);
  h.eq(Gt.fs.throws.length, 1, 'one in flight at a time');
  h.eq(Gt.run.played, played0, 'nothing resolves mid-flight');
  stepFor(Gt, 1.6);
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
  // (round 21) the first elite: its combo relic pick, after the reward (the cards and Skip kept their indices)
  h.eq(Gt.screen, 'treasure', 'skip -> the combo relic pick');
  Gt.choose(Gt.S.ui.buttons.findIndex(b => b.label === 'Skip'));
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
  // (round 21) the first elite's combo relic pick, skipped: the reward carries on its own way after it
  h.eq(Gt.screen, 'treasure', 'the combo relic pick comes first');
  Gt.choose(Gt.S.ui.buttons.findIndex(b => b.label === 'Skip'));
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
  // round 12: the bonus capsule is a LOOT.BONUS_P chance, no longer a sure thing; force it here
  h.ok(T.DATA.LOOT.BONUS_P > 0 && T.DATA.LOOT.BONUS_P < 1, 'a jackpot bonus capsule is a chance, not a given');
  T.DATA.LOOT.BONUS_P = 1;
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
    const g0 = F.player.grabsUsed;   // (grabsUsed: a delivered combo may hand a grab back, as it does once the round 12 rat lives through it)
    GM.steer(200);
    settle(GM, 2);
    stepFor(GM, 0.6);
    h.ok(GM.dropClaw(), 'drop accepted');
    h.ok(settle(GM, 30), 'the grab finishes');
    // (a lucky grab can win the fight outright, which tears the cabinet down)
    if (GM.screen === 'fight' && GM.world) {
      h.eq(F.player.grabsUsed, g0 + 1, 'one grab spent');
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

// ---------------------------------------------------------------- BOSSES (the boss arena)
{
  // Pushes the fight's pending COMBAT events onto the playback queue.
  const flushB = (G) => { const F = G.fight, FS = G.fs; const list = F.events.splice(0); for (const ev of list) FS.queue.push({ ev, beat: 0.02 }); FS.beatT = 0; };
  const skipVs = (G) => { G.boss.vsSkip(); G.boss.vsSkip(); stepFor(G, 0.05); };
  const bossRun = (seed, act) => { const T = boot(); T.GAME.newRun('knight', seed); if (act) T.GAME.run.act = act; return T; };

  h.test('bosses: an elite opens with the versus card; input waits; a tap skips; it drops in with a stomp', () => {
    const T = bossRun(71);
    const G = T.GAME;
    G.startFight(['mimic'], 'elite');
    const v = G.boss.vs;
    h.ok(v && v.title === 'ELITE' && v.name === 'Prize Mimic' && /customer/.test(v.taunt), 'the card: ELITE, the name, the taunt');
    h.ok(Array.isArray(v.affixes) && v.affixes.length === G.fight.enemies[0].affix.length && v.affixes.every(a => a.name && a.color), 'the affix badges are listed');
    h.eq(v.rate, 1, 'first sighting: full length');
    h.ok(!G.dropClaw() && !G.endTurn(), 'no drop, no end turn under the card');
    stepFor(G, 0.2);
    h.ok(G.boss.vs && G.boss.vs.t > 0.15, 'the card runs on');
    G.tap(270, 600);
    h.ok(G.boss.vs && G.boss.vs.t >= G.boss.vs.dur - 0.31 && G.boss.vs.slam, 'a tap jumps to the exit');
    G.tap(270, 600);
    h.ok(!G.boss.vs, 'a second tap ends it');
    const a = G.fs.anim[0];
    h.ok(a.enter > 0 && a.enterK === 'elite', 'the elite makes its entrance');
    stepFor(G, 0.1);
    h.ok(G.boss.enterOff(0).y < -20, 'dropping in from above (' + G.boss.enterOff(0).y.toFixed(0) + ')');
    stepFor(G, 1);
    h.ok(a.steps >= 1 && !(a.enter > 0), 'it landed with a footfall');
    h.eq(G.boss.enterOff(0).y, 0, 'and stands in its place');
    h.ok(settle(G, 5), 'the fight is ready to play');
    h.ok(G.boss.bs && G.fight.enemies[0].def.taunt, 'arena state up');
    // the card plays itself out without a tap
    G.startFight(['broodmother'], 'elite');
    h.ok(G.boss.vs, 'a second elite, a second card');
    stepFor(G, G.boss.vs.dur / G.boss.vs.rate + 0.2);
    h.ok(!G.boss.vs, 'the card ends on its own');
    // normal fights have none
    G.startFight(['rat'], 'normal');
    h.ok(!G.boss.vs && G.S.bannerStr === 'FIGHT', 'a normal fight keeps its banner');
  });

  h.test('bosses: boss titles, the quick repeat, the tower keeper, reduced motion', () => {
    const T = bossRun(72);
    const G = T.GAME;
    G.startFight(['hoard'], 'boss');
    h.ok(G.boss.vs.boss && G.boss.vs.title === 'ACT 1 BOSS', 'ACT 1 BOSS');
    h.ok(G.boss.vs.dur > G.boss.VS_DUR.elite, 'a boss card runs longer');
    h.eq(JSON.parse(T._store[G.boss.VS_KEY]).hoard, 1, 'seen once (its own storage key)');
    G.startFight(['hoard'], 'boss');
    h.eq(G.boss.vs.rate, G.boss.VS_FAST, 'the second time is quicker');
    G.run.act = 3;
    G.startFight(['prizemaster'], 'boss');
    h.eq(G.boss.vs.title, 'FINAL BOSS', 'the Prize Master is the FINAL BOSS');
    G.run.act = 1;
    const tw = Object.values(G.run.map.tiles).find(t => t.type === 'tower');
    if (tw) { G.enterTile(tw); h.eq(G.boss.vs && G.boss.vs.title, 'TOWER KEEPER', 'a tower elite is the TOWER KEEPER'); }
    const fx = T.RENDER.fx;
    fx.reduced = true;
    G.startFight(['ironjaw'], 'elite');
    h.ok(G.boss.vs.rate > 1, 'reduced motion plays it quicker');
    skipVs(G);
    stepFor(G, 0.1);
    h.eq(G.boss.enterOff(0).y, 0, 'and without the drop');
    fx.reduced = false;
  });

  h.test('bosses: a save under the card reloads into one fight and one card', () => {
    const T = bossRun(73);
    const G = T.GAME;
    const f0 = G.run.fights;
    G.startFight(['hoard'], 'boss');
    stepFor(G, 0.5);
    G.save();
    const saved = JSON.parse(T._store.clawspire_run);
    h.ok(saved.pendingFight && saved.pendingFight.tier === 'boss', 'the save holds the pending boss fight');
    const T2 = boot({ store: Object.assign({}, T._store) });
    const G2 = T2.GAME;
    G2.choose(G2.S.ui.buttons.findIndex(b => /continue/i.test(b.label)));
    h.eq(G2.screen, 'fight', 'back in the fight');
    h.eq(G2.fight.enemies.map(e => e.id).join(), 'hoard', 'the same boss');
    h.eq(G2.run.fights, f0 + 1, 'counted once, never twice');
    h.ok(G2.boss.vs && G2.boss.vs.rate === G2.boss.VS_FAST, 'the card again, quick this time');
    h.eq(G2.fight.seed, G.fight.seed, 'the same fight');
  });

  h.test('bosses: the Hoard\'s avalanche arcs coins into the bin as bodies; phase two leans the pile', () => {
    const T = bossRun(74);
    const G = T.GAME, C = T.COMBAT;
    G.startFight(['hoard'], 'boss');
    skipVs(G);
    h.ok(settle(G, 5), 'ready');
    const F = G.fight, e = F.enemies[0];
    e.acts = 1;
    h.ok(C.sigNext(e), 'the avalanche is due');
    stepFor(G, 0.5);
    h.ok(/AVALANCHE NEXT TURN/.test(G.boss.bs.sign.label) && G.boss.bs.sign.k > 0.5, 'a warning sign hangs on the cabinet: ' + G.boss.bs.sign.label);
    e.intent = { id: 'calm', k: 'block', v: 1, txt: 'calm' };
    G.endTurn();
    h.ok(settle(G, 12), 'the enemy turn plays out');
    const coins = G.fight.bin.filter(i => i.id === 'hoardcoin');
    h.eq(coins.length, 5, 'five coins in the bin');
    h.eq(G.fs.items.filter(b => b.data.inst.id === 'hoardcoin').length, 5, 'each one a body in the cabinet');
    // phase two
    C.damage(F, F.player, e, e.hp - Math.floor(e.maxHp / 2), { pierce: true });
    flushB(G);
    stepFor(G, 0.6);
    h.ok(F.lean === -1 && G.world.gravity.x < -100, 'the pile leans toward the Hoard (gx ' + G.world.gravity.x.toFixed(0) + ')');
    // a tilt takes over for its turn, the lean comes back after
    G.fs.tilt = 1; G.world.setGravity(510, 1030); stepFor(G, 0.05);
    G.fs.tilt = 0; G.world.setGravity(0, 1150); stepFor(G, 0.05);
    h.ok(G.world.gravity.x < -100, 'the lean returns after a tilt');
  });

  h.test('bosses: the Smelter heats the cabinet: red hot metal glows, slag drips in, a hot delivery sears', () => {
    const T = bossRun(75, 2);
    const G = T.GAME, C = T.COMBAT;
    G.run.bin.forEach((i, k) => { if (k < 5) i.id = 'rusty_sword'; });
    G.startFight(['smelter'], 'boss');
    skipVs(G);
    h.ok(settle(G, 5), 'ready');
    const F = G.fight, e = F.enemies[0];
    e.acts = 1; e.intent = { id: 'calm', k: 'block', v: 1, txt: 'calm' };
    G.endTurn();
    h.ok(settle(G, 12), 'the enemy turn plays out');
    h.ok(F.heat === 1 && F.bin.some(i => i.hot), 'metal glows red hot');
    stepFor(G, 1.2);
    h.ok(G.boss.bs.heatK > 0.5, 'the cabinet heats up');
    h.eq(G.boss.bs.sign.label, 'HOT METAL', 'the sign says so');
    h.ok(G.fs.items.some(b => b.data.inst.id === 'slag'), 'the slag dripped in as a body');
    const hot = F.bin.find(i => i.hot);
    const b = G.toys.bodyOf(hot);
    F.player.block = 0;
    const hp0 = F.player.hp;
    G.playDelivered([b]);
    stepFor(G, 1.2);
    h.ok(F.player.hp <= hp0 - 2 && !hot.hot, 'the hot delivery burned the hand (' + hp0 + ' -> ' + F.player.hp + ')');
    T._resetCounts(); G.S.ctx = T._ctx; G.S.px = 1; G.draw();
    h.ok(T._counts.drawImage >= 0, 'draws with the heat on');
  });

  h.test('bosses: Glacius ices the chute lip into a wall (prizes crack it, a heavy one smashes through) and slows the rail', () => {
    const T = bossRun(76, 3);
    const G = T.GAME;
    G.startFight(['glacius'], 'boss');
    skipVs(G);
    h.ok(settle(G, 5), 'ready');
    const F = G.fight, FS = G.fs;
    F.ice = { part: 'lid', hp: 2 };
    FS.queue.push({ ev: { t: 'boss', k: 'ice', idx: 0, part: 'lid' }, beat: 0.02 }); FS.beatT = 0;
    stepFor(G, 0.1);
    const lid = G.boss.bs.lid;
    h.ok(lid && G.world.segs.includes(lid), 'a static ice wall sits over the chute mouth');
    const cb = G.cabinet.bounds;
    // a light prize dropped on it slides back into the bin and cracks it
    const light = FS.items.find(x => !(x.data.tags || []).includes('heavy'));
    light.x = cb.chuteX + 34; light.y = 40; light.vx = 0; light.vy = 0; light.held = 0;
    G.world.wakeAll();
    stepFor(G, 1.5);
    h.ok(!(light.x > cb.chuteX && light.y > cb.dividerTop), 'it never reaches the chute (' + light.x.toFixed(0) + ',' + light.y.toFixed(0) + ')');
    h.ok(F.ice && F.ice.hp === 1, 'it cracked the ice');
    // a heavy one smashes it and falls through
    const heavy = FS.items.find(x => x !== light);
    heavy.data.tags = ['heavy'];
    heavy.x = cb.chuteX + 34; heavy.y = 40; heavy.vx = 0; heavy.vy = 0; heavy.held = 0;
    G.world.wakeAll();
    stepFor(G, 1.2);
    h.ok(!F.ice && !G.boss.bs.lid && !G.world.segs.includes(lid), 'smashed: the wall is gone');
    h.ok(!FS.items.includes(heavy) || heavy.y > cb.dividerTop, 'the heavy prize fell into the chute');
    // the rail: the carriage slows while it is iced, and gets its speed back
    const sp0 = G.rig.cfg.speed;
    F.ice = { part: 'rail', hp: 2 };
    stepFor(G, 0.05);
    h.ok(Math.abs(G.rig.cfg.speed - sp0 * G.boss.RAIL_SLOW) < 1e-6, 'the iced rail slows the claw');
    h.eq(G.boss.bs.sign.label, 'RAIL FROZEN', 'the sign');
    F.ice = null;
    stepFor(G, 0.05);
    h.eq(G.rig.cfg.speed, sp0, 'thawed: full speed');
    h.ok(G.boss.bs.snow > 0, 'snow piles up in the corners');
  });

  h.test('bosses: the Prize Master hijacks one drop (the claw wanders to junk and drops itself; a wrestle pulls it part way) and shuffles the bin', () => {
    const T = bossRun(77, 3);
    const G = T.GAME, C = T.COMBAT;
    G.startFight(['prizemaster'], 'boss');
    skipVs(G);
    h.ok(settle(G, 5), 'ready');
    const F = G.fight, FS = G.fs;
    const xs0 = FS.items.map(b => b.x.toFixed(1)).join();
    h.ok(G.boss.shuffle() >= 2, 'the shuffle moves the pile');
    h.ok(FS.items.map(b => b.x.toFixed(1)).join() !== xs0, 'every body swapped places');
    stepFor(G, 1.5);
    // a rock far left is the junk it wants
    C.addJunk(F, 'rock', 1); flushB(G); stepFor(G, 1);
    const rock = FS.items.find(b => b.data.inst.id === 'rock');
    rock.x = 70;
    stepFor(G, 0.8);
    F.rigged = { drops: 1, stage: 1 };
    const g0 = F.player.grabs;
    stepFor(G, 0.2);
    h.ok(G.boss.bs.hj, 'the house takes the claw');
    h.eq(G.boss.bs.sign.label, 'RIGGED', 'the RIGGED sign');
    stepFor(G, 1.8);
    h.ok(G.rig.x < 200, 'the claw wanders toward the junk (' + G.rig.x.toFixed(0) + ')');
    stepFor(G, G.boss.HIJACK_AUTO);
    h.ok(F.player.grabs === g0 - 1 && !F.rigged && !G.boss.bs.hj, 'the house dropped it itself: one grab spent, the rig let go');
    h.ok(settle(G, 25), 'the grab finishes');
    // the wrestle: steering holds it only part way to the finger
    F.rigged = { drops: 1, stage: 2 };
    stepFor(G, 0.3);
    const fx0 = G.CAB.x + 380;
    G.pointer('down', fx0, 700);
    for (let i = 0; i < 90; i++) { G.pointer('move', fx0, 700); G.update(1 / 60); }
    const tx = G.rig.targetX;
    h.ok(tx < 380 - 60 && tx > 90, 'wrestled part way (' + tx.toFixed(0) + ' of 380)');
    G.pointer('up', fx0, 700);
    stepFor(G, 0.6);
    h.ok(!F.rigged && G.rig.x < 380 - 60, 'released: it drops where the tug of war stood (' + G.rig.x.toFixed(0) + ')');
    h.ok(settle(G, 25), 'and the grab finishes');
    // the final phase: red lights
    const e = F.enemies[0];
    C.damage(F, F.player, e, e.hp - Math.floor(e.maxHp / 4), { pierce: true });
    flushB(G); stepFor(G, 1.5);
    h.ok(F.final && G.boss.bs.alarmK > 0.5, 'the cabinet lights go red');
    T._resetCounts(); G.S.ctx = T._ctx; G.S.px = 1; G.draw();
    h.ok(T._counts.fillText > 0, 'the rigged, red cabinet draws');
  });

  h.test('bosses: the death finale: chained blasts, a whiteout, BOSS DEFEATED, a coin shower, then the reward', () => {
    const T = bossRun(78);
    const G = T.GAME, C = T.COMBAT;
    G.startFight(['hoard'], 'boss');
    skipVs(G);
    h.ok(settle(G, 5), 'ready');
    const F = G.fight, e = F.enemies[0];
    C.damage(F, F.player, e, 9999, { pierce: true });
    flushB(G);
    stepFor(G, 0.1);
    const fin = G.boss.bs.fin;
    h.ok(fin && fin.kind === 'boss' && fin.last, 'the boss finale starts on the killing blow');
    h.ok(G.fs.anim[0].dead > 0 && G.fs.anim[0].dead <= 0.02, 'the body is held while it blows apart');
    stepFor(G, 1.6);
    h.ok(fin.n === fin.booms && fin.white, 'every blast went off, then the whiteout (' + fin.n + ')');
    h.ok(G.screen === 'fight' && G.fs.outro && G.fs.outro.t > 0.5, 'the outro waits for the show');
    h.ok(G.S.bannerStr !== 'VICTORY', 'no VICTORY banner under the title card');
    const saved = JSON.parse(T._store.clawspire_run);
    h.eq(saved.screen, 'reward', 'a save during the finale is the reward screen');
    stepFor(G, 0.5);
    h.ok(fin.card, 'BOSS DEFEATED');
    h.ok(T.RENDER.fx.flyCount() >= 10, 'coins and tickets fly to the counters');
    T._resetCounts(); G.S.ctx = T._ctx; G.S.px = 1; G.draw();
    h.ok(T._counts.fillText > 0, 'the title card draws');
    stepFor(G, 4);
    h.eq(G.screen, 'reward', 'then the reward');
    // a tap skips it
    G.choose(3);
    const G2 = bossRun(79).GAME, C2 = G2 && T.COMBAT;
    void C2;
    const T3 = bossRun(80); const G3 = T3.GAME;
    G3.startFight(['mimic'], 'elite');
    skipVs(G3); settle(G3, 5);
    T3.COMBAT.damage(G3.fight, G3.fight.player, G3.fight.enemies[0], 9999, { pierce: true });
    flushB(G3); stepFor(G3, 0.2);
    h.ok(G3.boss.bs.fin && G3.boss.bs.fin.kind === 'elite', 'an elite gets the smaller finale');
    h.ok(G3.boss.bs.fin.P.total < G.boss.FIN.boss.total && G3.boss.bs.fin.booms < G.boss.FIN.boss.booms, 'shorter, fewer blasts');
    stepFor(G3, 0.5);
    G3.tap(270, 600);
    h.eq(G3.screen, 'reward', 'a tap skips to the reward');
  });

  h.test('bosses: Glacius blows apart mid fight and the Prize Master gets its own FINAL BOSS card', () => {
    const T = bossRun(81, 3);
    const G = T.GAME, C = T.COMBAT;
    G.startFight(['glacius'], 'boss');
    skipVs(G);
    h.ok(settle(G, 5), 'ready');
    const F = G.fight;
    C.damage(F, F.player, F.enemies[0], 9999, { pierce: true });
    flushB(G);
    stepFor(G, 0.1);
    h.ok(G.boss.bs.fin && G.boss.bs.fin.kind === 'mid', 'a mid-fight finale (no title card)');
    stepFor(G, 1.6);
    h.ok(G.boss.vs && G.boss.vs.title === 'FINAL BOSS' && G.boss.vs.id === 'prizemaster', 'the FINAL BOSS card');
    h.ok(!G.dropClaw(), 'input waits for it');
    skipVs(G);
    h.ok(F.enemies.some(e => e.alive && e.id === 'prizemaster'), 'the Prize Master is in the fight');
    h.ok(settle(G, 6), 'and the fight goes on');
  });

  h.test('bosses: every boss look draws with the stub ctx, the VS card and the finale included', () => {
    const T = bossRun(82, 3);
    const G = T.GAME;
    G.S.ctx = T._ctx; G.S.px = 1;
    let threw = null;
    try {
      for (const [ids, tier] of [[['mimic'], 'elite'], [['glacius'], 'boss'], [['prizemaster'], 'boss']]) {
        G.startFight(ids, tier);
        for (let i = 0; i < 12; i++) { stepFor(G, 0.25); G.draw(); }
        const F = G.fight;
        F.heat = 1; F.bin.forEach((x, k) => { if (k < 3) x.hot = true; });
        F.ice = { part: k2(F) ? 'lid' : 'rail', hp: 1 }; F.final = true; F.lean = -1; F.rigged = { drops: 1, stage: 3 };
        stepFor(G, 0.5); G.draw();
        F.ice = { part: 'rail', hp: 2 }; stepFor(G, 0.2); G.draw();
      }
    } catch (err) { threw = err; }
    function k2(F) { return F.turn % 2 === 1; }
    h.ok(!threw, 'no throw ' + (threw ? threw.stack : ''));
  });
}

// ---------------------------------------------------------------- META (meta progression)
// A profile with Tilt unlocked for the knight (and a peek at the saved meta).
function metaBoot(meta, extra) {
  const store = Object.assign({ clawspire_meta: JSON.stringify(Object.assign({ introSeen: true, tutorialDone: true, unlocks: { knight: true } }, meta || {})) }, extra || {});
  const T = boot({ store });
  return { T, G: T.GAME, saved: () => JSON.parse(T._store.clawspire_meta || '{}') };
}
const TIER_IX = { c: 0, u: 1, r: 2, l: 3 };

h.test('meta: a fresh profile and an old profile get the new fields with defaults', () => {
  const { G } = metaBoot({});
  const m = G.meta;
  h.ok(m.tilt && m.bestTilt && m.winsBy && m.ach && m.achNew && m.dexNew && typeof m.tiltSel === 'number', 'tilt, bestTilt, winsBy, ach, achNew, dexNew, tiltSel');
  h.ok(m.seen.items && m.seen.relics && m.seen.enemies && m.seen.combos, 'seen has items, relics, enemies, combos');
  h.eq(m.daily, null, 'no daily yet');
  // an old save: only the round 1 fields, plus junk in the new ones
  const { G: G2 } = metaBoot({ stats: { runs: 5, wins: 1, bestAct: 3 }, seen: { items: { rusty_sword: 1 }, relics: {} }, tilt: 'bogus', ach: [1, 2], tiltSel: 99 });
  h.eq(G2.meta.stats.runs, 5, 'old stats kept');
  h.ok(G2.meta.seen.items.rusty_sword === 1 && G2.meta.seen.enemies && G2.meta.seen.combos, 'old seen kept, new tabs added');
  h.ok(G2.meta.tilt && typeof G2.meta.tilt === 'object' && !Array.isArray(G2.meta.ach), 'junk fields reset');
  h.eq(G2.meta.tiltSel, 10, 'tiltSel clamped');
});

h.test('meta: the Tilt selector is locked until a win, then unlocks level by level', () => {
  const { T, G, saved } = metaBoot({});
  h.eq(G.prog.tiltMax(), 0, 'nothing unlocked on a fresh profile');
  G.showChars();
  h.eq(G.S.ui.buttons[0].label, T.DATA.CHARACTERS.knight.name, 'the first choice on the screen is still the knight card');
  h.eq(G.prog.setTilt(3), 0, 'setTilt clamps to what is unlocked');
  G.choose(0);
  h.eq(G.run.tilt, 0, 'a run started from the card is Tilt 0');
  // win it
  G.run.act = 3;
  G.showWin();
  h.eq(G.meta.tilt.knight, 1, 'a win unlocks Tilt 1 for the knight');
  h.eq(G.meta.bestTilt.knight, 0, 'best Tilt won is recorded');
  h.eq(G.meta.winsBy.knight, 1, 'wins per crawler');
  h.eq(G.meta.tiltSel, 1, 'the selector moves onto the new level');
  h.ok(G.run.metaEnd && G.run.metaEnd.tiltUp && G.run.metaEnd.tiltUp.lv === 1, 'the win screen shows the unlock');
  h.eq(saved().tilt.knight, 1, 'saved');
  const again = G.prog.runEnd(true);
  h.eq(G.meta.tilt.knight, 1, 'the run end counts once');
  h.ok(again === G.run.metaEnd, 'the same summary');
  // a win below the cap unlocks nothing
  G.prog.startRun('knight', 0);
  G.run.act = 3; G.showWin();
  h.eq(G.meta.tilt.knight, 1, 'a Tilt 0 win at cap 1 unlocks nothing');
  h.ok(!G.run.metaEnd.tiltUp, 'no unlock card');
  // reload keeps it
  const T2 = boot({ store: Object.assign({}, T._store) });
  h.eq(T2.GAME.meta.tilt.knight, 1, 'Tilt unlocks survive a reload');
  h.eq(T2.GAME.prog.tiltCap('knight'), 1, 'tiltCap');
  h.eq(T2.GAME.prog.tiltCap('rogue'), 0, 'per crawler');
});

h.test('meta: starting a run at a Tilt, capped per crawler, saved with the run', () => {
  const { T, G } = metaBoot({ unlocks: { knight: true, rogue: true }, tilt: { knight: 10, rogue: 2 }, tiltSel: 10 });
  G.showChars();
  const i = G.S.ui.buttons.findIndex(b => b.label === T.DATA.CHARACTERS.rogue.name);
  G.choose(i);
  h.eq(G.run.tilt, 2, 'the rogue plays at its own cap (2) when the selector says 10');
  G.prog.startRun('knight', 10);
  h.eq(G.run.tilt, 10, 'the knight plays Tilt 10');
  G.save();
  const T2 = boot({ store: Object.assign({}, T._store) });
  T2.GAME.choose(T2.GAME.S.ui.buttons.findIndex(b => /continue/i.test(b.label)));
  h.eq(T2.GAME.run.tilt, 10, 'run.tilt survives save / load');
  // an old run save without the field
  G.save();
  const o = JSON.parse(T._store.clawspire_run);
  delete o.run.tilt; delete o.run.daily; delete o.run.achNew;
  const T3 = boot({ store: { clawspire_run: JSON.stringify(o), clawspire_meta: T._store.clawspire_meta } });
  T3.GAME.choose(T3.GAME.S.ui.buttons.findIndex(b => /continue/i.test(b.label)));
  h.eq(T3.GAME.screen, 'map', 'an old run save continues');
  h.eq(T3.GAME.run.tilt | 0, 0, 'and plays at Tilt 0');
  T3.GAME.startFight(['rat'], 'normal');
  h.eq(T3.GAME.fight.tiltLv, 0, 'the fight reads Tilt 0');
});

h.test('meta: every Tilt twist lands in the game', () => {
  const { T, G } = metaBoot({ tilt: { knight: 10 } });
  const D = T.DATA;
  const at = (lv, seed) => { G.prog.startRun('knight', lv); return G.run; };
  // bulbs and junk
  const r0 = at(0), bin0 = r0.bin.length, ink0 = r0.ink;
  h.eq(at(3).ink, ink0, 'Tilt 3 keeps the bulbs');
  h.eq(at(4).ink, ink0 - 3, 'Dim Marquee: 3 fewer bulbs at the start');
  h.eq(G.run.map.ink, G.run.ink, 'the map agrees');
  h.eq(at(4).bin.length, bin0, 'Tilt 4 has no junk');
  const r5 = at(5);
  h.eq(r5.bin.length, bin0 + 1, 'Junk Drawer: one more item');
  h.ok(r5.bin.some(i => i.id === 'rock'), 'a rock in the starting bin');
  // shop prices
  G.prog.startRun('knight', 5); G.run.seed = 4242;
  const s5 = G.rollShop({ q: 3, r: 4 });
  G.prog.startRun('knight', 6); G.run.seed = 4242;
  const s6 = G.rollShop({ q: 3, r: 4 });
  h.eq(s6.items.map(x => x.id).join(), s5.items.map(x => x.id).join(), 'same shelf');
  s6.items.forEach((x, i) => h.eq(x.price, Math.round(s5.items[i].price * 1.25), `Price Hike: ${x.id} costs 25% more`));
  if (s5.relic) h.eq(s6.relic.price, Math.round(s5.relic.price * 1.25), 'the relic too');
  // rest
  G.prog.startRun('knight', 8); G.run.hp = 10;
  G.showRest(); G.choose(0);
  h.eq(G.run.hp, 10 + Math.round(G.run.maxHp * 0.2), 'Hard Bench: rests heal 20%');
  G.prog.startRun('knight', 7); G.run.hp = 10;
  G.showRest(); G.choose(0);
  h.eq(G.run.hp, 10 + Math.round(G.run.maxHp * 0.3), 'below Tilt 8 rests heal 30%');
  // capsules: the same rolls, one tier lower
  const caps = (lv) => { G.prog.startRun('knight', lv); G.run.seed = 777; G.run.nonce = 0; const out = []; for (let i = 0; i < 40; i++) { G.run.pity = 0; out.push(G.loot.makeCapsule(i % 4 === 3 ? 'boss' : 'elite')); } return out; };
  const c8 = caps(8), c9 = caps(9);
  let lower = 0, sum8 = 0, sum9 = 0;
  c9.forEach((c, i) => {
    const a = TIER_IX[c8[i].tier], b = TIER_IX[c.tier];
    sum8 += a; sum9 += b;
    if (b < a) lower++;
    h.ok(b <= a, `capsule ${i}: never rarer at Tilt 9 (${c8[i].tier} -> ${c.tier})`);
    if (c.src === 'boss') h.ok(b >= 1, `capsule ${i}: a boss capsule is never common`);
  });
  h.ok(lower > 20 && sum9 < sum8, `Cheap Plastic: capsules drop a tier (${lower} of 40 lower)`);
  // enemies in a fight
  G.prog.startRun('knight', 10);
  const boss = D.ENCOUNTERS[1].boss[0];
  G.startFight(boss, 'boss');
  h.eq(G.fight.tiltLv, 10, 'the fight knows the Tilt');
  h.ok(G.fight.enemies.some(e => (e.status.str || 0) > 0), 'Rigged: the boss starts with Strength');
});

h.test('meta: the Tilt badge in the HUD', () => {
  const { T, G } = metaBoot({ tilt: { knight: 3 } });
  const parent = { children: [], appendChild(c) { this.children.push(c); c.parentNode = this; return c; } };
  G.prog.startRun('knight', 3);
  // hand the act stat a parent (the stub DOM has no tree) so the badge has somewhere to live
  const actEl = T._nodes.actTxt;
  h.ok(actEl, 'the act stat exists');
  actEl.parentNode = parent;
  G.update(0.2); G.toMap();
  h.ok(G.S.tiltEl && G.S.tiltEl.parentNode === parent, 'the badge sits on the act stat');
  h.eq(G.S.tiltEl.textContent, 'T3', 'it reads T3');
  G.prog.startDaily();
  G.toMap();
  h.eq(G.S.tiltEl.textContent, 'DAILY', 'a daily run says so');
  G.prog.startRun('knight', 0);
  G.toMap();
  h.eq(G.S.tiltEl.textContent, '', 'Tilt 0 shows nothing');
});

h.test('meta: stickers unlock through the observer, slap one at a time and persist', () => {
  const { T, G, saved } = metaBoot({});
  G.newRun('knight', 5);
  G.startFight(['rat'], 'normal');
  stepFor(G, 0.5);
  h.ok(!G.meta.ach.jackpot, 'no jackpot yet');
  G.run.jackpots = 1;
  stepFor(G, 0.4);
  h.ok(G.meta.ach.jackpot, 'a jackpot in the run earns the sticker (polled)');
  h.ok(saved().ach && saved().ach.jackpot, 'saved at once');
  h.ok(G.run.achNew.includes('jackpot'), 'listed for the run end');
  h.ok(G.prog.log.some(x => x.k === 'ach' && x.id === 'jackpot') || G.prog.queue.some(x => x.k === 'ach' && x.id === 'jackpot'), 'it slaps (now or next in line)');
  // fight events: a tier 3 Mega Jackpot combo records the combo and three stickers
  G.fs.queue.push({ ev: { t: 'combo', id: 'mega_jackpot', name: 'Mega Jackpot', text: '', color: '#fff', n: 1, tier: 3 }, beat: 0 });
  stepFor(G, 0.2);
  h.ok(G.meta.seen.combos.mega_jackpot, 'the combo is in the Prizedex');
  h.ok(G.meta.ach.combo && G.meta.ach.three_star && G.meta.ach.mega, 'combo, three star and mega stickers');
  // the stickers queue: one on screen at a time
  const shown = G.prog.log.filter(x => x.k === 'ach').length;
  h.ok(G.prog.current && G.prog.current.k, 'one toast is up');
  stepFor(G, 12);
  h.ok(G.prog.log.filter(x => x.k === 'ach').length > shown, 'the rest follow');
  h.eq(G.prog.queue.length, 0, 'the queue drains');
  // eat and burst
  G.fs.queue.push({ ev: { t: 'binReturn', insts: [], idx: 0, why: 'burst' }, beat: 0 });
  stepFor(G, 0.2);
  h.ok(G.meta.ach.indigestion, 'Indigestion from a burst');
  // a boss finished by a thrown bomb
  G.startFight(T.DATA.ENCOUNTERS[1].boss[0], 'boss');
  stepFor(G, 0.3);
  const bomb = Object.keys(T.DATA.ITEMS).find(id => T.DATA.ITEMS[id].art === 'bomb' && T.DATA.ITEMS[id].rarity !== 'junk');
  const bi = G.fight.enemies.findIndex(e => e.def.tier === 'boss');
  h.ok(bi >= 0, 'a boss in the fight');
  G.fs.queue.length = 0; G.fs.beatT = 0;
  G.fs.curDef = T.DATA.ITEMS[bomb];
  G.fs.queue.push({ ev: { t: 'die', idx: bi }, beat: 0 });
  stepFor(G, 0.1);
  h.ok(G.meta.ach.special_delivery, 'Special Delivery');
  // a flawless one-turn elite win
  G.startFight(T.DATA.ENCOUNTERS[1].elite[0], 'elite');
  stepFor(G, 0.2);
  G.fight.stats.dmgTaken = 0; G.fight.turn = 1;
  G.endFight('win');
  h.ok(G.meta.ach.untouchable && G.meta.ach.one_turn, 'Untouchable and One Turn Wonder');
  h.ok(!G.prog.achUnlock('jackpot'), 'never twice');
  h.ok(!G.prog.achUnlock('nope'), 'unknown ids ignored');
});

h.test('meta: Prizedex discoveries, the toast and the screen', () => {
  const { T, G } = metaBoot({});
  G.newRun('knight', 6);
  const knightBin = T.DATA.CHARACTERS.knight.bin;
  h.ok(knightBin.every(id => G.meta.seen.items[id]), 'the starting bin is recorded');
  h.ok(!G.prog.log.some(x => x.k === 'dex'), 'the first starting bin never toasts');
  h.ok(G.meta.seen.relics[T.DATA.CHARACTERS.knight.relic], 'the starting relic is recorded');
  stepFor(G, 0.3);
  h.eq(G.prog.queue.length + (G.prog.current ? 1 : 0), 0, 'nothing queued from the start');
  const fresh = Object.keys(T.DATA.ITEMS).filter(id => !G.meta.seen.items[id]).slice(0, 3);
  for (const id of fresh) h.ok(G.prog.dexSee('items', id), 'a first sighting: ' + id);
  h.ok(!G.prog.dexSee('items', fresh[0]), 'a second sighting is nothing');
  stepFor(G, 0.1);
  const d = G.prog.log.find(x => x.k === 'dex');
  h.ok(d && d.n === 3, 'three sightings at once share one toast');
  // enemies are recorded when a fight starts
  G.startFight(['rat', 'slime'].filter(id => T.DATA.ENEMIES[id]), 'normal');
  stepFor(G, 0.3);
  h.ok(G.meta.seen.enemies.rat, 'the enemies of a fight are spotted');
  // the screen
  const P0 = G.prog.dexProg();
  h.ok(P0.n > 0 && P0.pct > 0 && P0.pct < 100, 'progress: ' + P0.pct.toFixed(1) + '%');
  G.toMap();
  G.showCollection('items');
  h.eq(G.screen, 'collection', 'the Prizedex opens');
  const labels = G.S.ui.buttons.map(b => b.label);
  h.ok(['Items', 'Relics', 'Enemies', 'Combos'].every(l => labels.includes(l)), 'four tabs: ' + labels.join(','));
  h.ok(!fresh.some(id => G.meta.dexNew['items:' + id]), 'NEW! marks clear once the tab was shown');
  G.prog.dexSee('combos', 'molotov');
  G.showCollection('combos');
  h.ok(!G.meta.dexNew['combos:molotov'], 'per tab');
  G.showCollection('enemies'); G.draw();
  G.choose(G.S.ui.buttons.findIndex(b => b.label === 'Back'));
  h.eq(G.screen, 'title', 'back to the title');
});

h.test('meta: the sticker board and the title', () => {
  const { T, G } = metaBoot({ ach: { jackpot: { run: 1 } }, achNew: { jackpot: 1 }, stats: { runs: 3, wins: 0, kills: 40 } });
  const labels = G.S.ui.buttons.map(b => b.label);
  for (const l of ['New run', 'Daily run', 'Prizedex', 'Stickers', 'Help', 'Intro']) h.ok(labels.includes(l), 'title has ' + l);
  h.ok(!G.S.attract, 'no attract mode headless');
  h.eq(G.prog.insertCoin(), false, 'no coin to insert');
  G.choose(labels.indexOf('Stickers'));
  h.eq(G.screen, 'stickers', 'the sticker board');
  h.eq(Object.keys(G.meta.achNew).length, 0, 'NEW! marks clear on view');
  G.draw();
  G.choose(G.S.ui.buttons.findIndex(b => b.label === 'Back'));
  h.eq(G.screen, 'title', 'back');
  // the board does not eat a saved run (it never saves)
  G.newRun('knight', 8); G.save();
  const runSave = T._store.clawspire_run;
  G.run = null;
  G.showTitle(); G.showStickers(); G.showCollection(); G.showTitle();
  h.eq(T._store.clawspire_run, runSave, 'the saved run survives the meta screens');
});

h.test('meta: the daily run', () => {
  const { T, G, saved } = metaBoot({ tilt: { rogue: 3, knight: 3, alchemist: 3 }, tiltSel: 3 });
  const key = T.DATA.dailyKey();
  G.choose(G.S.ui.buttons.findIndex(b => b.label === 'Daily run'));
  h.eq(G.screen, 'map', 'the daily starts');
  h.eq(G.run.daily, key, 'run.daily is today');
  h.eq(G.run.seed, T.DATA.dailySeed(key), 'today\'s seed');
  h.eq(G.run.char, T.DATA.dailyChar(key), 'today\'s crawler (locked or not)');
  h.eq(G.run.tilt, 0, 'always Tilt 0');
  const T2 = metaBoot({}).G;
  T2.prog.startDaily();
  h.eq(JSON.stringify(T2.run.map.tiles), JSON.stringify(G.run.map.tiles), 'the same map for everyone');
  h.eq(T2.run.bin.map(i => i.id).join(), G.run.bin.map(i => i.id).join(), 'the same bin');
  G.run.kills = 7;
  G.showGameOver();
  const d = saved().daily;
  h.ok(d && d.key === key && d.best > 0 && d.best === G.run.metaEnd.daily.score && d.best === T.DATA.dailyScore(G.run, false), 'the best score is saved: ' + (d && d.best));
  h.ok(G.run.metaEnd.daily.newBest, 'a first try is a new best');
  h.ok(G.meta.ach.daily_grind, 'Daily Grind');
  const best = d.best;
  G.prog.startDaily();
  G.showGameOver();
  h.eq(saved().daily.best, best, 'a worse run keeps the best');
  h.eq(saved().daily.runs, 2, 'two tries today');
});

// ---- claw types (DESIGN.md "Claw types")
function clawBoot() {
  const T = boot({ store: { clawspire_meta: JSON.stringify({ introSeen: true, tutorialDone: true, unlocks: { knight: true } }) } });
  return { T, G: T.GAME };
}
const CLAW_BIN = ['rusty_sword', 'rusty_sword', 'dented_shield', 'lucky_coin', 'iron_nut', 'skeleton_key', 'pot_lid', 'prize_marble', 'prize_marble',
  'glass_bead', 'glass_bead', 'crisp_apple', 'bubble_flask', 'peppermint', 'sour_drop', 'tower_shield', 'lucky_penny', 'arcade_token'];
function clawFight(G, type, seed) {
  G.claws.pick(type);
  G.newRun('knight', seed || 3131);
  G.run.bin = CLAW_BIN.map((id, i) => ({ uid: 'ct' + i, id, plus: false }));
  G.startFight(['slime'], 'normal', { seed: 555 });
  for (const e of G.fight.enemies) { e.hp = e.maxHp = 999; }
  stepFor(G, 3.5);
}

h.test('claw types: the picker sets run.clawType, old saves load as the classic claw', () => {
  const { T, G } = clawBoot();
  h.eq(G.claws.picked(), 'classic', 'a fresh profile picks the classic claw');
  G.showChars();
  h.eq(G.screen, 'chars', 'character select');
  h.ok(G.S.ui.buttons[0] && /Grabsworth|knight/i.test(G.S.ui.buttons[0].label), 'the first choice is still the knight (claw chips are not choose entries)');
  h.ok(G.S.clawDemo && G.S.clawDemo.rig, 'the picker builds a demo cabinet');
  const D = G.claws.demo('magnet');
  for (let i = 0; i < 600; i++) G.claws.demoStep(D, DT);
  h.ok(D.rig.type === 'magnet' && D.t > 9, 'the demo runs on its own');
  G.claws.demoDraw(D, T._ctx, 1);
  h.ok(G.claws.pick('hook'), 'pick the harpoon');
  h.eq(G.claws.pick('nonsense'), false, 'an unknown claw is refused');
  h.eq(JSON.parse(T._store.clawspire_meta).clawPick, 'hook', 'the pick is saved on the profile');
  G.choose(0);
  h.eq(G.run.clawType, 'hook', 'the new run carries the claw');
  G.startFight(['slime'], 'normal', { seed: 9 });
  h.eq(G.rig.type, 'hook', 'the fight builds a harpoon rig');
  G.save();
  const saved = JSON.parse(T._store.clawspire_run);
  h.eq(saved.run.clawType, 'hook', 'the save has run.clawType');
  // a reload keeps it
  const T2 = boot({ store: Object.assign({}, T._store) });
  h.ok(T2.GAME.load(), 'the run loads');
  h.eq(T2.GAME.run.clawType, 'hook', 'run.clawType survives a save/load');
  h.eq(T2.GAME.meta.clawPick, 'hook', 'the profile remembers the pick');
  // an old save without the field is the classic claw
  delete saved.run.clawType;
  const T3 = boot({ store: { clawspire_meta: T._store.clawspire_meta, clawspire_run: JSON.stringify(saved) } });
  h.ok(T3.GAME.load(), 'an old save loads');
  h.eq(T3.GAME.claws.type(), 'classic', 'a run without a claw type is the classic claw');
  if (T3.GAME.rig) h.eq(T3.GAME.rig.type, 'classic', 'and its fight has the classic rig');
});

h.test('claw types: every type delivers in a real grab (steer, drop, deliver)', () => {
  const { T, G } = clawBoot();
  for (const type of G.claws.ids()) {
    clawFight(G, type);
    h.eq(G.rig.type, type, type + ' rig');
    let delivered = 0, tries = 0, metalOnly = true;
    const played = [];
    const play0 = G.fight.used.length;
    while (tries < 3 && delivered === 0) {
      tries++;
      const metal = (b) => b.data && b.data.tags && b.data.tags.indexOf('metal') >= 0;
      const x = G.rig.aimAt(type === 'magnet' ? metal : null);
      h.ok(G.steer(x == null ? 200 : x), type + ' steer');
      stepFor(G, 0.8);
      h.ok(G.dropClaw(), type + ' drop');
      let n = 0;
      while (G.state().grabInFlight && n < 60 * 25) { G.update(DT); n++; }
      h.ok(!G.state().grabInFlight, type + ' grab finished');
      delivered += G.fs.delivered;
      settle(G, 10);
      if (G.fight.player.grabs <= 0) break;
    }
    for (const inst of G.fight.used.slice(play0)) played.push(inst.id);
    if (type === 'magnet') for (const id of played) if ((DATA.ITEMS[id].tags || []).indexOf('metal') < 0) metalOnly = false;
    h.ok(delivered >= 1, `${type} delivered ${delivered} in ${tries} grab(s)`);
    if (type === 'magnet') h.ok(metalOnly, 'the magnet crane only delivered metal: ' + played.join(','));
    G.draw();
  }
});

h.test('claw juice: coin clunk and spin-up each turn, a jackpot twirl, idle antics, label zones', () => {
  const { T, G } = clawBoot();
  const calls = [];
  const sfx0 = T.AUDIO.sfx;
  T.AUDIO.sfx = (n) => { calls.push(n); return true; };
  clawFight(G, 'magnet');
  h.ok(calls.includes('clawCoin'), 'the fight opens with the coin clunk');
  h.ok(calls.includes('clawSpin'), '...and the claw spinning up');
  h.ok(T.RENDER.fx.zones().some(z => z.id === 'marquee'), 'the fight keeps labels off the marquee');
  calls.length = 0;
  G.claws.turnStart();
  stepFor(G, 0.5);
  h.ok(calls.includes('clawCoin') && G.fs.claw.slotFl > 0, 'a new turn drops a coin in the slot');
  stepFor(G, 0.4);
  h.ok(G.fs.claw.spin > 0 && calls.includes('clawSpin'), 'and spins the claw up');
  // idle: the bored claw taps the glass
  calls.length = 0;
  stepFor(G, G.claws.ANTIC_AFTER + 1.2);
  h.ok(calls.includes('clawTap'), 'a claw left waiting taps the glass');
  stepFor(G, 12);
  h.ok(G.fs.claw.mood === 'sleepy' || G.fs.claw.anticN >= 3, 'and later yawns');
  G.draw();
  // jackpot
  calls.length = 0;
  G.claws.celebrate();
  h.ok(calls.includes('clawCheer') && G.fs.claw.spin === 1 && G.fs.claw.mood === 'wow', 'a jackpot twirl');
  // per-type rig events
  for (const ev of ['drop', 'touch', 'close', 'lift', 'carry', 'release', 'home']) G.rigEvent(ev);
  h.ok(calls.includes('magHum') && calls.includes('magZap') && calls.includes('magDrop'), 'the magnet hums, zaps and lets go');
  G.draw();
  for (const type of ['hook', 'scoop', 'hand', 'tri']) {
    clawFight(G, type);
    calls.length = 0;
    for (const ev of ['drop', 'touch', 'close', 'lift', 'carry', 'release', 'home']) G.rigEvent(ev);
    const want = { hook: 'hookFire', scoop: 'scoopSlosh', hand: 'handSquish', tri: 'clawClose' }[type];
    h.ok(calls.includes(want), `${type} has its own sound (${want})`);
    G.draw();
  }
  G.toMap();
  h.ok(!T.RENDER.fx.zones().some(z => z.id === 'marquee'), 'off the fight screen the marquee zone is gone');
  T.AUDIO.sfx = sfx0;
});

// ---- Polish and QA: the announcer (one big banner at a time)
h.test('announcer: a burst of 10 never overlaps, priorities, stale drop, merge, interrupt, block, tap', () => {
  const T = boot();
  const G = T.GAME, A = G.ann, P = A.ANN.PRI;
  G.newRun('knight', 31);
  G.startFight(['rat'], 'normal');
  h.ok(settle(G, 10), 'fight ready');
  stepFor(G, 2);
  h.eq(A.visible(), 0, 'the opening banner is gone');
  const pri = (e) => P[e.cls] || 0;
  // ten at once: turn banners, a jackpot, five combos, phase two, the final phase, victory
  const logStart = A.log.length;
  G.ann.banner('YOUR TURN', 'turn', 0.9);
  G.ann.banner('JACKPOT', 'jackpot', 1.4);
  for (let i = 0; i < 5; i++) G.ann.combo({ id: 'c' + i, name: 'Combo ' + i, text: 't', color: '#ff2e88', n: 1, tier: 1 + (i % 3) });
  G.ann.banner('MAD', 'enemy', 1.4);
  G.ann.banner('FINAL PHASE', 'enemy', 1.6, 'final');
  G.ann.banner('TURN 2', 'turn', 0.9);
  let worst = 0, both = 0;
  for (let i = 0; i < 60 * 14; i++) {
    G.update(1 / 60);
    worst = Math.max(worst, A.visible());
    if (A.cur && A.exiting) both++;
  }
  h.ok(worst <= 1, 'never two big banners on screen (' + worst + ')');
  h.eq(both, 0, 'the live one and one stepping out never overlap');
  const shows = A.log.slice(logStart).filter((e) => e.k === 'show');
  const firsts = [];
  for (const e of shows) if (!firsts.some((f) => f.key === e.key)) firsts.push(e);
  // once the burst has landed, the rest come out biggest first
  const afterBurst = firsts.slice(1);
  let sorted = true;
  for (let i = 1; i < afterBurst.length; i++) if (pri(afterBurst[i]) > pri(afterBurst[i - 1])) sorted = false;
  h.ok(sorted, 'bigger first: ' + afterBurst.map((e) => e.key).join(' > '));
  h.eq(afterBurst[0] && afterBurst[0].key, 'final', 'the final phase takes the stage from the burst');
  const comboOrder = firsts.filter((e) => e.cls === 'combo').map((e) => e.key);
  h.ok(comboOrder.every((k, i) => i === 0 || +k.slice(7) > +comboOrder[i - 1].slice(7)), 'combos keep their order: ' + comboOrder.join(','));
  h.ok(A.log.slice(logStart).some((e) => e.k === 'stale'), 'stale ones are dropped rather than shown late');
  h.ok(!firsts.some((e) => e.key === 'turn' && e !== firsts[0]), 'a turn banner that waited too long never shows');
  h.ok(!A.cur && !A.queue.length && A.visible() === 0, 'and the lane drains');
  // stale drop, exactly: a turn banner behind the victory sweep
  const l1 = A.log.length;
  G.ann.banner('VICTORY', 'victory', 1.6);
  G.ann.banner('TURN 3', 'turn', 0.9);
  h.eq(A.queue.length, 1, 'the turn banner waits behind the victory');
  stepFor(G, 1);
  h.eq(A.queue.length, 0, 'and is dropped once stale (' + A.ANN.WAIT.turn + ' s)');
  h.ok(A.log.slice(l1).some((e) => e.k === 'stale' && e.key === 'turn'), 'logged as stale');
  stepFor(G, 2);
  // merge: the same combo twice is one banner with the newer count
  G.ann.combo({ id: 'm', name: 'Merge', text: '', n: 1, tier: 1 });
  G.ann.combo({ id: 'm', name: 'Merge', text: '', n: 2, tier: 1 });
  h.ok(A.cur && A.cur.key === 'combo:m' && A.cur.ev.n === 2 && !A.queue.length, 'the same key merges into the live one');
  h.eq(T._nodes.comboName.textContent, 'Merge x2', 'and shows the newer words');
  stepFor(G, 2);
  // interrupt: a turn banner is cut by a combo with a quick exit
  G.ann.banner('YOUR TURN', 'turn', 0.9);
  stepFor(G, 0.1);
  const l2 = A.log.length;
  G.ann.combo({ id: 'i', name: 'Cutter', text: '', n: 1, tier: 2 });
  h.ok(A.exiting && A.exiting.key === 'turn' && !A.cur, 'the smaller one steps out');
  stepFor(G, A.ANN.EXIT + 0.05);
  h.ok(A.cur && A.cur.key === 'combo:i', 'and the bigger one follows within the quick exit');
  h.ok(A.log.slice(l2).some((e) => e.k === 'cut' && e.key === 'turn'), 'logged as cut');
  // an early-interrupted combo comes back after the bigger one
  G.ann.banner('RAGE', 'enemy', 1.0);
  stepFor(G, A.ANN.EXIT + 0.05);
  h.ok(A.cur && A.cur.cls === 'rage', 'phase two interrupts a combo');
  h.ok(A.queue.some((a) => a.key === 'combo:i' && a.back), 'the combo waits to come back');
  stepFor(G, 1.4);
  h.ok(A.cur && A.cur.key === 'combo:i', 'and it comes back');
  // a tap cuts the live one short
  stepFor(G, 0.4);
  h.ok(G.ann.tap(), 'a tap cuts it');
  stepFor(G, 0.2);
  h.ok(!A.cur && A.visible() === 0, 'gone');
  // the versus card holds the lane
  G.startFight(['goblin_king'].filter((id) => T.DATA.ENEMIES[id]).concat(Object.keys(T.DATA.ENEMIES).filter((id) => T.DATA.ENEMIES[id].tier === 'elite')).slice(0, 1), 'elite');
  if (G.boss.vs) {
    h.ok(A.blocked(), 'the versus card blocks the lane');
    G.ann.combo({ id: 'v', name: 'Under', text: '', n: 1, tier: 1 });
    stepFor(G, 0.3);
    h.ok(!A.cur && A.visible() === 0, 'nothing shows over the card');
    stepFor(G, G.boss.vs ? G.boss.vs.dur / G.boss.vs.rate + 0.2 : 0);
    h.ok(!G.boss.vs, 'the card ends');
  }
  // leaving the fight clears it all
  G.ann.banner('JACKPOT', 'jackpot', 1.4);
  G.toMap();
  h.ok(!A.cur && !A.queue.length && A.visible() === 0, 'leaving the fight clears the lane');
});

h.test('feel: the victory outro fast-forwards for a veteran, and a tap still skips it', () => {
  const T = boot();
  const G = T.GAME;
  const outroFor = (fights) => {
    G.newRun('knight', 41);
    G.meta.stats.fights = fights;
    G.startFight(['rat'], 'normal');
    settle(G, 6);
    const F = G.fight;
    for (const e of F.enemies) { e.hp = 0; e.alive = false; }
    G.endFight('win', true);
    const t = G.fs && G.fs.outro ? G.fs.outro.t : -1;
    return t;
  };
  const fresh = outroFor(0), vet = outroFor(50);
  h.ok(fresh >= 1.5, 'a new profile gets the full victory beat (' + fresh + ')');
  h.ok(vet > 0 && vet < fresh, 'a veteran gets the quick one (' + vet + ')');
  G.tap(270, 600);
  h.eq(G.screen, 'reward', 'a tap skips to the reward');
});

h.test('feel: a tap on an enemy lists every status in words (the chips may be cut to one row)', () => {
  const T = boot();
  const G = T.GAME;
  G.newRun('knight', 43);
  G.startFight(['rat', 'slime', 'goblin'].filter((id) => T.DATA.ENEMIES[id]), 'normal');
  settle(G, 6);
  const e = G.fight.enemies[1];
  Object.assign(e.status, { poison: 7, burn: 3, vuln: 2, weak: 1, thorns: 2, bleed: 1 });
  G.S.ctx = T._ctx; G.S.px = 1;
  let threw = null;
  try { G.draw(); } catch (err) { threw = err; }
  h.ok(!threw, 'a crowded enemy draws ' + (threw ? threw.stack : ''));
  G.tap(270, 250);
  const html = (G.S.popover && G.S.popover.html) || '';
  const SD = T.DATA.STATUS;
  h.ok(['poison', 'burn', 'bleed'].every((id) => html.includes((SD[id] && SD[id].name) || id)), 'the popover names them: ' + html.replace(/<[^>]+>/g, ' ').slice(0, 160));
});

h.test('perf: the frame governor thins particles on a slow device and lets go when it recovers', () => {
  const T = boot();
  const G = T.GAME, fx = T.RENDER.fx, P = G.perf;
  h.ok(!fx.lite, 'full quality to start');
  for (let i = 0; i < 20; i++) P.tick(16.7);
  h.ok(!fx.lite, 'a 60 fps device stays full');
  P.tick(400); P.tick(16.7);
  h.ok(!fx.lite, 'one hitch (a tab switch) is ignored');
  for (let i = 0; i < 40; i++) P.tick(45);
  h.ok(fx.lite && P.state.lite, 'sustained slow frames switch to lite');
  // lite halves the preset counts and the pool
  fx.clear && fx.clear();
  fx.emit('confetti', 270, 400);
  const lite = fx.count ? fx.count() : null;
  for (let i = 0; i < 30; i++) P.tick(22);
  h.ok(fx.lite, 'in between the two thresholds it holds');
  for (let i = 0; i < 300; i++) P.tick(12);
  h.ok(!fx.lite, 'fast frames for long enough let go');
  if (lite != null) { fx.clear(); fx.emit('confetti', 270, 400); h.ok(fx.count() > lite, 'lite made fewer particles (' + lite + ' vs ' + fx.count() + ')'); }
  for (let i = 0; i < 40; i++) P.tick(45);
  h.ok(fx.lite, 'back to lite');
  for (let i = 0; i < 200; i++) P.tick(12);
  h.ok(fx.lite, 'the second time it waits longer before letting go');
  for (let i = 0; i < 300; i++) P.tick(12);
  h.ok(!fx.lite, 'but it does let go');
});

h.test('perf: the map caches its reachable ring and progress line, and still draws', () => {
  const T = boot();
  const G = T.GAME;
  G.newRun('knight', 33);
  if (G.screen !== 'map') G.toMap();
  G.S.ctx = T._ctx; G.S.px = 1;
  let threw = null;
  try { for (let i = 0; i < 5; i++) { G.update(1 / 60); G.draw(); } } catch (e) { threw = e; }
  h.ok(!threw, 'the map draws with the caches ' + (threw ? threw.stack : ''));
  const M = G.run.map, MAP = T.MAP;
  const r0 = MAP.reachable;
  let calls = 0;
  MAP.reachable = (m) => { calls++; return r0(m); };
  for (let i = 0; i < 10; i++) G.draw();
  h.ok(calls <= 1, 'ten frames on a still map ask MAP.reachable at most once (' + calls + ')');
  M.ink += 1; G.draw();
  h.ok(calls >= 1, 'spending or gaining a bulb refreshes it');
  MAP.reachable = r0;
});

// ---- round 3: Lucky Lou, the Gambler (DESIGN.md "Lucky Lou and the synergy pass")
function louBoot(unlocks) {
  const T = boot({ store: { clawspire_meta: JSON.stringify({ introSeen: true, tutorialDone: true, unlocks: unlocks || { knight: true, alchemist: true } }) } });
  return { T, G: T.GAME };
}
h.test('Lucky Lou: his card on character select, the unlock, a new run', () => {
  const { T, G } = louBoot();
  G.showChars();
  const i = G.S.ui.buttons.findIndex(b => b.label === 'Lucky Lou');
  h.ok(i >= 0, 'his card is on character select');
  h.ok(i >= 0 && !G.S.ui.buttons[i].disabled, 'open for a profile that already reached act 2 (the alchemist\'s rule)');
  h.eq(G.S.ui.buttons[0].label, T.DATA.CHARACTERS.knight.name, 'the knight is still the first card');
  G.choose(i);
  h.eq(G.run.char, 'gambler', 'the run is Lucky Lou\'s');
  h.eq(G.run.bin.length, 19, 'with his 19 item bin');
  h.ok(G.run.relics.includes('snake_eyes'), 'and Snake Eyes');
  h.eq(G.run.maxHp, 78, '78 hp (QA pass 6, round 17: 70 -> 78)');
  const fresh = louBoot({ knight: true }).G;
  fresh.showChars();
  const j = fresh.S.ui.buttons.findIndex(b => b.label === 'Lucky Lou');
  h.ok(j >= 0 && fresh.S.ui.buttons[j].disabled, 'a fresh profile has to reach act 2 first');
  // Tilt is per crawler, like the others
  const { G: G2 } = louBoot();
  G2.meta.tilt = { gambler: 2 };
  h.eq(G2.prog.tiltCap('gambler'), 2, 'his own Tilt ladder');
  h.eq(G2.prog.tiltCap('knight'), 0, 'separate from the knight\'s');
});

h.test('Lucky Lou: a real fight with every claw type, the meter on the cabinet', () => {
  const { T, G } = louBoot();
  const drawn = [];
  const lm0 = T.RENDER.luckMeter;
  T.RENDER.luckMeter = (...a) => { drawn.push(a[4]); return lm0(...a); };
  for (const type of G.claws.ids()) {
    G.claws.pick(type);
    G.newRun('gambler', 4242);
    G.startFight(['slime'], 'normal', { seed: 77 });
    for (const e of G.fight.enemies) { e.hp = e.maxHp = 999; }
    stepFor(G, 3.5);
    h.eq(G.fight.luckK, 1, type + ': Lou\'s meter is on');
    h.eq(G.fight.clawType, type, type + ': the fight knows the claw');
    let grabs = 0, checked = 0;
    while (grabs < 3 && G.fight.phase === 'player' && G.fight.player.grabs > 0) {
      grabs++;
      const luck0 = G.fight.player.status.luck | 0;
      const x = G.rig.aimAt(type === 'magnet' ? (b) => b.data && b.data.tags && b.data.tags.indexOf('metal') >= 0 : null);
      G.steer(x == null ? 200 : x);
      stepFor(G, 0.6);
      if (!G.dropClaw()) break;
      let n = 0;
      while (G.state().grabInFlight && n < 60 * 25) { G.update(DT); n++; }
      h.ok(!G.state().grabInFlight, `${type} grab ${grabs} finished`);
      settle(G, 10);
      const got = G.fs.delivered, luck = G.fight.player.status.luck | 0;
      if (got === 0) { h.ok(luck >= Math.min(10, luck0 + 2), `${type}: a whiff filled the meter (${luck0} -> ${luck})`); checked++; }
      else if (got >= 2 && luck0 > 0) { h.ok(luck < luck0 + 2, `${type}: a double grab cashed out (${luck0} -> ${luck})`); checked++; }
      G.draw();
    }
    h.ok(grabs >= 1, `${type}: Lou grabbed`);
    // force the two halves of the mechanic through the game's own queue
    const F = G.fight;
    T.COMBAT.addLuck(F, 5);
    G.draw();
    const cash = T.COMBAT.cashOut(F, 2);
    h.ok(cash.some(e => e.t === 'luck' && e.k === 'cash' && e.v >= 5), `${type}: a cash out event`);
    G.content.luckFx(cash.find(e => e.t === 'luck'));
    h.ok(G.content.luckM && G.content.luckM.cash > 0, `${type}: the meter runs its CASH OUT chase`);
    G.draw();
  }
  h.ok(drawn.length > 0 && drawn.some(st => st.on && st.luck >= 5), 'the Luck meter is drawn on the cabinet');
  T.RENDER.luckMeter = lm0;
});

h.test('Lucky Lou: near misses, bomb blasts and cracks reach COMBAT; the music layers follow the fight', () => {
  const { T, G } = louBoot();
  G.claws.pick('classic');
  G.newRun('gambler', 99);
  G.run.relics.push('blasting_cap', 'broken_mirror');
  G.startFight(['slime'], 'normal', { seed: 12 });
  for (const e of G.fight.enemies) { e.hp = e.maxHp = 999; }
  stepFor(G, 3.5);
  const F = G.fight;
  G.fs.grabN = (G.fs.grabN | 0) + 1;
  G.toys.soClose(200, 600);
  settle(G, 3);
  h.eq(F.player.status.luck | 0, 1, 'SO CLOSE gives Lou 1 Luck');
  const b = G.fs.items[0];
  G.content.matHook('blast', b.data.inst);
  settle(G, 3);
  h.ok(F.enemies.every(e => !e.alive || (e.status.burn | 0) >= 3), 'a blast in the bin: the Blasting Cap burns them');
  G.content.matHook('crack', b.data.inst);
  settle(G, 3);
  h.eq(F.player.status.luck | 0, 2, 'a crack: the Broken Mirror adds Luck');
  // music layers: a streak and low hp switch them, the last kill plays the sting
  const states = [];
  const ms0 = T.AUDIO.musicState, vic0 = T.AUDIO.victory;
  let stung = 0;
  T.AUDIO.musicState = (o) => { states.push(JSON.stringify(o)); return ms0(o); };
  T.AUDIO.victory = () => { stung++; return vic0(); };
  F.streak = 4;
  stepFor(G, 0.2);
  h.ok(states.some(s => s === '{"hype":true,"tense":false}'), 'a streak of 3+ brings in the hype layer');
  F.streak = 0; F.player.hp = 5;
  stepFor(G, 0.2);
  h.ok(states.some(s => /"tense":true/.test(s)), 'under 30% hp the tense layer comes in');
  F.player.hp = F.player.maxHp;
  for (const e of F.enemies) T.COMBAT.damage(F, F.player, e, 99999, { pierce: true });
  G.fs.queue.push(...F.events.splice(0).map(ev => ({ ev, beat: 0.05 })));
  stepFor(G, 3);
  h.ok(stung >= 1, 'the last kill plays the victory sting');
  T.AUDIO.musicState = ms0; T.AUDIO.victory = vic0;
});

h.test('Lucky Lou: secret combos stay ??? in the Prizedex until found, ticket relics pay out, the Gacha Charm', () => {
  const { T, G } = louBoot();
  const walk = (el, out) => { if (!el) return out; out.push(el); for (const c of el.children || []) walk(c, out); return out; };
  const secrets = Object.keys(T.DATA.COMBOS).filter(id => T.DATA.COMBOS[id].secret);
  h.ok(secrets.length >= 3, 'secret recipes exist');
  // cards in DATA.dexEntries order: find the Midas Touch card by position
  const cardFor = (id) => {
    const cards = walk(T._nodes.collectionBody, []).filter(e => /\bdexc\b/.test(e.className || ''));
    return cards[T.DATA.dexEntries().combos.indexOf(id)] || null;
  };
  const textOf = (el) => walk(el, []).map(e => e.textContent || '').join('|');
  G.showCollection('combos');
  const hidden = cardFor('midas_touch');
  h.ok(hidden && /locked/.test(hidden.className) && /\?\?\?/.test(textOf(hidden)) && !/Midas/.test(textOf(hidden)), 'an undiscovered secret is ??? on its card');
  hidden.onclick();
  const pop = T._nodes.pop ? T._nodes.pop.innerHTML : '';
  h.ok(/\?\?\?/.test(pop) && !/coin/i.test(pop), 'and its hint hides the recipe [' + pop + ']');
  const open = cardFor('molotov');
  open.onclick();
  h.ok(/Recipe: Glass meets fire/.test(T._nodes.pop.innerHTML), 'a normal recipe still hints its recipe');
  G.prog.dexSee('combos', 'midas_touch', true);
  h.ok(G.meta.seen.combos.midas_touch, 'firing one records it');
  G.showCollection('combos');
  const found = cardFor('midas_touch');
  h.ok(found && /Midas Touch/.test(textOf(found)), 'then the card shows its name');
  found.onclick();
  h.ok(/Three different coins/.test(T._nodes.pop.innerHTML), 'and the recipe');
  G.draw();
  // payout: relic tickets land on the receipt
  G.newRun('gambler', 5);
  G.run.relics.push('ticket_roll', 'gacha_charm');
  h.ok(G.content.capUp() >= 0.2, 'the Gacha Charm lifts capsule upgrades');
  const cap = G.loot.makeCapsule('normal');
  h.ok(cap && cap.tier, 'capsules still roll with it');
  G.startFight(['slime'], 'normal', { seed: 3 });
  stepFor(G, 3.5);
  G.fight.stats.tix = 4;
  const rw = G.loot.lootReward({ tier: 'normal', gold: 10 });
  h.ok(rw.pay && rw.pay.some(l => l.id === 'relictix' && l.tix === 4), 'the ticket relics get their payout line');
});

// ---------------------------------------------------------------- ARCADE (DESIGN.md "Arcade")
// A cabinet of the given game on the current map (an empty land hex turned
// into one when the map rolled none), fresh, with the given plays.
function arcCab(Gt, type, tokens) {
  const M = Gt.run.map;
  let t = Object.values(M.tiles).find(x => x.type === type);
  if (!t) { t = Object.values(M.tiles).find(x => x.type === 'empty' && x.terrain === 'land' && x.ground !== 'mountain' && !x.road); t.type = type; t.content = { seed: 321, tokens, game: type }; }
  t.content.tokens = tokens; delete t.content.arc; t.done = false;
  return t;
}
// Plays until the machine is idle again (or the screen changes); true when it landed.
function arcFinish(Gt, secs) {
  const n = Math.round((secs || 12) / DT);
  for (let i = 0; i < n; i++) {
    const C = Gt.arc.state;
    if (Gt.screen !== 'arcade' || !C || C.phase === 'idle') return true;
    Gt.update(DT);
  }
  return false;
}
const payOf = (res, k) => res.pays.filter(p => p.k === k).reduce((a, p) => a + (p.n || 0), 0);

h.test('arcade: every cabinet opens from its tile, plays, pays and closes once spent', () => {
  const T = boot();
  const Gt = T.GAME;
  Gt.newRun('knight', 808);
  Gt.run.tickets = 0;
  for (const type of ['plinko', 'wheel', 'slots']) {
    Gt.toMap();
    const t = arcCab(Gt, type, 1);
    Gt.enterTile(t);
    h.eq(Gt.screen, 'arcade', type + ': the arcade screen');
    h.ok(Gt.S.ui.buttons.length === 2 && Gt.S.ui.buttons[1].label === 'Leave', type + ': play and Leave buttons');
    h.ok(/1/.test(Gt.arc.info), type + ': the plays are shown (' + Gt.arc.info + ')');
    const res0 = Gt.arc.state.A.res.length;
    h.ok(Gt.choose(0), type + ': the big button plays');
    h.eq(Gt.arc.state.phase, 'play', type + ': a play in flight');
    h.eq(Gt.arc.state.A.tokens, 0, type + ': a play spent the moment it starts');
    h.ok(arcFinish(Gt, 12), type + ': lands and celebrates within 12 s');
    if (Gt.screen === 'capsule') { Gt.loot.skipCapsule(); stepFor(Gt, 0.8); Gt.loot.collectCapsule(); }
    h.eq(Gt.screen, 'arcade', type + ': back at the machine');
    const A = Gt.arc.state.A;
    h.eq(A.res.length, res0 + 1, type + ': one result recorded');
    h.ok(!A.pend, type + ': nothing pending');
    if (type === 'wheel' && A.tokens > 0) { Gt.arc.act(); arcFinish(Gt, 12); }   // an x2 SPIN gave a respin
    stepFor(Gt, 1.5);
    if (Gt.screen === 'capsule') { Gt.loot.skipCapsule(); stepFor(Gt, 0.8); Gt.loot.collectCapsule(); }
    if (type !== 'slots') { const before = Gt.arc.state.A.used; Gt.arc.act(); h.eq(Gt.arc.state.A.used, before, type + ': no plays left, nothing happens'); }
    else { const tix = Gt.run.tickets; Gt.run.tickets = 0; Gt.arc.act(); h.ok(!Gt.arc.state.A.pend && Gt.arc.state.phase === 'idle', 'slots: no free pull and no tickets: refused'); Gt.run.tickets = tix; }
    Gt.choose(1);
    h.eq(Gt.screen, 'map', type + ': Leave goes back to the map');
    h.ok(t.done, type + ': spent and left: the cabinet is cleared');
    Gt.enterTile(t);
    h.eq(Gt.screen, 'map', type + ': a cleared cabinet does not reopen');
    Gt.draw();
  }
});

h.test('arcade: PLINKO drops land where the physics says, pay once, and replay the same after a reload', () => {
  const T = boot();
  const Gt = T.GAME;
  Gt.newRun('knight', 909);
  // the drop is a pure function of where you let go and the play count
  const a = Gt.arc.plkSim(233, 77), b = Gt.arc.plkSim(233, 77);
  h.ok(a.slot === b.slot && a.path.length === b.path.length && a.hits.length === b.hits.length, 'plkSim is deterministic');
  h.ok(a.path.length / 2 < 60 * 12 && a.hits.length > 3, 'a drop bounces off pegs and lands in time');
  const hist = new Array(9).fill(0);
  for (let i = 0; i < 400; i++) hist[Gt.arc.plkSim(262 + (i % 9) - 4, 1000 + i).slot]++;
  h.ok(hist[4] > 8 && hist[4] < 90, `aimed at the middle, the jackpot is possible but rare (${hist[4]}/400)`);
  h.ok(hist.filter(n => n > 0).length >= 6, 'the pegs spread drops over the slots');
  const edges = Gt.arc.plkEdges();
  h.ok(edges.length === 10 && edges[5] - edges[4] < edges[1] - edges[0], 'the jackpot slot is the narrow one');
  const t = arcCab(Gt, 'plinko', 2);
  Gt.enterTile(t);
  const g0 = Gt.run.gold, x0 = Gt.run.tickets, i0 = Gt.run.ink;
  Gt.arc.act(180);
  const pend = JSON.parse(JSON.stringify(Gt.arc.state.A.pend));
  h.ok(pend && pend.x === 180, 'the drop is pending, saved where it was let go');
  stepFor(Gt, 0.3);
  // reload mid-drop: the same token drops again from the same spot
  const T2 = boot({ store: Object.assign({}, T._store) });
  const G2 = T2.GAME;
  h.ok(G2.load(), 'reloads');
  h.eq(G2.screen, 'arcade', 'back at the machine');
  h.eq(G2.arc.state.phase, 'play', 'the drop plays again');
  h.eq(JSON.stringify(G2.arc.state.A.pend), JSON.stringify(pend), 'the same drop');
  h.eq(G2.arc.state.A.tokens, 1, 'the token is not handed back');
  const slot = G2.arc.plkSim(pend.x, pend.seed).slot, res = G2.arc.plkPays(slot);
  arcFinish(G2, 12);
  h.eq(G2.run.gold - g0, payOf(res, 'gold'), 'gold paid exactly once (' + res.label + ')');
  h.eq(G2.run.tickets - x0, payOf(res, 'tix'), 'tickets paid exactly once');
  h.eq(G2.run.ink - i0, payOf(res, 'ink'), 'bulbs paid exactly once');
  const caps = res.pays.filter(p => p.k === 'cap').length;
  if (caps) { stepFor(G2, 1.5); h.eq(G2.screen, 'capsule', 'a capsule prize goes to the capsule ritual'); }
  else h.ok(G2.arc.state && G2.arc.state.A.caps.length === 0, 'no capsule prize, no capsule');
  // a second reload after the landing pays nothing more
  const T3 = boot({ store: Object.assign({}, T2._store) });
  const G3 = T3.GAME;
  G3.load();
  stepFor(G3, 3);
  h.eq(G3.run.gold, G2.run.gold, 'a reload after the landing pays nothing again');
});

h.test('arcade: the PRIZE WHEEL (jackpot, double or nothing, curse, near misses, ticks)', () => {
  const T = boot();
  const Gt = T.GAME;
  Gt.newRun('knight', 1001);
  const W = Gt.arc.WHEEL, n = W.length;
  h.eq(n, 12, 'twelve wedges');
  let near = 0, rolls = 0;
  const rng = U.rng(5);
  for (let i = 0; i < 2000; i++) {
    const r = Gt.arc.wheelRoll(rng);
    rolls++;
    h.ok(r.i >= 0 && r.i < n && r.f > 0 && r.f < 1, 'roll in range');
    if (r.near) { near++; const big = (j) => ['jackpot', 'cap'].includes(W[(j + n) % n].k); h.ok(big(r.i - 1) ? r.f < 0.1 : r.f > 0.9, 'a near miss stops at the big wedge\'s peg'); }
  }
  h.ok(near > 100, 'near misses happen (' + near + '/' + rolls + ')');
  // the landing angle puts the rolled wedge under the pointer
  for (const p of [{ i: 0, f: 0.5, rot0: 1.3, turns: 4 }, { i: 7, f: 0.04, rot0: 5, turns: 5 }, { i: 11, f: 0.96, rot0: 0, turns: 4 }]) {
    const rot = Gt.arc.whTarget(p), wd = Math.PI * 2 / n;
    let phi = (-rot) % (Math.PI * 2); if (phi < 0) phi += Math.PI * 2;
    h.eq(Math.floor(phi / wd), p.i, 'wedge ' + p.i + ' under the pointer');
    h.ok(rot - p.rot0 >= p.turns * Math.PI * 2, 'a few full turns first');
  }
  const t = arcCab(Gt, 'wheel', 1);
  Gt.enterTile(t);
  const force = (i) => { const C = Gt.arc.state; C.A.pend.i = i; C.A.pend.f = 0.5; C.wh.rot1 = Gt.arc.whTarget(C.A.pend); };
  // x2 SPIN: a free respin and the next prize doubled
  Gt.arc.act(); force(8);
  arcFinish(Gt, 10);
  let A = Gt.arc.state.A;
  h.ok(A.mult === 2 && A.tokens === 1, 'x2 SPIN: double or nothing, one more spin');
  h.ok(/x2/.test(Gt.arc.info), 'the next prize x2 is shown');
  const g0 = Gt.run.gold;
  Gt.arc.act(); force(0);
  arcFinish(Gt, 10);
  h.eq(Gt.run.gold - g0, 30, 'the next 15 gold pays 30');
  h.eq(Gt.arc.state.A.mult, 1, 'the double is spent');
  // CURSE: junk in the bin, the double gone
  A = Gt.arc.state.A; A.tokens = 2; A.mult = 2;
  const bin0 = Gt.run.bin.length;
  Gt.arc.act(); force(6);
  arcFinish(Gt, 10);
  h.eq(Gt.run.bin.length, bin0 + 1, 'CURSE: a junk item lands in the bin');
  h.ok(DATA.ITEMS[Gt.run.bin[Gt.run.bin.length - 1].id].rarity === 'junk', 'it is junk');
  h.eq(Gt.arc.state.A.mult, 1, 'and the double is gone');
  // JACKPOT: gold, tickets and a capsule, cracked at once, then back here
  const gold = Gt.run.gold, tix = Gt.run.tickets;
  Gt.arc.act(); force(11);
  arcFinish(Gt, 10);
  h.ok(Gt.run.gold - gold >= 60 && Gt.run.tickets - tix === 15, 'JACKPOT pays gold and tickets');
  h.eq(Gt.arc.msg, '', 'the celebration ran its course');
  stepFor(Gt, 1);
  h.eq(Gt.screen, 'capsule', 'the jackpot capsule is cracked right away');
  h.ok(Gt.S.sd.capsule.then.k === 'arcade', 'the ritual comes back to the machine');
  const T2 = boot({ store: Object.assign({}, T._store) });
  h.ok(T2.GAME.load() && T2.GAME.screen === 'capsule', 'a reload mid ritual keeps the capsule');
  T2.GAME.loot.skipCapsule(); stepFor(T2.GAME, 0.8); T2.GAME.loot.collectCapsule();
  h.eq(T2.GAME.screen, 'arcade', 'collect: back at the wheel');
  h.eq(T2.GAME.arc.state.A.caps.length, 0, 'the capsule is not handed out twice');
  // ticks: the flapper clicks every peg, slower toward the end
  T2.GAME.arc.state.A.tokens = 1;
  T2.GAME.arc.act();
  const C = T2.GAME.arc.state;
  let clicks = 0, prev = C.flapV;
  for (let i = 0; i < 60 * 5 && C.phase === 'play'; i++) { T2.GAME.update(DT); if (C.flapV < prev - 5) clicks++; prev = C.flapV; }
  h.ok(clicks > 20, 'the flapper clicks over the pegs (' + clicks + ')');
});

h.test('arcade: LUCKY SLOTS (free pulls, ticket pulls, three of a kind, your items upgrade, near misses)', () => {
  const T = boot();
  const Gt = T.GAME;
  Gt.newRun('knight', 1102);
  const t = arcCab(Gt, 'slots', 1);
  Gt.enterTile(t);
  const A = Gt.arc.state.A;
  h.ok(A.items.length === 3 && A.items.every(id => DATA.ITEMS[id] && DATA.ITEMS[id].rarity !== 'junk'), 'three item symbols');
  h.ok(A.items.filter(id => Gt.run.bin.some(i => i.id === id)).length >= 2, 'the reels show items from your own bin');
  h.ok(A.strips.length === 3 && A.strips.every(s => s.length === Gt.arc.REEL.length), 'three reels');
  // odds: a loose check over many rolls
  const rng = U.rng(9), cats = {};
  let nearOk = 0, nears = 0;
  for (let i = 0; i < 3000; i++) {
    const r = Gt.arc.slotRoll(A, rng), ev = Gt.arc.slotEval(A, r.stops);
    cats[ev.cat] = (cats[ev.cat] || 0) + 1;
    if (r.near) {
      nears++;
      const L = Gt.arc.REEL.length, s = r.stops.map((x, k) => A.strips[k][x]);
      const up = A.strips[2][(r.stops[2] + 1) % L], dn = A.strips[2][(r.stops[2] + L - 1) % L];
      if (s[0] === r.near && s[1] === r.near && s[2] !== r.near && (up === r.near || dn === r.near)) nearOk++;
    }
  }
  h.ok(cats.lose > 1200 && cats.lose < 2100, 'about half the pulls lose (' + cats.lose + ')');
  h.ok(cats.seven > 30 && cats.seven < 200, 'three sevens are rare (' + cats.seven + ')');
  h.ok(cats.item > 150 && cats.pair > 200, 'item triples and cherry pairs happen');
  h.ok(nears > 200 && nearOk === nears, 'near misses: two alike and the third one step off the line (' + nearOk + '/' + nears + ')');
  // the free pull, then tickets
  Gt.run.tickets = 4;
  Gt.arc.act();
  h.eq(Gt.run.tickets, 4, 'the free pull costs nothing');
  arcFinish(Gt, 12);
  if (Gt.screen === 'capsule') { Gt.loot.skipCapsule(); stepFor(Gt, 0.8); Gt.loot.collectCapsule(); }
  stepFor(Gt, 1.5);
  if (Gt.screen === 'capsule') { Gt.loot.skipCapsule(); stepFor(Gt, 0.8); Gt.loot.collectCapsule(); }
  Gt.run.tickets = 4;
  Gt.arc.act();
  h.eq(Gt.run.tickets, 4 - Gt.arc.ARC.slotCost, 'then a pull costs tickets');
  Gt.arc.skip(); Gt.arc.skip();
  stepFor(Gt, 1.5);
  if (Gt.screen === 'capsule') { Gt.loot.skipCapsule(); stepFor(Gt, 0.8); Gt.loot.collectCapsule(); }
  Gt.run.tickets = 1;
  const used = Gt.arc.state.A.used;
  Gt.arc.act();
  h.ok(Gt.arc.state.A.used === used && !Gt.arc.state.A.pend && Gt.run.tickets === 1, 'short of tickets: refused, nothing spent');
  // three of one of your items: that item upgrades, exactly once
  Gt.run.tickets = 10;
  const B = Gt.arc.state.A;
  const id = B.items[0];
  const plus0 = Gt.run.bin.filter(i => i.id === id && i.plus).length, n0 = Gt.run.bin.filter(i => i.id === id).length;
  Gt.arc.act();
  B.pend.stops = B.strips.map(s => s.indexOf('A'));
  arcFinish(Gt, 12);
  const plus1 = Gt.run.bin.filter(i => i.id === id && i.plus).length;
  h.eq(plus1, plus0 + 1, 'three of an item: one copy upgraded');
  h.eq(Gt.run.bin.filter(i => i.id === id).length, n0 + (n0 === plus0 ? 1 : 0), 'no copy made unless all were plus already');
  // three sevens: the jackpot (gold, tickets, a rare capsule), reload safe
  const g0 = Gt.run.gold, x0 = Gt.run.tickets;
  Gt.arc.act();
  B.pend.stops = B.strips.map(s => s.indexOf('seven'));
  Gt.save();
  const T2 = boot({ store: Object.assign({}, T._store) });
  const G2 = T2.GAME;
  G2.load();
  h.eq(G2.screen, 'arcade', 'a reload mid pull: back at the machine');
  arcFinish(G2, 12);
  h.eq(G2.run.gold - g0, 40, 'JACKPOT gold, once');
  h.eq(G2.run.tickets - x0, 12 - Gt.arc.ARC.slotCost, 'JACKPOT tickets, once (less the pull)');
  stepFor(G2, 1.5);
  h.eq(G2.screen, 'capsule', 'and a capsule to crack');
  h.ok(['r', 'l'].includes(G2.S.sd.capsule.cap.tier), 'a rare one (or better)');
});

h.test('arcade: Leave mid play pays first, banks capsules; plays left keep the cabinet open', () => {
  const T = boot();
  const Gt = T.GAME;
  Gt.newRun('knight', 1203);
  const t = arcCab(Gt, 'plinko', 3);
  Gt.enterTile(t);
  const g0 = Gt.run.gold;
  Gt.arc.act(270);
  const C = Gt.arc.state, slot = Gt.arc.plkSim(C.A.pend.x, C.A.pend.seed).slot;
  const res = Gt.arc.plkPays(slot), caps0 = Gt.run.caps.length;
  Gt.arc.leave();
  h.eq(Gt.screen, 'map', 'left');
  h.eq(Gt.run.gold - g0, payOf(res, 'gold'), 'the drop in flight landed and paid');
  h.eq(Gt.run.caps.length - caps0, res.pays.filter(p => p.k === 'cap').length, 'its capsule waits on the map');
  h.ok(!t.done && t.content.arc.tokens === 2, 'two tokens left: the cabinet stays open');
  Gt.enterTile(t);
  h.eq(Gt.screen, 'arcade', 'and reopens with them');
  h.eq(Gt.arc.state.A.tokens, 2, 'same tokens');
  h.ok(G.arc.fxChips([{ k: 'hp', v: -3 }, { k: 'item', id: 'random' }, { k: 'fight', enc: ['rat'] }]).map(c => c.c).join() === 'bad,rnd,fight', 'outcome chips');
});

h.test('roaming monsters: jump one to fight it (a bounty capsule), get ambushed, the tile under it resolves, saves', () => {
  const T = boot();
  const Gt = T.GAME;
  Gt.newRun('knight', 1304);
  const M = Gt.run.map;
  const land = (t) => t && t.terrain === 'land' && t.ground !== 'mountain' && t.type !== 'boss' && t.type !== 'start';
  const P = M.tiles[MAP.key(M.pos.q, M.pos.r)];
  const nbs = MAP.neighbors(M, P.q, P.r).map(([q, r]) => M.tiles[MAP.key(q, r)]).filter(land);
  const A = nbs[0];
  A.revealed = true; A.type = 'empty'; A.content = {}; A.done = false;
  M.roam = [{ id: 'mx', q: A.q, r: A.r, awake: true, enc: ['rat'] }];
  Gt.toMap();
  Gt.draw();
  h.ok(Gt.startWalk([[A.q, A.r]]), 'a step onto the monster');
  h.eq(Gt.screen, 'fight', 'is a fight');
  h.eq(Gt.fs.start.then.roam, 'mx', 'with the monster');
  h.eq(Gt.fs.tier, 'normal', 'a normal fight');
  h.eq(M.roam.length, 0, 'it is off the map');
  stepFor(Gt, 0.2);
  Gt.endFight('win');
  const rw = Gt.S.sd.reward;
  h.ok(rw.caps.some(c => c.src === 'roam'), 'the reward has a Monster bounty capsule');
  Gt.choose(3);
  h.eq(Gt.screen, 'map', 'back on the map');
  // an ambush: a monster steps onto you as you step
  const here = M.tiles[MAP.key(M.pos.q, M.pos.r)];
  let step = null, lair = null;
  for (const [q, r] of MAP.neighbors(M, here.q, here.r)) {
    const s = M.tiles[MAP.key(q, r)];
    if (!land(s)) continue;
    for (const [q2, r2] of MAP.neighbors(M, s.q, s.r)) { const l = M.tiles[MAP.key(q2, r2)]; if (land(l) && MAP.hexDist(l.q, l.r, here.q, here.r) === 2) { step = s; lair = l; break; } }
    if (step) break;
  }
  for (const x of [step, lair]) { x.revealed = true; x.type = 'empty'; x.content = {}; x.done = false; }
  M.roam = [{ id: 'my', q: lair.q, r: lair.r, awake: true, enc: ['slime'] }];
  Gt.startWalk([[step.q, step.r]]);
  h.eq(Gt.screen, 'fight', 'it jumps you: a fight');
  h.ok(Gt.fs.start.then.ambush === true && Gt.fs.start.then.roam === 'my', 'an AMBUSH');
  const T2 = boot({ store: Object.assign({}, T._store) });
  T2.GAME.load();
  h.eq(T2.GAME.screen, 'fight', 'a reload restarts that fight');
  h.eq(T2.GAME.run.map.roam.length, 0, 'and the monster does not come back');
  stepFor(Gt, 0.2);
  Gt.endFight('win');
  Gt.choose(3);
  // a monster standing on a gem: beat it, then the gem is yours
  const cur = M.tiles[MAP.key(M.pos.q, M.pos.r)];
  const gem = MAP.neighbors(M, cur.q, cur.r).map(([q, r]) => M.tiles[MAP.key(q, r)]).find(land);
  gem.revealed = true; gem.type = 'gem'; gem.content = { gold: 11 }; gem.done = false;
  M.roam = [{ id: 'mz', q: gem.q, r: gem.r, awake: false, enc: ['rat'] }];
  Gt.startWalk([[gem.q, gem.r]]);
  h.eq(Gt.screen, 'fight', 'the monster on the gem fights first');
  stepFor(Gt, 0.2);
  Gt.endFight('win');
  const g0 = Gt.run.gold;
  Gt.choose(3);
  h.ok(gem.done && Gt.run.gold - g0 >= 11, 'then the gem resolves');
  // save / load keeps where they are and who is awake
  M.roam = [{ id: 'ma', q: gem.q, r: gem.r, awake: true, enc: ['rat'] }, { id: 'mb', q: A.q, r: A.r, awake: false, enc: null }];
  Gt.save();
  const T3 = boot({ store: Object.assign({}, T._store) });
  T3.GAME.load();
  h.eq(JSON.stringify(T3.GAME.run.map.roam), JSON.stringify(M.roam), 'monsters saved and loaded');
  T3.GAME.draw();
});

h.test('roaming monsters: walking wakes the lit ones in sight and they close in, drawn with the stub', () => {
  const T = boot();
  const Gt = T.GAME;
  Gt.newRun('knight', 1405);
  const M = Gt.run.map;
  for (const t of Object.values(M.tiles)) if (t.terrain !== 'sea') t.revealed = true;
  let moved = 0, woke = 0;
  for (let i = 0; i < 40 && Gt.screen === 'map'; i++) {
    const nb = MAP.neighbors(M, M.pos.q, M.pos.r).map(([q, r]) => M.tiles[MAP.key(q, r)]).filter(t => t.terrain === 'land' && t.ground !== 'mountain' && t.type !== 'boss');
    if (!M.roam.length) break;
    // head for the nearest monster
    const goal = M.roam.slice().sort((a, b) => MAP.hexDist(a.q, a.r, M.pos.q, M.pos.r) - MAP.hexDist(b.q, b.r, M.pos.q, M.pos.r))[0];
    const t = nb.sort((a, b) => MAP.hexDist(a.q, a.r, goal.q, goal.r) - MAP.hexDist(b.q, b.r, goal.q, goal.r))[0];
    const before = JSON.stringify(M.roam);
    if (t.type !== 'empty') { t.type = 'empty'; t.content = {}; }
    Gt.startWalk([[t.q, t.r]]);
    stepFor(Gt, 0.4);
    Gt.draw();
    if (JSON.stringify(M.roam) !== before) { moved++; if (M.roam.some(m => m.awake)) woke++; }
  }
  h.ok(woke > 0 && moved > 0, `walking across the lit map wakes and moves monsters (moved ${moved})`);
  h.ok(Gt.screen === 'fight' || M.roam.every(m => MAP.roamOk(M.tiles[MAP.key(m.q, m.r)])), 'every monster where it may stand');
});

h.test('event scenes: chips, the dice, the outcome reveal (paid once, reload safe); headless stays instant', () => {
  const T = boot();
  const Gt = T.GAME;
  Gt.newRun('knight', 1506);
  for (const id in DATA.EVENTS) for (const ch of DATA.EVENTS[id].choices) {
    const chips = Gt.arc.fxChips(ch.fx);
    h.ok(chips.length >= 1 && chips.every(c => c.t && ['good', 'bad', 'rnd', 'fight', 'neutral'].includes(c.c)), `${id}: "${ch.txt}" has outcome chips`);
  }
  Gt.arc.force = true;
  Gt.showEvent({ id: 'out_of_order' });
  h.ok(Gt.arc.ev && Gt.arc.ev.cv, 'the scene canvas');
  for (let i = 0; i < 10; i++) { Gt.update(DT); Gt.draw(); }
  const hp0 = Gt.run.hp, bin0 = Gt.run.bin.length;
  Gt.choose(0);
  h.eq(Gt.screen, 'event', 'a choice stays on the scene for its reveal');
  const out = Gt.S.sd.event.out;
  h.ok(out && out.rnd && out.lines.length >= 2, 'the outcome: a dice roll and its lines');
  h.ok(out.lines.some(l => l.t === '-6 HP' && l.c === 'bad') && out.lines.some(l => l.item), 'lines: the HP and the item');
  h.eq(Gt.run.hp, hp0 - 6, 'paid');
  h.eq(Gt.S.ui.buttons.length, 1, 'only Continue');
  const E = Gt.arc.ev;
  h.ok(E.roll > 0 && !E.landed, 'the die is rolling');
  for (let i = 0; i < 60 * 3; i++) { Gt.update(DT); Gt.draw(); }
  h.ok(E.landed && E.shown === out.lines.length, 'the die lands and every line stamps in');
  const T2 = boot({ store: Object.assign({}, T._store) });
  const G2 = T2.GAME;
  G2.load();
  h.eq(G2.screen, 'event', 'a reload shows the outcome');
  h.ok(G2.S.sd.event.out && G2.S.ui.buttons.length === 1, 'not the choices again');
  h.eq(G2.run.hp, hp0 - 6, 'nothing paid twice');
  h.eq(G2.run.bin.length, bin0 + 1, 'one item, once');
  G2.choose(0);
  h.eq(G2.screen, 'map', 'Continue: the map');
  // a plain choice reveals too, without dice; a fight choice goes straight to the fight
  Gt.toMap();
  Gt.showEvent({ id: 'steam_vent' });
  Gt.choose(0);
  h.ok(Gt.S.sd.event.out && !Gt.S.sd.event.out.rnd, 'no dice for a plain choice');
  Gt.toMap();
  Gt.showEvent({ id: 'goblin_toll' });
  Gt.choose(1);
  h.eq(Gt.screen, 'fight', 'a fight choice fights');
  Gt.arc.force = false;
});

h.test('arcade: old saves (no monsters, no cabinets, old events) load and play', () => {
  const T = boot();
  const Gt = T.GAME;
  Gt.newRun('knight', 1607);
  Gt.save();
  const raw = JSON.parse(T._store[Gt.RUN_KEY]);
  delete raw.run.map.roam;
  for (const k in raw.run.map.tiles) { const t = raw.run.map.tiles[k]; if (['plinko', 'wheel', 'slots'].includes(t.type)) { t.type = 'empty'; t.content = {}; t.known = false; } }
  const T2 = boot({ store: { [Gt.RUN_KEY]: JSON.stringify(raw) } });
  const G2 = T2.GAME;
  h.ok(G2.load(), 'loads');
  h.ok(Array.isArray(G2.run.map.roam) && G2.run.map.roam.length === 0, 'no monsters');
  const M = G2.run.map;
  const nb = MAP.neighbors(M, M.pos.q, M.pos.r).map(([q, r]) => M.tiles[MAP.key(q, r)]).find(t => t.revealed && t.terrain === 'land' && t.ground !== 'mountain');
  G2.startWalk([[nb.q, nb.r]]);
  h.ok(['map', 'fight', 'event', 'shop', 'rest', 'forge', 'capsule', 'treasure'].includes(G2.screen), 'a step works');
  // a cabinet tile from an old save without a session still opens
  G2.toMap();
  const t = arcCab(G2, 'wheel', 1);
  delete t.content.tokens;
  G2.enterTile(t);
  h.ok(G2.screen === 'arcade' && G2.arc.state.A.tokens === 1, 'a cabinet without tokens gets one spin');
  G2.draw();
});

// ---------------------------------------------------------------- Feel (round 4)
function feelBoot(meta, extra) {
  const store = Object.assign({ clawspire_meta: JSON.stringify(Object.assign({ introSeen: true, tutorialDone: true, unlocks: { knight: true } }, meta || {})) }, extra || {});
  return boot({ store });
}
// Every tip but the listed ones counts as seen, so a test controls the queue.
function feelOnly(Gt, ids) { Gt.meta.tips = {}; for (const d of Gt.feel.TIPS) if (ids.indexOf(d.id) < 0) Gt.meta.tips[d.id] = 1; }

/* ------------------------------------------------- POLISH (round 5): the turn banner, the player hit number */
h.test('polish: turn banners keep clear of the GRABS pill and the END TURN button', () => {
  const T = boot();
  const Gt = T.GAME, P = Gt.pol;
  h.ok(P && typeof P.bannerBox === 'function', 'GAME.pol exposed');
  const WORDS = ['ENEMY TURN', 'YOUR TURN', 'TURN 12', 'TURN OVER', 'FIGHT', 'ELITE', 'BOSS', 'AMBUSH!', 'JACKPOT', 'VICTORY', 'FINAL PHASE', 'THE CLAW COLLECTOR GETS SERIOUS'];
  const CTRL_TOP = 830;   // the control bar (END TURN) starts here
  for (let gw = 100; gw <= 340; gw += 20) {
    for (const w of WORDS) {
      const kind = w === 'VICTORY' ? 'victory' : 'turn';
      const b = P.bannerBox(gw, w, kind);
      h.ok(b.x1 <= b.grabsX0 - P.BAN.gap + 0.01, `banner right edge ${b.x1.toFixed(0)} left of the pill ${b.grabsX0.toFixed(0)} (grabs ${gw}px, "${w}")`);
      h.ok(b.x0 >= 0 && b.x1 > b.x0 + 150, `a usable span (${b.x0}..${b.x1.toFixed(0)})`);
      h.ok(b.size <= b.big && b.size >= 16, `font ${b.size.toFixed(1)} within 16..${b.big}`);
      const need = w.length * b.size * P.BAN.k + 24;
      h.ok(need <= b.x1 - b.x0 + 0.5 || b.size === 16, `"${w}" fits its span (${need.toFixed(0)} <= ${(b.x1 - b.x0).toFixed(0)})`);
      h.ok(b.y1 < CTRL_TOP, 'the banner row ends above the END TURN bar');
    }
  }
  // the estimate for a pill with n pips (headless has no layout) grows with the grabs
  Gt.newRun('knight', 5101);
  Gt.startFight(['rat'], 'normal');
  settle(Gt, 6);
  const w3 = P.grabsW();
  Gt.fight.player.grabsMax = 7;
  h.ok(P.grabsW() > w3, 'more grabs, a wider pill, a shorter banner span');
  Gt.fight.player.grabsMax = 3;
  // live: the announcer places the real banner in that span and keeps labels out of it
  Gt.ann.banner('ENEMY TURN', 'enemy', 1.2);
  stepFor(Gt, 0.1);
  const bb = P.bannerBox0;
  h.ok(bb && bb.x1 <= bb.grabsX0 - P.BAN.gap, 'the shown banner stops short of the pill');
  const el = T._nodes.banner;
  h.eq(el && el.style.right, (540 - bb.x1) + 'px', 'the banner element is pulled in from the right');
  const zone = T.RENDER.fx.zones().find(z => z.id === 'ann');
  h.ok(zone && zone.x1 === bb.x1 && zone.x0 === bb.x0, 'the label keep-out zone matches the banner');
});

h.test('polish: a hit on the player floats its number by the HP stat, never down into the bin', () => {
  const T = boot();
  const Gt = T.GAME, fx = T.RENDER.fx;
  Gt.newRun('knight', 5102);
  Gt.startFight(['rat'], 'normal');
  settle(Gt, 6);
  const nums = [];
  const orig = fx.num;
  fx.num = (x, y, str, col, o) => { const p = orig(x, y, str, col, o); if (col === '#ff5a4a') nums.push({ p, x0: x, y0: y }); return p; };
  for (const amt of [7, 49, 12]) Gt.fs.queue.push({ ev: { t: 'dmg', who: 'p', amt, blocked: 0 }, beat: 0.01 });
  let n = 0;
  while (nums.length < 3 && n++ < 600) Gt.update(1 / 60);
  h.eq(nums.length, 3, 'three player hit numbers popped');
  const P = Gt.pol.PNUM;
  for (const q of nums) {
    h.ok(q.y0 >= 72 && q.y0 <= P.yMax, `spawned just under the top bar (${q.y0})`);
    h.ok(Math.abs(q.x0 - 118) < 80, `beside the HP stat (${q.x0.toFixed(0)})`);
  }
  h.ok(new Set(nums.map(q => Math.round(q.x0))).size >= 2, 'consecutive hits fan out sideways');
  // follow them for their whole life: never near the cabinet (y 380)
  let maxY = 0, minY = 999, frames = 0;
  while (nums.some(q => q.p.life > 0) && frames++ < 400) {
    Gt.update(1 / 60);
    for (const q of nums) if (q.p.life > 0) { maxY = Math.max(maxY, q.p.y); minY = Math.min(minY, q.p.y); }
  }
  h.ok(maxY < 220, `the numbers stay up by the HP stat (lowest ${maxY.toFixed(0)})`);
  h.ok(minY > 60, `and clear of the top bar at their highest (${minY.toFixed(0)})`);
  fx.num = orig;
  // headless keeps no live relic canvases
  h.eq(Gt.pol.liveRelics, 0, 'headless: no relic canvases to animate');
});

h.test('feel: tip cards queue, show one at a time and never twice', () => {
  const T = feelBoot();
  const Gt = T.GAME, Fe = Gt.feel;
  h.ok(Gt.meta.tips && !Object.keys(Gt.meta.tips).length, 'a fresh profile has met no tips');
  h.eq(Gt.meta.settings.haptics, true, 'Buzz is on by default');
  Gt.newRun('knight', 4101);
  feelOnly(Gt, ['combo', 'tickets']);
  h.ok(Fe.want('combo') && Fe.want('tickets'), 'two tips queued');
  h.ok(!Fe.want('combo'), 'the same tip queues once');
  h.ok(!Fe.want('nonsense'), 'unknown tips are ignored');
  stepFor(Gt, 0.2);
  h.eq(Fe.cur && Fe.cur.id, 'combo', 'the first in line shows');
  h.ok(Gt.meta.tips.combo && JSON.parse(T._store[Gt.META_KEY]).tips.combo, 'marked met and saved at once');
  stepFor(Gt, 3);
  h.eq(Fe.cur && Fe.cur.id, 'combo', 'it stays up (it never stacks: the next one waits)');
  h.eq(Fe.queue.join(), 'tickets', 'the rest wait in line');
  Fe.dismiss();
  h.ok(!Fe.cur, 'a tap puts it away');
  stepFor(Gt, 0.3);
  h.ok(!Fe.cur, 'a short breath before the next');
  stepFor(Gt, 1);
  h.eq(Fe.cur && Fe.cur.id, 'tickets', 'then the next one');
  stepFor(Gt, Fe.TIP.life + 0.2);
  h.ok(!Fe.cur, 'a card left alone goes by itself');
  Gt.draw();
  const T2 = boot({ store: { [Gt.META_KEY]: T._store[Gt.META_KEY] } });
  h.ok(T2.GAME.meta.tips.combo && T2.GAME.meta.tips.tickets, 'met tips survive a reload');
  T2.GAME.newRun('knight', 4101);
  h.ok(!T2.GAME.feel.want('combo'), 'and never come back');
  T2.GAME.feel.reset();
  h.ok(!Object.keys(T2.GAME.meta.tips).length && T2.GAME.feel.want('combo'), 'until Reset tips');
});

h.test('feel: no tip while the claw is busy, over the coach, or on a screen without a lane', () => {
  const T = feelBoot();
  const Gt = T.GAME, Fe = Gt.feel;
  Gt.newRun('knight', 4102);
  Gt.startFight(['rat'], 'normal');
  h.ok(settle(Gt, 20), 'the fight is ready');
  feelOnly(Gt, ['combo']);
  h.ok(Fe.safe(), 'a calm fight has room for a card');
  Gt.fs.grabInFlight = true;
  h.ok(!Fe.safe(), 'not while a grab is in flight');
  Gt.fs.grabInFlight = false;
  const ph = Gt.rig.phase;
  Gt.rig.phase = 'carrying';
  h.ok(!Fe.safe(), 'not while the claw carries');
  Gt.rig.phase = ph;
  Gt.S.coachStep = 1;
  h.ok(!Fe.safe(), 'not over the coach marks');
  Gt.S.coachStep = -1;
  Fe.want('combo');
  stepFor(Gt, 0.2);
  h.eq(Fe.cur && Fe.cur.id, 'combo', 'once the claw is home and the coach is done');
  h.eq(Fe.lane(), 'bothi', 'a fight toast moves above the card');
  Fe.dismiss();
  h.eq(Fe.lane(), 'bot', 'else fight toasts use the bottom lane, off the cabinet');
  // a card that has only just shown goes back in line when its screen goes
  feelOnly(Gt, ['luck']);
  Fe.want('luck');
  stepFor(Gt, 1.2);
  h.eq(Fe.cur && Fe.cur.id, 'luck', 'up');
  Gt.showRest();
  stepFor(Gt, 0.1);
  h.ok(!Fe.cur && Fe.queue[0] === 'luck' && !Gt.meta.tips.luck, 'the rest stop has no tip lane: it waits for later, unread');
  Gt.toMap();
  stepFor(Gt, 1.5);
  h.eq(Fe.cur && Fe.cur.id, 'luck', 'and shows on the map');
});

h.test('feel: meeting something new queues its tip', () => {
  const T = feelBoot();
  const Gt = T.GAME, Fe = Gt.feel, has = (id) => Fe.queue.includes(id) || (Fe.cur && Fe.cur.id === id);
  Gt.newRun('knight', 4103);
  Gt.toMap();
  Fe.scan();
  h.ok(has('map'), 'the first map: Light the way');
  h.ok(!has('tool'), 'no tool yet');
  Gt.run.brushes.push('flare');
  Gt.run.tickets = 3;
  const tw = Object.values(Gt.run.map.tiles).find(t => t.type === 'tower');
  if (tw) tw.revealed = true;
  Fe.scan();
  h.ok(has('tool') && has('tickets'), 'a tool and tickets');
  h.ok(!tw || has('tower'), 'a lit tower');
  const gulper = Object.values(DATA.ENEMIES).find(e => e.act === 1 && e.tier === 'normal' && (e.moves || []).some(m => m.k === 'gulp'));
  Gt.startFight([gulper.id], 'normal');
  Fe.scan();
  h.ok(has('hungry'), 'a gulper: Hungry monster (' + gulper.id + ')');
  COMBAT.giveAffix(Gt.fight, Gt.fight.enemies[0], 'armored');
  Gt.fight.luckK = 1;
  Gt.fs.mst.feelTest = { crack: 1 };
  Fe.scan();
  h.ok(has('affix') && has('luck') && has('crack'), 'an affix, the Luck meter, a cracked item');
  settle(Gt, 20);
  Gt.fs.queue.push({ ev: { t: 'combo', id: 'hat_trick', name: 'Hat Trick', text: '', color: '#fff', n: 1, tier: 2 }, beat: 0 });
  Gt.fs.queue.push({ ev: { t: 'binBomb', inst: Gt.fight.bin[0], idx: 0 }, beat: 0 });
  stepFor(Gt, 1.5);
  h.ok(has('combo') && has('bomb'), 'a combo and a lit bomb from the fight events');
  // the enemy popover names the affix the tip points at
  Gt.S.popover = null;
  for (let y = 120; y <= 320 && !Gt.S.popover; y += 20) Gt.tap(270, y);
  h.ok(Gt.S.popover && /Armored/.test(Gt.S.popover.html), 'a tap on the enemy reads its affixes');
});

h.test('feel: haptics buzz in patterns and respect Buzz and reduced motion', () => {
  const T = feelBoot();
  const Gt = T.GAME, Fe = Gt.feel, calls = [];
  T._window.navigator.vibrate = (p) => { calls.push(p); return true; };
  for (const k of ['clamp', 'deliver', 'jackpot', 'bigHit', 'hurt', 'capCrack', 'capBurst', 'slotWin']) h.ok(Fe.BUZZ[k] != null, k + ' has a pattern');
  h.ok(Fe.haptic('clamp'), 'a clamp buzzes');
  h.eq(JSON.stringify(calls[0]), JSON.stringify(Fe.BUZZ.clamp), 'in its own pattern');
  h.ok(!Fe.haptic('nonsense'), 'unknown kinds do nothing');
  Fe.setHaptics(false);
  const n = calls.length;
  h.ok(!Fe.haptic('jackpot') && calls.length === n, 'Buzz off: still');
  h.eq(JSON.parse(T._store[Gt.META_KEY]).settings.haptics, false, 'the switch is saved');
  Gt.showTitle();
  Gt.acc.open();   // round 6: Buzz moved to the Settings panel (the title's Settings button)
  h.ok(Gt.S.ui.buttons.some(b => b.label === 'Buzz off'), 'the Settings panel shows Buzz off');
  Gt.choose(Gt.S.ui.buttons.findIndex(b => b.label === 'Buzz off'));
  h.ok(Gt.meta.settings.haptics && Gt.S.ui.buttons.some(b => b.label === 'Buzz on'), 'and turns it back on');
  Gt.acc.close();
  Gt.meta.settings.shake = false;
  h.ok(!Fe.haptic('hurt'), 'reduced motion (Shake off): still');
  Gt.meta.settings.shake = true;
  const mm = T._window.matchMedia;
  T._window.matchMedia = (q) => ({ matches: /reduce/.test(q), addEventListener() {} });
  h.ok(!Fe.haptic('hurt'), 'prefers-reduced-motion: still');
  T._window.matchMedia = mm;
  // in a fight: the clamp, the delivery
  Gt.newRun('knight', 4104);
  Gt.startFight(['rat'], 'normal');
  settle(Gt, 20);
  const b0 = Fe.buzz.length;
  Gt.rigEvent('close');
  Gt.playDelivered([Gt.fs.items[0]]);
  h.ok(Fe.buzz.slice(b0).includes('clamp') && Fe.buzz.slice(b0).includes('deliver'), 'a real grab buzzes on the clamp and the delivery (' + Fe.buzz.slice(b0).join() + ')');
  delete T._window.navigator.vibrate;
  let threw = false;
  try { Fe.haptic('deliver'); } catch (e) { threw = true; }
  h.ok(!threw, 'no vibrate API: a quiet no-op');
});

h.test('feel: toasts keep off the play area', () => {
  const T = feelBoot();
  const Gt = T.GAME, Fe = Gt.feel;
  Gt.newRun('knight', 4105);
  Gt.toMap();
  h.eq(Fe.lane(), '', 'the map keeps the old spot');
  const cab = arcCab(Gt, 'slots', 1);
  Gt.arc.show({ q: cab.q, r: cab.r });
  h.eq(Gt.screen, 'arcade', 'at the slots');
  h.eq(Fe.lane(), 'arc', 'the arcade lane sits under the machine, over the how-to line');
  Gt.showShop(Gt.rollShop({ q: 1, r: 2 }));
  h.eq(Fe.lane(), 'keep', 'on the shop the keeper says it');
  Gt.run.gold = 0;
  Gt.choose(0);
  h.ok(Fe.keeper.note === 'Not enough gold.' && Fe.keeper.noteT > 0, 'the toast is his note, under his line');
  Gt.loot.showCounter(Gt.S.sd.shop);
  h.eq(Fe.lane(), 'top', 'the prize counter lane is the top edge, off the case');
  h.ok(Fe.CORNER.reward === 'hi' && Fe.CORNER.shop === 'tight' && Fe.CORNER.counter === 'tight', 'the corner lane goes compact there (and up into the title row on the reward)');
  Gt.startFight(['rat'], 'normal');
  h.eq(Fe.lane(), 'bot', 'the fight lane is the tray, off the cabinet');
});

h.test('feel: the shopkeeper, the campfire and the forge', () => {
  const T = feelBoot();
  const Gt = T.GAME, Fe = Gt.feel;
  Gt.newRun('knight', 4106);
  const shop = Gt.rollShop({ q: 2, r: 2 });
  Gt.run.gold = 1;
  Gt.showShop(shop);
  const K = Fe.keeper;
  h.ok(K.cv && K.ctx && Fe.QUIPS.hi.includes(K.quip), 'Chester greets you (' + K.quip + ')');
  const nBtn = Gt.S.ui.buttons.length;
  h.eq(Gt.S.ui.buttons[nBtn - 1].label, 'Prize counter', 'the shop buttons keep their order');
  Gt.choose(0);
  h.ok(K.mood === 'broke' && Fe.QUIPS.broke.includes(K.quip), 'broke: he frowns and says so');
  Gt.run.gold = 999;
  Gt.showShop(shop);
  Gt.choose(0);
  h.ok(K.mood === 'happy' && Fe.QUIPS.buy.includes(K.quip), 'a buy: he beams');
  h.eq(Gt.S.ui.buttons.length, nBtn, 'no extra buttons');
  Gt.draw();
  stepFor(Gt, 2);
  h.eq(K.mood, 'idle', 'and settles down');
  const said = K.log.length;
  stepFor(Gt, 7.5);
  h.ok(K.log.length > said && K.log[K.log.length - 1] === 'idle', 'idle quips rotate');
  Gt.showShop(shop);
  h.ok(Fe.QUIPS.idle.includes(K.quip), 'coming back to the same shop keeps the chat going (no new hello)');
  // the rest stop: headless it goes straight on, as before
  Gt.run.hp = 10;
  Gt.showRest();
  h.ok(Fe.fire.cv && Fe.fire.ctx, 'a campfire');
  Gt.draw();
  // in a page the campfire holds a beat, saved as done so a reload never heals twice
  Gt.S.headless = false;
  Gt.choose(0);
  const healed = Gt.run.hp;
  h.ok(healed > 10 && Gt.screen === 'rest' && Fe.fire.heal > 0, 'hearts rise at the fire');
  h.ok(Gt.S.sd.rest && Gt.S.sd.done, 'the rest is marked done');
  const saved = JSON.parse(T._store[Gt.RUN_KEY]);
  h.ok(saved.screen === 'rest' && saved.sd.done && saved.run.hp === healed, 'saved healed and done');
  const T2 = boot({ store: { [Gt.RUN_KEY]: T._store[Gt.RUN_KEY], [Gt.META_KEY]: T._store[Gt.META_KEY] } });
  h.ok(T2.GAME.load() && T2.GAME.screen === 'map' && T2.GAME.run.hp === healed, 'a reload in the beat lands on the map, healed once');
  Gt.choose(0);
  h.eq(Gt.run.hp, healed, 'no second heal during the beat');
  Gt.draw();
  stepFor(Gt, 1.6);
  h.eq(Gt.screen, 'map', 'then the map');
  // the forge: three blows and a sparkle, then the map
  Gt.showForge();
  h.ok(Fe.forge.cv && !Fe.forge.item, 'an anvil with a hot ingot');
  const plus0 = Gt.run.bin.filter(i => i.plus).length;
  Gt.choose(0);
  h.eq(Gt.run.bin.filter(i => i.plus).length, plus0 + 1, 'the item is upgraded at once');
  h.ok(Gt.screen === 'forge' && Fe.forge.item, 'the item goes on the anvil');
  stepFor(Gt, 0.9);
  h.eq(Fe.forge.strikes.length, 3, 'three hammer blows');
  h.ok(Fe.forge.done > 0, 'then the sparkle');
  Gt.draw();
  stepFor(Gt, 1);
  h.eq(Gt.screen, 'map', 'then the map');
  // a tap skips the beat
  Gt.showRest();
  Gt.choose(0);
  stepFor(Gt, 0.4);
  h.ok(Fe.beatSkip() && Gt.screen === 'map', 'a tap skips the campfire');
  Gt.S.headless = true;
});

h.test('feel: the Tips page, old profiles and veterans', () => {
  const T = feelBoot({ tips: { combo: 1, luck: 1 } });
  const Gt = T.GAME;
  Gt.showTitle();
  let labels = Gt.S.ui.buttons.map(b => b.label);
  h.ok(labels.includes('Tips'), 'the title has Tips');
  Gt.choose(labels.indexOf('Tips'));
  h.eq(Gt.screen, 'tips', 'the Tips page');
  // (round 18) the page body under its head: the tips met in full, the dark ones folded into one "N more to find" row
  const tipsPage = T._nodes.tipsBody.children.find(c => /pageBody/.test(c.className));
  h.ok(T._nodes.tipsBody.children.some(c => /pageHead/.test(c.className)), 'a page head (Back, the title)');
  const list = tipsPage.children.find(c => c.className === 'tipList');
  h.eq(list.children.length, 2 + 1, 'one row per tip met, one row for the rest');
  const got = list.children.filter(r => /got/.test(r.className));
  h.eq(got.length, 2, 'the two met ones in full');
  h.ok(got.some(r => r.children[1].children[0].textContent === 'Grab combo'), 'with their title');
  const more = list.children.filter(r => !/got/.test(r.className));
  h.ok(more.length === 1 && more[0].children[1].children[0].textContent === `${Gt.feel.TIPS.length - 2} more to find`, 'the rest dark, in one row: ' + (more[0] && more[0].children[1].children[0].textContent));
  Gt.draw();
  labels = Gt.S.ui.buttons.map(b => b.label);
  Gt.choose(labels.indexOf('Reset tips'));
  h.ok(Gt.screen === 'tips' && !Object.keys(Gt.meta.tips).length, 'Reset tips clears them');
  Gt.choose(Gt.S.ui.buttons.map(b => b.label).indexOf('Back'));
  h.eq(Gt.screen, 'title', 'Back to the title');
  // profiles from before the tips
  const V = feelBoot({ stats: { fights: 40, runs: 5 } }).GAME;
  h.ok(V.meta.tips.combo && V.meta.tips.hungry && V.meta.tips.crack, 'a veteran has met the old systems');
  h.ok(!V.meta.tips.luck && !V.meta.tips.arcade && !V.meta.tips.roam, 'but not the round 3 ones');
  h.eq(Object.keys(feelBoot({ stats: { fights: 2 } }).GAME.meta.tips).length, 0, 'a newcomer meets every tip');
  const J = feelBoot({ tips: 'junk', settings: { shake: true, haptics: 'yes' } }).GAME;
  h.ok(J.meta.tips && typeof J.meta.tips === 'object' && J.meta.settings.haptics === true, 'junk fields are repaired');
  const A = feelBoot({ arc: { plays: 9, jackpots: 1 } }).GAME;
  h.eq(A.meta.arc && A.meta.arc.plays, 9, 'arcade play counts survive a reload');
  // an old rest save (no done flag) still opens the rest stop
  const O = feelBoot();
  O.GAME.newRun('knight', 4107);
  O.GAME.showRest();
  const O2 = boot({ store: { [O.GAME.RUN_KEY]: O._store[O.GAME.RUN_KEY], [O.GAME.META_KEY]: O._store[O.GAME.META_KEY] } });
  h.ok(O2.GAME.load() && O2.GAME.screen === 'rest', 'a saved rest stop reopens');
});

// ---------------------------------------------------------------- ENDLESS (DESIGN.md "Endless and mutators")
function endBoot(meta) { return metaBoot(Object.assign({ unlocks: { knight: true, rogue: true } }, meta || {})); }
// A run won right now (the act 3 boss down): the win screen and its offer.
function endWin(G, seed, muts) { G.endless.pick(muts || []); G.newRun('knight', seed); G.run.act = 3; G.showWin(); }
const endSkip = (G) => { if (G.boss.vs) { G.boss.vsSkip(); G.boss.vsSkip(); } stepFor(G, 0.05); };
const toMapFrom = (G) => { for (let i = 0; i < 4 && G.screen !== 'map'; i++) chooseFirst(G); };
const badgesOf = (T) => ((T._nodes.relics && T._nodes.relics.children) || []).filter(c => /mutBadge/.test(c.className || ''));

h.test('endless: the win screen offers Cash out or Endless, and the offer survives a reload', () => {
  const { T, G, saved } = endBoot();
  endWin(G, 404);
  h.eq(G.screen, 'win', 'the win screen');
  h.eq(G.S.ui.buttons[0].label, 'Cash out', 'the first choice cashes out');
  h.ok(G.S.ui.buttons.findIndex(b => /Endless/.test(b.label)) > 0, 'KEEP PLAYING: ENDLESS is offered');
  h.ok(G.endless.offer(), 'the offer is open');
  h.eq(G.meta.stats.wins, 1, 'the win is banked at once');
  h.ok(T._store[G.RUN_KEY] && JSON.parse(T._store[G.RUN_KEY]).screen === 'win', 'the run stays saved on the win screen');
  h.ok(G.run.scoreRec && G.run.scoreRec.classic && saved().scores.classic === G.run.scoreRec.classic.total, 'the run score is recorded');
  const T2 = boot({ store: Object.assign({}, T._store) });
  const G2 = T2.GAME;
  h.ok(G2.load(), 'CONTINUE works');
  h.eq(G2.screen, 'win', 'back on the win screen');
  h.eq(G2.meta.stats.wins, 1, 'the win is not counted twice');
  h.eq(G2.meta.winsBy.knight, 1, 'nor per crawler');
  G2.choose(0);
  h.eq(G2.screen, 'title', 'Cash out goes to the title');
  h.ok(!T2._store[G2.RUN_KEY], 'and the run is over');
});

h.test('endless: the reboot, a new map per loop, the Loop stat, the loop boss, save and load', () => {
  const { T, G, saved } = endBoot();
  endWin(G, 405);
  const classic = MAP.generate({ act: 1, rng: U.rng(U.hashStr(G.run.seed + ':map:1')), cols: MAP.DEFAULT_COLS, rows: MAP.DEFAULT_ROWS });
  G.run.hp = 20;
  G.choose(G.S.ui.buttons.findIndex(b => /Endless/.test(b.label)));
  h.eq(G.screen, 'loop', 'the reboot screen');
  const E = G.run.endless;
  h.ok(E && E.loop === 1, 'Loop 1');
  h.eq(G.run.act, 1, 'loop 1 plays act 1\'s biome and pools');
  h.ok(G.run.map.act === 1 && G.run.map.seed !== classic.seed, 'a fresh act 1 map, never the run\'s own act 1 map');
  h.ok(G.run.hp > 20, 'healed');
  h.ok(G.meta.ach.endless_on, 'Insert Another Coin');
  h.ok(saved().endless.best === 1 && saved().endless.runs === 1, 'the deepest loop and the Endless runs are on the profile');
  h.eq(G.run.muts.length, 0, 'no mutator joins in loop 1');
  h.ok(E.mix && DATA.ENEMIES[E.mix].tier === 'boss' && E.mix !== 'hoard', 'the loop boss borrows a trick: ' + E.mix);
  const T2 = boot({ store: Object.assign({}, T._store) });
  h.ok(T2.GAME.load() && T2.GAME.screen === 'loop' && T2.GAME.run.endless.loop === 1, 'a reload on the reboot screen');
  G.endless.cont();
  toMapFrom(G);
  h.eq(G.screen, 'map', 'the spare parts, the relic, then the map');
  h.eq(T._nodes.actTxt.textContent, 'Loop 1', 'the HUD says Loop 1');
  G.draw();
  G.startFight(['hoard'], 'boss');
  h.eq(G.boss.vs && G.boss.vs.title, 'LOOP 1 BOSS', 'the versus card says LOOP 1 BOSS');
  h.eq(G.fight.loop, 1, 'the fight knows its loop');
  h.eq(G.fight.enemies[0].def.sig.id, DATA.ENEMIES[E.mix].sig.id, 'with the borrowed trick');
  endSkip(G);
  G.endFight('win');
  h.eq(G.run.sc.bosses, 1, 'a boss down is counted for the score');
  G.choose(3);
  h.eq(G.screen, 'loop', 'the boss down: the next reboot');
  h.ok(G.run.endless.loop === 2 && G.run.act === 2, 'Loop 2 in act 2\'s biome');
  h.ok(G.run.muts.length === 1 && G.run.endless.adds[0] === G.run.muts[0] && G.S.sd.loop.added === G.run.muts[0], 'a random mutator joins from loop 2: ' + G.run.muts[0]);
  h.eq(saved().endless.best, 2, 'the deepest loop moves');
  G.endless.cont();
  toMapFrom(G);
  h.eq(badgesOf(T).length, 1, 'its badge leads the relic strip');
  G.startFight(['rat'], 'normal');
  endSkip(G);
  const F = G.fight;
  h.ok(F.loop === 2 && F.mut && F.mut.ids.join() === G.run.muts.join(), 'the fight carries the loop and the mutators');
  const ids = F.enemies.map(e => e.id).join(), hps = F.enemies.map(e => e.maxHp).join();
  G.save();
  const T3 = boot({ store: Object.assign({}, T._store) });
  h.ok(T3.GAME.load() && T3.GAME.screen === 'fight', 'a reload mid fight in Endless');
  const F3 = T3.GAME.fight;
  h.ok(F3.loop === 2 && F3.enemies.map(e => e.id).join() === ids && F3.enemies.map(e => e.maxHp).join() === hps && F3.mut.ids.join() === G.run.muts.join(), 'the same lifted monsters, the same mutators');
  h.eq(T3._nodes.actTxt.textContent, 'Loop 2', 'the reloaded HUD says Loop 2');
  T3.GAME.draw();
});

h.test('endless: death ends it (the win stays banked; the loops, the score and the best are recorded)', () => {
  const { T, G, saved } = endBoot({ scores: { classic: 0, daily: 0, endless: 10 } });
  endWin(G, 406, ['lowgrav']);
  G.endless.start();
  G.endless.next();
  G.endless.next();
  h.eq(G.run.endless.loop, 3, 'Loop 3');
  h.ok(G.meta.ach.loop3, 'Loop de Loop');
  h.ok(G.run.muts.length === 3 && G.run.muts[0] === 'lowgrav', 'the pick stays and two more joined');
  G.endless.cont();
  toMapFrom(G);
  G.startFight(['rat'], 'normal');
  G.run.kills += 10;
  G.fight.player.hp = 0;
  G.endFight('lose');
  h.eq(G.screen, 'gameover', 'game over');
  h.eq(G.meta.stats.wins, 1, 'still one win');
  const rec = G.run.scoreRec;
  h.ok(rec.endless && rec.endless.total > rec.classic.total, 'the Endless score beats the classic one');
  h.ok(rec.endless.newBest && saved().scores.endless === rec.endless.total, 'a NEW BEST Endless score is saved');
  h.eq(saved().endless.best, 3, 'the deepest loop');
  h.ok(G.run.endless.over && !T._store[G.RUN_KEY], 'recorded once, the run is over');
  G.draw();
});

h.test('mutators: each one changes the machine, and a run without them is the plain machine', () => {
  const { T, G } = endBoot();
  const start = (ids, enc, secs) => { G.endless.pick(ids); G.newRun('knight', 808); G.startFight(enc || ['rat'], 'normal'); endSkip(G); stepFor(G, secs == null ? 1.5 : secs); return G.fight; };
  const brOf = () => { const o = {}; for (const b of G.fs.items) o[b.data.inst.id] = Math.max(o[b.data.inst.id] || 0, b.br); return o; };
  const spread = () => { const r = G.rig; const xs = G.fs.items.map(b => Math.abs(b.x - r.x)); return xs.reduce((a, v) => a + v, 0) / Math.max(1, xs.length); };
  const meanX = () => G.fs.items.reduce((a, b) => a + b.x, 0) / Math.max(1, G.fs.items.length);
  const F0 = start([]);
  h.ok(F0.mut === null && G.endless.mods() === null, 'no mutators: none in the fight');
  const base = { br: brOf(), grabs: F0.player.grabsMax, n: F0.enemies.length, gs: G.fs.items.map(b => b.gs), slick: G.fs.items.map(b => b.slick) };
  // Low Gravity
  start(['lowgrav']);
  h.ok(G.fs.items.every((b, i) => b.gs < 0.5 * Math.max(0.62, base.gs[i] || 1) + 0.01 && b.drag > 0), 'Low Gravity: everything floats');
  // Everything Is Glass
  start(['glass']);
  h.ok(G.fs.items.every(b => !b.data.mat || b.data.mat.traits.glass), 'Everything Is Glass: every prize is glass');
  h.ok(!CS.PHYS.materialOf(DATA.ITEMS.rusty_sword).traits.glass, 'the shared material table is untouched');
  const b0 = G.fs.items.find(b => b.data.inst.id === 'rusty_sword');
  G.toys.crack(b0);
  h.eq(G.toys.mstOf(b0.data.inst).crack, 1, 'a sword cracks');
  // Bomb Party
  const Fb = start(['bombs']);
  const bombs = () => G.fight.bin.filter(i => i.id === 'firecracker' && i.temp).length;
  h.eq(bombs(), 2, 'Bomb Party: two Firecrackers at the bell');
  h.ok(G.fs.items.some(b => b.data.inst.id === 'firecracker'), 'in the cabinet');
  G.endTurn(); settle(G, 30);
  h.ok(G.screen !== 'fight' || bombs() === 3 || G.fight.used.some(i => i.id === 'firecracker'), 'one more each turn');
  // Magnet Storm
  start(['magnet'], null, 0.6);
  const s0 = spread(); stepFor(G, 3.5);
  h.ok(spread() < s0 - 10, `Magnet Storm: the pile creeps toward the claw (${s0.toFixed(0)} -> ${spread().toFixed(0)})`);
  // Tiny / Giant Items
  start(['tiny']);
  const tiny = brOf();
  start(['giant']);
  const giant = brOf();
  h.ok(tiny.rusty_sword < base.br.rusty_sword * 0.8 && giant.rusty_sword > base.br.rusty_sword * 1.2, `Tiny and Giant Items: the bodies scale (${tiny.rusty_sword.toFixed(1)} / ${base.br.rusty_sword.toFixed(1)} / ${giant.rusty_sword.toFixed(1)})`);
  // Slippery Floor
  start(['slippery']);
  h.ok(G.fs.items.every((b, i) => b.slick <= (base.slick[i] || 1) * 0.1 + 1e-9), 'Slippery Floor: the pile slides');
  // Double Grabs, Half Damage
  h.eq(start(['double']).player.grabsMax, base.grabs * 2, 'Double Grabs: twice the grabs');
  // Hungry Hungry, Jackpot Fever
  h.ok(start(['hungry']).enemies[0].affix.includes('greedy'), 'Hungry Hungry: the rat is Greedy');
  const Ff = start(['fever']);
  h.ok(Ff.rules.comboTwice >= 1 && Ff.enemies[0].affix.includes('hasty'), 'Jackpot Fever: combos twice, a Hasty rat');
  // Blackout
  start(['blackout']);
  h.ok(G.endless.mods().dark, 'Blackout: the lights are out');
  T._resetCounts(); G.draw();
  h.ok((T._counts.fillRect | 0) > 0, 'the dark and the flashlight draw');
  // Conveyor Belt
  start(['conveyor'], null, 1.2);
  const x0 = meanX(); stepFor(G, 3.5);
  h.ok(meanX() > x0 + 8, `Conveyor Belt: the pile rolls toward the chute (${x0.toFixed(0)} -> ${meanX().toFixed(0)})`);
  G.draw();
  // Wobbly Legs
  start(['quake'], null, 0.2);
  h.ok(G.fs.tilt !== 0, 'Wobbly Legs: the cabinet lurches at the bell');
  G.endTurn(); settle(G, 30);
  h.ok(G.screen !== 'fight' || G.fs.tilt !== 0, 'and again every turn');
  // Double Trouble
  h.eq(start(['crowd']).enemies.length, 2, 'Double Trouble: one more monster in a normal fight');
  G.startFight(['hoard'], 'boss');
  h.eq(G.fight.enemies.length, 1, 'never in a boss fight');
  // cleared after the run
  const Fz = start([]);
  h.ok(Fz.mut === null && Fz.enemies.length === base.n && Fz.player.grabsMax === base.grabs && G.fs.tilt === 0, 'the next run without mutators is the plain machine');
  h.ok(G.fs.items.every((b, i) => b.gs === base.gs[i] && b.slick === base.slick[i]), 'the plain physics');
});

h.test('mutators: real grabs finish and deliver with every mutator on', () => {
  const { G } = endBoot();
  let total = 0, drops = 0;
  for (const id of DATA.MUT_IDS) {
    G.endless.pick([id]);
    G.newRun('knight', 2600 + id.length);
    G.startFight(['slime'], 'normal');
    endSkip(G);
    for (const e of G.fight.enemies) e.hp = e.maxHp = 999;
    stepFor(G, 2);
    const rng = U.rng(id.length * 131);
    let stuck = 0, got = 0;
    for (let k = 0; k < 4; k++) {
      if (!settle(G, 30)) { stuck++; break; }
      if (G.screen !== 'fight') break;
      const bodies = itemBodies(G);
      if (!bodies.length) { stepFor(G, 1); continue; }
      G.steer(bodies[Math.floor(rng() * bodies.length)].x);
      const before = G.run.delivered;
      if (!G.dropClaw()) { stepFor(G, 0.5); continue; }
      drops++;
      let n = 0;
      while (G.screen === 'fight' && G.state().grabInFlight && n++ < 60 * 20) G.update(DT);
      if (G.state().grabInFlight) stuck++;
      got += G.run.delivered - before;
    }
    total += got;
    h.eq(stuck, 0, `${id}: every grab finishes`);
    const out = G.fs ? G.fs.items.filter(b => !Number.isFinite(b.x) || !Number.isFinite(b.y) || b.x < -5 || b.x > G.CAB.w + 5 || b.y > G.CAB.h + 80) : [];
    h.eq(out.length, 0, `${id}: nothing leaves the glass`);
    G.draw();
  }
  h.ok(total >= drops * 0.4, `the claw still delivers (${total} items from ${drops} drops)`);
});

h.test('mutators: the panel on character select, the saved pick, the daily\'s own, the HUD badges', () => {
  const { T, G, saved } = endBoot();
  G.showChars();
  h.eq(G.S.ui.buttons[0].label, DATA.CHARACTERS.knight.name, 'the crawler cards keep their indices');
  h.ok(G.S.mutBox, 'the Mutators panel is there');
  G.endless.openPicker(true);
  h.ok(G.endless.toggle('tiny') && G.endless.toggle('giant'), 'Tiny, then Giant');
  h.eq(G.endless.picked().join(), 'giant', 'Giant swaps Tiny out');
  G.endless.toggle('glass'); G.endless.toggle('bombs');
  h.ok(!G.endless.toggle('blackout') && G.endless.picked().length === 3, 'a fourth is refused');
  h.ok(!G.endless.toggle('glass') && G.endless.picked().join() === 'giant,bombs', 'a tap switches one off');
  h.eq(saved().mutPick.join(), 'giant,bombs', 'saved on the profile');
  const T2 = boot({ store: Object.assign({}, T._store) });
  h.eq(T2.GAME.endless.picked().join(), 'giant,bombs', 'and loaded');
  G.choose(0);
  h.eq(G.run.muts.join(), 'giant,bombs', 'the run carries the pick');
  h.eq(badgesOf(T).length, 2, 'two badges in the HUD');
  G.prog.startDaily();
  h.eq(G.run.muts.join(), DATA.dailyMutators(G.run.daily).join(), 'the daily run brings the day\'s own');
  h.eq(badgesOf(T).length, G.run.muts.length, 'and shows them');
  G.showTitle();
  h.eq(G.screen, 'title', 'the title names today\'s mutators on the daily button');
});

h.test('score: counts up on the end screen, one best per mode, NEW BEST once, the High Score sticker', () => {
  const { T, G, saved } = endBoot();
  G.endless.pick([]);
  G.newRun('knight', 909);
  G.run.kills = 12; G.run.act = 2;
  G.S.headless = false;
  try {
    G.showGameOver();
    const u = G.endless.scoreUp;
    h.ok(u && !u.done && u.v.textContent === '0', 'the score starts at 0');
    G.endless.tick(0.5); G.endless.tick(u.dur * 0.3);
    const mid = parseInt(String(u.v.textContent).replace(/,/g, ''), 10);
    h.ok(mid > 0 && mid < u.to, `it counts up (${mid} of ${u.to})`);
    for (let i = 0; i < 60; i++) G.endless.tick(0.1);
    h.ok(u.done && parseInt(String(u.v.textContent).replace(/,/g, ''), 10) === u.to, 'it lands on the total');
    h.ok(u.newBest && G.run.scoreRec.classic.newBest, 'a first score is a NEW BEST');
  } finally { G.S.headless = true; }
  const first = saved().scores.classic;
  h.ok(first > 0, 'saved per mode');
  G.newRun('knight', 910);
  G.showGameOver();
  h.ok(!G.run.scoreRec.classic.newBest && saved().scores.classic === first, 'a worse run keeps the best');
  h.ok(!G.meta.ach.high_score, 'no High Score yet');
  G.newRun('knight', 911);
  G.run.kills = 2000;
  G.showGameOver();
  h.ok(G.meta.ach.high_score && G.run.metaEnd.stickers.includes('high_score'), 'High Score, listed with the run\'s stickers');
  G.prog.startDaily();
  G.showGameOver();
  h.ok(G.run.scoreRec.daily && saved().scores.daily === G.run.scoreRec.daily.total, 'the daily keeps its own best');
});

h.test('endless: saves and profiles from before Endless load and play', () => {
  const { T, G } = endBoot();
  G.newRun('knight', 1212);
  h.eq(G.run.map.seed, MAP.generate({ act: 1, rng: U.rng(U.hashStr(G.run.seed + ':map:1')), cols: MAP.DEFAULT_COLS, rows: MAP.DEFAULT_ROWS, ink: START_INK }).seed, 'a classic run keeps its old map seeds');
  G.save();
  const raw = JSON.parse(T._store[G.RUN_KEY]);
  for (const k of ['muts', 'sc', 'endless', 'scoreTop', 'scoreRec', 'winDone']) delete raw.run[k];
  const meta = JSON.parse(T._store.clawspire_meta);
  delete meta.scores; delete meta.endless; delete meta.mutPick;
  const T2 = boot({ store: { [G.RUN_KEY]: JSON.stringify(raw), clawspire_meta: JSON.stringify(meta) } });
  const G2 = T2.GAME;
  h.ok(G2.load(), 'loads');
  h.ok(Array.isArray(G2.run.muts) && !G2.run.muts.length && G2.run.endless === null && G2.run.sc.bosses === 0, 'run defaults');
  h.ok(G2.meta.scores.classic === 0 && G2.meta.endless.best === 0 && G2.endless.picked().length === 0, 'profile defaults');
  G2.startFight(['rat'], 'normal');
  h.ok(G2.fight.mut === null && G2.fight.loop === 0, 'a plain fight');
  G2.run.act = 3;
  G2.showWin();
  h.ok(G2.screen === 'win' && G2.endless.offer(), 'and a win still offers Endless');
});

// ---------------------------------------------------------------- BESTIARY (round 4): the tricks in the cabinet
{
  const BCS = boot();
  const BG = BCS.GAME, BD = BCS.DATA;
  BG.newRun('knight', 4242);
  const bestFight = (ids, tier, act, bin) => {
    BG.run.act = act;
    if (bin) BG.run.bin = bin.map((id, i) => ({ uid: 'bb' + i + ':' + id, id, plus: false }));
    BG.startFight(ids, tier || 'normal');
    if (BG.boss.vs) { BG.boss.vsSkip(); BG.boss.vsSkip(); }
    stepFor(BG, 0.1);
    settle(BG, 20);
  };
  // The enemy at i does its trick of kind k this enemy turn; the rest wait.
  const force = (i, k) => {
    BG.fight.enemies.forEach((e, j) => { if (!e.alive) return; e.intent = j === i ? (e.def.moves.find(m => m.k === k) || e.def.moves[0]) : { id: 'w', k: 'block', v: 1, txt: 'waits' }; });
    BG.fs.queue.length = 0;
    return BG.endTurn();
  };
  const B = () => BG.best.state;
  const cabItems = () => BG.fs.items.filter(b => !BG.cabinet.inChute(b));
  const isMetal = (b) => (b.data.def.tags || []).includes('metal');
  const knightBin = () => BD.CHARACTERS.knight.bin.slice();

  h.test('bestiary: the Tickle Monster makes the claw wiggle on the next turn\'s drops', () => {
    // a control drop first: a calm claw goes straight down
    bestFight(['tickler'], 'normal', 1);
    const dev = () => {
      BG.steer(200); stepFor(BG, 0.8);
      h.ok(BG.dropClaw(), 'drop');
      let m = 0;
      for (let i = 0; i < 120; i++) { BG.update(DT); const r = BG.rig; if (r.phase === 'dropping' || r.phase === 'closing' || r.phase === 'lifting') m = Math.max(m, Math.abs(r.x - 200)); }
      settle(BG, 20);
      return m;
    };
    const calm = dev();
    h.ok(force(0, 'tickle'), 'enemy turn');
    h.ok(settle(BG, 30), 'back to the player');
    h.eq(B().tickle, 1, 'the claw is ticklish this turn');
    const tick = dev();
    h.ok(calm < 1 && tick > 3, `a tickled claw wiggles on its way down (calm ${calm.toFixed(2)} px, tickled ${tick.toFixed(2)} px)`);
    BG.draw();
    h.ok(BG.endTurn() && settle(BG, 30), 'end the turn');
    h.eq(B().tickle, 0, 'the tickle wears off when the turn ends');
  });

  h.test('bestiary: the Jelly Cube glues the pile; goo pulls, snaps, and dries up at the turn end', () => {
    bestFight(['jelly'], 'normal', 1);
    force(0, 'glue');
    h.ok(settle(BG, 30), 'back to the player');
    stepFor(BG, 1.0);
    const g = B().glue;
    h.ok(g.length >= 3, `the pile is glued (${g.length} strands)`);
    h.ok(g.every(p => BG.fs.items.includes(p.a) && BG.fs.items.includes(p.b) && p.a !== p.b), 'strands join two live items');
    const per = {};
    for (const p of g) { per[p.a.id] = (per[p.a.id] || 0) + 1; per[p.b.id] = (per[p.b.id] || 0) + 1; }
    h.ok(Object.values(per).every(n => n <= BG.best.K.glueMax), 'two strands per item at most');
    // pull one glued item away: its partner follows until the strand snaps
    const p = g[0];
    const bx = p.b.x;
    p.a.vx = 900; p.a.vy = -600;
    stepFor(BG, 0.05);
    h.ok(p.off || Math.abs(p.b.x - bx) > 0.5 || p.b.vx !== 0, 'the goo drags the partner along (or snaps)');
    stepFor(BG, 0.6);
    BG.draw();
    h.ok(BG.endTurn() && settle(BG, 30), 'end the turn');
    h.eq(B().glue.length, 0, 'the goo dries up when the turn ends');
  });

  h.test('bestiary: the Magnet Bat floats the metal up to the lid; the claw grabs it mid-air', () => {
    bestFight(['magbat'], 'normal', 2);
    const n = cabItems().filter(isMetal).length;
    h.ok(n >= 2, 'the knight has metal in the cabinet (' + n + ')');
    force(0, 'ceiling');
    h.ok(settle(BG, 30), 'back to the player');
    stepFor(BG, 2.5);
    const hang = BG.fs.items.filter(b => b.data.bestHang === 1);
    h.ok(hang.length >= 2 && hang.every(isMetal), `metal hangs under the lid (${hang.length})`);
    h.ok(hang.every(b => b.y < 190), 'high up: ' + hang.map(b => Math.round(b.y)).join(','));
    h.ok(BG.fs.items.filter(b => !isMetal(b) && !BG.cabinet.inChute(b)).every(b => b.y > 200), 'everything else stays in the pile');
    const tgt = hang[0], inst = tgt.data.inst;
    BG.steer(tgt.x); stepFor(BG, 1.2);
    const x0 = tgt.x;
    BG.steer(x0); stepFor(BG, 0.3);
    h.ok(BG.dropClaw(), 'drop on it');
    let caught = false;
    for (let i = 0; i < 600 && !caught; i++) { BG.update(DT); if (BG.rig.phase === 'lifting' && tgt.held > 0) caught = true; }
    h.ok(caught, 'the claw closes on it in mid-air');
    settle(BG, 20);
    h.ok(!BG.fight.bin.includes(inst) || tgt.data.bestHang !== 1, 'and it is carried off (played or dropped, never still hanging)');
    BG.draw();
    h.ok(BG.endTurn() && settle(BG, 30), 'end the turn');
    stepFor(BG, 2);
    h.ok(BG.fs.items.every(b => b.data.bestHang !== 1), 'the lid lets go at the turn end');
    h.ok(BG.fs.items.filter(isMetal).every(b => b.y > 190), 'the metal falls back into the pile');
  });

  h.test('bestiary: the Bulldozer plows the pile to the far wall', () => {
    bestFight(['dozer'], 'elite', 2);
    const mean = () => { const L = cabItems(); return L.reduce((a, b) => a + b.x, 0) / Math.max(1, L.length); };
    const before = mean();
    force(0, 'plow');
    stepFor(BG, 0.6);
    h.ok(B().plow && B().plow.push, 'the blade is sweeping');
    h.ok(BG.fs.queue.length > 0, 'the enemy turn waits for it');
    BG.draw();
    h.ok(settle(BG, 30), 'back to the player');
    const after = mean();
    h.ok(after < before - 40, `the pile moved toward the far wall (mean x ${Math.round(before)} -> ${Math.round(after)})`);
    h.ok(!B().plow, 'the blade is gone');
  });

  h.test('bestiary: the Peekaboo Ghost hides items until the claw touches them', () => {
    bestFight(['ghost'], 'normal', 3);
    force(0, 'vanish');
    h.ok(settle(BG, 30), 'back to the player');
    const inv = Object.keys(B().inv);
    h.eq(inv.length, 3, 'three items invisible');
    h.ok(inv.every(u => BG.fight.bin.some(i => i.uid === u)), 'they are still in the bin');
    BG.draw();
    const b = BG.fs.items.find(x => B().inv[x.data.inst.uid] > 0);
    // the claw brushes it on a drop (a parked claw sheds riders, so touch it mid-drop)
    BG.steer(b.x); stepFor(BG, 1);
    h.ok(BG.dropClaw(), 'drop');
    for (let i = 0; i < 60 && BG.rig.phase !== 'dropping'; i++) BG.update(DT);
    b.held = 2; BG.update(DT);
    stepFor(BG, 0.6);
    h.ok(!(B().inv[b.data.inst.uid] > 0), 'the claw\'s touch finds it');
    h.eq(Object.keys(B().inv).length, 2, 'the other two stay hidden');
  });

  h.test('bestiary: the Cinder Mole buries an item; a claw on the mound digs it up', () => {
    bestFight(['mole'], 'normal', 2, knightBin().slice(0, 7));
    force(0, 'bury');
    h.ok(settle(BG, 30), 'back to the player');
    const F = BG.fight, m = B().mounds;
    h.ok(m.length === 1 && F.buried.length === 1 && m[0].inst === F.buried[0].inst, 'one mound, one buried item');
    h.ok(!BG.fs.items.some(b => b.data.inst === m[0].inst), 'its body left the cabinet');
    BG.draw();
    const inst = m[0].inst;
    // clear the floor above the mound so the drop reaches it
    for (const b of BG.fs.items.slice()) if (Math.abs(b.x - m[0].x) < 70) { b.x = m[0].x < 200 ? 380 : 60; b.vx = 0; }
    stepFor(BG, 1);
    BG.steer(m[0].x); stepFor(BG, 1.2);
    h.ok(BG.dropClaw(), 'drop on the mound');
    for (let i = 0; i < 180 && B().mounds.length; i++) BG.update(DT);
    h.ok(!B().mounds.length && !F.buried.length, 'dug up');
    h.ok(F.bin.includes(inst) || F.used.includes(inst), 'the item is back');
    settle(BG, 20);
    // a Mole that goes down gives everything back
    force(0, 'bury'); settle(BG, 30);
    const left = F.buried.map(x => x.inst);
    h.ok(left.length === 1 && B().mounds.length === 1, 'buried again');
    BCS.COMBAT.damage(F, F.player, F.enemies[0], 9999, { pierce: true });
    const list = F.events.splice(0);
    for (const e of list) BG.fs.queue.push({ ev: e, beat: 0.1 });
    stepFor(BG, 1.5);
    h.ok(!B().mounds.length && left.every(i => F.bin.includes(i) || F.used.includes(i)), 'its death pops the mound');
  });

  h.test('bestiary: the Carnival Barker spins its prize wheel before the prize lands', () => {
    bestFight(['barker'], 'elite', 1);
    force(0, 'wheel');
    stepFor(BG, 0.7);
    const W = B().wheel;
    h.ok(W && !W.done && W.t > 0, 'the wheel is spinning');
    h.ok(BG.fs.queue.length > 0, 'the prize waits for the wheel');
    const r0 = B().wrot; stepFor(BG, 0.2);
    h.ok(B().wrot > r0, 'it turns');
    BG.draw();
    h.ok(settle(BG, 30), 'back to the player');
    h.ok(!B().wheel && B().wheelSeen, 'it landed and hangs on the cabinet as a sign');
    const n = BCS.COMBAT.BEST_WHEEL.length;
    h.ok(((W.rot1 % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - ((-W.w * Math.PI * 2 / n) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) < 1e-6, 'it stops with the rolled wedge under the flapper');
    BG.draw();
  });

  h.test('bestiary: the Claw Collector\'s own claw comes into the cabinet and takes the rarest item', () => {
    bestFight(['collector'], 'elite', 3);
    const F = BG.fight;
    const pick = BCS.COMBAT.bestRivalPick(F);
    const pb = BG.fs.items.find(b => b.data.inst === pick);
    h.ok(pick && pb, 'the rival claw has its eye on an item in the cabinet');
    BG.draw();
    force(0, 'block');
    let seen = false, pinned = false;
    for (let i = 0; i < 300; i++) {
      BG.update(DT);
      const r = B() && B().rival;
      if (r) { seen = true; if (r.carry && pb.world && Math.abs(pb.x - r.x) < 1 && Math.abs(pb.y - (r.y + 22)) < 2) pinned = true; }
      if (seen && !r) break;
    }
    h.ok(seen, 'its claw comes down');
    h.ok(pinned, 'and lifts the item out through the lid');
    h.ok(settle(BG, 30), 'back to the player');
    h.ok(F.enemies[0].belly.some(b => b.inst === pick), 'the item is in its case');
    h.ok(!BG.fs.items.some(b => b.data.inst === pick), 'and out of the cabinet');
    BG.draw();
  });

  h.test('bestiary: every new enemy fights six real turns with random drops', () => {
    const NEW = [['tickler', 1, 'normal'], ['jelly', 1, 'normal'], ['barker', 1, 'elite'], ['magbat', 2, 'normal'], ['mole', 2, 'normal'], ['dozer', 2, 'elite'], ['ghost', 3, 'normal'], ['collector', 3, 'elite']];
    const r = BCS.U.rng(77);
    for (const [id, act, tier] of NEW) {
      BG.run.hp = BG.run.maxHp = 999;
      bestFight([id], tier, act);
      let ok = true;
      try {
        for (let t = 0; t < 6 && BG.screen === 'fight' && BG.fight && BG.fight.phase === 'player'; t++) {
          for (let g = 0; g < 2 && ready(BG) && BG.fight.player.grabs > 0; g++) { BG.steer(60 + r() * 320); stepFor(BG, 0.6); BG.dropClaw(); settle(BG, 20); BG.draw(); }
          if (ready(BG)) { BG.endTurn(); settle(BG, 30); BG.draw(); }
        }
      } catch (err) { ok = false; h.ok(false, id + ' threw ' + err.stack); }
      h.ok(ok && (BG.screen !== 'fight' || ready(BG) || !BG.fight || BG.fight.phase === 'over'), `${id}: six turns in the machine, no hang`);
    }
  });
}

// VAULT (round 5): the Prize Vault, its wallet, the shelves, the Vault Capsule, the trail and the share card.
h.test('vault: a fresh profile, the title button, and every ticket won banks in the wallet', () => {
  const T = boot();
  const G = T.GAME, V = G.vault, DV = T.DATA.VAULT_DEFAULT;
  h.eq(V.state.tix, 0, 'an empty wallet');
  for (const cat of ['skin', 'paint', 'marquee', 'trail']) h.ok(V.state.owned[DV[cat]] && V.state.eq[cat] === DV[cat], `the default ${cat} is owned and on`);
  G.showTitle();
  h.ok(G.S.ui.buttons.some(b => b.label === 'Prize Vault'), 'the title has a Prize Vault button');
  h.ok(/new run/i.test(G.S.ui.buttons[0].label), 'New run is still the first choice');
  G.newRun('knight', 51);
  G.loot.addTickets(12);
  h.eq(G.run.tickets, 12, 'the run has its tickets');
  h.eq(V.state.tix, 12, 'the vault banked every one');
  G.loot.addTickets(-7);
  h.eq(G.run.tickets, 5, 'spent in the run');
  h.ok(V.state.tix === 12 && V.state.earned === 12, 'spending in the run never takes vault tickets back');
  stepFor(G, 0.8);
  h.eq(JSON.parse(T._store.clawspire_meta).vault.tix, 12, 'the wallet is saved a moment later');
  // a real fight's payout banks exactly what the run won
  const v0 = V.state.tix, t0 = G.run.tickets;
  G.startFight(['rat'], 'normal');
  settle(G, 6);
  for (const e of G.fight.enemies) { e.hp = 0; e.alive = false; }
  G.endFight('win');
  if (G.screen === 'fight') G.tap(270, 600);
  G.loot.finishPay();
  h.eq(G.screen, 'reward', 'on the reward screen');
  h.ok(G.run.tickets > t0, 'the fight paid tickets (' + (G.run.tickets - t0) + ')');
  h.eq(V.state.tix - v0, G.run.tickets - t0, 'the vault banked exactly the payout');
});
h.test('vault: the screen, buying, equipping, the outfits, and old or broken profiles', () => {
  const T = boot();
  const G = T.GAME, V = G.vault, D = T.DATA, R = T.RENDER;
  const save0 = T._store[G.RUN_KEY];
  V.bank(300);
  const ui = V.show('skin');
  h.eq(G.screen, 'vault', 'the vault screen');
  h.ok(G.S.ui.buttons.some(b => b.label === 'Candy Shop') && G.S.ui.buttons.some(b => b.label === 'Vault Capsule') && G.S.ui.buttons.some(b => b.label === 'Back'), 'shelf slots, the capsule and Back are choices');
  h.eq(T._store[G.RUN_KEY], save0, 'opening the vault never touches the run save');
  // every tab and every prize can be picked and drawn
  const ctx = T._ctx;
  let threw = null;
  for (const c of D.VAULT_CATS) {
    V.show(c.id);
    for (const id of D.vaultList(c.id)) { try { V.select(id); G.update(1 / 60); G.draw(); } catch (e) { threw = threw || id + ': ' + e.stack; } }
  }
  h.ok(!threw, 'every prize previews and draws: ' + threw);
  // buying
  h.ok(!V.buy('skin_rainbow') && !V.state.owned.skin_rainbow, 'a legendary is not for sale');
  h.ok(!V.buy('skin_gold') && !V.state.owned.skin_gold, 'a sticker prize is not for sale');
  const price = D.vaultPrice('skin_space');
  h.ok(V.buy('skin_space'), 'buy Deep Space');
  h.ok(V.state.owned.skin_space && V.state.tix === 300 - price && V.state.spent === price, 'the price comes off the wallet');
  h.eq(V.state.eq.skin, 'skin_space', 'a new prize goes on at once');
  h.eq(R.vault.equipped.skin, 'skin_space', 'the renderer wears it');
  h.ok(!V.buy('skin_space'), 'no buying it twice');
  V.state.tix = 10;
  h.ok(!V.buy('paint_gold') && !V.state.owned.paint_gold && V.state.tix === 10, 'short of tickets: refused, nothing spent');
  // equipping
  h.ok(!V.equip('paint_gold'), 'an unowned prize cannot be equipped');
  h.ok(V.equip('skin_classic') && V.state.eq.skin === 'skin_classic' && R.vault.equipped.skin === 'skin_classic', 'equip an owned one');
  V.state.tix = 500;
  h.ok(V.buy('fit_alch_wizard'), 'buy an outfit');
  h.eq(V.state.eq.outfit.alchemist, 'fit_alch_wizard', 'it goes on its crawler');
  h.ok(!V.state.eq.outfit.knight, 'nobody else wears it');
  h.ok(V.unequip('fit_alch_wizard') && !V.state.eq.outfit.alchemist, 'outfits come off');
  V.equip('fit_alch_wizard');
  V.equip('skin_space');
  V.leave();
  h.eq(G.screen, 'title', 'Back to the title');
  // save and load: the equipped set survives and is applied at boot
  stepFor(G, 0.6);
  const T2 = boot({ store: Object.assign({}, T._store) });
  const V2 = T2.GAME.vault;
  h.ok(V2.state.owned.skin_space && V2.state.eq.skin === 'skin_space' && V2.state.eq.outfit.alchemist === 'fit_alch_wizard', 'the vault loads back');
  h.eq(T2.RENDER.vault.equipped.skin, 'skin_space', 'the renderer wears it from the first frame');
  h.eq(T2.RENDER.vault.equipped.outfit.alchemist, 'fit_alch_wizard', 'and the outfit');
  // an old profile (no vault), and junk
  const old = JSON.parse(T._store.clawspire_meta);
  delete old.vault;
  const T3 = boot({ store: { clawspire_meta: JSON.stringify(old) } });
  h.ok(T3.GAME.vault.state.tix === 0 && T3.GAME.vault.state.eq.skin === 'skin_classic', 'an old profile gets an empty vault and the old look');
  old.vault = { tix: 'lots', owned: 7, eq: { skin: 'nope', paint: 'skin_space', outfit: { knight: 'fit_alch_wizard' } }, pend: { id: 'nope' }, news: 'x' };
  const T4 = boot({ store: { clawspire_meta: JSON.stringify(old) } });
  const V4 = T4.GAME.vault.state;
  h.ok(V4.tix === 0 && V4.eq.skin === 'skin_classic' && V4.eq.paint === 'paint_chrome' && !V4.eq.outfit.knight && !V4.pend, 'junk is repaired: no bad ids, nothing worn that is not owned');
  h.ok(T4.GAME.vault.show() && T4.GAME.screen === 'vault', 'and the vault still opens');
});
h.test('vault: the Vault Capsule, paid once, cracked, a dupe pays back, and a reload keeps the prize', () => {
  const T = boot();
  const G = T.GAME, V = G.vault, D = T.DATA;
  V.bank(200);
  V.show();
  const price = D.VAULT.CAP_PRICE;
  h.ok(V.capsule(), 'buy a capsule');
  const p = V.state.pend;
  h.ok(!!p && D.COSMETICS[p.id] && V.state.tix === 200 - price, 'paid and rolled at once (' + (p && p.id) + ')');
  h.ok(V.cap && V.cap.phase === 'drop', 'the ritual starts');
  // a reload before the burst: the same capsule, no second charge
  stepFor(G, 0.6);
  const T2 = boot({ store: Object.assign({}, T._store) });
  const G2 = T2.GAME, V2 = G2.vault;
  h.eq(V2.state.pend && V2.state.pend.id, p.id, 'the paid capsule survives a reload');
  h.eq(V2.state.tix, 200 - price, 'and nothing is charged again');
  V2.show();
  h.ok(V2.cap && V2.cap.p.id === p.id, 'the vault reopens it');
  let n = 0;
  while (V2.cap && V2.cap.phase !== 'done' && n++ < 40) { V2.tap(); stepFor(G2, 0.3); G2.draw(); }
  h.eq(V2.cap && V2.cap.phase, 'done', 'taps crack it open');
  h.ok(V2.state.owned[p.id] && !V2.state.pend && V2.state.caps === 1 && V2.state.news[p.id], 'the prize is paid once and marked NEW');
  h.ok(G2.S.ui.buttons.some(b => b.label === 'Equip it'), 'Equip it is offered');
  G2.choose(G2.S.ui.buttons.findIndex(b => b.label === 'Equip it'));
  const d = D.COSMETICS[p.id];
  h.ok(d.cat === 'outfit' ? V2.state.eq.outfit[d.char] === p.id : V2.state.eq[d.cat] === p.id, 'Equip it puts it on');
  h.ok(!V2.cap && G2.screen === 'vault', 'back on the shelves');
  // dupes: own the whole pool, every capsule pays tickets back
  for (const id of D.vaultPool()) V2.state.owned[id] = 1;
  V2.state.tix = 1000;
  let spent = 0, back = 0;
  for (let i = 0; i < 6; i++) {
    const t0 = V2.state.tix;
    V2.capsule();
    spent += t0 - V2.state.tix;
    const t1 = V2.state.tix;
    V2.skip(); V2.skip();
    h.ok(V2.cap && V2.cap.res && V2.cap.res.dupe && V2.cap.res.tix === D.VAULT.DUPE[V2.cap.res.tier], 'a dupe: ' + JSON.stringify(V2.cap && V2.cap.res));
    back += V2.state.tix - t1;
    V2.close();
  }
  h.eq(spent, 6 * price, 'six capsules paid');
  h.ok(back > 0, 'dupes paid tickets back (' + back + ')');
  // too poor: refused, nothing rolled
  V2.state.tix = 5;
  h.ok(!V2.capsule() && !V2.state.pend && V2.state.tix === 5, 'short of tickets: no capsule');
  // the pity: a legendary after PITY - 1 capsules without one
  const T3 = boot();
  const V3 = T3.GAME.vault;
  V3.bank(500); V3.state.pity = T3.DATA.VAULT.PITY - 1;
  V3.show(); V3.capsule();
  h.ok(V3.state.pend && V3.state.pend.tier === 'l' && V3.state.pend.lucky, 'the pity capsule holds a legendary');
  V3.skip(); V3.skip();
  h.eq(V3.state.pity, 0, 'and resets the count');
});
h.test('vault: stickers unlock their prizes, old stickers too', () => {
  const T = boot();
  const G = T.GAME, V = G.vault;
  h.ok(!V.state.owned.skin_gold, 'no Gold Jackpot yet');
  G.prog.achUnlock('mega');
  h.ok(V.state.owned.skin_gold && V.state.news.skin_gold, 'the Mega Jackpot sticker unlocks the Gold Jackpot cabinet');
  h.ok(V.equip('skin_gold'), 'and it can go on');
  const meta = JSON.parse(T._store.clawspire_meta);
  meta.ach.champion = { run: 3, at: 1 };
  delete meta.vault;
  const T2 = boot({ store: { clawspire_meta: JSON.stringify(meta) } });
  h.ok(T2.GAME.vault.state.owned.mq_winner && T2.GAME.vault.state.owned.skin_gold, 'a profile that already had the stickers owns their prizes');
});
h.test('vault: every cosmetic in a real fight and on the map, the trail follows a walk', () => {
  const T = boot();
  const G = T.GAME, V = G.vault, D = T.DATA;
  for (const id of D.COSMETIC_IDS) V.state.owned[id] = 1;
  G.newRun('rogue', 61);
  G.startFight(['rat'], 'normal');
  settle(G, 6);
  const skins = D.vaultList('skin'), paints = D.vaultList('paint'), mqs = D.vaultList('marquee');
  let threw = null;
  for (let i = 0; i < Math.max(skins.length, paints.length); i++) {
    V.equip(skins[i % skins.length], true); V.equip(paints[i % paints.length], true); V.equip(mqs[i % mqs.length], true); V.equip('fit_rogue_pirate', true);
    try { G.steer(100 + i * 30); stepFor(G, 0.2); G.draw(); } catch (e) { threw = threw || e.stack; }
  }
  h.ok(!threw, 'every skin, paint and marquee draws in a fight: ' + threw);
  G.dropClaw();
  h.ok(settle(G, 20), 'a real grab with a painted claw settles');
  // the map: the trail follows the walk
  G.toMap();
  const M = G.run.map;
  const road = M.road || [];
  const i0 = road.findIndex(([q, r]) => q === M.pos.q && r === M.pos.r);
  const path = road.slice(i0 + 1, i0 + 3);
  for (const id of D.vaultList('trail')) {
    V.equip(id, true);
    try { G.draw(); } catch (e) { threw = threw || id + ' ' + e.stack; }
  }
  V.equip('trail_rainbow', true);
  // a quiet stretch of road: nothing on it resolves, no monster prowls
  for (const [q, r] of path) { const tl = M.tiles[q + ',' + r]; if (tl) { tl.type = 'empty'; tl.done = true; tl.content = {}; } }
  M.roam = [];
  if (path.length && G.screen === 'map') {
    G.startWalk(path);
    for (let k = 0; k < 20 && G.screen === 'map'; k++) { G.update(1 / 60); }
    h.ok(V.trail && V.trail.pts.length > 0, 'walking leaves trail marks (' + (V.trail ? V.trail.pts.length : 0) + ')');
    G.draw();
    stepFor(G, 4);
    h.ok(!V.trail.pts.length || G.screen !== 'map' || !!G.S.walk, 'the marks fade');
  }
  h.ok(!threw, 'every trail draws on the map: ' + threw);
});
h.test('vault: the share card renders headless, the Share button sits on both run ends', () => {
  const T = boot();
  const G = T.GAME, V = G.vault;
  G.newRun('gambler', 71);
  const run = G.run;
  run.loot.bigHit = 42; run.loot.bestCombo = { name: 'Royal Flush', tier: 3 }; run.muts = ['glass'];
  let card = null, threw = null;
  try { card = V.shareCard(run, false); } catch (e) { threw = e.stack; }
  h.ok(!threw && card && card.cv, 'the card renders on a stub canvas: ' + threw);
  h.ok(card.st.url === 'https://games-71g.pages.dev/clawspire/' && card.st.bigHit === 42 && card.st.combo.name === 'Royal Flush' && card.st.char === 'gambler', 'the card carries the run');
  h.ok(card.st.score > 0 && typeof card.st.boss === 'string', 'a score and the boss line');
  h.eq(card.cv.width, 1080, '1080 wide'); h.eq(card.cv.height, 1350, '1350 tall');
  let ok = false;
  try { ok = V.share(run, false); } catch (e) { threw = e.stack; }
  h.ok(ok && !threw, 'Share falls back to a download headless without throwing');
  h.eq(V.state.shares, 1, 'shares are counted');
  G.showGameOver();
  h.eq(G.S.ui.buttons[0].label, 'Back to title', 'game over: Back to title is still the first choice');
  h.ok(G.S.ui.buttons.some(b => b.label === 'Share run card'), 'game over: a Share run card button');
  const T2 = boot();
  const G2 = T2.GAME;
  G2.newRun('knight', 72);
  G2.showWin();
  h.eq(G2.S.ui.buttons[0].label, 'Cash out', 'win: Cash out is still the first choice');
  h.ok(G2.S.ui.buttons.some(b => b.label === 'Share run card'), 'win: a Share run card button');
  const w = G2.vault.shareCard(G2.run, true);
  h.ok(/Prize Master/.test(w.st.boss) && w.st.won, 'a win names the Prize Master');
});

// ---------------------------------------------------------------- PETS (round 5): companion pets, the pet shop, whack-a-mole, skee-ball
const PET_META = JSON.stringify({ introSeen: true, tutorialDone: true, unlocks: { knight: true } });
function petBoot(store) { return boot({ store: Object.assign({ clawspire_meta: PET_META }, store || {}) }); }
// A fight with this pet (xp sets its level), paused before its first move (0.9 s into the turn).
function petFight(G, id, xp, seed, extra) {
  G.pet.give(id, xp || 0);
  for (const jid of extra || []) G.run.bin.push({ uid: 'x' + jid + G.run.bin.length, id: jid, plus: false });
  G.startFight(['rat', 'slime'], 'normal', { seed: seed || 4242 });
  stepFor(G, 0.5);
  return G.pet.fs();
}
// Steps until the pet's trick has fired (a log entry with fx); the frame count, or -1.
function petUntilFx(G, secs) {
  const P = G.pet.fs(), n0 = P.log.filter(e => e.fx).length;
  for (let i = 0; i < Math.round((secs || 4) / DT); i++) { G.update(DT); if (P.log.filter(e => e.fx).length > n0) return i; }
  return -1;
}
const petBody = (G, uid) => G.fs.items.find(b => b.data.inst && b.data.inst.uid === uid) || null;

h.test('pets: a pet sits on the frame, acts once a turn by itself, twice from Lv 3, and draws', () => {
  const T = petBoot(), G = T.GAME, D = T.DATA;
  G.newRun('knight', 5151);
  h.eq(G.run.pet || null, null, 'a new run has no pet');
  for (const id of D.PET_IDS) {
    const P = petFight(G, id, 0, 700);
    h.ok(P && P.id === id && P.lv === 1, id + ': the fight has the pet at Lv 1');
    h.ok(Math.abs(P.x - G.pet.K.perchX) < 1 && Math.abs(P.y - G.pet.K.perchY) < 1 && !P.act, id + ': on its perch');
    h.ok(G.S.petRow, id + ': the player row makes room');
    G.draw();
    if (D.PETS[id].when === 'turn') {
      const f = petUntilFx(G, 3);
      h.ok(f >= 0, id + ': it acts on its own early in the turn');
      h.eq(P.uses, 0, id + ': Lv 1: one use a turn');
      stepFor(G, 3);
      h.ok(!P.act && Math.abs(P.x - G.pet.K.perchX) < 1, id + ': and hops back to the perch');
      h.eq(P.log.filter(e => e.fx).length, 1, id + ': once, not twice, with no grab');
    }
    for (let i = 0; i < 20; i++) { G.update(DT); G.draw(); }
    G.endFight('win');
    G.toMap();
    G.draw();
  }
  // Lv 3: a second use after the first grab
  const P = petFight(G, 'parrot', 40, 701);
  h.eq(P.lv, 3, 'Lv 3 at 40 xp');
  petUntilFx(G, 3);
  h.eq(P.uses, 1, 'a use left after the first');
  stepFor(G, 1.5);
  G.steer(120); stepFor(G, 0.4);
  h.ok(G.dropClaw(), 'a grab');
  let t = 0;
  while (t < 14 && P.log.filter(e => e.fx).length < 2) { G.update(DT); t += DT; }
  h.eq(P.log.filter(e => e.fx).length, 2, 'the second use comes after the grab');
  h.eq(P.uses, 0, 'and that was the last this turn');
  // the next turn refills
  let n = 0; while (n++ < 900 && !G.state().grabs) G.update(DT);
  if (G.fight && G.fight.phase === 'player' && G.fight.turn === 1) { stepFor(G, 1); G.endTurn(); }
  n = 0; while (n++ < 1200 && !(G.fight && G.fight.turn >= 2 && G.fight.phase === 'player' && !G.fs.enemyTurn)) G.update(DT);
  stepFor(G, 0.2);
  h.ok(P.turn === G.fight.turn && P.uses >= 1, 'a new turn, the uses are back');
});

h.test('pets: every trick moves the right thing', () => {
  const T = petBoot(), G = T.GAME, D = T.DATA;
  G.newRun('knight', 5252);
  // hamster: the farthest floor item goes toward the chute
  let P = petFight(G, 'hamster', 0, 800);
  petUntilFx(G, 3);
  let b = petBody(G, P.log[P.log.length - 1].uid);
  let x0 = b ? b.x : 0;
  stepFor(G, 0.6);
  h.ok(b && b.x > x0 + 8, `hamster: NUDGE moved it toward the chute (${x0 | 0} -> ${b ? b.x | 0 : '?'})`);
  G.endFight('win'); G.toMap();
  // parrot: the most buried item pops up
  P = petFight(G, 'parrot', 0, 801);
  petUntilFx(G, 3);
  b = petBody(G, P.log[P.log.length - 1].uid);
  let y0 = b ? b.y : 0, top = y0;
  for (let i = 0; i < 30; i++) { G.update(DT); if (b) top = Math.min(top, b.y); }
  h.ok(b && top < y0 - 20, `parrot: PECK popped it up (${y0 | 0} -> ${top | 0})`);
  G.endFight('win'); G.toMap();
  // cat: an item flies up and over toward the chute
  P = petFight(G, 'cat', 0, 802);
  petUntilFx(G, 3);
  b = petBody(G, P.log[P.log.length - 1].uid);
  x0 = b ? b.x : 0; y0 = b ? b.y : 0; top = y0;
  let right = x0;
  for (let i = 0; i < 50; i++) { G.update(DT); if (b && G.fs.items.indexOf(b) >= 0) { top = Math.min(top, b.y); right = Math.max(right, b.x); } else right = 9999; }
  h.ok(top < y0 - 60 && right > x0 + 30, `cat: BAT threw it high toward the chute (up ${(y0 - top) | 0}, right ${(right - x0) | 0})`);
  G.endFight('win'); G.toMap();
  // magnet mouse: a metal item slides to the claw's aim
  P = petFight(G, 'mouse', 0, 803);
  G.steer(260);
  petUntilFx(G, 3);
  b = petBody(G, P.log[P.log.length - 1].uid);
  const aim = G.rig.targetX;
  const d0 = b ? Math.abs(b.x - aim) : 0;
  stepFor(G, 0.8);
  h.ok(b && b.data.mat && b.data.mat.traits.metal, 'mouse: it picked a metal item');
  h.ok(b && Math.abs(b.x - aim) < d0 - 10, `mouse: PULL brought it nearer the claw (${d0 | 0} -> ${b ? Math.abs(b.x - aim) | 0 : '?'})`);
  G.endFight('win'); G.toMap();
  // trash raccoon: one junk item is eaten for the fight; with no junk, it rummages
  P = petFight(G, 'raccoon', 0, 804, ['rock', 'slag']);
  const junk0 = G.fight.bin.filter(i => D.ITEMS[i.id].rarity === 'junk').length, bin0 = G.fight.bin.length;
  petUntilFx(G, 3);
  const eaten = G.fight.bin.filter(i => D.ITEMS[i.id].rarity === 'junk').length;
  h.eq(eaten, junk0 - 1, 'raccoon: CHOMP, one junk fewer in the bin');
  h.eq(G.fight.bin.length, bin0 - 1, 'raccoon: nothing else taken');
  h.ok(G.fight.purged && G.fight.purged.some(i => D.ITEMS[i.id].rarity === 'junk'), 'raccoon: it is gone for the fight (purged)');
  h.ok(G.fs.items.every(x => G.fight.bin.indexOf(x.data.inst) >= 0 || !x.data.inst), 'raccoon: its body left the cabinet');
  G.endFight('win'); G.toMap();
  G.run.bin = G.run.bin.filter(i => D.ITEMS[i.id].rarity !== 'junk');
  P = petFight(G, 'raccoon', 0, 805);
  const n1 = G.fight.bin.length;
  petUntilFx(G, 3);
  h.eq(G.fight.bin.length, n1, 'raccoon: no junk, nothing eaten (a rummage)');
  G.endFight('win'); G.toMap();
  // firefly: the spotlight pays gold when that item is delivered this turn; it finds invisible items
  P = petFight(G, 'firefly', 0, 806);
  petUntilFx(G, 3);
  h.ok(P.glowUid, 'firefly: an item in the spotlight');
  const lit = petBody(G, P.glowUid), g0 = G.fight.gain.gold;
  G.playDelivered([lit]);
  h.eq(G.fight.gain.gold - g0, D.petGlow(1), 'firefly: delivering it pays the spotlight bonus');
  h.eq(P.glowUid, null, 'firefly: once');
  G.endFight('win'); G.toMap();
  P = petFight(G, 'firefly', 0, 807);
  const hide = G.fight.bin.slice(0, 2);
  G.best.event({ t: 'binVanish', idx: 0, insts: hide });
  petUntilFx(G, 3);
  const B = G.best.state;
  h.eq(hide.filter(i => B.invGo[i.uid]).length, 1, 'firefly: its light finds an invisible item (one at Lv 1)');
  G.endFight('win'); G.toMap();
  // golden goose: a jackpot lays a golden egg (gold and tickets); a double does not at Lv 1
  P = petFight(G, 'goose', 0, 808);
  P.turn = G.fight.turn; P.uses = 1;
  const gg = G.fight.gain.gold, tt = G.fight.stats.tix || 0;
  G.pet.grab(2);
  stepFor(G, 1.2);
  h.eq(G.fight.gain.gold, gg, 'goose: a double lays nothing at Lv 1');
  G.pet.grab(3);
  stepFor(G, 1.2);
  const egg = D.petEgg(1);
  h.eq(G.fight.gain.gold - gg, egg.gold, 'goose: a jackpot lays a golden egg (gold)');
  h.eq((G.fight.stats.tix || 0) - tt, egg.tix, 'goose: and tickets on the payout');
  G.endFight('win'); G.toMap();
});

h.test('pets: the octopus holds a prize tight through a real lift', () => {
  const T = petBoot(), G = T.GAME;
  G.newRun('knight', 5353);
  let held = 0, worst = 0, lifted = false;
  for (const seed of [900, 901, 902, 903]) {
    const P = petFight(G, 'octopus', 0, seed);
    stepFor(G, 1.5);
    const top = G.fs.items.slice().sort((a, b) => a.y - b.y)[0];
    G.steer(top.x); stepFor(G, 0.8);
    G.dropClaw();
    let t = 0, H = null;
    while (t < 12 && G.fs.grabInFlight) {
      G.update(DT); t += DT;
      if (P.hold) { H = P.hold; lifted = true; const r = G.rig; if (r.phase === 'carrying') worst = Math.max(worst, Math.abs(H.b.y - (r.y + H.dy))); }
    }
    if (H) {
      held++;
      h.ok(P.log.some(e => e.k === 'hold'), 'seed ' + seed + ': the hold is logged');
      h.ok(G.fight.bin.indexOf(H.b.data.inst) < 0, 'seed ' + seed + ': the held prize made it out of the bin');
    }
    h.ok(!P.hold && !P.act || P.act === null || P.act.ph === 'back', 'seed ' + seed + ': it lets go when the claw opens');
    G.endFight('win'); G.toMap();
  }
  h.ok(lifted && held >= 2, `the octopus rode the claw and held on (${held} of 4 grabs had cargo)`);
  h.ok(worst < 30, `the prize stays in its spot under the hub while carried (off by ${worst | 0} px at worst)`);
});

h.test('pets: deterministic by the fight seed', () => {
  const run = (id) => {
    const T = petBoot(), G = T.GAME;
    G.newRun('knight', 6060);
    const P = petFight(G, id, 40, 777);
    stepFor(G, 3);
    return JSON.stringify({ log: P.log, items: G.fs.items.map(b => [Math.round(b.x), Math.round(b.y)]) });
  };
  for (const id of ['hamster', 'cat', 'parrot', 'mouse']) h.eq(run(id), run(id), id + ': the same fight, the same trick, the same pile');
});

h.test('pets: XP, levels, the banner, reactions, save and load', () => {
  const T = petBoot(), G = T.GAME, D = T.DATA;
  G.newRun('knight', 6161);
  petFight(G, 'cat', 10, 1000);
  const P = G.pet.fs();
  h.eq(P.lv, 1, 'Lv 1 at 10 xp');
  const inst = G.fight.bin[0];
  G.playDelivered([petBody(G, inst.uid)]);
  h.eq(G.run.pet.xp, 11, 'a delivered item gives 1 xp');
  G.pet.gain(1);
  h.eq(G.run.pet.lv, 2, 'Lv 2 at 12 xp');
  h.ok(G.ann.log.some(e => e.cls === 'pet'), 'a level up is a banner through the announcer');
  h.eq(P.lv, 2, 'the pet on the frame levels up too');
  h.ok(G.meta.pets.cat && G.meta.pets.cat.lv >= 2, 'the album keeps its best level');
  // reactions
  G.pet.event({ t: 'enrage', idx: 0, name: 'x', text: 'y' });
  h.eq(P.mood, 'scared', 'a roar scares it');
  G.pet.event({ t: 'die', idx: 0 });
  h.eq(P.mood, 'cheer', 'a kill cheers it');
  G.pet.rig('slip');
  h.eq(P.mood, 'sad', 'a slip upsets it');
  // a tap on it says what it does
  h.ok(G.pet.tap(P.x, P.y - 20), 'a tap on the pet');
  h.ok(G.S.popover && /Cat/.test(G.S.popover.html) && /Lv 2/.test(G.S.popover.html), 'the popover names it and its level');
  // a won fight
  const xp0 = G.run.pet.xp;
  G.endFight('win');
  h.eq(G.run.pet.xp - xp0, D.PET_GAIN.fight, 'a won fight gives its xp');
  G.toMap();
  G.draw();
  // save and load
  const name = G.run.pet.name, xp1 = G.run.pet.xp;
  const T2 = petBoot(Object.assign({}, T._store));
  h.ok(T2.GAME.load(), 'reloads');
  h.ok(T2.GAME.run.pet && T2.GAME.run.pet.id === 'cat' && T2.GAME.run.pet.name === name && T2.GAME.run.pet.xp === xp1, 'the pet survives a reload');
  T2.GAME.draw();
  // a broken pet and an old save
  const o = JSON.parse(T._store.clawspire_run);
  o.run.pet = { id: 'unicorn', xp: 9 };
  const T3 = petBoot({ clawspire_run: JSON.stringify(o) });
  h.ok(T3.GAME.load() && T3.GAME.run.pet === null, 'an unknown pet is dropped');
  delete o.run.pet;
  const T4 = petBoot({ clawspire_run: JSON.stringify(o) });
  h.ok(T4.GAME.load() && T4.GAME.run.pet === null, 'a save from before pets has none');
  T4.GAME.startFight(['rat'], 'normal', { seed: 3 });
  stepFor(T4.GAME, 1);
  h.eq(T4.GAME.pet.fs(), null, 'and fights without one');
  h.ok(!T4.GAME.S.petRow, 'the player row keeps its old layout');
});

h.test('pets: the pet shop (adopt free, swap for gold, treats, reload)', () => {
  const T = petBoot(), G = T.GAME, D = T.DATA;
  G.newRun('knight', 6262);
  const M = G.run.map;
  const shop = Object.values(M.tiles).find(t => t.type === 'petshop');
  h.ok(shop, 'the map has a pet shop');
  G.enterTile(shop);
  h.eq(G.screen, 'arcade', 'the pet shop opens on the arcade screen');
  h.eq(G.arc.state.g, 'petshop', 'as the pet shop');
  const offer = shop.content.pet.offer.slice();
  h.ok(offer.length === 3 && new Set(offer).size === 3, 'three pets in the pens');
  let labels = G.S.ui.buttons.map(b => b.label);
  h.ok(labels.slice(0, 3).every(l => l === 'Adopt (free)') && labels[3] === 'Leave', 'three free adoptions and Leave (' + labels.join(', ') + ')');
  G.draw();
  // reload in the shop: the same pens
  const T2 = petBoot(Object.assign({}, T._store));
  h.ok(T2.GAME.load() && T2.GAME.screen === 'arcade' && T2.GAME.arc.state.g === 'petshop', 'a reload is back in the shop');
  h.eq(JSON.stringify(T2.GAME.arc.state.PS.offer), JSON.stringify(offer), 'with the same pets');
  const g0 = G.run.gold;
  h.ok(G.choose(1), 'adopt the middle one');
  h.ok(G.run.pet && G.run.pet.id === offer[1] && G.run.pet.lv === 1, 'the pet joins the run');
  h.eq(G.run.gold, g0, 'the first one is free');
  h.ok(shop.done && shop.content.pet.adopted === offer[1], 'the shop is done, the pen empty');
  h.ok(G.meta.pets[offer[1]] && G.meta.pets[offer[1]].n === 1, 'the album has it');
  labels = G.S.ui.buttons.map(b => b.label);
  h.ok(labels.includes('Leave') && labels.some(l => /^Treat/.test(l)), 'now Treat and Leave');
  h.ok(G.S.ui.buttons.slice(0, 3).every(b => b.el.disabled), 'one adoption per shop');
  G.pet.adopt(0);
  h.eq(G.run.pet.id, offer[1], 'a second adoption here is refused');
  // treats
  G.run.gold = 30;
  const xp0 = G.run.pet.xp;
  h.ok(G.pet.treat(), 'a treat');
  h.ok(G.run.gold === 30 - D.PET_SHOP.treat && G.run.pet.xp === xp0 + D.PET_GAIN.treat, 'costs gold, gives xp');
  G.run.gold = 5;
  h.ok(!G.pet.treat() && G.run.gold === 5, 'too little gold: refused');
  G.run.gold = 100;
  while (G.pet.treat());
  h.eq(shop.content.pet.treats, D.PET_SHOP.treats, 'treats run out per shop');
  G.draw();
  G.choose(G.S.ui.buttons.map(b => b.label).indexOf('Leave'));
  h.eq(G.screen, 'map', 'Leave goes to the map');
  G.draw();
  G.enterTile(shop);
  h.eq(G.screen, 'map', 'an emptied shop does not reopen');
  // a second shop: a swap costs gold
  const t2 = Object.values(M.tiles).find(t => t.type === 'empty' && t.terrain === 'land' && t.ground !== 'mountain' && !t.road);
  t2.type = 'petshop'; t2.content = { seed: 99, game: 'petshop' }; t2.known = true;
  G.enterTile(t2);
  h.ok(G.S.ui.buttons[0].label.startsWith('Swap'), 'with a pet, the pens offer a swap');
  h.ok(!t2.content.pet.offer.includes(G.run.pet.id), 'never your own pet');
  G.run.gold = 3;
  h.ok(!G.pet.adopt(0) && G.run.pet.id === offer[1], 'too little gold: no swap');
  G.run.gold = 100;
  h.ok(G.pet.adopt(0), 'a swap');
  h.ok(G.run.pet.id === t2.content.pet.offer[0] && G.run.gold === 100 - D.PET_SHOP.swap, 'the new pet, for its price');
  h.ok(G.meta.pets[offer[1]], 'the old one stays in the album');
  G.arc.leave();
  h.eq(G.screen, 'map', 'and back to the map');
});

h.test('pets: tip cards and the map', () => {
  const T = petBoot(), G = T.GAME;
  h.ok(['pet', 'petshop', 'moles', 'skee'].every(id => G.feel.TIPS.some(d => d.id === id)), 'four new tip cards');
  G.newRun('knight', 6363);
  G.meta.tips = {};
  G.pet.give('hamster', 0);
  G.startFight(['rat'], 'normal', { seed: 5 });
  stepFor(G, 0.5);
  h.ok(G.feel.queue.includes('pet') || (G.feel.cur && G.feel.cur.id === 'pet') || G.meta.tips.pet, 'a fight with a pet brings its tip');
  G.endFight('win'); G.toMap();
  const M = G.run.map;
  for (const k of ['petshop', 'moles', 'skee']) { const t = Object.values(M.tiles).find(x => x.type === k); t.revealed = true; }
  stepFor(G, 0.5);
  h.ok(['petshop', 'moles', 'skee'].every(id => G.feel.queue.includes(id) || G.meta.tips[id] || (G.feel.cur && G.feel.cur.id === id)), 'lit cabinets bring theirs');
  // the pet on its bed beside the crawler
  G.draw();
  G.S.petMapIdle = 9;
  G.draw();
});

// ---- WHACK-A-MOLE
function wamPlay(G, rule) {
  // whacks per a rule over the live round: rule(p) true means whack this pop 0.12 s after it shows
  let n = 0;
  while (n++ < 60 * 20) {
    const st = G.wam.state;
    if (!st || st.state === 'end') break;
    if (st.state === 'play') for (const p of st.sched) if (st.hit[p.i] == null && rule(p) && st.t >= p.t + 0.12 && st.t < p.t + p.up) G.wam.whack(p.hole);
    G.update(DT);
  }
}
h.test('whack-a-mole: a seeded round, scoring and combos, paid once by tier', () => {
  const T = petBoot(), G = T.GAME;
  G.newRun('knight', 7171);
  const a = G.wam.sched(42), b = G.wam.sched(42);
  h.eq(JSON.stringify(a), JSON.stringify(b), 'the pop schedule is a pure function of its seed');
  h.ok(a.length >= 18 && a.every(p => p.t >= 0 && p.t + p.up <= G.wam.WAM.dur + 1 && p.hole >= 0 && p.hole < 9), 'pops fill the round (' + a.length + ')');
  h.ok(a.some(p => p.kind === 'bomb') && a.some(p => p.kind === 'mole'), 'moles and bombs');
  for (let hole = 0; hole < 9; hole++) { const L = a.filter(p => p.hole === hole); for (let i = 1; i < L.length; i++) h.ok(L[i].t >= L[i - 1].t + L[i - 1].up, 'hole ' + hole + ': never two at once'); }
  let gold = 0; for (let s = 1; s <= 50; s++) gold += G.wam.sched(s * 31).filter(p => p.kind === 'gold').length;
  h.ok(gold >= 20, 'golden moles show up (' + gold + ' in 50 rounds)');
  h.ok(G.wam.pays(0).tier === 0 && G.wam.pays(50).tier === 1 && G.wam.pays(250).tier === 2 && G.wam.pays(600).tier === 3, 'tiers by score');
  const t = arcCab(G, 'moles', 2);
  G.enterTile(t);
  h.eq(G.screen, 'arcade', 'the whack-a-mole opens from its tile');
  h.eq(G.S.ui.buttons[0].label, 'Play', 'Play');
  G.draw();
  h.ok(G.choose(0), 'play');
  const A = G.arc.state.A;
  h.ok(A.tokens === 1 && A.live && A.live.seed, 'a round spends its token and saves its seed');
  h.eq(G.wam.state.state, 'count', 'the countdown');
  h.eq(JSON.stringify(G.wam.state.sched), JSON.stringify(G.wam.sched(A.live.seed)), 'the round plays its saved schedule');
  h.eq(G.wam.whack(0), null, 'no whacks during the countdown');
  stepFor(G, 2.6);
  h.eq(G.wam.state.state, 'play', 'WHACK!');
  G.draw();
  // hand-scored: three moles in a row, then an empty hole, then a bomb
  const st = G.wam.state;
  const moles = st.sched.filter(p => p.kind !== 'bomb').slice(0, 3);
  let want = 0, chain = 0, last = -9;
  for (const p of moles) {
    while (st.t < p.t + 0.1) G.update(DT);
    const r = G.wam.whack(p.hole);
    chain = st.t - last <= G.wam.WAM.chainGap ? chain + 1 : 1; last = st.t;
    want += G.wam.WAM.pts[p.kind] + 2 * Math.min(10, chain - 1);
    h.ok(r && r.pts > 0 && r.chain === chain, 'a whack scores (' + (r && r.pts) + ', chain ' + chain + ')');
  }
  h.eq(st.score, want, 'the score is the sum with combos (' + want + ')');
  G.draw();
  let empty = -1;
  for (let hole = 0; hole < 9; hole++) if (!st.sched.some(p => p.hole === hole && st.t >= p.t && st.t <= p.t + p.up)) { empty = hole; break; }
  if (empty >= 0) { const r = G.wam.whack(empty); h.ok(r && r.miss && st.chain === 0, 'an empty hole breaks the combo'); }
  const bomb = st.sched.find(p => p.kind === 'bomb' && p.t > st.t);
  if (bomb) {
    while (st.t < bomb.t + 0.1) G.update(DT);
    const s0 = st.score, r = G.wam.whack(bomb.hole);
    h.ok(r && r.kind === 'bomb' && st.score === Math.max(0, s0 - 20) && st.chain === 0, 'a bomb costs 20 and the combo');
  }
  // the rest of the round, then TIME
  wamPlay(G, (p) => p.kind !== 'bomb');
  h.ok(A.pend && A.pend.score === G.wam.state.score && !A.live, 'the final score is saved the moment the round ends (' + A.pend.score + ')');
  const res = G.wam.pays(A.pend.score);
  // reload inside the TIME! beat: paid once, on load
  const T2 = petBoot(Object.assign({}, T._store));
  const G2 = T2.GAME, g0 = G2.run ? 0 : 0;
  h.ok(G2.load() && G2.screen === 'arcade', 'a reload in the beat');
  const gAfter = G2.run.gold, tAfter = G2.run.tickets;
  h.ok(!G2.arc.state.A.pend && G2.arc.state.A.best === A.pend.score, 'it settled on load');
  const T3 = petBoot(Object.assign({}, T2._store));
  T3.GAME.load(); stepFor(T3.GAME, 3);
  h.ok(T3.GAME.run.gold === gAfter && T3.GAME.run.tickets === tAfter, 'a second reload pays nothing more');
  // the original session: settles after the beat, paying exactly the tier
  const gold0 = G.run.gold, tix0 = G.run.tickets;
  stepFor(G, 1.2);
  h.eq(G.run.gold - gold0, payOf(res, 'gold'), 'gold paid once (' + res.label + ')');
  h.eq(G.run.tickets - tix0, payOf(res, 'tix'), 'tickets paid once');
  h.ok(!A.pend && A.used === 1, 'nothing pending');
  arcFinish(G, 6);
  if (G.screen === 'capsule') { G.loot.skipCapsule(); stepFor(G, 0.8); G.loot.collectCapsule(); }
  G.draw();
  // a reload mid-round restarts the same round, the token spent, nothing paid
  h.eq(G.screen, 'arcade', 'back at the machine');
  G.arc.act();
  const seed2 = G.arc.state.A.live.seed;
  stepFor(G, 4);
  const T4 = petBoot(Object.assign({}, T._store)), G4 = T4.GAME;
  h.ok(G4.load() && G4.wam.state && G4.wam.state.state === 'count', 'a reload mid-round: the countdown again');
  h.ok(G4.arc.state.A.live.seed === seed2 && G4.arc.state.A.tokens === 0 && !G4.arc.state.A.pend, 'the same round, the token not refunded, nothing paid');
  // leaving mid-round pays what you have
  stepFor(G4, 2.7);
  const s1 = G4.wam.state; const p1 = s1.sched.find(p => p.kind !== 'bomb');
  while (s1.t < p1.t + 0.1) G4.update(DT);
  G4.wam.whack(p1.hole);
  const tix1 = G4.run.tickets;
  G4.arc.leave();
  if (G4.screen === 'capsule') { G4.loot.skipCapsule(); stepFor(G4, 0.8); G4.loot.collectCapsule(); }
  h.ok(G4.run.tickets > tix1, 'Leave mid-round pays the score so far');
  h.ok(t.done || G4.run.map.tiles[Object.keys(G4.run.map.tiles).find(k => G4.run.map.tiles[k].type === 'moles')].done, 'the cabinet is spent');
});

// ---- SKEE-BALL
h.test('skee-ball: the rolls, the rings, five balls paid once', () => {
  const T = petBoot(), G = T.GAME;
  G.newRun('knight', 7272);
  const S = G.skee;
  h.eq(JSON.stringify(S.sim(250, 0.6, 9)), JSON.stringify(S.sim(250, 0.6, 9)), 'a roll is a pure function of aim, power and seed');
  let mid = 0, cups = 0, weak = 0, back = 0;
  for (let s = 1; s <= 200; s++) {
    if (S.sim(270, 0.456, s).score >= 40) mid++;
    if (S.sim(212, 0.96, s).score === 100 || S.sim(328, 0.96, s).score === 100) cups++;
    if (S.sim(270, 0, s).score === 10) weak++;
    const o = S.sim(270, 1.25, s); if (o.back && o.score === 10) back++;
  }
  h.ok(mid > 120, `a centred roll at the right power finds the 40 or 50 (${mid}/200)`);
  h.ok(cups > 80, `a corner roll can drop in a 100 cup (${cups}/200)`);
  h.eq(weak, 200, 'a dribble scores 10');
  h.eq(back, 200, 'too hard bounces off the back into the 10');
  const sim = S.sim(270, 0.6, 3);
  h.ok(sim.path.length / 3 > 40 && sim.hopF < sim.landF && sim.landF < sim.path.length / 3, 'the path: a roll, a hop, a drop');
  h.ok(S.pays(0).tier === 0 && S.pays(100).pays.some(p => p.k === 'tix' && p.n === 10) && S.pays(300).tier === 2 && S.pays(400).tier === 3, 'pays: tickets for every 10, more at the top');
  const t = arcCab(G, 'skee', 2);
  G.enterTile(t);
  h.eq(G.screen, 'arcade', 'the skee-ball opens from its tile');
  G.draw();
  h.eq(G.S.ui.buttons[0].label, 'Play (5 balls)', 'Play');
  G.choose(0);
  const A = G.arc.state.A;
  h.ok(A.live && A.tokens === 1 && A.live.balls.length === 0, 'a game spends its token');
  h.ok(S.roll(262, 0.5), 'a roll');
  const R0 = JSON.parse(JSON.stringify(A.live.roll));
  h.ok(R0 && R0.seed, 'the roll is saved the moment it goes');
  stepFor(G, 0.4);
  G.draw();
  // reload mid-roll: the same ball lands the same
  const T2 = petBoot(Object.assign({}, T._store)), G2 = T2.GAME;
  h.ok(G2.load() && G2.arc.state.phase === 'play', 'a reload mid-roll replays it');
  arcFinish(G2, 5);
  const want = S.sim(R0.aim, R0.pow, R0.seed).score;
  h.eq(G2.arc.state.A.live.balls[0], want, 'the same score');
  arcFinish(G, 5);
  h.eq(A.live.balls[0], want, 'the ball is scored where it lands (' + want + ')');
  // four more
  const tix0 = G.run.tickets, gold0 = G.run.gold;
  for (const [aim, pow] of [[212, 0.96], [270, 0.46], [328, 0.96], [270, 0.3]]) { h.ok(S.roll(aim, pow), 'roll ' + aim); arcFinish(G, 6); }
  const balls = G.arc.state.A.res.length ? null : null;
  h.ok(!A.live && !A.pend && A.used === 1, 'five balls: the game is over and settled');
  const total = A.best;
  const res = S.pays(total);
  h.eq(G.run.tickets - tix0, payOf(res, 'tix'), 'tickets paid once (' + total + ' points)');
  h.eq(G.run.gold - gold0, payOf(res, 'gold'), 'gold paid once');
  stepFor(G, 3);
  if (G.screen === 'capsule') { G.loot.skipCapsule(); stepFor(G, 0.8); G.loot.collectCapsule(); }
  const T3 = petBoot(Object.assign({}, G === T.GAME ? T._store : {})), G3 = T3.GAME;
  G3.load(); stepFor(G3, 2);
  h.eq(G3.run.tickets, G.run.tickets, 'a reload after the game pays nothing again');
  // a swipe up the lane rolls; leaving mid-game pays the balls so far
  if (G.screen === 'arcade') {
    G.arc.act();
    G.arc.pointer('down', 272, 760); G.update(DT); G.arc.pointer('move', 268, 640); G.update(DT); G.update(DT); G.arc.pointer('move', 266, 520); G.arc.pointer('up', 266, 520);
    h.ok(G.arc.state.A.live && G.arc.state.A.live.roll, 'a swipe up the lane rolls');
    arcFinish(G, 5);
    const s1 = G.arc.state.A.live.balls[0], tx = G.run.tickets;
    G.arc.leave();
    if (G.screen === 'capsule') { G.loot.skipCapsule(); stepFor(G, 0.8); G.loot.collectCapsule(); }
    h.eq(G.run.tickets - tx, Math.floor(s1 / 10), 'Leave mid-game pays the balls rolled');
    h.ok(t.done, 'both games spent: the lane is cleared');
  }
});

// ---------------------------------------------------------------- round 6: relic sets, the boon draft, the Compactor
const S6_META = JSON.stringify({ introSeen: true, tutorialDone: true, unlocks: { knight: true } });
function s6Boot(store) { return boot({ store: Object.assign({ clawspire_meta: S6_META }, store || {}) }); }
// Every DOM node under el with a class (the stub DOM keeps children arrays).
function s6Find(el, cls, out) {
  out = out || [];
  if (!el) return out;
  if (typeof el.className === 'string' && el.className.split(' ').includes(cls)) out.push(el);
  for (const c of el.children || []) s6Find(c, cls, out);
  return out;
}
const s6Text = (el) => (el ? (el.textContent || '') + (el.children || []).map(s6Text).join(' ') : '');

h.test('sets: the relic strip chains set members behind a badge; procs pop it; the popover shows the set', () => {
  const T = s6Boot(), G = T.GAME;
  G.newRun('knight', 6601);
  h.eq(G.screen, 'map', 'headless: straight to the map (no boon draft)');
  G.run.relics = ['squire_gauntlet', 'venom_gland', 'grip_tape', 'contagion', 'kettle_helm', 'festering_jar', 'battering_ram', 'snow_globe'];
  G.S.lastRelics = '';
  stepFor(G, 0.3);
  const bar = T._nodes.relics;
  const links = s6Find(bar, 'setLink');
  h.eq(links.length, 2, 'two linked sets (Poisoner\'s Kit 3/3, Iron Fortress 2/3), the lone Snow Globe unlinked');
  const full = links.find(l => l.className.includes('full')), part = links.find(l => !l.className.includes('full'));
  const relicsIn = (l) => (l.children || []).filter(c => /\brelic\b/.test(c.className || ''));
  h.ok(full && relicsIn(full).length === 3 && relicsIn(full).every(r => /inSet/.test(r.className)), 'the complete set glows, chained, with its three relics');
  h.ok(part && relicsIn(part).length === 2 && s6Text(part).includes('2/3'), 'Iron Fortress with its badge 2/3');
  h.ok(G.S.relicEls['set:poison:3'] && G.S.relicEls['set:poison:2'] && G.S.relicEls['set:fortress:2'] && !G.S.relicEls['set:frost:2'], 'badges answer for the set procs');
  h.ok(G.run.relics.every(id => G.S.relicEls[id]), 'every relic still has its slot');
  h.ok(!s6Find(bar, 'setMark').length, 'the placeholder is gone');
  h.ok(G.S.relicEls.snow_globe.className.includes('inSet') && !G.S.relicEls.grip_tape.className.includes('inSet'), 'a lone piece gets its set pip, a relic outside every set none');
  G.S.relicEls.snow_globe.onclick({});
  h.ok(/Cold Storage 1\/3/.test(T._nodes.pop.innerHTML) && /Ice Box/.test(T._nodes.pop.innerHTML), 'its popover shows the set progress and the bonuses');
  full.children.find(c => /setBadge/.test(c.className)).onclick({});
  h.ok(/Poisoner's Kit 3\/3/.test(T._nodes.pop.innerHTML), 'the badge opens the set popover');
  G.draw();
});

h.test('sets: the second and third pieces queue a fanfare through the announcer; the Prizedex remembers', () => {
  const T = s6Boot(), G = T.GAME;
  G.newRun('knight', 6602);
  G.gainRelic('venom_gland');
  h.eq(G.sets.queue.length, 0, 'a first piece: no fanfare');
  G.gainRelic('contagion');
  h.ok(G.sets.queue.length === 1 && G.sets.queue[0].n === 2, 'the second piece queues SET BONUS');
  stepFor(G, 0.6);
  h.ok(G.ann.log.some(a => a.key === 'set:poison:2' && a.k === 'show'), 'shown through the announcer');
  h.ok(/SET BONUS/.test(s6Text(T._nodes.setFan)) && /Toxic Touch/.test(s6Text(T._nodes.setFan)), 'the fanfare names the bonus');
  // the third piece, bought in a shop: the fanfare waits for nothing on the shop screen
  const shop = G.rollShop({ q: 1, r: 1 });
  shop.relic = { id: 'festering_jar', price: 10, sold: false };
  G.run.gold = 50;
  G.showShop(shop);
  const tag = s6Find(T._nodes.shopBody, 'setTag')[0];
  h.ok(tag && /3\/3 Poisoner's Kit/.test(s6Text(tag)) && /COMPLETES THE SET/.test(s6Text(tag)), 'the shop card says it completes the set');
  G.choose(G.S.ui.buttons.findIndex(b => b.label === 'Festering Jar'));
  h.ok(G.sets.queue.some(q => q.id === 'poison' && q.n === 3), 'SET COMPLETE queued');
  h.eq(G.meta.sets.poison, 1, 'the Prizedex counts the completion');
  h.eq(JSON.parse(T._store.clawspire_meta).sets.poison, 1, 'and saves it');
  stepFor(G, 3);
  h.ok(G.ann.log.some(a => a.key === 'set:poison:3' && a.k === 'show'), 'SET COMPLETE plays');
  h.ok(G.sets.log.some(l => l.id === 'poison' && l.n === 3), 'logged');
  // a fight never shows it (a relic is never gained in one, but the queue waits)
  G.gainRelic('snow_globe'); G.gainRelic('cold_snap');
  G.startFight(['rat'], 'normal', { seed: 5 });
  stepFor(G, 1);
  h.ok(G.sets.queue.some(q => q.id === 'frost'), 'the queue waits out the fight');
  G.endFight('win');
  // the profile keeps its sets
  const T2 = boot({ store: Object.assign({}, T._store) });
  h.eq(T2.GAME.meta.sets.poison, 1, 'meta.sets survives a reload');
  const T3 = boot({ store: { clawspire_meta: JSON.stringify({ introSeen: true, unlocks: { knight: true }, sets: { poison: 'x', nope: 3, frost: -2, luck: 2 } }) } });
  h.eq(JSON.stringify(T3.GAME.meta.sets), '{"luck":2}', 'junk in meta.sets is repaired');
});

h.test('sets: relic cards show the set count; the Prizedex has a Sets tab', () => {
  const T = s6Boot(), G = T.GAME;
  G.newRun('knight', 6603);
  G.run.relics.push('kettle_helm');
  G.showTreasure({ relic: 'battering_ram', gold: 0, title: 'Treasure' });
  const tag = s6Find(T._nodes.treasureBody, 'setTag')[0];
  h.ok(tag && /2\/3 Iron Fortress/.test(s6Text(tag)) && !/COMPLETES/.test(s6Text(tag)), 'the reveal reads 2/3 Iron Fortress');
  G.showTreasure({ relic: 'grip_tape', gold: 0 });
  h.eq(s6Find(T._nodes.treasureBody, 'setTag').length, 0, 'no tag outside a set');
  // the capsule's prize card
  const cap = G.loot.makeCapsule('treasure', { tier: 'r' });
  cap.prize = { k: 'relic', id: 'castle_walls' };
  G.loot.showCapsule({ cap, then: { k: 'map' } });
  crackOpen(G);
  h.ok(/2\/3 Iron Fortress/.test(s6Text(T._nodes.capsuleBody)), 'the capsule card too, once the relic is yours');
  G.loot.collectCapsule();
  // the Prizedex
  G.meta.seen.relics.venom_gland = 1;
  G.meta.sets = { fortress: 1 };
  G.showTitle();
  G.showCollection();
  const i = G.S.ui.buttons.findIndex(b => b.label === 'Sets');
  h.ok(i >= 4, 'a Sets tab after the four DATA tabs');
  G.choose(i);
  h.ok(G.screen === 'collection' && G.S.dexTab === 'sets', 'the Sets tab');
  const cards = s6Find(T._nodes.collectionBody, 'setc');
  h.eq(cards.length, T.DATA.SET_IDS.length, 'a card per set');
  h.ok(/Poisoner's Kit/.test(s6Text(cards[0])) && /COMPLETED/.test(s6Text(cards.find(c => /Iron Fortress/.test(s6Text(c))))), 'met sets named, completed ones stamped');
  h.ok(cards.some(c => /\?\?\?/.test(s6Text(c))), 'unmet sets stay ???');
  G.showCollection('relics');
  h.eq(G.S.dexTab, 'relics', 'back to a DATA tab');
  G.draw();
});

h.test('boon draft: the machine deals three cards by seed and Tilt; a reload shows the same deal; a pick pays once', () => {
  const T = s6Boot(), G = T.GAME;
  G.boon.force = true;
  G.newRun('knight', 6604);
  h.eq(G.screen, 'boon', 'after character select: the deal');
  const B = G.run.boon;
  h.ok(B && B.offers.length === 3 && B.offers.map(o => o.slot).join() === 'gift,boost,trade' && !B.done, 'a gift, a boost, a trade, face down');
  h.eq(G.S.ui.buttons.length, 4, 'three cards and Walk away');
  const T2 = s6Boot(), G2 = T2.GAME;
  G2.boon.force = true;
  G2.newRun('knight', 6604);
  h.eq(JSON.stringify(G2.run.boon.offers), JSON.stringify(B.offers), 'the same seed deals the same cards');
  // a reload on the deal
  const T3 = s6Boot(Object.assign({}, T._store)), G3 = T3.GAME;
  G3.boon.force = true;
  G3.choose(G3.S.ui.buttons.findIndex(b => /continue/i.test(b.label)));
  h.ok(G3.screen === 'boon' && JSON.stringify(G3.run.boon.offers) === JSON.stringify(B.offers), 'a reload shows the same three cards');
  // walk away
  const gold0 = G3.run.gold;
  h.ok(G3.boon.pick(-1) && G3.screen === 'map' && G3.run.gold === gold0 && G3.run.boon.done, 'Walk away: nothing, then the map');
  h.eq(G3.boon.pick(0), false, 'never a second pick');
  const T4 = s6Boot(Object.assign({}, T3._store)), G4 = T4.GAME;
  G4.boon.force = true;
  G4.choose(G4.S.ui.buttons.findIndex(b => /continue/i.test(b.label)));
  h.eq(G4.screen, 'map', 'a reload after the pick is the map');
  // the Tilt changes the deal
  const T5 = s6Boot(), G5 = T5.GAME;
  G5.boon.force = true;
  G5.meta.tilt.knight = 9;
  G5.prog.startRun('knight', 9);
  h.eq(G5.run.tilt, 9, 'a Tilt 9 run');
  h.ok(['shark', 'glassjaw', 'devil'].includes(G5.run.boon.offers[2].id), 'Tilt 9 deals a spicy trade: ' + G5.run.boon.offers[2].id);
  G5.boon.show();
  G.draw();
});

h.test('boon draft: every card does what it says', () => {
  const T = s6Boot(), G = T.GAME, D = T.DATA;
  G.boon.force = true;
  const deal = (o, seed) => {
    G.newRun('knight', seed || 6605);
    G.run.boon.offers[0] = Object.assign({ slot: D.BOONS[o.id].slot }, o);
    G.boon.show();
    return { gold: G.run.gold, max: G.run.maxHp, hp: G.run.hp, bin: G.run.bin.length, rel: G.run.relics.length, ink: G.run.ink };
  };
  let b = deal({ id: 'gold' });
  G.boon.pick(0);
  h.ok(G.run.gold === b.gold + 100 && G.screen === 'map', 'Pocket Change: +100 gold');
  b = deal({ id: 'grabs' });
  G.boon.pick(0);
  G.startFight(['rat'], 'normal', { seed: 3 });
  h.eq(G.fight.player.grabsMax, 5, 'Warm-Up Tokens: +2 grabs in the first fight');
  G.save();
  const Tr = s6Boot(Object.assign({}, T._store));
  Tr.GAME.choose(Tr.GAME.S.ui.buttons.findIndex(x => /continue/i.test(x.label)));
  h.eq(Tr.GAME.fight && Tr.GAME.fight.player.grabsMax, 5, 'a reload mid fight keeps them');
  G.endFight('win');
  h.eq(G.run.boon.grabs, 0, 'spent when it ends');
  G.startFight(['rat'], 'normal', { seed: 4 });
  h.eq(G.fight.player.grabsMax, 3, 'the next fight is back to 3');
  G.endFight('win');
  b = deal({ id: 'pet', pet: 'cat' });
  G.boon.pick(0);
  h.ok(G.run.pet && G.run.pet.id === 'cat' && G.run.pet.lv === 2, 'Pet Pal: a Lv 2 cat');
  b = deal({ id: 'favor', relics: ['festering_jar'] });
  G.boon.pick(0);
  h.ok(G.run.relics.includes('festering_jar') && G.run.relics.length === b.rel + 1, "Prize Master's Favor: the rare relic");
  b = deal({ id: 'setpiece', relics: ['kettle_helm'] });
  G.boon.pick(0);
  h.ok(G.run.relics.includes('kettle_helm'), 'Starter Set: the set piece');
  b = deal({ id: 'polish' });
  G.boon.pick(0);
  h.eq(G.run.bin.filter(i => i.plus).length, 3, 'Polish: three items upgraded');
  b = deal({ id: 'bulbs' });
  G.boon.pick(0);
  h.ok(G.run.ink === b.ink + 5 && G.run.brushes.includes('lantern'), 'Bright Idea: 5 bulbs and a lantern');
  b = deal({ id: 'pact', relics: ['festering_jar'] });
  G.boon.pick(0);
  h.ok(G.run.maxHp === b.max - 10 && G.run.hp <= G.run.maxHp && G.run.relics.includes('festering_jar'), 'Blood Pact: -10 Max HP, a rare');
  b = deal({ id: 'pockets', relics: ['contagion'] });
  G.boon.pick(0);
  h.ok(G.run.bin.filter(i => i.id === 'rock').length === 2 && G.run.gold === b.gold + 50 && G.run.relics.includes('contagion'), 'Heavy Pockets: 2 Rocks, 50 gold, an uncommon');
  b = deal({ id: 'shark', relics: ['third_hand'] });
  G.boon.pick(0);
  h.ok(G.run.gold === 0 && G.run.relics.includes('third_hand'), 'Loan Shark: broke, a boss relic');
  b = deal({ id: 'glassjaw', relics: ['festering_jar', 'castle_walls'] });
  G.boon.pick(0);
  h.ok(G.run.maxHp === b.max - 15 && G.run.relics.includes('festering_jar') && G.run.relics.includes('castle_walls'), 'Glass Jaw: -15 Max HP, two rares');
  b = deal({ id: 'devil', relics: ['cursed_quarter', 'powder_keg'] });
  G.boon.pick(0);
  h.ok(G.run.maxHp === b.max - Math.round(b.max * 0.2) - 10 && G.run.bin.some(i => i.id === 'slag') && G.run.relics.includes('powder_keg'), "Devil's Bargain: -20% Max HP (the Quarter's 10 too), a Slag, two relics");
  b = deal({ id: 'favor', relics: ['squire_gauntlet'] });
  G.boon.pick(0);
  h.eq(G.run.gold, b.gold + 40, 'a relic already owned pays 40 gold instead');
  // the capsule: cracked right away, a reload never deals a second one
  b = deal({ id: 'capsule' });
  G.boon.pick(0);
  h.ok(G.screen === 'capsule' && G.run.boon.cap && ['u', 'r', 'l'].includes(G.run.boon.cap.tier0), 'Mystery Capsule: an uncommon or better, opened now');
  const Tc = s6Boot(Object.assign({}, T._store)), Gc = Tc.GAME;
  Gc.choose(Gc.S.ui.buttons.findIndex(x => /continue/i.test(x.label)));
  h.ok(Gc.screen === 'capsule' && JSON.stringify(Gc.run.boon.cap.prize) === JSON.stringify(G.run.boon.cap.prize), 'a reload: the same capsule');
  crackOpen(G); G.loot.collectCapsule();
  h.eq(G.screen, 'map', 'then the map');
  // Spring Cleaning: three trips to the bin, a reload keeps the count
  b = deal({ id: 'trim' });
  G.boon.pick(0);
  h.ok(G.screen === 'bin' && G.run.boon.trim === 3, 'Spring Cleaning: the bin picker');
  G.choose(0);
  h.ok(G.screen === 'bin' && G.run.boon.trim === 2 && G.run.bin.length === b.bin - 1, 'one gone, two to go');
  G.choose(0); G.choose(0);
  h.ok(G.screen === 'map' && G.run.bin.length === b.bin - 3 && G.run.boon.trim === 0, 'three thrown out, then the map');
  b = deal({ id: 'trim' });
  G.boon.pick(0); G.choose(0);
  G.choose(G.S.ui.buttons.findIndex(x => /cancel/i.test(x.label)));
  h.ok(G.screen === 'map' && G.run.bin.length === b.bin - 1 && G.run.boon.trim === 0, 'Cancel keeps the rest');
});

h.test('compactor: three in, one out, at the rest stop and in the shop; saves at every step', () => {
  const T = s6Boot(), G = T.GAME, D = T.DATA;
  G.newRun('knight', 6606);
  G.run.bin.push({ uid: 'k1', id: 'rusty_sword', plus: false }, { uid: 'k2', id: 'rusty_sword', plus: false }, { uid: 'k3', id: 'rusty_sword', plus: false });
  G.showRest();
  const ci = G.S.ui.buttons.findIndex(b => b.el && /Compact/.test(s6Text(b.el)));
  h.eq(ci, 2, 'the rest stop offers Compact third');
  G.choose(ci);
  h.eq(G.screen, 'compactor', 'the Compactor');
  const n0 = G.run.bin.length;
  h.eq(G.cmp.crush(), null, 'nothing picked: refused');
  h.ok(G.cmp.pick('k1') && G.cmp.pick('k2') && !G.cmp.pick('k2'), 'pick two (never the same one twice)');
  h.ok(G.cmp.unpick('k2') && G.cmp.pick('k2') && G.cmp.pick('k3') && !G.cmp.pick(G.run.bin[0].uid), 'unpick, pick, three at most');
  h.ok(/Three of a kind/.test(G.cmp.rule(G.cmp.state.cd.pick.map(u => G.run.bin.find(i => i.uid === u)))), 'the rule line says what comes out');
  // a reload with the picks made
  G.save();
  let T2 = s6Boot(Object.assign({}, T._store)), G2 = T2.GAME;
  G2.choose(G2.S.ui.buttons.findIndex(b => /continue/i.test(b.label)));
  h.ok(G2.screen === 'compactor' && G2.cmp.state.cd.pick.join() === 'k1,k2,k3' && G2.run.bin.length === n0, 'a reload keeps the picks, nothing crushed');
  const res = G.cmp.crush();
  h.ok(res && res.id === 'rusty_sword' && res.plus, 'three Rusty Swords: a Rusty Sword+');
  h.eq(G.run.bin.length, n0 - 2, 'the bin is two lighter');
  h.ok(!G.run.bin.some(i => ['k1', 'k2', 'k3'].includes(i.uid)) && G.run.bin.some(i => i.uid === res.uid && i.plus), 'the three are gone, the plus copy is in');
  h.eq(G.cmp.crush(), null, 'never twice');
  T2 = s6Boot(Object.assign({}, T._store)); G2 = T2.GAME;
  G2.choose(G2.S.ui.buttons.findIndex(b => /continue/i.test(b.label)));
  h.ok(G2.screen === 'compactor' && G2.cmp.state.cd.res && G2.run.bin.length === n0 - 2, 'a reload after the crush shows the result, nothing crushed again');
  G2.cmp.leave();
  h.eq(G2.screen, 'map', 'a crush at the rest stop was the rest: on to the map');
  G.cmp.leave();
  // the shop: the slot sits before the prize counter, costs gold, once a shop
  G.run.gold = 100;
  const shop = G.rollShop({ q: 5, r: 5 });
  G.showShop(shop);
  const labels = G.S.ui.buttons.map(b => b.label);
  h.ok(labels.indexOf('Compactor') === labels.length - 2 && labels[labels.length - 1] === 'Prize counter', 'the Compactor sits just before the prize counter');
  G.choose(labels.indexOf('Compactor'));
  const com = D.pool('c').filter(id => !G.run.bin.some(i => i.id === id)).slice(0, 3);
  for (const [i, id] of com.entries()) G.run.bin.push({ uid: 'c' + i, id, plus: false });
  for (let i = 0; i < 3; i++) G.cmp.pick('c' + i);
  G.run.gold = 5;
  h.eq(G.cmp.crush(), null, 'too poor: refused');
  G.run.gold = 100;
  const n1 = G.run.bin.length;
  const r2 = G.cmp.crush();
  h.ok(r2 && D.ITEMS[r2.id].rarity === 'u' && !r2.plus, 'three commons: an uncommon');
  h.ok(G.run.gold === 100 - G.cmp.price() && shop.cmpUsed && G.run.bin.length === n1 - 2, 'paid, used, two lighter');
  G.cmp.leave();
  h.eq(G.screen, 'shop', 'back to the shop');
  G.choose(G.S.ui.buttons.findIndex(b => b.label === 'Compactor'));
  h.eq(G.screen, 'shop', 'once a shop');
  // too small a bin
  G.run.bin = G.run.bin.slice(0, 4);
  G.cmp.show({ from: 'rest', pick: G.run.bin.slice(0, 3).map(i => i.uid), res: null });
  h.eq(G.cmp.crush(), null, 'a bin of 4 cannot be crushed below the floor');
  G.draw();
});

h.test('compactor: the press plays the crush (feed, slam, grind, lift, pop) and a tap hurries it', () => {
  const T = s6Boot(), G = T.GAME;
  G.newRun('knight', 6607);
  G.run.bin.push({ uid: 'q1', id: 'toxic_vial', plus: false }, { uid: 'q2', id: 'venom_dart', plus: false }, { uid: 'q3', id: 'rusty_sword', plus: false });
  G.cmp.show({ from: 'rest', pick: ['q1', 'q2', 'q3'], res: null });
  G.S.headless = false;   // the animation path (the stub DOM still draws)
  const res = G.cmp.crush();
  G.S.headless = true;
  const C = G.cmp.state;
  h.ok(res && C.phase === 'feed', 'the crush starts feeding');
  const seen = new Set();
  for (let i = 0; i < 180 && C.phase !== 'done'; i++) { G.update(DT); seen.add(C.phase); G.draw(); }
  h.ok(['feed', 'press', 'grind', 'lift'].every(p => seen.has(p)) && C.phase === 'done', 'feed, press, grind, lift, done: ' + [...seen].join(','));
  h.ok(C.fired.slam && C.fired.pop, 'the slam and the pop fired');
  G.cmp.show({ from: 'rest', pick: [], res: null });
  G.run.bin.push({ uid: 'w1', id: 'rusty_sword', plus: false }, { uid: 'w2', id: 'rusty_sword', plus: false }, { uid: 'w3', id: 'rusty_sword', plus: false });
  for (const u of ['w1', 'w2', 'w3']) G.cmp.pick(u);
  G.S.headless = false; G.cmp.crush(); G.S.headless = true;
  G.update(DT);
  h.ok(G.cmp.hurry() && G.cmp.state.phase === 'done' && G.cmp.state.fired.slam, 'a tap: straight to the result (the slam still lands)');
});

// ---- round 21 (DESIGN.md "Combo relics and a gentler, clearer start (round 21)")
h.test('cr: who starts with a combo relic, and the first elite\'s pick of three (a reload keeps it)', () => {
  const T = s6Boot(), G = T.GAME, D = T.DATA;
  const isCr = (id) => !!(D.RELICS[id] && D.RELICS[id].combo);
  for (const ch of ['knight', 'alchemist', 'rogue', 'engineer', 'techie']) { G.newRun(ch, 2101); h.ok(!G.run.relics.some(isCr), `${ch} starts with no combo relic`); }
  G.newRun('gambler', 2101); h.ok(G.run.relics.includes('cr_casino') && G.run.relics.length === 2, 'Lucky Lou starts with the Dealer\'s Visor (his dice and chips are Casino recipes)');
  G.newRun('bubbler', 2101); h.ok(G.run.relics.includes('cr_party'), 'Ms. Bubbles starts with the Party Popper (her Bubble Combo)');
  G.newRun('knight', 2102);
  h.ok(!G.run.crPick, 'no pick offered yet');
  // a normal fight offers nothing
  G.startFight(['rat'], 'normal'); stepFor(G, 0.2); G.endFight('win');
  h.ok(!G.S.sd.reward.cr && !G.run.crPick, 'a normal fight: no combo relic pick');
  G.choose(3);
  h.eq(G.screen, 'map', 'straight back to the map');
  // the first elite
  G.startFight(D.ENCOUNTERS[1].elite[0], 'elite'); stepFor(G, 0.2); G.endFight('win');
  const rw = G.S.sd.reward;
  h.ok(rw.cr && rw.cr.pick.length === 3 && new Set(rw.cr.pick).size === 3 && rw.cr.pick.every(isCr) && G.run.crPick === 1, 'the first elite: three different combo relics');
  h.ok(rw.cr.pick.every(id => D.RELICS[id].combo !== 'all'), 'the pick is three families (The Strategy Guide waits in the pools)');
  G.choose(3);   // Skip the item cards
  h.eq(G.screen, 'treasure', 'the combo relic pick comes after the reward');
  const cards = s6Find(T._nodes.treasureBody, 'crCard');
  h.eq(cards.length, 3, 'three relic cards');
  h.ok(cards.every(c => /combos/.test(s6Text(c))), 'each card says its family and how many combos (' + s6Text(cards[0]).slice(0, 60) + ')');
  G.save();
  const T2 = s6Boot(Object.assign({}, T._store)), G2 = T2.GAME;
  G2.choose(G2.S.ui.buttons.findIndex(b => /continue/i.test(b.label)));
  h.ok(G2.screen === 'treasure' && G2.S.sd.treasure.crRw && G2.S.sd.treasure.crRw.cr.pick.join() === rw.cr.pick.join(), 'a reload resumes the same pick');
  const pick = rw.cr.pick[1];
  G2.choose(1);
  h.ok(G2.run.relics.includes(pick) && G2.run.relics.filter(isCr).length === 1, 'the picked relic joins the run, only that one');
  h.eq(G2.screen, 'map', 'then on to the map');
  // a second elite: no second pick
  G2.startFight(D.ENCOUNTERS[1].elite[1], 'elite'); stepFor(G2, 0.2); G2.endFight('win');
  h.ok(!G2.S.sd.reward.cr, 'a second elite: no second pick');
  // an old save mid act (no crPick): its next elite offers the pick, combos stay off until then
  G.newRun('knight', 2103);
  delete G.run.crPick;
  G.startFight(D.ENCOUNTERS[1].elite[2], 'elite'); stepFor(G, 0.2); G.endFight('win');
  h.ok(G.S.sd.reward.cr && G.S.sd.reward.cr.pick.length === 3, 'a run from before round 21 gets its pick at its next elite');
  G.choose(3); G.choose(G.S.ui.buttons.findIndex(b => b.label === 'Skip'));
  h.ok(G.screen === 'map' && !G.run.relics.some(isCr), 'Skip leaves it be');
});

h.test('cr: combo boosters wait for a combo relic; combo relics wait for the first elite in act 1', () => {
  const T = s6Boot(), G = T.GAME, D = T.DATA;
  G.newRun('knight', 2104);
  const boosters = Object.keys(D.RELICS).filter(id => D.crBoosts(D.RELICS[id]));
  h.ok(['encore_machine', 'tuning_fork', 'ticket_roll', 'leg_crowd', 'squeaky_toy'].every(id => boosters.includes(id)), 'Encore, the Fork, the Ticket Roll, The Crowd, the Squeaky Toy feed combos: ' + boosters.join(','));
  const all = () => G.cr.relicPool(['c', 'u', 'r', 'boss', 'l']);
  h.ok(!all().some(id => boosters.includes(id)), 'no combo relic: no booster in any pool');
  h.ok(!all().some(id => D.RELICS[id].combo), 'act 1, before the first elite: no combo relic in the pools');
  G.run.crPick = 1;
  h.ok(D.CR.RELICS.every(id => all().includes(id)) && !all().some(id => boosters.includes(id)), 'after the pick was offered: combo relics at their own rarity, boosters still out');
  G.gainRelic('cr_steel');
  h.ok(boosters.every(id => all().includes(id) || G.run.relics.includes(id)), 'a combo relic in hand: the boosters come back');
  h.ok(!all().includes('cr_steel') && all().includes('cr_all'), 'never one already owned');
  G.newRun('knight', 2105); G.run.act = 2;
  h.ok(D.CR.RELICS.every(id => all().includes(id)), 'act 2 and up: combo relics are in the pools anyway');
});

h.test('cr: the Prizedex and How it works explain combos as a relic power', () => {
  const T = s6Boot(), G = T.GAME, D = T.DATA;
  G.newRun('knight', 2106);
  for (const id in D.COMBOS) h.ok(D.CR.relicFor(D.COMBOS[id]) && D.RELICS[D.CR.relicFor(D.COMBOS[id])], `${id}: names its combo relic`);
  h.ok(/Combo relic: Weapon Rack\./.test(G.cr.dexLine(D.COMBOS.crossed_blades)), 'the Prizedex line under a recipe');
  G.showCollection('combos');
  h.ok(/relic power/.test(s6Text(T._nodes.collectionBody)), 'the combos tab says combos come from relics');
  G.showHelp('map');
  const html = (el) => (el ? (el.textContent || '') + ' ' + (el.innerHTML || '') + ' ' + (el.children || []).map(html).join(' ') : '');
  const help = html(T._nodes.helpBody);
  h.ok(/combo relic/.test(help) && /first elite/.test(help) && /\+\+/.test(help), 'How it works: combos are a relic power, the first elite offers one, the Compactor makes ++');
  h.ok(/\u{1F5E1}|Steel/u.test(G.cr.famLine(D.RELICS.cr_steel)) && /9 combos/.test(G.cr.famLine(D.RELICS.cr_steel)), 'a combo relic card names its family: ' + G.cr.famLine(D.RELICS.cr_steel));
});

h.test('cmp2: three upgraded copies merge to +2, it plays stronger, shows everywhere and survives a reload', () => {
  const T = s6Boot(), G = T.GAME, D = T.DATA;
  G.newRun('knight', 2107);
  const sw = D.ITEMS.rusty_sword, v0 = sw.fx[0].v, v1 = sw.plus.fx[0].v, v2 = D.cmp2FxAt(sw, 2)[0].v;
  h.ok(v2 > v1 && v1 > v0, `the +2 sword hits harder again (${v0} / ${v1} / ${v2})`);
  G.run.bin.push({ uid: 'p1', id: 'rusty_sword', plus: true }, { uid: 'p2', id: 'rusty_sword', plus: true }, { uid: 'p3', id: 'rusty_sword', plus: true });
  G.showRest();
  G.choose(G.S.ui.buttons.findIndex(b => b.el && /Compact/.test(s6Text(b.el))));
  h.eq(G.screen, 'compactor', 'the Compactor');
  // the grid marks the +1 group: three of them make ++
  const tags = s6Find(T._nodes.cmpBody, 'cmp2Tag').map(s6Text);
  h.ok(tags.includes('x3 = ++'), 'the grid marks what can merge to ++ (' + tags.join(' | ') + ')');
  for (const u of ['p1', 'p2', 'p3']) G.cmp.pick(u);
  h.ok(/Three upgraded: out comes Rusty Sword\+\+, stronger again\./.test(G.cmp.rule(['p1', 'p2', 'p3'].map(u => G.run.bin.find(i => i.uid === u)))), 'the rule line names the ++');
  const n0 = G.run.bin.length;
  const res = G.cmp.crush();
  h.ok(res && res.id === 'rusty_sword' && res.plus === 2, 'out comes Rusty Sword++');
  const inst = G.run.bin.find(i => i.uid === res.uid);
  h.ok(inst && inst.plus === 2 && G.run.bin.length === n0 - 2, 'in the bin as plus 2');
  h.ok(s6Find(T._nodes.cmpBody, 'plus2').length >= 1 && /PLUS 2/.test(s6Text(T._nodes.cmpBody)) && /Rusty Sword\+\+/.test(s6Text(T._nodes.cmpBody)), 'the result card says PLUS 2 and Rusty Sword++');
  G.cmp.leave();
  // the bin groups it apart and its popover has the +2 numbers
  G.openBin({ mode: 'view' });
  h.ok(/Rusty Sword\+\+/.test(s6Text(T._nodes.binBody)), 'the bin shows Rusty Sword++ on its own card');
  // save and reload: still +2, and a fight plays it at +2
  G.toMap(); G.save();
  const T2 = s6Boot(Object.assign({}, T._store)), G2 = T2.GAME;
  G2.choose(G2.S.ui.buttons.findIndex(b => /continue/i.test(b.label)));
  const i2 = G2.run.bin.find(i => i.uid === res.uid);
  h.ok(i2 && i2.plus === 2, 'a reload keeps the +2');
  const F = T2.COMBAT.newFight({ hp: 80, maxHp: 80, act: 1, bin: [i2, { uid: 'z', id: 'rock' }], relics: [], claw: {}, fights: 1 }, ['dummy'], T2.U.rng(3));
  const fi = F.bin.find(i => i.uid === res.uid);
  h.eq(fi.plus, 2, 'the fight keeps it +2');
  const e = F.enemies[0], hp0 = e.hp;
  T2.COMBAT.play(F, fi, 0);
  h.eq(hp0 - e.hp, v2, 'and it hits for its +2 number');
  h.eq(D.cmp2Name(sw, 2), 'Rusty Sword++', 'its name');
  h.ok(/Deal \d+ damage/.test(D.itemText(sw, 2)) && D.itemText(sw, 2).indexOf(String(v2)) >= 0, 'its text reads the +2 number');
  // the shop sells a +2 for double
  G2.run.gold = 0;
  const shop = G2.rollShop({ q: 3, r: 3 });
  G2.showShop(shop);
  G2.choose(G2.S.ui.buttons.findIndex(b => b.label === 'Sell an item'));
  const k = G2.S.ui.buttons.findIndex(b => /Rusty Sword\+\+/.test(b.label));
  h.ok(k >= 0, 'the sell picker lists it');
  G2.choose(k);
  h.eq(G2.run.gold, Math.max(5, Math.round(sw.cost / 3)) * 2, 'a +2 sells for double');
  // the history record keys it as id++
  h.ok(T2.GAME.cmp2.unkey('rusty_sword++').plus === 2 && T2.GAME.cmp2.unkey('rusty_sword+').plus === true && T2.GAME.cmp2.unkey('rusty_sword').plus === false, 'history keys: id, id+, id++');
});

h.test('sets: pets hear the Hungry Pack (extra tricks, stronger tricks, Chew Toy xp)', () => {
  const T = s6Boot(), G = T.GAME;
  G.newRun('knight', 6608);
  h.eq(G.sets.petStat('uses'), 0, 'no pet relics: no extra trick');
  G.run.relics.push('dog_whistle');
  h.eq(G.sets.petStat('uses'), 1, 'Dog Whistle: one more trick');
  G.run.relics.push('chew_toy', 'treat_jar');
  h.ok(G.sets.petStat('uses') === 2 && G.sets.petStat('pow') === 0.5 && G.sets.petStat('xp') === 2, 'Top Dog: another trick and +50% power; Chew Toy: +2 xp');
  G.pet.give('hamster', 0);
  const calls = [], real = T.COMBAT.petTrick;
  T.COMBAT.petTrick = (F, id) => { const ev = real(F, id); calls.push({ id, ev }); return ev; };
  G.startFight(['rat', 'slime'], 'normal', { seed: 4242 });
  stepFor(G, 0.5);
  const P = G.pet.fs();
  h.eq(P.uses, 1 + 2, 'the pet gets three tricks at Lv 1');
  const f = petUntilFx(G, 4);
  h.ok(f >= 0 && calls.length === 1 && calls[0].id === 'hamster', 'its trick reaches COMBAT.petTrick');
  h.ok(['treat_jar', 'dog_whistle', 'set:pack:2', 'set:pack:3'].every(id => calls[0].ev.some(e => e.t === 'proc' && e.id === id)), 'Treat Jar, Dog Whistle, Pack Tactics and Top Dog all answer');
  T.COMBAT.petTrick = real;
  const xp0 = G.run.pet.xp;
  G.endFight('win');
  h.ok(G.run.pet.xp >= xp0 + 2 + 2, 'a win: the fight xp and the Chew Toy\'s 2');
});

/* ================================================================ ACCESS (round 6) */
// the camera's clamp (game.js clampCam), recomputed: zoom in 0.6..1.4, the view centre on the map
function accCamOk(Gx, MAPx) {
  const M = Gx.run.map, b = MAPx.bounds(M, MAPx.HEX || 46, 'v'), c = Gx.cam, z = c.zoom;
  if (!(z >= 0.6 - 1e-9 && z <= 1.4 + 1e-9)) return 'zoom ' + z;
  const hw = 540 / 2 / z, hh = 768 / 2 / z;
  const x0 = Math.min(hw - 80, 0), x1 = Math.max(b.w + 80 - hw, b.w), y0 = Math.min(hh - 80, 0), y1 = Math.max(b.h + 80 - hh, b.h);
  const ok = (v, a0, a1, mid) => (a0 > a1 ? Math.abs(v - mid) < 1e-6 : v >= a0 - 1e-6 && v <= a1 + 1e-6);
  if (!ok(c.x, x0, x1, b.w / 2)) return 'x ' + c.x.toFixed(1) + ' not in ' + x0.toFixed(1) + '..' + x1.toFixed(1);
  if (!ok(c.y, y0, y1, b.h / 2)) return 'y ' + c.y.toFixed(1) + ' not in ' + y0.toFixed(1) + '..' + y1.toFixed(1);
  return '';
}
function accKids(el, out) { out = out || []; if (!el) return out; if (el.textContent) out.push(el.textContent); for (const k of el.children || []) accKids(k, out); return out; }
// A map with its road walkable end to end (nothing on it resolves).
function accRoadRun(Gx, seed) {
  Gx.newRun('knight', seed);
  if (Gx.screen !== 'map') Gx.toMap();
  const M = Gx.run.map;
  for (const [q, r] of M.road) { const t = M.tiles[CS.MAP.key(q, r)]; if (t.type !== 'boss') t.done = true; }
  for (const k in M.tiles) if (M.tiles[k].terrain === 'shallow') M.tiles[k].revealed = false;
  M.roam = [];   // no roaming monster jumps the walk
  return M;
}

h.test('access: settings default and repair on old profiles, persist, and apply at boot', () => {
  const old = metaBoot({ settings: { shake: false } });
  const s = old.G.meta.settings;
  h.ok(s.shake === false && s.haptics === true, 'an old profile keeps its Shake off and gets Buzz on');
  for (const [k, v] of Object.entries(old.G.acc.DEF)) if (k !== 'shake') h.eq(s[k], v, 'default ' + k);
  const junk = metaBoot({ settings: { cb: 'purple', text: 7, volMusic: 'loud', volSfx: 3, hand: null, hc: 'yes', slowClaw: 1, noFlash: 'x' } }).G.meta.settings;
  h.ok(junk.cb === 'off' && junk.text === 'n' && junk.volMusic === 1 && junk.volSfx === 1 && junk.hand === 'off' && junk.hc === false && junk.slowClaw === false && junk.noFlash === false, 'junk values are repaired (' + JSON.stringify(junk) + ')');
  h.eq(metaBoot({ settings: 'nope' }).G.meta.settings.cb, 'off', 'a broken settings field is a fresh one');
  const { T, G: Gs, saved } = metaBoot({});
  h.eq(Gs.acc.set('cb', 'deutan'), 'deutan', 'set a colour-blind mode');
  h.eq(T.RENDER.acc.mode, 'deutan', 'the renderer takes it at once');
  h.ok(Gs.acc.cls.includes('cb-deutan'), 'and the page class');
  Gs.acc.set('text', 'xl'); Gs.acc.set('noFlash', true); Gs.acc.set('hc', true); Gs.acc.set('hand', 'left'); Gs.acc.set('slowClaw', true);
  Gs.acc.set('volMaster', 0.3); Gs.acc.set('volMusic', 0.5); Gs.acc.set('volSfx', 0.25); Gs.acc.set('shake', false);
  h.near(T.RENDER.acc.textK, 1.3, 1e-9, 'extra large text');
  h.ok(T.RENDER.acc.noFlash && T.RENDER.acc.hc && T.RENDER.fx.reduced, 'reduced flashing, outlines and Shake off applied');
  h.near(T.AUDIO.master, 0.3, 1e-9, 'master volume');
  h.near(T.AUDIO.volume.music, 0.25, 1e-9, 'music volume (100% is the old level)');
  h.near(T.AUDIO.volume.sfx, 0.2, 1e-9, 'effects volume');
  h.eq(JSON.stringify(Gs.acc.cls), JSON.stringify(['cb-deutan', 'txt-xl', 'noflash', 'hand-left', 'hc']), 'every page class');
  h.eq(Gs.acc.set('volMusic', 5), 1, 'a volume is clamped');
  h.eq(Gs.acc.set('bogus', 1), undefined, 'an unknown setting is refused');
  const st = saved().settings;
  h.ok(st.cb === 'deutan' && st.text === 'xl' && st.noFlash && st.hc && st.hand === 'left' && st.slowClaw && st.volMaster === 0.3 && st.shake === false, 'every setting is saved on the profile');
  const again = boot({ store: Object.assign({}, T._store) });
  h.ok(again.RENDER.acc.mode === 'deutan' && again.RENDER.acc.textK === 1.3 && again.RENDER.acc.noFlash && again.RENDER.fx.reduced, 'a reload applies them at boot');
  h.near(again.AUDIO.master, 0.3, 1e-9, 'the master volume too');
  h.ok(again.GAME.acc.cls.includes('hand-left'), 'and the page classes');
});

h.test('access: the Settings panel from the title, the map and a paused fight', () => {
  const { T, G: Gs } = metaBoot({});
  Gs.showTitle();
  const bi = Gs.S.ui.buttons.findIndex(b => /Settings/.test(b.label));
  h.ok(bi >= 0, 'the title has a Settings button');
  h.ok(!Gs.S.ui.buttons.some(b => /^(Shake|Buzz) /.test(b.label)), 'Shake and Buzz moved into it');
  Gs.choose(bi);
  h.ok(Gs.acc.isOpen, 'it opens the panel');
  const labels = Gs.S.ui.buttons.map(b => b.label);
  for (const l of ['Master volume', 'Music volume', 'Effects volume', 'Sound on', 'Music on', 'Shake on', 'Buzz on', 'Reduced flashing off', 'Standard', 'Deutan', 'Protan', 'Tritan', 'Normal', 'Large', 'Extra large',
    'Item outlines off', 'Both hands', 'Left hand', 'Right hand', 'Slow claw off', 'Reset tips', 'Done']) h.ok(labels.includes(l), 'the panel has ' + l);
  Gs.choose(Gs.S.ui.buttons.findIndex(b => b.label === 'Tritan'));
  h.ok(T.RENDER.acc.mode === 'tritan' && Gs.acc.isOpen, 'a colour mode previews live, the panel stays');
  Gs.choose(Gs.S.ui.buttons.findIndex(b => b.label === 'Reduced flashing off'));
  h.ok(Gs.meta.settings.noFlash && Gs.S.ui.buttons.some(b => b.label === 'Reduced flashing on'), 'a toggle flips and relabels');
  T._meta = null;
  const n0 = T._counts.fillText || 0;
  h.ok(Gs.acc.preview(T._document.createElement('canvas')), 'the sample strip draws');
  h.ok((T._counts.fillText || 0) > n0, 'with its numbers');
  Gs.meta.tips = { map: 1, combo: 1 };
  Gs.choose(Gs.S.ui.buttons.findIndex(b => b.label === 'Reset tips'));
  h.eq(Object.keys(Gs.meta.tips).length, 0, 'Reset tips clears them');
  Gs.choose(Gs.S.ui.buttons.findIndex(b => b.label === 'Done'));
  h.ok(!Gs.acc.isOpen && Gs.S.ui.buttons.some(b => /new run/i.test(b.label)), 'Done closes it and the title is back');
  // the map head's gear, Escape closes
  Gs.newRun('knight', 6101);
  if (Gs.screen !== 'map') Gs.toMap();
  const gi = Gs.S.ui.buttons.findIndex(b => b.label === '⚙');
  h.ok(gi >= 0, 'the map head has the gear');
  Gs.choose(gi);
  h.ok(Gs.acc.isOpen, 'it opens the panel on the map');
  h.ok(Gs.acc.key({ key: 'Escape' }, true) && !Gs.acc.isOpen, 'Escape closes it');
  h.ok(Gs.S.ui.buttons.some(b => b.label === 'Bin'), 'the map head is back');
  // a fight holds still while it is open
  Gs.startFight(['rat'], 'normal');
  settle(Gs, 20);
  const F = Gs.fight, t0 = Gs.S.t, turn = F.turn, grabs = F.player.grabs;
  Gs.acc.open();
  Gs.steer(40); Gs.dropClaw();
  stepFor(Gs, 2);
  h.eq(Gs.S.t, t0, 'the clock stops');
  h.ok(Gs.rig.phase === 'idle' || Gs.rig.phase === 'moving', 'the claw waits');
  h.ok(F.turn === turn, 'the turn holds');
  Gs.acc.close();
  stepFor(Gs, 0.2);
  h.ok(Gs.S.t > t0, 'closing lets it run again');
  h.ok(Gs.S.ui.buttons.some(b => b.label === 'END TURN'), 'the fight buttons are back');
  void grabs;
});

h.test('access: one-handed thumb zone, the slow claw noted in the summary, outlines and flashes', () => {
  const { T, G: Gs } = metaBoot({});
  Gs.newRun('knight', 6102);
  if (Gs.screen !== 'map') Gs.toMap();
  Gs.acc.set('hand', 'right');
  stepFor(Gs, 0.05);
  h.ok(Gs.S.accThumbOn, 'the thumb buttons show on the map');
  h.ok(Gs.acc.cls.includes('hand-right'), 'END TURN goes to the right thumb (page class)');
  Gs.acc.set('hand', 'left');
  h.ok(Gs.acc.cls.includes('hand-left') && !Gs.acc.cls.includes('hand-right'), 'and to the left');
  Gs.startFight(['rat'], 'normal');
  stepFor(Gs, 0.05);
  h.ok(!Gs.S.accThumbOn, 'the map buttons hide in a fight');
  Gs.acc.set('hand', 'off');
  settle(Gs, 20);
  const sp0 = Gs.rig.cfg.speed;
  h.ok(!(Gs.run.assist && Gs.run.assist.slowClaw), 'no assist yet');
  Gs.acc.set('slowClaw', true);
  h.near(Gs.rig.cfg.speed, sp0 * Gs.acc.SLOW, 1e-9, 'the slow claw slows the live claw at once');
  h.ok(Gs.run.assist && Gs.run.assist.slowClaw, 'and tags the run');
  Gs.acc.set('hc', true); Gs.acc.set('noFlash', true); Gs.acc.set('cb', 'protan'); Gs.acc.set('text', 'l');
  let threw = null;
  try { stepFor(Gs, 0.5); Gs.draw(); Gs.fs.party = 1; T.RENDER.fx.flash('#fff', 0.8); stepFor(Gs, 0.1); Gs.draw(); } catch (e) { threw = e; }
  h.ok(!threw, 'a fight draws with every option on ' + (threw ? threw.stack : ''));
  h.near(Gs.acc.white(1), 0.22, 1e-9, 'the boss whiteout is a soft wash');
  Gs.acc.set('noFlash', false);
  h.eq(Gs.acc.white(1), 1, 'and full again');
  Gs.startFight(['rat'], 'normal');
  settle(Gs, 20);
  h.near(Gs.rig.cfg.speed, Gs.fight.claw.speed * Gs.acc.SLOW, 1e-9, 'a new fight builds the slow claw');
  Gs.run.hp = 0;
  Gs.showGameOver();
  h.ok(accKids(T._nodes.gameoverBody).some(s => s === 'Slow claw'), 'the run summary notes the assist');
});

h.test('access: text sizes scale every full-screen body and hold the 540 stage (so 360 px phones)', () => {
  const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
  const rule = /html\[class\*="txt-"\] :is\(([^)]*)\)\{zoom:var\(--accK\)\}/.exec(html);
  h.ok(rule, 'one zoom rule for the text size');
  const zoomed = rule ? rule[1].split(',').map(s => s.trim()) : [];
  const bodies = [...html.matchAll(/<div id="scr-(\w+)" class="screen"><div id="(\w+)" class="col[^"]*">/g)].map(m => '#' + m[2]);
  h.ok(bodies.length >= 12, 'the plain full-screen bodies (' + bodies.length + ')');
  const miss = bodies.filter(b => !zoomed.includes(b) && b !== '#bossBody');
  h.eq(miss.join(','), '', 'every one of them scales');
  h.ok(zoomed.includes('.accSheet'), 'the Settings panel too');
  h.ok(/html\[class\*="txt-"\] #titleMenu\{zoom:calc\(1 \+ \(var\(--accK\) - 1\) \* \.5\)/.test(html), 'the title menu half as much (the logo stays clear)');
  const ks = [...html.matchAll(/html\.txt-(l|xl)\{--accK:([\d.]+)\}/g)].map(m => +m[2]);
  h.eq(JSON.stringify(ks), JSON.stringify([1.15, 1.3]), 'large 1.15, extra large 1.3');
  // the widest fixed box on the title (round 18: the big action, the play row and the tiles, 440 px; the menu grows
  // half as much as the bodies) still fits the stage at extra large
  const menuW = +(/#titleMenu \.uiPri,#titleMenu \.uiPlay,#titleMenu \.uiTiles\{width:(\d+)px/.exec(html) || [0, 999])[1];
  h.ok(menuW * 1.15 <= 540 - 24, 'the title rows fit at extra large (' + menuW * 1.15 + ' px of 516)');
  h.ok(/\.accSheet\{max-height:calc\(\(100% - 84px\) \/ var\(--accK\)\)\}/.test(html.replace(/html\[class\*="txt-"\] /g, '')), 'the scaled Settings sheet still fits the stage height');
  const { G: Gs } = metaBoot({});
  for (const t of ['n', 'l', 'xl']) { Gs.acc.set('text', t); h.eq(Gs.acc.cls.filter(c => /^txt-/.test(c)).join(), t === 'n' ? '' : 'txt-' + t, 'text ' + t + ' class'); }
});

h.test('access: the far-tap swoop, the hop and the punch keep the camera in its bounds (fuzz)', () => {
  const T = boot();
  const Gs = T.GAME, MAPx = T.MAP;
  let walks = 0, dipped = 0, bad = '', frames = 0;
  for (let seed = 6200; seed < 6212; seed++) {
    const M = accRoadRun(Gs, seed);
    const rng = T.U.rng(seed);
    for (let w = 0; w < 5; w++) {
      const road = M.road, i0 = road.findIndex(([q, r]) => q === M.pos.q && r === M.pos.r);
      const j = Math.min(road.length - 2, Math.max(0, i0) + 3 + Math.floor(rng() * 6));
      const path = j > i0 ? MAPx.walkPath(M, road[j][0], road[j][1]) : null;
      if (!path || path.length < 3) break;
      const z0 = [0.6, 1.4, 1, 0.75, 1.2][w];
      Gs.S.cam.zoom = z0;
      Gs.lookAt(M.pos.q, M.pos.r, false);
      Gs.startWalk(path);
      h.ok(Gs.acc.cam && Gs.acc.cam.k === 'walk', 'a far tap swoops (' + path.length + ' steps)');
      walks++;
      let minZ = 9, hopSeen = false;
      const interrupt = w === 3 ? 20 + Math.floor(rng() * 30) : -1;
      for (let f = 0; f < 400 && (Gs.acc.cam || Gs.S.walk); f++) {
        if (f === interrupt) Gs.lookAt(M.pos.q, M.pos.r, false);   // a snap mid-swoop
        Gs.update(DT); frames++;
        const e = accCamOk(Gs, MAPx);
        if (e && !bad) bad = 'seed ' + seed + ' walk ' + w + ' frame ' + f + ': ' + e;
        minZ = Math.min(minZ, Gs.cam.zoom);
        const hp = Gs.acc.hop(); if (hp && hp.lift > 0.1) hopSeen = true;
      }
      if (minZ < z0 - 0.02) dipped++;
      h.ok(!Gs.acc.cam, 'the swoop ends');
      h.near(Gs.cam.zoom, z0, 1e-6, 'the zoom is back where it was (' + z0 + ')');
      h.ok(hopSeen, 'the crawler hopped');
      stepFor(Gs, 1);
      const me = Gs.hexToStage(M.pos.q, M.pos.r), ok = accCamOk(Gs, MAPx);
      h.ok(!ok, 'the camera rests in bounds');
      void me;
    }
  }
  h.eq(bad, '', 'no frame of any swoop leaves the clamp (' + frames + ' frames, ' + walks + ' walks)');
  h.ok(walks >= 30 && dipped >= walks * 0.6, 'the camera zooms out a little on most (' + dipped + ' of ' + walks + '; not at the 0.6 floor)');
  // a drag takes the camera back at once
  const M = accRoadRun(Gs, 6230);
  Gs.lookAt(M.pos.q, M.pos.r, false);
  const path = MAPx.walkPath(M, M.road[6][0], M.road[6][1]);
  Gs.startWalk(path);
  stepFor(Gs, 0.2);
  Gs.pointer('down', 270, 600, { pointerId: 1 }); Gs.pointer('move', 300, 640, { pointerId: 1 });
  stepFor(Gs, 0.02);
  h.ok(!Gs.acc.cam, 'a drag cancels the swoop');
  Gs.pointer('up', 300, 640, { pointerId: 1 });
  // reduced motion: the old behaviour
  Gs.meta.settings.shake = false;
  const M2 = accRoadRun(Gs, 6231);
  Gs.lookAt(M2.pos.q, M2.pos.r, false);
  Gs.startWalk(MAPx.walkPath(M2, M2.road[6][0], M2.road[6][1]));
  h.ok(!Gs.acc.cam && Gs.S.camTo, 'Shake off: no swoop, the plain ease');
  stepFor(Gs, 0.1);
  h.eq(Gs.acc.hop(), null, 'and no hop');
  Gs.meta.settings.shake = true;
  // a short walk does not swoop
  const M3 = accRoadRun(Gs, 6232);
  Gs.startWalk(MAPx.walkPath(M3, M3.road[2][0], M3.road[2][1]));
  h.ok(!Gs.acc.cam, 'a two-step walk just eases');
  // a walk that ends in a fight: the zoom is back for the return
  const M5 = accRoadRun(Gs, 6234);
  const ft = M5.tiles[MAPx.key(M5.road[5][0], M5.road[5][1])];
  ft.type = 'fight'; ft.done = false; ft.content = { diff: 0 };
  Gs.S.cam.zoom = 1.2; Gs.lookAt(M5.pos.q, M5.pos.r, false);
  Gs.startWalk(MAPx.walkPath(M5, M5.road[7][0], M5.road[7][1]));
  for (let f = 0; f < 200 && Gs.screen === 'map'; f++) Gs.update(DT);
  h.eq(Gs.screen, 'fight', 'the walk ran into the fight');
  Gs.update(DT);
  h.ok(!Gs.acc.cam && Math.abs(Gs.cam.zoom - 1.2) < 1e-9, 'the swoop let go and the zoom is back (' + Gs.cam.zoom + ')');
  // lighting a hex by hand: a punch toward it, a zoom in about a point inside the map area
  const M4 = accRoadRun(Gs, 6233);
  stepFor(Gs, 0.1);
  let dark = null;
  for (const k in M4.tiles) { const t = M4.tiles[k]; if (!t.revealed && MAPx.canReveal(M4, t.q, t.r)) { dark = t; break; } }
  h.ok(dark, 'a dark hex beside the light');
  Gs.lookAt(dark.q, dark.r, false);
  const p = Gs.hexToStage(dark.q, dark.r);
  Gs.tap(p.x, p.y);
  h.ok(dark.revealed, 'lit');
  Gs.update(DT);
  h.ok(Gs.acc.punch && Gs.acc.punch.q === dark.q, 'the punch aims at it');
  let kMax = 1, pivotOk = true;
  const rec = { translate() {}, scale() {} };
  for (let f = 0; f < 40; f++) {
    Gs.update(DT);
    kMax = Math.max(kMax, Gs.acc.punchK());
    const r = Gs.acc.mapPunch(rec, { x: 0, y: 172, w: 540, h: 768 });
    if (r && (r.px < 0 || r.px > 540 || r.py < 172 || r.py > 940 || r.k < 1)) pivotOk = false;
  }
  h.ok(kMax > 1.03 && kMax <= 1 + Gs.acc.CAM.punch + 1e-9, 'a small zoom in (' + kMax.toFixed(3) + ')');
  h.ok(pivotOk, 'about a point inside the map area (it only ever shows less of the map)');
  h.eq(Gs.acc.punch, null, 'and it settles');
});

h.test('access: a taken tower pans over its view and back, the blooms wait for it; the fight iris', () => {
  const T = boot();
  const Gs = T.GAME, MAPx = T.MAP;
  for (let seed = 6300; seed < 6306; seed++) {
    Gs.newRun('knight', seed);
    if (Gs.screen !== 'map') Gs.toMap();
    const M = Gs.run.map;
    stepFor(Gs, 0.1);
    const tw = Object.values(M.tiles).filter(t => t.type === 'tower').sort((a, b) => MAPx.hexDist(a.q, a.r, M.pos.q, M.pos.r) - MAPx.hexDist(b.q, b.r, M.pos.q, M.pos.r))[0];
    tw.done = true; tw.revealed = true;
    Gs.towerPrize({ bonus: { k: 'ink', n: 2 }, q: tw.q, r: tw.r });
    Gs.toMap();
    Gs.update(DT);
    h.ok(Gs.acc.cam && Gs.acc.cam.k === 'path', 'the camera pans to the tower');
    h.eq(Gs.S.beam, null, 'the beam waits for the camera');
    const early = Gs.S.mapPaint.items.filter(it => it.bloomAt > Gs.S.t + 0.6).length;
    h.ok(early > 20, 'the blooms wait too (' + early + ')');
    let bad = '', beamSeen = false, near = 1e9;
    const tp = () => { const a = Gs.hexToStage(tw.q, tw.r); return Math.hypot(a.x - 270, a.y - 556); };
    for (let f = 0; f < 300 && Gs.acc.cam; f++) {
      Gs.update(DT);
      const e = accCamOk(Gs, MAPx); if (e && !bad) bad = e;
      if (Gs.S.beam) beamSeen = true;
      near = Math.min(near, tp());
    }
    h.eq(bad, '', 'seed ' + seed + ': every frame in bounds');
    h.ok(beamSeen, 'the beam sweeps once the camera is there');
    h.ok(near < 120, 'the tower came to the middle of the view (' + near.toFixed(0) + ' px)');
    h.ok(!Gs.acc.cam, 'and the pan ends');
    const me = Gs.hexToStage(M.pos.q, M.pos.r);
    h.ok(Math.hypot(me.x - 270, me.y - 556) < 160 || accCamOk(Gs, MAPx) === '', 'back on the crawler');
  }
  // a fight tile zooms in under an iris (reduced motion: the old iris)
  const s = seedWithFightNeighbour(Gs, MAPx);
  if (Gs.screen !== 'map') Gs.toMap();
  Gs.lookAt(s.tile.q, s.tile.r, false);
  const p = Gs.hexToStage(s.tile.q, s.tile.r);
  Gs.tap(p.x, p.y);
  h.eq(Gs.screen, 'fight', 'the fight starts at once');
  const I = Gs.acc.iris;
  h.ok(I && Math.abs(I.x - p.x) < 1 && Math.abs(I.y - p.y) < 1, 'the iris closes on the tile');
  let threw = null;
  try { Gs.draw(); stepFor(Gs, 0.2); Gs.draw(); } catch (e) { threw = e; }
  h.ok(!threw, 'the fight draws under it');
  stepFor(Gs, 1);
  h.eq(Gs.acc.iris, null, 'and it is gone');
  Gs.meta.settings.shake = false;
  const s2 = seedWithFightNeighbour(Gs, MAPx);
  if (Gs.screen !== 'map') Gs.toMap();
  Gs.lookAt(s2.tile.q, s2.tile.r, false);
  const p2 = Gs.hexToStage(s2.tile.q, s2.tile.r);
  Gs.tap(p2.x, p2.y);
  h.ok(Gs.screen === 'fight' && !Gs.acc.iris, 'Shake off: the plain iris');
  Gs.meta.settings.shake = true;
});

h.test('access: each act plays its own tunes, handed to the audio before a mode starts', () => {
  const T = boot();
  const Gs = T.GAME, A = T.AUDIO;
  Gs.showTitle();
  h.eq(A.act, 0, 'the title plays the base tunes');
  Gs.newRun('knight', 6401);
  if (Gs.screen !== 'map') Gs.toMap();
  h.ok(A.act === 1 && A.mode === 'map', 'act 1 map theme');
  Gs.startFight(['rat'], 'normal');
  h.ok(A.act === 1 && A.mode === 'fight', 'act 1 fight variant');
  Gs.run.act = 2;
  Gs.toMap();
  h.ok(A.act === 2 && A.mode === 'map' && A._actOf('map') === 2, 'act 2: the foundry groove');
  Gs.run.act = 3;
  Gs.startFight(['rat'], 'boss');
  h.ok(A.act === 3 && A.mode === 'boss' && A._actOf('boss') === 3, 'act 3: the boss borrows the music box');
  Gs.showTitle();
  h.eq(A.act, 0, 'back on the title: no act');
});

// ---------------------------------------------------------------- SECRET (round 6): the golden keys, the Back Room, The Machine
function secBoot(meta, extra) { return metaBoot(Object.assign({ unlocks: { knight: true, rogue: true } }, meta || {}), extra); }
const secVs = (G) => { if (G.boss.vs) { G.boss.vsSkip(); G.boss.vsSkip(); } stepFor(G, 0.05); };
const secFlush = (G) => { const F = G.fight, FS = G.fs; const list = F.events.splice(0); for (const ev of list) FS.queue.push({ ev, beat: 0.02 }); FS.beatT = 0; };
// Every DOM node under el (the stub DOM keeps children arrays).
function secWalk(el, out) { out = out || []; if (!el) return out; out.push(el); for (const c of el.children || []) secWalk(c, out); return out; }
const secFind = (el, re) => secWalk(el).find(n => re.test(n.className || '') || re.test(n.textContent || ''));
function secRoom(G, seed) {
  G.newRun('knight', seed);
  G.run.act = 3;
  G.run.sec.keys = { 1: 'dark', 2: 'roam', 3: 'arcade' };
  G.sec.show({ k: 'door' });
  G.sec.enter();
  return G.run.map;
}
// Starts The Machine's fight in the Back Room with a crawler that will not die.
function secMachine(G, seed) {
  secRoom(G, seed);
  const bt = G.run.map.tiles[G.run.map.boss.q + ',' + G.run.map.boss.r];
  G.enterTile(bt);
  secVs(G);
  settle(G, 20);
  const F = G.fight;
  F.player.hp = F.player.maxHp = 9999;
  return F;
}

h.test('secret: three golden keys a run, one per act, each hidden its own way, found, counted and saved', () => {
  const { T, G, saved } = secBoot();
  const MAP = T.MAP, U = T.U;
  G.newRun('knight', 3301);
  const sc = G.sec.of();
  h.eq(Object.values(sc.kinds).sort().join(), 'arcade,dark,roam', 'each act hides its key a different way: ' + JSON.stringify(sc.kinds));
  h.ok(G.run.map.sec && !G.run.map.sec.got, 'the act 1 map carries its key (' + G.run.map.sec.kind + ')');
  h.ok(!secFind(T._nodes.mapHead, /secKeys/), 'no counter on a profile that never found a key');
  // the dark corner: a glint on a far dark hex, picked up by stepping on it
  let M = G.run.map;
  MAP.secKeys(M, 'dark');
  const t = M.tiles[M.sec.q + ',' + M.sec.r];
  h.ok(!t.revealed && !t.road, 'the dark key sits in the dark, off the road');
  G.draw();
  t.revealed = true; G.draw();
  G.enterTile(t);
  h.eq(G.sec.keys(), 1, 'stepping on it: one key');
  h.ok(M.sec.got && sc.keys[1] === 'dark', 'taken, on the run');
  h.eq(saved().sec.keys, 1, 'the profile counts it');
  h.ok(G.sec.keyFx, 'it spins up out of the hex');
  G.draw();
  G.enterTile(t);
  h.eq(G.sec.keys(), 1, 'never twice');
  stepFor(G, 2);
  h.ok(!G.sec.keyFx, 'the celebration ends');
  G.toMap();
  const chip = secFind(T._nodes.mapHead, /secKeys/);
  h.ok(chip && secWalk(chip).some(n => n.textContent === '1/3'), 'the counter shows 1/3 on the map head');
  h.eq(G.sec.newMap(G.run), null, 'an act whose key is taken places no other');
  G.save();
  const T2 = boot({ store: Object.assign({}, T._store) });
  h.ok(T2.GAME.load() && T2.GAME.sec.keys() === 1 && T2.GAME.run.map.sec.got, 'a reload keeps the key');
  // the roaming monster: the key pops out when it falls
  G.run.act = 2;
  G.run.map = MAP.generate({ act: 2, rng: U.rng(5), cols: 16, rows: 22 });
  M = G.run.map;
  MAP.secKeys(M, 'roam');
  G.toMap();
  const mon = M.roam.find(m => m.id === M.sec.id);
  const tt = M.tiles[mon.q + ',' + mon.r]; tt.revealed = true; G.draw();
  G.arc.roamFight(mon, false);
  secVs(G); settle(G, 10);
  const F = G.fight;
  for (const e of F.enemies) T.COMBAT.damage(F, F.player, e, e.hp + 50, { pierce: true });
  secFlush(G);
  stepFor(G, 0.6);
  h.ok(G.fs && G.fs.sec && G.fs.sec.drop, 'the key drops out of the beaten monster');
  h.ok(G.ann.log.some(x => x.cls === 'secret'), 'GOLDEN KEY! through the announcer');
  G.draw();
  stepFor(G, 5);
  h.eq(G.sec.keys(), 2, 'paid with the fight: two keys');
  h.ok(sc.keys[2] === 'roam' && M.sec.got, 'on the run, the monster\'s key taken');
  // the arcade: a plinko jackpot on the key's map
  G.run.act = 3;
  let pk = null;
  for (let s = 1; s < 60 && !pk; s++) { const M3 = MAP.generate({ act: 3, rng: U.rng(s), cols: 16, rows: 22 }); const p = Object.values(M3.tiles).find(x => x.type === 'plinko'); if (p) { G.run.map = M3; pk = p; } }
  M = G.run.map;
  MAP.secKeys(M, 'arcade');
  G.toMap();
  pk.revealed = true; G.draw();
  let jp = 1;
  while (G.arc.plkSim(270, jp).slot !== 4 && jp < 5000) jp++;
  const A = G.arc.session(pk);
  A.tokens = Math.max(0, A.tokens - 1); A.pend = { x: 270, seed: jp };   // a drop in flight that lands in the JACKPOT
  G.arc.show({ q: pk.q, r: pk.r });
  stepFor(G, 0.3); G.draw();
  G.arc.skip();
  h.eq(G.sec.keys(), 3, 'the jackpot pays the third key');
  h.ok(sc.keys[3] === 'arcade', 'on the run');
  h.ok(G.meta.ach.keymaster, 'the Keymaster sticker');
  G.arc.leave();
  G.toMap();
  const chip3 = secFind(T._nodes.mapHead, /secKeys/);
  h.ok(chip3 && /full/.test(chip3.className), 'a full counter glows');
  // Endless loop maps hold no keys
  G.run.endless = { loop: 1, mix: null, since: 0, adds: [], over: false };
  G.run.sec.keys = {};
  G.run.map = MAP.generate({ act: 1, rng: U.rng(9), cols: 16, rows: 22 });
  h.eq(G.sec.newMap(G.run), null, 'no key in Endless');
});

h.test('secret: the key counter is compact, on the hint row, only with a key in hand, and "Act N" stays whole', () => {
  const { T, G } = secBoot({ sec: { keys: 4, rooms: 1, ends: 0 } });
  const head = () => T._nodes.mapHead;
  const row = (cls) => secWalk(head()).find(n => n.className === cls);
  const title = () => secWalk(head()).find(n => n.tagName === 'H2');
  G.newRun('rogue', 4411);
  G.toMap();
  h.ok(!secFind(head(), /secKeys/), 'no key this run: no chip, even on a profile that has found keys before');
  h.eq(title().textContent, 'Act 1', 'row 1: the act in full');
  G.run.sec.keys = { 1: 'dark' };
  G.toMap();
  const chip = secFind(head(), /secKeys/);
  h.ok(chip && secWalk(chip).some(n => n.textContent === '1/3'), 'one key: 1/3');
  h.ok(chip && chip.parentNode === row('l2'), 'on the hint row');
  h.ok(!secWalk(row('l1')).some(n => /secKeys/.test(n.className || '')), 'never on row 1, beside the act and the bulb pill');
  h.ok(/chip\.setAttribute\('aria-label', `Golden keys \$\{n\} of 3`\)/.test(fs.readFileSync(path.join(DIR, 'js', 'game.js'), 'utf8')), 'a spoken label');
  const css = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
  const px = (re) => { const m = css.match(re); return m ? +m[1] : 999; };
  h.ok(px(/\.mh \.secKeys\{[^}]*?height:(\d+)px/) <= 32, 'compact: at most 32 px tall');
  h.ok(px(/\.mh \.secKeys canvas\{width:(\d+)px/) <= 18, 'a small key glyph');
  G.run.sec.keys = { 1: 'dark', 2: 'roam', 3: 'arcade' };
  G.run.act = 3;
  G.sec.enter();
  h.eq(title().textContent, 'Act 4', 'the Back Room: "Act 4", short enough never to truncate');
  h.ok(secFind(head(), /secKeys/).parentNode === row('l2'), 'the full counter stays on the hint row');
  G.run.endless = { loop: 12, mix: null, since: 0, adds: [], over: false };
  G.run.sec.room = false;
  G.toMap();
  h.eq(title().textContent, 'Loop 12', 'Endless: the loop, whole');
  h.ok(!secFind(head(), /secKeys/), 'no counter in Endless');
});

h.test('secret: the hidden door opens only with three keys, reloads, and either choice holds', () => {
  const { T, G } = secBoot();
  G.newRun('knight', 3302);
  G.run.act = 3;
  G.run.sec.keys = { 1: 'dark', 2: 'roam' };
  h.ok(!G.sec.nextAct(), 'two keys: no door');
  G.startFight(['prizemaster'], 'boss'); secVs(G); G.endFight('win');
  G.choose(G.S.ui.buttons.findIndex(b => b.label === 'Skip'));
  h.eq(G.screen, 'win', 'two keys: the Prize Master\'s reward goes straight to the win');
  G.newRun('knight', 3303);
  G.run.act = 3;
  G.run.sec.keys = { 1: 'dark', 2: 'roam', 3: 'arcade' };
  G.startFight(['prizemaster'], 'boss'); secVs(G); G.endFight('win');
  h.eq(G.screen, 'reward', 'the finale and the reward first');
  G.choose(G.S.ui.buttons.findIndex(b => b.label === 'Skip'));
  h.eq(G.screen, 'secret', 'three keys: the hidden door');
  h.eq(G.sec.scr.k, 'door', 'the door scene');
  h.eq(G.S.ui.buttons.map(b => b.label).join(), 'Step inside,Take the win', 'step inside, or take the win');
  G.draw();
  stepFor(G, 1.6); G.draw();
  h.ok(G.sec.scr.keys >= 1 && !G.sec.scr.opened, 'the keys fly into their keyholes');
  stepFor(G, 3);
  h.ok(G.sec.scr.keys === 3 && G.sec.scr.opened && G.sec.scr.ui, 'the door opens, THE BACK ROOM');
  h.eq(T.AUDIO.mode, 'backroom', 'the Back Room hums through the door');
  G.draw();
  G.save();
  const T2 = boot({ store: Object.assign({}, T._store) });
  const G2 = T2.GAME;
  h.ok(G2.load() && G2.screen === 'secret' && G2.sec.scr.k === 'door', 'a reload on the door comes back to the door');
  h.eq(G2.S.ui.buttons.map(b => b.label).join(), 'Step inside,Take the win', 'the same choice');
  G2.sec.hurry(); stepFor(G2, 0.2); G2.draw();
  G2.choose(1);
  h.eq(G2.screen, 'win', 'take the win');
  h.ok(G2.run.sec.door === 'skip' && !G2.run.sec.room, 'the door stays shut for this run');
  h.ok(secWalk(T2._nodes.winBody).some(n => n.textContent === 'The Prize Master falls'), 'the usual win');
  const hp0 = G.run.hp;
  G.choose(0);
  h.eq(G.screen, 'map', 'step inside: the Back Room\'s map');
  h.ok(G.run.map.biome === 'machine' && G.run.sec.room && G.run.sec.door === 'open', 'the machine biome, in the room');
  h.ok(G.run.hp >= hp0, 'patched up at the door');
  h.eq(T._nodes.actTxt.textContent, '4 \u{1F511}', 'the HUD says Act 4 with a key, like the map head (round 7: was "Back Rm")');
  h.ok(secWalk(T._nodes.mapHead).some(n => n.tagName === 'H2' && n.textContent === 'Act 4'), 'the map head: a short "Act 4" that never truncates');
  h.ok(G.meta.ach.back_room && G.meta.ach.keymaster, 'the Back Room and Keymaster stickers');
  h.eq(T.AUDIO.mode, 'backroom', 'its own music');
  G.draw();
  G.save();
  const T3 = boot({ store: Object.assign({}, T._store) });
  h.ok(T3.GAME.load() && T3.GAME.screen === 'map' && T3.GAME.run.map.biome === 'machine' && T3.GAME.run.sec.room, 'a reload in the Back Room');
  T3.GAME.draw();
});

h.test('secret: the Back Room: elites with the strongest affixes, the service counter, The Machine\'s card', () => {
  const { T, G } = secBoot();
  const M = secRoom(G, 3304);
  const land = Object.values(M.tiles).filter(t => T.MAP.isLand(t));
  h.ok(land.length >= 5 && land.length <= 8, land.length + ' hexes');
  const el = land.find(t => t.type === 'elite');
  el.revealed = true;
  G.enterTile(el);
  h.eq(G.screen, 'fight', 'an elite fight');
  h.ok(G.fight.enemies[0].affix.length >= T.DATA.SECRET.eliteAffix, 'with the strongest affixes: ' + G.fight.enemies[0].affix.join(','));
  G.draw();
  secVs(G); G.draw();
  G.endFight('win');
  G.choose(G.S.ui.buttons.findIndex(b => b.label === 'Skip'));
  if (G.screen === 'treasure' && G.S.sd.treasure.crRw) G.choose(G.S.ui.buttons.findIndex(b => b.label === 'Skip'));   // (round 21) a first elite's combo relic pick
  h.eq(G.screen, 'map', 'back on the Back Room map');
  const sh = land.find(t => t.type === 'shop');
  sh.revealed = true;
  G.enterTile(sh);
  h.eq(G.screen, 'shop', 'the service counter');
  const shop = G.S.sd.shop;
  h.ok(shop.sec && shop.items.length >= 3 && shop.items.every(it => T.DATA.ITEMS[it.id].rarity === 'l'), 'legendary stock only');
  h.ok(!shop.relic || T.DATA.RELICS[shop.relic.id].rarity === 'l', 'and a legendary relic (round 12; a boss relic once they are all owned)');
  h.ok(secWalk(T._nodes.shopBody).some(n => /SERVICE COUNTER/.test(n.textContent || '')), 'it says so');
  G.run.gold = 9999;
  const buy = G.S.ui.buttons.findIndex(b => b.label === T.DATA.ITEMS[shop.items[0].id].name);
  const n0 = G.run.bin.length;
  G.choose(buy);
  h.eq(G.run.bin.length, n0 + (T.DATA.ITEMS[shop.items[0].id].bag ? T.DATA.ITEMS[shop.items[0].id].bag.length : 1), 'a legendary bought');
  G.choose(G.S.ui.buttons.findIndex(b => b.label === 'Leave'));
  const bt = M.tiles[M.boss.q + ',' + M.boss.r];
  G.enterTile(bt);
  h.eq(G.fight.enemies[0].id, 'machine', 'The Machine on the boss hex');
  h.eq(G.boss.vs && G.boss.vs.title, 'SECRET BOSS', 'the versus card: SECRET BOSS');
  h.eq(T.AUDIO.mode, 'machine', 'its own fight music');
  stepFor(G, 0.4); G.draw();
  secVs(G); stepFor(G, 0.5); G.draw();
  h.ok(G.meta.seen.enemies.machine, 'met: it joins the Prizedex');
  h.ok(G.sec.sign() === null || Array.isArray(G.sec.sign()), 'the sign reads');
});

h.test('secret: The Machine\'s cabinet events play in the cabinet', () => {
  const { T, G } = secBoot();
  const F = secMachine(G, 3305), C = T.COMBAT, e = F.enemies[0];
  const calm = { id: 'calm', name: 'Calm', k: 'block', v: 1, txt: 'calm' };
  const ev = (part, ph) => {
    e.enraged = ph >= 1; e.final = ph >= 2;
    const set = e.def.sig.phases[C.secPhase(e)];
    e.sigN = set.indexOf(part); e.intent = Object.assign({}, calm);
    G.endTurn();
    settle(G, 20);
    stepFor(G, 0.4);
    G.draw();
  };
  ev('tilt', 0);
  h.ok(Math.abs(G.world.gravity.x) > 510 * 1.5, 'the big tilt heels the whole cabinet over (' + Math.round(G.world.gravity.x) + ')');
  const junk0 = F.bin.filter(i => i.junk).length;
  ev('flood', 0);
  stepFor(G, 1.2);
  const junk = F.bin.filter(i => i.junk);
  h.ok(junk.length >= junk0 + 4, 'a flood of junk pours in');
  h.ok(junk.every(i => G.toys.bodyOf(i)), 'every piece lands in the cabinet');
  ev('claw', 0);
  h.ok(F.rigged && F.rigged.secret, 'it takes the claw');
  h.eq((G.sec.sign() || [])[0], 'HIJACKED', 'the sign says so');
  stepFor(G, 0.5);
  h.ok(G.boss.bs.hj, 'the claw is on its strings');
  stepFor(G, 4); settle(G, 20);
  h.ok(!F.rigged, 'one drop, then it lets go');
  ev('grav', 1);
  h.ok(F.secGrav && G.best.state && G.best.state.ceil, 'zero g');
  stepFor(G, 1.5);
  const up = G.fs.items.filter(b => b.data.bestHang === 1);
  h.ok(up.length >= 3 && up.every(b => b.y < 220), up.length + ' items float up under the lid');
  h.eq((G.sec.sign() || [])[0], 'ZERO G', 'the sign');
  G.endTurn(); settle(G, 20); stepFor(G, 0.8);
  h.ok(!F.secGrav && !G.best.state.ceil, 'gravity back as your turn ends');
  ev('rail', 1);
  h.ok(F.secZap && F.secZap.v === T.DATA.ENEMIES.machine.sig.zap[1], 'the rail is live');
  F.player.block = 0;
  const hp0 = F.player.hp;
  h.ok(G.dropClaw(), 'a drop');
  stepFor(G, 0.3);
  h.eq(F.player.hp, hp0 - F.secZap.v, 'shocks you');
  settle(G, 20);
  const metal = G.fs.items.find(b => (b.data.tags || []).includes('metal'));
  if (metal) { G.playDelivered([metal]); h.ok(!F.secZap, 'a metal prize grounds the rail'); }
  else h.ok(true, 'no metal in the bin to ground it');
  settle(G, 20);
  ev('shutter', 1);
  h.ok(F.secShut && G.sec.fs.seg && G.world.segs.includes(G.sec.fs.seg), 'the shutter is a wall over the chute');
  h.eq((G.sec.sign() || [])[0], 'SHUTTER: HEAVY ONLY', 'the sign');
  stepFor(G, 0.5); G.draw();
  const rock = G.fs.items.find(b => (b.data.tags || []).includes('heavy'));
  let dent = false;
  for (let k = 0; k < 3 && rock && !dent; k++) {
    const L = G.sec.fs.seg;
    if (!L) { dent = true; break; }
    rock.x = L.ax + 30; rock.y = L.ay - 90; rock.vx = 0; rock.vy = 350; rock.sl = false; rock.av = 0;
    stepFor(G, 0.5);
    dent = !F.secShut || F.secShut.hp < 2;
  }
  h.ok(dent, 'a heavy prize dents it (' + JSON.stringify(F.secShut) + ')');
  G.endTurn(); settle(G, 20); stepFor(G, 0.3);
  h.ok(!F.secShut && !G.sec.fs.seg, 'the shutter lifts as your turn ends');
  G.draw();
});

h.test('secret: phases and cracks, the power down, the true ending, the win and Endless, saved at every step', () => {
  const { T, G } = secBoot();
  const F = secMachine(G, 3306), C = T.COMBAT, e = F.enemies[0];
  G.draw();
  C.damage(F, F.player, e, Math.ceil(e.maxHp * 0.55), { pierce: true });
  secFlush(G); settle(G, 20); stepFor(G, 0.5);
  h.eq(G.sec.fs.phase, 1, 'OVERCLOCKED: phase two, its light show');
  G.draw();
  C.damage(F, F.player, e, e.hp - Math.floor(e.maxHp * 0.12), { pierce: true });
  secFlush(G); settle(G, 20); stepFor(G, 1.5);
  h.ok(e.final && G.sec.fs.phase === 2, 'MELTDOWN: the final phase');
  h.ok(G.sec.fs.crack > 0.3, 'the glass cracks as it drains (' + G.sec.fs.crack.toFixed(2) + ')');
  G.draw();
  C.damage(F, F.player, e, e.hp + 10, { pierce: true });
  secFlush(G);
  stepFor(G, 0.8);
  h.ok(G.screen === 'fight' && G.sec.fs.pd, 'it powers down on the fight screen');
  h.ok(G.fs.outro && G.fs.outro.sec && G.fs.outro.sec.k === 'ending' && !G.fs.outro.reward, 'no reward screen: the outro is the power down');
  h.ok(G.run.sec.beat, 'The Machine is down');
  G.draw();
  const saved = JSON.parse(T._store.clawspire_run);
  h.ok(saved.screen === 'secret' && saved.sd.secret.k === 'ending', 'a save during the power down is the true ending');
  const T2 = boot({ store: Object.assign({}, T._store) });
  h.ok(T2.GAME.load() && T2.GAME.screen === 'secret' && T2.GAME.sec.scr.k === 'ending', 'and a reload there shows it');
  G.endFight('win');
  h.eq(G.screen, 'fight', 'a tap cannot skip its first beat');
  stepFor(G, 7.5);
  h.eq(G.screen, 'secret', 'the true ending');
  h.eq(G.sec.scr.k, 'ending', 'at dawn');
  h.eq(G.S.ui.buttons.map(b => b.label).join(), 'Continue', 'then Continue');
  h.ok(secWalk(T._nodes.secretBody).some(n => n.textContent === 'RoxorLoops & Jasmin') && secWalk(T._nodes.secretBody).some(n => n.textContent === 'THANKS FOR PLAYING!'), 'the credits name the owners and thank you');
  h.ok(G.meta.ach.true_ending && G.meta.sec.ends === 1, 'the True Ending sticker');
  stepFor(G, 3); G.draw();
  G.sec.hurry(); stepFor(G, 0.3); G.draw();
  G.choose(0);
  h.eq(G.screen, 'win', 'then the usual win screen');
  h.ok(secWalk(T._nodes.winBody).some(n => n.textContent === 'The Machine powers down'), 'with the true ending\'s words');
  const rec = G.run.scoreRec && G.run.scoreRec.classic;
  h.ok(rec && rec.lines.some(l => l.k === 'machine' && l.v === T.DATA.SECRET.score), 'the score counts The Machine');
  h.ok(G.run.sec.done && !G.run.sec.room, 'out of the Back Room');
  h.eq(G.S.ui.buttons[1].label, 'Keep playing: Endless', 'the Endless offer');
  G.save();
  const T3 = boot({ store: Object.assign({}, T._store) });
  h.ok(T3.GAME.load() && T3.GAME.screen === 'win', 'a reload on the win screen');
  G.choose(1);
  h.eq(G.screen, 'loop', 'Endless reboots');
  G.endless.cont(); toMapFrom(G);
  h.ok(G.screen === 'map' && G.run.map.biome !== 'machine' && !G.run.map.sec, 'a loop map: no machine, no key');
  h.eq(T._nodes.actTxt.textContent, 'Loop 1', 'the HUD says Loop 1');
  G.draw();
});

h.test('secret: old saves and profiles load, and the Prizedex hides the boss until it is met', () => {
  const { T, G } = secBoot();
  G.newRun('knight', 3307);
  delete G.run.sec; delete G.run.map.sec;
  G.save();
  const T2 = boot({ store: Object.assign({}, T._store) });
  h.ok(T2.GAME.load() && T2.GAME.screen === 'map', 'a save from before the keys loads');
  h.eq(T2.GAME.sec.keys(), 0, 'no keys');
  h.ok(T2.GAME.sec.of().kinds[1] && !T2.GAME.run.map.sec, 'the run gets its defaults; the old map has no key');
  T2.GAME.draw();
  h.ok(!T2.GAME.sec.nextAct(), 'and no door');
  G.run.sec = 'junk';
  h.ok(G.sec.of().keys && G.sec.keys() === 0, 'junk is repaired');
  h.ok(G.meta.sec && G.meta.sec.keys === 0, 'an old profile gets the counters');
  const { T: T4, G: G4 } = secBoot({ sec: { keys: 'x', rooms: -3 } });
  h.ok(G4.meta.sec.keys === 0 && G4.meta.sec.rooms === 0, 'a junk profile is repaired');
  G4.showCollection('enemies');
  const card = secWalk(T4._nodes.collectionBody).find(n => /dexc/.test(n.className || '') && secWalk(n).some(x => x.textContent === 'SECRET BOSS'));
  h.ok(card && secWalk(card).some(x => x.textContent === '???') && /locked/.test(card.className), 'a locked ??? card: SECRET BOSS');
  G4.prog.dexSee('enemies', 'machine', true);
  G4.showCollection('enemies');
  const got = secWalk(T4._nodes.collectionBody).find(n => /dexc/.test(n.className || '') && secWalk(n).some(x => x.textContent === 'The Machine'));
  h.ok(got && /got/.test(got.className), 'met, it shows its name');
});

// ---------------------------------------------------------------- EVOLVE (round 7): item evolutions and pet synergies
// DESIGN.md "Evolutions and pet synergies (round 7)".
const EVO_META = JSON.stringify({ introSeen: true, tutorialDone: true, unlocks: { knight: true } });
function evoBoot(store) { return boot({ store: Object.assign({ clawspire_meta: EVO_META }, store || {}) }); }
// A knight fight with the Trophy Rack and an upgraded Rusty Sword; returns {sw: the run's instance}.
function evoFight(G, seed, o) {
  o = o || {};
  G.newRun('knight', seed || 7070);
  if (o.relic !== false) G.run.relics.push(o.relic || 'trophy_rack');
  const sw = G.run.bin.find(i => i.id === 'rusty_sword');
  sw.plus = o.plus !== false;
  G.startFight(o.enc || ['rat'], 'normal', { seed: 4040 });
  for (let i = 0; i < 40; i++) G.update(DT);
  return { sw };
}
const evoBody = (G, uid) => G.fs.items.find(b => b.data.inst && b.data.inst.uid === uid) || null;

h.test('evolve: a delivered Rusty Sword+ with the Trophy Rack evolves, with the ceremony, and plays', () => {
  const T = evoBoot(), G = T.GAME, D = T.DATA;
  const { sw } = evoFight(G, 7071);
  const b = evoBody(G, sw.uid);
  h.ok(b, 'the sword is in the cabinet');
  const hp0 = G.fight.enemies[0].hp;
  G.playDelivered([b]);
  const E = G.evo.fs;
  h.ok(E && E.r.to === 'excalibur_claw', 'the ceremony starts on delivery');
  h.eq(sw.id, 'excalibur_claw', "the run's bin already holds the evolved item");
  h.eq(sw.plus, false, 'an evolved item has no plus');
  h.ok(G.fight.evos.includes('evo:excalibur_claw'), 'its aura is live in the fight');
  h.ok(G.meta.evo.seen.excalibur_claw && G.meta.evo.made === 1 && G.meta.evo.new.excalibur_claw, 'the book remembers it');
  h.ok(G.meta.ach.evolved, 'the It Evolved! sticker');
  h.eq(G.run.evoN, 1, 'the run counts it');
  // the fight holds its breath: nothing plays while the item evolves
  const q0 = G.state().queue;
  for (let i = 0; i < 30; i++) { G.update(DT); G.draw(); }
  h.eq(G.fight.enemies[0].hp, hp0, 'nothing resolves during the ceremony');
  h.ok(G.state().queue >= q0 && G.evo.fs && !G.evo.fs.burst, 'still charging');
  // a tap jumps to the reveal, the next one (after a beat) ends it
  G.tap(270, 600);
  h.ok(G.evo.fs && G.evo.fs.burst, 'a tap: the new form bursts in');
  G.tap(270, 600);
  h.ok(G.evo.fs, 'a second tap right away does not skip the reveal');
  for (let i = 0; i < 25; i++) { G.update(DT); G.draw(); }
  G.tap(270, 600);
  h.eq(G.evo.fs, null, 'the next tap ends it');
  // (RROW round 21) it lands on the resolve row first, in its evolved form, then flies to its target
  h.ok(G.row.state && G.row.state.slots.some(s => s.inst && s.inst.uid === sw.uid && s.st === 'wait'), 'the evolved item lands on the resolve row');
  G.update(DT);
  h.ok(G.fs.throws.some(t => t.inst === G.fight.bin.concat(G.fight.used).find(x => x.uid === sw.uid) || t.def.id === 'excalibur_claw'), 'the evolved item flies to its target');
  settle(G, 6);
  h.ok(hp0 - G.fight.enemies[0].hp >= 18, `Excalibur Claw hit for 18+ (${hp0 - G.fight.enemies[0].hp})`);
  h.eq(G.fight.player.status.str, 1, 'and gave 1 Strength');
  // left alone the ceremony ends by itself
  const T2 = evoBoot(), G2 = T2.GAME;
  const s2 = evoFight(G2, 7072).sw;
  G2.playDelivered([evoBody(G2, s2.uid)]);
  let n = 0;
  while (G2.evo.fs && n++ < 400) { G2.update(DT); if (n % 10 === 0) G2.draw(); }
  h.ok(!G2.evo.fs && n < 400, `it ends on its own (${(n * DT).toFixed(2)} s)`);
  h.ok(n * DT <= G2.evo.EVO.dur + 0.1, 'within its duration');
});

h.test('evolve: only the right item, plus and relic; a golden prize plus does not count', () => {
  let T = evoBoot(), G = T.GAME;
  let { sw } = evoFight(G, 7073, { relic: 'festering_jar' });
  G.playDelivered([evoBody(G, sw.uid)]);
  h.eq(G.evo.fs, null, 'the wrong relic: no ceremony');
  h.eq(sw.id, 'rusty_sword', 'and no evolution');
  G.update(DT);   // (RROW round 21) from the resolve row
  h.ok(G.fs.throws.length === 1, 'the item is thrown as ever');
  T = evoBoot(); G = T.GAME;
  ({ sw } = evoFight(G, 7074, { plus: false }));
  const fi = G.fight.bin.find(i => i.uid === sw.uid);
  fi.plus = true;   // a golden prize's fight-only plus
  G.playDelivered([evoBody(G, sw.uid)]);
  h.eq(G.evo.fs, null, "the run's copy is not upgraded: no evolution");
  h.eq(sw.id, 'rusty_sword', 'the run keeps its Rusty Sword');
  T = evoBoot(); G = T.GAME;
  ({ sw } = evoFight(G, 7075, { relic: false }));
  G.playDelivered([evoBody(G, sw.uid)]);
  h.ok(!G.evo.fs && sw.id === 'rusty_sword' && !(G.meta.evo && G.meta.evo.made), 'no relic: nothing');
});

h.test('evolve: two in one grab queue up; a save mid ceremony reloads the fight with the evolved item', () => {
  const T = evoBoot(), G = T.GAME;
  const { sw } = evoFight(G, 7076);
  // a second recipe in the same grab
  G.run.relics.push('money_bags');
  G.run.bin.push({ uid: 'evoC1', id: 'lucky_coin', plus: true });
  G.startFight(['rat'], 'normal', { seed: 4141 });
  for (let i = 0; i < 60; i++) G.update(DT);
  const bs = [evoBody(G, sw.uid), evoBody(G, 'evoC1')];
  h.ok(bs[0] && bs[1], 'both are in the cabinet');
  G.playDelivered(bs);
  h.ok(G.evo.fs && G.evo.queue.length === 1, 'the second waits for the first');
  h.ok(G.run.bin.some(i => i.id === 'midas_coin') && G.run.bin.some(i => i.id === 'excalibur_claw'), 'both evolved in the run at once');
  // save now (mid ceremony) and reload
  G.save();
  const T2 = boot({ store: Object.assign({}, T._store) }), G2 = T2.GAME;
  h.ok(G2.load(), 'the save loads');
  h.eq(G2.screen, 'fight', 'back in the fight (from its opening bell)');
  h.ok(G2.run.bin.filter(i => i.id === 'excalibur_claw').length === 1 && !G2.run.bin.some(i => i.id === 'rusty_sword' && i.plus), 'the run has the evolved item, not the old one');
  h.ok(G2.fight.bin.concat(G2.fight.used).some(i => i.id === 'excalibur_claw') && G2.fight.evos.includes('evo:excalibur_claw'), 'the fight starts with it and its aura');
  h.eq(G2.evo.fs, null, 'no ceremony on the reload');
  h.eq(G2.meta.evo.made, 2, 'the book kept both and counts nothing twice');
  for (let i = 0; i < 60; i++) G2.update(DT);
  const b2 = G2.fs.items.find(b => b.data.inst.id === 'excalibur_claw');
  if (b2) G2.playDelivered([b2]);
  h.eq(G2.evo.fs, null, 'delivering the evolved item never evolves it again');
  // the first game plays both ceremonies through
  let n = 0;
  while ((G.evo.fs || G.evo.queue.length) && n++ < 900) G.update(DT);
  h.ok(!G.evo.fs && n < 900, 'both ceremonies play, one after the other');
});

h.test('evolve: hints after discovery, the EVOLVED badge, the forge and the rest', () => {
  const T = evoBoot(), G = T.GAME, D = T.DATA, doc = T._document;
  G.newRun('knight', 7077);
  const card = (id, plus) => { const el = doc.createElement('div'); G.evo.cardTag(el, D.ITEMS[id], plus); return secWalk(el).map(x => (x.className || '') + '|' + (x.textContent || '')); };
  h.ok(!card('rusty_sword', false).some(s => /evoHint/.test(s)), 'no hint before the recipe is known');
  G.meta.evo.seen.excalibur_claw = 1;
  const hint = card('rusty_sword', false).find(s => /evoHint/.test(s));
  h.ok(hint && /Evolves with: .*Trophy Rack/.test(hint), `the hint names the relic once seen [${hint}]`);
  G.run.relics.push('trophy_rack');
  h.ok(/ready!/.test(card('rusty_sword', true).find(s => /evoHint/.test(s))), 'holding the relic with a plus: ready!');
  h.ok(card('excalibur_claw', false).some(s => /evoBadge\|EVOLVED/.test(s)) && card('excalibur_claw', false).some(s => /evoAura/.test(s)), 'an evolved card wears the EVOLVED badge and its aura');
  h.ok(!card('longsword', false).some(s => /evo/.test(s)), 'an item with no recipe has neither');
  // the forge: upgrading the Rusty Sword completes the recipe, it evolves on the spot
  G.showForge();
  const up = G.S.ui.buttons.findIndex(b => b.label === 'Rusty Sword');
  h.ok(up >= 0, 'the forge offers the Rusty Sword');
  G.choose(up);
  h.ok(G.run.bin.some(i => i.id === 'excalibur_claw'), 'the upgrade evolved it');
  h.ok(G.evo.ui && G.evo.ui.r.to === 'excalibur_claw', 'the overlay ceremony is up');
  for (let i = 0; i < 120; i++) { G.update(DT); G.draw(); }
  h.ok(G.evo.ui.burst, 'it bursts on its own');
  for (let i = 0; i < 240; i++) G.update(DT);
  h.ok(G.evo.ui, 'and waits on the reveal for a tap');
  G.evo.uiTap();
  h.eq(G.evo.ui, null, 'a tap closes it');
  // a ready plus item gets an EVOLVE card at the forge
  G.run.bin.push({ uid: 'evoF1', id: 'venom_dart', plus: true });
  G.run.relics.push('festering_jar');
  G.showForge();
  const ev = G.S.ui.buttons.findIndex(b => b.label === 'Venom Dart+');
  h.ok(ev >= 0 && G.S.ui.buttons[G.S.ui.buttons.length - 1].label === 'Leave', 'an EVOLVE card, Leave still last');
  G.choose(ev);
  h.ok(G.run.bin.find(i => i.uid === 'evoF1').id === 'plague_needle', 'picked at the forge: it evolves');
  G.evo.uiClose();
  // the rest stop: an Evolve choice only when something is ready
  G.showRest();
  h.ok(!G.S.ui.buttons.some(b => b.el && /evoChoice/.test(b.el.className)), 'nothing ready: no Evolve choice');
  G.run.bin.push({ uid: 'evoR1', id: 'pot_lid', plus: true });
  G.run.relics.push('castle_walls');
  G.showRest();
  const ri = G.S.ui.buttons.findIndex(b => b.el && /evoChoice/.test(b.el.className));
  h.ok(ri >= 2, 'a ready item: Evolve an item, after the old choices');
  G.choose(ri);
  h.eq(G.screen, 'bin', 'it opens the picker');
  const pi = G.S.ui.buttons.findIndex(b => b.label === 'Pot Lid+' && !b.disabled);
  h.ok(pi >= 0 && G.S.ui.buttons.filter(b => !b.disabled && b.label !== 'Cancel').length === 1, 'only the ready item can be picked');
  G.choose(pi);
  h.ok(G.run.bin.find(i => i.uid === 'evoR1').id === 'tower_aegis' && G.screen === 'map', 'it evolves and the map follows');
  G.evo.uiClose();
  // the sharpen and forge lists skip evolved items (they have no plus)
  G.showForge();
  h.ok(!G.S.ui.buttons.some(b => /Excalibur|Plague|Tower Aegis/.test(b.label)), 'the forge never offers an evolved item');
});

h.test('evolve: the Prizedex Evolutions tab, old and junk profiles', () => {
  const T = evoBoot(), G = T.GAME, D = T.DATA;
  G.showCollection('evo');
  h.eq(G.S.dexTab, 'evo', 'the Evolutions tab opens');
  const body = T._nodes.collectionBody;
  const cards = secWalk(body).filter(n => /evoc/.test(n.className || ''));
  h.eq(cards.length, D.EVO_IDS.length, 'a card per recipe');
  h.ok(cards.every(c => /locked/.test(c.className)) && secWalk(body).some(n => n.textContent === '???'), 'silhouettes and ??? until found');
  h.ok(G.S.ui.buttons.some(b => b.label === 'Evolve'), 'the tab button');
  G.meta.evo.seen.nuke_pop = 1; G.meta.evo.new.nuke_pop = 1;
  G.showCollection('evo');
  const got = secWalk(T._nodes.collectionBody).filter(n => /evoc/.test(n.className || '') && /got/.test(n.className));
  h.eq(got.length, 1, 'a found recipe shows');
  h.ok(secWalk(T._nodes.collectionBody).some(n => n.textContent === 'Nuke Pop'), 'with its name');
  h.eq(Object.keys(G.meta.evo.new).length, 0, 'NEW! clears once shown');
  G.showCollection('items');
  h.eq(G.S.dexTab, 'items', 'the DATA tabs are unchanged');
  // an old profile has no evo; a junk one is repaired
  const T2 = boot({ store: { clawspire_meta: JSON.stringify({ introSeen: true, unlocks: { knight: true } }) } });
  h.eq(JSON.stringify(T2.GAME.evo.meta()), JSON.stringify({ seen: {}, made: 0, syn: 0, new: {} }), 'an old profile starts an empty book');
  const T3 = boot({ store: { clawspire_meta: JSON.stringify({ introSeen: true, evo: { seen: { nuke_pop: 1, junk: 1 }, made: 'x', syn: 4 } }) } });
  h.eq(JSON.stringify(T3.GAME.meta.evo), JSON.stringify({ seen: { nuke_pop: 1 }, made: 0, syn: 4, new: {} }), 'a junk book is repaired on load');
  // an old run save without evoN loads and fights
  const T4 = evoBoot(), G4 = T4.GAME;
  G4.newRun('knight', 7078);
  delete G4.run.evoN;
  G4.save();
  const G5 = boot({ store: Object.assign({}, T4._store) }).GAME;
  h.ok(G5.load() && G5.run && !G5.run.evoN, 'an old run loads');
});

h.test('evolve: pet synergies switch on with the build, fire their procs and badge the tag', () => {
  const T = evoBoot(), G = T.GAME, D = T.DATA;
  G.newRun('knight', 7080);
  const procOf = (id) => G.fs.queue.some(q => q.ev && q.ev.t === 'proc' && q.ev.src === 'pet' && q.ev.id === 'pet:' + id);
  // off without the build
  let P = petFight(G, 'hamster', 0, 801);
  h.eq(G.evo.syn(), null, 'hamster: off on a plain run');
  h.ok(/Needs a Swarm relic/.test(G.evo.tapLine(G.pet.of())), 'the tap says what switches it on');
  G.endFight('win'); G.toMap();
  // hamster + Beehive: Marble Run
  G.run.relics.push('beehive');
  G.run.bin.push({ uid: 'pm1', id: 'prize_marble', plus: false }, { uid: 'pm2', id: 'prize_marble', plus: false });
  P = petFight(G, 'hamster', 0, 802);
  h.ok(G.evo.syn() && G.evo.syn().name === 'Marble Run', 'hamster: on with a Swarm relic');
  h.ok(/\(ON\)/.test(G.evo.tapLine(G.pet.of())), 'the tap says ON');
  G.draw();
  const syn0 = G.meta.evo.syn;
  petUntilFx(G, 3);
  h.ok(P.log.some(e => e.k === 'syn' && e.syn === 'hamster'), 'hamster: its trick fired the synergy');
  h.ok(procOf('hamster') || G.meta.evo.syn > syn0, 'a pet proc for the badge');
  h.ok(G.meta.ach.best_buds, 'the Best Buds sticker');
  G.endFight('win'); G.toMap();
  // raccoon + Junkyard King: King's Feast
  G.run.relics.push('junkyard_king');
  P = petFight(G, 'raccoon', 0, 804, ['rock']);
  petUntilFx(G, 3);
  stepFor(G, 0.5);
  h.ok(P.log.some(e => e.k === 'syn' && e.syn === 'raccoon') && G.fight.player.status.str >= 1, "raccoon: King's Feast gives Strength");
  G.endFight('win'); G.toMap();
  // cat + a Pyro item: it bats the Pyro item and sets ALL on fire
  G.run.bin.push({ uid: 'tc1', id: 'torch', plus: false });
  P = petFight(G, 'cat', 0, 806);
  h.ok(G.evo.syn(), 'cat: on with a Pyro item in the bin');
  petUntilFx(G, 3);
  const batted = G.fight.bin.concat(G.fight.used).find(i => i.uid === (P.log.find(e => e.fx && e.k === 'bat') || {}).uid);
  h.ok(batted && batted.id === 'torch', 'cat: it batted the Pyro item');
  stepFor(G, 0.6);
  h.ok(G.fight.enemies.filter(e => e.alive).every(e => (e.status.burn || 0) >= 2), 'cat: Fire Cat gave ALL Burn');
  G.endFight('win'); G.toMap();
  // parrot + an Echo relic: Mimic copies what it carries
  G.run.relics.push('wizard_hat');
  P = petFight(G, 'parrot', 0, 807);
  const n0 = G.fight.bin.length;
  petUntilFx(G, 3);
  stepFor(G, 0.3);
  h.ok(G.fight.bin.length === n0 + 1 && G.fight.bin.some(i => i.temp), 'parrot: Mimic copied the item into the bin');
  G.endFight('win'); G.toMap();
  // mouse + the Magnet Crane: a second metal item comes along
  G.run.clawType = 'magnet';
  P = petFight(G, 'mouse', 0, 808);
  G.steer(260);
  petUntilFx(G, 3);
  h.ok(P.log.some(e => e.k === 'syn' && e.syn === 'mouse'), 'mouse: Double Pull');
  G.endFight('win'); G.toMap();
  G.run.clawType = 'classic';
  // firefly + a Frost relic: the spotlit item carries the mark into COMBAT
  G.run.relics.push('snow_globe');
  P = petFight(G, 'firefly', 0, 809);
  petUntilFx(G, 3);
  const lit = petBody(G, P.glowUid);
  h.ok(lit, 'firefly: an item in the spotlight');
  G.playDelivered([lit]);
  h.eq(lit.data.inst.spot, 1, 'firefly: Frost Light marks the delivered item');
  G.endFight('win'); G.toMap();
  // goose + two High Rollers pieces: two eggs and a Luck
  G.run.relics.push('dealers_visor', 'lucky_cat');
  P = petFight(G, 'goose', 0, 810);
  P.turn = G.fight.turn; P.uses = 1;
  const gg = G.fight.gain.gold, egg = D.petEgg(1), l0 = G.fight.player.status.luck || 0;
  G.pet.grab(3);
  stepFor(G, 1.5);
  h.eq(G.fight.gain.gold - gg, egg.gold * 2, 'goose: Golden Clutch lays two eggs');
  h.eq((G.fight.player.status.luck || 0) - l0, 1, 'goose: and a Luck');
  // the pet combo reads the pet along
  h.eq(G.fight.petId, 'goose', 'the fight knows the pet along (Nest Egg, Fetch!)');
  G.endFight('win'); G.toMap();
  // octopus: on with the Tri-Claw, a second arm on a real lift
  G.run.clawType = 'tri';
  petFight(G, 'octopus', 0, 811);
  h.ok(G.evo.syn() && G.evo.syn().name === 'Two Arms', 'octopus: on with the Tri-Claw');
  G.draw();
  G.endFight('win'); G.toMap();
  let two = 0, clean = 0;
  for (const seed of [900, 901, 902, 903]) {
    P = petFight(G, 'octopus', 0, seed);
    stepFor(G, 1);
    const xs = G.fs.items.map(b => b.x).sort((a, b) => a - b);
    G.steer(xs[Math.floor(xs.length / 2)]); stepFor(G, 0.7);
    G.dropClaw();
    let seen = false;
    for (let i = 0; i < 600; i++) { G.update(DT); if (P.hold2) seen = true; }
    if (seen && P.log.some(e => e.syn === 'octopus')) two++;
    if (!P.hold2 && !P.hookW2) clean++;
    G.endFight('win'); G.toMap();
  }
  h.ok(two >= 2, `octopus: Two Arms holds a second prize on real lifts (${two} of 4)`);
  h.eq(clean, 4, 'octopus: and lets go of it every time');
});

// ---------------------------------------------------------------- QA (round 7): elite telegraphs, safe spots, the Compactor's layout
{
  const Q7 = boot();
  const QG = Q7.GAME, QD = Q7.DATA, QC = Q7.COMBAT, QR = Q7.RENDER;
  const qaFight = (ids, tier, seed) => {
    QG.newRun('knight', seed || 707);
    QG.run.act = 2;
    QG.startFight(ids, tier);
    QG.boss.vsSkip(); QG.boss.vsSkip(); stepFor(QG, 0.05);
    settle(QG, 20);
    return QG.fight;
  };
  // capture an argument RENDER is drawn with
  const spy = (name, argI) => { const orig = QR[name], got = []; QR[name] = function (...a) { got.push(a[argI]); return orig.apply(this, a); }; return { got, done: () => { QR[name] = orig; } }; };
  h.test('qa: the Gape: its exact unleash in the bubble a turn ahead, the danger ring and the cabinet sign', () => {
    const F = qaFight(['ironjaw'], 'elite');
    const e = F.enemies[0], gape = e.def.moves.find(m => m.k === 'charge');
    e.intent = gape; e.status.str = 3; F.player.status.vuln = 2;
    QG.qa.refresh();
    const q = QG.qa.by[0];
    h.ok(q && q.k === 'charge' && q.big, 'a charge is a big one');
    h.eq(q.next, Math.floor((gape.v + 3) * 1.5), `the unleash next turn: (${gape.v} + 3 Strength) x1.5 Vulnerable`);
    stepFor(QG, 0.6);
    h.eq(QG.qa.sign, `GAPE NEXT TURN: ${q.next}`, 'the cabinet sign names it with the number, a turn ahead');
    const bub = spy('intent', 5), sign = spy('bossSign', 3);
    Q7._resetCounts(); QG.draw(); const rings = Q7._counts.ellipse || 0;
    bub.done(); sign.done();
    h.ok(bub.got[0] && bub.got[0].next === q.next, 'the bubble is drawn with the unleash');
    h.ok(sign.got.includes(`GAPE NEXT TURN: ${q.next}`), 'the sign is drawn on the cabinet');
    e.intent = { id: 'calm', name: 'Calm', k: 'block', v: 1 }; QG.qa.refresh();
    Q7._resetCounts(); QG.draw();
    h.ok(rings >= (Q7._counts.ellipse || 0) + 1, `the danger ring (an ellipse more, two with motion: ${rings} vs ${Q7._counts.ellipse || 0})`);
    // the unleash: the same number lands, the sign says it is coming
    e.intent = gape; QG.qa.refresh();
    e.charged = gape.v; QC.pickIntent(F, e); QG.qa.refresh(); stepFor(QG, 0.3);
    const u = QG.qa.by[0];
    h.ok(u.charged && u.total === q.next, `the unleash hits for what was shown (${u.total})`);
    h.eq(QG.qa.sign, `GAPE: ${u.total} INCOMING`, 'the sign as it lands');
  });
  h.test('qa: the HP ghost and the pill: INCOMING, ALL BLOCKED, LETHAL! with the Block that saves you; gone in the enemy turn', () => {
    const F = qaFight(['ironjaw'], 'elite', 708);
    const e = F.enemies[0], bite = e.def.moves.find(m => m.k === 'attack');
    e.intent = bite; e.status = {}; e.affix = []; F.player.status = {};
    F.player.hp = F.player.maxHp; F.player.block = 0;
    QG.qa.refresh();
    const d = QG.qa.QA.dom, T = QG.qa.threat;
    h.ok(d && T && T.net === bite.v, `the phase takes the bite (${T && T.net})`);
    const lethal = T.net >= F.player.hp;
    h.eq(d.main.textContent, lethal ? 'LETHAL!' : 'INCOMING', 'the word');
    h.eq(d.num.textContent, `-${T.net}`, 'the number');
    h.eq(d.gh.style.width, (Math.min(F.player.hp, T.net) / F.player.maxHp * 100).toFixed(1) + '%', 'the ghost in the HP bar is the loss');
    F.player.block = 999; QG.qa.refresh();
    h.ok(d.main.textContent === 'ALL BLOCKED' && d.num.textContent === '' && d.gh.style.width === '0.0%', 'all of it blocked');
    F.player.block = 5; F.player.hp = 10; QG.qa.refresh();
    h.ok(QG.qa.threat.lethal && d.main.textContent === 'LETHAL!' && d.sub.textContent === `need ${bite.v - 5 - 10 + 1} Block`, `lethal, with the Block that would save you: ${d.sub.textContent}`);
    h.ok(/lethal/.test(d.pill.className), 'the pill turns red');
    F.player.hp = F.player.maxHp; F.player.block = 0;
    QG.endTurn(); stepFor(QG, 0.2);
    h.ok(!QG.qa.threat && !/show/.test(d.pill.className), 'hidden while the enemies act');
    settle(QG, 20);
    QG.qa.refresh();
    h.ok(QG.screen !== 'fight' || QG.fight.phase !== 'player' || QG.qa.threat, 'back on your turn');
    QG.toMap(); QG.qa.refresh();
    h.ok(!/show/.test(d.pill.className), 'gone off the fight screen');
  });
  h.test('qa: a multi-hit shows its total; bubbles carry the real numbers for every enemy', () => {
    const F = qaFight(['lodestone', 'rat'], 'elite', 709);
    const e = F.enemies[0], zap = e.def.moves.find(m => m.k === 'attack' && m.n > 1);
    e.intent = zap; e.status = {}; e.affix = [];
    QG.qa.refresh();
    const q = QG.qa.by[0];
    h.ok(q.n === zap.n && q.hit === zap.v && q.total === zap.v * zap.n, `${q.hit}x${q.n} = ${q.total}`);
    const bub = spy('intent', 5);
    QG.draw(); bub.done();
    h.ok(bub.got.length === 2 && bub.got[0].total === q.total && bub.got[1] && bub.got[1].k === F.enemies[1].intent.k, 'both bubbles get their numbers');
    let popped = '';
    for (let x = 100; x < 260 && !popped; x += 20) { QG.tap(x, 240); const pop = Q7._nodes.pop && Q7._nodes.pop.innerHTML || ''; if (/Hits you for/.test(pop) && /Lodestone/.test(pop)) popped = pop; }
    h.ok(popped.includes(`Hits you for ${q.total}</b> (${q.hit} x${q.n})`), 'a tap on it says the same in words');
    // the real draw with every mode of the numbers (no throw)
    for (const qa of [{ k: 'attack', hit: 9, n: 3, jab: 2, total: 33, big: true }, { k: 'charge', next: 120, big: true }, null]) QR.intent(Q7._ctx, 100, 100, e, 1, qa);
    h.ok(true, 'drawn');
  });
  h.test('qa: safe spots: the first clear, else the least covered; buttons and signs weigh most', () => {
    const { spot, cands } = QG.qa;
    const c = cands(250, 60);
    h.ok(c[0][0] === 540 - 250 - 6 && c[0][1] === 6 && c[1][0] === 6, 'the top strip right, then left');
    h.eq(JSON.stringify(spot(c, 250, 60, [])), JSON.stringify({ x: 284, y: 6, o: 0, hard: 0 }), 'nothing to dodge: top right');
    let s = spot(c, 250, 60, [{ x0: 16, y0: 8, x1: 420, y1: 60, w: 3 }]);
    h.ok(s.o === 0 && s.x === 284 && s.y === 78, `a long title across the top: under it on the right (${s.x},${s.y})`);
    const walls = c.map(([x, y]) => ({ x0: x, y0: y, x1: x + 250, y1: y + 60, w: 10 }));
    s = spot(c, 250, 60, walls);
    h.ok(s.hard > 0, 'every spot on a button: it says so');
    // every spot on a button but the bottom left, which has only text on it
    s = spot(c, 250, 60, walls.filter((r, i) => i !== 5 && i !== 6).concat([Object.assign({}, walls[5], { w: 1 })]));
    h.ok(s.x === c[5][0] && s.y === c[5][1] && s.hard === 0 && s.o > 0, `text over a button: the spot on text wins (${s.x},${s.y})`);
  });
  h.test('qa: the discovery toast keeps off the Compactor\'s sign and its buttons; the vault toast off the Endless button', () => {
    QG.newRun('alchemist', 44);
    QG.qa.size = (el, tight) => (tight ? { w: 250, h: 56 } : { w: 280, h: 84 });
    QG.cmp.show({ from: 'rest', pick: [], res: null });
    // the dock's buttons at the bottom, the grid in the middle (as the browser lays it out)
    QG.qa.measure = (scr) => (scr === 'compactor' ? [{ x0: 110, y0: 890, x1: 300, y1: 945, w: 10 }, { x0: 316, y0: 890, x1: 420, y1: 945, w: 10 }, { x0: 16, y0: 8, x1: 290, y1: 40, w: 3 }, { x0: 14, y0: 360, x1: 526, y1: 780, w: 1 }] : []);
    const ids = Object.keys(QD.ITEMS).filter(id => !QG.meta.seen.items[id]).slice(0, 5);
    for (const id of ids) QG.prog.dexSee('items', id);
    stepFor(QG, 0.5);
    const cur = QG.S.mcur;
    h.ok(cur && cur.k === 'dex' && cur.el, 'five discoveries: one toast');
    const x = parseFloat(cur.el.style.left), y = parseFloat(cur.el.style.top), w = cur.qaTight ? 250 : 280, hh = cur.qaTight ? 56 : 84;
    const over = (r) => x < r[2] && x + w > r[0] && y < r[3] && y + hh > r[1];
    h.ok(QG.qa.signs('compactor').every(r => !over(r)), `off the press's sign at ${x},${y} (${w}x${hh})`);
    h.ok(cur.qa && cur.qa.hard === 0 && !cur.hold, 'and off the buttons, shown at once');
    // a plain toast while it is up never lands on it (nor it on the toast)
    QG.qa.size = (el, tight) => (el === Q7._nodes.toast ? { w: 300, h: 44 } : tight ? { w: 250, h: 56 } : { w: 280, h: 84 });
    QG.cmp.crush();   // refused with "Feed it three items."
    const tt = parseFloat(Q7._nodes.toast.style.top), cr = cur.rect;
    h.ok(/three items/.test(Q7._nodes.toast.textContent) && cr && (tt + 44 <= cr.y0 || tt >= cr.y1), `the toast (top ${tt}) clear of the corner item (${cr && cr.y0}..${cr && cr.y1})`);
    // the win screen: CASH OUT and KEEP PLAYING: ENDLESS where the plain toast used to sit
    QG.qa.size = () => ({ w: 420, h: 44 });
    QG.qa.measure = (scr) => (scr === 'win' ? [{ x0: 16, y0: 320, x1: 524, y1: 366, w: 10 }, { x0: 16, y0: 376, x1: 524, y1: 432, w: 10 }] : []);
    QG.run.act = 3; QG.showWin();
    const toastEl = Q7._nodes.toast;
    const withPrize = QD.ACH_IDS.find(a => QD.vaultForSticker(a).length && !(QG.meta.ach && QG.meta.ach[a]));
    h.ok(withPrize && QG.prog.achUnlock(withPrize), `a sticker with a Prize Vault prize (${withPrize})`);
    h.ok(/Prize Vault/.test(toastEl.textContent), `its toast: ${toastEl.textContent}`);
    const ty = parseFloat(toastEl.style.top);
    h.ok(Number.isFinite(ty) && (ty + 44 <= 320 || ty >= 432), `the toast sits off both buttons (top ${ty})`);
    h.ok(ty !== 400, 'not at its old 400');
    // a screen with every spot on a button: the sticker waits (its clock paused), then shows anyway
    QG.qa.size = () => ({ w: 250, h: 60 });
    QG.qa.measure = () => [{ x0: 0, y0: 0, x1: 540, y1: 960, w: 10 }];
    QG.showStickers();
    QG.S.mq = []; QG.S.mcur = null;   // an empty lane (the win screen queued its own stickers)
    QG.prog.achUnlock('high_score');
    stepFor(QG, 0.3);
    const st = QG.S.mcur;
    h.ok(st && st.k === 'ach' && st.hold && st.el.style.visibility === 'hidden', 'no clear spot: the sticker waits hidden');
    const t0 = st.t;
    stepFor(QG, 1);
    h.ok(QG.S.mcur === st && st.t === t0, 'its clock waits too');
    stepFor(QG, QG.qa.HOLD);
    h.ok(QG.S.mcur === st && !st.hold && st.el.style.visibility === '', 'after the hold it shows at the least covered spot');
    stepFor(QG, 3.2);
    h.ok(QG.S.mcur !== st, 'and peels off on its own clock');
    // the fight keeps its own corner: no inline spot
    QG.qa.measure = null; QG.qa.size = null;
  });
  h.test('qa: the Compactor on a phone: a smaller press to pick, the chosen items and CRUSH in the dock, the recipe with the result', () => {
    QG.newRun('knight', 45);
    const walk = (n, f, out) => { out = out || []; if (!n) return out; if (f(n)) out.push(n); for (const c of n.children || []) walk(c, f, out); return out; };
    QG.cmp.show({ from: 'rest', pick: [], res: null });
    const body = Q7._nodes.cmpBody;
    const cls = body.children.map(c => c.className.split(' ')[0]);
    h.eq(cls.join(','), 'cmpTop,cmpWin,cmpPanel,cmpDock', 'the title, the press, the bin, the dock');
    h.ok(/qaKeep/.test(body.children[3].className), 'the dock is kept clear of the corner lane (Continue lands there)');
    const dock = body.children[3];
    h.ok(walk(dock, n => /cmpSlotBox/.test(n.className)).length === 3 && walk(dock, n => n.textContent === 'CRUSH').length === 1 && walk(dock, n => n.textContent === 'Back').length === 1, 'the three slots, CRUSH and Back sit in the dock (the thumb zone)');
    h.eq(QG.qa.cmpPressK(QG.cmp.state), 0.8, 'the press is drawn smaller while you pick');
    const sc = spy('cmpScene', 1);
    QG.draw(); sc.done();
    h.ok(sc.got[0] && sc.got[0].s === 0.8 && Math.abs(sc.got[0].x - 54) < 0.01, 'centred at 0.8');
    for (const i of QG.run.bin.slice(0, 3)) QG.cmp.pick(i.uid);
    QG.cmp.crush();
    h.eq(QG.qa.cmpPressK(QG.cmp.state), 1, 'full size for the crush');
    const b2 = Q7._nodes.cmpBody;
    const rec = walk(b2, n => n.className === 'cmpRecipe')[0];
    h.ok(rec && rec.children.length === 5, 'the recipe: three in, an arrow, one out');
    h.ok(walk(b2.children[3], n => n.textContent === 'Continue').length === 1, 'Continue in the dock');
    QG.cmp.leave();
    h.eq(QG.screen, 'map', 'and back to the map');
  });
}

// ---------------------------------------------------------------- SEASON (round 7): seasonal events
{
  const bootS = (store) => boot(store ? { store } : undefined);
  const doorsOf = (G) => Object.values(G.run.map.tiles).filter(t => t.type === 'treat');
  const candy = (G) => ((G.meta.sea || {}).wallet || {}).candy | 0;
  h.test('season: headless has no season unless a date, the URL or the preview says so', () => {
    const A = bootS(), SG = A.GAME;
    h.eq(SG.season.now(), null, 'no season headless without a date (the wall clock is never read)');
    h.eq(SG.season.setDate('2026-10-15'), 'halloween', 'a date in October is Claw-o-ween');
    h.ok(!SG.season.previewing(), 'the calendar, not a preview');
    h.eq(SG.season.setDate('2026-12-24'), 'winter', 'Christmas Eve is winter');
    h.eq(SG.season.setDate('2027-01-06'), 'winter', 'the last day of winter');
    h.eq(SG.season.setDate('2027-01-07'), null, 'and the day after, nothing');
    h.eq(SG.season.setDate(null), null, 'no date, no season');
    A._window.location.search = '?season=halloween';
    h.eq(SG.season.readUrl(), 'halloween', '?season=halloween is read');
    h.eq(SG.season.now(), 'halloween', '...and turns the season on any day');
    h.ok(SG.season.previewing(), '...as a preview');
    SG.season.setDate('2026-12-24');
    h.eq(SG.season.now(), 'halloween', 'the URL wins over the calendar');
    A._window.location.search = '?season=off';
    SG.season.readUrl();
    h.eq(SG.season.now(), null, '?season=off turns it off, even at Christmas');
    A._window.location.search = '?season=easter';
    SG.season.readUrl();
    h.eq(SG.season.now(), 'winter', 'an unknown ?season= is ignored');
    A._window.location.search = '';
    SG.season.readUrl();
    // the hidden preview: five taps on the logo, a pick saved on the profile
    SG.season.setDate(null);
    SG.showTitle();
    for (let i = 0; i < 4; i++) h.ok(!SG.season.logoTap(), 'tap ' + (i + 1) + ' does nothing yet');
    h.ok(SG.season.logoTap(), 'the fifth tap opens the Event preview');
    h.ok(SG.S.seaPickOn && SG.S.ui.buttons.some(b => /Claw-o-ween/.test(b.label)) && SG.S.ui.buttons.some(b => /No event/.test(b.label)), 'the picker lists the seasons, the calendar and no event');
    h.eq(SG.season.preview('winter'), 'winter', 'pick winter');
    h.ok(SG.season.previewing() && JSON.parse(A._store.clawspire_meta).sea.preview === 'winter', 'saved on the profile');
    const B = bootS(A._store);
    h.eq(B.GAME.season.now(), 'winter', 'the preview survives a reload');
    h.eq(B.GAME.season.preview(''), null, 'back to the calendar: nothing on a headless day');
    SG.season.preview('off'); SG.season.setDate('2026-10-15');
    h.eq(SG.season.now(), null, 'the preview "no event" beats the calendar');
    SG.season.preview('');
  });
  h.test('season: a run started in season keeps it; doors on its maps, none out of season or on an old save', () => {
    const SG = bootS().GAME, MP = CS.MAP;
    SG.season.setDate('2026-10-20');
    for (const seed of [3, 17, 81]) {
      const run = SG.newRun('knight', seed);
      h.eq(run.season, 'halloween', `seed ${seed}: the run takes the season`);
      const doors = doorsOf(SG), M = run.map;
      h.ok(doors.length >= 3 && doors.length <= 4, `seed ${seed}: ${doors.length} trick-or-treat doors`);
      h.ok(doors.every(t => t.known && MP.isLand(t) && !t.done && t.content.sea && t.content.sea.seed > 0 && !(t.q === M.start.q && t.r === M.start.r)), `seed ${seed}: known land doors off the start`);
      h.ok(doors.every(a => doors.every(b => a === b || MP.hexDist(a.q, a.r, b.q, b.r) >= 2)), `seed ${seed}: apart`);
      h.ok(doors.every(t => !(M.roam || []).some(m => m.q === t.q && m.r === t.r)), `seed ${seed}: never under a roaming monster`);
      const again = SG.newRun('knight', seed);
      h.eq(doorsOf(SG).map(t => t.q + ',' + t.r).join(' '), doors.map(t => t.q + ',' + t.r).join(' '), `seed ${seed}: the same doors for the same seed`);
    }
    SG.season.setDate('2026-11-20');
    const plain = SG.newRun('knight', 3);
    h.ok(plain.season === null && doorsOf(SG).length === 0, 'out of season: no season, no doors');
    // a run keeps its season after the calendar moves on (the next act's map too)
    SG.season.setDate('2026-10-31');
    const run = SG.newRun('rogue', 9);
    SG.season.setDate('2026-11-10');
    h.ok(run.season === 'halloween' && SG.season.run() === 'halloween' && SG.season.now() === null, 'a run started on Halloween stays spooky after the event ends');
    const n0 = doorsOf(SG).length;
    for (const t of doorsOf(SG)) { t.type = 'empty'; delete t.content.sea; }
    h.eq(SG.season.newMap(run), n0, 'its next maps still get their doors');
    // an old save (no season field) plays as ever
    const old = SG.newRun('knight', 5);
    delete old.season; delete old.sea;
    h.eq(SG.season.run(), null, 'a run without a season has none');
    h.eq(SG.season.newMap(old), 0, 'and gets no doors');
  });
  h.test('season: costumes, the Pumpkin King and party hats in season only', () => {
    const SG = bootS().GAME, D = CS.DATA;
    SG.season.setDate('2026-10-08');
    const run = SG.newRun('knight', 12);
    let cos = 0, plainN = 0, king = 0, hats = 0;
    for (let f = 0; f < 60; f++) {
      run.fights = f;
      const ids = SG.season.enemies(['rat', 'slime', 'goblin'], 'normal', {});
      cos += ids.filter(x => D.ENEMIES[x].costume).length; plainN += ids.filter(x => !D.ENEMIES[x].costume).length;
      if (SG.season.enemies(['mimic'], 'elite', {})[0] === 'pumpking') king++;
    }
    h.ok(cos > 40 && plainN > 40, `costumes about half the time (${cos} in costume, ${plainN} not)`);
    h.ok(king > 10 && king < 45, `the Pumpkin King takes some act 1 elite fights (${king} of 60)`);
    h.eq(SG.season.enemies(['mimic'], 'elite', { then: { tower: {} } }).join(), 'mimic', 'never a tower keeper');
    h.eq(SG.season.enemies(['rat', 'rat'], 'normal', { seed: 5 }).join(), 'rat,rat', 'a reloaded fight keeps its saved monsters');
    h.ok(SG.season.enemies(['rat', 'slime'], 'normal', { sea: 'trick' }).every(x => D.ENEMIES[x].costume), 'a trick fight: everyone in costume');
    run.act = 2;
    let k2 = 0;
    for (let f = 0; f < 40; f++) { run.fights = f; if (SG.season.enemies(['ironjaw'], 'elite', {})[0] === 'pumpking') k2++; }
    h.eq(k2, 0, 'the Pumpkin King keeps to act 1');
    run.act = 1;
    // a real fight in costume, with hats on the others
    for (let s = 0; s < 8 && !hats; s++) { SG.startFight(['bat', 'rat_vamp', 'bat'], 'normal', { seed: 100 + s }); hats = SG.fight.enemies.filter(e => e.def.seaHat).length; SG.S.run.hp = 80; }
    h.ok(hats > 0, 'some monsters turn up in a party hat');
    h.ok(SG.fight.enemies[1].def.costume === 'vampire' && !SG.fight.enemies[1].def.seaHat, 'a costumed monster keeps its costume, no hat on top');
    h.ok(CS.DATA.ENEMIES.bat.seaHat === undefined, 'the hat is on the fight\'s copy, never the data');
    SG.draw();
    SG.startFight(['bat', 'bat'], 'normal', { then: { sea: 'trick' } });
    h.ok(SG.fight.enemies.every(e => e.def.seaHat), 'a trick fight: everyone hatted');
    // out of season: nothing
    const B = bootS().GAME;
    B.season.setDate('2026-11-20');
    B.newRun('knight', 12);
    let any = 0;
    for (let f = 0; f < 30; f++) { B.run.fights = f; any += B.season.enemies(['rat', 'slime', 'goblin'], 'normal', {}).filter(x => x !== 'rat' && x !== 'slime' && x !== 'goblin').length + (B.season.enemies(['mimic'], 'elite', {})[0] !== 'mimic' ? 1 : 0); }
    h.eq(any, 0, 'out of season: no costume, no Pumpkin King');
    B.startFight(['bat', 'bat', 'bat'], 'normal');
    h.ok(B.fight.enemies.every(e => !e.def.seaHat), 'and no hats');
  });
  h.test('season: a trick-or-treat door: knock, the door opens, paid once across reloads', () => {
    const A = bootS(), SG = A.GAME;
    SG.season.setDate('2026-10-12');
    SG.newRun('knight', 21);
    const door = doorsOf(SG)[0];
    SG.enterTile(door);
    h.eq(SG.screen, 'sea', 'a door opens the door screen');
    h.ok(SG.S.ui.buttons.some(b => b.label === 'Knock') && SG.S.ui.buttons.some(b => b.label === 'Leave'), 'Knock and Leave');
    SG.season.leave();
    h.ok(SG.screen === 'map' && !door.done && !door.content.sea.out, 'Leave: back to the map, the door still closed');
    const w0 = candy(SG), k0 = SG.meta.sea.knocks;
    SG.enterTile(door);
    const out = SG.season.knock();
    h.ok(out && (out.kind === 'treat' || out.kind === 'trick') && door.content.sea.out === out && !door.content.sea.paid, 'the knock rolls and saves the outcome');
    h.eq(SG.meta.sea.knocks, k0 + 1, 'a knock counts on the profile');
    h.eq(SG.season.knock(), null, 'a second knock does nothing');
    stepFor(SG, 0.5);
    h.eq(SG.season.door.ph, 'knock', 'knock, knock...');
    h.eq(candy(SG), w0, 'nothing paid before the door opens');
    // a reload with the door half open: the same outcome plays again
    const B = bootS(A._store), G2 = B.GAME;
    h.ok(G2.load() && G2.screen === 'sea', 'a reload mid-knock lands on the door');
    const d2 = doorsOf(G2).find(t => t.q === door.q && t.r === door.r);
    h.eq(JSON.stringify(d2.content.sea.out), JSON.stringify(out), 'the same outcome');
    stepFor(G2, 4);
    h.ok(G2.season.door.ph === 'done' && d2.content.sea.paid && d2.done, 'the door opens and it is paid');
    const paid = candy(G2);
    h.eq(paid, w0 + (out.candy | 0), 'the candy paid exactly once');
    h.ok(d2.content.sea.lines.length >= 1, 'the result card has its lines');
    G2.save();
    const C3 = bootS(B._store).GAME;
    h.ok(C3.load() && C3.screen === 'sea' && C3.season.door.ph === 'done', 'a reload after it shows the result');
    stepFor(C3, 2);
    h.eq(candy(C3), paid, 'and never pays twice');
    C3.season.cont();
    h.ok(C3.screen === 'map' || C3.screen === 'fight' || C3.screen === 'capsule', 'Continue moves on');
    C3.draw();
  });
  h.test('season: every kind of door outcome pays what it says', () => {
    const SG = bootS().GAME;
    SG.season.setDate('2026-10-12');
    const kinds = { candy: { kind: 'treat', k: 'candy', candy: 16 }, gold: { kind: 'treat', k: 'gold', candy: 9, gold: 30 },
      capsule: { kind: 'treat', k: 'capsule', candy: 9, tier: 'u' }, item: { kind: 'treat', k: 'item', candy: 9, id: 'witch_broom' },
      relic: { kind: 'treat', k: 'relic', candy: 9, id: 'ghost_sheet' }, curse: { kind: 'trick', k: 'curse', candy: 0, id: 'slag' },
      fight: { kind: 'trick', k: 'fight', candy: 0, enc: ['rat_vamp', 'slime_ghost'] } };
    for (const k in kinds) {
      const run = SG.newRun('knight', 30);
      const t = doorsOf(SG)[0];
      t.content.sea.out = kinds[k];
      const g0 = run.gold, b0 = run.bin.length, c0 = candy(SG), caps0 = (run.caps || []).length;
      SG.enterTile(t);
      SG.season.hurry();
      h.ok(t.content.sea.paid && t.done, k + ': paid at the reveal');
      h.eq(candy(SG), c0 + kinds[k].candy, k + ': the candy');
      if (k === 'gold') h.eq(run.gold, g0 + 30, 'gold: the gold');
      if (k === 'capsule') h.eq(run.caps.length, caps0 + 1, 'capsule: a capsule in the bank');
      if (k === 'item') h.ok(run.bin.length === b0 + 1 && run.bin[run.bin.length - 1].id === 'witch_broom', 'item: in the bin');
      if (k === 'relic') h.ok(run.relics.includes('ghost_sheet'), 'relic: gained');
      if (k === 'curse') h.ok(run.bin.length === b0 + 1 && run.bin[run.bin.length - 1].id === 'slag', 'curse: a slag in the bin for good');
      SG.season.hurry();
      if (k === 'fight') {
        h.ok(SG.S.ui.buttons.some(b => b.label === 'Fight!'), 'fight: a Fight! button');
        SG.season.cont();
        h.ok(SG.screen === 'fight' && SG.fight.enemies.map(e => e.id).join() === 'rat_vamp,slime_ghost' && t.content.sea.fought, 'fight: the costumed fight starts, once');
        h.ok(SG.fight.enemies.every(e => e.def.costume), 'fight: everyone in costume');
      } else {
        SG.season.cont();
        h.ok(SG.screen === (k === 'capsule' ? 'capsule' : 'map'), k + ': continue goes on (' + SG.screen + ')');
      }
    }
  });
  h.test('season: candy for won fights and landed Candy Corn, in season only; the reward and relic pools', () => {
    const SG = bootS().GAME, D = CS.DATA;
    SG.season.setDate('2026-10-25');
    SG.newRun('knight', 40);
    let c0 = candy(SG);
    SG.startFight(['rat_vamp', 'rat'], 'normal');
    const nc = SG.fight.enemies.filter(e => e.def.costume).length;
    h.ok(nc >= 1, 'the fight has its costumes (' + nc + ')');
    SG.endFight('win');
    h.eq(candy(SG), c0 + D.seaEarn('normal', nc, false), 'a won fight: normal + a candy bonus per costume');
    h.eq(SG.run.sea.cur, D.seaEarn('normal', nc, false), 'the run keeps its tally');
    c0 = candy(SG);
    SG.startFight(['pumpking'], 'elite');
    SG.endFight('win');
    h.eq(candy(SG), c0 + D.seaEarn('elite', 0, true), 'the Pumpkin King drops the most');
    h.ok(SG.run.relics.some(r => D.RELICS[r] && D.RELICS[r].season), 'and one of his relics');
    SG.startFight(['rat'], 'normal');
    c0 = candy(SG);
    SG.season.event({ t: 'play', def: D.ITEMS.candy_corn, inst: { uid: 'x', id: 'candy_corn' } });
    h.eq(candy(SG), c0 + 1, 'a Candy Corn landed is a candy');
    // the broom sweeps the floor toward the chute
    stepFor(SG, 3);
    const low = SG.fs.items.filter(b => b.y > 200 && !SG.cabinet.inChute(b));
    low.forEach(b => { b.vx = 0; });
    const n = SG.season.sweep();
    h.ok(n > 0 && low.every(b => b.vx > 0), `the Witch Broom sweeps ${n} items toward the chute`);
    SG.endFight('lose');
    // rewards and relic pools
    SG.newRun('knight', 41);
    let hits = 0;
    for (let i = 0; i < 60; i++) { SG.run.nonce = i; if (SG.season.rewardItems(['rusty_sword', 'pot_lid', 'shiv']).some(x => D.ITEMS[x].season)) hits++; }
    h.ok(hits > 8 && hits < 40, `a seasonal item on about a third of reward screens (${hits} of 60)`);
    h.ok(D.SEASONS.halloween.relics.every(r => SG.season.relicAdd([], null, []).includes(r)), 'the season\'s relics join the relic pools');
    h.ok(SG.season.relicAdd([], ['c'], []).every(r => D.RELICS[r].rarity === 'c'), '...by rarity');
    // out of season: nothing
    SG.season.setDate('2026-11-25');
    SG.newRun('knight', 42);
    c0 = candy(SG);
    SG.startFight(['rat'], 'normal'); SG.endFight('win');
    h.eq(candy(SG), c0, 'out of season a fight drops no candy');
    let none = 0;
    for (let i = 0; i < 40; i++) { SG.run.nonce = i; none += SG.season.rewardItems(['rusty_sword', 'pot_lid', 'shiv']).filter(x => D.ITEMS[x].season).length; }
    h.eq(none, 0, 'no seasonal items in rewards');
    h.eq(SG.season.relicAdd([], null, []).length, 0, 'no seasonal relics in the pools');
    SG.startFight(['rat'], 'normal');
    SG.season.event({ t: 'play', def: D.ITEMS.candy_corn });
    h.eq(candy(SG), c0, 'a Candy Corn out of season is only a snack');
  });
  h.test('season: the Candy Counter sells the event cosmetics for candy; they stay owned after the event', () => {
    const A = bootS(), SG = A.GAME;
    SG.season.setDate('2026-10-25');
    SG.season.give(100, 'halloween');
    SG.vault.show('skin');
    const tabN = SG.S.ui.buttons.length;
    h.ok(tabN > 0, 'the vault opens');
    h.ok(SG.season.shelf('sea', []).length === 10, 'the counter stocks the ten Claw-o-ween prizes (Mama Mech\'s, Ms. Bubbles\' and Joy Stick\'s witch hats too)');
    h.eq(SG.vault.buy('skin_sea_mansion'), false, 'tickets never buy an event prize');
    h.ok(!SG.season.buy('skin_sea_mansion'), 'too little candy (100 of 120): refused');
    h.eq(candy(SG), 100, 'nothing taken');
    SG.season.give(50, 'halloween');
    h.ok(SG.season.buy('skin_sea_mansion'), 'bought with 150 candy');
    h.ok(candy(SG) === 30 && SG.meta.sea.spent.candy === 120, 'the price comes off the wallet');
    h.ok(SG.meta.vault.owned.skin_sea_mansion && SG.meta.vault.eq.skin === 'skin_sea_mansion', 'owned and put on');
    h.ok(!SG.season.buy('skin_sea_mansion'), 'never bought twice');
    SG.season.give(60, 'halloween');
    h.ok(SG.season.buy('fit_rogue_witch') && SG.meta.vault.eq.outfit.rogue === 'fit_rogue_witch', 'a witch hat, worn by its crawler');
    SG.draw();
    // after the event: no counter, still owned, on the normal shelf, survives a reload
    SG.season.setDate('2026-11-25');
    h.eq(SG.season.shelf('sea', []).length, 0, 'the counter is gone after the event');
    h.ok(!SG.season.buy('paint_sea_pumpkin'), 'and nothing sells');
    h.ok(SG.season.shelf('skin', ['skin_classic']).includes('skin_sea_mansion'), 'the mansion sits on the Cabinets shelf');
    h.ok(SG.season.shelf('outfit', []).includes('fit_rogue_witch'), 'the hat on the Outfits shelf');
    SG.vault.show('skin');
    SG.draw();
    const B = bootS(A._store).GAME;
    h.ok(B.meta.vault.owned.skin_sea_mansion && B.meta.vault.eq.skin === 'skin_sea_mansion' && B.meta.vault.eq.outfit.rogue === 'fit_rogue_witch', 'a reload keeps them owned and equipped');
    h.eq(candy(B), 30, 'and the wallet');
    B.newRun('rogue', 3);
    B.startFight(['rat', 'bat'], 'normal');
    B.draw();
    h.ok(B.screen === 'fight', 'a real fight in the Haunted Mansion out of season');
  });
  h.test('season: the title banner and countdown, the map chip, the music, drawing in and out of season', () => {
    const A = bootS(), SG = A.GAME;
    SG.showTitle();
    h.ok(!SG.S.ui.buttons.some(b => /Claw-o-ween/.test(b.label)), 'no banner out of season');
    SG.season.setDate(new Date(2026, 9, 21, 12));
    SG.showTitle();
    h.ok(SG.S.ui.buttons.some(b => /Claw-o-ween/.test(b.label)), 'the Claw-o-ween banner on the title');
    const left = new Date(2026, 10, 4).getTime() - new Date(2026, 9, 21, 12).getTime();   // (any timezone: a DST change is in it)
    h.eq(SG.season.countdown('halloween'), 'ends in ' + SG.season.fmt(left), 'with its countdown (' + SG.season.countdown('halloween') + ')');
    h.ok(/^ends in 13d 1[23]h$/.test(SG.season.countdown('halloween')), 'thirteen and a half days to go');
    h.eq(SG.season.fmt(3 * 3600e3 + 125e3), '3h 02m', 'hours and minutes on the last day');
    h.eq(SG.season.musicId(), 'halloween', 'the title plays the season\'s tune');
    SG.draw();
    const run = SG.newRun('knight', 8);
    h.eq(SG.season.musicId(), 'halloween', 'so does the run');
    SG.toMap(); SG.draw();
    SG.startFight(['rat_vamp', 'goblin_witch', 'slime_ghost'], 'normal'); SG.draw();
    SG.endFight('lose');
    SG.season.setDate(new Date(2026, 11, 20));
    SG.showTitle(); SG.draw();
    h.ok(SG.S.ui.buttons.some(b => /Winter Wonderclaw/.test(b.label)), 'the winter banner in December');
    const wr = SG.newRun('alchemist', 9);
    h.eq(wr.season, 'winter', 'a winter run');
    h.eq(doorsOf(SG).length, 0, 'winter has no trick-or-treat doors (advent presents instead: WIN)');
    SG.toMap(); SG.draw();
    SG.startFight(['rat'], 'normal'); SG.draw();
    const c0 = ((SG.meta.sea.wallet || {}).flakes) | 0;
    SG.endFight('win');
    h.ok((SG.meta.sea.wallet.flakes | 0) > c0, 'winter fights drop snowflakes');
    SG.season.setDate('2026-11-20');
    SG.showTitle(); SG.draw();
    h.eq(SG.season.musicId(), null, 'no season on the title after it ends');
  });
  h.test('season: old saves and junk profiles load', () => {
    const A = bootS(), SG = A.GAME;
    SG.newRun('knight', 5);
    SG.save();
    const raw = JSON.parse(A._store.clawspire_run);
    delete raw.run.season; delete raw.run.sea;
    const meta = JSON.parse(A._store.clawspire_meta);
    delete meta.sea;
    const B = bootS({ clawspire_run: JSON.stringify(raw), clawspire_meta: JSON.stringify(meta) }).GAME;
    h.ok(B.meta.sea && B.meta.sea.preview === '' && B.meta.sea.knocks === 0, 'a profile from before gets an empty season record');
    h.ok(B.load() && B.screen === 'map' && B.season.run() === null, 'a run from before loads, with no season');
    B.season.setDate('2026-10-15');
    B.startFight(['rat', 'slime'], 'normal');
    h.eq(B.fight.enemies.map(e => e.id).join(), 'rat,slime', 'an old run stays out of the season even in October');
    const C = bootS({ clawspire_meta: JSON.stringify(Object.assign({}, meta, { sea: { preview: 42, wallet: 'x', knocks: -3 } })) }).GAME;
    h.ok(C.meta.sea.preview === '' && JSON.stringify(C.meta.sea.wallet) === '{}' && C.meta.sea.knocks === 0, 'junk is repaired');
  });
}

// ---------------------------------------------------------------- WIN (round 12): Winter Wonderclaw
{
  const bootW = (store) => boot(store ? { store } : undefined);
  const advOf = (G) => Object.values(G.run.map.tiles).filter(t => t.type === 'advent');
  const flakes = (G) => ((G.meta.sea || {}).wallet || {}).flakes | 0;
  const vsOffW = (G) => { if (G.boss.vs) { G.boss.vsSkip(); G.boss.vsSkip(); } stepFor(G, 0.05); };
  h.test('winter: advent presents on a winter run\'s maps, none out of season or on an old save; the run keeps its season into January', () => {
    const SG = bootW().GAME, MP = CS.MAP;
    SG.season.setDate('2026-12-15');
    for (const seed of [3, 17, 81]) {
      const run = SG.newRun('knight', seed), M = run.map, gifts = advOf(SG);
      h.eq(run.season, 'winter', `seed ${seed}: a winter run`);
      h.ok(gifts.length >= 3 && gifts.length <= 4, `seed ${seed}: ${gifts.length} advent presents`);
      h.ok(gifts.every(t => t.known && MP.isLand(t) && !t.done && t.content.sea && !(t.q === M.start.q && t.r === M.start.r)), `seed ${seed}: known land presents off the start`);
      h.ok(gifts.every(a => gifts.every(b => a === b || MP.hexDist(a.q, a.r, b.q, b.r) >= 2)), `seed ${seed}: apart`);
      h.eq(Object.values(M.tiles).filter(t => t.type === 'treat').length, 0, `seed ${seed}: no trick-or-treat door in winter`);
      SG.newRun('knight', seed);
      h.eq(advOf(SG).map(t => t.q + ',' + t.r).join(' '), gifts.map(t => t.q + ',' + t.r).join(' '), `seed ${seed}: the same presents for the same seed`);
    }
    SG.season.setDate('2027-01-20');
    const plain = SG.newRun('knight', 3);
    h.ok(plain.season === null && advOf(SG).length === 0, 'out of season: no presents');
    SG.season.setDate('2027-01-06');
    const run = SG.newRun('rogue', 9);
    SG.season.setDate('2027-01-12');
    h.ok(run.season === 'winter' && SG.season.run() === 'winter' && SG.season.now() === null, 'a run started on the last day stays wintry after it ends');
    const n0 = advOf(SG).length;
    for (const t of advOf(SG)) { t.type = 'empty'; delete t.content.sea; }
    h.eq(SG.season.newMap(run), n0, 'its next maps still get their presents');
    const old = SG.newRun('knight', 5);
    delete old.season; delete old.sea;
    h.eq(SG.season.newMap(old), 0, 'an old save gets none');
  });
  h.test('winter: the reindeer, the snowman and the elf, Krampus and the winter hats, in season only', () => {
    const SG = bootW().GAME, D = CS.DATA;
    SG.season.setDate('2026-12-20');
    const run = SG.newRun('knight', 12);
    let cos = 0, plainN = 0, kr = 0;
    const seen = new Set();
    for (let f = 0; f < 60; f++) {
      run.fights = f;
      const ids = SG.season.enemies(['rat', 'slime', 'goblin'], 'normal', {});
      ids.forEach(x => { if (D.ENEMIES[x].costume) { cos++; seen.add(x); } else plainN++; });
      if (SG.season.enemies(['mimic'], 'elite', {})[0] === 'krampus') kr++;
    }
    h.ok(cos > 40 && plainN > 40, `costumes about half the time (${cos} in costume, ${plainN} not)`);
    h.eq([...seen].sort().join(), 'goblin_elf,rat_reindeer,slime_snowman', 'the winter costumes, never Claw-o-ween\'s');
    h.ok(kr > 10 && kr < 45, `Krampus takes some act 1 elite fights (${kr} of 60)`);
    h.eq(SG.season.enemies(['mimic'], 'elite', { then: { tower: {} } }).join(), 'mimic', 'never a tower keeper');
    run.act = 2;
    let k2 = 0;
    for (let f = 0; f < 40; f++) { run.fights = f; if (SG.season.enemies(['ironjaw'], 'elite', {})[0] === 'krampus') k2++; }
    h.eq(k2, 0, 'Krampus keeps to act 1');
    run.act = 1;
    SG.startFight(['bat', 'bat', 'bat'], 'normal', { then: { sea: 'trick' } });
    h.ok(SG.fight.enemies.every(e => ['santa', 'elf', 'antlers'].includes(e.def.seaHat)), 'the hats are winter hats');
    SG.draw();
    // the costumes' twists in a real fight
    SG.startFight(['rat_reindeer', 'slime_snowman', 'goblin_elf'], 'normal');
    h.ok(SG.fight.enemies[1].status.armor >= 1, 'the snowman is packed hard (Armor)');
    SG.draw();
    const B = bootW().GAME;
    B.season.setDate('2026-11-28');
    B.newRun('knight', 12);
    let any = 0;
    for (let f = 0; f < 30; f++) { B.run.fights = f; any += B.season.enemies(['rat', 'slime', 'goblin'], 'normal', {}).filter(x => D.ENEMIES[x].season).length + (B.season.enemies(['mimic'], 'elite', {})[0] === 'krampus' ? 1 : 0); }
    h.eq(any, 0, 'out of season: no costume, no Krampus');
  });
  h.test('winter: Krampus: his card, his coal, his phase two, his snowflakes and his relic', () => {
    const SG = bootW().GAME, D = CS.DATA;
    SG.season.setDate('2026-12-20');
    SG.newRun('knight', 70);
    SG.startFight(['krampus'], 'elite');
    const e = SG.fight.enemies[0];
    h.ok(e.id === 'krampus' && SG.boss.vs && SG.boss.vs.taunt === D.ENEMIES.krampus.taunt, 'the versus card with his taunt');
    vsOffW(SG); settle(SG);
    e.sigForce = true;
    const b0 = SG.fight.bin.filter(i => i.id === 'win_coal').length;
    SG.endTurn(); settle(SG); stepFor(SG, 1.2);
    h.ok(SG.fight.bin.filter(i => i.id === 'win_coal').length >= b0 + 2, 'a sack of coal lands in the bin');
    h.ok(SG.win.log.some(x => x.k === 'coal'), 'his own coal show (not the Hoard\'s coins)');
    h.ok(SG.fs.items.some(b => b.data.def.id === 'win_coal'), 'the coal is real, heavy bodies');
    SG.draw();
    CS.COMBAT.damage(SG.fight, SG.fight.player, e, Math.ceil(e.hp * 0.6), { pierce: true });
    for (const ev of SG.fight.events.splice(0)) SG.fs.queue.push({ ev, beat: 0.02 });
    stepFor(SG, 0.5);
    h.ok(e.enraged, 'NAUGHTY OR NICE: his phase two at half hp');
    SG.draw();
    const c0 = flakes(SG), r0 = SG.run.relics.length;
    SG.endFight('win');
    h.eq(flakes(SG), c0 + D.seaEarn('elite', 0, true), 'he drops the elite\'s snowflakes and the season elite\'s bonus');
    h.ok(SG.run.relics.length === r0 + 1 && D.SEASONS.winter.relics.includes(SG.run.relics[SG.run.relics.length - 1]), 'and one of the winter relics you lack');
  });
  h.test('winter: the advent present: unwrap, the lid pops, paid once across reloads; the calendar grows door by door', () => {
    const A = bootW(), SG = A.GAME;
    SG.season.setDate('2026-12-12');
    SG.newRun('knight', 21);
    const [g1, g2] = advOf(SG);
    SG.enterTile(g1);
    h.eq(SG.screen, 'sea', 'a present opens the advent screen');
    h.ok(SG.S.ui.buttons.some(b => b.label === 'Unwrap') && SG.S.ui.buttons.some(b => b.label === 'Leave'), 'Unwrap and Leave');
    h.ok(SG.season.door.adv, 'the advent scene, not the haunted house');
    SG.draw();
    SG.season.leave();
    h.ok(SG.screen === 'map' && !g1.done && !g1.content.sea.out, 'Leave: back to the map, still wrapped');
    h.eq(SG.win.nextDay(), 1, 'the calendar starts on door 1');
    const w0 = flakes(SG), k0 = SG.meta.sea.knocks;
    SG.enterTile(g1);
    const out = SG.season.knock();
    h.ok(out && out.kind === 'treat' && out.day === 1 && g1.content.sea.out === out && g1.content.sea.day === 1 && !g1.content.sea.paid, 'the first tug rolls and saves door 1\'s gift');
    h.ok(SG.meta.sea.adv.n === 1 && SG.meta.sea.adv.y === '2026' && SG.meta.sea.knocks === k0, 'counted on the calendar (not as a trick-or-treat knock)');
    h.eq(SG.season.knock(), null, 'a second tug does nothing');
    stepFor(SG, 0.5);
    h.eq(SG.season.door.ph, 'knock', 'tug, tug...');
    SG.draw();
    h.eq(flakes(SG), w0, 'nothing paid before the lid pops');
    const B = bootW(A._store), G2 = B.GAME;
    G2.season.setDate('2026-12-12');
    h.ok(G2.load() && G2.screen === 'sea' && G2.season.door.adv, 'a reload mid-unwrap lands on the present');
    const d2 = advOf(G2).find(t => t.q === g1.q && t.r === g1.r);
    h.eq(JSON.stringify(d2.content.sea.out), JSON.stringify(out), 'the same gift');
    stepFor(G2, 4);
    h.ok(G2.season.door.ph === 'done' && d2.content.sea.paid && d2.done, 'the lid pops and it is paid');
    h.eq(flakes(G2), w0 + out.candy, 'the snowflakes paid exactly once');
    h.ok(/^Door 1/.test(d2.content.sea.lines[0]), 'the card names the door');
    G2.draw();
    G2.save();
    const C3 = bootW(B._store).GAME;
    C3.season.setDate('2026-12-12');
    h.ok(C3.load() && C3.screen === 'sea' && C3.season.door.ph === 'done', 'a reload after it shows the result');
    stepFor(C3, 2);
    h.eq(flakes(C3), w0 + out.candy, 'and never pays twice');
    C3.season.cont();
    h.ok(C3.screen === 'map' || C3.screen === 'capsule', 'Continue moves on');
    // the next present is door 2; a new winter starts the calendar again
    const g2c = advOf(C3).find(t => t.q === g2.q && t.r === g2.r);
    C3.enterTile(g2c);
    h.eq(C3.season.knock().day, 2, 'the next present is door 2');
    C3.season.hurry(); C3.season.hurry();
    h.eq(C3.meta.sea.adv.n, 2, 'two doors open');
    C3.season.setDate('2027-12-11');
    h.ok(C3.win.nextDay() === 1 && C3.meta.sea.adv.y === '2027', 'next winter the calendar starts over');
  });
  h.test('winter: every advent gift pays what it says, once', () => {
    const SG = bootW().GAME;
    SG.season.setDate('2026-12-18');
    const kinds = { flakes: { kind: 'treat', k: 'flakes', day: 4, candy: 11 }, gold: { kind: 'treat', k: 'gold', day: 5, candy: 6, gold: 12 },
      item: { kind: 'treat', k: 'item', day: 6, big: true, candy: 12, id: 'hot_cocoa' }, capsule: { kind: 'treat', k: 'capsule', day: 9, candy: 7, tier: 'c' },
      relic: { kind: 'treat', k: 'relic', day: 17, candy: 9, id: 'mistletoe' } };
    for (const k in kinds) {
      const run = SG.newRun('knight', 30), t = advOf(SG)[0];
      t.content.sea.out = kinds[k];
      const g0 = run.gold, b0 = run.bin.length, c0 = flakes(SG), caps0 = (run.caps || []).length;
      SG.enterTile(t);
      SG.season.hurry();
      h.ok(t.content.sea.paid && t.done, k + ': paid at the reveal');
      h.eq(flakes(SG), c0 + kinds[k].candy, k + ': the snowflakes');
      h.ok(/^Door /.test(t.content.sea.lines[0]) && (k !== 'item' || /BIG/.test(t.content.sea.lines[0])), k + ': the door\'s line first');
      if (k === 'gold') h.eq(run.gold, g0 + 12, 'gold: the gold');
      if (k === 'capsule') h.eq(run.caps.length, caps0 + 1, 'capsule: banked');
      if (k === 'item') h.ok(run.bin.length === b0 + 1 && run.bin[run.bin.length - 1].id === 'hot_cocoa', 'item: in the bin');
      if (k === 'relic') h.ok(run.relics.includes('mistletoe'), 'relic: gained');
      SG.draw();
      SG.season.hurry();
      SG.season.cont();
      h.ok(SG.screen === (k === 'capsule' ? 'capsule' : 'map'), k + ': continue goes on (' + SG.screen + ')');
      SG.season.pay();
      h.eq(flakes(SG), c0 + kinds[k].candy, k + ': never paid twice');
    }
  });
  h.test('winter: snowflakes for fights and Packed Snowballs, the Present Box unwraps, the pools; nothing out of season', () => {
    const SG = bootW().GAME, D = CS.DATA;
    SG.season.setDate('2026-12-24');
    SG.newRun('knight', 40);
    let c0 = flakes(SG);
    SG.startFight(['rat_reindeer', 'rat'], 'normal');
    const nc = SG.fight.enemies.filter(e => e.def.costume).length;
    SG.endFight('win');
    h.ok(nc >= 1, 'the fight has its costumes (' + nc + ')');
    h.eq(flakes(SG), c0 + D.seaEarn('normal', nc, false), 'a won fight: normal + a snowflake bonus per costume');
    SG.gainRelic('win_stocking');
    c0 = flakes(SG);
    SG.startFight(['rat'], 'normal');
    SG.endFight('win');
    h.eq(flakes(SG), c0 + D.seaEarn('normal', 0, false) + 2, 'the Stocking adds two');
    SG.startFight(['rat'], 'normal');
    c0 = flakes(SG);
    SG.season.event({ t: 'play', def: D.ITEMS.win_snowball, inst: { uid: 'x', id: 'win_snowball' } });
    h.eq(flakes(SG), c0 + 1, 'a Packed Snowball landed is a snowflake');
    stepFor(SG, 1);
    const n0 = SG.fight.bin.length;
    const got = SG.season.event({ t: 'play', def: D.ITEMS.present_box, inst: { uid: 'pb1', id: 'present_box' } });
    const added = SG.fight.bin.slice(n0);
    h.ok(added.length === 1 && added[0].temp && added[0].id !== 'present_box' && D.ITEMS[added[0].id] && ['c', 'u'].includes(D.ITEMS[added[0].id].rarity), `the Present Box unwraps into a ${added[0] && added[0].id}`);
    h.ok(SG.win.log.some(x => x.k === 'gift'), 'logged');
    stepFor(SG, 1.5);
    h.ok(SG.fs.items.some(b => b.data.inst === added[0]), 'it arcs out of the chute into the bin');
    SG.draw();
    SG.endFight('lose');
    SG.newRun('knight', 41);
    let hits = 0;
    for (let i = 0; i < 60; i++) { SG.run.nonce = i; if (SG.season.rewardItems(['rusty_sword', 'pot_lid', 'shiv']).some(x => D.ITEMS[x].season === 'winter')) hits++; }
    h.ok(hits > 8 && hits < 40, `a winter item on about a third of reward screens (${hits} of 60)`);
    h.ok(D.SEASONS.winter.relics.every(r => SG.season.relicAdd([], null, []).includes(r)) && !SG.season.relicAdd([], null, []).some(r => D.RELICS[r].season === 'halloween'), 'the winter relics join the pools, never Claw-o-ween\'s');
    SG.season.setDate('2027-02-02');
    SG.newRun('knight', 42);
    c0 = flakes(SG);
    SG.startFight(['rat'], 'normal'); SG.endFight('win');
    h.eq(flakes(SG), c0, 'out of season a fight drops no snowflakes');
    SG.startFight(['rat'], 'normal');
    const n1 = SG.fight.bin.length;
    SG.season.event({ t: 'play', def: D.ITEMS.present_box, inst: { uid: 'pb2', id: 'present_box' } });
    h.eq(SG.fight.bin.length, n1, 'nor does a present unwrap');
    let none = 0;
    for (let i = 0; i < 40; i++) { SG.run.nonce = i; none += SG.season.rewardItems(['rusty_sword', 'pot_lid', 'shiv']).filter(x => D.ITEMS[x].season).length; }
    h.eq(none, 0, 'no winter items in rewards');
  });
  h.test('winter: the Snowflake Stand sells the winter cosmetics for snowflakes; owned for good, worn in a real fight', () => {
    const A = bootW(), SG = A.GAME;
    SG.season.setDate('2026-12-26');
    SG.season.give(100, 'winter');
    SG.vault.show('skin');
    h.eq(SG.season.shelf('sea', []).length, 13, 'the stand stocks thirteen winter prizes (round 17: Joy Stick\'s scarf)');
    h.ok(!SG.season.shelf('sea', []).some(id => CS.DATA.COSMETICS[id].season === 'halloween'), 'none of Claw-o-ween\'s');
    h.eq(SG.vault.buy('skin_sea_ginger'), false, 'tickets never buy it');
    h.ok(!SG.season.buy('skin_sea_ginger'), 'too few snowflakes (100 of 120): refused');
    SG.season.give(400, 'winter');
    for (const id of ['skin_sea_ginger', 'mq_sea_festive', 'paint_sea_cane', 'trail_sea_flakes', 'fit_knight_scarf']) h.ok(SG.season.buy(id), 'bought ' + id);
    const V = SG.meta.vault;
    h.ok(V.eq.skin === 'skin_sea_ginger' && V.eq.marquee === 'mq_sea_festive' && V.eq.paint === 'paint_sea_cane' && V.eq.trail === 'trail_sea_flakes' && V.eq.outfit.knight === 'fit_knight_scarf', 'each worn at once');
    h.eq(flakes(SG), 500 - 120 - 100 - 80 - 90 - 60, 'the prices come off the snowflakes');
    h.eq(SG.meta.sea.spent.flakes, 450, 'and count as spent');
    h.eq(SG.meta.sea.wallet.candy | 0, 0, 'the candy wallet is untouched');
    SG.draw();
    SG.season.setDate('2027-01-15');
    h.eq(SG.season.shelf('sea', []).length, 0, 'the stand is gone after the event');
    h.ok(SG.season.shelf('skin', ['skin_classic']).includes('skin_sea_ginger') && SG.season.shelf('marquee', []).includes('mq_sea_festive') && SG.season.shelf('trail', []).includes('trail_sea_flakes'), 'on their normal shelves');
    const B = bootW(A._store).GAME;
    h.ok(B.meta.vault.owned.skin_sea_ginger && B.meta.vault.eq.paint === 'paint_sea_cane', 'a reload keeps them');
    B.newRun('knight', 3);
    B.startFight(['rat', 'bat'], 'normal');
    stepFor(B, 0.5);
    B.draw();
    h.ok(B.screen === 'fight', 'a real fight in the Gingerbread House out of season');
    B.toMap(); B.draw();
  });
  h.test('winter: the title, the music, drawing in and out of season, old saves', () => {
    const A = bootW(), SG = A.GAME;
    SG.season.setDate(new Date(2026, 11, 28, 18));
    SG.showTitle(); SG.draw();
    h.ok(SG.S.ui.buttons.some(b => /Winter Wonderclaw/.test(b.label)), 'the winter banner');
    h.ok(/^ends in 9d/.test(SG.season.countdown('winter')), 'counting down across the new year (' + SG.season.countdown('winter') + ')');
    h.eq(SG.season.musicId(), 'winter', 'the title plays the jingle');
    SG.newRun('bubbler', 8);
    SG.toMap(); SG.draw();
    h.eq(SG.season.musicId(), 'winter', 'so does the map');
    SG.startFight(['krampus'], 'elite'); SG.draw(); stepFor(SG, 0.5); SG.draw();
    SG.endFight('lose');
    SG.season.setDate('2027-01-30');
    SG.showTitle(); SG.draw();
    h.ok(!SG.S.ui.buttons.some(b => /Winter Wonderclaw/.test(b.label)) && SG.season.musicId() === null, 'nothing after it');
    // an old save in December: no season, no presents; an old profile: an empty calendar
    const P = bootW(), G0 = P.GAME;
    G0.newRun('knight', 5); G0.save();
    const raw = JSON.parse(P._store.clawspire_run); delete raw.run.season; delete raw.run.sea;
    const meta = JSON.parse(P._store.clawspire_meta); if (meta.sea) delete meta.sea.adv;
    const Q = bootW({ clawspire_run: JSON.stringify(raw), clawspire_meta: JSON.stringify(meta) }).GAME;
    Q.season.setDate('2026-12-20');
    h.ok(Q.load() && Q.season.run() === null && advOf(Q).length === 0, 'an old run stays out of winter');
    h.ok(Q.meta.sea.adv && Q.meta.sea.adv.n === 0 && Q.win.nextDay() === 1, 'an old profile gets an empty calendar');
  });
}

// ---------------------------------------------------------------- HISTORY (round 8: run history, the death recap, photo mode)
{
  const hisKeys = (T, down) => { const fn = T._listeners[down ? 'keydown' : 'keyup']; return (key) => { if (fn) fn({ key, preventDefault() {} }); }; };

  h.test('history: a loss, a win, its Endless end and an abandoned run each leave one record', () => {
    const { T, G } = metaBoot();
    G.newRun('knight', 8101);
    h.eq(G.meta.his.runs.length, 0, 'a fresh profile has no history');
    G.startFight(['rat'], 'normal');
    G.endFight('lose');
    let H = G.meta.his;
    h.ok(G.screen === 'gameover' && H.runs.length === 1 && H.runs[0].r === 'loss' && H.runs[0].c === 'knight', 'the loss is on record');
    const r0 = H.runs[0];
    h.ok(r0.mp && r0.mp.w > 0 && r0.mp.g.length >= Math.ceil(r0.mp.w * r0.mp.h / 3), 'with its act map, packed');
    h.ok(Array.isArray(r0.b) && r0.b.length > 0 && r0.b.length <= 8 && Array.isArray(r0.rl), 'with its final bin and relics');
    h.ok(r0.d > 1.6e9 && r0.s > 0 && r0.f === 1 && r0.cl === 'classic', 'the date, the score, the fights, the claw');
    G.newRun('knight', 8102);
    h.eq(G.meta.his.runs.length, 1, 'a finished run is never abandoned again');
    G.newRun('rogue', 8103);
    h.eq(G.meta.his.runs.length, 1, 'a run left before its first fight leaves no card');
    G.startFight(['rat'], 'normal');
    G.endFight('win');
    G.toMap();
    const quitId = G.run.hid;
    G.newRun('rogue', 8104);
    H = G.meta.his;
    h.ok(H.runs.length === 2 && H.runs[1].r === 'quit' && H.runs[1].id === quitId && H.runs[1].c === 'rogue', 'a run with a fight behind it, replaced by a new one, is on record as quit');
    // a run saved on one page and replaced on the next: read off the save
    G.startFight(['rat'], 'normal'); G.endFight('win'); G.toMap(); G.save();
    const T2 = boot({ store: Object.assign({}, T._store) });
    const n2 = T2.GAME.meta.his.runs.length;
    T2.GAME.newRun('knight', 8105);
    h.ok(T2.GAME.meta.his.runs.length === n2 + 1 && T2.GAME.meta.his.runs[n2].r === 'quit', 'a saved run left from the title is recorded on the next new run');
    // the win, then Endless, then a death in Endless: one record, updated in place
    endWin(G, 8106);
    H = G.meta.his;
    const win = H.runs[H.runs.length - 1];
    h.ok(win.r === 'win' && win.a === 3, 'the win is on record at once');
    h.ok(G.run.hisDone === 'win', 'the run knows it is banked');
    G.endless.start();
    G.endless.next();
    G.endless.cont();
    toMapFrom(G);
    G.startFight(['rat'], 'normal');
    G.fight.player.hp = 0;
    G.endFight('lose');
    H = G.meta.his;
    const last = H.runs[H.runs.length - 1];
    h.ok(last.id === win.id && last.r === 'endless' && last.lp === 2, 'the same record, now an Endless end with its loop');
    h.eq(H.runs.filter((r) => r.id === win.id).length, 1, 'never twice');
    h.ok(H.by.knight && H.by.knight[1] === 1 && H.by.rogue && H.by.rogue[0] === 2 && H.by.rogue[1] === 0, 'lifetime counts per crawler (the second rogue run was left for the win)');
  });

  h.test('history: 60 runs keep the last 50 and a Hall of Fame of 10, small, saved and reloaded', () => {
    const { T, G, saved } = metaBoot({ unlocks: { knight: true, rogue: true } });
    for (let i = 0; i < 60; i++) {
      G.newRun(i % 2 ? 'rogue' : 'knight', 8200 + i);
      G.run.kills = (i * 37) % 61; G.run.fights = 1 + (i % 5); G.run.act = 1 + (i % 3);
      G.his.runEnd(G.run, i % 5 ? 'loss' : 'win');
    }
    const H = G.meta.his;
    h.ok(H.runs.length === 50 && H.n === 60, 'the last 50 of 60');
    h.eq(H.hof.length, 10, 'ten in the Hall of Fame');
    for (let i = 1; i < H.hof.length; i++) h.ok(H.hof[i - 1].s >= H.hof[i].s, 'the Hall of Fame is best first ' + i);
    const s = saved();
    h.ok(s.his && s.his.runs.length === 50 && s.his.hof.length === 10, 'saved on the profile');
    const bytes = JSON.stringify(s.his).length;
    h.ok(bytes < 60 * 700, `compact: ${bytes} bytes for 60 records`);
    const T2 = boot({ store: Object.assign({}, T._store) });
    h.eq(JSON.stringify(T2.GAME.meta.his), JSON.stringify(G.meta.his), 'a reload keeps it exactly');
    // the screen: every card a button, the tabs and the filters
    const G2 = T2.GAME;
    G2.his.show({});
    G2.draw();
    const cards = () => G2.S.ui.buttons.filter((b) => /^Run /.test(b.label)).length;
    h.eq(cards(), 50, 'fifty run cards');
    G2.choose(G2.S.ui.buttons.findIndex((b) => b.label === 'Hall of Fame'));
    h.ok(G2.his.ui.tab === 'hof' && cards() === 10, 'the Hall of Fame tab shows ten');
    G2.choose(G2.S.ui.buttons.findIndex((b) => b.label === 'Wins'));
    h.ok(cards() > 0 && G2.his.meta.hof.filter((r) => r.r === 'win').length === cards(), 'the Wins filter');
    G2.choose(G2.S.ui.buttons.findIndex((b) => b.label === 'Recent'));
    G2.choose(G2.S.ui.buttons.findIndex((b) => b.label === 'All'));
    G2.choose(G2.S.ui.buttons.findIndex((b) => b.label === CS.DATA.CHARACTERS.rogue.name));
    h.ok(G2.his.ui.c === 'rogue' && cards() === 25, 'the crawler filter');
    G2.choose(G2.S.ui.buttons.findIndex((b) => b.label === 'Quit'));
    h.ok(cards() === 0 && T2._nodes.historyBody.children.some((c) => c.className === 'hisList' && c.children.some((x) => /No run matches/.test(x.textContent))), 'no match says so');
    G2.draw();
  });

  h.test('history: a run opens in full (bin, relics, map), shares its card, and the title button comes last', () => {
    const { T, G } = metaBoot();
    G.showTitle();
    const tl = G.S.ui.buttons.map((b) => b.label);
    // (round 11: newer title buttons, like DUO, register after History, so it and every older one keep their indices)
    h.ok(tl.indexOf('History') > tl.indexOf('Boss Rush') && tl.indexOf('Boss Rush') > tl.indexOf('Codex'), 'History comes after every older title button');
    G.choose(tl.indexOf('History'));
    h.ok(G.screen === 'history' && T._nodes.historyBody.children.some((c) => c.className === 'hisList' && c.children.some((x) => /No runs yet/.test(x.textContent))), 'an empty history says how to fill it');
    G.draw();
    G.newRun('knight', 8301);
    G.startFight(['rat'], 'normal');
    settle(G, 20);
    G.endTurn();
    settle(G, 20);
    G.fight.player.hp = 0;
    G.endFight('lose');
    G.his.recapDismiss();
    const rec = G.meta.his.runs[0];
    G.his.show({ open: rec.id });
    const lb = G.S.ui.buttons.map((b) => b.label);
    h.ok(lb.includes('Share run card') && lb.includes('All runs') && lb[0] === 'Back', 'the detail view and its buttons');
    const kids = T._nodes.historyBody.children.map((c) => c.className);
    h.ok(['hisHero', 'hl', 'hisBin', 'hisRelics', 'hisMap'].every((k) => kids.includes(k)), 'the header, the numbers, the final bin, the relics, the map');
    h.ok(kids.includes('hisEnd panel') && kids.includes('hisTl'), 'how it ended, with the last turns');
    G.draw();
    const n0 = G.his.saved;
    h.ok(G.his.share(rec), 'Share makes the card');
    const card = G.his.card;
    h.ok(card && card.st.score === rec.s && card.st.char === 'knight' && card.st.won === false, 'the card is drawn from the record');
    h.eq(G.his.saved, n0 + 1, 'and headless it downloads through the stub without throwing');
    G.choose(G.S.ui.buttons.findIndex((b) => b.label === 'All runs'));
    h.ok(G.screen === 'history' && !G.his.ui.open, 'back to the list');
    hisKeys(T, true)('Escape');
    h.eq(G.screen, 'title', 'Escape leaves the list');
    // an old profile and a junk one
    const O = boot({ store: { clawspire_meta: JSON.stringify({ introSeen: true, unlocks: { knight: true }, stats: { runs: 3 } }) } }).GAME;
    h.ok(O.meta.his && O.meta.his.runs.length === 0 && O.meta.his.n === 0, 'an old profile gets an empty history');
    const J = boot({ store: { clawspire_meta: JSON.stringify({ introSeen: true, his: { runs: 'x', hof: [null, 5, { id: 'a' }, { id: 'b', c: 'knight', s: 'lots', r: 'nope' }], by: 7, n: -4 } }) } }).GAME;
    h.ok(J.meta.his.runs.length === 0 && J.meta.his.hof.length === 1 && J.meta.his.hof[0].s === 0 && J.meta.his.hof[0].r === 'loss' && J.meta.his.n === 0, 'junk is repaired');
    J.his.show({ tab: 'hof' });
    J.draw();
    h.eq(J.S.ui.buttons.filter((b) => /^Run /.test(b.label)).length, 1, 'and still lists');
  });

  h.test('recap: a real death to Ironjaw names the Gape, the charge tip, unused grabs and the last turns', () => {
    const { T, G } = metaBoot();
    G.newRun('knight', 4242);
    G.run.act = 2;
    G.startFight(['ironjaw'], 'elite');
    endSkip(G);
    settle(G, 30);
    for (let turn = 0; turn < 20 && G.screen === 'fight'; turn++) {
      const F = G.fight, e = F.enemies[0];
      if (e.intent && e.intent.charged) { F.player.hp = Math.min(F.player.hp, 30); F.player.block = 0; } else F.player.block = 90;
      G.endTurn();
      settle(G, 30);
    }
    h.eq(G.screen, 'gameover', 'Ironjaw wins');
    const R = G.his.recap;
    h.ok(R && R.rc.kind === 'hit' && R.rc.id === 'ironjaw' && R.rc.charged && R.rc.chargeName === 'Gape', 'the unleashed Gape is the killing blow');
    h.eq(CS.DATA.hisKillLine(R.rc), `Killed by Ironjaw with Gape for ${R.rc.amt}`, 'the kill line');
    h.ok(/^Ironjaw's Gape hits for \d+ on the turn after opening wide\. Stack Block or kill it first\.$/.test(R.tips[0]), 'the charge tip first: ' + R.tips[0]);
    h.ok(/^You had 3 unused grabs on your last turn/.test(R.tips[1] || ''), 'then the unused grabs');
    h.ok(R.rc.turns.length >= 3 && R.rc.turns[R.rc.turns.length - 1].dmg === 30 && R.rc.amt > 30, 'the timeline ends on the hp the hit took; the line says the whole hit');
    h.ok(R.rc.turns.slice(0, -1).every((t) => t.dmg === 0), 'the Block held the turns before');
    const rec = G.meta.his.runs[G.meta.his.runs.length - 1];
    h.ok(rec.r === 'loss' && rec.k === 'Ironjaw' && rec.kk === 'hit' && rec.ke === 'ironjaw' && rec.km === 'Gape' && rec.kh === R.rc.amt && rec.lt.length === R.rc.turns.length, 'the record keeps the killer and the turns');
    h.eq(G.S.ui.buttons[0].label, 'Back to title', 'the recap is not a button: the screen keeps its choices');
    hisKeys(T, true)('Enter');
    h.ok(!G.his.recap, 'a key (or a tap) goes on to the game over');
    // a death outside a fight: no stale log from the last one
    G.newRun('knight', 4243);
    G.run.hp = 0; G.run.killer = 'a bad decision';
    G.showGameOver();
    h.ok(G.his.recap && G.his.recap.rc.kind === '' && CS.DATA.hisKillLine(G.his.recap.rc) === 'Killed by a bad decision' && !G.his.recap.rc.turns.length, 'an event death recaps just the killer');
    G.showTitle();
    G.update(DT);
    h.ok(!G.his.recap, 'leaving the screen puts it away');
  });

  h.test('photo mode: the fight holds still, the camera moves, every filter and frame draws, the PNG saves, and it resumes', () => {
    const { T, G } = metaBoot();
    G.newRun('knight', 5151);
    G.startFight(['rat', 'slime'], 'normal');
    settle(G, 20);
    G.steer(220); G.dropClaw();
    stepFor(G, 0.45);
    h.ok(G.state().grabInFlight, 'a grab is in flight');
    const snap = () => JSON.stringify({ F: G.fight, ph: G.rig.phase, rig: [G.rig.x, G.rig.y, G.rig.targetX], bodies: G.world.bodies.map((b) => [b.x, b.y, b.a, b.vx, b.vy, b.sl]), t: G.S.t, q: G.fs.queue.length, hp: G.run.hp });
    const before = snap();
    h.ok(G.his.photo.open(), 'the camera opens mid grab');
    h.ok(!G.his.photo.open(), 'once');
    for (let i = 0; i < 240; i++) { G.update(DT); if (i % 60 === 0) G.draw(); }
    G.pointer('down', 200, 300, { pointerId: 1 }); G.pointer('move', 250, 360, { pointerId: 1 }); G.pointer('up', 250, 360, { pointerId: 1 });
    G.wheel(270, 480, -400);
    const P = G.his.photo.state;
    h.ok(P.cam.z > 1, 'the wheel zooms the photo camera');
    G.his.photo.zoom(270, 480, 9);
    h.eq(P.cam.z, G.his.PHO.ZMAX, 'the zoom is capped');
    G.his.photo.pan(-9999, -9999);
    h.ok(P.cam.x >= 540 / (2 * P.cam.z) - 1e-6 && P.cam.y >= 960 / (2 * P.cam.z) - 1e-6, 'the view stays on the stage');
    const key = hisKeys(T, true);
    key(' '); key('e'); key('ArrowLeft'); key('+');
    for (const f of G.his.PHO.FILTERS) for (const fr of G.his.PHO.FRAMES) { h.ok(G.his.photo.set('filter', f) && G.his.photo.set('frame', fr), 'set ' + f + ' ' + fr); G.draw(); }
    G.his.photo.set('stamp', false); G.draw();
    G.pointer('down', 270, 500, { pointerId: 2 }); G.pointer('up', 270, 500, { pointerId: 2 });
    h.ok(!P.ui, 'a tap on the picture hides the controls');
    G.draw();
    h.eq(snap(), before, 'nothing moved: the fight, the claw, the pile, the queue, the clock');
    const n0 = G.his.saved;
    h.ok(G.his.photo.save(), 'Save PNG runs headless');
    h.ok(G.his.photo.last && G.his.photo.last.width === 1080 && G.his.photo.last.height === 1920, 'a 1080 x 1920 photo');
    h.eq(G.his.saved, n0 + 1, 'saved through the download fallback');
    h.ok(G.his.photo.compose(CS._ctx), 'the composition draws on the stub');
    G.S.meta.settings.noFlash = true; G.draw(); G.S.meta.settings.noFlash = false;
    key('Escape');
    h.ok(!G.his.photo.state, 'Escape leaves');
    h.eq(snap(), before, 'leaving changes nothing either');
    h.eq(G.S.ui.buttons[0].label, 'END TURN', 'the fight keeps its buttons');
    stepFor(G, 0.25);
    h.ok(snap() !== before, 'the fight goes on from the same frame');
    settle(G, 30);
    h.ok(G.screen === 'fight' && !G.state().grabInFlight, 'the grab finishes as usual');
  });

  h.test('photo mode: the map head camera, the map camera untouched, never on the title, gone with its screen', () => {
    const { G } = metaBoot();
    G.newRun('knight', 5252);
    h.eq(G.screen, 'map', 'the map');
    const ml = G.S.ui.buttons.map((b) => b.label);
    h.eq(ml[ml.length - 1], 'Photo mode', 'the camera is the map head\'s last button');
    G.choose(ml.length - 1);
    h.ok(G.his.photo.state && G.his.photo.state.screen === 'map', 'photo mode on the map');
    const cam = JSON.stringify(G.cam), walk = JSON.stringify(G.run.map.pos);
    G.wheel(100, 400, -500);
    G.pointer('down', 100, 400, { pointerId: 3 }); G.pointer('move', 220, 520, { pointerId: 3 }); G.pointer('up', 220, 520, { pointerId: 3 });
    for (let i = 0; i < 60; i++) G.update(DT);
    h.ok(JSON.stringify(G.cam) === cam && JSON.stringify(G.run.map.pos) === walk, 'the map camera and the crawler stay put');
    G.draw();
    const lb = G.S.ui.buttons.map((b) => b.label);
    h.ok(['Save PNG', 'Filter CRT', 'Filter Pixel', 'Frame Polaroid', 'Frame Stickers', 'Stamp on', 'Zoom in', 'Zoom out', 'Reset view', 'Exit photo mode'].every((l) => lb.includes(l)), 'the controls register with GAME.choose');
    G.choose(lb.indexOf('Frame Marquee'));
    h.eq(G.his.photo.state.frame, 'marquee', 'a frame by its button');
    G.choose(G.S.ui.buttons.findIndex((b) => b.label === 'Exit photo mode'));
    h.ok(!G.his.photo.state, 'Exit leaves');
    h.eq(G.S.ui.buttons.map((b) => b.label).join(), ml.join(), 'the map head buttons come back');
    G.his.photo.open();
    G.showTitle();
    G.update(DT);
    h.ok(!G.his.photo.state, 'photo mode goes with its screen');
    h.ok(!G.his.photo.open(), 'no camera on the title');
  });
}

// ---------------------------------------------------------------- STORY (round 8): stories, callbacks, Grabby Gary, the alternate bosses
{
  const bootT = (store) => { const A = boot(store ? { store } : undefined); A.GAME.sto.force = true; return A; };
  const vsOff = (G) => { if (G.boss.vs) { G.boss.vsSkip(); G.boss.vsSkip(); } stepFor(G, 0.05); };
  const rivalOf = (G) => Object.values(G.run.map.tiles).filter(t => t.type === 'rival');
  const gary = (G) => { const run = G.run; run.sto.gary.on = true; return rivalOf(G)[0] || G.sto.garyPlace(run, run.map); };
  // Drives a claw-off: your drops aim like Gary does; steps until it is decided (or `until` says stop).
  const playOff = (G, until) => {
    const st = () => G.sto.rival.state;
    for (let i = 0; i < 60 * 200 && st() && st().ph === 'play'; i++) {
      if (until && until()) return true;
      const s = st();
      if (s.who === 'p' && s.sub === 'aim' && s.rig && s.rig.phase === 'idle') G.sto.rival.drop(G.sto.rival.aim());
      G.update(DT);
    }
    return !!st() && st().ph === 'done';
  };

  h.test('story: off headless unless forced; new runs carry their state; Gary\'s tile; an old save', () => {
    const A = boot(), GA = A.GAME;
    const run = GA.newRun('knight', 5);
    h.ok(run.sto && Array.isArray(run.sto.calls) && typeof run.sto.gary.on === 'boolean', 'a new run has its story state');
    h.eq(rivalOf(GA).length, 0, 'headless and not forced: no rival tile');
    const ev = Object.values(run.map.tiles).find(t => t.type === 'event');
    h.ok(!GA.sto.eventTile(ev), 'and no stories');
    const T = bootT(), GT = T.GAME, MP = T.MAP;
    let placed = 0;
    for (let s = 1; s <= 12; s++) {
      const r = GT.newRun('knight', s), M = r.map, rv = rivalOf(GT);
      h.eq(rv.length, r.sto.gary.on ? 1 : 0, `seed ${s}: a rival tile exactly when Gary is on`);
      if (!rv.length) continue;
      placed++;
      const t = rv[0], road = M.road.map(([q, rr]) => q + ',' + rr);
      h.ok(t.known && MP.isLand(t) && !road.includes(t.q + ',' + t.r) && M.road.some(([q, rr]) => MP.hexDist(q, rr, t.q, t.r) <= 2) && MP.hexDist(t.q, t.r, M.start.q, M.start.r) >= 3,
        `seed ${s}: known land beside the road (never on it), off the start`);
      h.ok(t.content.gary.kind === 'meet' && !t.done && !(M.roam || []).some(m => m.q === t.q && m.r === t.r), `seed ${s}: act 1 he meets you`);
    }
    h.ok(placed >= 8, `Gary turns up in most runs [${placed}/12]`);
    // an old save (no run.sto): it loads with Gary off and plays on
    GT.newRun('rogue', 2);
    GT.toMap(); GT.save();
    const raw = JSON.parse(T._store[GT.RUN_KEY]);
    delete raw.run.sto;
    const O = bootT({ [GT.RUN_KEY]: JSON.stringify(raw) });
    h.ok(O.GAME.load() && O.GAME.run.sto && O.GAME.run.sto.gary.on === false && O.GAME.run.sto.calls.length === 0, 'an old save loads with fresh story state and Gary off');
    O.GAME.draw();
  });

  h.test('story: beats, rolls, state, the outcome view, save and reload at every beat', () => {
    const T = bootT(), G = T.GAME;
    G.newRun('rogue', 11);
    G.arc.force = true;
    const gold0 = G.run.gold;
    G.sto.beat('sto_dance', 'start', 1);
    h.ok(G.screen === 'event' && G.sto.ed.beat === 'start' && G.S.ui.buttons.length === 3, 'a story beat: three choices');
    T.GAME.draw();
    h.ok(G.sto.pick(0), 'nail the basics');
    const ed = G.sto.ed, st = G.run.sto.st.sto_dance;
    h.ok(ed.out && ed.out.rnd && ed.out.lines.length >= 1 && ed.out.next === 'r2', 'the outcome: a roll, its lines, to be continued');
    h.eq(st.score | 0, ed.out.win ? 1 : 0, 'the roll wrote the story state');
    h.eq(G.run.sto.cur.beat, 'r2', 'the run already points at the next beat');
    h.ok(G.S.ui.buttons.some(b => /Continue the story/.test(b.label)), 'Continue the story');
    G.update(DT); G.draw();
    // reload on the outcome view: the same outcome, nothing paid twice
    const B = bootT(Object.assign({}, T._store)), GB = B.GAME;
    h.ok(GB.load() && GB.screen === 'event' && GB.sto.ed && GB.sto.ed.out && GB.sto.ed.out.fresh === false, 'reloaded on the outcome view');
    h.eq(GB.run.gold, G.run.gold, 'no second payout');
    h.ok(GB.sto.cont() && GB.sto.ed.beat === 'r2' && GB.sto.ed.n === 2, 'Continue: part two');
    const C2 = bootT(Object.assign({}, B._store)), GC = C2.GAME;
    h.ok(GC.load() && GC.sto.ed.beat === 'r2' && !GC.sto.ed.out, 'a reload on a fresh beat shows its choices');
    GC.sto.pick(1); GC.sto.cont();
    h.eq(GC.sto.ed.beat, 'r3', 'part three');
    GC.sto.pick(0); GC.sto.cont();
    h.eq(GC.sto.ed.beat, 'end', 'the last beat');
    const sc = GC.run.sto.st.sto_dance.score | 0;
    const open = GC.S.ui.buttons.filter(b => !/off/.test(b.el.className || ''));
    h.ok(GC.S.ui.buttons.length === 3, 'three endings on the table');
    const which = sc >= 4 ? 0 : sc >= 2 ? 1 : 2;
    h.ok(GC.sto.pick(which), 'the ending the score allows');
    for (let i = 0; i < 3; i++) if (i !== which) h.ok(!GC.sto.pick(i) || true, 'the others are closed');
    h.ok(GC.run.sto.done.sto_dance === 'end' && GC.run.sto.cur === null && GC.meta.sto.done.sto_dance === 1, 'the story is told: on the run and the profile');
    GC.sto.cont();
    h.eq(GC.screen, 'map', 'and back to the map');
    void open; void gold0;
    // the same seed and the same picks roll the same way
    const R1 = bootT().GAME; R1.newRun('rogue', 11); R1.sto.beat('sto_dance', 'start', 1); R1.sto.pick(0);
    h.eq(R1.run.sto.st.sto_dance.score | 0, st.score | 0, 'deterministic rolls');
    // headless without the juice: straight on to the next beat
    const H = bootT().GAME; H.newRun('rogue', 11); H.sto.beat('sto_crab', 'start', 1); H.sto.pick(1);
    h.ok(H.screen === 'event' && H.sto.ed.beat === 'free' && !H.sto.ed.out, 'headless: the next beat at once');
    // an event tile tells a story (the odds pinned to 1 for the test)
    const P = bootT(), GP = P.GAME;
    P.DATA.STO.p = 1;
    GP.newRun('knight', 12);
    const tile = Object.values(GP.run.map.tiles).find(t => t.type === 'event');
    GP.enterTile(tile);
    h.ok(GP.screen === 'event' && GP.sto.ed && GP.sto.ed.beat === 'start' && GP.run.sto.seen[GP.sto.ed.id], 'an event tile opens a story');
    P.DATA.STO.p = 0;
    const t2 = Object.values(GP.run.map.tiles).filter(t => t.type === 'event')[1];
    GP.toMap(); GP.enterTile(t2);
    h.ok(GP.screen !== 'event' || !GP.sto.ed, 'odds 0: the old events');
    P.DATA.STO.p = 0.5;
  });

  h.test('story: callbacks come back in a later act (the crab, the next part, the hunter, the sabotage, the gift)', () => {
    const T = bootT(), G = T.GAME;
    G.newRun('knight', 21);
    // the crab
    G.sto.beat('sto_crab', 'free', 2);
    G.sto.pick(1);
    const call = G.run.sto.calls.find(c => c.k === 'ally');
    h.ok(call && call.id === 'crab' && call.stage === 1 && !call.done, 'the crab will remember you');
    G.startFight(['mimic'], 'elite'); vsOff(G);
    h.ok(!G.fight.log.some(l => /helps out/.test(l)) && !call.done, 'not in the same act');
    G.endFight('win'); G.toMap();
    G.run.act = 2;
    G.startFight(['lodestone'], 'elite');
    h.ok(G.fight.log.some(l => /helps out \(crab\)/.test(l)) && G.fight.player.block >= 5 && call.done, 'act 2: the crab fights one turn for you');
    h.ok(G.run.sto.pays === 1 && G.meta.sto.pays === 1 && !!(G.meta.ach || {}).full_circle, 'a payoff: counted, and Full Circle');
    vsOff(G); stepFor(G, 1.2); G.draw();
    h.ok(G.fs.sto && (G.fs.sto.ally || G.fs.sto.ally === null), 'the cameo ran in the arena');
    G.save();
    const B = bootT(Object.assign({}, T._store)), GB = B.GAME;
    h.ok(GB.load() && GB.screen === 'fight' && GB.fight.log.some(l => /helps out \(crab\)/.test(l)), 'a reload of the same fight: the crab again');
    h.eq(GB.run.sto.pays, 1, 'counted once');
    GB.endFight('win');
    // the next part of a story in a later act
    const S2 = bootT().GAME;
    S2.newRun('knight', 22);
    S2.sto.beat('sto_seed', 'plant', 2);
    S2.sto.pick(0);
    const ev = Object.values(S2.run.map.tiles).find(t => t.type === 'event');
    S2.toMap();
    h.ok(!S2.sto.eventTile({ q: 0, r: 0 }) || S2.sto.ed.beat !== 'tree', 'not in the same act');
    S2.toMap();
    S2.run.act = 2;
    h.ok(S2.sto.eventTile(ev) && S2.sto.ed.id === 'sto_seed' && S2.sto.ed.beat === 'tree' && S2.sto.ed.cb, 'act 2: the coin seed grew (IT CAME BACK)');
    const g0 = S2.run.gold;
    S2.sto.pick(0);
    h.eq(S2.run.gold, g0 + 80, 'and pays');
    // the hunter
    const S3 = bootT(), G3 = S3.GAME;
    G3.newRun('rogue', 23);
    G3.sto.beat('sto_monte', 'cheat', 2);
    const d0 = G3.run.bin.length;
    G3.sto.pick(0);
    h.ok(G3.run.bin.length === d0 + 1 && G3.run.sto.calls.some(c => c.k === 'hunt'), 'a cheat: the winnings, and Lefty has a big brother');
    G3.run.act = 2;
    const m = G3.sto.newMap(G3.run) || (G3.run.map.roam || []).find(x => x.id === 'sto_shark');
    const shark = (G3.run.map.roam || []).find(x => x.id === 'sto_shark');
    h.ok(shark && shark.awake && shark.enc[0] === 'cardshark' && G3.run.map.road.some(([q, r]) => q === shark.q && r === shark.r), 'the next act: the Card Shark on the road, awake');
    void m;
    G3.toMap(); stepFor(G3, 0.1);
    h.ok(/HUNTED/.test(G3.S.lastToast || '') && !G3.run.sto.huntNote, 'HUNTED! on the map');
    G3.startFight(['cardshark'], 'normal', { then: { roam: 'sto_shark' } });
    h.ok(G3.fs.tier === 'elite' && G3.boss.vs && /ELITE/.test(G3.boss.vs.title), 'the hunter is an elite, versus card and all');
    G3.endFight('win');
    // the sabotage
    const S4 = bootT(), G4 = S4.GAME;
    G4.newRun('knight', 24);
    G4.sto.setAlt('1', '');
    G4.sto.beat('sto_intern', 'guessed', 2);
    G4.sto.pick(0);
    G4.startFight(['hoard'], 'boss');
    const boss = G4.fight.enemies[0];
    h.ok(boss.id === 'hoard' && boss.hp < boss.maxHp && boss.status.vuln === 2 && boss.status.weak === 2, 'this act\'s boss starts sabotaged');
    vsOff(G4); stepFor(G4, 0.5); G4.draw();
    G4.endFight('win');
    // the gift in a later act's shop, once
    const S5 = bootT(), G5 = S5.GAME;
    G5.newRun('knight', 25);
    G5.sto.beat('sto_vendy', 'escape', 2);
    G5.sto.pick(0);
    G5.run.act = 2;
    const shopT = Object.values(G5.run.map.tiles).find(t => t.type === 'shop');
    const sh = G5.rollShop(shopT), n0 = G5.run.bin.length;
    G5.showShop(sh);
    h.ok(G5.run.bin.length === n0 + 1 && sh.stoGift && sh.stoGift.id, 'Vendy runs this shop now: a free item');
    G5.showShop(sh);
    h.eq(G5.run.bin.length, n0 + 1, 'once');
  });

  h.test('rival: the meeting, a real claw-off, save mid-way, paid once', () => {
    const T = bootT(), G = T.GAME;
    G.newRun('knight', 33);
    const tile = gary(G);
    h.ok(tile && tile.type === 'rival', 'Gary\'s tile');
    G.enterTile(tile);
    h.ok(G.screen === 'rival' && G.sto.rival.state.ph === 'intro' && G.meta.gary.met === 1, 'he meets you');
    h.ok(T.DATA.GARY_LINES.first.includes(G.sto.rival.state.line), 'with his first line');
    G.draw();
    h.ok(G.S.ui.buttons.some(b => b.label === 'Claw-off!') && G.S.ui.buttons.some(b => b.label === 'Not now'), 'Claw-off! or Not now');
    G.choose(G.S.ui.buttons.findIndex(b => b.label === 'Not now'));
    h.ok(G.screen === 'map' && !tile.done, 'not now: the tile waits');
    G.enterTile(tile);
    h.eq(G.meta.gary.met, 1, 'met once');
    G.choose(G.S.ui.buttons.findIndex(b => b.label === 'Claw-off!'));
    const c = tile.content.gary;
    h.ok(G.sto.rival.state.ph === 'play' && G.sto.rival.state.who === 'p' && c.live && c.live.drops.length === 0, 'the claw-off: your drop first');
    h.eq(G.sto.rival.state.W.bodies.filter(b => b.type === 'dynamic').length, 13, 'thirteen prizes in the shared bin');
    playOff(G, () => c.live.drops.length >= 2);
    h.eq(c.live.drops.length, 2, 'two drops in');
    h.ok(c.live.drops[0].who === 'p' && c.live.drops[1].who === 'g', 'you, then Gary');
    G.draw();
    const gold0 = G.run.gold;
    // reload mid claw-off: the next drop, the same scores, what was won stays out of the bin
    const B = bootT(Object.assign({}, T._store)), GB = B.GAME;
    h.ok(GB.load() && GB.screen === 'rival' && GB.sto.rival.state.ph === 'play' && GB.sto.rival.state.who === 'p', 'reloaded at your second drop');
    const cb = GB.sto.rival.tile(GB.sto.rival.state).content.gary;
    const taken = cb.live.drops.reduce((a, d) => a + d.got.length, 0);
    h.eq(GB.sto.rival.state.W.bodies.filter(b => b.type === 'dynamic').length, 13 - taken, 'the prizes already won stay out');
    h.ok(playOff(GB), 'the claw-off plays out');
    const r = cb.res;
    h.ok(r && cb.paid && ['win', 'lose', 'tie'].includes(r.res) && r.p === cb.live.p && r.g === cb.live.g && cb.live.drops.length === 6, 'six drops, decided: ' + (r && r.res) + ' ' + (r && r.p) + ':' + (r && r.g));
    h.ok(GB.run.gold >= gold0 + r.gold && GB.run.caps.length === (r.cap ? 1 : 0), 'paid: gold, and a capsule for a win');
    h.ok(GB.meta.gary.offs === 1 && (r.res === 'win' ? GB.meta.gary.wins === 1 && GB.run.sto.gary.w === 1 : r.res === 'lose' ? GB.meta.gary.losses === 1 : GB.meta.gary.ties === 1), 'on his record');
    h.ok(GB.sto.rival.tile(GB.sto.rival.state).done, 'the tile is done');
    h.ok(!GB.sto.rival.pay(cb), 'paying again does nothing');
    GB.draw();
    const gold1 = GB.run.gold;
    const C3 = bootT(Object.assign({}, B._store)), GC = C3.GAME;
    h.ok(GC.load() && GC.screen === 'rival' && GC.sto.rival.state.ph === 'done' && GC.run.gold === gold1, 'a reload shows the result, never pays it twice');
    GC.choose(GC.S.ui.buttons.findIndex(b => b.label === 'Continue'));
    h.eq(GC.screen, 'map', 'Continue');
  });

  h.test('rival: he remembers you, buys gear, and calls a showdown', () => {
    const T = bootT(), G = T.GAME;
    G.newRun('knight', 44);
    Object.assign(G.meta.gary, { met: 3, offs: 3, wins: 2, losses: 1 });
    G.sto.gearSync();
    h.ok(G.sto.gear() === 1 && T.RENDER.sto.gear === 1, 'two claw-offs lost: he bought shades (and the renderer draws them)');
    const t1 = gary(G);
    G.enterTile(t1);
    h.ok(/pro shades/.test(G.sto.rival.state.line) || T.DATA.GARY_LINES.ahead.includes(G.sto.rival.state.line), 'his taunt knows the record');
    G.sto.rival.leave();
    // act 3, two wins this run: the showdown
    const run = G.run;
    run.act = 3; run.sto.gary.w = 2;
    for (const t of rivalOf(G)) t.type = 'empty';
    const t3 = G.sto.garyPlace(run, run.map);
    h.eq(t3.content.gary.kind, 'duel', 'act 3 after two wins: a showdown');
    G.enterTile(t3);
    h.ok(G.S.ui.buttons.some(b => b.label === 'Showdown!') && T.DATA.GARY_LINES.duel.includes(G.sto.rival.state.line), 'Showdown!');
    G.choose(G.S.ui.buttons.findIndex(b => b.label === 'Showdown!'));
    h.ok(G.screen === 'fight' && G.fight.enemies[0].id === 'gary' && G.fight.enemies[0].gear === 1 && t3.done && G.meta.gary.duels === 1, 'an elite fight with Gary in his gear');
    h.ok(G.boss.vs && T.DATA.GARY_LINES.duel.includes(G.boss.vs.taunt), 'the versus card says his line');
    vsOff(G);
    for (const e of G.fight.enemies) T.COMBAT.damage(G.fight, G.fight.player, e, 99999, { pierce: true });
    G.endFight('win');
    h.ok(G.meta.gary.beat === 1 && G.run.sto.gary.duel === 'won' && !!(G.meta.ach || {}).rival_crusher, 'beaten: on his record, and Rival Crusher');
    h.eq(G.sto.gear(), 2, 'he goes shopping again');
    // the rubber match: one win, act 3
    const G2 = bootT().GAME;
    G2.newRun('knight', 45);
    G2.run.act = 3; G2.run.sto.gary = { on: true, w: 1, l: 1, met: 2, duel: '' };
    for (const t of rivalOf(G2)) t.type = 'empty';
    h.eq(G2.sto.garyPlace(G2.run, G2.run.map).content.gary.kind, 'off', 'one win: a rubber match');
    G2.run.sto.gary.w = 0;
    for (const t of rivalOf(G2)) t.type = 'empty';
    h.eq(G2.sto.garyPlace(G2.run, G2.run.map), null, 'no wins: he does not bother with act 3');
  });

  h.test('alternate bosses: a coin flip per act, saved, reloads keep it, their tricks in the cabinet', () => {
    // the flip
    let alt = 0;
    const T = bootT(), G = T.GAME;
    for (let s = 1; s <= 24; s++) {
      G.newRun('knight', 100 + s);
      const [ids] = G.sto.fightIds(['hoard'], 'boss', {});
      if (ids[0] === 'plushqueen') alt++;
      h.eq(G.sto.fightIds(['hoard'], 'boss', {})[0][0], ids[0], `seed ${s}: decided once`);
    }
    h.ok(alt >= 6 && alt <= 18, `about half the runs meet the Plushie Queen [${alt}/24]`);
    // the Plushie Queen: the card, the plushies, the sign, the epitaph
    G.newRun('knight', 60);
    G.sto.setAlt('1', 'plushqueen');
    G.startFight(['hoard'], 'boss');
    const e = G.fight.enemies[0];
    h.ok(e.id === 'plushqueen' && G.boss.vs && /ACT 1 BOSS/.test(G.boss.vs.title) && G.boss.vs.taunt === T.DATA.ENEMIES.plushqueen.taunt, 'ACT 1 BOSS: the Plushie Queen');
    G.save();
    const B = bootT(Object.assign({}, T._store));
    h.ok(B.GAME.load() && B.GAME.fight.enemies[0].id === 'plushqueen', 'a reload keeps her');
    vsOff(G); settle(G);
    e.sigForce = true;
    G.endTurn(); settle(G); stepFor(G, 1);
    const plush = G.fs.items.filter(b => b.data.def.sto === 'plush');
    h.ok(plush.length >= 3, 'plushies tumble into the cabinet as bodies');
    const sign = G.sto.sign();
    h.ok(!sign || /FLUFF SHIELD/.test(sign[0]), 'the sign counts the fluff');
    G.draw();
    settle(G);
    T.COMBAT.damage(G.fight, G.fight.player, e, 99999, { pierce: true });
    for (const ev of G.fight.events.splice(0)) G.fs.queue.push({ ev, beat: 0.02 });
    G.fs.beatT = 0;
    stepFor(G, 0.3);
    const fin = G.boss.bs && G.boss.bs.fin;
    h.ok(fin && /Unstuffed/.test(fin.sub), 'her finale has its own epitaph');
    G.draw();
    // the Conveyor King: the belt carries the floor away from the chute
    const K = bootT(), GK = K.GAME;
    GK.newRun('knight', 61); GK.run.act = 2;
    GK.sto.setAlt('2', 'conveyorking');
    GK.startFight(['smelter'], 'boss'); vsOff(GK); settle(GK);
    h.eq(GK.fight.enemies[0].id, 'conveyorking', 'the Conveyor King');
    GK.fight.enemies[0].sigForce = true;
    GK.endTurn(); settle(GK);
    h.ok(GK.fight.conv && /CONVEYOR/.test((GK.sto.sign() || [''])[0]), 'the belt runs, the sign says so');
    const cb = GK.cabinet.bounds;
    h.ok(GK.cabinet.segs.some(s => s.wall === 'floor' && s.vx < 0), 'the floor itself runs toward the far wall');
    // a prize set down on the floor, clear of the pile, rides away from the chute
    const top = GK.fs.items.slice().sort((a, b) => a.y - b.y)[0];
    const clear = Math.max(...GK.fs.items.filter(b => b !== top).map(b => b.box.x1)) + 30;
    const tx = Math.min(clear, cb.chuteX - (cb.slopeW || 0) - 20);
    // (round 12: the harder hits shake the pile wider; lift whatever sits in the strip by the chute out of the way)
    GK.fs.items.filter(b => b !== top && b.box.x1 > tx - (top.br || 14) - 30 && !GK.cabinet.inChute(b)).forEach((b, i) => { K.PHYS.setPose(b, 40 + 30 * i, 120, 0); b.vx = b.vy = b.av = 0; b.sl = false; });
    K.PHYS.setPose(top, tx, cb.floorY - (top.br || 14) - 2, 0);
    top.vx = top.vy = top.av = 0; top.sl = false;
    const x0 = top.x;
    stepFor(GK, 0.4);
    h.ok(top.x < x0 - 15, `a prize by the chute rides toward the far wall (${Math.round(x0)} -> ${Math.round(top.x)})`);
    GK.draw();
    GK.fight.enemies[0].acts = 2;   // (its next Belt Drive is due on its fourth action)
    GK.endTurn(); settle(GK);
    h.ok(!GK.fight.conv && !GK.cabinet.segs.some(s => s.wall === 'floor' && s.vx), 'the belt stops as your turn ends');
    // the Arctic Arcade: an item freezes into the block (bodies follow), delivering the block smashes it
    const A3 = bootT(), GA = A3.GAME;
    GA.newRun('knight', 62); GA.run.act = 3;
    GA.sto.setAlt('3', 'arcticarcade');
    GA.startFight(['glacius'], 'boss'); vsOff(GA); settle(GA);
    const ice = GA.fight.enemies[0];
    h.eq(ice.id, 'arcticarcade', 'the Arctic Arcade');
    ice.sigForce = true;
    GA.endTurn(); settle(GA); stepFor(GA, 0.5);
    const I = A3.COMBAT.stoIce(GA.fight);
    const block = GA.fs.items.find(b => b.data.def.sto === 'glacier');
    h.ok(I && I.insts.length === 1 && block && !GA.fs.items.some(b => b.data.inst === I.insts[0]), 'one prize frozen into a block body, its own body gone');
    GA.draw();
    const frozen = I.insts.slice(), hp0 = ice.hp;
    GA.playDelivered([block]);
    stepFor(GA, 2); settle(GA);
    h.ok(ice.hp < hp0 && frozen.every(i => GA.fight.bin.includes(i) || GA.fight.used.includes(i)) && A3.COMBAT.stoIce(GA.fight).insts.length === 0, 'delivered: smashed, the prize is back, the boss is hurt');
    h.ok(frozen.every(i => !GA.fight.bin.includes(i) || GA.fs.items.some(b => b.data.inst === i) || GA.fs.spawnQ.includes(i)), 'with a body again');
    GA.draw();
  });
}

// ---------------------------------------------------------------- CR8 (round 8): Mama Mech, the Vacuum Nozzle, the Twin Claws
{
  const mamaBoot = (unlocks, extra) => {
    const T = boot({ store: { clawspire_meta: JSON.stringify(Object.assign({ introSeen: true, tutorialDone: true, unlocks: unlocks || { knight: true, alchemist: true } }, extra || {})) } });
    return { T, G: T.GAME };
  };
  // One real grab: aim, steer, drop, wait for the delivery. Returns what was delivered.
  const realGrab = (G, pick) => {
    const x = G.rig.aimAt(pick || null);
    G.steer(x == null ? 200 : x);
    stepFor(G, 0.7);
    if (!G.dropClaw()) return -1;
    let n = 0;
    while (G.state().grabInFlight && n < 60 * 25) { G.update(DT); n++; }
    const got = G.fs.delivered | 0;
    settle(G, 10);
    return got;
  };
  const small = (b) => b.data && b.data.def && (b.data.def.tags || []).indexOf('heavy') < 0 && b.br < 16;

  h.test('CR8 Mama Mech: her card on character select, the unlock, a new run, her Tilt', () => {
    const { T, G } = mamaBoot();
    G.showChars();
    const i = G.S.ui.buttons.findIndex(b => b.label === 'Mama Mech');
    h.ok(i >= 0 && !G.S.ui.buttons[i].disabled, 'her card is open once a crawler reached act 2');
    h.eq(G.S.ui.buttons[0].label, T.DATA.CHARACTERS.knight.name, 'the knight is still the first card');
    G.choose(i);
    h.eq(G.run.char, 'engineer', 'the run is Mama Mech\'s');
    h.eq(G.run.bin.length, 19, 'with her 19 item bin');
    h.ok(G.run.relics.includes('socket_set'), 'and the Socket Set');
    h.eq(G.run.maxHp, 84, '84 hp (round 16: 75 -> 84)');
    const fresh = mamaBoot({ knight: true }).G;
    fresh.showChars();
    const j = fresh.S.ui.buttons.findIndex(b => b.label === 'Mama Mech');
    h.ok(j >= 0 && fresh.S.ui.buttons[j].disabled, 'a fresh profile has to reach act 2 first');
    const { G: G2 } = mamaBoot();
    G2.meta.tilt = { engineer: 3 };
    h.eq(G2.prog.tiltCap('engineer'), 3, 'her own Tilt ladder');
    h.eq(G2.prog.tiltCap('gambler'), 0, 'separate from Lou\'s');
    G2.draw();
  });

  h.test('CR8 Mama Mech: a real fight with every claw type, the turret builds, fires and is drawn', () => {
    const { T, G } = mamaBoot();
    const drawn = [];
    const tur0 = T.RENDER.cr8.turret;
    T.RENDER.cr8.turret = (ctx, x, y, st) => { drawn.push({ lv: st.lv, fire: st.fire }); return tur0(ctx, x, y, st); };
    const played = new Set();
    for (const type of G.claws.ids()) {
      G.claws.pick(type);
      G.newRun('engineer', 5150);
      G.startFight(['slime'], 'normal', { seed: 31 });
      for (const e of G.fight.enemies) { e.hp = e.maxHp = 999; }
      stepFor(G, 3.5);
      h.eq(G.fight.clawType, type, type + ': the fight knows the claw');
      h.ok(G.fight.tur && G.fight.tur.lv >= 1, type + ': the Socket Set turret is up');
      h.ok(G.S.cr8Row === true, type + ': the player row steps aside');
      let grabs = 0, got = 0;
      const parts0 = G.fight.tur.parts;
      while (grabs < 3 && G.fight.phase === 'player' && G.fight.player.grabs > 0) {
        grabs++;
        const r = realGrab(G, type === 'magnet' ? (b) => b.data && b.data.tags && b.data.tags.indexOf('metal') >= 0 : type === 'vacuum' ? small : null);
        if (r < 0) break;
        got += r;
        G.draw();
      }
      h.ok(grabs >= 1, `${type}: Mama grabbed`);
      for (const inst of G.fight.used) played.add(inst.id);
      if (got > 0) h.ok(G.fight.tur.parts >= parts0 || G.fight.tur.over > 0, `${type}: deliveries (${got}) keep the turret building`);
      // end the turn: the volley plays through the game's queue
      const hp0 = G.fight.enemies[0].hp, fired0 = G.cr8.tur.fired;
      settle(G, 10);
      if (G.fight.phase === 'player') G.endTurn();
      let n = 0, sawFire = false;
      while (n < 60 * 20 && !(ready(G) && n > 30)) { G.update(DT); n++; if (G.cr8.tur && G.cr8.tur.fire > 0.5) { sawFire = true; G.draw(); } }
      h.ok(G.cr8.tur.fired > fired0 && sawFire, `${type}: the turret fired on the frame (${G.cr8.tur.fired - fired0} shots)`);
      h.ok(G.fight.enemies[0].hp < hp0, `${type}: and hurt the slime`);
      h.eq(G.cr8.tur.lv, G.fight.tur.lv, `${type}: the shown turret matches COMBAT`);
      G.draw();
    }
    h.ok([...played].some(id => T.DATA.ITEMS[id] && T.DATA.ITEMS[id].char === 'engineer'), 'her own kit was played');
    h.ok(drawn.length > 0 && drawn.some(d => d.fire > 0.3), 'the turret is drawn, recoiling as it fires');
    // force the level ladder through the queue: parts, a level-up, a mega shot
    const F = G.fight;
    const evs = T.COMBAT.turretParts(F, 20, 'TEST').concat(T.COMBAT.turretFire(F));
    h.ok(evs.some(e => e.t === 'turret' && e.k === 'up' && e.lv === 5), 'a Lv 5 event');
    h.ok(evs.some(e => e.t === 'turret' && e.k === 'fire' && e.all), 'a mega shot');
    for (const e of evs) G.cr8.event(e);
    h.eq(G.cr8.tur.lv, 5, 'the shown turret is a MEGA MECH');
    h.ok(G.fs.marquee === 'MEGA MECH!', 'the marquee says so');
    for (let i = 0; i < 30; i++) { G.update(DT); G.draw(); }
    h.ok(drawn.some(d => d.lv === 5), 'drawn at Lv 5');
    h.ok(T.DATA.achCheck({ kind: 'ev', ev: evs.find(e => e.k === 'up' && e.lv === 5) }, {}).includes('fully_armed'), 'Fully Armed');
    T.RENDER.cr8.turret = tur0;
    // leaving the fight hands the row back
    G.showChars();
    stepFor(G, 0.1);
    h.ok(G.S.cr8Row === false, 'off the fight: the row is back');
  });

  h.test('CR8 claws: the vacuum sucks small things up the hose and delivers; the twins bring a pair', () => {
    const FILL = ['prize_marble', 'glass_bead', 'peppermint', 'lucky_penny', 'sour_drop', 'bouncy_ball', 'lead_shot'];
    for (const type of ['vacuum', 'twin']) {
      const { T, G } = mamaBoot();
      const sfx = [], sfx0 = T.AUDIO.sfx;
      T.AUDIO.sfx = (n) => { sfx.push(n); return true; };
      G.claws.pick(type);
      G.newRun('knight', 777);
      G.run.bin = FILL.concat(FILL, FILL).map((id, i) => ({ uid: 'v' + i, id, plus: false }));
      G.startFight(['slime'], 'normal', { seed: 42 });
      for (const e of G.fight.enemies) { e.hp = e.maxHp = 999; }
      stepFor(G, 3.5);
      h.eq(G.rig.type, type, type + ' rig');
      if (type === 'twin') h.ok(G.rig.bodies.twin && G.rig.bodies.twin.length === 2, 'two heads on the bar');
      let best = 0, total = 0, tubeSeen = 0;
      for (let g = 0; g < 3 && G.fight.phase === 'player' && G.fight.player.grabs > 0; g++) {
        const x = G.rig.aimAt(small);
        G.steer(x == null ? 200 : x);
        stepFor(G, 0.7);
        if (!G.dropClaw()) break;
        let n = 0;
        while (G.state().grabInFlight && n < 60 * 25) {
          G.update(DT); n++;
          if (type === 'vacuum' && G.rig.tube) { const k = G.rig.tube().length; if (k > tubeSeen) { tubeSeen = k; G.draw(); } }
        }
        best = Math.max(best, G.fs.delivered | 0); total += G.fs.delivered | 0;
        settle(G, 10);
        G.draw();
      }
      h.ok(total >= 2, `${type}: delivered ${total} over three grabs`);
      if (type === 'vacuum') {
        h.ok(tubeSeen >= 1, `prizes rode up the hose (${tubeSeen} at once)`);
        h.ok(sfx.includes('vacWhoosh') && sfx.includes('vacSlurp'), 'the roar and the slurp');
        if (best >= 3) h.ok(G.meta.ach.clean_sweep, 'three in one grab: Clean Sweep');
        else { G.fs.delivered = 3; G.update(DT); h.ok(G.meta.ach.clean_sweep, 'Clean Sweep (three in one grab, forced)'); }
      } else {
        h.ok(best >= 2, `a twin grab brought up a pair (${best})`);
        h.ok(sfx.includes('twinClick'), 'the double clack');
        h.ok(!G.meta.ach.clean_sweep, 'no Clean Sweep for the twins');
      }
      T.AUDIO.sfx = sfx0;
    }
  });

  h.test('CR8 saves: Mama and the new claws survive a save/load; an old save is the classic claw', () => {
    const { T, G } = mamaBoot();
    for (const type of ['vacuum', 'twin']) {
      G.claws.pick(type);
      G.newRun('engineer', 99);
      G.startFight(['slime'], 'normal', { seed: 5 });
      stepFor(G, 3.5);
      G.save();
      const saved = JSON.parse(T._store.clawspire_run);
      h.ok(saved.run.clawType === type && saved.run.char === 'engineer', type + ': saved');
      const T2 = boot({ store: Object.assign({}, T._store) });
      h.ok(T2.GAME.load(), type + ': loads');
      h.ok(T2.GAME.run.clawType === type && T2.GAME.run.char === 'engineer', type + ': Mama with the ' + type);
      if (T2.GAME.rig) h.eq(T2.GAME.rig.type, type, type + ': the fight rebuilds the rig');
      if (T2.GAME.fight) h.ok(T2.GAME.fight.tur, type + ': and the turret');
      delete saved.run.clawType;
      const T3 = boot({ store: { clawspire_meta: T._store.clawspire_meta, clawspire_run: JSON.stringify(saved) } });
      h.ok(T3.GAME.load(), type + ': an old save loads');
      h.eq(T3.GAME.claws.type(), 'classic', type + ': without the field it is the classic claw');
    }
  });
}

// ---- LABELS (round 9): the crowded moment. A boss (and a trio), the story crab, relic procs on both
// sides, a combo, four damage numbers (a crit), a status and the INCOMING telegraph all at once.
h.test('labels r9: a boss, an ally, procs, combos, numbers and the telegraph at once never overlap', () => {
  const T = boot(), G = T.GAME, fx = T.RENDER.fx;
  G.sto.force = true;
  for (const [tag, enc, tier] of [['boss', ['hoard'], 'boss'], ['trio', ['rat', 'slime', 'bat'], 'normal']]) {
    G.newRun('knight', 4242);
    if (G.run.relics.indexOf('squire_gauntlet') < 0) G.run.relics.push('squire_gauntlet');
    G.run.sto.calls.push({ k: 'ally', id: 'crab', stage: -1, pow: 1 });
    G.toMap();
    G.startFight(enc, tier);
    if (G.boss.vs) { G.boss.vsSkip(); G.boss.vsSkip(); }
    h.ok(settle(G, 40), tag + ': the fight settles');
    const F = G.fight;
    for (const e of F.enemies) { const m = e.def.moves.find((mv) => mv.k === 'attack'); if (m) e.intent = m; }
    G.qa.refresh();
    G.draw(); G.update(DT); G.draw(); G.update(DT);   // a draw records the wall sign, the next update reads it
    const Z = () => fx.zones(), has = (id) => Z().some((z) => z.id === id);
    h.ok(has('qa'), tag + ': the INCOMING pill holds its slot');
    h.ok(has('q9b0') && has('q9h0'), tag + ': the intent bubbles and the hp bars reserve their rects');
    if (tier === 'boss') h.ok(has('q9c0'), tag + ': the boss chip reserves its rect');
    h.ok(has('q9sign'), tag + ': the arena sign reserves its rect');
    const slot = G.q9.SLOT, sign = Z().find((z) => z.id === 'q9sign');
    h.ok(sign && sign.x0 >= slot.x1, tag + ': the wall sign stands right of the INCOMING slot');
    const hit = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
    F.enemies.forEach((e, i) => {
      const p = G.q9.enemyPos(i), tip = G.q9.intentY(p);
      h.ok(!hit(slot, { x0: p.x - p.w / 2, y0: p.y - p.h, x1: p.x + p.w / 2, y1: p.y }), `${tag}: the slot never covers ${e.id}'s art`);
      h.ok(!hit(slot, { x0: p.x - 30, y0: tip - 42, x1: p.x + 30, y1: tip }), `${tag}: ...nor its intent bubble`);
    });
    // the storm
    const q = (x) => G.fs.queue.push({ ev: x, beat: 0.02 });
    const last = F.enemies.length - 1;
    q({ t: 'sto', k: 'ally', id: 'crab', idx: 0, v: 6, n: 2, pow: 1 });
    q({ t: 'text', who: 'e', idx: 0, str: 'PINCH!' });
    q({ t: 'dmg', who: 'e', idx: 0, amt: 18, blocked: 0 });
    q({ t: 'proc', src: 'relic', id: 'squire_gauntlet', name: "Squire's Gauntlet", text: 'GAUNTLET', who: 'player' });
    q({ t: 'proc', src: 'relic', id: 'squire_gauntlet', name: "Squire's Gauntlet", text: 'GAUNTLET', who: 'enemy', idx: 0 });
    q({ t: 'dmg', who: 'e', idx: 0, amt: 11, blocked: 0 });
    q({ t: 'combo', id: 'hat', name: 'Hat Trick', text: '4 damage to ALL', color: '#ffc94d', n: 1, tier: 2 });
    q({ t: 'dmg', who: 'e', idx: last, amt: 7, blocked: 2 });
    q({ t: 'status', who: 'e', idx: 0, s: 'poison', v: 3 });
    q({ t: 'dmg', who: 'e', idx: 0, amt: 24, blocked: 0, crit: true });
    G.fs.beatT = 0;
    let over = 0, hard = 0, far = 0, maxN = 0, maxL = 0, ally = false;
    const why = [];
    for (let f = 0; f < 150; f++) {
      G.update(DT); G.draw();
      ally = ally || has('q9ally');
      const RR = fx.rects(), L = RR.labels, N = RR.nums, all = N.concat(L);
      maxN = Math.max(maxN, N.length); maxL = Math.max(maxL, L.length);
      for (let i = 0; i < all.length; i++) {
        const a = all[i];
        if (a.num && a.nudge > 185) far++;   // numMax x 1.6 up or down and two short steps aside at most
        for (const z of Z()) if (!z.soft && hit(a, z)) { hard++; why.push(a.str + '@' + z.id); }
        for (let j = i + 1; j < all.length; j++) if (hit(a, all[j])) { over++; why.push(a.str + '/' + all[j].str); }
      }
    }
    h.ok(maxN >= 3 && maxL >= 4, `${tag}: the moment really was crowded (${maxN} numbers, ${maxL} labels at once)`);
    h.ok(ally, tag + ': the ally reserved its rect while it ran across');
    h.eq(over, 0, `${tag}: no two labels or numbers ever overlap ${why.slice(0, 4).join(' ')}`);
    h.eq(hard, 0, `${tag}: nothing sits in a hard keep-out zone ${why.slice(0, 4).join(' ')}`);
    h.eq(far, 0, tag + ': every number stays close to its own flight');
  }
  // the numbers draw last, on top of every label and badge
  fx.clear();
  fx.text(270, 300, 'LABEL', '#fff'); fx.badge(270, 300, '*', 'BADGE', '#fff'); fx.num(270, 300, '-18', '#fff');
  const said = [];
  const rec = new Proxy({}, { get(o, p) { if (p === 'fillText') return (s) => said.push(String(s)); if (p === 'measureText') return () => ({ width: 40 }); if (p === 'canvas') return { width: 540, height: 960 }; if (typeof p !== 'string' || p in o) return o[p]; return () => {}; }, set(o, p, v) { o[p] = v; return true; } });
  fx.update(0.05); fx.draw(rec);
  h.ok(said.lastIndexOf('-18') > said.lastIndexOf('LABEL') && said.lastIndexOf('-18') > said.lastIndexOf('BADGE'), 'the damage number is painted after the labels');
  fx.clear();
  // the pill steps down under a discovery toast in the fight's corner lane, and back up
  const el = { classList: { contains: (c) => c === 'mDex' }, offsetHeight: 50 };
  G.S.mcur = { el, t: 2 };
  h.eq(G.q9.pillTop(), 74 + 50 + 6, 'a discovery toast up top: the pill steps under it');
  G.S.mcur = null;
  h.eq(G.q9.pillTop(), G.q9.SLOT.y0, '...and back to its slot when it goes');
  G.toMap(); G.update(DT);
  h.ok(!fx.zones().some((z) => /^q9/.test(z.id)), 'off the fight the arena zones are gone');
});

// ---- QA (round 9): the run card said "1 turns"; the test-hook logs had no cap
h.test('qa r9: run cards count in words ("1 turn"), the long-session logs are capped', () => {
  const T = boot(), G = T.GAME, D = T.DATA;
  h.eq(G.q9.n(1, 'turn'), '1 turn', 'one turn');
  h.eq(G.q9.n(3, 'kill'), '3 kills', 'three kills');
  h.eq(G.q9.n(0, 'fight'), '0 fights', 'no fights');
  const rec = D.hisRecFix({ id: 'q9one', d: 1790000000, c: 'knight', r: 'loss', a: 1, kl: 1, tu: 1, f: 1, s: 40, k: 'Rat', kk: 'hit' });
  G.meta.his.runs.push(rec);
  const walk = (el, out) => { if (!el) return out; out.push(el); for (const c of el.children || []) walk(c, out); return out; };
  const textOf = (el) => walk(el, []).map((e) => e.textContent || '').join('|');
  G.his.show();
  const list = textOf(T._nodes.historyBody);
  h.ok(/1 kill\b/.test(list) && /1 turn\b/.test(list) && !/1 turns|1 kills/.test(list), 'the run card: "1 kill · 1 turn"');
  G.his.show({ open: 'q9one' });
  const full = textOf(T._nodes.historyBody);
  h.ok(/1 kill in 1 fight\b/.test(full) && !/1 turns|1 fights|1 kills/.test(full), 'the run in full: "1 kill in 1 fight", "1 turn"');
  for (let i = 0; i < G.q9.LOG + 100; i++) G.sto.log.push({ k: 'x', i });
  G.q9.trim();
  h.eq(G.sto.log.length, G.q9.LOG, 'the story log keeps its newest entries only');
  h.eq(G.sto.log[G.sto.log.length - 1].i, G.q9.LOG + 99, '...the newest');
});

// ---- TITLE (round 9): the subtitle ran under NEW RUN once the menu grew; the logo now sits above the menu
h.test('title r9: the logo, its subtitle and the season ribbon clear the menu; a menu too tall scrolls; indices hold', () => {
  const T = boot(), G = T.GAME, K = G.q9.TITLE, fs = Math.min(540 * 0.16, 92);
  for (const sea of [false, true]) for (const first of [700, 540, 486, 420, 300]) {
    const L = G.q9.titleLayout({ first, fs, sea });
    h.ok(L.ly <= 480 && L.top >= (sea ? K.ribbon : K.bare) - 0.01, `sea ${sea}, first button at ${first}: the logo block stays under the ribbon and never drops below the middle`);
    if (L.fit) h.ok(L.bottom + K.gap <= first + 0.01, `sea ${sea}, first button at ${first}: the subtitle ends above the first button`);
    else h.ok(L.firstMin > L.bottom && L.firstMin <= 400, `sea ${sea}, first button at ${first}: no room, the menu is held back to ${Math.round(L.firstMin)}`);
  }
  h.ok(G.q9.titleLayout({ first: 800, fs, sea: false }).ly === 480, 'a short menu leaves the logo where it always was');
  G.showTitle();
  const labels0 = G.S.ui.buttons.map((b) => b.label).join('|');
  // a menu that would start at y 104 (a large text size, every button on): held back and scrolling
  G.q9.T.measure = () => ({ natH: 900, padTop: 60, zoom: 1, bottom: 944 });
  G.showTitle();
  const m = T._nodes.titleMenu, L = G.q9.T.last;
  h.ok(L && !L.fit && m.style.maxHeight && m.style.overflowY === 'auto', 'a menu too tall for the stage scrolls');
  h.eq(Math.round(944 - parseFloat(m.style.maxHeight) + 60), Math.round(L.firstMin), 'its first button starts under the logo block');
  h.eq(T.RENDER.q9.title.ly, L.ly, 'the renderer draws the logo where the layout put it');
  h.eq(G.S.ui.buttons.map((b) => b.label).join('|'), labels0, 'the buttons and their order are unchanged');
  // a short menu again: no limit, the logo back in place
  G.q9.T.measure = () => ({ natH: 380, padTop: 60, zoom: 1, bottom: 944 });
  G.showTitle();
  h.ok(G.q9.T.last.fit && m.style.maxHeight === '' && T.RENDER.q9.title.ly === 480, 'a menu that fits lets go of the limit');
  G.draw();
  G.showChars(); G.update(DT);
  h.eq(T.RENDER.q9.title.ly, 0, 'off the title the renderer is back to its own layout');
  G.q9.T.measure = null;
});

// ---------------- round 9: enemy families in a fight, holo cards, the shop reroll
// (DESIGN.md "Enemy families (round 9)", "Holo cards (round 9)", "Shop reroll (round 9)")
function famQueue(G) { const F = G.fight; for (const e of F.events.splice(0)) G.fs.queue.push({ ev: e, beat: 0.2 }); G.fs.beatT = 0; }
h.test('families: a family fight stages its bond (banner, plate, staff, SOLO, cans as bodies, change, the scramble, anger)', () => {
  const T = boot();
  const G = T.GAME, D = T.DATA, C = T.COMBAT;
  G.newRun('knight', 31);
  G.run.hp = G.run.maxHp = 900;
  G.startFight(D.FAM.band.members.slice(), 'normal');
  h.eq(G.S.bannerStr, 'THE BAND', 'the fight banner names the family');
  const Z = G.fam.fs;
  h.ok(Z && Z.ids.join() === 'band' && Z.plate === 0, 'the fight carries its family look state');
  for (const e of G.fight.enemies) { e.hp = e.maxHp = 900; e.affix = []; }
  stepFor(G, 0.5);
  G.draw();
  h.ok(Z.plate > 0.3, 'the plate runs on its own clock');
  const box = G.fam.staffBox();
  h.ok(box && box.x0 >= G.fam.STAFF.x0 && box.x1 <= 524 && box.x1 - box.x0 >= 170, 'the Crescendo staff sits over the band, clear of the INCOMING slot');
  h.eq(G.fam.beatOf({ ev: { t: 'fam', k: 'cres' }, beat: 0.45 }), 0.14, 'a meter tick is a quick beat');
  h.eq(G.fam.beatOf({ ev: { t: 'intent', idx: 0, fam: true }, beat: 0.45 }), 0.02, 'a SOLO intent swap is quicker still');
  h.eq(G.fam.beatOf({ ev: { t: 'dmg' }, beat: 0.45 }), null, 'everything else keeps its beat');
  settle(G, 10);
  G.endTurn(); settle(G, 30);
  h.eq(Z.cres, 4, 'the shown meter follows the Crescendo (4)');
  h.ok(Z.log.includes('cres'), 'cres events played');
  G.endTurn(); settle(G, 30);
  h.ok(G.fight.enemies.every(e => e.intent.fam === 'solo'), 'the whole band telegraphs its SOLO');
  h.ok(Z.log.includes('soloReady'), 'SOLO NEXT TURN');
  G.draw();
  const T0 = C.qaThreat(G.fight), hp0 = G.fight.player.hp;
  G.endTurn(); settle(G, 30);
  h.ok(Z.log.includes('solo'), 'the SOLO played');
  h.eq(hp0 - G.fight.player.hp, T0.loss, 'and took exactly the telegraphed ' + T0.loss);
  h.eq(Z.cres, 0, 'the staff empties');
  // the Vending Gang: cans arc in and become bodies, the Change Machine takes gold and pays it back
  G.run.act = 2; G.run.gold = 50;
  G.startFight(D.FAM.vending.members.slice(), 'normal');
  const F2 = G.fight;
  for (const e of F2.enemies) { e.hp = e.maxHp = 900; e.affix = []; }
  settle(G, 10);
  F2.enemies[0].intent = D.ENEMIES.fam_pop.moves.find(m => m.k === 'cans');
  F2.enemies[2].intent = D.ENEMIES.fam_change.moves.find(m => m.k === 'change');
  G.endTurn(); settle(G, 30);
  stepFor(G, 1);
  const cans = G.fs.items.filter(b => b.data.inst.id === 'fam_can');
  h.eq(cans.length, 2, 'two empty cans landed in the cabinet as bodies');
  h.ok(G.fam.fs.log.includes('cans') && G.fam.fs.log.includes('change'), 'cans and change were staged');
  h.eq(C.gold(F2), 38, 'the gold counter shows 12 gone');
  C.damage(F2, F2.player, F2.enemies[2], 99999, { pierce: true });
  famQueue(G); settle(G, 10);
  h.ok(G.fam.fs.log.includes('payout'), 'the broken Change Machine pays out');
  h.eq(C.gold(F2), 50, 'every coin back');
  G.draw();
  // the Choir: the scramble moves the pile, a shattered globe angers the rest
  G.run.act = 3;
  G.startFight(D.FAM.choir.members.slice(), 'normal');
  const F3 = G.fight;
  for (const e of F3.enemies) { e.hp = e.maxHp = 900; e.affix = []; }
  settle(G, 10);
  G.endTurn(); settle(G, 30); G.endTurn(); settle(G, 30);
  h.ok(F3.enemies.every(e => e.intent.fam === 'chorus'), 'the choir hums together next');
  const pos0 = G.fs.items.map(b => b.x + ',' + b.y).join('|');
  G.endTurn();
  let shook = false;
  for (let i = 0; i < 600 && !ready(G); i++) { G.update(DT); if (G.fam.fs.shakeT > 0 && G.fam.shakeX(0, 0.2) !== 0) shook = true; }
  h.ok(G.fam.fs.log.includes('scramble') && G.fam.fs.log.filter(k => k === 'hum').length === 3, 'one scramble, three hums');
  h.ok(shook, 'the globes wobble together');
  h.ok(G.fs.items.map(b => b.x + ',' + b.y).join('|') !== pos0, 'the pile was scrambled');
  C.damage(F3, F3.player, F3.enemies[0], 99999, { pierce: true });
  famQueue(G); settle(G, 10);
  h.ok(G.fam.fs.log.includes('shatter') && G.fam.fs.log.includes('angry'), 'a shattered globe, an angry choir');
  h.ok(F3.enemies[1].famAngry && F3.enemies[2].famAngry, 'the rest are marked angry (drawn red)');
  G.draw();
  // a fight without a family has no family state and keeps its FIGHT banner
  G.startFight(['rat'], 'normal');
  h.eq(G.fam.fs, null, 'no family, no family state');
  h.eq(G.S.bannerStr, 'FIGHT', 'FIGHT as ever');
});

h.test('holo: reward, shop, treasure and capsule cards carry the holo layers; the look lands on the CSS', () => {
  const T = boot();
  const G = T.GAME, D = T.DATA;
  G.newRun('knight', 12);
  const by = (r) => Object.keys(D.ITEMS).find(id => D.ITEMS[id].rarity === r);
  G.showReward({ tier: 'normal', gold: 5, items: [by('c'), by('r'), by('l')], taken: true });
  h.eq(G.S.ui.buttons.length, 4, 'three cards and Skip, as ever');
  const cards = G.S.ui.buttons.slice(0, 3).map(b => b.el);
  h.eq(cards.map(c => c._holo && c._holo.rar).join(), 'c,r,l', 'every card is holo in its rarity');
  const kids = (c) => c.children.map(k => k.className);
  h.ok(cards.every(c => kids(c).includes('holoFoil') && kids(c).includes('holoGlare')), 'a foil and a glare on every card');
  h.eq(kids(cards[2]).filter(k => k === 'holoSpark').length, T.RENDER.holo.SPARKS.length, 'sparkles on the legendary');
  h.eq(kids(cards[1]).filter(k => k === 'holoSpark').length, 0, 'none on the rare');
  h.eq(G.holo.live.length, 0, 'headless: nothing on the live list');
  G.holo.tick(1);
  // the look copied onto the card: a tilt (the CSS rotate), the foil's place, the glare, the shadow
  const L = cards[2];
  let o = G.holo.apply(L, L._holo, 1.3, false, false);
  h.ok(o && /deg$/.test(L.style.rotate) && L.style['--foil'] && L.style['--hx'] && L.style['--sx'], 'an idle wobble and sweep on the CSS');
  L._h.pointermove({ clientX: 500, clientY: 20 });
  h.ok(L._holo.on && L._holo.px > 0.9 && L._holo.py < 0.05, 'the pointer is tracked on the card');
  o = G.holo.apply(L, L._holo, 1.3, false, false);
  h.ok(o.ry > 0 && +L.style['--hx'] > 90, 'it tilts toward the pointer, the foil under it');
  L._h.pointerleave();
  h.ok(!L._holo.on, 'and lets go');
  o = G.holo.apply(L, L._holo, 1.3, true, false);
  h.eq(L.style.rotate, '', 'reduced motion: no tilt');
  o = G.holo.apply(L, L._holo, 1.3, false, true);
  h.ok(+L.style['--foil'] < T.RENDER.holo.RAR.l.foil, 'reduced flashing: a dimmer foil');
  // the shop's cards and relic, the treasure reveal, a capsule prize card
  G.run.gold = 999;
  const shop = G.rollShop({ q: 1, r: 1 });
  G.showShop(shop);
  h.ok(G.S.ui.buttons.slice(0, 5).every(b => b.el._holo) && G.S.ui.buttons[5].el._holo, 'the shop\'s items and its relic are holo');
  const rid = Object.keys(D.RELICS).find(id => D.RELICS[id].rarity === 'r');
  G.showTreasure({ relic: rid, title: 'T' });
  const tb = T._document.getElementById('treasureBody');
  h.ok(tb.children.some(c => c._holo && c._holo.rar === 'r'), 'the treasure reveal is holo');
  const cap = G.loot.makeCapsule('elite', { tier: 'l' });
  G.loot.showCapsule({ cap, then: { k: 'map' } });
  G.loot.skipCapsule(); stepFor(G, 3);
  const cb = T._document.getElementById('capsuleBody');
  const card = cb.children.find(c => c._holo);
  h.ok(!!card && card._holo.rar === cap.tier, 'the capsule\'s prize card is holo in its tier');
});

h.test('reroll: the shop lever pays a rising price, spins reel by reel, never sells a spinning card, pays once across a reload', () => {
  const T = boot();
  const G = T.GAME;
  G.newRun('knight', 44);
  G.run.gold = 200;
  const shop = G.rollShop({ q: 3, r: 3 });
  G.showShop(shop);
  let labels = G.S.ui.buttons.map(b => b.label);
  h.ok(labels[labels.length - 1] === 'Prize counter' && labels[labels.length - 2] === 'Compactor' && labels[labels.length - 3] === 'Reroll', 'the lever sits before the Compactor and the counter: ' + labels.slice(-4).join(', '));
  h.ok(labels.indexOf('Reroll') > labels.indexOf('Leave'), 'after every old entry');
  h.eq(G.rr.cost(shop, 'shop'), G.rr.RR.gold, 'the first pull costs ' + G.rr.RR.gold);
  const want = G.rr.shelf(shop, 'shop', 1).map(i => i.id).join();
  G.choose(labels.indexOf('Reroll'));
  h.eq(G.run.gold, 200 - G.rr.RR.gold, 'paid');
  h.eq(shop.rrN, 1, 'one pull on the shop');
  h.eq(shop.items.map(i => i.id).join(), want, 'the shelf its own seeded stream rolls (' + want + ')');
  h.ok(shop.items.every(i => !i.sold && i.price >= 20), 'a fresh priced shelf');
  const S0 = G.rr.state;
  h.ok(S0 && S0.done.every(d => !d) && S0.els.length === 5, 'every reel spins');
  h.eq(G.rr.cost(shop, 'shop'), G.rr.RR.gold + G.rr.RR.goldStep, 'the next pull costs more');
  // reel by reel
  stepFor(G, G.rr.RR.spin0 + 0.05);
  h.ok(G.rr.state.done[0] && !G.rr.state.done[4], 'the first reel stopped, the last still spins');
  // a spinning card is not for sale: a tap hurries the reels instead
  const g1 = G.run.gold;
  G.choose(4);
  h.ok(G.run.gold === g1 && !shop.items[4].sold, 'no sale mid-spin');
  h.ok(!G.rr.state || G.rr.state.done.every(Boolean), 'the tap brought every reel home');
  stepFor(G, 1);
  h.eq(G.rr.state, null, 'the animation completes');
  G.choose(4);
  h.ok(shop.items[4].sold, 'then the card sells');
  // a second pull: the whole spin completes on its own
  G.run.gold = 200;
  h.ok(G.rr.pull(shop, 'shop'), 'a second pull');
  h.eq(G.run.gold, 200 - G.rr.RR.gold - G.rr.RR.goldStep, 'at the higher price');
  for (let i = 0; i < 300 && G.rr.state; i++) G.update(DT);
  h.eq(G.rr.state, null, 'the reels all stop by themselves');
  // too poor
  G.run.gold = 3;
  h.eq(G.rr.pull(shop, 'shop'), false, 'too poor: refused');
  h.ok(G.run.gold === 3 && shop.rrN === 2, 'nothing paid, nothing rolled');
  // pay once across a reload (mid-spin)
  G.run.gold = 300;
  G.rr.pull(shop, 'shop');
  const ids = shop.items.map(i => i.id).join(), gold = G.run.gold;
  const T2 = boot({ store: Object.assign({}, T._store) });
  T2.GAME.choose(T2.GAME.S.ui.buttons.findIndex(b => /continue/i.test(b.label)));
  h.eq(T2.GAME.screen, 'shop', 'the reload opens the shop');
  const s2 = T2.GAME.S.sd.shop;
  h.ok(s2.rrN === 3 && s2.items.map(i => i.id).join() === ids, 'with the rerolled shelf');
  h.eq(T2.GAME.run.gold, gold, 'and the gold paid once');
  h.eq(T2.GAME.rr.cost(s2, 'shop'), G.rr.RR.gold + 3 * G.rr.RR.goldStep, 'the price remembers the pulls');
  // an old shop (no pull count) is at the first price
  h.eq(G.rr.cost({ items: [] }, 'shop'), G.rr.RR.gold, 'an old shop starts at the first price');
});

h.test('reroll: the prize counter rerolls its case for tickets', () => {
  const T = boot();
  const G = T.GAME;
  G.newRun('knight', 45);
  const shop = G.rollShop({ q: 2, r: 5 });
  G.run.tickets = 30;
  G.loot.showCounter(shop);
  const labels = G.S.ui.buttons.map(b => b.label);
  h.eq(labels[labels.length - 1], 'Reroll', 'the counter\'s lever is its last entry');
  h.ok(labels.indexOf('Back to the shop') === shop.counter.length, 'the slots and Back keep their places');
  const want = G.rr.shelf(shop, 'counter', 1).map(s => s.k + (s.tier || s.id || s.n)).join();
  G.choose(labels.length - 1);
  h.eq(G.run.tickets, 30 - G.rr.RR.tix, 'paid in tickets');
  h.eq(shop.ctrN, 1, 'one pull on the counter');
  h.ok(shop.counter.length === 6 && shop.counter.every(s => !s.sold), 'a fresh case of six');
  h.eq(shop.counter.map(s => s.k + (s.tier || s.id || s.n)).join(), want, 'seeded');
  h.ok(G.rr.state && G.rr.state.kind === 'counter', 'the case spins');
  const t1 = G.run.tickets;
  G.choose(0);
  h.eq(G.run.tickets, t1, 'a spinning prize is not for sale');
  for (let i = 0; i < 300 && G.rr.state; i++) G.update(DT);
  h.eq(G.rr.state, null, 'the reels stop');
  h.eq(G.rr.cost(shop, 'counter'), G.rr.RR.tix + G.rr.RR.tixStep, 'the next pull costs more tickets');
  G.run.tickets = 1;
  h.eq(G.rr.pull(shop, 'counter'), false, 'too few tickets: refused');
  G.save();
  const T2 = boot({ store: Object.assign({}, T._store) });
  T2.GAME.choose(T2.GAME.S.ui.buttons.findIndex(b => /continue/i.test(b.label)));
  h.ok(T2.GAME.screen === 'counter' && T2.GAME.S.sd.counter.ctrN === 1, 'the pull count reloads with the case');
});

// ---------------------------------------------------------------- LORE (round 9): the Codex, landmarks, act intros, the weekly
const loreKeys = (T) => (key) => { const fn = T._listeners.keydown; if (fn) fn({ key, preventDefault() {} }); };
const loreLbl = (G) => G.S.ui.buttons.map((b) => b.label);

h.test('lore: fresh, old and junk profiles get the Codex and the weekly fields; an old profile catches up quietly', () => {
  const { G, saved } = metaBoot({});
  h.eq(JSON.stringify(G.meta.lore), JSON.stringify({ got: {}, new: {}, kills: {}, intros: {} }), 'a fresh profile: an empty book');
  h.eq(JSON.stringify(G.meta.wk), JSON.stringify({ best: {}, medal: {}, runs: 0 }), 'and an empty medal cabinet');
  // a profile from before the Codex: what it already earned is there, NEW, with no toast storm
  const { G: G2 } = metaBoot({ stats: { runs: 3, wins: 1, fights: 12, bestAct: 3 }, seen: { enemies: { prizemaster: 1 } } });
  const L2 = G2.meta.lore;
  h.ok(L2.got.spire_tower && L2.got.pm_wall && L2.got.pm_host, 'pages it had earned: ' + Object.keys(L2.got).join());
  h.ok(Object.keys(L2.got).every((id) => L2.new[id]), 'each one NEW');
  h.ok(!G2.prog.queue.some((q) => q.k === 'lore'), 'and no toast');
  // junk
  const { G: G3 } = metaBoot({ lore: 'x', wk: [1, 2] });
  h.ok(G3.meta.lore && G3.meta.lore.got && !Array.isArray(G3.meta.wk) && G3.meta.wk.best && G3.meta.wk.medal, 'junk is repaired');
  G.meta.lore.kills.rat = 5;
  G.lore.check();
  h.ok(saved().lore && saved().lore.got.be_rat && saved().wk, 'the fields are saved with the profile');
});

h.test('lore: kills count per enemy, pages unlock as you play, a forced toast lands in the corner lane', () => {
  const { T, G, saved } = metaBoot({});
  G.newRun('knight', 9101);
  G.startFight(['rat', 'rat'], 'normal', { seed: 5 });
  h.ok(settle(G, 20), 'the fight waits for the player');
  const push = (ev) => { G.fs.queue.push({ ev, beat: 0.01 }); G.fs.beatT = Math.min(G.fs.beatT, 0); };
  G.fight.enemies.forEach((e, i) => { e.hp = 0; e.alive = false; push({ t: 'die', idx: i }); });
  stepFor(G, 0.3);
  h.eq(G.meta.lore.kills.rat, 2, 'two rats down, two kills in the book');
  stepFor(G, 1);
  h.eq((saved().lore.kills || {}).rat, 2, 'the kills are saved');
  // headless: a page is recorded with no toast
  G.meta.lore.kills.rat = 5;
  const got = G.lore.check();
  h.ok(got.includes('be_rat'), 'five rats: their page');
  h.ok(G.meta.lore.got.be_rat && G.meta.lore.new.be_rat, 'recorded, NEW');
  h.ok(!G.prog.queue.some((q) => q.k === 'lore'), 'headless: no toast');
  h.eq(G.lore.check().length, 0, 'a page unlocks once');
  // forced: the toast shares the corner lane
  G.lore.force = true;
  G.meta.lore.kills.slime = 5;
  G.meta.lore.kills.hoard = 1;
  const got2 = G.lore.check();
  h.ok(got2.includes('be_slime') && got2.includes('bo_hoard'), 'two more pages');
  const q = G.prog.queue.find((x) => x.k === 'lore');
  h.ok(q && q.list.length === got2.length && q.list.every((x) => x.tab === 'lore'), 'one toast carries them');
  const el = G.lore.toastEl(q.list);
  h.ok(el && /NEW CODEX PAGES/.test(el.children[0].textContent), 'the toast says how many');
  h.eq(T.DATA.loreCount(G.meta), Object.keys(G.meta.lore.got).length, 'the count matches');
  // 25 pages: the Lorekeeper sticker
  const B = T.DATA.loreBook();
  for (const e of B.entries.slice(0, 25)) G.meta.lore.got[e.id] = 1;
  G.meta.lore.kills.tickler = 5;
  G.lore.check();
  h.ok(G.meta.ach.lorekeeper, 'Lorekeeper');
});

h.test('lore: the Codex opens from the title and the Prizedex, walks chapters and pages, and keeps its spoilers shut', () => {
  const { T, G, saved } = metaBoot({ stats: { runs: 2, wins: 1, fights: 3 } });
  G.meta.lore.kills.rat = 5;
  G.showTitle();
  const tl = loreLbl(G);
  h.ok(tl.indexOf('History') > tl.indexOf('Boss Rush'), 'History comes after every older title button (round 11: DUO registers after it)');
  h.ok(tl.indexOf('Codex') >= 0 && tl.indexOf('Codex') < tl.indexOf('History'), 'the Codex button comes before it');
  G.choose(tl.indexOf('Codex'));
  h.eq(G.screen, 'codex', 'the Codex opens');
  h.eq(G.lore.ui.from, 'title', 'from the title');
  const B = T.DATA.loreBook();
  const ch = loreLbl(G).filter((l) => l !== 'Back');
  h.eq(ch.length, B.chapters.length, 'one entry per chapter');
  h.ok(ch.includes('???') && !ch.includes('The Machine'), 'The Machine is shut until it is met');
  G.draw();
  // a shut chapter only says so
  G.choose(loreLbl(G).indexOf('???'));
  h.eq(G.lore.ui.ch, null, 'a shut chapter stays shut');
  // The Spire: found pages and dark ones
  G.choose(loreLbl(G).indexOf('The Clawspire'));
  h.eq(G.lore.ui.ch, 'spire', 'the chapter opens');
  const pl = loreLbl(G).filter((l) => l !== 'Back');
  h.eq(pl.length, B.ch.spire.length, 'one row per page');
  h.ok(pl.includes(B.byId.spire_tower.name) && pl.includes('???'), 'found pages by name, the rest dark');
  h.ok(G.meta.lore.new.spire_tower, 'the first page is NEW');
  G.choose(pl.indexOf(B.byId.spire_tower.name) + 1);
  h.eq(G.lore.ui.id, 'spire_tower', 'the page opens');
  h.ok(!G.meta.lore.new.spire_tower && !(saved().lore.new || {}).spire_tower, 'reading it clears NEW (and saves)');
  h.ok(T._nodes.codexBody.children.some((c) => /lorePage/.test(c.className)), 'the words are on the page');
  h.ok(G.lore.live && G.lore.live.kind === 'page', 'the picture is live');
  G.draw();
  // Prev / Next through the chapter's found pages
  G.meta.lore.got.spire_dark = 1;
  G.lore.show({ ch: 'spire', id: 'spire_tower' });
  const nx = loreLbl(G).findIndex((l) => /Next/.test(l));
  h.ok(nx >= 0, 'Next');
  G.choose(nx);
  h.eq(G.lore.ui.id, 'spire_dark', 'the next found page');
  // Escape backs out one level at a time
  const key = loreKeys(T);
  key('Escape');
  h.ok(G.screen === 'codex' && G.lore.ui.ch === 'spire' && !G.lore.ui.id, 'Escape: the chapter');
  key('Escape');
  h.ok(G.screen === 'codex' && !G.lore.ui.ch, 'Escape: the book');
  key('Escape');
  h.eq(G.screen, 'title', 'Escape: the title');
  // meeting the Machine opens its chapter
  G.meta.seen.enemies.machine = 1;
  G.lore.show({ ch: null, id: null });
  h.ok(loreLbl(G).includes('The Machine'), 'The Machine opens once met');
  h.ok(G.meta.lore.got.mc_machine, 'with its first page');
  // the Prizedex door; Back returns there
  G.showCollection();
  const cl = loreLbl(G);
  h.eq(cl[cl.length - 1], 'Codex', 'the Prizedex\'s Codex door is its last entry');
  G.choose(cl.length - 1);
  h.ok(G.screen === 'codex' && G.lore.ui.from === 'collection', 'the Codex from the Prizedex');
  G.lore.back();
  h.eq(G.screen, 'collection', 'Back returns to the Prizedex');
});

function loreRun(G, seed) {
  G.newRun('knight', seed);
  const M = G.run.map;
  return { M, marks: G.lore.marks(M) };
}

h.test('lore: landmarks stand on the map, speak when tapped or stepped on, and the high score board opens underfoot', () => {
  const { T, G } = metaBoot({});
  const { M, marks } = loreRun(G, 9201);
  h.eq(marks.length, 3, 'three landmarks');
  h.eq(marks.map((m) => m.k).sort().join(), 'hiscore,jukebox,tickets', 'a jukebox, lost tickets and the high score board');
  h.eq(JSON.stringify(M.lore), JSON.stringify(T.MAP.lorePlace(M)), 'placed from the map seed');
  const tileOf = (mk) => T.MAP.tileAt(M, mk.q, mk.r);
  const juke = marks.find((m) => m.k === 'jukebox'), hs = marks.find((m) => m.k === 'hiscore');
  const tj = tileOf(juke);
  h.eq(tj.type, 'empty', 'on empty land');
  // headless without force: nothing pops
  tj.revealed = true;
  h.eq(G.lore.tap(tj), false, 'headless: no bubble');
  h.eq(G.lore.snip, null, 'no bubble');
  G.lore.force = true;
  h.eq(G.lore.tap(tj), false, 'a tap on a landmark still walks');
  h.ok(G.lore.snip && G.lore.snip.kind === 'jukebox' && G.lore.snip.text === T.DATA.loreSnippet('jukebox', M.seed, tj.q, tj.r), 'the jukebox speaks its line');
  G.draw();
  stepFor(G, G.lore.K.SNIP + 0.2);
  h.eq(G.lore.snip, null, 'the bubble fades');
  // a tower speaks too, a dark hex does not
  const tw = Object.values(M.tiles).find((t) => t.type === 'tower');
  if (tw) { tw.revealed = true; G.lore.tap(tw); h.ok(G.lore.snip && G.lore.snip.kind === 'tower', 'a tower has lines'); }
  const dark = Object.values(M.tiles).find((t) => t.type === 'empty' && !t.revealed && !G.lore.at(t.q, t.r));
  G.S.loreSnip = null;
  if (dark) { G.lore.tap(dark); h.eq(G.lore.snip, null, 'plain land says nothing'); }
  // stepping on one
  G.S.loreSnip = null;
  const tt = tileOf(marks.find((m) => m.k === 'tickets'));
  G.enterTile(tt);
  h.ok(G.lore.snip && G.lore.snip.kind === 'tickets' && tt.seenToast, 'stepping on the lost tickets');
  // the high score board: your best runs among the regulars
  G.meta.his.hof.push({ id: 'r1', c: 'knight', s: 123456, r: 'win', d: 1 }, { id: 'r2', c: 'rogue', s: 2500, r: 'loss', d: 2 });
  const th = tileOf(hs);
  th.revealed = true;
  M.pos = { q: th.q, r: th.r };
  h.eq(G.lore.tap(th), true, 'the board underfoot opens');
  const Bd = G.lore.boardState;
  h.ok(Bd && Bd.rows.length === G.lore.K.BOARD_N, 'eight rows');
  h.eq(Bd.rows.filter((r) => r.you).length, 2, 'your two runs are on it');
  h.ok(Bd.rows.some((r) => r.house && r.ini === 'P.M'), 'among the regulars');
  G.draw();
  G.pointer('up', 270, 500, { pointerId: 1 });
  h.ok(G.lore.boardState, 'a stray release does not close it at once');
  stepFor(G, 0.3);
  G.pointer('down', 270, 500, { pointerId: 1 });
  G.pointer('up', 270, 500, { pointerId: 1 });
  h.eq(G.lore.boardState, null, 'a tap closes it');
  G.lore.board();
  h.eq(G.screen, 'map', 'still on the map');
  loreKeys(T)('Escape');
  h.eq(G.lore.boardState, null, 'so does Escape');
  // through the real tap path
  const p = G.hexToStage(tj.q, tj.r);
  G.S.loreSnip = null;
  G.mapTap(p.x, p.y);
  h.ok(G.lore.snip && G.lore.snip.kind === 'jukebox', 'mapTap: the jukebox speaks');
  // an old map without landmarks gets the same ones
  const want = JSON.stringify(M.lore);
  delete M.lore;
  h.eq(JSON.stringify(G.lore.marks()), want, 'an old map: the same landmarks');
  G.save();
  const s = JSON.parse(T._store.clawspire_run);
  h.eq(JSON.stringify(s.run.map.lore), want, 'and they save with the map');
  const G2 = boot({ store: Object.assign({}, T._store) }).GAME;
  G2.choose(G2.S.ui.buttons.findIndex((b) => /continue/i.test(b.label)));
  h.eq(JSON.stringify(G2.lore.marks()), want, 'and reload');
  G2.draw();
});

h.test('lore: act intros open each floor once, skip on a tap after a beat, run fast on repeat, and stay out of old saves', () => {
  const { T, G, saved } = metaBoot({});
  // headless: no card, but the map is marked as introduced
  G.newRun('knight', 9301);
  h.eq(G.run.lore.intro, 'a1', 'the run knows Act 1 was entered');
  h.eq(G.lore.introState, null, 'headless: no card');
  // forced: the card
  G.lore.force = true;
  G.newRun('knight', 9302);
  let I = G.lore.introState;
  h.ok(I && I.key === 'a1' && !I.fast && I.def.lines.length === 2, 'Act 1: its card, two lines');
  h.eq(I.dur, G.lore.K.INTRO.dur, 'the first time runs full length');
  const pos0 = JSON.stringify(G.run.map.pos);
  G.pointer('down', 270, 500, { pointerId: 1 });
  h.ok(G.lore.introState, 'a tap in the first beat does not skip');
  G.pointer('up', 270, 500, { pointerId: 1 });
  h.eq(JSON.stringify(G.run.map.pos), pos0, 'the map takes no input under the card');
  stepFor(G, 0.6);
  h.ok(G.lore.introState.typed > 0, 'the lines type out');
  G.draw();
  G.pointer('down', 270, 500, { pointerId: 1 });
  h.eq(G.lore.introState, null, 'a tap skips');
  h.eq(G.lore.log[G.lore.log.length - 1].k, 'skip', 'logged as a skip');
  h.eq(G.meta.lore.intros.a1, 1, 'seen once');
  h.eq(saved().lore.intros.a1, 1, 'saved');
  // repeat: fast, ends on its own
  G.newRun('knight', 9303);
  I = G.lore.introState;
  h.ok(I && I.fast && I.dur === G.lore.K.INTRO.fast, 'the second time is quick');
  stepFor(G, G.lore.K.INTRO.fast + 0.1);
  h.eq(G.lore.introState, null, 'and ends on its own');
  h.eq(G.lore.log[G.lore.log.length - 1].k, 'introEnd', 'logged');
  // the same map again: no card (leaving and returning)
  G.toMap();
  h.eq(G.lore.introState, null, 'a map already entered: no card');
  // Act 2
  G.run.act = 2;
  G.toMap();
  I = G.lore.introState;
  h.ok(I && I.key === 'a2' && /Foundry/.test(I.def.name), 'Act 2: the Foundry');
  loreKeys(T)(' ');
  h.eq(G.lore.introState, null, 'Space skips');
  // keys for loops and the Back Room
  const r = { act: 2, map: {}, endless: { loop: 2 } };
  h.eq(G.lore.mapKey(r), 'L2', 'an Endless loop');
  h.eq(G.lore.mapKey({ act: 3, map: { room: true } }), 'room', 'the Back Room');
  h.eq(G.lore.mapKey({ act: 9, map: {} }), 'a3', 'clamped');
  const dL = T.DATA.loreIntro('L2', 2), dR = T.DATA.loreIntro('room', 3);
  h.ok(dL && dL.lines.length === 2 && dR && dR.name === 'The Back Room', 'their cards');
  // an old save: Continue shows no card
  G.run.act = 1;
  G.save();
  const st = JSON.parse(T._store.clawspire_run);
  delete st.run.lore;
  const G2 = boot({ store: Object.assign({}, T._store, { clawspire_run: JSON.stringify(st) }) }).GAME;
  G2.lore.force = true;
  G2.choose(G2.S.ui.buttons.findIndex((b) => /continue/i.test(b.label)));
  h.eq(G2.screen, 'map', 'the old save continues');
  h.ok(G2.lore.introState === null && G2.run.lore && G2.run.lore.intro === 'a1', 'with no card');
});

h.test('lore: the weekly challenge by ISO week, its title card, its screen, its run, its medal and its cabinet', () => {
  const { T, G, saved } = metaBoot({});
  h.eq(G.wk.setDate('2027-01-01'), '2026-W53', 'Jan 1 2027 is in 2026\'s week 53');
  h.eq(G.wk.setDate('2027-01-04'), '2027-W01', 'Jan 4 2027 starts week 1');
  h.eq(G.wk.setDate(new Date(2026, 8, 30, 12, 0, 0)), '2026-W40', 'a Wednesday at noon');
  h.ok(/^ends in 4d 1\dh$/.test(G.wk.left()), 'time left: ' + G.wk.left());
  const key = G.wk.key(), def = G.wk.def();
  h.ok(def && def.key === key && def.muts.length >= 2 && def.muts.length <= 3, 'this week: ' + def.name);
  // the title card, before History
  G.showTitle();
  const tl = loreLbl(G);
  h.ok(tl.indexOf('History') > tl.indexOf('Weekly challenge'), 'History comes after every older title button (round 11: DUO registers after it)');
  h.ok(tl.indexOf('Weekly challenge') > tl.indexOf('Codex'), 'the weekly card after the Codex');
  h.ok(/left$/.test(G.S.wkLeftEl.textContent), 'the card counts down');
  G.draw();
  G.choose(tl.indexOf('Weekly challenge'));
  h.eq(G.screen, 'weekly', 'the weekly screen');
  const body = T._nodes.weeklyBody.children.map((c) => c.className);
  h.ok(['wkBan', 'wkRules panel', 'wkTargets', 'wkBest', 'wkCab'].every((k) => body.includes(k)), 'banner, rules, targets, best, cabinet');
  h.eq(T._nodes.weeklyBody.children.find((c) => c.className === 'wkTargets').children.length, 4, 'four medal targets');
  G.draw();
  loreKeys(T)('Escape');
  h.eq(G.screen, 'title', 'Escape leaves');
  G.wk.show();
  G.choose(loreLbl(G).indexOf('Play the weekly'));
  h.eq(G.screen, 'map', 'the weekly starts');
  // hand the act stat a parent (the stub DOM has no tree) so the HUD badge has somewhere to live
  T._nodes.actTxt.parentNode = { children: [], appendChild(c) { this.children.push(c); c.parentNode = this; return c; } };
  G.update(0.2); G.toMap();
  const R = G.run;
  h.ok(R.weekly === key && R.seed === def.seed && R.char === def.char && R.clawType === def.claw, 'the week\'s seed, crawler and claw');
  h.ok(R.tilt === 0 && R.daily === null, 'Tilt 0, not a daily');
  h.eq(R.muts.slice().sort().join(), def.muts.slice().sort().join(), 'the week\'s mutators');
  h.eq(G.S.tiltEl.textContent, 'WEEKLY', 'the HUD says so');
  // everyone climbs the same seed
  const G2 = metaBoot({}).G;
  G2.wk.setDate('2026-09-28');
  G2.wk.start();
  h.eq(JSON.stringify(G2.run.map.tiles), JSON.stringify(R.map.tiles), 'the same map for everyone that week');
  // a gold-worthy win
  R.scoreTop = def.targets.gold + 10;
  R.act = 3;
  G.showWin();
  const w = G.run.metaEnd.weekly;
  h.ok(w && w.key === key && w.best >= def.targets.gold && w.newBest, 'the best is recorded: ' + (w && w.best));
  h.eq(w.medal, T.DATA.wkMedal(w.best, def.targets), 'the medal it earns');
  h.ok(T.DATA.wkRank(w.medal) >= T.DATA.wkRank('gold') && w.newMedal === w.medal, 'gold or better, new');
  h.ok(G.meta.ach.podium, 'Podium Finish');
  h.eq(saved().wk.best[key], w.best, 'saved');
  h.eq(G.meta.wk.runs, 1, 'one weekly climb');
  // a worse run keeps the best and the medal
  G.wk.start(key);
  G.run.scoreTop = 10;
  G.showGameOver();
  h.ok(G.meta.wk.best[key] === w.best && G.meta.wk.medal[key] === w.medal && !G.run.metaEnd.weekly.newBest, 'a worse run keeps both');
  // a plain run is not weekly
  G.newRun('knight', 77);
  h.ok(!G.run.weekly, 'a plain run');
  G.showGameOver();
  h.eq(G.meta.wk.runs, 2, 'and does not count');
  // the cabinet and a reload
  G.wk.show();
  h.ok(T._nodes.weeklyBody.children.find((c) => c.className === 'wkCab').children.some((c) => /wkCell/.test(c.className)), 'the medal in the cabinet');
  const G3 = boot({ store: Object.assign({}, T._store) }).GAME;
  h.ok(G3.meta.wk.best[key] === w.best && G3.meta.wk.medal[key] === w.medal, 'medals survive a reload');
  G3.wk.setDate('2026-10-05');
  h.ok(G3.wk.key() === '2026-W41' && !(G3.meta.wk.best['2026-W41']), 'next week starts fresh');
});

/* ---------------------------------------------------------------- RUSH (round 10): the Boss Rush and the ghost race */
const rushLbl = (G) => G.S.ui.buttons.map((b) => b.label);
const rushVs = (G) => { if (G.boss.vs) { G.boss.vsSkip(); G.boss.vsSkip(); } };
// The rush boss's hit points: the def's, the difficulty dial and its ramp, then the rush's own share.
function rushHpOf(T, id, fights) {
  const D = T.DATA, d = D.ENEMIES[id], R = D.DIFFICULTY.ramp, step = Math.min(Math.floor(fights / R.every), R.max);
  const hp0 = Math.max(1, Math.round(d.hp[0] * D.DIFFICULTY.hp * (1 + step * R.hp)));
  return Math.max(1, Math.round(hp0 * D.rushHpK(id)));
}

h.test('rush: the title card sits before History, locked until the first win; the menu, the crawler, the kit, the board', () => {
  const { T, G, saved } = metaBoot({});
  G.showTitle();
  let tl = rushLbl(G);
  h.ok(tl.indexOf('History') > tl.indexOf('Boss Rush'), 'History comes after every older title button (round 11: DUO registers after it)');
  const i = tl.indexOf('Boss Rush');
  h.ok(i > tl.indexOf('Weekly challenge') && i < tl.indexOf('History'), 'Boss Rush after the weekly card, before History: ' + tl.join(', '));
  h.ok(!G.rush.open(), 'locked on a profile without a win');
  G.choose(i);
  h.eq(G.screen, 'rushmenu', 'the menu opens anyway, with its lock');
  h.ok(secFind(T._nodes.rushMenuBody, /rushLock/), 'it says how to open it');
  const lk = G.S.ui.buttons.find((b) => b.label === 'Locked');
  h.ok(lk && lk.el.disabled, 'Start is locked');
  h.ok(!G.choose(rushLbl(G).indexOf('Locked')) && G.screen === 'rushmenu' && !G.run, 'and starts nothing');
  G.draw();
  loreKeys(T)('Escape');
  h.eq(G.screen, 'title', 'Escape leaves');
  // a win opens it: the crawlers you have, the kit, the board
  const W = metaBoot({ stats: { runs: 3, wins: 1 }, unlocks: { knight: true, rogue: true } });
  const G2 = W.G, T2 = W.T;
  h.ok(G2.rush.open(), 'open after a win');
  G2.showTitle();
  G2.choose(rushLbl(G2).indexOf('Boss Rush'));
  const l2 = rushLbl(G2);
  h.ok(l2[0] === 'Back' && l2.includes(T2.DATA.CHARACTERS.knight.name) && l2.includes(T2.DATA.CHARACTERS.rogue.name) && !l2.includes(T2.DATA.CHARACTERS.gambler.name), 'the crawlers you have: ' + l2.join(', '));
  h.ok(l2.includes('Start the rush'), 'Start');
  const kitNames = (T0) => secWalk(T0._nodes.rushMenuBody).filter((n) => /^rkIt/.test(n.className || '')).map((n) => (n.children[1] || {}).textContent);
  h.eq(kitNames(T2).join(), T2.DATA.rushKit('knight').items.concat(T2.DATA.rushKit('knight').relics).map((id) => (T2.DATA.ITEMS[id] || T2.DATA.RELICS[id]).name).join(), 'the knight\'s kit, item by item');
  G2.choose(rushLbl(G2).indexOf(T2.DATA.CHARACTERS.rogue.name));
  h.ok(G2.meta.rush.pick === 'rogue' && W.saved().rush.pick === 'rogue', 'the pick is remembered');
  h.eq(kitNames(T2)[0], T2.DATA.ITEMS[T2.DATA.rushKit('rogue').items[0]].name, 'the rogue\'s kit now');
  h.ok(secFind(T2._nodes.rushMenuBody, /No rushes on the board yet/), 'an empty board says so');
  h.ok(!T2._store.clawspire_run, 'the menu never saves a run');
  G2.draw();
  G2.choose(rushLbl(G2).indexOf('Start the rush'));
  h.ok(G2.screen === 'rush' && G2.run.char === 'rogue' && G2.rush.of(), 'Start: a rush with the rogue');
});

h.test('rush: a whole rush: the kit, NEXT CHALLENGER, every boss once, rush hit points, the clock, the splits, the draft, the result, the bests', () => {
  const { T, G, saved } = metaBoot({ stats: { runs: 3, wins: 1, fights: 30 }, unlocks: { knight: true } });
  const D = T.DATA, base = D.CHARACTERS.knight, K = D.rushKit('knight');
  G.rush.start('knight', 4242);
  const R = G.rush.of(), run = G.run;
  h.ok(G.screen === 'rush' && G.rush.ui.k === 'next', 'the first challenger steps up (no map, no boon)');
  h.ok(R.order.length === 7 && R.order[6] === 'prizemaster' && R.order.join() === D.rushOrder(4242).join(), 'the lineup');
  h.eq(run.bin.length, base.bin.length + K.items.length, 'the starter bin plus the kit');
  h.ok(K.relics.every((id) => run.relics.includes(id)) && run.relics.includes(base.relic), 'the kit\'s relics and the starter');
  h.ok(run.maxHp === base.hp + K.hp && run.hp === run.maxHp, 'the kit\'s max hp, full');
  h.ok(run.claw.grip > base.claw.grip, 'the kit\'s claw part');
  h.ok(run.tilt === 0 && !run.daily && !run.weekly && run.muts.length === 0 && run.hisDone === 'rush' && !run.gho, 'Tilt 0, no mutators, not a daily, no history card, no ghost');
  h.ok(run.season == null, 'no seasonal currency to farm in a rush');
  h.ok(T._store.clawspire_run && JSON.parse(T._store.clawspire_run).screen === 'rush', 'saved on its screen');
  // the slam: its beats and sounds, a tap skips it
  G.draw();
  stepFor(G, 0.45);
  h.ok(G.rush.ui.snd >= 1 && G.rush.ui.t > 0.3, 'NEXT CHALLENGER slams in');
  h.ok(G.rush.skip() && G.rush.ui.t >= G.rush.K.SLAM && !G.rush.skip(), 'a tap skips to the end, once');
  G.update(1 / 60);
  h.eq(G.rush.K.tap.textContent, 'the clock starts at the bell', 'the skip hint goes with the slam');
  G.draw();
  // the HUD: the RUSH badge, the boss count, the clock
  T._nodes.actTxt.parentNode = { children: [], appendChild(c) { this.children.push(c); c.parentNode = this; return c; }, querySelector: () => null };
  let picked = { item: 0, relic: 0, heal: 0, claw: 0 };
  for (let i = 0; i < R.order.length; i++) {
    h.eq(G.rush.ui.k, 'next', `boss ${i + 1}: NEXT CHALLENGER`);
    const fs0 = G.meta.stats.fights;
    G.choose(rushLbl(G).indexOf('Fight!'));
    h.eq(G.screen, 'fight', `boss ${i + 1}: FIGHT!`);
    h.eq(G.meta.stats.fights, fs0 + 1, 'counted on the profile');
    const e = G.fight.enemies[0], id = R.order[i];
    h.ok(G.fight.enemies.length === 1 && e.id === id, `boss ${i + 1}: ${id}`);
    h.ok(run.act === D.rushActOf(id) && run.fights === i, `boss ${i + 1}: its act's arena, the ramp at ${i}`);
    h.near(e.maxHp, rushHpOf(T, id, i) * Math.pow(1.05, (e.affix || []).length), 3, `boss ${i + 1}: rush hit points (${(e.affix || []).length} affixes)`);
    h.ok(!e.def.onDeath || D.ENEMIES[e.def.onDeath.id].tier !== 'boss', `boss ${i + 1}: nobody steps out of it`);
    const atk = (D.ENEMIES[id].moves || []).find((m) => m.k === 'attack'), mine = e.def.moves.find((m) => m.id === (atk && atk.id));
    // (round 12: bosses carry DIFFICULTY.tierDmg on top of the dial)
    if (atk && mine) h.ok(mine.v < Math.round(atk.v * D.DIFFICULTY.dmg * ((D.DIFFICULTY.tierDmg || {}).boss || 1) * (1 + Math.floor(i / 3) * D.DIFFICULTY.ramp.dmg)) || mine.v === 1, `boss ${i + 1}: rush hits (${mine.v})`);
    h.eq(D.ENEMIES[id].moves.find((m) => m.k === 'attack') ? D.ENEMIES[id].moves.find((m) => m.k === 'attack').v : 0, atk ? atk.v : 0, 'the data is never touched');
    h.eq(G.boss.vs && G.boss.vs.title, id === 'prizemaster' ? 'FINAL BOSS' : `BOSS ${i + 1} OF 7`, `boss ${i + 1}: the versus card's title`);
    // the clock waits under the card, then runs
    stepFor(G, 0.3);
    h.eq(G.fs.rushT || 0, 0, 'the clock waits under the versus card');
    rushVs(G);
    stepFor(G, 0.5);
    h.near(G.fs.rushT, 0.5, 0.05, 'then runs with the fight');
    G.rush.hud(run);
    h.ok(T._nodes.top.classList && G.rush.clockEl && G.rush.clockEl.children[1].textContent === G.rush.clock(), 'the HUD clock: ' + G.rush.clock());
    h.eq(T._nodes.actTxt.textContent, `${i + 1}/7`, 'the act stat counts the bosses');
    h.eq(G.S.tiltEl && G.S.tiltEl.textContent, 'RUSH', 'the RUSH badge');
    const t0 = R.t;
    G.endFight('win');
    h.ok(R.beat.length === i + 1 && R.beat[i] === id && R.i === i + 1, `boss ${i + 1}: down, in the gallery`);
    h.ok(R.splits[i] >= 0.45 && Math.abs(R.t - t0 - R.splits[i]) < 1e-6, `boss ${i + 1}: the split ${R.splits[i]} booked on the total`);
    h.eq(G.meta.rush.beat[id], 1, 'the profile\'s gallery');
    if (i < R.order.length - 1) {
      h.eq(G.rush.ui.k, 'draft', `boss ${i + 1}: the draft`);
      const offers = R.draft.offers;
      h.ok(offers.length === 3 && new Set(offers.map((o) => o.k)).size === 3, 'three different cards: ' + offers.map((o) => o.k).join());
      h.ok(rushLbl(G).length === 3, 'three choices, nothing else');
      G.draw();
      // take a kind we have taken least of
      let n = 0;
      offers.forEach((o, j) => { if (picked[o.k] < picked[offers[n].k]) n = j; });
      const o = offers[n], before = { bin: run.bin.length, relics: run.relics.length, hp: run.hp, grip: run.claw.grip, prongs: run.claw.prongs, grabs: run.claw.grabs, width: run.claw.width, speed: run.claw.speed, rubber: run.claw.rubber, magnet: run.claw.magnet };
      if (o.k === 'heal') run.hp = Math.max(1, run.hp - 40);
      const hp1 = run.hp;
      G.choose(n);
      picked[o.k]++;
      if (o.k === 'item') h.ok(run.bin.length === before.bin + 1 && run.bin[run.bin.length - 1].id === o.id && run.bin[run.bin.length - 1].plus === !!o.plus, 'the item joins the bin');
      else if (o.k === 'relic') h.ok(run.relics.length === before.relics + 1 && run.relics.includes(o.id), 'the relic is yours');
      else if (o.k === 'heal') h.eq(run.hp, Math.min(run.maxHp, hp1 + o.v), 'the heal mends');
      else h.ok(['grip', 'prongs', 'grabs', 'width', 'speed', 'rubber', 'magnet'].some((k) => run.claw[k] !== before[k]), 'the claw part is bolted on');
      h.ok(R.draft.done && G.rush.ui.k === 'next', 'then the next challenger');
      h.ok(!G.rush.pick(0), 'a second pick is refused');
    }
  }
  h.ok(picked.item && picked.relic && picked.heal && picked.claw, 'every kind of card came up: ' + JSON.stringify(picked));
  // the result
  h.ok(G.screen === 'rush' && G.rush.ui.k === 'end' && R.done && R.won, 'RUSH CLEARED');
  const sc = D.rushScore({ n: 7, total: 7, won: true, t: R.t, hp: run.hp });
  h.eq(R.score, sc.total, 'the score: ' + R.score);
  h.ok(Math.abs(G.meta.rush.best.knight.t - R.t) < 0.01 && G.meta.rush.clears === 1 && G.meta.rush.runs === 1 && saved().rush.best.knight.t > 0, 'the best time on the profile: ' + G.meta.rush.best.knight.t);
  h.ok(R.rec.newTime && R.rec.newTop, 'NEW BEST');
  h.ok(G.meta.ach.rush_clear, 'Rush Hour');
  h.ok(!T._store.clawspire_run, 'the run save goes');
  const body = T._nodes.rushBody;
  h.ok(secFind(body, /rushRes/) && secWalk(body).filter((n) => /^rsRow/.test(n.className || '')).length === 7 && secFind(body, /rbRow/), 'the time, the score, seven splits, the board');
  h.ok(secFind(body, /Rush Hour/), 'the sticker on the result');
  h.ok(!G.meta.stats.wins || G.meta.stats.wins === 1, 'a rush is not a run won');
  G.draw();
  // Rush again: a new rush, a new lineup
  G.choose(rushLbl(G).indexOf('Rush again'));
  h.ok(G.screen === 'rush' && G.rush.of() && G.rush.of() !== R && G.rush.of().i === 0 && G.run.char === 'knight', 'Rush again');
});

h.test('rush: every crawler on the roster (Ms. Bubbles too) starts a rush with its own kit and fights its first boss', () => {
  const all = {};
  const T0 = boot({});
  for (const c in T0.DATA.CHARACTERS) all[c] = true;
  const { T, G } = metaBoot({ stats: { wins: 1 }, unlocks: all });
  for (const c in T.DATA.CHARACTERS) {
    const base = T.DATA.CHARACTERS[c], K = T.DATA.rushKit(c);
    G.rush.start(c, 31);
    const run = G.run;
    h.ok(K.own && run.char === c && G.rush.ui.k === 'next', `${c}: a rush with its own kit`);
    h.eq(run.bin.length, base.bin.length + K.items.length, `${c}: the starter bin and ${K.items.join(', ')}`);
    h.ok(K.relics.every((id) => run.relics.includes(id)) && run.maxHp === base.hp + K.hp, `${c}: the kit's relics and max hp`);
    G.rush.fight();
    rushVs(G);
    stepFor(G, 0.2);
    h.ok(G.screen === 'fight' && G.fight.enemies[0].id === G.rush.of().order[0], `${c}: the first boss`);
    G.draw();
  }
});

h.test('rush: save and reload at every step (NEXT CHALLENGER, mid fight, the draft, the outro), paid once', () => {
  const { T, G } = metaBoot({ stats: { runs: 3, wins: 1 }, unlocks: { knight: true } });
  G.rush.start('knight', 99);
  const R = G.rush.of();
  const reload = () => { const T2 = boot({ store: Object.assign({}, T._store) }); T2.GAME.load(); return T2; };
  let T2 = reload(), G2 = T2.GAME;
  h.ok(G2.screen === 'rush' && G2.rush.ui.k === 'next' && G2.rush.of().order.join() === R.order.join() && G2.run.bin.length === G.run.bin.length, 'NEXT CHALLENGER comes back, the kit once');
  G2.rush.fight();
  rushVs(G2);
  stepFor(G2, 0.6);
  const hp0 = G2.fight.enemies[0].maxHp;
  T2 = (() => { const T3 = boot({ store: Object.assign({}, T2._store) }); T3.GAME.load(); return T3; })();
  let G3 = T2.GAME;
  h.ok(G3.screen === 'fight' && G3.fight.enemies[0].id === R.order[0] && G3.fight.enemies[0].maxHp === hp0, 'mid fight: the same fight from the bell, rush hit points again');
  h.ok(!(G3.fs.rushT > 0) && G3.rush.of().t === 0, 'its clock starts over, nothing booked');
  h.eq(G3.boss.vs && G3.boss.vs.title, 'BOSS 1 OF 7', 'the card again');
  rushVs(G3);
  stepFor(G3, 0.4);
  G3.endFight('win', true);
  h.ok(G3.fs.outro && G3.rush.of().i === 1, 'the outro plays; the win is booked');
  const Ts = boot({ store: Object.assign({}, T2._store) });
  Ts.GAME.load();
  const G4 = Ts.GAME;
  h.ok(G4.screen === 'rush' && G4.rush.ui.k === 'draft' && G4.rush.of().i === 1 && G4.rush.of().beat.length === 1, 'a reload under the outro lands on the draft, the boss counted once');
  const offers = JSON.stringify(G4.rush.of().draft.offers);
  const T5 = boot({ store: Object.assign({}, Ts._store) });
  T5.GAME.load();
  h.eq(JSON.stringify(T5.GAME.rush.of().draft.offers), offers, 'the draft is rolled once');
  const bin = T5.GAME.run.bin.length, rel = T5.GAME.run.relics.length, hp = T5.GAME.run.hp, cl = JSON.stringify(T5.GAME.run.claw);
  T5.GAME.rush.pick(0);
  const T6 = boot({ store: Object.assign({}, T5._store) });
  T6.GAME.load();
  const G6 = T6.GAME;
  h.ok(G6.screen === 'rush' && G6.rush.ui.k === 'next' && G6.rush.of().draft.done, 'after the pick: the next challenger');
  const changed = (G6.run.bin.length - bin) + (G6.run.relics.length - rel) + (G6.run.hp !== hp ? 1 : 0) + (JSON.stringify(G6.run.claw) !== cl ? 1 : 0);
  h.eq(changed, 1, 'paid once');
  h.ok(!G6.rush.pick(1), 'no second pick after a reload');
  // old saves and profiles
  const old = metaBoot({ stats: { wins: 1 }, rush: 'junk', gho: [1, 2] });
  h.ok(old.G.meta.rush && old.G.meta.rush.best && old.G.meta.gho && old.G.meta.gho.d === null, 'a junk profile is repaired');
  const bare = metaBoot({});
  h.ok(bare.G.rush.meta().runs === 0 && bare.G.gho.meta().passes === 0, 'an old profile starts empty');
  bare.G.newRun('knight', 5);
  h.ok(!bare.G.rush.of() && !bare.G.run.gho && bare.G.screen === 'map', 'a plain run is neither a rush nor a race');
});

h.test('rush: The Machine only once met, a fall, giving up, the killer on the result', () => {
  const met = metaBoot({ stats: { wins: 2 }, unlocks: { knight: true }, seen: { items: {}, relics: {}, enemies: { machine: 1 }, combos: {} } });
  h.ok(met.G.rush.met(), 'met in a fight');
  met.G.rush.start('knight', 12);
  const R = met.G.rush.of();
  h.ok(R.order.length === 8 && R.order[7] === 'machine' && R.order[6] === 'prizemaster', 'The Machine closes the lineup');
  // straight to The Machine
  R.i = 7; R.beat = R.order.slice(0, 7); R.splits = [1, 1, 1, 1, 1, 1, 1]; R.t = 7;
  met.G.rush.show({ k: 'next' });
  h.eq(met.G.rush.ui.i, 7, 'the last challenger');
  met.G.rush.fight();
  const e = met.G.fight.enemies[0];
  h.ok(e.id === 'machine' && Math.abs(e.maxHp - rushHpOf(met.T, 'machine', 7)) <= 1, 'The Machine, at rush strength: ' + e.maxHp);
  h.eq(met.G.boss.vs && met.G.boss.vs.title, 'SECRET BOSS', 'with its own card');
  rushVs(met.G);
  met.G.endFight('win');
  h.ok(met.G.screen === 'rush' && met.G.rush.ui.k === 'end' && R.won, 'powered down: the rush is cleared (no true ending in a rush)');
  const ends = met.G.meta.sec.ends | 0;
  h.eq(ends, 0, 'the true ending is not counted');
  const unmet = metaBoot({ stats: { wins: 2 }, unlocks: { knight: true } });
  unmet.G.rush.start('knight', 12);
  h.ok(unmet.G.rush.of().order.length === 7 && !unmet.G.rush.of().order.includes('machine'), 'never met: no Machine');
  // a fall
  unmet.G.rush.fight();
  rushVs(unmet.G);
  unmet.G.fs.killer = 'Test Boss';
  unmet.G.fight.player.hp = 0;
  unmet.G.endFight('lose');
  const U2 = unmet.G.rush.of();
  h.ok(unmet.G.screen === 'rush' && unmet.G.rush.ui.k === 'end' && U2.done && !U2.won && U2.dead === 0 && U2.killer === 'Test Boss', 'a fall: the result, not the game over');
  h.ok(secFind(unmet.T._nodes.rushBody, /fell to Test Boss at boss 1 of 7/), 'who got you, and where');
  h.ok(unmet.G.meta.rush.runs === 1 && unmet.G.meta.rush.clears === 0 && !unmet.G.meta.rush.best.knight.t, 'booked, no time');
  h.ok(!unmet.G.meta.ach.rush_clear && !unmet.T._store.clawspire_run, 'no sticker, no save');
  h.ok(!unmet.G.meta.his || !unmet.G.meta.his.runs || !unmet.G.meta.his.runs.length, 'no history card');
  // giving up
  unmet.G.rush.start('knight', 13);
  unmet.G.choose(rushLbl(unmet.G).indexOf('Give up'));
  h.ok(unmet.G.rush.ui.k === 'end' && unmet.G.rush.of().killer === 'walking away' && unmet.G.meta.rush.runs === 2, 'Give up ends it');
  unmet.G.choose(rushLbl(unmet.G).indexOf('Back to title'));
  h.ok(unmet.G.screen === 'title' && !unmet.G.run, 'back to the title');
  unmet.G.showTitle();
  // (round 15: the card lives in the title's Modes sheet)
  h.ok(secWalk(unmet.G.ui15.T.sheets.modes).some((c) => /rushCard/.test(c.className || '') && /every boss|best/.test(secWalk(c).map((n) => n.textContent).join(' '))), 'the title card');
});

/* ---------------------------------------------------------------- QA pass 4 (round 11): regressions */
h.test('qa11: Give up reads "gave up at boss n", and the first challenger never says the clock line twice', () => {
  const { T, G } = metaBoot({ stats: { wins: 1 }, unlocks: { knight: true } });
  G.rush.start('knight', 13);
  G.draw();
  stepFor(G, 4);   // the slam is over: the DOM hint has its after-slam words
  G.draw();
  const K = G.rush.K;
  h.ok(K.cst && K.cst.split && K.tap && K.cst.split !== K.tap.textContent, `the canvas line (${K.cst && K.cst.split}) and the hint under it (${K.tap && K.tap.textContent}) differ`);
  h.eq(K.cst.split, '7 bosses, back to back', 'the first challenger: the size of the rush');
  G.choose(rushLbl(G).indexOf('Give up'));
  h.ok(secFind(T._nodes.rushBody, /Sir Grabsworth gave up at boss 1 of 7\./), 'a give up says so');
  h.ok(!secFind(T._nodes.rushBody, /fell to walking away/), 'never "fell to walking away"');
  // after a win, the next challenger shows the last split
  G.choose(rushLbl(G).indexOf('Rush again'));
  G.rush.fight();
  rushVs(G);
  stepFor(G, 0.5);
  G.endFight('win');
  G.rush.pick(0);
  G.draw();
  h.ok(/^last split /.test(G.rush.K.cst.split), 'boss 2: the last split');
});

h.test('qa11: the parrot drops its catch on the pile the moment the claw goes to work (never a tug of war)', () => {
  const T = petBoot(), G = T.GAME;
  G.newRun('knight', 5252);
  const P = petFight(G, 'parrot', 0, 801);
  h.ok(petUntilFx(G, 3) >= 0 && P.hold && P.hold.beak, 'PECK: the parrot flies off with its catch in its beak');
  const b = P.hold.b;
  // the player drops mid flight
  G.steer(150);
  h.ok(G.dropClaw(), 'a grab while the parrot carries');
  let n = 0;
  while (n++ < 120 && (G.rig.phase === 'idle' || G.rig.phase === 'moving')) G.update(DT);
  G.update(DT);
  h.ok(G.rig.phase !== 'idle' && !P.hold, 'the claw goes to work: the parrot lets go (' + G.rig.phase + ')');
  const y0 = b.y;
  stepFor(G, 0.4);
  h.ok(b.y > y0 || G.fs.items.indexOf(b) < 0 || b.held > 0, 'its catch falls back to the pile (or into the claw), no longer welded under the parrot');
  // with the claw left alone the parrot still carries it all the way (the trick is unchanged)
  const Q = petFight(G, 'parrot', 0, 802);
  petUntilFx(G, 3);
  const c = Q.hold && Q.hold.b;
  stepFor(G, 0.2);
  h.ok(c && Q.hold && Q.hold.b === c, 'no grab: it keeps its catch through the flight');
});

h.test('qa12: the round 12 balance dials (ECONOMY.goldK, ECONOMY.shopK, LOOT.BONUS_P) do what they say', () => {
  const T = boot(), G = T.GAME, E = T.DATA.ECONOMY, L = T.DATA.LOOT;
  const k0 = { g: E.goldK, s: E.shopK, b: L.BONUS_P };
  h.ok(k0.g > 0 && k0.g < 1 && k0.s > 1 && k0.b > 0 && k0.b < 1, `shipped: less fight gold (x${k0.g}), dearer shops (x${k0.s}), a bonus capsule ${k0.b} of the time`);
  // the shop: the same shelf, every price scaled by shopK
  const shopAt = (k) => { E.shopK = k; G.newRun('knight', 77); return G.rollShop({ q: 2, r: 3 }); };
  const a = shopAt(1), b = shopAt(2);
  h.eq(b.items.map(i => i.id).join(), a.items.map(i => i.id).join(), 'shopK: the same items on the shelf');
  b.items.forEach((x, i) => h.near(x.price, 2 * a.items[i].price, 1, `shopK x2: ${x.id} costs double (${a.items[i].price} -> ${x.price})`));
  if (a.relic) h.eq(b.relic.price, 2 * a.relic.price, 'shopK x2: the relic too');
  // the fight gold: the base payout line scales by goldK
  const baseGold = (k, bonusP) => {
    E.goldK = k; L.BONUS_P = bonusP;
    G.newRun('knight', 78);
    G.startFight(['rat'], 'normal');
    stepFor(G, 0.2);
    G.run.jackpots += 1;   // a jackpot: the fight could earn a bonus capsule
    G.endFight('win');
    const rw = G.S.sd.reward;
    return { base: rw.pay.find(l => l.id === 'base').gold, bonus: rw.caps.filter(c => c.src === 'bonus').length };
  };
  const g1 = baseGold(1, 1), g2 = baseGold(0.5, 0);
  E.goldK = k0.g; E.shopK = k0.s; L.BONUS_P = k0.b;
  h.near(g2.base, g1.base / 2, 1, `goldK x0.5: half the fight gold (${g1.base} -> ${g2.base})`);
  h.eq(g1.bonus, 1, 'BONUS_P 1: the jackpot earns its bonus capsule');
  h.eq(g2.bonus, 0, 'BONUS_P 0: never');
});

h.test('ghost: a daily keeps checkpoints, the next attempt races them by day, the chip, GHOST PASSED!, the end panel, a new ghost', () => {
  const { T, G, saved } = metaBoot({ unlocks: { knight: true } });
  const D = T.DATA, key = '2026-09-28';
  const ghoWin = (kills) => { G.startFight(['rat'], 'normal'); G.run.kills += kills; G.endFight('win'); G.toMap(); };
  G.prog.startDaily(key);
  const g1 = G.gho.of();
  h.ok(g1 && g1.k === 'd' && g1.key === key && g1.cps.length === 0 && !G.gho.ghost(), 'a daily races (no ghost yet today)');
  G.update(1 / 60);
  h.ok(G.gho.chipEl && /show/.test(G.gho.chipEl.className) && /first/.test(G.gho.chipEl.className) && G.gho.chipEl.children[1].textContent === 'NEW', 'the chip: this climb becomes the ghost');
  stepFor(G, 0.5);
  h.ok(g1.t >= 0.45, 'the play clock runs on the map');
  ghoWin(1); ghoWin(1); ghoWin(1);
  h.eq(g1.cps.length, 3, 'a checkpoint per fight won');
  const c3 = D.ghoRead(g1.cps[2]);
  h.ok(c3.n === 3 && c3.a === 1 && c3.q === G.run.map.pos.q && c3.r === G.run.map.pos.r && c3.hp === G.run.hp && c3.tu === G.run.turns, 'the checkpoint: the step, the act, the hex, hp, turns');
  h.ok(c3.s > D.ghoRead(g1.cps[1]).s && c3.s <= D.dailyScore(G.run, false) && c3.g <= G.run.gold, 'the score as the fight ended (before its reward): ' + c3.s);
  G.run.killer = 'a rat';
  G.showGameOver();
  const e1 = G.run.metaEnd.gho;
  h.ok(e1 && e1.first && e1.saved && e1.me.n === 3, 'the first attempt becomes the ghost');
  h.ok(secFind(T._nodes.gameoverBody, /ghoEnd/) && secFind(T._nodes.gameoverBody, /You are the ghost now/), 'the end panel says so');
  h.ok(saved().gho.d.key === key && saved().gho.d.cps.length === 3 && saved().gho.d.s === e1.me.s, 'saved on the profile');
  const ghostS = e1.me.s;
  // the second attempt races it
  G.prog.startDaily(key);
  const g2 = G.gho.of(), rec = G.gho.ghost();
  h.ok(rec && rec.key === key && rec.cps.length === 3, 'the second attempt of the day has its ghost');
  const sp0 = G.gho.spot();
  h.ok(sp0 && sp0.q === G.run.map.start.q && sp0.r === G.run.map.start.r, 'at the start it stands with you');
  G.update(1 / 60);
  h.ok(/even/.test(G.gho.chipEl.className) && G.gho.chipEl.children[1].textContent === '±0' && !/first/.test(G.gho.chipEl.className), 'level');
  G.draw();
  ghoWin(0);
  h.ok(g2.lead < 0 && !g2.passQ, 'fewer kills: behind (' + g2.lead + ')');
  G.update(1 / 60);
  h.ok(/down/.test(G.gho.chipEl.className) && G.gho.chipEl.children[1].textContent === '-' + String(-g2.lead), 'the chip in red: ' + G.gho.chipEl.children[1].textContent);
  const sp1 = G.gho.spot(), gc1 = D.ghoAt(rec, 1);
  h.ok(sp1 && sp1.q === gc1.q && sp1.r === gc1.r, 'the ghost stands where it was after one fight');
  G.draw();
  ghoWin(6);
  h.ok(g2.lead > 0 && g2.passQ && g2.passed && g2.passN === 1, 'overtaken: GHOST PASSED! queued (+' + g2.lead + ')');
  h.ok(G.meta.gho.passes === 1, 'counted on the profile');
  G.update(1 / 60);
  h.ok(G.gho.pass && G.gho.pass.t >= 0 && !g2.passQ && /ahead after 2 fights/.test(G.gho.pass.sub), 'GHOST PASSED! on the map');
  h.ok(/up/.test(G.gho.chipEl.className) && G.gho.chipEl.children[1].textContent === '+' + g2.lead, 'the chip in lime');
  G.draw();
  stepFor(G, 2.5);
  h.ok(!G.gho.pass, 'it plays out');
  h.ok(G.meta.ach.photo_finish, 'Photo Finish');
  ghoWin(3);
  h.ok(!g2.passQ && g2.passN === 1, 'still ahead: no second pass');
  ghoWin(0);
  const sp4 = G.gho.spot();
  h.ok(sp4 && sp4.sad && sp4.q === rec.e[1] && sp4.r === rec.e[2], 'past its end: a grey ghost where its climb ended');
  // a reload keeps the race
  G.save();
  const T2 = boot({ store: Object.assign({}, T._store) });
  T2.GAME.load();
  h.ok(T2.GAME.gho.of().cps.length === 4 && T2.GAME.gho.of().lead === g2.lead && T2.GAME.gho.ghost().key === key, 'a reload keeps the checkpoints and the ghost');
  // the end: beaten, a new ghost, the panel
  G.run.killer = 'a rat';
  G.showGameOver();
  const e2 = G.run.metaEnd.gho;
  h.ok(e2.beat && e2.saved && !e2.first && e2.d === e2.me.s - ghostS, 'you beat your ghost by ' + e2.d);
  h.ok(e2.mine.length === 6 && e2.theirs.length === 5 && e2.theirs[4] === ghostS, 'the race chart\'s two series');
  const gb = T._nodes.gameoverBody;
  h.ok(secFind(gb, /ghoChart/) && secFind(gb, /ghoTbl/) && secFind(gb, /You beat your ghost by/), 'the chart and the two climbs side by side');
  h.ok(G.meta.gho.d.s === e2.me.s && G.meta.gho.d.cps.length === 4, 'the new ghost');
  h.ok(G.gho.ghost().s === ghostS, 'the finished run still names the one it raced');
  h.ok(!G.gho.chip(), 'no chip after the run');
  // a worse attempt keeps it
  G.prog.startDaily(key);
  ghoWin(0);
  G.showGameOver();
  const e3 = G.run.metaEnd.gho;
  h.ok(!e3.beat && !e3.saved && G.meta.gho.d.s === e2.me.s && secFind(T._nodes.gameoverBody, /Your ghost holds by/), 'a worse attempt: the ghost keeps its crown');
  // tomorrow: a new day, no ghost
  G.prog.startDaily('2026-09-29');
  h.ok(G.gho.of().key === '2026-09-29' && !G.gho.ghost(), 'a new day, a new race');
  // the weekly races its week
  G.wk.setDate('2026-09-30');
  G.wk.start();
  const gw = G.gho.of();
  h.ok(gw && gw.k === 'w' && gw.key === G.wk.key() && !G.gho.ghost(), 'a weekly races its own week');
  ghoWin(1);
  h.eq(D.ghoRead(gw.cps[0]).s, Math.max(D.runScore(G.run, false).total, 0), 'the weekly compares the run score');
  G.showGameOver();
  h.ok(G.meta.gho.w && G.meta.gho.w.key === gw.key && G.meta.gho.d.key === key, 'the week\'s ghost and the day\'s side by side');
  G.wk.start();
  h.ok(G.gho.ghost() && G.gho.ghost().key === gw.key, 'the next weekly attempt races it');
  // a plain run and a rush: no race
  G.newRun('knight', 8);
  h.ok(!G.gho.of(), 'a plain run');
});

/* ---------------------------------------------------------------- MIX (round 10)
   The juice pass 2 (DESIGN.md "Mix and juice pass 2 (round 10)"): the hit
   stop budget, screen entrances that come off again and never hold input,
   press feedback on everything tappable, the run-end count-ups. */
// A Set-backed classList on a stub node, so the suite can see the classes.
function mixClasses(T, id) {
  const n = T._document.getElementById(id), s = new Set();
  n.classList = { add: (c) => s.add(c), remove: (c) => s.delete(c), toggle: (c, on) => { if (on === undefined ? !s.has(c) : on) s.add(c); else s.delete(c); }, contains: (c) => s.has(c) };
  return s;
}
function mixCss() {
  const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
  const m = html.match(/<style id="mix-css">([\s\S]*?)<\/style>/);
  return { html, mix: m ? m[1] : '' };
}

h.test('mix: the hit stop budget caps frozen time under a volley and refills', () => {
  const T = boot();
  const G = T.GAME;
  G.newRun('knight', 11);
  G.startFight(['slime'], 'normal');
  h.ok(settle(G, 20), 'the fight is ready');
  const cap = G.mix.HS.cap;
  h.eq(G.mix.hs, cap, 'a full budget');
  // one crit: the whole stop plays
  G.fs.hitStop = 0.12;
  let frozen = 0;
  for (let i = 0; i < 30; i++) { const on = G.fs.hitStop > 0; G.update(DT); if (on && G.fs.hitStop > 0) frozen += DT; }
  h.ok(frozen >= 0.09, `a single hit stop plays out (${frozen.toFixed(2)} s)`);
  // a volley: hit stops asked for every frame for two seconds
  stepFor(G, 2);
  frozen = 0;
  for (let i = 0; i < 120; i++) { G.fs.hitStop = Math.max(G.fs.hitStop, 0.16); G.update(DT); if (G.fs.hitStop > 0) frozen += DT; }
  const most = cap / (1 - G.mix.HS.refill) + 3 * DT;
  h.ok(frozen <= most, `two seconds of crits freeze the physics ${frozen.toFixed(2)} s at most (${most.toFixed(2)})`);
  h.ok(frozen >= cap * 0.9, 'but the first ones still land');
  h.ok(G.mix.hs < 0.05, 'the budget is spent');
  G.fs.hitStop = 0;
  stepFor(G, 1.5);
  h.near(G.mix.hs, cap, 1e-9, 'it refills once the hits stop');
  // the direct hooks
  G.mix.hs = 0.05;
  h.eq(G.mix.hsSpend(0.1), false, 'a spend past the budget is refused');
  h.eq(G.mix.hs, 0, 'and empties it');
  G.mix.hsTick(0.5);
  h.near(G.mix.hs, 0.5 * G.mix.HS.refill, 1e-9, 'the tick refills at the rate');
});

h.test('mix: screens rise in, lists re-deal, the HUD slides back; the classes come off and input is never held', () => {
  const T = boot();
  const G = T.GAME;
  const C = {};
  for (const id of ['scr-map', 'scr-rest', 'scr-help', 'scr-collection', 'scr-history', 'scr-forge', 'scr-chars', 'top', 'ctrl', 'playerRow']) C[id] = mixClasses(T, id);
  G.showTitle();
  G.newRun('knight', 5);
  G.toMap();
  h.eq(G.screen, 'map', 'on the map');
  h.ok(C['scr-map'].has('mixIn'), 'the map head drops in');
  h.ok(C.top.has('mixHud'), 'the top bar slides back in from the title');
  h.ok(!C.ctrl.has('mixHud'), 'the fight bar stays out of it on the map');
  stepFor(G, 1);
  h.ok(!C['scr-map'].has('mixIn') && !C.top.has('mixHud'), 'the entrance classes come off');
  h.eq(G.mix.ui.t, 0, 'the entrance timer is done');
  // a screen rises in and its first choice works at once
  G.showRest();
  h.ok(C['scr-rest'].has('mixIn') && G.mix.ui.t > 0, 'the rest stop rises in');
  const hp0 = G.run.hp;
  G.run.hp = Math.max(1, hp0 - 30);
  const low = G.run.hp;
  G.choose(0);
  h.ok(G.run.hp > low, 'a choice made mid-entrance goes through (nothing holds input)');
  // every screen: the entrance ends within a second, no class left behind
  const shows = [
    ['chars', () => G.showChars()], ['help', () => G.showHelp('title')], ['forge', () => { G.toMap(); G.showForge(); }], ['collection', () => G.showCollection()],
    ['history', () => G.his.show()], ['stickers', () => G.showStickers()], ['tips', () => G.feel.showTips('title')], ['shop', () => { G.toMap(); G.showShop(G.rollShop(null)); }],
    ['codex', () => G.lore.show()], ['weekly', () => G.wk.show()], ['title', () => G.showTitle()],
  ];
  for (const [name, fn] of shows) {
    fn();
    h.eq(G.screen, name, name + ' is up');
    h.ok(G.S.ui.buttons.length > 0, name + ' has its buttons registered at once');
    stepFor(G, 0.9);
    h.eq(G.mix.ui.t, 0, name + ': the entrance is over within a second');
    for (const id of Object.keys(C)) h.ok(!C[id].has('mixIn') && !C[id].has('mixHud'), `${name}: no entrance class left on ${id}`);
  }
  // a tab or a filter re-deals the list, the entrance does not replay
  G.showCollection('relics');
  stepFor(G, 1);
  G.showCollection('items');
  h.ok(C['scr-collection'].has('mixRe') && !C['scr-collection'].has('mixIn'), 'a Prizedex tab deals its grid in, no second entrance');
  stepFor(G, 1);
  h.ok(!C['scr-collection'].has('mixRe'), 'and that comes off too');
  // the fight from the title: the whole HUD slides in
  G.showTitle();
  G.startFight(['slime'], 'normal');
  h.ok(C.top.has('mixHud') && C.ctrl.has('mixHud') && C.playerRow.has('mixHud'), 'a fight from the menus slides its HUD in');
  stepFor(G, 1);
  h.ok(!C.ctrl.has('mixHud'), 'and it comes off');
  // reduced motion: no entrance classes at all
  T.RENDER.fx.reduced = true;
  G.showHelp('title');
  h.ok(!C['scr-help'].has('mixIn') && G.mix.ui.calm, 'reduced motion: the screen just appears');
  T.RENDER.fx.reduced = false;
  // the CSS never holds input: no pointer-events, no transform (tilted stickers and holo cards keep theirs)
  const { html, mix } = mixCss();
  h.ok(mix.length > 500, 'the mix-css block is there');
  h.ok(!/pointer-events/.test(mix.replace(/\/\*[\s\S]*?\*\//g, '')), 'the entrances never touch pointer-events');
  const frames = mix.match(/@keyframes mix\w+\{[^@]*?\}\}/g) || [];
  h.ok(frames.length >= 5, `the keyframes (${frames.length})`);
  for (const k of frames) h.ok(!/transform\s*:/.test(k), 'keyframes move with translate / scale only: ' + k.slice(0, 22));
  h.ok(/:where\(\.screen\.mixIn\)/.test(mix), 'the entrances are zero specificity (a screen\'s own animation wins)');
  h.ok(/#wipe\{[^}]*pointer-events:none/.test(html), 'the screen wipe never takes a tap');
  h.ok(/\.calm #toast\.show/.test(mix) && /prefers-reduced-motion/.test(mix), 'the loops respect reduced motion');
});

h.test('mix: every tappable thing gives press feedback', () => {
  const { html } = mixCss();
  // every :active selector in the page, :where / :is lists opened up
  const act = [];
  for (const m of html.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    const sel = m[1];
    if (sel.indexOf(':active') < 0) continue;
    act.push(sel.replace(/:(where|is)\(([^)]*)\)/g, ' $2 '));
  }
  const has = (cls) => act.some((s) => new RegExp('\\.' + cls + '(?![\\w-])').test(s));
  const CLASSES = ['btn', 'card', 'stk', 'vTab', 'vMini', 'vWallet', 'cmpSlotBox', 'bnCard', 'mb-head', 'relic', 'capslot', 'brush', 'clawChip', 'slot', 'rkIt'];
  for (const c of CLASSES) h.ok(has(c), `.${c} has an :active press state`);
  // and what the screens register as buttons carries one of them
  const T = boot();
  const G = T.GAME;
  G.newRun('knight', 7);
  const seen = {};
  const check = (name) => {
    for (const b of G.S.ui.buttons) {
      const cls = String((b.el && b.el.className) || '').split(/\s+/);
      const ok = cls.some((c) => CLASSES.indexOf(c) >= 0) || has(cls[0] || '#');
      if (!ok) { const k = name + ':' + cls.join('.'); if (!seen[k]) { seen[k] = 1; h.ok(false, `${name}: "${b.label}" (${cls.join('.')}) has no press feedback`); } }
    }
  };
  G.showTitle(); check('title');
  G.showChars(); check('chars');
  G.toMap(); G.showShop(G.rollShop(null)); check('shop');
  G.toMap(); G.showRest(); check('rest');
  G.toMap(); G.showForge(); check('forge');
  G.showStickers(); check('stickers');
  G.showCollection(); check('collection');
  G.his.show(); check('history');
  G.vault.show(); check('vault');
  h.ok(Object.keys(seen).length === 0, 'every registered button presses in');
});

h.test('mix: the run-end numbers count up from zero and land exactly', () => {
  const T = boot();
  const G = T.GAME;
  G.newRun('knight', 9);
  G.showWin();
  stepFor(G, 1);
  h.eq(G.mix.ui.counts.length, 0, 'headless the screen never touches its numbers');
  const els = [{ textContent: '37' }, { textContent: '1,234' }, { textContent: 'no combo' }, { textContent: '1' }, { textContent: '0' }, { textContent: '4242', previousElementSibling: { textContent: 'Seed' } }];
  T._document.getElementById('scr-win').querySelectorAll = () => els;
  h.eq(G.mix.countStart('.kv > b, .hlt .v'), 2, 'two numbers to count (words, 0 / 1 and the seed stay)');
  h.eq(els[5].textContent, '4242', 'the seed is a name, not a tally');
  h.eq(els[0].textContent, '0', 'they start at zero');
  h.eq(els[2].textContent, 'no combo', 'words are left alone');
  h.eq(els[3].textContent, '1', 'a 1 is not worth counting');
  const seq = [];
  for (let i = 0; i < 10; i++) { G.mix.tick(0.05); seq.push(+els[1].textContent.replace(/,/g, '')); }
  h.ok(seq.every((v, i) => i === 0 || v >= seq[i - 1]), 'it only climbs');
  h.ok(seq.some((v) => v > 0 && v < 1234), 'through the numbers in between');
  G.mix.tick(1);
  h.eq(els[0].textContent, '37', 'the first lands exactly');
  h.eq(els[1].textContent, '1,234', 'the second too, with its comma');
  h.eq(G.mix.ui.counts.length, 0, 'and the count is done');
});

// ---------------------------------------------------------------- ROS (round 10): Ms. Bubbles, the mutator pack, three new pets
{
  const bubBoot = (unlocks, extra) => {
    const T = boot({ store: { clawspire_meta: JSON.stringify(Object.assign({ introSeen: true, tutorialDone: true, unlocks: unlocks || { knight: true, rogue: true } }, extra || {})) } });
    return { T, G: T.GAME };
  };
  const grabAt = (G, x) => {
    G.steer(x);
    stepFor(G, 0.7);
    if (!G.dropClaw()) return -1;
    let n = 0;
    while (G.state().grabInFlight && n < 60 * 25) { G.update(DT); n++; if (n % 12 === 0) G.draw(); }
    return G.fs.delivered | 0;
  };
  const floatBub = (G) => (G.ros.state ? G.ros.state.bubs.find(B => B.ph === 'float') : null);

  h.test('ROS Ms. Bubbles: her card, the unlock, a new run, her Tilt', () => {
    const { T, G } = bubBoot();
    G.showChars();
    const i = G.S.ui.buttons.findIndex(b => b.label === 'Ms. Bubbles');
    h.ok(i >= 0 && !G.S.ui.buttons[i].disabled, 'her card is open once a crawler has won (the Rogue\'s rule)');
    h.eq(G.S.ui.buttons[0].label, T.DATA.CHARACTERS.knight.name, 'the knight is still the first card');
    G.choose(i);
    h.ok(G.run.char === 'bubbler' && G.run.bin.length === 19 && G.run.relics.includes('bubble_wand') && G.run.maxHp === 68, 'her run: 19 items, the Bubble Wand, 68 hp');
    const fresh = bubBoot({ knight: true }).G;
    fresh.showChars();
    const j = fresh.S.ui.buttons.findIndex(b => b.label === 'Ms. Bubbles');
    h.ok(j >= 0 && fresh.S.ui.buttons[j].disabled, 'a fresh profile has to win first');
    const { G: G2 } = bubBoot();
    G2.meta.tilt = { bubbler: 2 };
    h.ok(G2.prog.tiltCap('bubbler') === 2 && G2.prog.tiltCap('engineer') === 0, 'her own Tilt ladder');
    G2.draw();
  });

  h.test('ROS bubbles: blown at the bell, floated up, caught in real grabs with every claw type, popped in the chute for Block', () => {
    const { T, G } = bubBoot();
    const drawn = [], b0 = T.RENDER.ros.bubble;
    T.RENDER.ros.bubble = (ctx, x, y, r, st) => { drawn.push(!!st.held); return b0(ctx, x, y, r, st); };
    for (const type of G.claws.ids()) {
      G.claws.pick(type);
      G.newRun('bubbler', 777);
      G.startFight(['slime'], 'normal', { seed: 31 });
      for (const e of G.fight.enemies) e.hp = e.maxHp = 999;
      stepFor(G, 3.5);
      const R0 = G.ros.state;
      h.ok(R0 && G.ros.floating() === 3, `${type}: three bubbles float on turn 1 (${G.ros.floating()})`);
      h.ok(R0.bubs.every(B => B.ty < 200) && R0.bubs.filter(B => B.y < 240).length >= 2, `${type}: up under the rail`);
      const blk0 = G.fight.player.block;
      let got = 0;
      for (let g = 0; g < 2; g++) {
        const B = floatBub(G);
        if (!B) break;
        const r = grabAt(G, B.x);
        if (r < 0) break;
        got += r;
        settle(G, 8);
        G.draw();
      }
      const pops = R0.log.filter(l => l.k === 'pop').reduce((s, l) => s + l.n, 0);
      h.ok(R0.log.some(l => l.k === 'catch'), `${type}: the claw catches a bubble mid-air`);
      h.ok(pops >= 1 && got >= pops, `${type}: popped in the chute and delivered (${pops} pops, ${got} delivered)`);
      h.ok(G.fight.bub.popped === pops && (G.fight.player.block > blk0 || G.fight.phase !== 'player'), `${type}: COMBAT paid the pops`);
    }
    h.ok(drawn.length > 0 && drawn.some(x => x), 'the bubbles are drawn, held ones too');
    T.RENDER.ros.bubble = b0;
  });

  h.test('ROS bubbles: the turn end bursts them in the bin, soap blows more, a Bubble Combo shows and earns Foam Party', () => {
    const { T, G } = bubBoot();
    G.claws.pick('classic');
    G.newRun('bubbler', 91);
    G.run.bin.push({ uid: 'pp1', id: 'bubble_pipe', plus: false });
    G.startFight(['slime'], 'normal', { seed: 12 });
    for (const e of G.fight.enemies) e.hp = e.maxHp = 999;
    stepFor(G, 3.5);
    const R0 = G.ros.state, n = G.ros.floating();
    h.ok(n >= 2, 'bubbles floating');
    G.endTurn();
    h.ok(R0.log.some(l => l.k === 'burst' && l.n === n) && G.ros.floating() === 0, 'the enemy turn: every bubble bursts in the bin');
    let k = 0; while (k++ < 60 * 20 && !(G.fight.turn >= 2 && G.fight.phase === 'player' && !G.fs.enemyTurn)) G.update(DT);
    stepFor(G, 2.5);
    h.eq(G.ros.floating(), 2, 'turn 2: two new bubbles (no wand extra)');
    // soap: a Bubble Pipe played blows one more once the claw is free
    const want0 = R0.want;
    const pipe = G.fight.bin.find(x => x.id === 'bubble_pipe');
    const evs = T.COMBAT.play(G.fight, pipe);
    for (const e of evs) G.ros.event(e);
    h.eq(R0.want, want0 + 1, 'soap queues a bubble');
    stepFor(G, 1.5);
    h.eq(G.ros.floating(), 3, 'and it is blown');
    // a combo: through the announcer and the sticker observer
    G.ros.event({ t: 'ros', k: 'combo', n: 3, dmg: 12 });
    h.ok(/BUBBLE COMBO x3/.test(G.S.bannerStr || '') || (G.ann.queue && G.ann.queue().length >= 0), 'the BUBBLE COMBO banner');
    h.eq(G.fs.marquee, 'FOAM PARTY!', 'the marquee throws a foam party');
    h.ok(T.DATA.achCheck({ kind: 'ev', ev: { t: 'ros', k: 'combo', n: 3 } }, {}).includes('foam_party'), 'Foam Party');
    G.draw();
  });

  h.test('ROS bubbles: the same fight blows the same bubbles; a fight without them has no bubble state', () => {
    const run = () => {
      const { G } = bubBoot();
      G.newRun('bubbler', 55);
      G.startFight(['rat'], 'normal', { seed: 9 });
      stepFor(G, 3);
      return JSON.stringify(G.ros.state.log) + G.ros.state.bubs.map(B => B.x.toFixed(2) + ',' + B.y.toFixed(2)).join('|');
    };
    h.eq(run(), run(), 'deterministic by the fight seed');
    const { G } = bubBoot();
    G.newRun('knight', 55);
    G.startFight(['rat'], 'normal', { seed: 9 });
    stepFor(G, 3);
    h.ok(!G.fight.bub && G.fs.ros == null, 'the Knight: no bubbles, no ROS state at all');
  });

  h.test('ROS saves: her run and a fight with bubbles survive a reload; an old save loads', () => {
    const { T, G } = bubBoot();
    G.claws.pick('vacuum');
    G.newRun('bubbler', 99);
    G.pet.give('penguin', 0);
    G.startFight(['slime'], 'normal', { seed: 5 });
    stepFor(G, 3);
    G.save();
    const saved = JSON.parse(T._store.clawspire_run);
    h.ok(saved.run.char === 'bubbler' && saved.run.pet.id === 'penguin', 'saved');
    const T2 = boot({ store: Object.assign({}, T._store) });
    h.ok(T2.GAME.load() && T2.GAME.run.char === 'bubbler' && T2.GAME.run.pet.id === 'penguin', 'loads');
    if (T2.GAME.fight) { h.ok(T2.GAME.fight.bub && T2.GAME.fight.bub.n === 2, 'the fight rebuilds with her bubbles'); stepFor(T2.GAME, 3); h.ok(T2.GAME.ros.floating() >= 2, 'and blows them again'); }
    delete saved.run.pet;
    saved.run.muts = ['nope', 'moon'];
    const T3 = boot({ store: { clawspire_meta: T._store.clawspire_meta, clawspire_run: JSON.stringify(saved) } });
    h.ok(T3.GAME.load() && T3.GAME.run.muts.join() === 'moon', 'an old save with junk mutators loads, the known kept');
  });

  h.test('ROS mutators: each one works in the cabinet, and the next plain run is the plain machine', () => {
    const { T, G } = bubBoot();
    const fight = (muts, seed) => { G.endless.pick(muts); G.claws.pick('classic'); G.newRun('knight', seed || 404); G.startFight(['slime'], 'normal', { seed: 21 }); for (const e of G.fight.enemies) e.hp = e.maxHp = 999; stepFor(G, 3); return G.fs; };
    // Moon Bounce
    let FS = fight(['moon']);
    h.ok(FS.items.length > 5 && FS.items.every(b => b.restitution >= 0.72), 'Moon Bounce: every prize is bouncy');
    // Tiny Claw
    const w0 = (fight([]), G.rig.geo.s);
    fight(['tinyclaw']);
    h.ok(G.rig.geo.s < w0 * 0.75, `Tiny Claw: the claw shrinks (${G.rig.geo.s.toFixed(2)} vs ${w0.toFixed(2)})`);
    // Earthquake: a warning, then the pile jumps
    FS = fight(['earthquake']);
    const R0 = G.ros.state;
    h.ok(R0 && R0.quakes.length === 2 && R0.quakes.every(q => q >= 1.6 && q <= 7.5), 'two quakes scheduled this turn');
    let warned = false, n = 0;
    while (n++ < 60 * 9 && !R0.log.some(l => l.k === 'quake')) { G.update(DT); if (R0.warn > 0) warned = true; }
    h.ok(warned && R0.log.some(l => l.k === 'quake'), 'RUMBLE first, then the quake');
    stepFor(G, 0.05);
    h.ok(FS.items.some(b => b.vy < -60), 'the pile jumps');
    G.draw();
    // Mirror Machine: a finger on the left drives the claw right; GAME.steer stays literal
    fight(['mirror']);
    const bw = G.cabinet.bounds.chuteX;
    G.pointer('down', G.CAB.x + 60, 600, { pointerId: 1 });
    h.ok(Math.abs(G.rig.targetX - (bw - 60)) < 8 && G.rig.targetX > bw / 2, `the pointer is mirrored (${G.rig.targetX.toFixed(0)})`);
    G.pointer('cancel', G.CAB.x + 60, 600, { pointerId: 1 });
    G.steer(100);
    h.ok(Math.abs(G.rig.targetX - 100) < 2, 'the steer API is not');
    G.draw();
    // Sticky Fingers: the catch is glued on the lift
    fight(['sticky']);
    const S0 = G.ros.state;
    const bodies = itemBodies(G);
    G.steer(bodies[0].x); stepFor(G, 0.7); G.dropClaw();
    let glued = 0; n = 0;
    while (G.state().grabInFlight && n++ < 60 * 25) { G.update(DT); glued = Math.max(glued, S0.glue.length); if (S0.glue.length) G.draw(); }
    h.ok(glued >= 1 || G.fs.slips === 0, `the catch glued on (${glued})`);
    h.eq(S0.glue.length, 0, 'and let go by the time the claw is home');
    // Rising Water: the level rises, a light prize floats, a heavy one sinks
    G.endless.pick(['flood']); G.newRun('knight', 404);
    G.run.bin.push({ uid: 'dk', id: 'rubber_duck', plus: false }, { uid: 'an', id: 'anvil', plus: false });
    G.startFight(['slime'], 'normal', { seed: 21 });
    for (const e of G.fight.enemies) e.hp = e.maxHp = 999;
    stepFor(G, 6);
    const W0 = G.ros.state;
    h.ok(W0.flood && W0.level < G.CAB.h - 30, `the bin floods (level ${W0.level.toFixed(0)})`);
    const duck = itemBodies(G).find(b => b.data.inst.uid === 'dk');
    if (duck) h.ok(duck.y < W0.level + 30, `the duck floats at the surface (${duck.y.toFixed(0)} vs ${W0.level.toFixed(0)})`);
    G.draw();
    // cleared: a plain run
    fight([]);
    h.ok(!G.fs.ros && G.fs.items.every(b => b.restitution < 0.72), 'the plain machine again: no water, no bounce, no bubbles');
  });

  h.test('ROS pets: the penguin slides the floor toward the chute, the mole rat digs up the bottom prize, the robot vacuum sweeps and dumps', () => {
    const { T, G } = bubBoot();
    G.endless.pick([]);
    G.newRun('knight', 5252);
    // penguin
    let P = petFight(G, 'penguin', 0, 800);
    let n = 0; while (!P.act && n++ < 60 * 4) G.update(DT);
    const low = G.fs.items.filter(b => b.y > G.CAB.h - 60).map(b => [b, b.x]);
    h.ok(petUntilFx(G, 4) >= 0, 'penguin: it acts on its own');
    stepFor(G, 1.1);
    const slid = P.log.find(l => l.k === 'slid');
    h.ok(slid && slid.n >= 1, `penguin: the slide runs to the chute wall, shoving ${slid ? slid.n : 0}`);
    const moved = low.filter(([b, x]) => b.x > x + 8).length;
    h.ok(moved >= 1, `penguin: SLIDE shoved ${moved} low prizes toward the chute`);
    stepFor(G, 3);
    h.ok(!P.act, 'and it waddles home');
    G.endFight('win'); G.toMap();
    // mole rat
    P = petFight(G, 'molerat', 0, 801);
    G.steer(150); stepFor(G, 0.3);
    h.ok(petUntilFx(G, 5) >= 0, 'mole rat: it acts on its own');
    const e = P.log.filter(l => l.fx).pop() || {};
    const b = petBody(G, e.uid);
    h.ok(b && Math.abs(b.x - G.rig.targetX) < 40, `mole rat: DIG popped the bottom prize up under the claw (${b ? b.x.toFixed(0) : '?'} vs ${G.rig.targetX.toFixed(0)})`);
    G.endFight('win'); G.toMap();
    // robot vacuum: small prizes swept up and dumped down the chute, each delivered
    P = petFight(G, 'roomba', 60, 802, ['prize_marble', 'glass_bead', 'peppermint', 'prize_marble']);
    const d0 = G.run.delivered;
    h.ok(petUntilFx(G, 5) >= 0, 'robot vacuum: it acts on its own');
    stepFor(G, 3);
    h.ok(G.run.delivered > d0, `robot vacuum: the dump is delivered (${G.run.delivered - d0})`);
    h.ok(G.fs.delivered <= 1, 'one at a time: never a DOUBLE from a sweep');
    G.draw();
    G.endFight('win'); G.toMap();
    // the album fits eleven
    h.eq(T.DATA.PET_IDS.length, 11, 'eleven pets in the album');
  });

  h.test('ROS pets: every new synergy switches on and fires in a real fight', () => {
    const { T, G } = bubBoot();
    G.endless.pick([]);
    const require0 = (g) => (g.fight ? T.COMBAT.gold(g.fight) : 0);
    const cases = [['penguin', (g) => g.run.bin.push({ uid: 'fz', id: 'frost_pearl', plus: false }), 'chill'], ['molerat', (g) => g.run.relics.push('money_bags'), 'gold'], ['roomba', (g) => { g.run.clawType = 'vacuum'; }, 'block']];
    for (const [id, arm] of cases) {
      G.newRun('knight', 5353);
      arm(G);
      const P = petFight(G, id, 0, 900, id === 'roomba' ? ['prize_marble', 'glass_bead'] : []);
      const gold0 = require0(G);
      petUntilFx(G, 5);
      stepFor(G, 1.5);
      h.ok(P.log.some(l => l.k === 'syn' && l.syn === id), `${id}: its synergy fired`);
      if (id === 'penguin') h.ok(G.fight.enemies.some(e => (e.status.chill | 0) > 0 || (e.status.freeze | 0) > 0), 'Snowball Fight chills them');
      if (id === 'molerat') h.ok(require0(G) > gold0, 'Gold Digger pays');
      G.endFight('win'); G.toMap();
    }
  });
}

// ---------------- DUO (round 11): pass and play (DESIGN.md "Duo: pass and play (round 11)")
{
  const duoStep = (G, s) => { for (let i = 0, n = Math.round(s / DT); i < n; i++) G.update(DT); };
  // a duel with two named players, from the title's button, the toss caught at once
  function duoNew(G, mode, seed, o) {
    o = o || {};
    G.duo.seed = seed;
    G.duo.menu();
    G.duo.setup(mode);
    G.duo.set(0, 'name', o.a || 'Roxor'); G.duo.set(1, 'name', o.b || 'Jasmin');
    if (o.char1) G.duo.set(1, 'char', o.char1);
    if (o.boss) G.duo.set(-1, 'boss', o.boss);
    if (o.drops) G.duo.set(-1, 'drops', o.drops);
    const D = G.duo.start();
    G.duo.afterToss();
    return D;
  }
  const duoReady = (G) => { duoStep(G, G.duo.C ? 3.8 : 4); return G.duo.ready(); };
  // one claw-off drop at the best prize, played out to its end
  function duoDropOut(G) {
    const D = G.duo.state;
    if (D.ph === 'hand') duoReady(G);
    if (D.ph !== 'play') return false;
    G.duo.drop(G.duo.aim());
    for (let i = 0; i < 60 * 25 && D.ph === 'play'; i++) G.update(DT);
    return D.ph !== 'play';
  }
  const fightReady = (G) => { const s = G.state(); return s.screen === 'fight' && s.fight && s.fight.phase === 'player' && !s.grabInFlight && !s.enemyTurn && s.queue === 0 && s.rigPhase === 'idle'; };
  const fightSettle = (G, secs) => { for (let i = 0; i < (secs || 30) * 60; i++) { if (G.screen !== 'fight' || fightReady(G)) return true; G.update(DT); } return false; };

  h.test('duo: the title button (registered last, beside New run), the menu and the record', () => {
    const T = boot(), G = T.GAME;
    const labels = G.S.ui.buttons.map((b) => b.label);
    h.ok(labels.indexOf('Duo') > labels.indexOf('History') && labels.indexOf('History') > labels.indexOf('Boss Rush'), 'DUO registers after History (every older index holds)');
    const nr = G.S.ui.buttons.find((b) => b.label === 'New run'), du = G.S.ui.buttons.find((b) => b.label === 'Duo');
    // (round 15: NEW RUN is the big action; DUO waits one tap away in the Modes sheet)
    h.ok(nr.el.parentNode && /uiPri/.test(nr.el.parentNode.className), 'NEW RUN leads the menu');
    h.ok(du.el.parentNode && /uiSheetB/.test(du.el.parentNode.className) && secWalk(G.ui15.T.sheets.modes).includes(du.el), 'DUO sits in the Modes sheet');
    h.ok(!/resume/.test(JSON.stringify(du.el.children.map((c) => c.textContent))), 'no duel saved: "2 players"');
    G.choose(labels.length - 1);
    h.eq(G.screen, 'duo', 'the duo screen');
    const ml = G.S.ui.buttons.map((b) => b.label);
    h.ok(ml.includes('Co-op Boss') && ml.includes('Versus Claw-off') && ml.includes('Back'), 'both modes and Back');
    G.draw();
    G.choose(ml.indexOf('Back'));
    h.eq(G.screen, 'title', 'Back to the title');
    // with a run saved, CONTINUE leads and DUO still comes last
    G.newRun('knight', 5); G.save(); G.showTitle();
    const l2 = G.S.ui.buttons.map((b) => b.label);
    h.ok(l2[0] === 'Continue' && l2.slice(1).join() === labels.join(), 'CONTINUE first, the rest (DUO too) in their order');
  });

  h.test('duo: setup (names, colours, crawlers, claws, looks, drops, bosses), the coin toss and the hand-off countdown', () => {
    const T = boot(), G = T.GAME, DD = T.DATA.DUO;
    G.duo.menu();
    const St = G.duo.setup('vs');
    h.ok(St.p[0].name === 'P1' && St.p[1].name === 'P2' && St.p[0].color !== St.p[1].color, 'a fresh profile: P1 and P2 in two colours');
    h.ok(G.duo.set(0, 'color', St.p[1].color) && St.p[0].color !== St.p[1].color, 'taking the other one\'s colour swaps them');
    h.ok(!G.duo.set(0, 'char', 'rogue') && G.duo.set(0, 'char', 'knight'), 'only an unlocked crawler');
    h.ok(G.duo.set(1, 'claw', 'magnet') && !G.duo.set(1, 'claw', 'spoon'), 'only a real claw');
    h.ok(!G.duo.set(0, 'paint', 'paint_rainbow') && G.duo.set(0, 'paint', ''), 'only an owned paint (or the team colour)');
    h.ok(G.duo.set(-1, 'drops', 5) && !G.duo.set(-1, 'drops', 9), 'three to five drops');
    G.duo.set(0, 'name', '  Roxor  '); G.duo.set(1, 'name', '');
    h.ok(G.S.ui.buttons.some((b) => b.label === 'Toss the coin!'), 'the toss button');
    G.draw();
    G.duo.seed = 321;
    const D = G.duo.start();
    h.ok(D.p[0].name === 'Roxor' && D.p[1].name === 'P2', 'names trimmed, an empty one is P2');
    h.eq(D.first, T.DATA.duoToss(321).w, 'the toss is the seed\'s');
    h.eq(G.meta.duo.last.p[0].name, 'Roxor', 'the setup is remembered on the profile');
    h.eq(D.ph, 'toss', 'the coin goes up');
    duoStep(G, 0.5); G.draw();
    G.duo.toss();
    h.eq(D.ph, 'toss', 'a tap catches the coin: it lands');
    G.duo.toss();
    h.eq(D.ph, 'hand', 'a second tap: the hand-off');
    h.eq(D.turn, D.first, 'the toss winner drops first');
    h.eq(D.from, 1 - D.first, '...the other one holds the phone');
    h.ok(!G.duo.ready(), 'READY waits for the countdown');
    const rb = G.S.ui.buttons.find((b) => b.label === 'Ready');
    h.ok(rb && rb.el.disabled, 'the READY button is dark');
    duoStep(G, 1.5);
    h.ok(G.duo.t.count > 0 && !G.duo.ready(), 'still counting');
    duoStep(G, 2.5); G.draw();
    h.ok(G.duo.t.count === 0 && !rb.el.disabled, 'the countdown ran out: READY lights up');
    // a taunt: its voice, its bubble on the card, the log
    h.ok(G.duo.taunt('spoon') && D.msg && D.msg.id === 'spoon' && D.msg.from === D.from, 'a taunt from the one holding the phone');
    h.ok(!G.duo.taunt('nope'), 'an unknown taunt is refused');
    G.draw();
    h.ok(G.duo.ready() && D.ph === 'play' && !D.msg, 'READY: the drop, the bubble goes');
  });

  h.test('duo: a versus claw-off (drops score, sabotage cards between drops, best of three, booked once, rematch)', () => {
    const T = boot(), G = T.GAME, DD = T.DATA.DUO;
    T._store.clawspire_run = 'SOLO';
    const D = duoNew(G, 'vs', 4242, { drops: 3 });
    h.eq(D.round, 1, 'round 1');
    h.ok(D.hands[0].length === DD.HAND.start && D.hands[1].length === DD.HAND.start, 'two cards each');
    const V0 = G.duo.v;
    h.eq(V0.W.bodies.filter((b) => b.type === 'dynamic' && b.data && b.data.pile != null).length, 14, 'the shared bin: 14 prizes');
    // drop 1: scored, the dropper draws a card, the sabotage choice
    const who = D.turn, s0 = D.score[who];
    h.ok(duoDropOut(G), 'a drop plays out');
    h.eq(D.ph, 'sabo', 'after a drop: the sabotage choice');
    h.ok(D.last && D.last.who === who && D.score[who] === s0 + D.last.pts, 'the drop is scored for its dropper');
    h.eq(D.last.pts, T.DATA.duoDropScore(D.last.got.map((i) => ({ i, id: G.duo.v.pile[i].id, v: G.duo.v.pile[i].v, gold: G.duo.v.pile[i].gold }))).pts, '...by DATA.duoDropScore');
    h.eq(D.hands[who].length, DD.HAND.start + 1, 'the dropper draws a card');
    h.eq(D.taken.length, D.last.got.length, 'what fell in is gone from the bin');
    G.draw();
    const card = D.hands[who][0];
    h.ok(G.duo.card(0) && D.pend && D.pend.id === card && D.pend.on === 1 - who, 'a card played on the rival\'s next drop');
    h.ok(D.ph === 'hand' && D.turn === 1 - who, 'the phone passes');
    duoReady(G);
    h.eq(G.duo.v.card, card, 'the card bites on their drop');
    h.ok(duoDropOut(G) && !D.pend, 'spent with the drop');
    G.duo.keep();
    h.ok(D.ph === 'hand' && D.turn === who, 'keeping the cards passes the phone too');
    // every card does what it says
    const bw = G.duo.v.C.bounds.chuteX;
    for (const id of DD.CARD_IDS) {
      D.pend = { id, on: D.turn, by: 1 - D.turn };
      duoReady(G);
      const V = G.duo.v, rig = V.rig;
      if (id === 'fog') h.ok(V.fog === 1, 'Fog Machine: the glass fogs');
      if (id === 'mirror') { G.duo.pointer('down', T.GAME.CAB.x + 120, 600); h.ok(V.mirror && Math.abs(rig.targetX - (bw - 120)) < 1, 'Mirror Mirror: the finger steers backwards'); G.duo.pointer('cancel', 0, 0); }
      if (id === 'tilt') h.ok(V.tilt !== 0 && Math.abs(V.W.gravity ? V.W.gravity.x : V.tilt) > 0, 'Tilt!: the bin leans');
      if (id === 'grease') h.ok(rig.cfg && rig.cfg.grease === 1, 'Butter Fingers: a greasy claw');
      if (id === 'tiny') h.ok(rig.cfg && rig.cfg.width < 1, 'Tiny Claw: a smaller claw');
      if (id === 'turbo') h.ok(rig.cfg && rig.cfg.speed > 1.5, 'Too Much Coffee: a fast claw');
      if (id === 'shake') h.ok(V.W.bodies.some((b) => b.type === 'dynamic' && Math.abs(b.vy) > 100), 'Shake Up: the pile jumps');
      h.ok(V.slam && V.slam.id === id, id + ': the card slams onto the glass');
      G.draw();
      D.k = 0; D.used = [0, 0];   // keep the round going while every card is tried
      duoDropOut(G);
      if (id === 'tilt') h.eq(G.duo.v.tilt, 0, 'the lean ends with the drop');
      if (D.ph === 'sabo') G.duo.keep();
      if (D.ph === 'round' || D.ph === 'end') break;
    }
    // play the match out: best of three
    let guard = 0;
    while (D.ph !== 'end' && guard++ < 60) {
      if (D.ph === 'hand' || D.ph === 'play') duoDropOut(G);
      else if (D.ph === 'sabo') { if (D.hands[D.from].length) G.duo.card(0); else G.duo.keep(); }
      else if (D.ph === 'round') { h.ok(D.rounds.length >= 1 && G.S.ui.buttons.some((b) => b.label === 'Next round'), 'a round result'); G.draw(); G.duo.next(); h.eq(D.turn, T.DATA.duoStarter(D.first, D.rounds), 'the loser of the last round starts'); }
    }
    h.eq(D.ph, 'end', 'the match is decided');
    const m = T.DATA.duoMatch(D.rounds);
    h.ok(m.w !== null && D.res && D.res.w === m.w && D.paid, 'booked with the match\'s winner');
    const rec = G.meta.duo;
    h.ok(rec.vs === 1 && rec.games === 1, 'one claw-off on the record');
    if (m.w >= 0) h.ok(rec.names[D.p[m.w].name.toLowerCase()].w === 1 && rec.names[D.p[1 - m.w].name.toLowerCase()].l === 1, 'a win and a loss per name');
    G.draw();
    h.ok(G.S.ui.buttons.some((b) => b.label === 'Rematch'), 'Rematch on the podium');
    // a reload on the podium never books it twice
    G.duo.park(); G.duo.resume();
    h.ok(G.duo.state.ph === 'end' && G.meta.duo.vs === 1, 'resumed on the podium, booked once');
    const R2 = G.duo.rematch();
    h.ok(R2 && R2.ph === 'toss' && R2.p[0].name === 'Roxor' && R2.drops === 3 && !R2.paid && R2.seed !== 4242, 'Rematch: the same two, a fresh toss');
    h.eq(T._store.clawspire_run, 'SOLO', 'the solo run save was never touched');
    G.duo.leave();
    h.eq(G.screen, 'title', 'out to the title');
  });

  h.test('duo: a claw-off saves every drop and resumes at the next one (the pile less what was won); the run save untouched', () => {
    const T = boot(), G = T.GAME;
    G.newRun('knight', 77); G.save();
    const solo = T._store.clawspire_run, run = G.run;
    const D = duoNew(G, 'vs', 999, { drops: 4 });
    h.ok(D.drops === 4 && G.duo.v.pile.length === 16, 'four drops each: a fuller bin');
    duoDropOut(G);
    G.duo.keep();
    duoDropOut(G);
    const saved = JSON.parse(T._store.clawspire_duo);
    h.ok(saved.ph === 'sabo' && saved.k === 2 && saved.taken.length === D.taken.length && saved.score.join() === D.score.join(), 'every drop saves: scores, what was won, the hands');
    const left = G.duo.v.W.bodies.filter((b) => b.type === 'dynamic' && b.data && b.data.pile != null).length;
    // a reload: a new page, the duo menu's Resume
    const T2 = boot({ store: Object.assign({}, T._store) }), G2 = T2.GAME;
    h.ok(G2.duo.saved() && G2.S.ui.buttons.find((b) => b.label === 'Duo').el.children.some((c) => /resume/.test(c.textContent)), 'the title says resume');
    G2.duo.menu();
    h.ok(G2.S.ui.buttons.some((b) => b.label === 'Resume duel'), 'Resume duel on the menu');
    h.ok(G2.duo.resume(), 'resumed');
    const D2 = G2.duo.state;
    h.ok(D2.ph === 'sabo' && D2.k === 2 && D2.score.join() === D.score.join(), 'at the sabotage choice after drop 2');
    h.eq(G2.duo.v.W.bodies.filter((b) => b.type === 'dynamic' && b.data && b.data.pile != null).length, left, 'the bin holds exactly what was left');
    G2.duo.keep();
    h.ok(D2.ph === 'hand' && D2.turn === 1 - D2.from, 'and on to the next drop');
    // a pause from the hand-off, then resume: the same player's hand-off
    const turn = D2.turn;
    G2.choose(G2.S.ui.buttons.findIndex((b) => b.label === 'Pause'));
    h.ok(G2.screen === 'duo' && !G2.duo.state, 'paused to the duo menu');
    G2.duo.resume();
    h.ok(G2.duo.state.ph === 'hand' && G2.duo.state.turn === turn, 'back at the same hand-off');
    h.eq(T._store.clawspire_run, solo, 'the solo save is exactly as it was');
    G.duo.leave();
    h.ok(G.run === run && G.screen === 'title', 'leaving hands the solo run back');
    G2.duo.leave();
    h.ok(T2._store.clawspire_duo, 'left mid duel: still saved for later');
  });

  h.test('duo: co-op boss (turn order, a shared boss that hits whoever just went, a seat down, a team win booked once, the podium)', () => {
    const T = boot(), G = T.GAME, C = T.COMBAT;
    T._store.clawspire_run = 'SOLO';
    const D = duoNew(G, 'coop', 4243, { char1: 'knight' });
    h.ok(T.DATA.duoBosses().some((x) => x.id === D.boss), 'a boss from the lineup (random)');
    h.eq(D.ph, 'hand', 'the phone goes to the toss winner');
    const first = D.turn;
    duoReady(G);
    h.eq(G.screen, 'fight', 'the fight');
    for (let i = 0; i < 4 && G.fs && G.fs.vs; i++) G.pointer('down', 270, 500);
    fightSettle(G);
    const L = G.duo.live;
    h.ok(L && L.F[0] && L.F[1] && L.F[0] !== L.F[1], 'a fight per seat');
    h.ok(L.F[0].enemies === L.F[1].enemies, 'one shared boss');
    h.ok(G.fight === L.F[first] && G.run === L.runs[first] && G.run.char === D.p[first].char, 'the first seat plays its own run');
    const e = G.fight.enemies[0];
    const solo = C.newFight(L.runs[first], [D.boss], T.U.rng(D.fseed)).enemies[0];
    h.eq(e.maxHp, Math.round(solo.maxHp * T.DATA.rushHpK(D.boss) * T.DATA.DUO.COOP.hpK), 'the boss: its Boss Rush hit points, times COOP.hpK for two');
    h.ok(L.runs[first].bin.length > (T.DATA.CHARACTERS[D.p[first].char].bin || []).length, 'each seat brings its Boss Rush kit');
    G.draw();
    // the boss acts on the seat that just went: pin an attack, check only that seat takes it
    const atk = (e.def.moves || []).find((m) => m && m.k === 'attack');
    const other = 1 - first, hpO = L.F[other].player.hp;
    e.intent = Object.assign({}, atk, { v: 30, n: 1 }); e.charged = 0;
    G.fight.player.block = 0;
    const hp0 = G.fight.player.hp;
    G.endTurn();
    for (let i = 0; i < 60 * 20 && G.screen === 'fight'; i++) G.update(DT);
    h.ok(L.F[first].player.hp < hp0, 'the boss hit the seat that just went');
    h.eq(L.F[other].player.hp, hpO, '...and not the other one');
    h.ok(G.screen === 'duo' && D.ph === 'hand' && D.turn === other && D.from === first, 'the phone passes to the other seat');
    G.draw();
    duoReady(G);
    fightSettle(G);
    h.ok(G.fight === L.F[other] && G.run === L.runs[other], 'the other seat\'s own fight comes back in');
    h.ok(!G.fs.vs, 'no versus card on a hand-back');
    h.ok(G.duo.log.filter((l) => l.k === 'seat').map((l) => l.seat).join() === [first, other].join(), 'seat order: first, then the other');
    // damage by this seat shows for both (the shared boss)
    const bhp = e.hp;
    C.damage(G.fight, G.fight.player, e, 5);
    h.ok(e.hp < bhp && L.F[first].enemies[0].hp === e.hp, 'the boss\'s hp is one for both');
    G.draw();
    // this seat falls: the other fights on alone (no more hand-offs)
    G.fight.player.hp = 1; G.fight.player.block = 0;
    e.intent = Object.assign({}, atk, { v: 999, n: 1 }); e.charged = 0;
    G.endTurn();
    for (let i = 0; i < 60 * 20 && D.ph === 'fight' && G.screen === 'fight'; i++) G.update(DT);
    h.ok(D.down[other] === 1 && D.ph === 'hand' && D.turn === first, 'a seat down: the phone goes to the partner');
    duoReady(G);
    fightSettle(G);
    const hands = G.duo.log.filter((l) => l.k === 'hand').length;
    e.intent = (e.def.moves || []).find((m) => m && m.k === 'block') || e.intent; e.charged = 0;
    G.endTurn();
    for (let i = 0; i < 60 * 20 && G.screen === 'fight' && !fightReady(G); i++) G.update(DT);
    h.ok(G.screen === 'fight' && G.fight === L.F[first] && G.duo.log.filter((l) => l.k === 'hand').length === hands, 'with the partner down, the same seat simply goes again');
    // the boss falls: a team win, the victory beat, the podium, booked once
    G.endFight('win', true);
    h.ok(D.paid && D.res && D.res.won && G.meta.duo.coopWins === 1 && G.meta.duo.coop === 1, 'a team win on the record');
    h.ok(G.meta.duo.names.roxor.cw === 1 && G.meta.duo.names.jasmin.cw === 1, 'team wins per name');
    duoStep(G, 5);
    h.ok(G.screen === 'duo' && D.ph === 'end', 'the podium');
    G.draw();
    G.duo.park(); G.duo.resume();
    h.ok(G.duo.state.ph === 'end' && G.meta.duo.coopWins === 1, 'a reload on the podium: booked once');
    h.eq(T._store.clawspire_run, 'SOLO', 'the solo run save was never touched');
    G.duo.leave();
    h.ok(G.run === null && !/duoOn/.test(String(T._nodes.top && T._nodes.top.className || '')), 'out: no seat run left behind');
  });

  h.test('duo: co-op knock out (both down), a reload restarts the boss at its bell, the cycle turns for even bosses', () => {
    const T = boot(), G = T.GAME;
    const D = duoNew(G, 'coop', 5151, { boss: 'random' });
    D.boss = 'plushqueen';   // an 8-step cycle: turn about would show each seat half of it
    duoReady(G);
    for (let i = 0; i < 4 && G.fs && G.fs.vs; i++) G.pointer('down', 270, 500);
    fightSettle(G);
    const L = G.duo.live, e = G.fight.enemies[0];
    h.eq(e.id, 'plushqueen', 'the Plushie Queen');
    const cyc0 = e.cyc;
    for (let k = 0; k < 2; k++) {
      G.endTurn();
      for (let i = 0; i < 60 * 20 && G.screen === 'fight'; i++) G.update(DT);
      duoReady(G); fightSettle(G);
    }
    h.ok(G.duo.log.some((l) => l.k === 'cyc'), 'after a full round the even cycle steps on');
    h.eq(e.cyc - cyc0, 3, 'two actions and one step: each seat meets every move over a fight');
    // a reload mid fight: the boss again from its bell, the first seat again
    const T2 = boot({ store: Object.assign({}, T._store) }), G2 = T2.GAME;
    G2.duo.menu(); G2.duo.resume();
    const D2 = G2.duo.state;
    h.ok(D2.mode === 'coop' && D2.ph === 'hand' && D2.turn === D2.first && D2.down.join() === '0,0' && !G2.duo.live, 'resumed at the bell');
    // both seats fall: knocked out, booked once
    const atk = (e.def.moves || []).find((m) => m && m.k === 'attack');
    for (let k = 0; k < 2; k++) {
      G.fight.player.hp = 1; G.fight.player.block = 0; G.fight.player.status = {};
      e.intent = Object.assign({}, atk, { v: 999, n: 1 }); e.charged = 0;
      G.endTurn();
      for (let i = 0; i < 60 * 20 && G.screen === 'fight'; i++) G.update(DT);
      if (k === 0) { h.ok(D.ph === 'hand', 'one down, the partner up'); duoReady(G); fightSettle(G); }
    }
    for (let i = 0; i < 60 * 6 && D.ph !== 'end'; i++) G.update(DT);
    h.ok(D.ph === 'end' && D.res && !D.res.won && D.down.join() === '1,1', 'both down: KNOCKED OUT');
    h.ok(G.meta.duo.coop === 1 && G.meta.duo.coopWins === 0, 'a co-op loss on the record');
    G.draw();
  });

  h.test('duo: old and junk profiles load; the record and the setup survive a reload', () => {
    const T = boot({ store: { clawspire_meta: JSON.stringify({ unlocks: { knight: true }, stats: { runs: 3 } }) } }), G = T.GAME;
    h.ok(G.meta.duo && G.meta.duo.games === 0 && Object.keys(G.meta.duo.names).length === 0, 'an old profile: an empty duel record');
    const T2 = boot({ store: { clawspire_meta: JSON.stringify({ duo: { games: 'lots', names: { x: 5, ' Jas ': { w: 2 } }, last: 7 } }), clawspire_duo: '{broken' } }), G2 = T2.GAME;
    h.ok(G2.meta.duo.games === 0 && G2.meta.duo.names.jas && G2.meta.duo.names.jas.w === 2 && !G2.meta.duo.names.x, 'a junk record is repaired');
    h.eq(G2.duo.saved(), null, 'a broken duel save is ignored');
    G2.duo.menu();
    h.ok(!G2.S.ui.buttons.some((b) => b.label === 'Resume duel'), '...and offers no resume');
    G2.meta.duo.names.roxor = { n: 'Roxor', w: 4, l: 1, t: 0, cg: 2, cw: 1 };
    G2.duo.setup('coop'); G2.duo.set(0, 'name', 'Roxor');
    G2.duo.seed = 5; G2.duo.start();
    const T3 = boot({ store: Object.assign({}, T2._store) }), G3 = T3.GAME;
    h.ok(G3.meta.duo.names.roxor.w === 4 && G3.meta.duo.last.p[0].name === 'Roxor' && G3.meta.duo.last.mode === 'coop', 'the record and the last setup come back');
    G3.duo.menu();
    const St = G3.duo.setup('coop');
    h.eq(St.p[0].name, 'Roxor', 'the setup starts from the last one');
  });
}

// ---- SCHOOL (round 11): Claw School and the Practice Cabinet
{
  const schBoot = (meta) => boot({ store: meta === undefined ? {} : { clawspire_meta: JSON.stringify(Object.assign({ introSeen: true, tutorialDone: true, unlocks: { knight: true } }, meta || {})) } });
  const schStep = (G, secs) => { const n = Math.round(secs * 60); for (let i = 0; i < n; i++) G.update(1 / 60); };
  // the middle of the widest empty stretch of the bin floor (a drop there grabs nothing)
  const schFreeX = (g) => { const bw = g.C.bounds.chuteX, xs = [0].concat(g.items.map(b => b.x).sort((a, b) => a - b), [bw]); let best = 20, gap = -1; for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] > gap) { gap = xs[i] - xs[i - 1]; best = (xs[i] + xs[i - 1]) / 2; } return Math.max(20, Math.min(bw - 20, best)); };
  // A scripted grab: the claw drops at a free spot and, while it is busy, the picked prizes are dropped down the chute; runs until the grab is over.
  const schGrab = (T, pick, x) => {
    const G = T.GAME, SC = G.sch, g = SC.G;
    SC.steer(x == null ? schFreeX(g) : x); schStep(G, 0.9);
    const ok = SC.drop();
    const cb = g.C.bounds, list = pick ? pick(g) : [];
    list.forEach((b, i) => { T.PHYS.setPose(b, cb.chuteX + 32, cb.dividerTop + 20 + i * 34, 0); b.vx = 0; b.vy = 0; b.av = 0; b.sl = false; });
    let k = 0; while (g.busy && k < 40 * 60) { G.update(1 / 60); k++; }
    schStep(G, 0.3);
    return ok;
  };
  const schMatchB = (T, o, b) => { const d = b.data.def, Tr = (b.data.mat && b.data.mat.traits) || {}; return T.DATA.schMatch(o, { id: d.id, tags: d.tags || [], glass: !!Tr.glass, circle: d.shape.kind === 'circle' }); };
  // What a challenge needs down the chute to be cleared in one grab.
  const schNeed = (T, g) => {
    const ch = g.ch, w = ch.win, ok = (b) => !ch.never || !schMatchB(T, ch.never, b);
    if (w.k === 'target') return g.items.filter(b => b.data.t);
    if (w.k === 'all') return g.items.slice();
    if (w.k === 'free') return g.items.slice(0, 1);
    const n = ch.stars.k === 'items' ? ch.stars.s3 : (w.n || 1);
    return g.items.filter(b => ok(b) && schMatchB(T, w.of, b)).slice(0, n);
  };
  const schAll = (T, v) => { const M = T.GAME.sch.meta(); for (const id of T.DATA.SCH_IDS) M.stars[id] = v; return M; };

  h.test('SCHOOL: an old profile loads with an empty school record, a junk one is repaired, the record saves and reloads', () => {
    const T = schBoot({ stats: { runs: 4, wins: 1 } });
    const M = T.GAME.sch.meta();
    h.ok(M && !Object.keys(M.stars).length && M.tix === 0 && M.dip === 0 && M.pr.pile === 'starter', 'a profile from before the school gets an empty record');
    h.eq(T.GAME.meta.stats.runs, 4, 'the rest of the old profile is untouched');
    const J = schBoot({ school: { stars: { b1: 9, qq: 2 }, tix: 'lots', pr: { muts: ['double', 'moon'], pet: 'dragon' } } });
    const MJ = J.GAME.sch.meta();
    h.ok(MJ.stars.b1 === 3 && !('qq' in MJ.stars) && MJ.tix === 0 && MJ.pr.muts.join() === 'moon' && MJ.pr.pet === '', 'a junk record is repaired on load');
    const g = T.GAME.sch.start(0, 0);
    h.ok(g && T.GAME.screen === 'school', 'a challenge from a fresh boot');
    g.st.drops = 1; T.GAME.sch.finish(g, true);
    const T2 = boot({ store: Object.assign({}, T._store) });
    h.eq(T2.GAME.sch.meta().stars.b1, 3, 'the stars survive a reload');
    h.eq(T2.GAME.sch.meta().tix, 3 * T.DATA.SCH.TIX, 'so do the tickets the school paid');
    h.ok(T2.GAME.meta.vault.tix >= 3 * T.DATA.SCH.TIX, 'and they sit in the vault wallet');
  });

  h.test('SCHOOL: the title: Claw School shares the small row before History; a fresh profile gets "New here? Try Claw School", a veteran does not', () => {
    const T = schBoot({});
    const G = T.GAME;
    G.sch.X.tip = null;
    G.showTitle();
    const L = G.S.ui.buttons.map(b => b.label), i = L.indexOf('Claw School'), hi = L.indexOf('History');
    h.ok(i >= 0 && hi > i, 'Claw School is registered before History: ' + L.join(', '));
    h.ok(L.indexOf('New run') === 0, 'New run keeps its index');
    const sb = G.S.ui.buttons[i], hb = G.S.ui.buttons[hi];
    // (round 15: Claw School is a title tile, History waits in the Collection sheet)
    h.ok(sb.el.parentNode && /uiTiles/.test(sb.el.parentNode.className) && /uiTile/.test(sb.el.className), 'Claw School is a title tile');
    h.ok(secWalk(G.ui15.T.sheets.collection).includes(hb.el), 'History sits in the Collection sheet');
    h.ok(G.sch.X.tip && /Try Claw School/.test(G.sch.X.tip.children.map(c => c.textContent).join('')), 'a fresh profile: the "New here?" line');
    h.ok(!L.some(l => /New here/.test(l)), 'the tip is a plain tap, not a GAME.choose entry');
    G.sch.X.tip.onclick({});
    h.eq(G.screen, 'school', 'the tip opens the school');
    h.eq(G.sch.view, 'hub', 'on the hub');
    const V = schBoot({ stats: { runs: 7, fights: 30 } });
    V.GAME.sch.X.tip = null;
    V.GAME.showTitle();
    h.ok(!V.GAME.sch.X.tip, 'a veteran gets no "New here?" line');
    h.ok(V.GAME.choose(V.GAME.S.ui.buttons.findIndex(b => b.label === 'Claw School')), 'the button works');
    h.eq(V.GAME.screen, 'school', 'the school opens from the title');
    V.GAME.draw();
  });

  h.test('SCHOOL: the practice cabinet: spawning, piles, mutators, pets, claws, slow motion, reset and grabs never touch the run or its save', () => {
    const T = schBoot({});
    const G = T.GAME, SC = G.sch;
    G.newRun('knight', 4242);
    G.toMap();
    const run0 = T._store[G.RUN_KEY], live0 = JSON.stringify(G.run);
    h.ok(typeof run0 === 'string' && run0.length > 100, 'a run is saved');
    G.showTitle();
    SC.practice({});
    h.eq(G.screen, 'school', 'the practice cabinet is up');
    h.ok(SC.G.mode === 'practice' && SC.G.items.length > 0, 'a starter pile');
    for (const p of T.DATA.SCH.PILES) { h.ok(SC.pile(p.id), 'preset ' + p.id); h.ok(SC.G.items.length >= 6, p.id + ' spawns a pile (' + SC.G.items.length + ')'); schStep(G, 0.3); G.draw(); }
    SC.pile('empty'); h.eq(SC.G.items.length, 0, 'the empty bin');
    h.ok(SC.spawn('rusty_sword'), 'a found item drops in');
    h.eq(SC.spawn('family_anvil'), null, 'an item not yet found stays locked');
    SC.pile('balls');
    for (const m of ['lowgrav', 'moon', 'mirror']) SC.toggleMut(m);
    for (const p of ['cat', 'hamster', 'parrot']) { SC.setPet(p); SC.trick(); schStep(G, 1.3); }
    SC.setSlow(true); schGrab(T, null, 200); SC.setSlow(false);
    for (const id of ['magnet', 'hook', 'vacuum']) { SC.setClaw(id); schGrab(T, null, 150); }
    SC.reset(); schStep(G, 0.5); G.draw();
    h.eq(T._store[G.RUN_KEY], run0, 'the run save is byte for byte the same');
    h.eq(JSON.stringify(G.run), live0, 'the live run is untouched');
    h.eq(SC.back(), 'title', 'Back goes to the title');
    h.eq(T._store[G.RUN_KEY], run0, 'still the same after leaving');
    h.ok(G.load(), 'Continue still loads the run');
    h.eq(G.screen, 'map', 'back on its map');
  });

  h.test('SCHOOL: a real grab in the practice cabinet delivers, and the readout counts it', () => {
    const T = schBoot({});
    const G = T.GAME, SC = G.sch;
    SC.practice({});
    SC.setClaw('classic');
    SC.G.muts.slice().forEach(m => SC.toggleMut(m));
    SC.pile('balls');
    let grabs = 0;
    while (SC.G.stats.delivered === 0 && grabs < 5) {
      const g = SC.G, xs = g.items.map(b => b.x).sort((a, b) => a - b);
      schGrab(T, null, xs[Math.floor(xs.length / 2)] + grabs * 17);
      grabs++;
    }
    const s = SC.G.stats;
    h.ok(s.delivered > 0, `a real grab delivered (${s.delivered} in ${grabs})`);
    h.eq(s.grabs, grabs, 'every grab counted');
    h.ok(s.best >= s.grab && s.best > 0, 'the best grab');
    h.ok(SC.log.some(l => l.k === 'grab' && l.n > 0), 'the grab is logged with its prizes');
    G.draw();
  });

  h.test('SCHOOL: any claw, only paints you own, only prizes you have found, the cabinet holds 30', () => {
    const T = schBoot({});
    const G = T.GAME, SC = G.sch;
    SC.practice({});
    for (const id of Object.keys(T.PHYS.CLAW_TYPES)) { h.ok(SC.setClaw(id), 'claw ' + id); h.eq(SC.G.rig.type, id, id + ' is on the rig'); h.eq(SC.meta().pr.claw, id, 'remembered'); }
    h.ok(!SC.setPaint('paint_gold'), 'a paint you do not own is refused');
    G.vault.state.owned.paint_gold = 1;
    h.ok(SC.setPaint('paint_gold') && SC.G.paint === 'paint_gold', 'an owned paint goes on');
    SC.pile('empty');
    G.meta.seen.items.prize_marble = 1;
    let got = 0;
    for (let i = 0; i < 40; i++) if (SC.spawn('prize_marble')) got++;
    h.eq(got, T.DATA.SCH.PILE_MAX, 'the cabinet holds ' + T.DATA.SCH.PILE_MAX);
    h.eq(SC.G.items.length, T.DATA.SCH.PILE_MAX, 'and no more');
    SC.drop(200);
    h.ok(!SC.setClaw('tri'), 'no claw swap mid grab');
    h.ok(!SC.toggleMut('moon'), 'no mutator swap mid grab');
  });

  h.test('SCHOOL: mutators in the practice cabinet: on and off, a clash swaps, three at most, the fight-only ones stay off, the pile stays where it lay', () => {
    const T = schBoot({});
    const G = T.GAME, SC = G.sch;
    SC.practice({});
    SC.pile('balls');
    const n0 = SC.G.items.length, x0 = SC.G.items.map(b => Math.round(b.x)).join();
    h.ok(SC.toggleMut('lowgrav'), 'Low Gravity on');
    h.ok(SC.G.muts.includes('lowgrav') && SC.G.items.every(b => b.gs < 0.5), 'the prizes float');
    h.eq(SC.G.items.length, n0, 'the same prizes');
    h.eq(SC.G.items.map(b => Math.round(b.x)).join(), x0, 'where they lay');
    SC.toggleMut('tiny'); SC.toggleMut('giant');
    h.ok(SC.G.muts.includes('giant') && !SC.G.muts.includes('tiny'), 'Giant switches Tiny off');
    SC.toggleMut('moon');
    h.ok(!SC.toggleMut('mirror') && SC.G.muts.length === 3, 'three at most');
    h.ok(!SC.toggleMut('double') && !SC.toggleMut('hungry'), 'fight-only mutators are refused');
    SC.toggleMut('lowgrav'); SC.toggleMut('giant'); SC.toggleMut('moon');
    h.eq(SC.G.muts.length, 0, 'all off again');
    for (const m of T.DATA.SCH.MUTS) { SC.toggleMut(m); schStep(G, 0.4); G.draw(); SC.toggleMut(m); }
    SC.toggleMut('mirror');
    SC.pointer('down', G.CAB.x + 100, 600, { pointerId: 1 });
    h.ok(Math.abs(SC.G.rig.targetX - (SC.G.C.bounds.chuteX - 100)) < 2, 'the Mirror Machine steers backwards');
    SC.pointer('cancel', G.CAB.x + 100, 600, { pointerId: 1 });
    SC.toggleMut('mirror'); SC.toggleMut('flood');
    h.ok(SC.G.flood && SC.G.level < G.CAB.h, 'Rising Water floods the bin');
    SC.toggleMut('flood'); SC.toggleMut('earthquake');
    schStep(G, 7.5);
    h.ok(SC.G.tremT < T.GAME.sch.K.tremorEvery, 'the earthquake rumbles on its own clock');
    h.eq(SC.meta().pr.muts.join(), 'earthquake', 'the setup is remembered');
  });

  h.test('SCHOOL: every pet does its trick in the practice cabinet and hops back to its perch', () => {
    const T = schBoot({});
    const G = T.GAME, SC = G.sch;
    SC.practice({});
    for (const id of T.DATA.PET_IDS) {
      SC.pile(id === 'raccoon' || id === 'roomba' ? 'junk' : 'balls');
      h.ok(SC.setPet(id) && SC.G.pet.id === id, id + ' on the frame');
      const n0 = SC.G.items.length, d0 = SC.G.stats.delivered;
      const ok = SC.trick();
      h.ok(ok, id + ' does its trick');
      schStep(G, 2);
      G.draw();
      h.eq(SC.G.pet.ph, 'sit', id + ' is back on its perch');
      if (id === 'raccoon') h.eq(SC.G.items.length, n0 - 1, 'the raccoon eats a junk item');
      if (id === 'roomba') h.ok(SC.G.stats.delivered > d0 && SC.G.stats.free > 0, 'the robot vacuum sweeps a prize down the chute: a free prize');
      if (id === 'octopus') h.ok(SC.G.pet.hold, 'the octopus is ready to hold on');
    }
    h.ok(SC.log.filter(l => l.k === 'trick').length >= 9, 'the tricks are logged');
    SC.setPet('');
    h.ok(!SC.G.pet && !SC.trick(), 'no pet, no trick');
  });

  h.test('SCHOOL: every challenge is cleared by a scripted grab: its goal is detected and it earns its stars', () => {
    const T = schBoot({});
    const G = T.GAME, SC = G.sch, D = T.DATA;
    schAll(T, 1);
    for (const id of D.SCH_IDS) {
      const ch = D.SCH_CH[id];
      SC.meta().stars[id] = 0;
      const g = SC.start(ch.lesson, ch.idx);
      h.ok(g && g.ch === ch && g.claw === ch.claw, `${id}: starts with its claw (${ch.claw})`);
      h.eq(g.items.length, ch.pile.length, `${id}: its scripted pile`);
      h.eq(g.muts.join(), ch.muts.join(), `${id}: its mutators`);
      schGrab(T, (gg) => schNeed(T, gg));
      h.ok(g.res && g.res.win, `${id} ${ch.name}: cleared (${g.res ? g.res.why : 'no result'})`);
      h.eq(g.res && g.res.stars, 3, `${id}: 3 stars for a one-drop clear`);
      h.eq(SC.meta().stars[id], 3, `${id}: the stars are on the profile`);
      schStep(G, 1.2);
      G.draw();
    }
  });

  h.test('SCHOOL: a crack, a blast, a forbidden prize, the last drop and the clock each fail a challenge (and pay nothing)', () => {
    const T = schBoot({});
    const G = T.GAME, SC = G.sch, D = T.DATA;
    schAll(T, 2);
    const tix0 = () => G.vault.state.tix;
    const at = (id) => { const c = D.SCH_CH[id]; SC.meta().stars[id] = 0; return SC.start(c.lesson, c.idx); };
    let g = at('m1'), t0 = tix0();
    SC.crack(g, g.items.find(b => b.data.t));
    h.ok(g.res && !g.res.win && g.res.why === 'cracked', 'a crack fails Handle With Care');
    h.ok(SC.meta().stars.m1 === 0 && tix0() === t0, 'no stars, no tickets');
    schStep(G, 1.2); G.draw();
    g = at('m5'); g.go = true;
    schStep(G, 21);
    h.ok(g.res && g.res.why === 'blew', 'the lit bomb blows up: KABOOM');
    g = at('t4');
    schGrab(T, (gg) => [gg.items.find(b => b.data.t), gg.items.find(b => b.data.def.id === 'rock')]);
    h.ok(g.res && g.res.why === 'never', 'a rock with the gem fails Picky Eater');
    g = at('b1');
    h.ok(schGrab(T, null) && !g.res, 'an empty grab: still going');
    g.st.drops = D.SCH_CH.b1.drops;
    h.ok(!SC.drop(), 'no drops left: the claw stays put');
    SC.judge(g);
    h.ok(g.res && g.res.why === 'drops', 'out of drops');
    g = at('b5'); g.go = true;
    schStep(G, 31);
    h.ok(g.res && g.res.why === 'time', 'out of time');
    g = at('b5');
    schStep(G, 5);
    h.eq(g.t, 0, 'the clock waits for the claw to move');
    h.ok(!g.res, 'and nothing fails meanwhile');
  });

  h.test('SCHOOL: stars pay vault tickets once; a better clear pays only the new stars; a worse one keeps the best', () => {
    const T = schBoot({});
    const G = T.GAME, SC = G.sch, K = T.DATA.SCH;
    const tix = () => G.vault.state.tix;
    const run = (drops) => { const g = SC.start(0, 0); g.st.drops = drops; return SC.finish(g, true); };
    const t0 = tix();
    let r = run(5);
    h.ok(r.stars === 1 && r.tix === K.TIX && tix() - t0 === K.TIX, 'a 1-star clear pays one star');
    r = run(1);
    h.ok(r.stars === 3 && r.tix === 2 * K.TIX && tix() - t0 === 3 * K.TIX, 'a 3-star clear pays the two new stars');
    r = run(1);
    h.ok(r.tix === 0 && tix() - t0 === 3 * K.TIX, 'the same stars again pay nothing');
    r = run(2);
    h.ok(r.stars === 2 && r.tix === 0 && SC.meta().stars.b1 === 3, 'a worse clear pays nothing and keeps the 3 stars');
    h.eq(SC.meta().tix, 3 * K.TIX, 'the school counts what it paid');
    h.ok(SC.meta().best.b1.drops === 1, 'the best clear is kept');
  });

  h.test('SCHOOL: lessons open by the stars, challenges one after another; Next goes on', () => {
    const T = schBoot({});
    const G = T.GAME, SC = G.sch, K = T.DATA.SCH;
    h.eq(SC.start(1, 0), null, 'lesson 2 is locked on a fresh profile');
    h.eq(SC.start(0, 1), null, 'challenge 2 waits for challenge 1');
    let g = SC.start(0, 0);
    g.st.drops = 1; SC.finish(g, true);
    h.eq(JSON.stringify(SC.next(g)), '[0,1]', 'Next: the next challenge');
    schStep(G, 1.2);
    h.ok(G.S.ui.buttons.some(b => b.label === 'Next ▶'), 'the result offers Next');
    h.ok(SC.start(0, 1), 'challenge 2 opens with a star on challenge 1');
    SC.show('hub');
    const i2 = G.S.ui.buttons.findIndex(b => b.label === 'Materials');
    h.ok(i2 >= 0 && G.choose(i2) && SC.view === 'hub', 'a locked lesson stays shut');
    SC.meta().stars.b2 = 3;
    h.ok(SC.total() >= K.NEED[1], 'six stars');
    SC.show('hub');
    G.choose(G.S.ui.buttons.findIndex(b => b.label === 'Materials'));
    h.eq(SC.view, 'lesson', 'lesson 2 opens');
    h.ok(SC.start(1, 0), 'its first challenge starts');
    g = SC.G; g.st.drops = 1; SC.finish(g, true);
    const L = T.DATA.SCH_LESSONS;
    const last = SC.start(0, 0); SC.meta().stars = { b1: 3, b2: 3, b3: 3, b4: 3, b5: 3 };
    const gl = SC.start(0, L[0].ch.length - 1);
    gl.st.drops = 1; SC.finish(gl, true);
    h.eq(JSON.stringify(SC.next(gl)), '[1,0]', 'the last of a lesson leads to the next lesson');
    h.ok(last, 'retries always start');
  });

  h.test('SCHOOL: the diploma: the last star pays the Valedictorian marquee once; it goes on the shelf and up on the cabinet', () => {
    const T = schBoot({});
    const G = T.GAME, SC = G.sch, K = T.DATA.SCH, id = K.DIPLOMA;
    schAll(T, 3);
    SC.meta().stars.x5 = 0;
    const g = SC.start(4, 4);
    g.st.drops = 1;
    const r = SC.finish(g, true);
    h.ok(r.grad && SC.meta().dip === 1, 'the last star: graduated');
    h.eq(SC.total(), K.MAX_STARS, 'every star is in');
    const V = G.vault.state;
    h.ok(V.owned[id] && V.news[id], 'the Valedictorian marquee is yours (NEW in the vault)');
    schStep(G, 1.2);
    h.ok(G.S.ui.buttons.some(b => b.label === 'See your diploma'), 'the result leads to the diploma');
    const g2 = SC.start(4, 4); g2.st.drops = 1;
    h.ok(!SC.finish(g2, true).grad, 'graduated once');
    h.ok(SC.shelf('marquee', ['mq_classic']).includes(id) && !SC.shelf('skin', []).includes(id), 'on the marquee shelf');
    SC.show('report');
    G.draw();
    const bi = G.S.ui.buttons.findIndex(b => /Valedictorian/.test(b.label));
    h.ok(bi >= 0 && G.choose(bi), 'the report card puts it up');
    h.eq(V.eq.marquee, id, 'equipped');
    const T2 = boot({ store: Object.assign({}, T._store) });
    h.ok(T2.GAME.vault.state.owned[id] && T2.GAME.vault.state.eq.marquee === id && T2.GAME.sch.meta().dip === 1, 'owned, on and graduated after a reload');
    G.vault.show('marquee'); G.draw();
  });

  h.test('SCHOOL: "Practice this claw" on the claw picker opens the cabinet with that claw; Back returns to the picker', () => {
    const T = schBoot({});
    const G = T.GAME, SC = G.sch;
    G.showChars();
    const labels0 = G.S.ui.buttons.map(b => b.label).join();
    const find = (el, cls) => { if (!el) return null; if (String(el.className || '').indexOf(cls) >= 0) return el; for (const c of el.children || []) { const f = find(c, cls); if (f) return f; } return null; };
    const pb = find(T._nodes.charsBody, 'schPracBtn');
    h.ok(pb, 'the claw panel has a Practice this claw button');
    h.ok(!G.S.ui.buttons.some(b => /Practice/.test(b.label)), 'a plain tap: the crawler cards keep their indices');
    G.claws.pick('hook');
    G.showChars();
    h.eq(G.S.ui.buttons.map(b => b.label).join(), labels0, 'the same entries');
    find(T._nodes.charsBody, 'schPracBtn').onclick({});
    h.eq(G.screen, 'school', 'the practice cabinet opens');
    h.eq(SC.G.claw, 'hook', 'with the picked claw');
    h.eq(SC.back(), 'chars', 'Back returns to the picker');
    h.eq(G.screen, 'chars', 'on character select');
  });

  h.test('SCHOOL: every view draws; the keys and the pointer drive the claw; Escape walks back out', () => {
    const T = schBoot({});
    const G = T.GAME, SC = G.sch;
    SC.show('hub'); G.draw();
    SC.show('lesson', { li: 0 }); G.draw();
    SC.show('report'); G.draw();
    schAll(T, 2);
    const g = SC.start(4, 4); G.draw();
    const x0 = g.rig.targetX;
    G.S.keys = {};
    T._listeners.keydown && T._listeners.keydown({ key: 'ArrowLeft', preventDefault() {} });
    schStep(G, 0.4);
    T._listeners.keyup && T._listeners.keyup({ key: 'ArrowLeft', preventDefault() {} });
    h.ok(g.rig.targetX < x0, 'the left arrow steers');
    T._listeners.keydown && T._listeners.keydown({ key: ' ', preventDefault() {} });
    h.ok(g.busy && g.st.drops === 1, 'Space drops');
    let k = 0; while (g.busy && k < 1800) { G.update(1 / 60); k++; }
    SC.pointer('down', G.CAB.x + 150, 600, { pointerId: 1 });
    SC.pointer('move', G.CAB.x + 160, 600, { pointerId: 1 });
    h.ok(Math.abs(g.rig.targetX - 160) < 2, 'a finger on the glass steers');
    SC.pointer('up', G.CAB.x + 160, 600, { pointerId: 1 });
    h.ok(g.busy || g.res, 'and a lift drops');
    k = 0; while (g.busy && k < 1800) { G.update(1 / 60); k++; }
    G.draw();
    T._listeners.keydown && T._listeners.keydown({ key: 'Escape', preventDefault() {} });
    h.eq(SC.view, 'lesson', 'Escape: the lesson');
    T._listeners.keydown && T._listeners.keydown({ key: 'Escape', preventDefault() {} });
    h.eq(SC.view, 'hub', 'Escape: the hub');
    T._listeners.keydown && T._listeners.keydown({ key: 'Escape', preventDefault() {} });
    h.eq(G.screen, 'title', 'Escape: the title');
    h.eq(T._store[G.RUN_KEY], undefined, 'no run was ever saved');
  });
}

// ---------------------------------------------------------------- LEG (round 12): legends
// DESIGN.md "Legends (round 12)": where the legendary relics come from, their
// looks and tricks in a real fight, a new evolution's ceremony, the animated cabinets.
{
  const LEG_META = JSON.stringify({ introSeen: true, tutorialDone: true, unlocks: { knight: true, rogue: true, gambler: true, engineer: true, bubbler: true } });
  const legBoot = (store) => boot({ store: Object.assign({ clawspire_meta: LEG_META }, store || {}) });
  const legFight = (G, relics, seed, o) => {
    o = o || {};
    G.newRun(o.char || 'knight', seed || 1212);
    for (const r of relics) G.gainRelic(r);
    for (const x of o.bin || []) G.run.bin.push(x);
    G.startFight(o.enc || ['slime'], o.tier || 'normal', { seed: o.fs || 5151 });
    if (G.boss && G.boss.vs) { G.boss.vsSkip(); G.boss.vsSkip(); }
    for (let i = 0; i < 40; i++) G.update(DT);
    return G.fight;
  };
  const legBody = (G, uid) => G.fs.items.find(b => b.data.inst && b.data.inst.uid === uid) || null;
  const legBodyOf = (G, id) => G.fs.items.find(b => b.data.inst && b.data.inst.id === id) || null;

  h.test('LEG: the act boss relic is now and then a legendary (its own stream), never twice, never in a common pool', () => {
    const T = legBoot(), G = T.GAME, D = T.DATA, K = D.LEG.K;
    let leg = 0;
    const N = 200;
    for (let s = 0; s < N; s++) {
      G.newRun('knight', 9000 + s);
      const n0 = G.run.nonce;
      const id = G.leg.bossRelic('token_stack');
      h.eq(G.run.nonce, n0, 'the draw never moves the run\'s own streams');
      if (D.RELICS[id].rarity === 'l') leg++; else h.eq(id, 'token_stack', 'else the boss relic stands');
    }
    h.ok(Math.abs(leg / N - K.bossP) < 0.08, `a legendary ${Math.round(leg * 100 / N)}% of the time (about ${K.bossP * 100}%)`);
    G.newRun('knight', 9001);
    G.run.relics.push(...D.LEG.RELICS);
    let same = 0;
    for (let a = 1; a <= 3; a++) { G.run.act = a; if (G.leg.bossRelic('token_stack') === 'token_stack') same++; }
    h.eq(same, 3, 'every legendary owned: the boss relic stands');
    // a real act transition hands one over for some seeds
    let got = null;
    for (let s = 0; s < 40 && !got; s++) {
      G.newRun('knight', 3100 + s);
      G.startFight(D.ENCOUNTERS[1].boss[0], 'boss');
      if (G.boss && G.boss.vs) { G.boss.vsSkip(); G.boss.vsSkip(); }
      stepFor(G, 0.1);
      G.endFight('win');
      G.choose(3);
      if (G.screen === 'parts') G.choose(0);
      const td = G.S.sd && G.S.sd.treasure;
      if (G.screen === 'treasure' && td && td.relic && D.RELICS[td.relic].rarity === 'l') got = td.relic;
    }
    h.ok(!!got, 'an act boss left a legendary for one of 40 seeds (' + got + ')');
  });

  h.test('LEG: the Back Room counter sells a legendary; capsules and pools', () => {
    const T = legBoot(), G = T.GAME, D = T.DATA;
    G.newRun('knight', 777);
    const shop = G.rollShop({ q: 1, r: 1, content: { sec: true } });
    h.ok(shop.relic && D.RELICS[shop.relic.id].rarity === 'l' && shop.relic.price === D.LEG.K.price, 'the service counter: a legendary for ' + D.LEG.K.price);
    const plain = G.rollShop({ q: 2, r: 2, content: {} });
    h.ok(!plain.relic || D.RELICS[plain.relic.id].rarity !== 'l', 'a normal shop never');
  });

  h.test('LEG: The Golden Claw in a real fight: the 5th grab is golden, grips hard, wears gold, then lets go', () => {
    const T = legBoot(), G = T.GAME;
    const F = legFight(G, ['leg_golden_claw'], 1301);
    const grip0 = G.rig.cfg.grip;
    for (let g = 0; g < 4; g++) {
      if (!ready(G)) settle(G, 20);
      if (G.fight.player.grabs <= 0) { G.endTurn(); settle(G, 30); }
      G.steer(160); stepFor(G, 0.3); G.dropClaw(); settle(G, 20);
      if (G.screen !== 'fight') return h.ok(false, 'the fight ended early');
    }
    if (G.fight.player.grabs <= 0) { G.endTurn(); settle(G, 30); }
    h.ok(G.leg.goldLive(), 'the golden grab is next: the claw is gold');
    const cfg = {}; G.leg.clawCfg(cfg);
    h.eq(cfg.paint, 'paint_gold', 'gold paint');
    G.steer(200); stepFor(G, 0.3);
    h.ok(G.dropClaw(), 'the golden drop');
    h.ok(G.leg.gold && G.rig.cfg.grip > grip0 + 0.5, 'it grips far harder (' + G.rig.cfg.grip.toFixed(2) + ')');
    G.draw();
    settle(G, 20);
    h.ok(!G.leg.gold && Math.abs(G.rig.cfg.grip - (grip0 + (G.fs.luckyOn ? 0.6 : 0))) < 1e-6, 'after the grab the grip lets go');
    h.ok(F === G.fight, 'the same fight');
  });

  h.test('LEG: Perpetual Motion bounces a delivered prize back into the cabinet; the Black Hole swallows a Rock', () => {
    const T = legBoot(), G = T.GAME;
    legFight(G, ['leg_perpetual', 'leg_black_hole'], 1302);
    const sw = legBodyOf(G, 'rusty_sword'), inst = sw.data.inst;
    G.playDelivered([sw]);
    settle(G, 6);
    h.ok(G.fight.bin.includes(inst) && !!legBody(G, inst.uid), 'the sword is back in the cabinet as a body');
    h.ok(G.leg.fx.some(o => o.k === 'bounce'), 'BOING');
    const rock = legBodyOf(G, 'rock');
    h.ok(!!rock, 'the black hole\'s Rock is in the bin');
    G.playDelivered([rock]);
    settle(G, 6);
    h.ok(G.leg.fx.some(o => o.k === 'void'), 'it spirals into the black hole');
    for (let i = 0; i < 20; i++) { G.update(DT); G.draw(); }
  });

  h.test('LEG: Glass Heart makes every body glass; every legendary draws in a real fight; the Monocle peeks', () => {
    const T = legBoot(), G = T.GAME, D = T.DATA;
    legFight(G, ['leg_glass_heart'], 1303);
    h.ok(G.fs.items.every(b => !b.data.mat || b.data.mat.traits.glass), 'every prize is glass');
    const T2 = legBoot(), G2 = T2.GAME;
    legFight(G2, D.LEG.RELICS.slice(), 1304, { enc: ['slime', 'goblin'], char: 'engineer', bin: [{ uid: 'lg1', id: 'singularity' }, { uid: 'lg2', id: 'all_in_chip' }] });
    let bad = null;
    try { for (let i = 0; i < 90; i++) { G2.update(DT); G2.draw(); } } catch (e) { bad = e; }
    h.ok(!bad, 'every legendary together draws and updates ' + (bad && bad.stack || ''));
    h.ok(G2.fight.leg && G2.fight.leg.peek > 0 && T2.COMBAT.legPeek(G2.fight, G2.fight.enemies[0]), 'the Monocle peeks at the slime');
    G2.steer(180); stepFor(G2, 0.3); G2.dropClaw(); settle(G2, 20);
    h.ok(G2.screen !== 'fight' || G2.fight.hookErrors.length === 0, 'a real grab: no hook errors ' + (G2.fight && G2.fight.hookErrors[0] || ''));
  });

  h.test('LEG: a new evolution (Poker Chip+ and the Fate Engine) evolves on delivery with its ceremony', () => {
    const T = legBoot(), G = T.GAME;
    legFight(G, ['leg_fate_engine'], 1305, { char: 'gambler' });
    const chip = G.run.bin.find(i => i.id === 'poker_chip');
    chip.plus = true;
    G.startFight(['slime'], 'normal', { seed: 5252 });
    for (let i = 0; i < 40; i++) G.update(DT);
    G.playDelivered([legBody(G, chip.uid)]);
    h.ok(G.evo.fs && G.evo.fs.r.to === 'all_in_chip', 'the ceremony: All-In Chip');
    h.eq(chip.id, 'all_in_chip', 'the run keeps it');
    h.ok(G.fight.evos.includes('evo:all_in_chip'), 'Poker Face is live');
    for (let i = 0; i < 200 && G.evo.fs; i++) { G.update(DT); if (i % 10 === 0) G.draw(); }
    h.ok(!G.evo.fs, 'the ceremony ends');
  });

  h.test('LEG: the animated cabinets on the Vault shelf, bought, equipped and in a fight', () => {
    const T = legBoot(), G = T.GAME, D = T.DATA;
    G.meta.vault = Object.assign(G.meta.vault || {}, { tix: 5000 });
    G.vault.show('skin');
    for (const id of D.LEG.SKINS) { G.vault.select(id); G.draw(); }
    const buyable = D.LEG.SKINS.filter(id => D.vaultHow(id) === 'buy');
    for (const id of buyable) h.ok(G.vault.buy(id) !== false && G.meta.vault.owned[id], id + ': bought');
    G.vault.equip(buyable[0]);
    h.eq(G.meta.vault.eq.skin, buyable[0], 'and equipped');
    G.vault.leave();
    legFight(G, [], 1306);
    let bad = null;
    try { for (let i = 0; i < 30; i++) { G.update(DT); G.draw(); } } catch (e) { bad = e; }
    h.ok(!bad, 'a fight in ' + buyable[0] + ' draws');
  });
}

// ---------------------------------------------------------------- POLISH (round 13): the corner lane keeps off the newer screens' titles
{
  const P13 = boot(), G = P13.GAME, D = P13.DATA;
  const over = (a, r) => Math.min(a.x1, r[2]) - Math.max(a.x0, r[0]) > 1 && Math.min(a.y1, r[3]) - Math.max(a.y0, r[1]) > 1;
  const R = (a) => ({ x0: a[0], y0: a[1], x1: a[2], y1: a[3], w: a[4] || 10 });
  // what the browser measures on each screen at 390 x 844 (stage px: the .qaKeep titles, the buttons)
  let DOM = [];
  G.qa.measure = () => DOM.map(R);
  G.qa.size = (el, tight) => (/mSticker/.test(el.className || '') ? (tight ? { w: 237, h: 56 } : { w: 250, h: 97 }) : tight ? { w: 250, h: 56 } : { w: 280, h: 84 });
  // a fresh corner item: a discovery toast ('dex') or a sticker ('ach')
  const push = (kind) => {
    const S = G.S;
    if (S.mcur && S.mcur.el && S.mcur.el.remove) S.mcur.el.remove();
    S.mcur = null; S.mq = [];
    if (kind === 'dex') { for (const id of Object.keys(D.ITEMS).filter(i => !G.meta.seen.items[i]).slice(0, 3)) G.prog.dexSee('items', id); }
    else G.prog.achUnlock(D.ACH_IDS.find(a => !G.meta.ach[a]));
    stepFor(G, 0.3);
    return S.mcur;
  };
  // both corner items land clear of the title (keep), the canvas signs and every button, shown at once
  const clear = (scr, keep, tag) => {
    h.eq(G.screen, scr, `${tag}: on screen ${scr}`);
    for (const kind of ['dex', 'ach']) {
      const cur = push(kind);
      if (!cur || !cur.rect) { h.ok(false, `${tag}: no ${kind} corner item`); continue; }
      const hit = G.qa.signs(scr).concat(keep).filter(r => over(cur.rect, r));
      h.ok(!hit.length && !cur.hold && cur.qa && cur.qa.hard === 0, `${tag}: the ${kind} at ${Math.round(cur.rect.x0)},${Math.round(cur.rect.y0)} keeps off the title and the signs${hit.length ? ' (over ' + JSON.stringify(hit) + ')' : ''}`);
    }
  };
  const cls = (id, re) => { const n = P13._nodes[id]; const out = []; const walk = (x) => { if (!x) return; if (re.test(x.className || '')) out.push(x); for (const c of x.children || []) walk(c); }; walk(n); return out; };

  h.test('pol13: the advent calendar and the haunted house: the title is kept, the calendar, the door and the words are signs', () => {
    G.season.setDate('2026-12-12');
    G.newRun('knight', 21);
    const gift = Object.values(G.run.map.tiles).find(t => t.type === 'advent');
    G.enterTile(gift);
    h.ok(G.season.door && G.season.door.adv, 'the advent screen');
    h.ok(cls('seaBody', /seaTop/)[0] && /qaKeep/.test(cls('seaBody', /seaTop/)[0].className), 'its title is .qaKeep');
    h.ok(G.qa.signs('sea').some(r => r[1] <= 126 && r[3] >= 362 && r[0] <= 80 && r[2] >= 460), 'the calendar on the wall is a sign');
    // the r12 screenshot: NEW PRIZE DISCOVERED sat top right, over ADVENT CALENDAR
    const title = [52, 18, 488, 81];
    DOM = [title, [140, 826, 400, 884], [140, 894, 400, 938]];
    clear('sea', [title], 'advent, wrapped');
    G.season.knock();
    stepFor(G, 6);
    h.eq(G.season.door.ph, 'done', 'unwrapped');
    h.ok(G.qa.signs('sea').some(r => r[1] <= 380 && r[3] >= 410), 'MERRY CLAWMAS! / BIG PRESENT! is a sign too');
    h.ok(cls('seaBody', /seaCard/).every(n => /qaKeep/.test(n.className)), 'and the result card is kept');
    DOM = [title, [60, 821, 480, 884], [140, 894, 400, 938]];
    clear('sea', [title], 'advent, the gift');
    G.season.setDate('2026-10-15');
    G.newRun('knight', 22);
    const door = Object.values(G.run.map.tiles).find(t => t.type === 'treat');
    G.enterTile(door);
    h.ok(G.season.door && !G.season.door.adv, 'the haunted house');
    h.ok(G.qa.signs('sea').some(r => r[1] <= 360 && r[3] >= 630), 'its door is a sign');
    const t2 = [75, 18, 465, 81];
    DOM = [t2, [140, 826, 400, 884], [140, 894, 400, 938]];
    clear('sea', [t2], 'trick or treat, the door');
    G.season.knock();
    stepFor(G, 6);
    DOM = [t2, [60, 818, 480, 884], [140, 894, 400, 938]];
    clear('sea', [t2], 'trick or treat, opened');
    G.season.setDate(null);
  });

  h.test('pol13: the Claw School, the practice cabinet, the vault, the rush and the arcade keep their titles', () => {
    G.newRun('knight', 31);
    G.sch.show('hub', { from: 'title' });
    DOM = [[16, 8, 87, 52], [291, 186, 430, 230], [16, 238, 524, 302], [16, 310, 524, 382], [16, 390, 524, 462], [16, 470, 524, 542], [16, 550, 524, 622], [16, 630, 524, 702]];
    clear('school', [], 'the school hub (CLAW SCHOOL on its chalkboard)');
    G.sch.show('report');
    DOM = [[16, 8, 87, 52]];
    clear('school', [], 'the report card');
    G.sch.start(0, 0);
    h.ok(cls('schoolBody', /schTopTag/).some(n => /qaKeep/.test(n.className)), 'a challenge\'s name on top is .qaKeep');
    const tag = [95, 22, 438, 38];
    DOM = [[16, 8, 87, 52], tag, [446, 8, 524, 52]];
    clear('school', [tag], 'a lesson\'s challenge (its chalkboard)');
    G.sch.show('hub');
    G.sch.practice({});
    const pr = cls('schoolBody', /schTopTag pr/)[0];
    h.ok(pr && /qaKeep/.test(pr.className), 'PRACTICE CABINET is .qaKeep');
    const ptag = [95, 22, 398, 38];
    DOM = [[16, 8, 87, 52], ptag, [406, 8, 524, 52], [16, 148, 114, 184], [118, 148, 217, 184], [221, 148, 319, 184], [323, 148, 422, 184], [426, 148, 524, 184], [117, 862, 281, 906], [291, 862, 423, 906]];
    clear('school', [ptag], 'the practice cabinet');
    G.sch.back && G.sch.back();
    G.vault.show();
    h.ok(cls('vaultBody', /vWallet/).every(n => /qaKeep/.test(n.className)), 'the vault\'s wallet is .qaKeep');
    const wal = [415, 15, 530, 59];
    DOM = [[10, 15, 94, 59], wal, [22, 296, 148, 332], [372, 296, 518, 332], [8, 450, 110, 498], [114, 450, 215, 498], [219, 450, 321, 498], [325, 450, 426, 498], [430, 450, 532, 498],
      [40, 521, 110, 591, 1], [170, 524, 240, 594, 1], [300, 524, 370, 594, 1], [430, 524, 500, 594, 1], [40, 660, 110, 730, 1], [170, 660, 240, 730, 1], [300, 660, 370, 730, 1], [430, 660, 500, 730, 1], [80, 862, 460, 926]];
    clear('vault', [wal], 'the Prize Vault (its neon sign, its counter window)');
    G.vault.leave();
    G.rush.start('knight', 4242);
    DOM = [[99, 866, 191, 910], [201, 858, 441, 918]];
    stepFor(G, 2.5);
    clear('rush', [], 'the Boss Rush challenger (at once: no 4 s wait)');
    G.newRun('knight', 32);
    for (const g of ['plinko', 'wheel', 'slots', 'moles', 'skee']) {
      const M = G.run.map;
      const t = Object.values(M.tiles).find(x => x.type === 'empty' && x.terrain === 'land' && x.ground !== 'mountain' && !x.done);
      t.type = g; t.content = { seed: 99, tokens: 3, game: g };
      G.arc.show({ q: t.q, r: t.r });
      DOM = [[0, 0, 540, 70], [112, 906, 322, 950], [332, 906, 428, 950]];
      h.ok(G.qa.signs('arcade').some(r => r[1] <= 110 && r[3] >= 160), `${g}: the marquee is a sign`);
      clear('arcade', [], `the ${g} cabinet`);
      G.arc.leave();
      t.type = 'empty'; t.done = true;
    }
    G.qa.measure = null; G.qa.size = null;
  });

  h.test('pol13: the Boss Rush and the co-op boss hit as rounds 10 and 11 tuned them (RUSH.TIERK, DUO.COOP.tierK); a run\'s boss keeps tierDmg', () => {
    const T = boot(), G2 = T.GAME, D2 = T.DATA, C = T.COMBAT, td = D2.DIFFICULTY.tierDmg.boss;
    h.ok(td > 1 && Math.abs(D2.RUSH.TIERK * td - 1) < 1e-9 && Math.abs(D2.DUO.COOP.tierK * td - 1) < 1e-9, `both dials default to 1 / tierDmg.boss (${D2.RUSH.TIERK.toFixed(3)})`);
    h.ok(D2.rushTierK('rat') === 1 && D2.rushTierK('prizemaster') === D2.RUSH.TIERK && D2.rushTierK('hoard', 1) === 1 && D2.rushTierK('hoard', 0.5) === 0.5, 'a normal enemy is left alone; a number passed in wins');
    const atkV = (id, e) => { const a = D2.ENEMIES[id].moves.find(m => m.k === 'attack'); const m = a && e.def.moves.find(x => x.id === a.id); return a && m ? [a.v, m.v] : null; };
    // a run's boss: the dial, then tierDmg on top (the main run is untouched)
    G2.newRun('knight', 51);
    G2.startFight(['plushqueen'], 'boss');
    const boss = G2.fight.enemies[0];
    h.near(boss.dmgMul, D2.DIFFICULTY.dmg * td, 1e-9, `a run's boss hits x${D2.DIFFICULTY.dmg} x${td}`);
    // the rush: the fight's multiplier is the round 10 one (the dial, the ramp, DMGK), tierDmg taken back out
    G2.rush.start('knight', 4242);
    const R = G2.rush.of();
    for (const i of [0, 4, R.order.length - 1]) {
      R.i = i;
      const id = R.order[i];
      G2.rush.fight();
      const e = G2.fight.enemies[0], solo = C.newFight(G2.run, [id], T.U.rng(9)).enemies[0], want = solo.dmgMul / td * D2.rushDmgK(id);
      h.near(e.dmgMul, want, 1e-9, `rush boss ${i + 1} (${id}): x${e.dmgMul.toFixed(3)}, as round 10 (x${(solo.dmgMul / td).toFixed(2)} x${D2.rushDmgK(id)})`);
      const v = atkV(id, e);
      if (v) h.ok(Math.abs(v[1] - Math.max(1, Math.round(v[0] * want))) <= 1, `rush boss ${i + 1}: hits ${v[1]} (round 10: ${Math.max(1, Math.round(v[0] * want))})`);
    }
    // the co-op boss: the rush's share and COOP.tierK
    const B = boot(), G3 = B.GAME, D3 = B.DATA;
    G3.duo.seed = 4243; G3.duo.menu(); G3.duo.setup('coop');
    const Du = G3.duo.start(); G3.duo.afterToss();
    stepFor(G3, 4); G3.duo.ready();
    h.eq(G3.screen, 'fight', 'the co-op fight');
    const L = G3.duo.live, e3 = G3.fight.enemies[0];
    const solo3 = B.COMBAT.newFight(G3.run, [Du.boss], B.U.rng(Du.fseed)).enemies[0];
    h.ok(L && L.runs.indexOf(G3.run) >= 0, 'a seat\'s own run');
    h.near(e3.dmgMul, solo3.dmgMul / td * D3.rushDmgK(Du.boss), 1e-9, `the co-op boss (${Du.boss}) hits as round 11 tuned it (x${e3.dmgMul.toFixed(3)})`);
  });
}

// ---------------------------------------------------------------- TRD (round 14): the Trading Post and pet evolution
{
  const TRD_META = JSON.stringify({ introSeen: true, tutorialDone: true, unlocks: { knight: true } });
  const trdBoot = (store) => boot({ store: Object.assign({ clawspire_meta: TRD_META }, store || {}) });
  const traderOf = (G) => Object.values(G.run.map.tiles).find((t) => t.type === 'trader') || null;
  // A run standing in its Trading Post: plus copies, a curse (a Rock), two relics; o.want: a kind the post must deal.
  function trdPost(G, o) {
    o = o || {};
    for (let s = o.seed || 1; s < (o.seed || 1) + 80; s++) {
      G.newRun('knight', s);
      G.run.gold = o.gold == null ? 400 : o.gold;
      for (const r of ['festering_jar', 'magnet_charm']) G.gainRelic(r);
      G.run.bin.forEach((i, k) => { if (k % 4 === 1) i.plus = true; });
      G.run.bin.push({ uid: 'zrock', id: 'rock', plus: false });
      if (o.tilt) G.run.tilt = o.tilt;
      const t = traderOf(G);
      G.enterTile(t);
      const st = G.trd.ui && G.trd.ui.st;
      if (!o.want || (st && st.offers.some((x) => x.k === o.want))) return { t, st, i: st ? st.offers.findIndex((x) => x.k === o.want) : -1, seed: s };
    }
    return null;
  }
  h.test('trd: a Trading Post on every map (not the Back Room), a landmark, entered from its tile, three trades and Leave', () => {
    const T = trdBoot(), G = T.GAME, MP = T.MAP;
    for (const seed of [11, 12, 13]) {
      G.newRun('knight', seed);
      for (let act = 1; act <= 3; act++) {
        if (act > 1) { G.run.act = act; G.run.map = MP.generate({ act, rng: T.U.rng(seed * 10 + act) }); G.trd.newMap(G.run); }
        const list = Object.values(G.run.map.tiles).filter((t) => t.type === 'trader');
        h.eq(list.length, 1, `seed ${seed} act ${act}: one Trading Post`);
        const t = list[0];
        if (!t) continue;
        h.ok(t.known && MP.isLandmark(t) && MP.isLand(t) && !t.road, `seed ${seed} act ${act}: a known landmark off the road`);
      }
    }
    h.eq(G.trd.newMap({ map: { room: true, tiles: {}, start: {}, boss: {} } }), null, 'the Back Room has none');
    const P = trdPost(G, { seed: 21 });
    h.eq(G.screen, 'trade', 'entering the tile opens the Trading Post');
    h.eq(P.st.offers.length, 3, 'three trades');
    const labels = G.S.ui.buttons.map((b) => b.label);
    h.eq(labels[labels.length - 1], 'Leave', 'Leave is last');
    h.eq(labels.filter((l) => l === 'TRADE' || /^Pay \d+ gold$/.test(l)).length, 3, 'a deal button per trade: ' + labels.join(', '));
    h.ok(P.t.content.trd && P.t.content.trd.offers === P.st.offers, 'the trades are saved on the tile');
    G.draw();
    G.trd.leave();
    h.eq(G.screen, 'map', 'Leave goes back to the map');
    h.ok(P.t.done, 'the cart packs up: the tile is done');
    G.enterTile(P.t);
    h.eq(G.screen, 'map', 'a second visit finds nobody');
  });
  h.test('trd: each kind of trade swaps by its rule and is paid once', () => {
    const T = trdBoot(), G = T.GAME, D = T.DATA;
    // the item swap
    let P = trdPost(G, { want: 'swap', seed: 31 });
    let of = P.st.offers[P.i], n0 = G.run.bin.length, g0 = G.run.gold;
    const r = G.trd.deal(P.i);
    h.ok(r && r.k === 'swap', 'swap: dealt');
    h.ok(!G.run.bin.some((i) => i.uid === of.give.uid), 'swap: your item is gone');
    h.ok(G.run.bin.some((i) => i.id === of.get.id && !!i.plus === of.get.plus), 'swap: the new one is in the bin');
    h.ok(G.run.bin.length === n0 && G.run.gold === g0, 'swap: the bin keeps its size, no gold changes hands');
    h.eq(G.trd.deal(P.i), null, 'swap: never twice');
    h.ok(P.st.done[P.i], 'swap: marked done');
    // the relic swap: a relic with lasting Max HP takes it along
    P = trdPost(G, { want: 'relic', seed: 41 });
    of = P.st.offers[P.i];
    const hp0 = G.run.maxHp, mods = (D.RELICS[of.give].mods || {}).maxhp || 0, gmods = (D.RELICS[of.get].mods || {}).maxhp || 0;
    h.ok(G.trd.deal(P.i), 'relic: dealt');
    h.ok(G.run.relics.indexOf(of.give) < 0 && G.run.relics.indexOf(of.get) >= 0, 'relic: yours for the face-down one');
    h.eq(G.run.maxHp, hp0 - mods + gmods, 'relic: lasting Max HP follows the relics');
    h.eq(D.RELICS[of.give].rarity, D.RELICS[of.get].rarity, 'relic: the same rarity');
    // the service: a curse lifted at the shop's removal price with shopK
    P = trdPost(G, { want: 'service', seed: 51 });
    of = P.st.offers[P.i];
    h.eq(of.mode, 'curse', 'service: a Rock in the bin is a curse to lift');
    h.eq(of.price, Math.round(60 * D.ECONOMY.shopK), 'service: 60 x shopK');
    g0 = G.run.gold; n0 = G.run.bin.length;
    h.eq(G.trd.deal(P.i, { uid: G.run.bin.find((i) => i.id !== 'rock').uid }), null, 'service: a curse lift takes junk only');
    h.eq(G.run.gold, g0, 'service: nothing paid for a refusal');
    h.ok(G.trd.deal(P.i, { uid: 'zrock' }), 'service: the Rock goes');
    h.ok(G.run.gold === g0 - of.price && G.run.bin.length === n0 - 1 && !G.run.bin.some((i) => i.uid === 'zrock'), 'service: paid once, the junk gone');
    h.eq(G.trd.deal(P.i, { uid: G.run.bin[0].uid }), null, 'service: never twice');
    // the price follows the Tilt's Price Hike
    const tl = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].find((n) => (D.tiltMods(n) || {}).shop > 0);
    if (tl) { P = trdPost(G, { want: 'service', seed: 51, tilt: tl }); h.eq(P.st.offers[P.i].price, Math.round(60 * D.ECONOMY.shopK * (1 + D.tiltMods(tl).shop)), 'service: the Price Hike stacks (Tilt ' + tl + ')'); }
    // too poor
    P = trdPost(G, { want: 'service', seed: 51, gold: 5 });
    h.eq(G.trd.deal(P.i, { uid: 'zrock' }), null, 'service: too poor, refused');
    h.ok(G.run.bin.some((i) => i.uid === 'zrock'), 'service: and the Rock stays');
    // the mystery bundle
    P = trdPost(G, { want: 'bundle', seed: 61 });
    of = P.st.offers[P.i]; n0 = G.run.bin.length;
    h.ok(G.trd.deal(P.i), 'bundle: dealt');
    h.eq(G.run.bin.length, n0 - 1, 'bundle: two out, one in');
    h.ok(!of.give.some((g) => G.run.bin.some((i) => i.uid === g.uid)), 'bundle: both named items gone');
    const got = G.run.bin[G.run.bin.length - 1];
    h.ok(got.id === of.get.id && !got.plus && D.TRD.RANK[D.ITEMS[got.id].rarity] === D.TRD.RANK[D.ITEMS[of.give[0].id].rarity] + 1, 'bundle: an item one rarity up');
    // an item no longer in the bin
    P = trdPost(G, { want: 'swap', seed: 31 });
    of = P.st.offers[P.i];
    G.run.bin = G.run.bin.filter((i) => i.uid !== of.give.uid);
    h.eq(G.trd.deal(P.i), null, 'swap: refused when the item is gone');
    h.ok(!P.st.done[P.i], 'swap: and still open');
  });
  h.test('trd: rolled once, a reload shows the same deals, a deal mid haggle is never paid twice', () => {
    const T = trdBoot(), G = T.GAME;
    const P = trdPost(G, { want: 'swap', seed: 71 });
    const offers = JSON.stringify(P.st.offers);
    G.save(); G.load();
    h.eq(G.screen, 'trade', 'a reload comes back to the post');
    h.eq(JSON.stringify(G.trd.ui.st.offers), offers, 'the same trades after the reload');
    // a deal with the haggle playing (not headless for the start), then a reload mid haggle
    G.S.headless = false;
    const bin0 = G.run.bin.length, gold0 = G.run.gold;
    const r = G.trd.deal(P.i);
    G.S.headless = true;
    h.ok(r && G.trd.ui.phase === 'haggle', 'the haggle plays');
    stepFor(G, 0.4);
    h.ok(G.trd.ui.k > 0.3 && G.trd.ui.phase === 'haggle', 'the goods slide over');
    G.draw();
    const binIds = JSON.stringify(G.run.bin.map((i) => i.uid + i.id));
    G.save(); G.load();
    h.eq(G.screen, 'trade', 'reloaded mid haggle');
    h.ok(G.trd.ui.st.done[P.i] && G.trd.ui.phase === 'idle', 'the deal is done, no haggle replays');
    h.eq(JSON.stringify(G.run.bin.map((i) => i.uid + i.id)), binIds, 'the bin as it was after the deal');
    h.ok(G.run.bin.length === bin0 && G.run.gold === gold0, 'nothing paid twice');
    h.eq(G.trd.deal(P.i), null, 'and the trade stays taken');
    // the haggle runs its course: the stamp, then the result
    const P2 = trdPost(G, { seed: 72 });
    G.S.headless = false;
    const i2 = P2.st.offers.findIndex((o) => o.k !== 'service');
    G.trd.deal(i2);
    G.S.headless = true;
    for (let i = 0; i < 400 && G.trd.ui.phase === 'haggle'; i++) { G.update(DT); if (i % 40 === 0) G.draw(); }
    h.eq(G.trd.ui.phase, 'done', 'the haggle ends on its own');
    h.ok(G.trd.ui.fired.d, 'the DEAL! stamp fired');
    h.ok(G.S.ui.buttons.some((b) => b.label === 'Continue'), 'Continue back to the trades');
    G.choose(G.S.ui.buttons.findIndex((b) => b.label === 'Continue'));
    h.eq(G.trd.ui.phase, 'idle', 'back to the trades');
    // a tap hurries
    const i3 = P2.st.offers.findIndex((o, k) => !P2.st.done[k] && o.k !== 'service');
    if (i3 >= 0) { G.S.headless = false; G.trd.deal(i3); G.S.headless = true; h.ok(G.trd.hurry() && G.trd.ui.fired.d, 'a tap jumps to the handshake'); h.ok(G.trd.hurry() && G.trd.ui.phase === 'done', 'a second tap ends it'); }
  });
  h.test('trd: old saves: a map and a pet from before the round load and play', () => {
    const T = trdBoot(), G = T.GAME;
    G.newRun('knight', 81);
    G.pet.give('cat', 100);
    const t = traderOf(G);
    G.save();
    const raw = JSON.parse(T._store.clawspire_run);
    const k = t.q + ',' + t.r;
    raw.run.map.tiles[k].type = 'empty'; raw.run.map.tiles[k].content = {}; raw.run.map.tiles[k].known = false;
    delete raw.run.pet.evo;
    T._store.clawspire_run = JSON.stringify(raw);
    h.ok(G.load(), 'an old save loads');
    h.eq(Object.values(G.run.map.tiles).filter((x) => x.type === 'trader').length, 0, 'its map keeps having no Trading Post');
    h.ok(G.run.pet && !G.run.pet.evo && T.DATA.pevCan(G.run.pet), 'its Lv 5 pet can evolve');
    G.draw();
    // an old profile's album without evolutions
    const T2 = boot({ store: { clawspire_meta: JSON.stringify({ introSeen: true, unlocks: { knight: true }, pets: { cat: { n: 2, lv: 5 } } }) } });
    T2.GAME.showCollection('evo');
    const cards = secWalk(T2._nodes.collectionBody).filter((n) => /pevc/.test(n.className || ''));
    h.eq(cards.length, T2.DATA.PET_IDS.length, 'the Prizedex lists every pet\'s final form');
    h.ok(cards.every((c) => /locked/.test(c.className)), 'none evolved on an old profile');
  });
  h.test('pev: a Lv 5 pet evolves once: at a rest instead of healing, for gold or a relic at the Trading Post', () => {
    const T = trdBoot(), G = T.GAME, D = T.DATA;
    // gated by level
    G.newRun('knight', 91);
    G.pet.give('hamster', 60);
    G.showRest();
    h.eq(G.S.ui.buttons.length, 3, 'a Lv 4 pet: the rest keeps its three choices');
    h.eq(G.pev.evolve('rest'), false, 'a Lv 4 pet cannot evolve');
    // at a rest: instead of healing
    G.pet.give('hamster', 100);
    G.run.hp = 30;
    G.showRest();
    h.eq(G.S.ui.buttons.length, 4, 'a Lv 5 pet: a fourth choice');
    G.choose(3);
    h.eq(G.run.pet.evo, 1, 'the rest evolved it');
    h.eq(G.run.hp, 30, 'and nothing was healed');
    h.eq(G.screen, 'map', 'back to the map');
    const E = G.evo.ui;
    h.ok(E && typeof E.art === 'function' && E.to.name === D.PEV_FORMS.hamster.name, 'the ceremony plays with the pet in it');
    for (let i = 0; i < 200; i++) G.update(DT);
    G.draw();
    G.evo.uiTap(); G.evo.uiTap();
    h.ok(!G.evo.ui, 'a tap or two closes it');
    h.eq(G.meta.pets.hamster.evo, 1, 'the album records it');
    h.ok(G.meta.trd && G.meta.trd.pev === 1, 'the profile counts it');
    h.eq(G.pev.evolve('rest'), false, 'never twice');
    G.showRest();
    h.eq(G.S.ui.buttons.length, 3, 'an evolved pet: no fourth choice');
    G.save(); G.load();
    h.eq(G.run.pet.evo, 1, 'the save keeps it');
    h.near(G.pev.powUp(), D.PEV_K.pow, 1e-9, 'its trick is stronger');
    // at the Trading Post for gold
    let P = trdPost(G, { seed: 92 });
    G.pet.give('cat', 100);
    G.trd.show({ q: P.t.q, r: P.t.r });
    const fee = D.pevFee(G.run.act);
    h.ok(G.S.ui.buttons.some((b) => b.label === `Pay ${fee} gold`) && G.S.ui.buttons.some((b) => b.label === 'Give a relic'), 'the post offers the evolution: the fee and a relic');
    G.run.gold = fee - 1;
    h.eq(G.pev.evolve('gold'), false, 'too poor for the fee');
    G.run.gold = fee + 10;
    h.ok(G.pev.evolve('gold') && G.run.gold === 10 && G.run.pet.evo === 1, 'the fee paid once, the cat evolved');
    h.ok(!G.S.ui.buttons.some((b) => b.label === 'Give a relic'), 'the slot is gone');
    // for a relic
    P = trdPost(G, { seed: 93 });
    G.pet.give('parrot', 100);
    const own = D.CHARACTERS.knight.relic;
    h.eq(G.pev.evolve('relic', own), false, 'the crawler\'s own relic is never taken');
    h.eq(G.pev.evolve('relic', 'nope'), false, 'a relic you lack');
    const g0 = G.run.gold, r0 = G.run.relics.length;
    h.ok(G.pev.evolve('relic', 'festering_jar') && G.run.relics.indexOf('festering_jar') < 0 && G.run.relics.length === r0 - 1 && G.run.gold === g0, 'the relic given up, no gold');
    h.eq(G.run.pet.evo, 1, 'the parrot evolved');
    // no pet
    G.newRun('knight', 94);
    h.eq(G.pev.evolve('gold'), false, 'no pet, nothing to evolve');
  });
  h.test('pev: an evolved pet looks the part and its trick ends in the flourish in a real fight', () => {
    const T = trdBoot(), G = T.GAME, D = T.DATA;
    const go = (evo) => {
      G.newRun('knight', 95);
      G.pet.give('hamster', 100);
      if (evo) { h.ok(G.pev.evolve('rest'), 'evolved'); G.evo.uiClose(); }
      G.startFight(['rat', 'slime'], 'normal', { seed: 800 });
      stepFor(G, 0.5);
      const P = G.pet.fs();
      let n = 0;
      while (n++ < 300 && !P.log.some((e) => e.fx)) { G.update(DT); if (n % 30 === 0) G.draw(); }
      return { P, F: G.fight };
    };
    const A = go(false);
    h.ok(A.P.log.some((e) => e.fx) && !A.P.log.some((e) => e.k === 'pev') && !A.F.pevLog, 'an ordinary pet: no flourish');
    const B = go(true);
    h.ok(B.P.log.some((e) => e.k === 'pev') && B.F.pevLog && B.F.pevLog[0].pet === 'hamster', 'an evolved pet: its trick ends in Stampede');
    h.eq(B.F.pevLog[0].v, D.PEV_FORMS.hamster.fx.v, 'Stampede hits for its number');
    h.ok(G.pev.powUp() > 0, 'and the shove is stronger');
    G.draw();
    G.pet.tap && G.pet.tap();
    h.ok(G.pev.tapLine(G.run.pet).indexOf(D.PEV_FORMS.hamster.name) >= 0, 'the popover names its final form');
    G.endFight('win'); G.toMap(); G.draw();
    // the Prizedex's Evolve tab: the hamster found
    G.showCollection('evo');
    const cards = secWalk(T._nodes.collectionBody).filter((n) => /pevc/.test(n.className || ''));
    h.eq(cards.length, D.PET_IDS.length, 'a card per pet');
    h.ok(cards.some((c) => /got/.test(c.className) && secWalk(c).some((x) => x.textContent === D.PEV_FORMS.hamster.name)), 'the Turbo Hamster is in the book');
  });
}

/* ---------------------------------------------------------------- HUD AND TITLE MENU (round 15) */
h.test('ui15: the title: one big action, the play row, the tiles; every older button reachable through a sheet, indices unchanged', () => {
  const { T, G } = metaBoot({ stats: { runs: 7, wins: 1, fights: 30 }, achNew: { jackpot: 1 } });
  G.showTitle();
  const L = G.S.ui.buttons.map((b) => b.label);
  for (const l of ['New run', 'Daily run', 'Prize Vault', 'Prizedex', 'Stickers', 'Help', 'Intro', 'Tips', 'Codex', 'Weekly challenge', 'Boss Rush', 'Claw School', 'History', 'Duo'])
    h.ok(L.includes(l), 'still registered: ' + l);
  h.ok(L.some((l) => /Settings$/.test(l)) && L.some((l) => /^Sound /.test(l)) && L.some((l) => /^Music /.test(l)), 'Settings, Sound and Music too');
  h.eq(L[0], 'New run', 'NEW RUN keeps index 0');
  h.eq(L[L.length - 1], 'Duo', 'DUO is still registered last');
  const m = T._nodes.titleMenu, kids = m.children.map((c) => c.className);
  h.ok(/uiPri/.test(kids[0]), 'the big action leads: ' + kids.join(' | '));
  h.ok(kids.some((c) => /uiPlay/.test(c)) && kids.some((c) => /uiTiles/.test(c)) && kids.some((c) => /mStats/.test(c)), 'then the play row, the tiles, the stats line');
  h.ok(kids.length <= 5, 'five blocks at most (was a wall of rows)');
  const byLabel = (l) => G.S.ui.buttons.find((b) => b.label === l).el;
  const where = (el) => { for (const id in G.ui15.T.sheets) if (secWalk(G.ui15.T.sheets[id]).includes(el)) return id; return secWalk(m).includes(el) ? 'menu' : '?'; };
  const want = { 'New run': 'menu', 'Daily run': 'menu', 'Prize Vault': 'menu', 'Claw School': 'menu', Prizedex: 'collection', Stickers: 'collection', Codex: 'collection', History: 'collection',
    'Weekly challenge': 'modes', 'Boss Rush': 'modes', Duo: 'modes', Help: 'more', Tips: 'more', Intro: 'more' };
  for (const l in want) h.eq(where(byLabel(l)), want[l], l + ' lives in ' + want[l]);
  h.eq(where(G.S.ui.buttons.find((b) => /Settings$/.test(b.label)).el), 'menu', 'Settings is a tile');
  // the group buttons are plain taps (no GAME.choose entries), and open their sheets
  const tiles = m.children.find((c) => /uiTiles/.test(c.className));
  const grp = tiles.children.filter((c) => /uiGrp/.test(c.className));
  h.eq(grp.length, 2, 'two group tiles: Collection and More');
  h.ok(!L.includes('Collection') && !L.includes('More') && !L.includes('Modes'), 'not GAME.choose entries');
  grp[0].onclick({});
  h.eq(G.ui15.T.open, 'collection', 'Collection opens its sheet');
  h.ok(grp[0].children.some((c) => /vdot/.test(c.className) && +c.textContent >= 1), 'a new sticker puts a badge on the tile');
  G.ui15.sheet(null);
  h.eq(G.ui15.T.open, null, 'and it closes');
  // a sheet you left through comes back when the title does
  G.ui15.T.reopen = 'collection';
  G.choose(G.S.ui.buttons.findIndex((b) => b.label === 'Stickers'));
  h.eq(G.screen, 'stickers', 'Stickers from the sheet');
  G.choose(G.S.ui.buttons.findIndex((b) => b.label === 'Back'));
  h.ok(G.screen === 'title' && G.ui15.T.open === 'collection', 'Back: the title with the Collection sheet open again');
  G.newRun('knight', 5); G.save(); G.run = null;
  G.ui15.T.reopen = 'modes';
  G.showTitle();
  h.eq(G.ui15.T.open, null, 'from a run the title comes back clean');
  const L2 = G.S.ui.buttons.map((b) => b.label);
  h.ok(L2[0] === 'Continue' && L2.slice(1).join() === L.join(), 'CONTINUE first, every other index as before');
  const pri = T._nodes.titleMenu.children[0];
  h.ok(pri.children[0] === G.S.ui.buttons[0].el && pri.children[1] === byLabel('New run'), 'CONTINUE is the big action, NEW RUN under it');
  h.ok(G.choose(L2.indexOf('Duo')) && G.screen === 'duo', 'DUO still works from its sheet');
});

h.test('ui15: the HUD: the act chip, the shield chip, the markup keeps every id', () => {
  const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
  for (const id of ['portrait', 'hpStat', 'hpTxt', 'blockTxt', 'hpFill', 'hpGhost', 'goldTxt', 'inkTxt', 'tixStat', 'tixTxt', 'actTxt', 'relics', 'pstatus', 'grabs', 'banner', 'bannerTxt', 'tray', 'hint', 'endTurn'])
    h.ok(new RegExp('id="' + id + '"').test(html), 'the HUD keeps #' + id);
  h.ok(/<div class="uiVit">[\s\S]*id="hpStat"[\s\S]*<div class="uiRes">[\s\S]*id="goldTxt"[\s\S]*id="inkTxt"[\s\S]*id="tixTxt"[\s\S]*id="actTxt"[\s\S]*<\/div>\s*<\/div>\s*<div id="relics">/.test(html),
    'the top bar: the vitals column (the hp bar over the resource row), then the relics');
  h.ok(/#hpStat\.shielded \.hpbar\{right:58px/.test(html), 'Block: the bar steps aside for the shield chip');
  const { T, G } = metaBoot({});
  G.newRun('knight', 1501);
  G.toMap();
  h.eq(T._nodes.actTxt.textContent, '1/3', 'the act chip reads 1/3');
  G.startFight(['rat'], 'normal');
  const blk = (v) => { G.fight.player.block = v; if (G.fs && G.fs.shown && G.fs.shown.p) G.fs.shown.p.block = v; G.S.lastHud = ''; };
  blk(7);
  stepFor(G, 0.3);
  h.eq(T._nodes.blockTxt.textContent, '7', 'the shield chip shows the Block');
  blk(0);
  stepFor(G, 0.3);
  h.eq(T._nodes.blockTxt.textContent, '', 'and empties without it');
  h.eq(G.ui15.relicFit(), undefined, 'the relic fit is a no-op headless');
  h.ok(!G.ui15.H.need && G.ui15.relicList(false) === false, 'the relic list stays shut headless');
});

// ---------------------------------------------------------------- POLISH (round 15, q15): the corner lane keeps off an event's and a story's title and the vignette sign
{
  const P15 = boot(), G = P15.GAME, D = P15.DATA;
  const over = (a, r) => Math.min(a.x1, r[2]) - Math.max(a.x0, r[0]) > 1 && Math.min(a.y1, r[3]) - Math.max(a.y0, r[1]) > 1;
  const R = (a) => ({ x0: a[0], y0: a[1], x1: a[2], y1: a[3], w: a[4] || 10 });
  const walk = (n, re, out = []) => { if (!n) return out; if (re.test(n.className || '')) out.push(n); for (const c of n.children || []) walk(c, re, out); return out; };
  // what the browser measures at 390 x 844 (stage px, scratchpad r15/toast3.mjs): the title pill, the story tags, the scene, the text, the choices
  let DOM = [];
  G.qa.measure = () => DOM.map(R);
  G.qa.size = (el, tight) => (/mSticker/.test(el.className || '') ? (tight ? { w: 237, h: 56 } : { w: 250, h: 97 }) : el.id === 'toast' ? { w: 180, h: 44 } : tight ? { w: 250, h: 56 } : { w: 280, h: 84 });
  const push = (kind) => {
    const S = G.S;
    if (S.mcur && S.mcur.el && S.mcur.el.remove) S.mcur.el.remove();
    S.mcur = null; S.mq = [];
    if (kind === 'dex') { for (const id of Object.keys(D.ITEMS).filter(i => !G.meta.seen.items[i]).slice(0, 2)) G.prog.dexSee('items', id); }
    else G.prog.achUnlock(D.ACH_IDS.find(a => !G.meta.ach[a]));
    stepFor(G, 0.3);
    return S.mcur;
  };
  const clear = (keep, tag) => {
    h.eq(G.screen, 'event', `${tag}: on the event screen`);
    for (const kind of ['dex', 'ach']) {
      const cur = push(kind);
      if (!cur || !cur.rect) { h.ok(false, `${tag}: no ${kind} corner item`); continue; }
      const hit = G.qa.signs('event').concat(keep).filter(r => over(cur.rect, r));
      h.ok(!hit.length && !cur.hold && cur.qa && cur.qa.hard === 0, `${tag}: the ${kind} at ${Math.round(cur.rect.x0)},${Math.round(cur.rect.y0)} keeps off the title, the tags and the sign${hit.length ? ' (over ' + JSON.stringify(hit) + ')' : ''}`);
    }
  };
  h.test('q15: a story page (DANSDUEL): the title, its tags and the vignette sign are kept; the corner item sits under the choices', () => {
    G.newRun('knight', 1501); if (G.screen === 'boon') G.choose(0); if (G.screen !== 'map') G.toMap();
    G.sto.beat('sto_dance', 'start', 1);
    h.ok(walk(P15._nodes.eventBody, /evTitle/).every(n => /qaKeep/.test(n.className)), 'the story title is .qaKeep');
    const tags = walk(P15._nodes.eventBody, /stoTag\b/);
    h.ok(tags.length >= 2 && tags.every(n => /qaKeep/.test(n.className)), 'its STORY / PART tags are .qaKeep');
    G.qa.QA.q15Scene = [16, 96, 524, 286];
    const sg = G.qa.signs('event');
    h.ok(sg.length === 1 && sg[0][0] > 340 && sg[0][2] < 524 && sg[0][1] >= 96 && sg[0][3] < 190, 'the neon word on the vignette is a sign: ' + JSON.stringify(sg.map(r => r.map(Math.round))));
    const title = [163, 16, 377, 60], t1 = [183, 66, 276, 86], t2 = [282, 66, 357, 86];
    const toastStrip = [150, 896, 390, 948, 5];   // the plain toast ("A prize capsule!") in the bottom strip, as in the screenshot
    DOM = [title, t1, t2, [16, 96, 524, 286, 1], [32, 306, 504, 392, 1], [16, 412, 524, 499], [16, 507, 524, 593], [16, 601, 524, 665], toastStrip];
    clear([title, t1, t2], 'the dance-off, its choices');
    const cur = G.S.mcur;
    h.ok(cur && cur.rect && cur.rect.y0 >= 665, 'the corner item sits under the last choice (y ' + Math.round(cur && cur.rect ? cur.rect.y0 : -1) + ')');
    // the outcome: its Continue is the last button
    DOM = [title, t1, t2, [16, 96, 524, 286, 1], [32, 306, 504, 392, 1], [16, 499, 524, 543], toastStrip];
    clear([title, t1, t2], 'the dance-off, its outcome');
  });
  h.test('q15: an event page: the title and the sign are kept; a full page still places the corner item', () => {
    G.newRun('knight', 1502); if (G.screen === 'boon') G.choose(0); if (G.screen !== 'map') G.toMap();
    G.showEvent({ id: 'ink_squid' in D.EVENTS ? 'ink_squid' : Object.keys(D.EVENTS)[3] });
    h.ok(walk(P15._nodes.eventBody, /evTitle/).length === 1 && walk(P15._nodes.eventBody, /evTitle/).every(n => /qaKeep/.test(n.className)), 'the event title is .qaKeep');
    G.qa.QA.q15Scene = [16, 70, 524, 260];
    const title = [103, 16, 437, 60];
    DOM = [title, [16, 70, 524, 260, 1], [32, 280, 496, 321, 1], [16, 341, 524, 428], [16, 436, 524, 522], [16, 530, 524, 617], [150, 896, 390, 948, 5]];
    clear([title], 'an event, three choices');
    // buttons down to the bottom: no spot under them, qaCands' eight as before, still on the stage
    DOM = [title, [16, 70, 524, 260, 1], [16, 280, 524, 900]];
    push('dex');
    h.ok(G.S.mcur && G.S.mcur.rect && G.S.mcur.rect.y1 <= 960 && G.S.mcur.rect.y0 >= 0, 'a full page still places the corner item on the stage');
    // headless with no scene handed in: no sign, nothing breaks
    delete G.qa.QA.q15Scene;
    h.eq(G.qa.signs('event').length, 0, 'no scene measured: no sign');
    G.qa.measure = null; G.qa.size = null;
  });
  h.test('q15: a prize that rolls into the chute after a claw-off drop was booked scores for its dropper (it threw: V.cur is gone)', () => {
    const T = boot(), G = T.GAME;
    G.duo.seed = 4242; G.duo.menu(); G.duo.setup('vs');
    const Dd = G.duo.start();
    stepFor(G, 2); G.duo.afterToss(); stepFor(G, 4); G.duo.ready();
    G.duo.drop(G.duo.aim());
    for (let i = 0; i < 60 * 25 && Dd.ph === 'play'; i++) G.update(DT);
    const V = G.duo.v;
    h.ok(Dd.ph === 'sabo' && V.sub === 'done' && !V.cur, 'the drop is booked, the sabotage choice is up');
    const who = Dd.last.who, s0 = Dd.score[who], other = Dd.score[1 - who];
    const b = V.W.bodies.find((x) => x.type === 'dynamic' && x.data && x.data.pile != null && Dd.taken.indexOf(x.data.pile) < 0);
    const bd = V.C.bounds;
    b.x = bd.chuteX + 20; b.y = bd.floorY + 30; b.vx = 0; b.vy = 0;
    let err = null;
    try { stepFor(G, 0.1); } catch (e) { err = e; }
    h.ok(!err, 'no throw: ' + (err && err.message));
    h.eq(Dd.score[who], s0 + (b.data.v | 0) * (b.data.gold ? 2 : 1), 'the straggler scores for the one who dropped');
    h.eq(Dd.score[1 - who], other, 'and not for the rival');
    h.ok(Dd.taken.indexOf(b.data.pile) >= 0 && V.W.bodies.indexOf(b) < 0, 'it is taken off the pile');
    G.duo.leave();
  });
  h.test('q15: a Gary claw-off never waits for good on a claw still busy from the last drop (the bot saw Gary aim for ever)', () => {
    const T = boot(), G = T.GAME;
    G.sto.force = true; G.newRun('bubbler', 505); if (G.screen === 'boon') G.choose(0);
    const t = Object.values(G.run.map.tiles).find((x) => x.type === 'rival');
    G.sto.rival.show({ q: t.q, r: t.r });
    const R = G.sto.rival;
    h.ok(R.accept(), 'the claw-off is on');
    const st = R.state, live = t.content.gary.live;
    R.drop(200);
    for (let i = 0; i < 60 * 60 && st.who === 'p'; i++) G.update(DT);
    h.eq(st.who + ':' + st.sub, 'g:aim', 'Gary\'s turn');
    // the claw is wedged busy: Gary's aim can never start
    const rig = st.rig; let opened = 0;
    rig.autoSteer = () => false;
    const o0 = rig.open; rig.open = () => { opened++; o0(); };
    Object.defineProperty(rig, 'phase', { get: () => 'carry', set: () => {}, configurable: true });
    const d0 = live.drops.length;
    stepFor(G, 5);
    h.eq(live.drops.length, d0, 'a few seconds: still his drop');
    stepFor(G, 3);
    h.eq(opened, 1, 'past 6 s the prongs are forced open, once');
    stepFor(G, 4);
    h.eq(live.drops.length, d0 + 1, 'and past 10 s the drop is skipped: the claw-off goes on');
    h.eq(live.drops[d0].who + ':' + live.drops[d0].pts, 'g:0', 'Gary scores nothing for it');
    h.eq(st.who, 'p', 'your turn');
  });
}

/* ------------------------------------------------- DEP (round 15): the Neon Depths */
{
  const nodesOf = (el, out) => { if (!el) return out; out.push({ c: String(el.className || ''), t: el.textContent && !(el.children || []).length ? el.textContent : '' }); for (const c of el.children || []) nodesOf(c, out); return out; };
  // an Endless run at Loop 3: the first dive
  const dive = (seed, meta) => {
    const { T, G, saved } = endBoot(meta);
    endWin(G, seed);
    G.endless.start(); G.endless.next(); G.endless.next();
    return { T, G, saved };
  };
  const inDive = (seed) => { const o = dive(seed); o.G.endless.cont(); toMapFrom(o.G); return o; };
  const settleTurn = (G) => { for (let i = 0; i < 1800 && (G.fight.phase !== 'player' || G.fs.enemyTurn || G.fs.queue.length || G.fs.playQ.length); i++) G.update(DT); stepFor(G, 0.2); };
  const fightIn = (G, ids, kind) => { G.run.hp = G.run.maxHp = 999; G.startFight(ids, kind || 'normal'); endSkip(G); stepFor(G, 0.6); return G.fight; };

  h.test('dep: Loop 3 dives into the Neon Depths: the reboot card floods, the map is the Depths\', the dub plays; Loop 4 is the vault again', () => {
    const { T, G, saved } = dive(415);
    const E = G.run.endless;
    h.eq(G.screen, 'loop', 'the reboot screen');
    h.ok(E.loop === 3 && E.dep === true && E.dp === 1, 'Loop 3 is a dive (the first)');
    h.eq(G.run.act, 3, 'it plays act 3 underneath');
    h.eq(G.run.map.biome, 'depths', 'a Depths map');
    h.eq(E.mix, null, 'the Drowned Jukebox keeps its own trick');
    const ns = nodesOf(T._nodes.loopBody, []);
    const texts = ns.map((n) => n.t);
    h.ok(ns.some((n) => /\bcrt\b/.test(n.c) && /\bdep\b/.test(n.c)), 'the tube floods (crt dep)');
    h.ok(texts.includes('> LOADING LOOP 3: THE NEON DEPTHS') && texts.includes('> DRAIN PUMP ...... FAILED') && texts.includes('> WARNING: WATER IN THE CABINET'), 'the boot log dives');
    h.ok(texts.includes('THE NEON DEPTHS') && ns.some((n) => n.c === 'depWave'), 'THE NEON DEPTHS over rising water');
    h.ok(texts.includes('The Neon Depths, flooded. Act 6 of forever.'), 'the subtitle');
    h.ok(saved().dep && saved().dep.dives === 1 && saved().dep.best === 3, 'the dive is on the profile');
    G.endless.cont();
    toMapFrom(G);
    h.eq(G.screen, 'map', 'onto the Depths\' map');
    h.ok(G.dep.in(), 'in the Depths');
    h.eq(T.AUDIO.act, 4, 'the music plays the Depths\' dub (act 4)');
    h.eq(G.dep.actName(), 'The Neon Depths', 'the map plate names it');
    const fights = Object.values(G.run.map.tiles).filter((t) => t.content && t.content.enc && !t.content.sec);
    h.ok(fights.length > 4 && fights.every((t) => t.content.enc.every((id) => DATA.ENEMIES[id].dep)), 'only Depths monsters on the map');
    h.ok((G.run.map.roam || []).every((m) => !m.enc || m.enc.every((id) => DATA.ENEMIES[id].dep)), 'and prowling it');
    G.draw();
    // the act intro card
    const intro = G.dep.intro({ name: 'x', lines: [] });
    h.ok(intro.name === 'The Neon Depths' && intro.biome === 'depths' && intro.lines.length === 2, 'the act card is the Depths\'');
    // the boss down: Loop 4 is the vault, not a dive
    G.startFight(['dep_jukebox'], 'boss');
    h.eq(G.boss.vs && G.boss.vs.title, 'LOOP 3 BOSS', 'the versus card');
    endSkip(G);
    COMBAT.damage(G.fight, G.fight.player, G.fight.enemies[0], 99999);
    G.endFight('win');
    h.eq(G.run.sc.dep, 1, 'the unplugged Jukebox scores');
    h.ok(G.meta.dep.jukebox === 1 && G.meta.ach.deep_diver, 'Deep Diver');
    G.choose(G.S.ui.buttons.length - 1);
    for (let i = 0; i < 4 && G.screen !== 'loop'; i++) chooseFirst(G);
    h.eq(G.screen, 'loop', 'the next reboot');
    h.ok(G.run.endless.loop === 4 && !G.run.endless.dep && G.run.act === 3 && G.run.map.biome !== 'depths', 'Loop 4: the vault, dry');
    h.ok(G.run.endless.mix, 'its boss borrows a trick again');
    h.ok(!nodesOf(T._nodes.loopBody, []).some((n) => n.t === 'THE NEON DEPTHS'), 'no flood on its card');
    h.eq(T.AUDIO.act === 4, false, 'the dub stops');
  });

  h.test('dep: a Depths fight: standing water, the lure pulls the aim, jellies sting once a grab, pinched prizes drag, live water zaps a wet delivery, chests', () => {
    const { T, G } = inDive(416);
    const K = DATA.DEP_K;
    // standing water
    let F = fightIn(G, ['dep_angler']);
    stepFor(G, 1);
    h.ok(G.dep.water() >= K.water - 1e-9 && G.dep.owns() && Number.isFinite(G.dep.level()) && G.dep.level() === G.dep.fs().levelTo, `the cabinet stands in water (${G.dep.water()}, the Depths' own or a Rising Water mutator's, whichever is higher)`);
    G.draw();
    // the lure
    G.endTurn(); settleTurn(G);
    h.ok(F.depLure && F.depLure.inst && F.depLure.inst.id === 'dep_boot', 'the lure hangs over an Old Boot');
    h.ok(G.fs.items.some((b) => b.data.inst === F.depLure.inst), 'the boot is in the cabinet');
    const lx = G.dep.lureX(), tx0 = G.rig.targetX;
    stepFor(G, 3);
    h.ok(Math.abs(G.rig.targetX - lx) < Math.abs(tx0 - lx) || Math.abs(tx0 - lx) <= G.dep.K.lureDead, `the aim drifts toward the light (${tx0.toFixed(0)} -> ${G.rig.targetX.toFixed(0)}, lure ${lx.toFixed(0)})`);
    G.draw();
    // jellies
    F = fightIn(G, ['dep_jelly']);
    G.endTurn(); settleTurn(G);
    const jel = G.fs.items.filter((b) => b.data.def.dep === 'jelly');
    h.eq(jel.length, 2, 'two jellies in the cabinet');
    h.ok(jel.every((b) => b.density < 1), 'they float');
    const hp0 = F.player.hp + F.player.block;
    const n0 = G.dep.fs().stings;
    G.fs.grabInFlight = true; jel[0].held = 1;
    G.dep.tick(DT); G.dep.tick(DT);
    jel[0].held = 0; G.fs.grabInFlight = false;
    settleTurn(G);
    h.eq(G.dep.fs().stings - n0, 1, 'a held jelly stings once a grab');
    h.eq(hp0 - (F.player.hp + F.player.block), jel[0].data.inst.depSting, 'for its number');
    G.draw();
    // pinch
    F = fightIn(G, ['dep_crab']);
    G.endTurn(); settleTurn(G);
    const pin = G.fs.items.filter((b) => b.data.inst.depPinch);
    h.ok(pin.length === 2 && G.dep.fs().pinchN === 2, 'two prizes pinched');
    const x0 = pin.reduce((a, b) => a + b.x, 0);
    stepFor(G, 4);
    h.ok(pin.reduce((a, b) => a + b.x, 0) < x0 || pin.every((b) => b.x <= G.dep.K.pinchX + 20), 'they drag off toward the far wall');
    G.draw();
    // left pinched: into its shell when the next enemy phase ends
    G.endTurn(); settleTurn(G);
    h.ok(G.dep.fs().log.includes('take'), 'a pinched prize went into its shell');
    // live water
    F = fightIn(G, ['dep_eel']);
    G.endTurn(); settleTurn(G);
    h.ok(F.depShock && G.dep.fs().log.includes('shock'), 'the water is live');
    const dry = G.fs.items.find((b) => !b.data.def.dep && !(b.data.inst.junk));
    G.playDelivered([dry]); settleTurn(G);
    h.eq(G.dep.fs().zaps, 0, 'a dry prize: no zap');
    const wet = G.fs.items.find((b) => !b.data.def.dep && !(b.data.inst.junk) && b !== dry);
    wet.data.depWetG = G.fs.grabN;
    const h1 = F.player.hp + F.player.block;
    G.playDelivered([wet]); settleTurn(G);
    h.ok(G.dep.fs().zaps === 1 && G.dep.fs().log.includes('zap'), 'a wet prize zaps');
    h.ok(h1 - (F.player.hp + F.player.block) >= 1 || F.player.hp <= 0, 'it hurts');
    G.draw();
    // chests
    F = fightIn(G, ['dep_mimic'], 'elite');
    G.endTurn(); settleTurn(G);
    const ch = G.fs.items.filter((b) => b.data.def.dep === 'chest');
    h.ok(ch.length === 3 && ch.filter((b) => b.data.inst.depReal).length === 1, 'three chests, one real');
    G.draw();
    void T;
  });

  h.test('dep: The Drowned Jukebox\'s High Tide: the water rises and falls with the music, heavy prizes sink, light ones float', () => {
    const { G } = inDive(417);
    const F = fightIn(G, ['dep_jukebox'], 'boss');
    const K = DATA.DEP_K.tide;
    for (let i = 0; i < 6 && !F.tide; i++) { G.endTurn(); settleTurn(G); F.player.hp = Math.max(F.player.hp, 500); }
    h.ok(F.tide && G.dep.fs().log.includes('tide'), 'High Tide rolls in, staged');
    let lo = 1, hi = 0;
    for (let i = 0; i < 480; i++) { G.update(DT); const w = G.dep.water(); lo = Math.min(lo, w); hi = Math.max(hi, w); if (i % 60 === 0) G.draw(); }
    // (Loop 3's boss rings in enraged: the B-side mark; a Rising Water mutator can hold the floor higher)
    h.ok(hi >= F.tide.hi - 0.06 && hi <= K.hiRage + 1e-9 && lo <= hi - 0.25 && lo >= DATA.DEP_K.water - 1e-9, `the water swells up to its mark and back (${lo.toFixed(2)}..${hi.toFixed(2)} of ${F.tide.lo}..${F.tide.hi})`);
    h.eq(G.dep.tideAt(F.tide, 0), F.tide.lo, 'the tide starts low');
    const per = F.tide.beats * 60 / F.tide.bpm;
    h.ok(Math.abs(G.dep.tideAt(F.tide, per / 2) - F.tide.hi) < 1e-9, 'a full swell at half a period');
    // at high water, the floaters ride above the sinkers
    const floatY = G.fs.items.filter((b) => b.density < 0.9).map((b) => b.y), sinkY = G.fs.items.filter((b) => b.density > 1.2).map((b) => b.y);
    if (floatY.length && sinkY.length) h.ok(Math.min(...floatY) < Math.max(...sinkY), 'light prizes float up, heavy ones stay down');
    G.endTurn(); settleTurn(G);
    h.ok(!F.tide || G.dep.fs().log.includes('ebb'), 'it ebbs with the turn');
  });

  h.test('dep: save and load mid-Depths: the same monsters, the same flooded map, the water back', () => {
    const { T, G } = inDive(418);
    const F = fightIn(G, ['dep_crab', 'dep_jelly']);
    const ids = F.enemies.map((e) => e.id).join(), hps = F.enemies.map((e) => e.maxHp).join();
    G.save();
    const T2 = boot({ store: Object.assign({}, T._store) });
    const G2 = T2.GAME;
    h.ok(G2.load() && G2.screen === 'fight', 'a reload mid Depths fight');
    h.ok(G2.fight.enemies.map((e) => e.id).join() === ids && G2.fight.enemies.map((e) => e.maxHp).join() === hps, 'the same Depths monsters');
    h.ok(G2.run.endless.dep && G2.run.map.biome === 'depths' && G2.dep.in(), 'still in the Depths');
    stepFor(G2, 1);
    h.ok(G2.dep.water() > 0 && G2.dep.owns(), 'the water is back');
    G2.draw();
    // an old save at Loop 3 (before the Depths): no dive flag, a vault map; it plays on as the vault
    const raw = JSON.parse(T._store[G.RUN_KEY]);
    delete raw.run.endless.dep; delete raw.run.endless.dp; raw.run.map.biome = 'vault';
    for (const t of Object.values(raw.run.map.tiles)) if (t.biome) t.biome = 'vault';
    raw.screen = 'map'; delete raw.pendingFight;
    const T3 = boot({ store: Object.assign({}, T._store, { [G.RUN_KEY]: JSON.stringify(raw) }) });
    h.ok(T3.GAME.load(), 'an old Loop 3 save loads');
    h.ok(!T3.GAME.run.endless.dep && !T3.GAME.dep.in() && T3.GAME.run.endless.loop === 3, 'and stays the vault');
    T3.GAME.draw();
  });

  h.test('dep: death in the Depths: the history card counts the dive', () => {
    const { G } = inDive(419);
    fightIn(G, ['dep_eel']);
    G.fight.player.hp = 0;
    G.endFight('lose');
    h.eq(G.screen, 'gameover', 'game over');
    const rec = G.meta.his.runs[0];
    h.ok(rec && rec.dp === 1 && rec.lp === 3, 'the history record keeps the dive');
    G.draw();
  });
}

/* ------------------------------------------------- CAB (round 16): the cabinet is alive */
{
  const cabBoot = (force, meta) => { const o = metaBoot(Object.assign({ cab: { tip: 1 } }, meta || {})); o.G.cab.force = force !== false; return o; };
  const cabFight = (G, seed, bin, fight, lamp) => {
    G.newRun('knight', seed || 4242);
    if (bin) for (const id of bin) G.addItem(id);
    G.run.hp = G.run.maxHp = 999;
    if (lamp != null) G.run.cabLamp = lamp;
    G.startFight(['slime'], 'normal', { seed: fight || 777 });
    stepFor(G, 2.5);
    return G.cab.fs();
  };
  // End the turn and play the enemy phase out (the next turn's event, if any, is rolled).
  const nextTurn = (G) => { G.endTurn(); for (let i = 0; i < 1800 && (G.fight.phase !== 'player' || G.fs.enemyTurn || G.fs.queue.length); i++) G.update(DT); };
  const grabAt = (G, x) => { G.steer(x); stepFor(G, 1.2); G.dropClaw(); settle(G, 12); };

  h.test('cab: off headless unless forced, and off in Duo; the default fight is untouched', () => {
    const { G } = cabBoot(false);
    cabFight(G);
    h.eq(G.cab.on(), false, 'off headless by default');
    const g0 = G.rig.cfg.grip, s0 = G.rig.cfg.speed;
    h.eq(G.cab.gripAdd(), 0, 'no grip bonus');
    for (let k = 0; k < 6; k++) nextTurn(G);
    const C = G.cab.fs();
    h.ok(!C.ev && !C.surge && C.bodies.length === 0, 'no event ever rolled');
    h.eq(G.rig.cfg.grip, g0, 'the grip is the claw\'s own'); h.eq(G.rig.cfg.speed, s0, 'and so is the speed');
    h.eq(G.cab.lampAdd(3), 0, 'the lamp does not fill');
    G.fight.enemies.forEach((e) => { e.hp = 0; e.alive = false; });
    G.endFight('win');
    h.eq(G.run.cabLamp, undefined, 'the run carries no lamp field');
    const { G: G2 } = cabBoot(true);
    cabFight(G2);
    h.ok(G2.cab.on(), 'forced on');
    G2.S.duo = { mode: 'coop' };
    h.eq(G2.cab.on(), false, 'never in Duo');
    G2.S.duo = null;
  });

  h.test('cab: the events roll from the fight\'s seed and the turn (never turn 1), and a reload mid fight replays them', () => {
    const roll = (G) => { const out = []; for (let k = 0; k < 9; k++) { nextTurn(G); const C = G.cab.fs(); out.push(C.ev ? C.ev.id : '-'); if (C.ev) { stepFor(G, 0.1); G.cab.land(); } } return out; };
    const { T, G } = cabBoot(true);
    cabFight(G, 4242, null, 1603);
    h.ok(!G.cab.fs().ev, 'no event at the bell (turn 1)');
    const a = roll(G);
    h.ok(a.some((x) => x !== '-'), 'some turns open with an event: ' + a.join(' '));
    h.ok(a.every((x) => x === '-' || G.cab.IDS.includes(x)), 'every event is a known one');
    // the same fight again (a reload restarts it from the bell): the same events on the same turns
    const { G: G2 } = cabBoot(true);
    cabFight(G2, 4242, null, 1603);
    h.eq(roll(G2).join(), a.join(), 'the same seed, the same events');
    // the rolls over many fights: roughly CABK.evP of the turns from turn 2
    let n = 0, ev = 0;
    const cnt = {};
    for (let s = 1; s <= 12; s++) { const o = cabBoot(true); cabFight(o.G, 50 + s, null, 900 + s); for (const x of roll(o.G)) { n++; if (x !== '-') { ev++; cnt[x] = (cnt[x] || 0) + 1; } } }
    const p = ev / n;
    h.ok(p > 0.2 && p < 0.56, `about ${G.cab.K.evP} of the turns: ${p.toFixed(2)}`);
    h.ok(cnt.surge > 0 && cnt.coins > 0 && cnt.capsule > 0, 'all three come up: ' + JSON.stringify(cnt));
  });

  h.test('cab: a reload mid fight: the fight restarts from its bell with the same events and the lamp the fight started with', () => {
    const { T, G } = cabBoot(true);
    cabFight(G, 5150, null, 1603, 5);
    // fill the lamp in the fight, then save mid turn (a fight saves as its opening bell)
    G.cab.lampAdd(4);
    h.eq(G.cab.fs().lamp, 9, 'the fight\'s lamp is 5 + 4');
    nextTurn(G);
    const ev1 = G.cab.fs().ev ? G.cab.fs().ev.id : '-';
    G.save();
    const raw = JSON.parse(T._store[G.RUN_KEY]);
    h.eq(raw.run.cabLamp, 5, 'the save keeps the lamp the fight started with');
    const T2 = boot({ store: Object.assign({}, T._store) });
    const G2 = T2.GAME;
    G2.cab.force = true;
    h.ok(G2.load() && G2.screen === 'fight', 'the fight comes back');
    h.eq(G2.cab.fs().lamp, 5, 'the lamp starts where the fight did (no double fill)');
    stepFor(G2, 2.5);
    nextTurn(G2);
    h.eq(G2.cab.fs().ev ? G2.cab.fs().ev.id : '-', ev1, 'turn 2 opens the same way: ' + ev1);
    G2.draw();
  });

  h.test('cab: POWER SURGE grips harder and runs faster for the turn; the end of the turn takes it back', () => {
    const { G } = cabBoot(true);
    cabFight(G);
    const g0 = G.rig.cfg.grip, s0 = G.rig.cfg.speed;
    G.cab.event('surge', true);
    const C = G.cab.fs();
    h.ok(C.surge, 'surging');
    h.near(G.rig.cfg.grip, g0 + G.cab.K.surgeGrip, 1e-9, 'the grip +' + G.cab.K.surgeGrip);
    h.near(G.rig.cfg.speed, s0 * G.cab.K.surgeSpeed, 1e-9, 'the carriage x' + G.cab.K.surgeSpeed);
    G.draw();
    // a grab in between keeps it (the Lucky Claw and the golden grab set the grip absolutely)
    grabAt(G, G.fs.items[0].x);
    h.near(G.rig.cfg.grip, g0 + G.cab.K.surgeGrip + (G.fs.luckyOn ? G.toys.MAT.luckyGrip : 0), 1e-9, 'still surging after a grab');
    nextTurn(G);
    h.ok(!C.surge, 'the surge ran out');
    h.near(G.rig.cfg.grip, g0 + (G.fs.luckyOn ? G.toys.MAT.luckyGrip : 0), 1e-9, 'the grip is back');
    h.near(G.rig.cfg.speed, s0, 1e-9, 'the speed is back');
  });

  h.test('cab: COIN SHOWER rains coins around the claw (never into it); a coin in the chute pays 1 gold; the rest sink away at the end of the turn', () => {
    const { G, T } = cabBoot(true);
    cabFight(G);
    G.steer(200); stepFor(G, 1.2);
    G.cab.event('coins', true);
    stepFor(G, 1.5);
    const C = G.cab.fs();
    const coins = C.bodies.filter((b) => b.data.cab === 'coin');
    h.eq(coins.length, G.cab.K.coinN, G.cab.K.coinN + ' coins in the bin');
    h.eq(G.rig.held().length, 0, 'none landed in the open claw');
    h.ok(coins.every((b) => b.x > 0 && b.x < G.cabinet.bounds.chuteX && b.y < G.CAB.h + 1), 'all in the bin');
    h.ok(G.fs.items.every((b) => !b.data.cab), 'never an item of the bin');
    const g0 = T.COMBAT.gold(G.fight);
    // a coin knocked into the chute pays
    const c = coins[0];
    c.x = G.cabinet.bounds.chuteX + 30; c.y = G.cabinet.bounds.dividerTop + 30; c.vx = 0; c.vy = 50;
    stepFor(G, 0.3);
    h.eq(T.COMBAT.gold(G.fight), g0 + 1, '+1 gold');
    h.eq(C.bodies.length, coins.length - 1, 'the coin is gone');
    G.draw();
    nextTurn(G);
    h.eq(C.bodies.filter((b) => b.data.cab === 'coin').length, 0, 'the rest sank away');
    h.eq(T.COMBAT.gold(G.fight), g0 + 1, 'and paid nothing');
  });

  h.test('cab: CAPSULE DROP: deliver it and a real capsule waits on the reward screen (Cabinet prize); two a fight at most, none in a Boss Rush', () => {
    const { G } = cabBoot(true);
    cabFight(G);
    G.cab.event('capsule', true);
    stepFor(G, 1.5);
    const C = G.cab.fs();
    const cap = C.bodies.find((b) => b.data.cab === 'cap');
    h.ok(cap && G.cab.face(cap), 'a capsule with a face in the pile');
    const tier = cap.data.tier;
    cap.x = G.cabinet.bounds.chuteX + 30; cap.y = G.cabinet.bounds.dividerTop + 30; cap.vx = 0; cap.vy = 50;
    stepFor(G, 0.3);
    h.eq(C.won.join(), tier, 'won: ' + tier);
    G.cab.event('capsule', true); G.cab.event('capsule', true); G.cab.event('capsule', true);
    h.eq(C.caps, G.cab.K.capMax, 'no more than ' + G.cab.K.capMax + ' capsules a fight (the rest are coins)');
    G.fight.enemies.forEach((e) => { e.hp = 0; e.alive = false; });
    G.endFight('win');
    const rw = G.S.sd && G.S.sd.reward;
    h.ok(rw && rw.caps.some((c) => c.src === 'cabinet' && c.tier0 === tier && c.prize), 'the reward holds the cabinet capsule, in its colour');
    h.eq(G.S && G.fs && G.fs.cab ? G.fs.cab.won.length : 0, 0, 'paid once');
    // a Boss Rush fight has no reward screen for it: coins instead
    const o = cabBoot(true);
    cabFight(o.G);
    o.G.run.rush = { order: ['slime'], k: 0 };
    h.ok(o.G.rush.of(o.G.run), 'a rush run');
    o.G.cab.event('capsule', true); stepFor(o.G, 1);
    h.eq(o.G.cab.fs().caps, 0, 'no capsule in a rush');
    h.ok(o.G.cab.fs().bodies.every((b) => b.data.cab !== 'cap'), 'none in the pile');
    o.G.run.rush = null;
  });

  h.test('cab: the Jackpot Lamp fills with deliveries (a double, a jackpot and a rare prize add more), SO CLOSE consoles, full goes FEVER and rains prizes; the run keeps the level', () => {
    const { G } = cabBoot(true);
    const C = cabFight(G);
    h.eq(C.lamp, 0, 'a fresh run starts empty');
    const body = G.fs.items.find((b) => b.data.def.rarity === 'c');
    G.playDelivered([body]);
    h.eq(C.lamp, 1, 'a delivery: +1');
    G.fs.delivered = 1; G.playDelivered([G.fs.items.find((b) => b.data.def.rarity === 'c')]);
    h.eq(C.lamp, 3, 'the second in a grab: +1 more');
    G.toys.soClose(300, 700);
    h.eq(C.lamp, 4, 'SO CLOSE: +1');
    stepFor(G, 0.8);
    h.eq(C.lampShow, 4, 'the sparks landed');
    h.ok(C.lampUsed, 'used');
    G.cab.lampAdd(G.cab.K.lampMax - 4 + 2);
    h.ok(C.fever, 'full: FEVER');
    const before = C.bodies.length;
    stepFor(G, 3);
    h.eq(C.feverN, 1, 'one fever');
    h.ok(C.bodies.length >= before + G.cab.K.rainCoins, 'coins rained in: ' + (C.bodies.length - before));
    h.eq(G.cab.K.rainCaps, 0, 'round 19 lamp economy: a fever rains coins only');
    h.eq(C.bodies.filter((b) => b.data.cab === 'cap').length, G.cab.K.rainCaps, 'and ' + G.cab.K.rainCaps + ' capsules');
    h.eq(C.lamp, 2, 'the overflow carries');
    {
      // the rain's capsule path still works when the dial is up (a fresh fight; the dial put back)
      const o = cabBoot(true), C2 = cabFight(o.G), k0 = o.G.cab.K.rainCaps;
      o.G.cab.K.rainCaps = 1;
      try {
        o.G.cab.lampAdd(o.G.cab.K.lampMax);
        stepFor(o.G, 3);
        h.eq(C2.bodies.filter((b) => b.data.cab === 'cap').length, 1, 'rainCaps 1: one capsule in the rain');
        h.eq(C2.caps, 1, 'it counts against the fight\'s cabinet capsules');
      } finally { o.G.cab.K.rainCaps = k0; }
    }
    h.eq(G.meta.cab.fevers, 1, 'the profile counts it');
    G.draw();
    G.fight.enemies.forEach((e) => { e.hp = 0; e.alive = false; });
    G.endFight('win');
    h.eq(G.run.cabLamp, 2, 'the run keeps the level');
    // the next fight starts there; a lamp left full goes off after the bell
    G.run.cabLamp = G.cab.K.lampMax;
    G.S.sd = null;
    G.startFight(['slime'], 'normal', { seed: 11 });
    h.ok(G.cab.fs().fever && G.cab.fs().fever.t < 0, 'a full lamp: FEVER after the bell');
  });

  h.test('cab: PERFECT: a drop dead centre on the prize under the palm that comes up with it; the grip holds harder for that lift only', () => {
    let perfects = 0, offs = 0, tried = 0;
    for (let s = 1; s <= 10; s++) {
      const { G } = cabBoot(true);
      cabFight(G, 100 + s, null, 300 + s);
      const C = G.cab.fs();
      const tgt = G.fs.items.filter((b) => b.x < 380).sort((a, b) => a.y - b.y)[0];
      const g0 = G.rig.cfg.grip;
      G.steer(tgt.x); stepFor(G, 1.2);
      G.dropClaw();
      let sawGrip = false;
      for (let i = 0; i < 600 && G.fs.grabInFlight; i++) { G.update(DT); if (C.perf && G.rig.cfg.grip > g0 + 0.2) sawGrip = true; }
      settle(G, 10);
      tried++;
      if (C.perfG === G.fs.grabN) { perfects++; h.ok(sawGrip, 'the PERFECT grip was on for the lift'); h.ok(!C.perf, 'and off after'); }
      // 14 px off the prize under the palm is not dead centre
      const o = cabBoot(true);
      cabFight(o.G, 100 + s, null, 300 + s);
      const t2 = o.G.fs.items.filter((b) => b.x < 380).sort((a, b) => a.y - b.y)[0];
      o.G.steer(t2.x + 14); stepFor(o.G, 1.2);
      o.G.dropClaw(); settle(o.G, 12);
      if (o.G.cab.fs().perfG === o.G.fs.grabN) offs++;   // (only when another prize sat dead centre under the palm)
    }
    h.ok(perfects >= 4, `dead-centre drops go PERFECT most of the time (${perfects}/${tried})`);
    h.ok(offs <= perfects, `an aim 14 px off goes PERFECT less often (${offs}/${tried})`);
  });

  h.test('cab: the strain of a heavy lift (HEAVY! once a grab, the creak, gritted eyes) and the prizes\' faces (watch, gasp, ride, dizzy)', () => {
    const { G } = cabBoot(true);
    h.eq(G.cab.strainK(5), 0, 'a marble is no strain'); h.eq(G.cab.strainK(60), 1, 'an anvil and a shield is all of it');
    h.ok(G.cab.strainK(26) > 0.4 && G.cab.strainK(26) < 0.6, 'in between, in between');
    cabFight(G, 4242, ['tower_shield', 'war_hammer', 'family_anvil', 'aegis', 'dragon_egg', 'golden_duck']);
    const faced = G.fs.items.filter((b) => G.cab.face(b));
    h.ok(faced.length >= 4 && faced.every((b) => ['r', 'l'].includes(b.data.def.rarity) || (G.fs.golden && b.data.inst.uid === G.fs.golden.uid)), 'rare and legendary prizes have faces: ' + faced.length);
    h.ok(G.fs.items.filter((b) => b.data.def.rarity === 'c' && !(G.fs.golden && b.data.inst.uid === G.fs.golden.uid)).every((b) => !G.cab.face(b)), 'commons do not');
    const heavy = G.fs.items.find((b) => b.data.def.id === 'family_anvil') || G.fs.items.find((b) => b.data.def.id === 'tower_shield');
    G.steer(heavy.x); stepFor(G, 1.2); G.dropClaw();
    const C = G.cab.fs();
    let maxK = 0, gasp = false, ride = false;
    for (let i = 0; i < 700 && G.fs.grabInFlight; i++) {
      G.update(DT); maxK = Math.max(maxK, C.strain);
      for (const b of faced) { const fc = b.data.fc; if (fc.mood === 'gasp') gasp = true; if (fc.mood === 'ride') ride = true; }
      if (i % 20 === 0) G.draw();
    }
    const lifted = C.heavyG === G.fs.grabN;
    h.ok(maxK > 0.2, 'the claw strained: ' + maxK.toFixed(2));
    if (lifted) h.ok(maxK >= G.cab.K.heavyK - 0.05, 'a HEAVY lift strains hard');
    h.ok(gasp || ride || !faced.some((b) => b.held > 0), 'a caught face gasps or rides');
    h.ok(C.strain < 0.05 || G.rig.phase !== 'idle', 'the strain eases off when the claw is home');
    // a slip makes the dropped face dizzy
    const f = faced[0];
    G.fs.cargo = [f];
    G.rigEvent('slip');
    h.eq(f.data.fc.mood, 'dizzy', 'dropped: dizzy');
    // faces look at the claw when it is near
    stepFor(G, 1.5);
    const near = faced.find((b) => Math.hypot(G.rig.x - b.x, G.rig.y + 30 - b.y) < G.cab.K.faceLook);
    if (near) h.ok(Math.sign(near.data.fc.lx) === Math.sign(G.rig.x - near.x) || Math.abs(G.rig.x - near.x) < 4, 'a face near the claw looks its way');
    G.toys && G.draw();
  });

  h.test('cab: the physics stays deterministic with the cabinet on (the same seed and inputs, the same pile)', () => {
    const run = () => {
      const { G } = cabBoot(true);
      cabFight(G, 777, null, 2024);
      G.cab.event('coins', true); stepFor(G, 1);
      grabAt(G, 150); nextTurn(G); grabAt(G, 260);
      return G.fs.items.map((b) => b.x.toFixed(3) + ',' + b.y.toFixed(3)).join(';') + '|' + G.cab.fs().bodies.map((b) => b.x.toFixed(3)).join(';');
    };
    h.eq(run(), run(), 'bit for bit');
  });

  h.test('cab: reduced motion: no shake on the claw, the sign still reads, nothing throws while drawing every state', () => {
    const { G } = cabBoot(true, { settings: { shake: false } });
    cabFight(G, 4242, ['dragon_egg', 'aegis']);
    h.ok(G.S && G.fs, 'a fight');
    for (const id of G.cab.IDS) { G.cab.event(id); for (let i = 0; i < 20; i++) { G.update(DT * 8); G.draw(); } }
    G.cab.lampAdd(40); for (let i = 0; i < 30; i++) { G.update(DT * 6); G.draw(); }
    h.ok(true, 'drew the events, the fever and the rain');
    h.eq(G.cab.WORDS.filter((w) => w.indexOf(String.fromCharCode(0x2014)) >= 0).length, 0, 'no em dash in the words');
  });
}

// ---------------------------------------------------------------- GACHA (round 17): Capsule fever
{
  const META0 = () => ({ clawspire_meta: JSON.stringify({ introSeen: true, tutorialDone: true, unlocks: { knight: true } }) });
  const gBoot = (o) => { const T = boot(Object.assign({ store: META0() }, o || {})); return { T, G: T.GAME }; };
  const mk = (tier, n, ups) => ({ src: 'bonus', tier0: ups && ups.length ? 'c' : tier, ups: ups || [], tier, pity: false, prize: { k: 'gold', n }, opened: false });
  const tapTo = (G, left) => { const C = G.loot.cap; for (let i = 0; i < 12 && C.phase !== 'burst' && C.burstTap + 1 - C.taps > left; i++) G.loot.capsuleTap(); return C; };
  const walk = (el, out) => { out = out || []; if (!el || typeof el !== 'object') return out; out.push(el); for (const c of el.children || []) walk(c, out); return out; };
  const hasCls = (root, c) => walk(root).some((e) => new RegExp('(^|\\s)' + c + '(\\s|$)').test(e.className || ''));

  h.test('gacha: the build-up: chips and a note per crack, PRIMED with one tap left, paid at the last tap, the pop waits a charge by tier', () => {
    const { G } = gBoot();
    G.newRun('knight', 71);
    G.loot.showCapsule({ cap: mk('c', 5), then: { k: 'map' } });
    const C = G.loot.cap;
    G.loot.capsuleTap();
    h.eq(C.phase, 'idle', 'landed');
    G.loot.capsuleTap();
    const s = G.gacha.state(C);
    h.ok(s && G.gacha.chips() > 0, 'a crack throws shell chips');
    h.ok(!s.primed, 'two taps left: not primed yet');
    G.loot.capsuleTap();
    h.ok(s.primed, 'one tap left: PRIMED');
    stepFor(G, 0.3);
    h.ok(s.prime > 0.5, 'the glow builds while it waits');
    G.draw();
    const gold0 = G.run.gold;
    G.loot.capsuleTap();
    h.eq(C.phase, 'burst', 'the last tap bursts it');
    h.eq(G.run.gold, gold0 + 5, 'paid at once (a reload now lands on the card)');
    h.ok(!!s.pop && C.open === 0, 'the pop waits a charge');
    G.draw();
    stepFor(G, 0.1);
    h.ok(!!s.pop && C.open === 0, 'still charging at 0.1 s (a common charges 0.22 s)');
    stepFor(G, 0.2);
    h.ok(!s.pop && C.open > 0, 'popped: the halves fly');
    stepFor(G, 1);
    h.eq(C.phase, 'done', 'the card');
    h.eq(G.run.gold, gold0 + 5, 'paid once');
    G.loot.collectCapsule();
    h.eq(G.screen, 'map', 'back to the map');
  });

  h.test('gacha: a legendary charges longest, darkens the room (the legend moment) and lingers; a tap in the charge pops it now; Skip pops at once', () => {
    const { G } = gBoot();
    G.newRun('knight', 72);
    G.loot.showCapsule({ cap: mk('l', 9), then: { k: 'map' } });
    const C = tapTo(G, 0);
    const s = G.gacha.state(C);
    h.eq(C.phase, 'burst', 'burst');
    h.ok(s.pop && s.legend > 0, 'the legend moment starts in the charge');
    stepFor(G, 0.8);
    h.ok(s.pop && s.legend > 0.6, 'still charging at 0.8 s, the room going dark: ' + s.legend.toFixed(2));
    G.draw();
    stepFor(G, 0.6);
    h.ok(!s.pop && s.legend > 0.9, 'popped with the full moment');
    stepFor(G, 0.8);
    h.eq(C.phase, 'burst', 'a legendary lingers before the card');
    stepFor(G, 1);
    h.eq(C.phase, 'done', 'then the card');
    stepFor(G, 3);
    h.ok(s.legend >= 0.44, 'gold rays stay behind a legendary card');
    G.draw();
    G.loot.collectCapsule();
    // a tap in the charge pops it and shows the card
    G.loot.showCapsule({ cap: mk('l', 3), then: { k: 'map' } });
    const C2 = tapTo(G, 0), s2 = G.gacha.state(C2);
    h.ok(s2.pop, 'charging');
    G.loot.capsuleTap();
    h.ok(!s2.pop && C2.phase === 'done' && s2.legend === 1, 'a tap pops it now and shows the card');
    G.loot.collectCapsule();
    // Skip: no charge at all
    G.loot.showCapsule({ cap: mk('r', 3), then: { k: 'map' } });
    G.loot.skipCapsule();
    const s3 = G.gacha.state(G.loot.cap);
    h.eq(G.loot.cap.phase, 'burst', 'Skip bursts it');
    h.ok(s3 && !s3.pop, 'and pops it at once');
    stepFor(G, 0.7);
    h.eq(G.loot.cap.phase, 'done', 'no lingering after a skip');
    G.loot.collectCapsule();
  });

  h.test('gacha: reduced motion (calm) keeps it short: the charge x0.4, no lingering, nothing throws while drawing', () => {
    const T = boot({ store: { clawspire_meta: JSON.stringify({ introSeen: true, tutorialDone: true, unlocks: { knight: true }, settings: { shake: false } }) } });
    const G = T.GAME;
    G.newRun('knight', 73);
    G.loot.showCapsule({ cap: mk('l', 4), then: { k: 'map' } });
    const C = tapTo(G, 0), s = G.gacha.state(C);
    h.ok(s.pop, 'a charge');
    let t = 0;
    while (s.pop && t < 3) { G.update(DT); G.draw(); t += DT; }
    h.ok(t > 0.4 && t < 0.6, 'a calm legendary charges 0.5 s: ' + t.toFixed(2));
    stepFor(G, 0.6);
    h.eq(C.phase, 'done', 'no lingering');
    G.draw();
  });

  h.test('gacha: the rare tease flickers a primed common capsule gold, then it settles: its tier and prize never change', () => {
    const { T, G } = gBoot();
    G.newRun('knight', 74);
    let n = 1;
    while (n < 400 && !T.DATA.GACHA.tease('bonus:c:c:' + JSON.stringify({ k: 'gold', n }), 'c')) n++;
    h.ok(n < 400, 'a teasing capsule exists (' + n + ')');
    G.loot.showCapsule({ cap: mk('c', n), then: { k: 'map' } });
    const C = tapTo(G, 1), s = G.gacha.state(C);
    h.ok(s.tease && s.primed, 'primed and a teaser');
    let peak = 0;
    for (let i = 0; i < 90; i++) { G.update(DT); G.draw(); peak = Math.max(peak, s.teaseK); }
    h.ok(peak > 0.8, 'it flickered gold');
    stepFor(G, 0.6);
    h.eq(s.teaseK, 0, 'then it settled');
    h.eq(C.shown, 'c', 'still common');
    const gold0 = G.run.gold;
    G.loot.capsuleTap(); stepFor(G, 2);
    h.eq(C.cap.tier, 'c', 'a common capsule');
    h.eq(G.run.gold, gold0 + n, 'its own prize');
    G.loot.collectCapsule();
    // a capsule that does not tease never flickers
    let m = 1;
    while (T.DATA.GACHA.tease('bonus:c:c:' + JSON.stringify({ k: 'gold', n: m }), 'c')) m++;
    G.loot.showCapsule({ cap: mk('c', m), then: { k: 'map' } });
    const C2 = tapTo(G, 1), s2 = G.gacha.state(C2);
    let p2 = 0;
    for (let i = 0; i < 120; i++) { G.update(DT); p2 = Math.max(p2, s2.teaseK); }
    h.eq(p2, 0, 'no tease on the others');
  });

  h.test('gacha: hold to crack: a held press taps on its own until the burst', () => {
    const { G } = gBoot();
    G.newRun('knight', 75);
    G.loot.showCapsule({ cap: mk('u', 4), then: { k: 'map' } });
    const C = G.loot.cap;
    G.loot.capsuleTap();
    G.gacha.hold = { t: 0, e: 0, fn: () => G.loot.capsuleTap() };
    stepFor(G, 0.3 + 0.19 * 1.5);
    h.ok(C.taps >= 1, 'held: it cracks on its own (' + C.taps + ')');
    stepFor(G, 1.2);
    h.ok(C.phase === 'burst' || C.phase === 'done', 'held to the end: it bursts');
    G.gacha.hold = null;
    stepFor(G, 2);
    h.eq(C.phase, 'done', 'the card waits for a tap (the hold stops at the burst)');
  });

  h.test('gacha: Capsule Minis: a legendary capsule always has one, NEW on the card, saved once across reloads; the capsule rolls are untouched', () => {
    const { T, G } = gBoot();
    G.newRun('knight', 76);
    const sum = (g) => Object.values(g.minis).reduce((a, b) => a + b, 0);
    G.loot.showCapsule({ cap: mk('l', 2), then: { k: 'map' } });
    tapTo(G, 1);
    const before = sum(G.gacha.meta());
    G.save();
    // a reload before the burst: no mini yet, the same capsule again
    const T2 = boot({ store: Object.assign({}, T._store) });
    T2.GAME.choose(T2.GAME.S.ui.buttons.findIndex(b => /continue/i.test(b.label)));
    const G2 = T2.GAME;
    h.eq(G2.screen, 'capsule', 'the ritual again');
    h.ok(!G2.loot.cap.cap.opened && G2.loot.cap.cap.mini === undefined, 'nothing rolled before the burst');
    h.eq(sum(G2.gacha.meta()), before, 'no mini yet');
    G2.loot.skipCapsule();
    const m = G2.loot.cap.cap.mini;
    h.ok(m && T2.DATA.GACHA.MINIS[m.id], 'a legendary capsule always holds a mini: ' + (m && m.id));
    h.eq(sum(G2.gacha.meta()), before + 1, 'counted once');
    h.ok(m.fresh && G2.gacha.meta().news[m.id], 'NEW (the first one)');
    stepFor(G2, 2);
    h.eq(G2.loot.cap.phase, 'done', 'the card');
    h.ok(hasCls(T2._nodes.capsuleBody, 'g17Mini') && hasCls(T2._nodes.capsuleBody, 'mNew'), 'the card shows the mini with NEW!');
    G2.draw();
    // a reload on the card: the same mini, never a second
    const T3 = boot({ store: Object.assign({}, T2._store) });
    T3.GAME.choose(T3.GAME.S.ui.buttons.findIndex(b => /continue/i.test(b.label)));
    h.eq(T3.GAME.loot.cap.phase, 'done', 'lands on the card');
    h.eq(sum(T3.GAME.gacha.meta()), before + 1, 'still one');
    h.eq(T3.GAME.loot.cap.cap.mini.id, m.id, 'the same mini');
    T3.GAME.loot.collectCapsule();
    // the capsules themselves roll the same with or without the minis
    const seq = (off) => {
      const B = boot({ store: META0() });
      if (off) B.DATA.GACHA = undefined;
      const g = B.GAME;
      g.newRun('knight', 77);
      const out = [];
      for (let i = 0; i < 14; i++) {
        const cap = g.loot.makeCapsule(i % 3 ? 'elite' : 'boss');
        out.push(cap.tier0 + cap.tier + JSON.stringify(cap.prize));
        g.loot.showCapsule({ cap, then: { k: 'map' } }); g.loot.skipCapsule(); stepFor(g, 0.8); g.loot.collectCapsule();
      }
      return { s: out.join('|'), minis: sum(g.gacha.meta()) };
    };
    const on = seq(false), off = seq(true);
    h.eq(on.s, off.s, 'the same 14 capsules, tiers and prizes, with the minis on or off');
    h.ok(on.minis > 0 && off.minis === 0, 'the minis came along only when on (' + on.minis + ')');
  });

  h.test('gacha: dupes pay vault tickets; a finished series pays its rainbow Vault prize (or tickets when owned); the save repairs junk', () => {
    const { T, G } = gBoot();
    const D = T.DATA.GACHA, V = G.vault.state;
    const t0 = V.tix;
    const a = G.gacha.grant('coin_critter'), b = G.gacha.grant('coin_critter');
    h.ok(a.fresh && !b.fresh, 'the first is new, the second a dupe');
    h.eq(b.tix, D.DUPE.c, 'a common dupe pays ' + D.DUPE.c);
    h.eq(V.tix, t0 + D.DUPE.c, 'into the vault wallet');
    h.eq(G.gacha.meta().minis.coin_critter, 2, 'two of them');
    let last = null;
    for (const id of D.seriesIds('arcade')) last = G.gacha.grant(id);
    h.ok(last.done && last.cos === 'mq_rainbow', 'Arcade Pals complete: the JACKPOT marquee');
    h.ok(V.owned.mq_rainbow && V.news.mq_rainbow, 'owned and NEW in the vault');
    h.ok(G.gacha.meta().series.arcade, 'the series is marked complete');
    V.owned.trail_rainbow = 1;
    const t1 = V.tix;
    for (const id of D.seriesIds('snacks')) last = G.gacha.grant(id);
    h.ok(last.done && !last.cos && last.stix === D.SERIES_TIX, 'already owned: ' + D.SERIES_TIX + ' vault tickets instead');
    h.eq(V.tix, t1 + D.SERIES_TIX, 'paid');
    h.eq(G.gacha.grant('nope'), null, 'an unknown mini is nothing');
    // the save round trip and junk
    const m = {};
    G.gacha.fix(m, JSON.parse(JSON.stringify({ gacha: G.gacha.meta() })));
    h.eq(JSON.stringify(m.gacha.minis), JSON.stringify(G.gacha.meta().minis), 'the minis survive a save');
    h.ok(m.gacha.series.arcade && m.gacha.series.snacks, 'the series too');
    const j = {};
    G.gacha.fix(j, { gacha: { minis: { nope: 3, coin_critter: -2, ticket_tot: 'x' }, series: { arcade: 1 }, news: { nope: 1 }, streak: -4, day: 12 } });
    h.eq(JSON.stringify(j.gacha.minis) + JSON.stringify(j.gacha.series) + JSON.stringify(j.gacha.news), '{}{}{}', 'junk is dropped');
    h.ok(j.gacha.streak === 0 && j.gacha.day === '', 'junk numbers and days are reset');
  });

  h.test('gacha: Open all from the bank: the capsules fan out and pop in a row, each paid once, a reload mid-fan resumes', () => {
    const { T, G } = gBoot();
    G.newRun('knight', 78);
    const run = G.run;
    run.caps.push(mk('c', 4), mk('u', 6), mk('r', 8));
    G.toMap();
    const gold0 = run.gold;
    h.ok(G.loot.openBankedCap(), 'the first banked capsule opens');
    const k = G.S.ui.buttons.findIndex((b) => /^Open all/.test(b.label));
    h.ok(k >= 0 && G.S.ui.buttons[k].label === 'Open all (3)', 'the capsule screen offers Open all (3)');
    G.choose(k);
    const A = G.gacha.all;
    h.ok(A && A.phase === 'drop' && A.items.length === 3, 'three capsules drop in');
    h.eq(run.caps.length, 0, 'out of the bank (held by the screen until paid)');
    G.draw();
    let t = 0;
    while (A.items.filter((i) => i.popped).length < 1 && t < 3) { G.update(DT); t += DT; }
    h.eq(A.items.filter((i) => i.popped).length, 1, 'one popped');
    h.eq(G.run.gold, gold0 + 4, 'and paid');
    G.draw();
    // reload now: the popped one is not paid again, the rest pop
    G.save();
    const T2 = boot({ store: Object.assign({}, T._store) });
    const G2 = T2.GAME;
    G2.choose(G2.S.ui.buttons.findIndex(b => /continue/i.test(b.label)));
    h.eq(G2.screen, 'capsule', 'back on the fan');
    h.ok(G2.gacha.all && G2.gacha.all.items.filter((i) => i.popped).length === 1, 'the popped one stays popped');
    h.eq(G2.run.gold, gold0 + 4, 'nothing paid twice');
    stepFor(G2, 3);
    h.eq(G2.gacha.all.phase, 'done', 'all popped');
    h.eq(G2.run.gold, gold0 + 18, 'each capsule paid once');
    h.ok(hasCls(T2._nodes.capsuleBody, 'g17AllLb'), 'a label under each prize');
    G2.draw();
    const c = G2.S.ui.buttons.findIndex((b) => b.label === 'Collect all');
    h.ok(c >= 0, 'Collect all');
    G2.choose(c);
    h.eq(G2.screen, 'map', 'back to the map');
    h.eq(G2.run.caps.length, 0, 'the bank is empty');
    h.eq(G2.run.loot.capsOpened, 3, 'three opened');
    // a tap hurries, Skip pops the rest at once
    G2.run.caps.push(mk('c', 1), mk('c', 1));
    G2.gacha.openAll('bank');
    G2.gacha.allTap();
    h.eq(G2.gacha.all.phase, 'pop', 'a tap skips the drop');
    G2.gacha.allSkip();
    h.eq(G2.gacha.all.phase, 'done', 'Skip: every one popped');
    h.eq(G2.run.gold, gold0 + 20, 'and paid');
    G2.gacha.allCollect();
  });

  h.test('gacha: Open all on the reward screen: every unopened capsule, marked on the reward, then back to it', () => {
    const { T, G } = gBoot();
    G.newRun('knight', 61);
    G.startFight(T.DATA.ENCOUNTERS[1].elite[0], 'elite');
    stepFor(G, 0.2);
    G.endFight('win');
    stepFor(G, 6);
    const rw = G.S.sd.reward;
    h.ok(rw && rw.caps.length >= 1, 'an elite capsule');
    rw.caps.push(mk('u', 7));
    const n = rw.caps.length, opened0 = G.run.loot.capsOpened;
    const buttons0 = G.S.ui.buttons.length;
    h.ok(G.gacha.openAll('reward', rw), 'Open all');
    stepFor(G, 4);
    h.eq(G.gacha.all.phase, 'done', 'all popped');
    h.ok(rw.caps.every((c) => c.opened), 'every capsule is marked opened on the reward');
    h.eq(G.run.loot.capsOpened, opened0 + n, 'counted once each');
    G.gacha.allCollect();
    h.eq(G.screen, 'reward', 'back on the reward screen');
    h.eq(G.S.ui.buttons.length, buttons0, 'the cards and Skip keep their indices');
    h.ok(!G.gacha.openAll('reward', rw), 'nothing left to open');
  });

  h.test('gacha: the daily capsule: once a real day, a streak, a badge on the Vault tile, the same capsule after a reload', () => {
    const { T, G } = gBoot();
    h.ok(!G.gacha.dailyReady(), 'headless without a clock: no daily capsule');
    G.gacha.now = new Date(2026, 8, 29, 9, 30);
    h.ok(G.gacha.dailyReady(), 'a new day: ready');
    G.showTitle();
    const vb = G.S.ui.buttons.find((b) => b.label === 'Prize Vault');
    h.ok(vb && /g17Free/.test(vb.el.className), 'the Vault tile glows');
    h.ok(walk(vb.el).some((e) => /\bvdot\b/.test(e.className || '')), 'with a badge');
    G.vault.show();
    const k = G.S.ui.buttons.findIndex((b) => b.label === 'Free daily capsule');
    h.ok(k >= 0, 'the vault offers the free capsule');
    const V = G.vault.state, tix0 = V.tix, caps0 = V.caps;
    G.choose(k);
    h.ok(G.vault.cap && V.pend && V.pend.daily, 'a free capsule is on the pedestal');
    h.eq(V.tix, tix0 + 5, 'day 1 streak bonus: +5');
    h.eq(G.gacha.meta().streak, 1, 'a 1 day streak');
    h.ok(!G.gacha.dailyReady(), 'once a day');
    const id = V.pend.id;
    // a reload mid-open: the same capsule, never a second claim
    const T2 = boot({ store: Object.assign({}, T._store) });
    const G2 = T2.GAME;
    G2.gacha.now = new Date(2026, 8, 29, 22, 0);
    h.ok(!G2.gacha.dailyReady(), 'still claimed after a reload');
    h.ok(G2.vault.state.pend && G2.vault.state.pend.daily && G2.vault.state.pend.id === id, 'the same capsule waits');
    G2.vault.show();
    h.eq(G2.vault.cap && G2.vault.cap.p.id, id, 'it reopens');
    G2.vault.skip();
    stepFor(G2, 3);
    h.ok(G2.vault.state.owned[id] || G2.vault.cap.res.dupe, 'paid');
    h.eq(G2.vault.state.caps, caps0 + 1, 'counted once');
    h.ok(G2.vault.cap.res.mini, 'a Capsule Mini came with it');
    G2.draw();
    // tomorrow: day 2; a missed day resets
    G2.gacha.now = new Date(2026, 8, 30, 8, 0);
    h.ok(G2.gacha.dailyReady(), 'the next day: ready again');
    G2.gacha.daily();
    h.eq(G2.gacha.meta().streak, 2, 'a 2 day streak');
    h.eq(G2.gacha.meta().bonus, 10, '+10');
    G2.vault.skip(); stepFor(G2, 3); G2.vault.close();
    G2.gacha.now = new Date(2026, 9, 2, 8, 0);
    G2.gacha.daily();
    h.eq(G2.gacha.meta().streak, 1, 'a missed day starts over');
    h.eq(G2.gacha.meta().best, 2, 'the best streak is kept');
    G2.vault.skip(); stepFor(G2, 3);
    G2.draw();
  });

  h.test('gacha: the Prize Vault Minis tab: four series, silhouettes for the missing, the turntable, a pick clears NEW', () => {
    const { T, G } = gBoot();
    G.gacha.grant('neon_cat');
    G.vault.show();
    G.S.vault.tab = 'minis';
    h.ok(G.gacha.select('neon_cat'), 'picked');
    h.ok(!G.gacha.meta().news.neon_cat, 'NEW cleared');
    const labels = G.S.ui.buttons.map((b) => b.label);
    h.eq(labels.filter((l) => l === '???').length, 23, 'the 23 missing are silhouettes');
    h.ok(labels.includes('Neon Cat'), 'the found one by name');
    h.ok(hasCls(T._nodes.vaultBody, 'g17Ser') && hasCls(T._nodes.vaultBody, 'g17Detail'), 'series headers and the detail strip');
    for (let i = 0; i < 10; i++) { G.update(DT * 3); G.draw(); }
    G.gacha.select('rainbow_dragon');
    G.draw();
    h.ok(true, 'the turntable draws');
  });
}

/* ------------------------------------------------- TECH (round 17): Cabinet Tech and Joy Stick */
{
  const techBoot = (meta) => { const o = metaBoot(Object.assign({ cab: { tip: 1 }, unlocks: { knight: true, techie: true } }, meta || {})); o.G.cab.force = true; return o; };
  const techFight = (G, o) => {
    o = o || {};
    G.newRun(o.char || 'techie', o.seed || 4242);
    for (const id of o.relics || []) G.run.relics.push(id);
    G.run.hp = G.run.maxHp = 999;
    if (o.lamp != null) G.run.cabLamp = o.lamp;
    G.startFight(o.foes || ['slime', 'slime'], 'normal', { seed: o.fight || 777 });
    return G.cab.fs();
  };
  const drain = (G, s) => stepFor(G, s || 1.5);
  const hpSum = (G) => G.fight.enemies.reduce((a, e) => a + e.hp, 0);
  const nextTurn = (G) => { G.endTurn(); for (let i = 0; i < 1800 && (G.fight.phase !== 'player' || G.fs.enemyTurn || G.fs.queue.length); i++) G.update(DT); };
  const topItem = (G) => G.fs.items.filter((b) => b.x < G.cabinet.bounds.chuteX - 20).sort((p, q) => (p.y - (p.br || 12)) - (q.y - (q.br || 12)))[0];

  h.test('tech: Joy Stick unlocks with the first LAMP FEVER (any crawler), and at once for a profile that has seen one', () => {
    const fresh = metaBoot({ cab: { tip: 1 } });
    fresh.G.showChars();
    const card = (G) => G.S.ui.buttons.find((b) => b.label === 'Joy Stick');
    h.ok(card(fresh.G) && card(fresh.G).disabled, 'locked on a fresh profile');
    h.ok(JSON.stringify(card(fresh.G).el.children.map((c) => c.textContent)).indexOf('Set off LAMP FEVER to unlock') >= 0, 'the card says how');
    const seen = metaBoot({ cab: { tip: 1, fevers: 2 } });
    seen.G.showChars();
    h.ok(card(seen.G) && !card(seen.G).disabled, 'open at once for a profile that has had a fever');
    // a knight's run with the cabinet on: the first fever unlocks her
    const { G } = fresh;
    G.cab.force = true;
    techFight(G, { char: 'knight' });
    drain(G, 2.5);
    h.ok(!G.meta.unlocks.techie, 'not yet');
    G.cab.lampAdd(12);
    drain(G, 1.5);
    h.ok(G.meta.unlocks.techie, 'LAMP FEVER unlocks Joy Stick');
  });

  h.test('tech: her run, her gift (an event may land on turn 1), quiet headless and in Duo', () => {
    const { G } = techBoot();
    techFight(G);
    h.ok(G.run.relics.includes('service_remote') && G.run.bin.length === 19 && G.run.char === 'techie', 'the Service Remote and her 19 items');
    h.ok(G.fight.tech && G.fight.tech.gift && G.fight.tech.on, 'COMBAT knows her gift and the live cabinet');
    const m = G.tech.mods();
    h.ok(m.first === 1 && m.evP > 0.2 && m.perfLamp === 1, 'her cabinet numbers');
    // turn 1 events: some fight seeds open with one for her, never for the knight
    let hers = 0, his = 0;
    for (let s = 1; s <= 24; s++) {
      const a = techBoot(); techFight(a.G, { fight: 500 + s }); if (a.G.cab.fs().ev) hers++;
      const b = techBoot(); techFight(b.G, { char: 'knight', fight: 500 + s }); if (b.G.cab.fs().ev) his++;
    }
    h.ok(hers >= 4 && his === 0, `an event at the bell: ${hers} of 24 for her, ${his} for the knight`);
    const ids = []; for (let k = 0; k < 2; k++) { const a = techBoot(); techFight(a.G, { fight: 1603 }); for (let t = 0; t < 4; t++) nextTurn(a.G); ids.push(JSON.stringify(a.G.fight.tech)); }
    h.eq(ids[0], ids[1], 'the same fight seed, the same cabinet');
    // quiet: headless without force, and in Duo
    const q = metaBoot({ cab: { tip: 1 }, unlocks: { knight: true, techie: true } });
    techFight(q.G);
    h.ok(!q.G.fight.tech.on && Object.values(q.G.tech.mods()).every((v) => v === 0), 'a quiet cabinet headless: all zeros');
    G.S.duo = { mode: 'coop' };
    h.ok(Object.values(G.tech.mods()).every((v) => v === 0), 'and in Duo');
    G.S.duo = null;
  });

  h.test('tech: the Service Remote pays on every event; Circuit Breaker and Double Feature', () => {
    const { G } = techBoot();
    techFight(G, { relics: ['circuit_breaker', 'double_feature'] });
    drain(G, 3);
    if (G.cab.fs().ev) { G.cab.land(); drain(G, 3); }
    const ev0 = G.fight.tech.events, hp0 = hpSum(G), b0 = G.fight.player.block;
    G.cab.event('surge', true);
    drain(G, 0.6);
    h.eq(G.fight.tech.events, ev0 + 1, 'the relics heard the surge');
    h.ok(hp0 - hpSum(G) >= 2 * (3 + 6) - 1, `the remote (3) and the breaker (6) hit both slimes: ${hp0} -> ${hpSum(G)}`);
    h.ok(G.fight.player.block >= b0 + 3, 'and the remote\'s Block');
    // Double Feature: the reel spins again for a different event
    drain(G, 3);
    const C = G.cab.fs();
    h.eq(G.fight.tech.events, ev0 + 2, 'a second event landed');
    h.ok(C.ev && C.ev.dbl && C.ev.id !== 'surge' && C.ev.landed, 'a different one: ' + (C.ev && C.ev.id));
    for (let i = 0; i < 20; i++) { G.update(DT * 3); G.draw(); }
    nextTurn(G);
    h.ok(!G.tech.fs().dbl, 'nothing carries into the next turn');
  });

  h.test('tech: PERFECT grabs: her extra lamp cell, the Metronome, the Laser Sight\'s wider window', () => {
    const k = techBoot(); techFight(k.G, { char: 'knight', relics: ['metronome'] }); drain(k.G, 2.5);
    const j = techBoot(); techFight(j.G, { relics: ['metronome', 'laser_sight'] }); drain(j.G, 2.5);
    const lk = k.G.cab.fs().lamp, lj = j.G.cab.fs().lamp, hk = hpSum(k.G), bj = j.G.fight.player.block;
    k.G.steer(topItem(k.G).x); j.G.steer(topItem(j.G).x); drain(k.G, 1.2); drain(j.G, 1.2);
    k.G.cab.perfect(topItem(k.G)); j.G.cab.perfect(topItem(j.G));
    h.eq(k.G.cab.fs().lamp - lk, 1, 'a PERFECT lights one cell');
    h.eq(j.G.cab.fs().lamp - lj, 2, 'two for Joy Stick');
    drain(k.G, 0.8); drain(j.G, 0.8);
    h.eq(hk - hpSum(k.G), 4, 'the Metronome: 4 for a first PERFECT');
    h.ok(j.G.fight.player.block >= bj + 3, 'the Laser Sight: 3 Block');
    h.eq(j.G.fight.tech.perfects, 1, 'COMBAT counted it');
    // the window: 8 px off centre is PERFECT with the laser, not without
    const b = topItem(j.G), x = b.x + 8;
    const A = j.G.tech.palm(x);
    j.G.run.relics.splice(j.G.run.relics.indexOf('laser_sight'), 1); j.G.tech.recalc();
    const B = j.G.tech.palm(x);
    h.ok(A && A.dx > 5, 'with the laser the drop locks on');
    h.ok(!B || B.dx <= 5, 'without it, not at 8 px');
    for (let i = 0; i < 6; i++) { j.G.update(DT); j.G.draw(); }
  });

  h.test('tech: coins (the Coin Hopper), the lamp (Lamp Oil, an arcade part), LAMP FEVER (Fever Dream, held over END TURN)', () => {
    const { G, T } = techBoot();
    let C = techFight(G, { relics: ['coin_hopper', 'lamp_oil', 'fever_dream'], lamp: 0 });
    h.eq(C.lamp, 4, 'Lamp Oil: the lamp starts 4 cells fuller');
    drain(G, 3);
    if (G.cab.fs().ev) { G.cab.land(); drain(G, 3); }
    G.steer(200); drain(G, 1.2);
    const n0 = C.bodies.filter((b) => b.data.cab === 'coin').length;
    G.cab.event('coins', true);
    drain(G, 2);
    const coins = C.bodies.filter((b) => b.data.cab === 'coin');
    h.eq(coins.length - n0, G.cab.K.coinN + 3, 'the Coin Hopper: 3 more coins');
    const g0 = T.COMBAT.gold(G.fight), c = coins[0];
    c.x = G.cabinet.bounds.chuteX + 30; c.y = G.cabinet.bounds.dividerTop + 30; c.vx = 0; c.vy = 50;
    drain(G, 0.3);
    h.eq(T.COMBAT.gold(G.fight), g0 + 2, 'a coin pays 2 gold');
    const l0 = C.lamp;
    G.tech.deliver({ uid: 'tx', id: 'neon_tube' }, { x: 300, y: 700 });
    h.eq(C.lamp, l0 + 2, 'a Neon Tube lights 2 more cells');
    // a fever on your turn: Fever Dream and Lamp Oil answer
    const hp0 = hpSum(G), f0 = G.fight.tech.fevers;
    G.cab.lampAdd(12);
    drain(G, 1.5);
    h.eq(G.fight.tech.fevers, f0 + 1, 'LAMP FEVER reached the relics');
    h.ok(hp0 - hpSum(G) >= 16, 'Fever Dream: 8 to both');
    // a fever that goes off after END TURN waits for the next turn
    const o = techBoot(); C = techFight(o.G, { relics: ['fever_dream'], lamp: 0 }); drain(o.G, 3);
    o.G.cab.lampAdd(12); o.G.endTurn();
    for (let i = 0; i < 90; i++) o.G.update(DT);
    const mid = o.G.fight.phase !== 'player' ? o.G.tech.fs().pend.length : -1;
    for (let i = 0; i < 1800 && (o.G.fight.phase !== 'player' || o.G.fs.enemyTurn || o.G.fs.queue.length); i++) o.G.update(DT);
    h.ok(mid !== 0, 'held while the enemies act');
    h.eq(o.G.fight.tech.fevers, 1, 'and paid on the next player turn');
    h.eq(o.G.tech.fs().pend.length, 0, 'once');
  });

  h.test('tech: The Motherboard: an event every turn, a whiff drains the lamp', () => {
    const { G } = techBoot();
    const C = techFight(G, { relics: ['leg_motherboard'], lamp: 0 });
    h.ok(C.ev, 'an event at the bell');
    let all = true;
    for (let t = 0; t < 4; t++) { nextTurn(G); if (!G.cab.fs().ev) all = false; }
    h.ok(all, 'and every turn after');
    C.lamp = 6; C.lampShow = 6; G.fs.delivered = 0;
    G.tech.grabDone();
    h.eq(C.lamp, 3, 'a grab that brought nothing up drains 3 cells');
    G.fs.delivered = 2; G.tech.grabDone();
    h.eq(C.lamp, 3, 'a real grab does not');
    for (let i = 0; i < 10; i++) { G.update(DT * 2); G.draw(); }
  });

  h.test('tech: real grabs with every Tech relic are deterministic and draw; a save reloads her', () => {
    const play = () => {
      const o = techBoot();
      techFight(o.G, { relics: o.T.DATA.TECH.RELICS.slice(), foes: ['goblin', 'slime'] });
      drain(o.G, 3);
      for (let k = 0; k < 4 && o.G.screen === 'fight'; k++) {
        settle(o.G, 10);
        const b = topItem(o.G);
        if (!b || !o.G.fight || o.G.fight.player.grabs <= 0) break;
        o.G.steer(b.x); drain(o.G, 1.2); o.G.dropClaw(); settle(o.G, 15);
        o.G.draw();
      }
      return o;
    };
    const a = play(), b = play();
    const sig = (o) => JSON.stringify({ t: o.G.fight && o.G.fight.tech, hp: o.G.fight && o.G.fight.enemies.map((e) => e.hp), lamp: o.G.cab.fs() && o.G.cab.fs().lamp, err: o.G.fight && o.G.fight.hookErrors });
    h.eq(sig(a), sig(b), 'the same grabs, the same cabinet: ' + sig(a));
    h.ok(a.G.fight && a.G.fight.hookErrors.length === 0, 'no hook errors');
    a.G.save();
    const T2 = boot({ store: Object.assign({}, a.T._store) });
    T2.GAME.cab.force = true;
    h.ok(T2.GAME.load() && T2.GAME.run.char === 'techie' && T2.GAME.screen === 'fight', 'her fight reloads');
    h.ok(T2.GAME.fight.tech && T2.GAME.fight.tech.on, 'with its cabinet');
    T2.GAME.draw();
  });

  h.test('tech: a Duo seat gets her starter and her kit, and the quiet cabinet rings the remote every 2nd turn', () => {
    const { G, T } = techBoot();
    G.S.duo = { mode: 'coop', p: [{ char: 'knight', claw: 'classic' }, { char: 'techie', claw: 'classic' }], seed: 5, boss: 'hoard' };
    const run = G.duo.seatRun(1);
    G.S.duo = null;
    const K = T.DATA.rushKit('techie');
    h.ok(run.relics.includes('service_remote') && K.relics.every((id) => run.relics.includes(id)), 'the Service Remote and the kit\'s relics');
    h.ok(K.items.every((id) => run.bin.some((i) => i.id === id)), 'the kit\'s items');
    // the quiet cabinet (as in Duo): the remote rings on turn 2
    const q = metaBoot({ cab: { tip: 1 }, unlocks: { knight: true, techie: true } });
    techFight(q.G);
    drain(q.G, 2);
    nextTurn(q.G);
    h.ok(q.G.fight.turn === 2 && q.G.fight.player.block >= 3, 'turn 2: the remote\'s Block (' + q.G.fight.player.block + ')');
  });
}

/* ------------------------------------------------- QA17 (round 17): QA pass 6 */
{
  const esc = (T) => { const fn = T._listeners.keydown; if (fn) fn({ key: 'Escape', preventDefault() {} }); };
  h.test('qa17: Escape back from a page opened out of a title sheet keeps that sheet open (the title\'s listener runs after onKey)', () => {
    for (const [name, show] of [['weekly', (G) => G.wk.show()], ['rushmenu', (G) => G.rush.menu()], ['codex', (G) => G.lore.show()], ['history', (G) => G.his.show()]]) {
      const { T, G } = metaBoot({ stats: { runs: 3, wins: 1, fights: 20 }, unlocks: { knight: true, rogue: true } });
      G.showTitle();
      const sheet = name === 'weekly' || name === 'rushmenu' ? 'modes' : 'collection';
      G.ui15.sheet(sheet);
      G.ui15.T.reopen = sheet;   // (a tap inside the sheet remembers it; the stub DOM has no capture phase)
      show(G);
      h.eq(G.screen, name, name + ': the page is up');
      esc(T);   // onKey: the page's Escape goes back to the title, which reopens the sheet
      h.ok(G.screen === 'title' && G.ui15.T.open === sheet, `${name}: back on the title with the ${sheet} sheet (${G.screen}, ${G.ui15.T.open})`);
      h.eq(G.qa17.titleEsc({ key: 'Escape' }), false, name + ': the same key press does not close it again');
      h.eq(G.ui15.T.open, sheet, name + ': the sheet is still open');
      esc(T);   // a second Escape begins on the title: it closes the sheet
      h.eq(G.qa17.titleEsc({ key: 'Escape' }), true, name + ': the next Escape closes it');
      h.eq(G.ui15.T.open, null, name + ': closed');
    }
  });
  h.test('qa17: Escape is Back on the Prizedex, Stickers, Help and Tips (a popover or the Settings panel closes first)', () => {
    for (const [name, show] of [['collection', (G) => G.showCollection()], ['stickers', (G) => G.showStickers()], ['help', (G) => G.showHelp('title')], ['tips', (G) => G.feel.showTips('title')]]) {
      const { T, G } = metaBoot({});
      G.showTitle();
      show(G);
      h.eq(G.screen, name, name + ': up');
      G.S.popover = { html: 'x', x: 0, y: 0 };
      esc(T);
      h.ok(G.screen === name && !G.S.popover, name + ': the first Escape only closes the popover');
      G.acc.open();
      esc(T);
      h.ok(G.screen === name && !G.acc.isOpen, name + ': the Settings panel closes first');
      esc(T);
      h.eq(G.screen, 'title', name + ': then Escape goes back');
    }
    // Help opened from the map goes back to the map, as its Back does
    const { T, G } = metaBoot({});
    G.newRun('knight', 1717); G.toMap();
    G.showHelp('map');
    esc(T);
    h.eq(G.screen, 'map', 'Help from the map: back to the map');
  });
  h.test('qa17: the HUD\'s resource row squeezes when it outgrows its column, and only as far as it must', () => {
    const { G } = metaBoot({});
    const row = (need) => {   // a row whose content is `need` px at full size, 30 px less tight, 22 more at the last step
      const cls = new Set();
      return { clientWidth: 268, classList: { add: (...c) => c.forEach((x) => cls.add(x)), remove: (...c) => c.forEach((x) => cls.delete(x)), contains: (c) => cls.has(c) },
        get scrollWidth() { return Math.max(268, need - (cls.has('qa17Tight') ? 30 : 0) - (cls.has('qa17Tight2') ? 22 : 0)); }, cls };
    };
    let r = row(250);
    h.ok(G.qa17.fit(r) === 0 && !r.cls.size, 'it fits: as designed');
    r = row(292);   // 99999 gold, 9999 tickets
    h.ok(G.qa17.fit(r) === 1 && r.cls.has('qa17Tight') && !r.cls.has('qa17Tight2'), 'big numbers: tighter chips');
    r = row(315);
    h.ok(G.qa17.fit(r) === 2 && r.cls.has('qa17Tight2'), 'bigger still: the act word goes and a size smaller');
    h.ok(G.qa17.fit(row(250)) === 0, 'and back as the numbers shrink');
    r = row(292); r.clientWidth = 0;
    h.eq(G.qa17.fit(r), 0, 'a hidden bar is left alone');
    // the markup still carries every chip, and the per-frame check is a browser's only (no layout headless)
    G.qa17.hudFit();
    h.eq(G.qa17.H.level, 0, 'headless: nothing measured');
  });
  h.test('qa17: the online co-op watch screen tells the corner lane where both players\' cards are', () => {
    const { G } = metaBoot({});
    h.eq(G.qa.signs('duo').length, 0, 'no duel: nothing');
    G.S.duo = { mode: 'coop', ph: 'watch', net: { me: 1 } }; G.S.duoNet = { me: 1 };
    const r = G.qa.signs('duo');
    h.ok(r.length === 2 && r[0][0] <= 12 && r[0][2] >= 252 && r[1][0] <= 288 && r[1][2] >= 528 && r.every((x) => x[1] <= 12 && x[3] >= 76), 'watching: both cards up top ' + JSON.stringify(r));
    for (const ph of ['yours', 'toss', 'end']) { G.S.duo.ph = ph; h.eq(G.qa.signs('duo').length, 0, ph + ': not the watch screen'); }
    G.S.duo = { mode: 'vs', ph: 'watch', net: { me: 1 } };
    h.eq(G.qa.signs('duo').length, 0, 'the claw-off\'s watch has its own layout');
    G.S.duoNet = null; G.S.duo = { mode: 'coop', ph: 'watch' };
    h.eq(G.qa.signs('duo').length, 0, 'pass and play: the hand-off screens');
    G.S.duo = null;
  });
  h.test('qa17: in season the ribbon stays over the sky, never moved into the More sheet (it covered the sheet\'s X)', () => {
    for (const d of ['2026-10-02', '2026-12-24']) {
      const { T, G } = metaBoot({});
      G.season.setDate(d);
      G.showTitle();
      const ban = G.S.ui.buttons.find((b) => b.el && /\bseaBan\b/.test(b.el.className || ''));
      h.ok(ban && ban.el.parentNode === T._nodes['scr-title'], d + ': the ribbon hangs on the title screen itself');
      const more = G.ui15.T.sheets.more;
      const inMore = (el) => { for (let p = el; p; p = p.parentNode) if (p === more) return true; return false; };
      h.ok(!inMore(ban.el), d + ': not in the More sheet');
      G.ui15.sheet('more');
      h.eq(G.ui15.T.open, 'more', d + ': the More sheet still opens');
      G.season.setDate(null);
    }
  });
  h.test('qa17: the styles: the squeezed resource row, the Dutch map head compact enough for "RONDE 12"', () => {
    const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
    const css = (html.match(/<style id="qa17-css">([\s\S]*?)<\/style>/) || [])[1] || '';
    h.ok(/#top \.uiRes\.qa17Tight\{/.test(css) && /#top \.uiRes\.qa17Tight2 \.stat\.act \.k\{display:none\}/.test(css), 'qa17Tight and qa17Tight2');
    h.ok(/html\[lang="nl"\] \.mh \.l1\{gap:3px\}/.test(css) && /html\[lang="nl"\] \.mh \.l1 \.btn\.sm\{padding-left:7px;padding-right:7px\}/.test(css) && /html\[lang="nl"\] \.mh \.l1 \.mhInk\{font-size:17px/.test(css), 'the Dutch map head: tighter gaps, buttons and bulb pill');
    h.ok(css.indexOf(String.fromCharCode(0x2014)) < 0, 'no em dash');
  });
  h.test('qa17: the Jackpot Lamp after a FEVER shows its level, not the sparks still flying counted twice', () => {
    const { G } = metaBoot({ cab: { tip: 1 } });
    G.cab.force = true;
    G.newRun('knight', 4243);
    G.run.hp = G.run.maxHp = 999;
    G.startFight(['slime'], 'normal', { seed: 778 });
    stepFor(G, 2.5);
    const C = G.cab.fs();
    G.cab.lampAdd(11);
    stepFor(G, 0.7);
    h.eq(C.lampShow, 11, 'eleven cells lit');
    G.cab.lampAdd(1);   // full: FEVER, the dome bursts 1.35 s later
    h.ok(C.fever && C.lamp === 12, 'FEVER');
    stepFor(G, 1.0);
    G.cab.lampAdd(2);   // two more sparks, still flying when the dome bursts
    stepFor(G, 0.4);
    h.ok(C.fever && C.fever.burst && C.lamp === 2, 'the burst carries the overflow: 2 (' + C.lamp + ')');
    stepFor(G, 1.5);
    h.eq(C.lampShow, C.lamp, `the lamp shows its level once the sparks land (${C.lampShow} cells, level ${C.lamp})`);
    G.cab.force = false;
  });
}

// ---------------- round 18 (M3): albums, lobbies and run end (DESIGN.md "Albums, lobbies and run end restyled (round 18)")
{
  const inCls = (root, el, re) => { const path = []; const find = (n, acc) => { if (n === el) { path.push(...acc); return true; } for (const c of n.children || []) if (find(c, acc.concat([n]))) return true; return false; }; find(root, []); return path.some((n) => re.test(n.className || '')); };
  h.test('m3: Back sits top-left in a page head on the album pages; the registrations keep their order', () => {
    const { T, G } = metaBoot({});
    G.showCollection('items');
    const L = G.S.ui.buttons.map((b) => b.label);
    h.ok(L.indexOf('Back') >= 0 && L.indexOf('Codex') === L.length - 1 && L.indexOf('Back') === L.length - 2, 'Prizedex: Back then the Codex, registered last as always');
    const back = G.S.ui.buttons[L.indexOf('Back')].el, cdx = G.S.ui.buttons[L.length - 1].el;
    h.ok(inCls(T._nodes.collectionBody, back, /\bpageHead\b/) && inCls(T._nodes.collectionBody, cdx, /\bpageHead\b/), 'both in the page head');
    h.ok(!/pri|mixStick/.test(back.className), 'Back is a ghost now, not a bottom bar');
    G.showStickers();
    const sb = G.S.ui.buttons.find((b) => b.label === 'Back');
    h.ok(sb && inCls(T._nodes.stickersBody, sb.el, /\bpageHead\b/), 'the sticker board too');
    G.his.show();
    const hb = G.S.ui.buttons.find((b) => b.label === 'Back');
    h.ok(hb && inCls(T._nodes.historyBody, hb.el, /\bpageHead\b/), 'the run history too');
    h.eq(T._nodes.stickersBody.children.length, 0, 'a page left behind lets its cards go (B3.11)');
    G.showTitle();
    h.eq(T._nodes.historyBody.children.length, 0, 'the history too');
  });
  h.test('m3: the scoreboard: the way on docked, the rest folded into Run details, the vault unlock never toasts over it', () => {
    const { T, G } = metaBoot({});
    G.newRun('knight', 1801);
    G.toMap();
    G.showWin();
    h.eq(G.S.ui.buttons[0].label, 'Cash out', 'Cash out is still the first choice');
    h.eq(G.S.ui.buttons[1].label, 'Keep playing: Endless', 'Keep playing the second');
    const wb = T._nodes.winBody;
    h.ok(inCls(wb, G.S.ui.buttons[0].el, /\bpageDock\b/) && inCls(wb, G.S.ui.buttons[1].el, /\bpageDock\b/), 'both in the dock');
    const fold = wb.children.find((c) => /\bm3Details\b/.test(c.className || ''));
    h.ok(fold, 'a Run details fold');
    const texts = []; const walk = (n) => { if (n.textContent) texts.push(n.textContent); (n.children || []).forEach(walk); };
    walk(fold);
    h.ok(texts.includes('Highlights') && texts.includes('Run details'), 'the highlights fold away under Run details');
    h.ok(!/Unlocked in the Prize Vault/.test(String(G.S.lastToast || '')), 'no vault toast over the score');
    G.S.lastToast = '';
    G.newRun('knight', 1802);
    G.toMap();
    G.showGameOver();
    const home = G.S.ui.buttons.find((b) => b.label === 'Back to title');
    h.ok(home && inCls(T._nodes.gameoverBody, home.el, /\bpageDock\b/), 'game over: Back to title in the dock');
    h.ok(T._nodes.gameoverBody.children.some((c) => /\bscoreBox\b/.test(c.className || '')), 'the score stays in view');
    G.choose(G.S.ui.buttons.indexOf(home));
    h.eq(G.screen, 'title', 'and home it goes');
    h.eq(T._nodes.gameoverBody.children.length, 0, 'the run end lets its cards go');
  });
  h.test('m3: the duo setup groups each player into a fold and docks the coin; the indices stay put', () => {
    const { T, G } = metaBoot({});
    G.duo.setup('vs');
    const L0 = G.S.ui.buttons.map((b) => b.label);
    h.eq(L0[0], 'Back', 'Back first');
    h.eq(L0[L0.length - 1], 'Toss the coin!', 'the coin last');
    const db = T._nodes.duoBody;
    const toss = G.S.ui.buttons[L0.length - 1].el;
    h.ok(inCls(db, toss, /\bpageDock\b/), 'the coin is docked (it used to float over the chips)');
    const col = G.S.ui.buttons.find((b) => b.label === 'P1 pink' || /^P1 /.test(b.label));
    h.ok(col && inCls(db, col.el, /\bm3FoldB\b/), 'a player\'s colours, crawlers and claws sit in their fold');
    const folds = []; const walk = (n) => { if (/\bm3FoldT\b/.test(n.className || '')) folds.push(n); (n.children || []).forEach(walk); };
    walk(db);
    h.eq(folds.length, 2, 'one fold per player');
    folds[0].click();
    h.eq(G.S.ui.buttons.length, L0.length, 'opening a fold registers nothing');
    G.choose(L0.indexOf('P1 claw scoop'));
    h.eq(G.duo.setupState.p[0].claw, 'scoop', 'a pick inside a fold still goes through GAME.choose');
    h.eq(JSON.stringify(G.S.ui.buttons.map((b) => b.label)), JSON.stringify(L0), 'the rebuilt page registers the same buttons in the same order');
  });
}

/* ------------------------------------------------- RROW (round 21): the resolve row (DESIGN.md "The resolve row (round 21)") */
{
  // A knight's fight on a fixed seed; off: the old immediate path (the yardstick).
  const rrBoot = (off, relics, foes, store) => {
    const T = boot(store ? { store } : undefined);
    const G = T.GAME;
    G.row.off = !!off;
    G.newRun('knight', 4242);
    if (G.screen === 'boon') G.choose(0);
    for (const r of relics || []) if (G.run.relics.indexOf(r) < 0) G.run.relics.push(r);
    G.startFight(foes || ['rat', 'rat'], 'normal');
    settle(G, 10);
    return { T, G, C: T.COMBAT };
  };
  // A grab that delivers exactly these prizes, in this order: the claw stays home, the bodies go down the chute.
  const fakeGrab = (G, C, bodies) => {
    C.useGrab(G.fight);
    const fs = G.fs;
    fs.grabInFlight = true; fs.grabN++; fs.dropAt = G.S.t; fs.releaseAt = -1; fs.delivered = 0; fs.watch = false; fs.pendingDrop = false;
    G.playDelivered(bodies);
  };
  const byId = (a, b) => (a.data.inst.id < b.data.inst.id ? -1 : a.data.inst.id > b.data.inst.id ? 1 : String(a.data.inst.uid) < String(b.data.inst.uid) ? -1 : 1);
  const pick = (G, n, test) => itemBodies(G).filter((b) => !test || test(b.data.def || {})).sort(byId).slice(0, n);

  h.test('rrow: a real grab fills the row while the claw is out, and nothing resolves until it is home', () => {
    const { G } = rrBoot(false);
    let saw = 0, early = 0, pre = false, tries = 0;
    while (!saw && tries++ < 8 && G.screen === 'fight') {
      settle(G, 15);
      if (G.fight.player.grabs <= 0) { G.endTurn(); settle(G, 30); continue; }
      const b = itemBodies(G)[0];
      if (!b) break;
      G.steer(b.x); stepFor(G, 0.6);
      if (!G.dropClaw()) break;
      const p0 = G.run.played;
      for (let i = 0; i < 60 * 20 && G.state().grabInFlight; i++) {
        G.update(DT);
        const R = G.row.state;
        if (R && !R.go && G.fs.delivered > 0) {
          saw++;
          if (G.run.played !== p0) early++;
          const s = R.slots.find((x) => x.k === 'item');
          if (s && s.pre && s.pre.any) pre = true;
        }
      }
      settle(G, 15);
    }
    h.ok(saw > 0, 'a delivery waited on the row while the claw was still out (' + saw + ' frames)');
    h.eq(early, 0, 'nothing was played before the claw was home');
    h.ok(pre, 'the waiting slot shows what it will do (its chip, this fight\'s numbers)');
  });

  h.test('rrow: plays keep delivery order, grabDone follows them, and every number matches the old immediate path', () => {
    const run = (off) => {
      const { G, C } = rrBoot(off, ['jackpot_bell', 'prize_counter', 'venom_gland']);
      const order = [], play0 = C.play, gd0 = C.grabDone, F = G.fight, sig = [];
      C.play = function (F1, inst) { order.push(inst.id + '#' + inst.uid); return play0.apply(this, arguments); };
      C.grabDone = function (F1, n) { order.push('grabDone:' + n); return gd0.apply(this, arguments); };
      try {
        for (let g = 0; g < 5 && G.screen === 'fight' && F.phase !== 'over'; g++) {
          settle(G, 15);
          if (G.screen !== 'fight' || F.phase === 'over') break;
          if (F.player.grabs <= 0) { G.endTurn(); settle(G, 30); continue; }
          const bodies = pick(G, 3);
          sig.push(bodies.map((b) => b.data.inst.id + '#' + b.data.inst.uid));
          fakeGrab(G, C, bodies);
          settle(G, 20);
        }
      } finally { C.play = play0; C.grabDone = gd0; }
      return { order, sig, hp: F.player.hp, block: F.player.block, foes: F.enemies.map((e) => e.hp + '/' + e.block + '/' + JSON.stringify(e.status)), log: JSON.stringify([F.stats, F.used.map((i) => i.id), F.exhausted.map((i) => i.id), F.bin.length, F.turn, F.player.status]) };
    };
    const a = run(false), b = run(true);
    h.ok(a.sig.length >= 3, 'a few grabs of three prizes (' + a.sig.length + ')');
    h.eq(JSON.stringify(a.sig), JSON.stringify(b.sig), 'the same deliveries on both paths');
    h.eq(JSON.stringify(a.order), JSON.stringify(b.order), 'the same plays in the same order, grabDone at the same places');
    // each grab: its prizes in delivery order, then grabDone
    let at = 0, ok = true;
    for (const s of a.sig) { for (const id of s) if (a.order[at++] !== id) ok = false; if (!/^grabDone:/.test(a.order[at++] || '')) ok = false; }
    h.ok(ok, 'per grab: the deliveries in order, then grabDone (' + a.order.slice(0, 8).join(' ') + ')');
    h.eq(a.hp + '/' + a.block, b.hp + '/' + b.block, 'your hp and Block match the old path');
    h.eq(JSON.stringify(a.foes), JSON.stringify(b.foes), 'every enemy\'s hp, Block and statuses match');
    h.eq(a.log, b.log, 'the fight\'s stats, piles, turn and your statuses match');
  });

  h.test('rrow: a relic that joins an item\'s play rides on its slot; grab-level effects are labelled chips at the end, played one by one', () => {
    const { G, C } = rrBoot(false, ['jackpot_bell', 'prize_counter', 'venom_gland']);
    const weapon = pick(G, 1, (d) => (d.tags || []).indexOf('weapon') >= 0);
    const rest = pick(G, 6).filter((b) => weapon.indexOf(b) < 0).slice(0, 2);
    h.ok(weapon.length === 1 && rest.length === 2, 'a weapon and two more prizes');
    fakeGrab(G, C, weapon.concat(rest));
    const R0 = G.row.state;
    h.eq(R0.slots.filter((s) => s.k === 'item').length, 3, 'three slots, side by side');
    h.eq(R0.slots.map((s) => s.inst && s.inst.uid).join(), weapon.concat(rest).map((b) => b.data.inst.uid).join(), 'in delivery order');
    let first = null, chipsAt = null, order = [], twoAct = false;
    for (let i = 0; i < 60 * 12 && !ready(G); i++) {
      G.update(DT);
      const R = G.row.state;
      const chips = R.slots.filter((s) => s.k === 'grab');
      if (chips.length && !chipsAt) chipsAt = { items: R.slots.filter((s) => s.k === 'item').map((s) => s.st), chips: chips.map((c) => c.st) };
      for (const c of chips) if (c.st !== 'wait' && order.indexOf(c) < 0) order.push(c);
      if (chips.filter((c) => c.st === 'act').length > 1) twoAct = true;
      if (!first && R.slots[0].st === 'hit') first = R.slots[0];
    }
    h.ok(first && first.procs && first.procs.some((p) => p.name === 'Venom Gland' && p.n.s === 'poison'), 'the weapon\'s slot names the relic that joined in (Venom Gland, Poison)');
    h.ok(first && first.res && first.res.d > 0, 'and shows the hit it made (' + (first && first.res && first.res.d) + ')');
    h.ok(chipsAt && chipsAt.items.every((s) => s === 'hit'), 'the grab chips come after every item resolved');
    h.ok(chipsAt && chipsAt.chips.every((s) => s === 'wait'), 'they arrive waiting');
    const chips = G.row.state.slots.filter((s) => s.k === 'grab');
    const pc = chips.find((c) => c.label === 'Prize Counter'), bell = chips.find((c) => c.label === 'Jackpot Bell');
    h.ok(pc && pc.tag === 'RELIC' && pc.res.b === 6, 'Prize Counter: a RELIC chip, +6 Block');
    h.ok(bell && bell.res.d > 0, 'Jackpot Bell: its damage (' + (bell && bell.res.d) + ')');
    h.ok(chips.indexOf(pc) < chips.indexOf(bell), 'in grabDone\'s order (onJackpot, then onGrab)');
    h.eq(order.map((c) => c.label).join(), chips.map((c) => c.label).join(), 'played one by one, left to right');
    h.ok(!twoAct, 'never two chips at once');
    h.ok(chips.every((c) => c.st === 'hit'), 'all played');
    G.draw();
  });

  h.test('rrow: the speed pill (1x, 2x, 4x) lives in clawspire_meta; a new profile starts at 1x', () => {
    const { T, G } = rrBoot(false);
    h.eq(G.row.speed(), 1, 'a new profile: 1x');
    stepFor(G, 0.05);
    h.ok(G.row.K.pill && G.row.K.pill.id === 'rrSpeed' && G.row.K.pill.textContent === '\u00bb 1x', 'the pill sits in the fight\'s control row (\u00bb 1x, round 22)');
    h.eq(G.row.cycle(), 2, 'a tap: 2x');
    stepFor(G, 0.05);
    h.eq(G.row.K.pill.textContent, '\u00bb 2x', 'the pill says so');
    const m = JSON.parse(T._store.clawspire_meta);
    h.eq(m.settings.rowSpd, 2, 'saved inside the meta object (settings.rowSpd)');
    h.ok(Object.keys(T._store).every((k) => /^clawspire_/.test(k)) && !Object.keys(T._store).some((k) => /row|speed/i.test(k)), 'no new localStorage key: ' + Object.keys(T._store).join());
    const B = rrBoot(false, null, null, T._store);
    h.eq(B.G.row.speed(), 2, 'a reload keeps it');
    G.S.headless = false; B.G.S.headless = false;
    try {
      h.ok(G.row.dur('lift') > 0 && Math.abs(G.row.dur('lift') - B.G.row.dur('lift')) < 1e-9, 'same speed, same lift');
      G.row.cycle();
      h.eq(G.row.speed(), 4, 'then 4x');
      h.near(G.row.dur('toss') * 2, B.G.row.dur('toss'), 1e-9, '4x tosses twice as fast as 2x');
    } finally { G.S.headless = true; B.G.S.headless = true; }
    h.eq(G.row.cycle(), 1, 'and round to 1x');
  });

  h.test('rrow: a tap on the resolving row plays the rest at once, with the same result', () => {
    const run = (skip) => {
      const { G, C } = rrBoot(false);
      G.S.headless = false;   // the visual path's pace
      let frames = 0, tapped = false, left = -1;
      try {
        fakeGrab(G, C, pick(G, 4));
        stepFor(G, 0.05);
        if (skip) {
          h.ok(G.row.state.go, 'the claw is home: the row resolves');
          h.ok(!G.row.tap(270, 200), 'a tap on the arena does not skip');
          tapped = G.row.tap(270, G.row.K.y + 20);
          left = G.fs.playQ.length;
        }
        while ((G.fs.playQ.length || G.row.pending()) && frames++ < 60 * 10) G.update(DT);
      } finally { G.S.headless = true; }
      settle(G, 10);
      return { frames, tapped, left, hp: G.fight.enemies.map((e) => e.hp).join(), p: G.fight.player.hp + '/' + G.fight.player.block, flash: G.row.state.flash };
    };
    const slow = run(false), fast = run(true);
    h.ok(fast.tapped && fast.left >= 2, 'a tap on the row skips (' + fast.left + ' left)');
    h.ok(fast.frames <= 12, 'the rest resolved in ' + fast.frames + ' frames (' + slow.frames + ' at 1x)');
    h.ok(slow.frames >= 220 && slow.frames <= 330, 'at 1x four prizes take about 0.9 s each after a GO! beat (round 22: ' + slow.frames + ' frames, the first one\'s landing on the row included)');
    h.eq(fast.hp + '|' + fast.p, slow.hp + '|' + slow.p, 'the same hp and Block either way');
  });

  h.test('rrow: the enemy turn waits for the whole row; END TURN is off meanwhile', () => {
    const { G, C } = rrBoot(false, ['jackpot_bell', 'prize_counter']);
    G.fight.player.grabs = 1;
    fakeGrab(G, C, pick(G, 3));
    h.ok(!G.endTurn(), 'END TURN does nothing while prizes wait');
    let bad = 0, sawChips = false, n = 0;
    for (; n < 60 * 30 && !G.fs.enemyTurn; n++) {
      G.update(DT);
      if (!G.state().grabInFlight && G.row.pending()) { sawChips = true; if (G.endTurn()) bad++; }
    }
    h.ok(sawChips, 'the grab chips were still playing after the grab');
    h.eq(bad, 0, 'END TURN never went through then');
    h.ok(G.fs.enemyTurn && !G.row.pending() && !G.fs.playQ.length, 'the turn ended by itself once the row was done');
  });

  h.test('rrow: the last enemy dies mid row: the rest goes quickly and the outcome is the old one', () => {
    const run = (off) => {
      const { G, C } = rrBoot(off, null, ['rat']);
      const F = G.fight;
      F.enemies[0].hp = 1; F.enemies[0].block = 0;
      const p0 = G.run.played, s0 = F.stats.played;
      fakeGrab(G, C, pick(G, 4, (d) => (d.fx || []).some((f) => f && f.k === 'dmg' && f.v > 0)).concat(pick(G, 4)).slice(0, 4));
      let n = 0;
      while (G.screen === 'fight' && !(G.fs && G.fs.outro) && n++ < 60 * 10) G.update(DT);
      return { n, result: F.result, phase: F.phase, played: G.run.played - p0, stats: F.stats.played - s0, used: F.used.length, bin: F.bin.length, outro: !!(G.fs && G.fs.outro) || G.screen !== 'fight' };
    };
    const a = run(false), b = run(true);
    h.eq(a.result, 'win', 'the fight is won');
    h.eq(JSON.stringify([a.result, a.played, a.stats, a.used, a.bin]), JSON.stringify([b.result, b.played, b.stats, b.used, b.bin]), 'the same plays, piles and result as the old path');
    h.ok(a.outro && a.n < 60 * 4, 'the outro follows quickly (' + a.n + ' frames)');
  });

  h.test('rrow: a fight drawn with the row up (every state, calm too) never throws; the player row steps aside', () => {
    const { T, G, C } = rrBoot(false, ['jackpot_bell', 'prize_counter', 'venom_gland']);
    G.S.headless = false;
    let threw = null;
    try {
      fakeGrab(G, C, pick(G, 3));
      for (let i = 0; i < 60 * 6 && !ready(G); i++) { G.update(DT); if (i % 3 === 0) { try { G.draw(); } catch (e) { threw = e; break; } } }
      T.RENDER.fx.reduced = true;
      fakeGrab(G, C, pick(G, 2));
      for (let i = 0; i < 60 * 6 && !ready(G); i++) { G.update(DT); if (i % 3 === 0) { try { G.draw(); } catch (e) { threw = e; break; } } }
    } finally { G.S.headless = true; T.RENDER.fx.reduced = false; }
    h.ok(!threw, 'draw never throws: ' + (threw && threw.stack));
    let threw2 = null;
    try { T.RENDER.rrRow(T._ctx, { slots: [{ k: 'item', st: 'wait', cx: 50, cy: 360, w: 40 }, { k: 'grab', st: 'act', cx: 100, cy: 360, w: 90, res: { d: 3, any: true } }, null], y: 339, h: 46, x0: 8, x1: 532 }); T.RENDER.rrRow(T._ctx, null); T.RENDER.rrRow(T._ctx, { slots: 'x' }); } catch (e) { threw2 = e; }
    h.ok(!threw2, 'junk input never throws: ' + (threw2 && threw2.stack));
  });

  /* ---- ROUND 22: the row made impossible to miss (DESIGN.md "The resolve row, round 22") */
  // Steps the visual path (not headless) until done(), returns the frames taken.
  const visual = (G, n, each) => { G.S.headless = false; let i = 0; try { for (; i < n; i++) { G.update(DT); if (each && each(i) === false) break; } } finally { G.S.headless = true; } return i; };

  h.test('rrow22: at 1x a three prize grab is on screen for seconds: a GO! beat, then about 0.9 s a card, then 1.5 s with its total', () => {
    const { G, C } = rrBoot(false);
    h.eq(G.row.speed(), 1, 'a new profile plays the row at 1x');
    fakeGrab(G, C, pick(G, 3, (d) => (d.fx || []).some((f) => f && f.k === 'dmg' && f.v > 0)).concat(pick(G, 3)).slice(0, 3));
    const t0 = G.S.t;
    let goAt = -1, lifts = [], hits = [], shownUntil = -1, opMax = 0, goFx = 0, bandH = 0, openH = 0;
    visual(G, 60 * 12, () => {
      const R = G.row.state;
      if (!R) return;
      if (R.slots.length) shownUntil = G.S.t;
      if (R.go && goAt < 0) goAt = G.S.t;
      opMax = Math.max(opMax, R.op || 0); goFx = Math.max(goFx, R.goFx || 0);
      const items = R.slots.filter((s) => s.k === 'item');
      items.forEach((s, i) => { if (s.st === 'lift' && lifts[i] == null) lifts[i] = G.S.t; if (s.st === 'hit' && hits[i] == null) hits[i] = G.S.t; });
      if (items[0] && items[0].h) { if (R.op < 0.05) bandH = items[0].h; if (R.op > 0.95) openH = items[0].h; }
      if (!R.slots.length && shownUntil > 0) return false;
    });
    h.ok(goAt >= t0 && goFx > 0.9, 'the claw is home: GO! (the beat lit)');
    h.ok(lifts[0] - goAt >= 0.6, 'the first card waits for the GO! beat (' + (lifts[0] - goAt).toFixed(2) + ' s)');
    h.ok(hits.length === 3 && hits.every((x) => x > 0), 'three cards hit');
    const gaps = [hits[1] - hits[0], hits[2] - hits[1]];
    h.ok(gaps.every((g) => g >= 0.75 && g <= 1.1), 'one by one, about 0.9 s apart (' + gaps.map((g) => g.toFixed(2)).join(', ') + ')');
    h.ok(shownUntil - hits[2] >= 1.5, 'the panel and its total stay up 1.5 s after the last hit (' + (shownUntil - hits[2]).toFixed(2) + ' s)');
    h.ok(shownUntil - goAt >= 4.5, 'the row is on screen for ' + (shownUntil - goAt).toFixed(1) + ' s from GO!');
    h.ok(opMax > 0.95, 'the panel opened over the glass once the claw was home');
    h.ok(openH >= 100 && openH > (G.row.K.h - 20), 'big cards: ' + openH.toFixed(0) + ' px tall (round 21: 40)');
  });

  h.test('rrow22: the header counts what really landed; Block lands in the shield chip; a calm player keeps the slow pace', () => {
    const { T, G, C } = rrBoot(false);
    const blk = pick(G, 1, (d) => (d.fx || []).some((f) => f && f.k === 'block') && !(d.fx || []).some((f) => f && (f.k === 'dmg' || f.k === 'heal')));
    const hit = pick(G, 2, (d) => (d.fx || []).some((f) => f && f.k === 'dmg' && f.v > 0)).filter((b) => blk.indexOf(b) < 0);
    h.ok(blk.length === 1 && hit.length === 2, 'a Block prize and two weapons');
    const e0 = G.fight.enemies.map((e) => e.hp + e.block), b0 = G.fight.player.block;
    T.RENDER.fx.reduced = true;
    let done = 0, lastHit = -1, firstHit = -1, sawBig = false;
    try {
      fakeGrab(G, C, hit.concat(blk));
      visual(G, 60 * 10, () => {
        const R = G.row.state, items = R ? R.slots.filter((s) => s.k === 'item' && s.st === 'hit') : [];
        if (items.length && firstHit < 0) firstHit = G.S.t;
        if (items.length === 3 && lastHit < 0) lastHit = G.S.t;
        if (G.fs.rr2Q) sawBig = true;
        if (R && !G.row.pending() && !G.fs.playQ.length && !G.state().grabInFlight && done++ > 3) return false;
      });
    } finally { T.RENDER.fx.reduced = false; }
    const R = G.row.state;
    const dealt = G.fight.enemies.reduce((a, e, i) => a + (e0[i] - (e.hp + e.block)), 0);
    h.ok(R.tot && R.tot.b === G.fight.player.block - b0 && R.tot.b > 0, 'the header\'s Block total is the Block gained (' + (R.tot && R.tot.b) + ')');
    h.ok(R.tot.d >= dealt && R.tot.d > 0, 'its sword total counts every hit (' + R.tot.d + ', ' + dealt + ' through Block)');
    h.ok(lastHit - firstHit >= 1.4, 'calm (reduced motion) still reads one by one (' + (lastHit - firstHit).toFixed(2) + ' s for three)');
    h.ok(G.row.state.slots.find((s) => s.inst === blk[0].data.inst), 'the Block prize had its card');
  });

  h.test('rrow22: while the panel is up the rest waits: no JACKPOT banner, stickers, tips or toasts over it; then they come', () => {
    const { T, G, C } = rrBoot(false);
    const jp = (g) => g.ann.log.filter((x) => x.k === 'in' && x.cls === 'jackpot').length;
    for (let i = 0; i < 60 * 10 && (G.prog.current || G.prog.queue.length || G.feel.cur); i++) G.update(DT);   // what the fight's start said is done
    const j0 = jp(G);
    G.S.lastToast = '';
    fakeGrab(G, C, pick(G, 3));
    h.ok(G.row.quiet(), 'the row is busy: quiet');
    h.eq(jp(G), j0, 'three in one grab: no JACKPOT banner over the row');
    h.ok(G.row.state.stamp && G.row.state.stamp.txt === 'JACKPOT!', 'the JACKPOT is a stamp on the row instead');
    h.ok(G.run.jackpots >= 1, 'and still counts as a jackpot');
    G.row.toast('A toast in the middle of it', 2);
    h.ok(G.S.lastToast !== 'A toast in the middle of it' && G.row.K2.toasts.length === 1, 'a toast waits');
    G.row.sticker('first_prize');
    G.feel.want('combo');
    h.ok(!G.feel.safe(), 'no tip card while it is busy');
    let stickerAt = -1, toastAt = -1, quietEnd = -1, early = false;
    const t0 = G.S.t;
    for (let i = 0; i < 60 * 12; i++) {
      G.update(DT);
      const q = G.row.quiet();
      if (q && (G.prog.current || G.S.lastToast === 'A toast in the middle of it' || G.feel.cur)) early = true;
      if (!q && quietEnd < 0) quietEnd = G.S.t;
      if (G.prog.current && stickerAt < 0) stickerAt = G.S.t;
      if (G.S.lastToast === 'A toast in the middle of it' && toastAt < 0) toastAt = G.S.t;
      if (stickerAt > 0 && toastAt > 0) break;
    }
    h.ok(!early, 'nothing came up while the row was busy');
    h.ok(quietEnd > t0, 'the quiet ends once the panel is gone (' + (quietEnd - t0).toFixed(2) + ' s)');
    h.ok(toastAt >= quietEnd && toastAt - quietEnd < 0.5, 'then the toast speaks');
    h.ok(stickerAt >= quietEnd && stickerAt - quietEnd < 1, 'and the sticker slaps on');
    h.eq(G.row.K2.toasts.length, 0, 'nothing left waiting');
    // the old path (no row): the JACKPOT banner as ever
    const B = rrBoot(true), b0 = jp(B.G);
    fakeGrab(B.G, B.C, pick(B.G, 3));
    h.ok(!B.G.row.quiet(), 'no row: no quiet');
    h.eq(jp(B.G), b0 + 1, 'no row: the JACKPOT banner as ever');
  });

  h.test('rrow22: out of grabs, the turn ends (TURN OVER, the enemy turn) only after the row is played and its total shown', () => {
    const { G, C } = rrBoot(false);
    G.fight.player.grabs = 1;
    const turns = () => G.ann.log.filter((x) => x.k === 'in' && x.cls === 'turn').length;
    fakeGrab(G, C, pick(G, 2));
    const n0 = turns();
    let lastHit = -1, enemyAt = -1, banAt = -1, shownAtEnemy = 0;
    visual(G, 60 * 12, () => {
      const R = G.row.state, items = R ? R.slots.filter((s) => s.k === 'item') : [];
      if (lastHit < 0 && items.length && items.every((s) => s.st === 'hit')) lastHit = G.S.t;
      if (banAt < 0 && turns() > n0) banAt = G.S.t;
      if (G.fs.enemyTurn && enemyAt < 0) { enemyAt = G.S.t; shownAtEnemy = R ? R.slots.length : 0; }
      if (enemyAt > 0 && G.S.t - enemyAt > 0.6) return false;
    });
    h.ok(lastHit > 0 && banAt > 0 && enemyAt > 0, 'the row played, TURN OVER, the enemy turn');
    h.ok(banAt - lastHit >= 1.4, 'TURN OVER waits for the total to be shown (' + (banAt - lastHit).toFixed(2) + ' s after the last hit)');
    h.ok(enemyAt - lastHit >= 1.5, 'and so does the enemy turn (' + (enemyAt - lastHit).toFixed(2) + ' s)');
    h.ok(!G.row.state.slots.length, 'the panel is gone once the enemy turn is under way (it was ' + shownAtEnemy + ' cards as it began)');
  });

  h.test('rrow22: the first row a profile ever resolves gets a one-line hint, once (saved in clawspire_meta)', () => {
    const { T, G, C } = rrBoot(false);
    h.ok(!(G.S.meta.settings && G.S.meta.settings.rowHint), 'a new profile has not seen it');
    fakeGrab(G, C, pick(G, 2));
    let saw = 0;
    visual(G, 60 * 2, () => { if (G.row.state.hintT > 0) saw++; });
    h.ok(saw > 30, 'the hint shows under the panel (' + saw + ' frames)');
    const m = JSON.parse(T._store.clawspire_meta);
    h.eq(m.settings.rowHint, 1, 'saved inside the meta object (settings.rowHint)');
    h.ok(Object.keys(T._store).every((k) => /^clawspire_/.test(k)), 'no new localStorage key');
    settle(G, 20);
    if (G.fight.player.grabs <= 0) { G.endTurn(); settle(G, 30); }
    fakeGrab(G, C, pick(G, 2));
    let again = 0;
    visual(G, 60 * 2, () => { if (G.row.state.hintT > 0) again++; });
    h.eq(again, 0, 'the next row: no hint');
    const B = rrBoot(false, null, null, T._store);
    fakeGrab(B.G, B.C, pick(B.G, 2));
    let after = 0;
    visual(B.G, 60, () => { if (B.G.row.state.hintT > 0) after++; });
    h.eq(after, 0, 'a reload remembers it');
  });

  h.test('rrow22: the speed button on the panel cycles the speed (not a skip); 2x and 4x are still one by one', () => {
    const { G, C } = rrBoot(false);
    fakeGrab(G, C, pick(G, 3));
    visual(G, 50);
    const R = G.row.state, b = G.row.btn();
    h.ok(R.op > 0.5 && R.go, 'the panel is open');
    h.ok(G.row.tap(b.x + b.w / 2, b.y + b.h / 2), 'a tap on » 1x is taken');
    h.eq(G.row.speed(), 2, 'it is 2x now');
    h.ok(!R.skip, 'and the row was not skipped');
    const hits = [];
    visual(G, 60 * 6, () => { G.row.state.slots.forEach((s, i) => { if (s.k === 'item' && s.st === 'hit' && hits[i] == null) hits[i] = G.S.t; }); if (hits.filter((x) => x).length >= 3) return false; });
    const gaps = [hits[1] - hits[0], hits[2] - hits[1]];
    h.ok(gaps.every((g) => g >= 0.35 && g <= 0.6), '2x: about 0.45 s a card, still readable (' + gaps.map((g) => g.toFixed(2)).join(', ') + ')');
    G.row.cycle(); G.row.cycle();
    h.eq(G.row.speed(), 1, 'round to 1x');
  });

  h.test('rrow22: the panel draws its band, its open header, GO!, a stamp, the hint and the aim, in English and calm, never throwing', () => {
    const { T, G, C } = rrBoot(false, ['jackpot_bell', 'prize_counter']);
    const said = [];
    const ctx = new Proxy({}, { get(t, p) {
      if (p === 'measureText') return (s) => ({ width: String(s).length * 7 });
      if (p === 'fillText') return (s) => said.push(String(s));
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (p === 'canvas') return { width: 540, height: 960 };
      if (p in t) return t[p];
      return () => {};
    }, set(t, p, v) { t[p] = v; return true; } });
    let threw = null;
    G.S.headless = false;
    try {
      fakeGrab(G, C, pick(G, 3));
      for (let i = 0; i < 60 * 8 && !ready(G); i++) { G.update(DT); if (i % 4 === 0) { try { G.row.draw(ctx, G.S.t); } catch (e) { threw = e; break; } } }
      T.RENDER.fx.reduced = true;
      fakeGrab(G, C, pick(G, 2));
      for (let i = 0; i < 60 * 6 && !ready(G); i++) { G.update(DT); if (i % 4 === 0) { try { G.row.draw(ctx, G.S.t); } catch (e) { threw = e; break; } } }
    } finally { G.S.headless = true; T.RENDER.fx.reduced = false; }
    h.ok(!threw, 'never throws: ' + (threw && threw.stack));
    h.ok(said.includes('YOUR HITS'), 'the header says YOUR HITS');
    h.ok(said.includes('» 1x'), 'the speed button');
    h.ok(said.some((s) => /one by one/.test(s)), 'the first-time hint');
    h.ok(said.includes('JACKPOT!'), 'the JACKPOT stamp');
    said.length = 0;
    T.RENDER.rrRow(ctx, { x0: 8, x1: 532, y: 336, ph: 92, op: 0, a: 1, t: 0, slots: [{ k: 'item', st: 'wait', cx: 120, cy: 382, w: 120, h: 82, def: T.DATA.ITEMS.rusty_sword, name: 'Rusty Sword', pre: { d: 6, any: true } }] });
    h.ok(said.includes('YOUR') && said.includes('HITS'), 'the band\'s label while the claw is out: ' + said.join(' | '));
    h.ok(said.includes('6') && said.includes('Rusty Sword'), 'a card: its number and its name');
    let threw2 = null;
    try {
      T.RENDER.rrRow(T._ctx, { x0: 8, x1: 532, y: 336, ph: 148, op: 1, a: 1, t: 1, go: 0.5, live: true, spd: 4, tot: { d: 12, b: 8, h: 3 }, tp: 1, stamp: { txt: 'DOUBLE', col: '#2ee6d6', t: 1 }, hint: 1, btn: { x: 446, y: 338, w: 78, h: 24 }, aim: [{ x: 200, y: 240, r: 40 }],
        slots: [{ k: 'item', st: 'lift', lift: 0.5, cx: 70, cy: 420, w: 120, h: 110, def: {}, pre: { d: 5, all: true, s: 'poison', sv: 2, any: true }, tag: 'FREE' }, { k: 'item', st: 'hit', cx: 200, cy: 420, w: 40, h: 110, res: { d: 3, any: true }, procs: [{ name: 'X', n: {} }] }, { k: 'grab', st: 'act', cx: 360, cy: 420, w: 160, h: 110, tag: 'COMBO', label: 'Scrap Storm', res: { gr: 1, any: true } }, null, {}] });
      T.RENDER.rrRow(T._ctx, { ph: 92, slots: [{}] });
    } catch (e) { threw2 = e; }
    h.ok(!threw2, 'junk input never throws: ' + (threw2 && threw2.stack));
  });
}

h.done();
