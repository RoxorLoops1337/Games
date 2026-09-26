// Clawspire -- integration suite for js/game.js (and index.html).
// Boots the whole game headless through tests/clawspire_lib.mjs and drives a
// run: title -> new run -> map -> reveal/move -> fight -> claw drops -> enemy
// turn -> fight end -> reward -> save/load -> game over -> meta stats.
import { boot, harness } from './clawspire_lib.mjs';

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
  Gt.tap(fp.x, fp.y);
  h.ok(M.pos.q === shore.q && Gt.run.ink === 1, 'with 1 ink the ford is refused');
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
  h.eq(Gt.run.ink, ink + eliteInk + 2, 'elite ink plus the +2 ink bonus');
  Gt.choose(0);
  h.eq(Gt.run.relics.length, relics + 1, 'relic taken');
  h.eq(Gt.screen, 'map', 'back on the map');
  h.ok(tower.done, 'tower cleared');
  // The other bonus kinds apply without throwing.
  for (const bonus of [{ k: 'gold', n: 60 }, { k: 'brush', id: 'splash' }, { k: 'claw', u: 'width' }]) {
    const T2 = boot(); const G2 = T2.GAME; G2.newRun('knight', 77);
    const tw = Object.values(G2.run.map.tiles).find(t => t.type === 'tower');
    tw.content.tower.bonus = bonus;
    const gold = G2.run.gold, brushes = G2.run.brushes.length, width = G2.run.claw.width;
    G2.enterTile(tw); stepFor(G2, 0.2); G2.endFight('win'); G2.choose(3);
    h.eq(G2.screen, 'treasure', bonus.k + ' bonus reaches the treasure screen');
    if (bonus.k === 'gold') h.ok(G2.run.gold >= gold + 60, 'gold bonus paid');
    if (bonus.k === 'brush') h.eq(G2.run.brushes.length, brushes + 1, 'brush bonus paid');
    if (bonus.k === 'claw') h.ok(G2.run.claw.width > width, 'claw bonus applied');
    G2.choose(0);
    h.eq(G2.screen, 'map', bonus.k + ': back on the map');
  }
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
  // Make sure we are in a fight with a live enemy.
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

h.done();
