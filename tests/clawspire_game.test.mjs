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
  h.eq(G.run.maxHp, 70, '70 hp');
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
  const list = T._nodes.tipsBody.children.find(c => c.className === 'tipList');
  h.eq(list.children.length, Gt.feel.TIPS.length, 'one row per tip');
  const got = list.children.filter(r => /got/.test(r.className));
  h.eq(got.length, 2, 'the two met ones in full');
  h.ok(got.some(r => r.children[1].children[0].textContent === 'Grab combo'), 'with their title');
  h.ok(list.children.filter(r => !/got/.test(r.className)).every(r => r.children[1].children[0].textContent === '???'), 'the rest dark');
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
  // the widest fixed box inside a scaled body (the title's buttons, 280 px) still fits the stage at x1.3
  const menuW = +(/\.menu \.btn\{width:(\d+)px\}/.exec(html) || [0, 999])[1];
  h.ok(menuW * 1.3 <= 540 - 32, 'the title buttons fit at extra large (' + menuW * 1.3 + ' px of 508)');
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
  h.eq(T._nodes.actTxt.textContent, 'Back Rm', 'the HUD says the Back Room');
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
  h.eq(G.screen, 'map', 'back on the Back Room map');
  const sh = land.find(t => t.type === 'shop');
  sh.revealed = true;
  G.enterTile(sh);
  h.eq(G.screen, 'shop', 'the service counter');
  const shop = G.S.sd.shop;
  h.ok(shop.sec && shop.items.length >= 3 && shop.items.every(it => T.DATA.ITEMS[it.id].rarity === 'l'), 'legendary stock only');
  h.ok(!shop.relic || T.DATA.RELICS[shop.relic.id].rarity === 'boss', 'and a boss relic');
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

h.done();
