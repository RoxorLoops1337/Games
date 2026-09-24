// Claw Crawl: headless suite.
//
// Drives the real game through tests/claw_crawl_lib.mjs: item and enemy data,
// the physics pile, the claw cycle, combat effects, the hex map with its
// brushes and inks, rewards, shops and saves, and draw() on every screen.
// Run: node tests/claw_crawl.test.mjs

import { boot } from './claw_crawl_lib.mjs';

let passed = 0, failed = 0;
function test(name, fn){ try { fn(); passed++; } catch (e){ failed++; console.error(`FAIL ${name}: ${e.stack || e.message}`); } }
function assert(cond, msg){ if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg){ if (a !== b) throw new Error(`${msg || 'not equal'}: ${a} !== ${b}`); }

function fresh(seed){ const A = boot(); A.newRun(seed == null ? 7 : seed); A.toMap(); return A; }
function steps(A, n){ for (let i = 0; i < n; i++){ if (!A.F) return; A.stepFight(1 / 60); } }
function drop(A, x){
  const F = A.F; F.claw.tx = x; F.claw.pending = true;
  let k = 0; do { A.stepFight(1 / 60); k++; } while (A.F && (A.F.claw.st !== 'idle' || k < 10) && k < 1500);
  return k;
}

let _a0; function A0(){ return _a0 || (_a0 = fresh(1)); }

test('item data is complete', () => {
  for (const [id, d] of Object.entries(A0().ITEMS)){
    assert(d.n && d.e && d.sh && d.col && d.fx, 'incomplete item ' + id);
    assert(['cap', 'blob', 'ball'].includes(d.sh[0]), 'bad shape ' + id);
    assert(d.dens > 0, 'bad density ' + id);
    if (!d.junk) assert([0, 1, 2].includes(d.rar), 'bad rarity ' + id);
  }
});

test('every enemy move is well formed and every encounter exists', () => {
  const A = A0();
  const KEYS = new Set(['atk', 'x', 'block', 'str', 'poison', 'burn', 'weak', 'vuln', 'junk', 'n', 'steal', 'freeze', 'drain']);
  for (const [id, e] of Object.entries(A.ENEMIES)){
    assert(e.hp > 0 && e.mv.length, 'bad enemy ' + id);
    for (const m of e.mv) for (const k of Object.keys(m)){ assert(KEYS.has(k), `unknown move key ${k} on ${id}`); if (k === 'junk') assert(A.ITEMS[m.junk] && A.ITEMS[m.junk].junk, 'junk must be a junk item on ' + id); }
  }
  for (const act of [1, 2, 3]) for (const tier of ['easy', 'hard', 'elite']) for (const enc of A.ENC[act][tier]) for (const id of enc) assert(A.ENEMIES[id], 'missing enemy ' + id);
});

test('every item has readable effect text', () => {
  const A = A0();
  for (const id of Object.keys(A.ITEMS)) for (const l of [1, 2, 3]) assert(A.fxText(id, l).length > 3, 'no text for ' + id);
});

test('the pile settles and falls asleep without overlapping', () => {
  const A = fresh(3);
  A.startFight('normal', ['rat'], 0);
  steps(A, 300);
  assert(A.W.bodies.length === A.G.run.deck.length, 'all items should be in the machine');
  const asleep = A.W.bodies.filter(b => b.sl).length;
  assert(asleep >= A.W.bodies.length - 1, 'pile should come to rest, awake: ' + (A.W.bodies.length - asleep));
  A.wakeAll(); A.collide();
  let worst = 0; for (const c of A.W.contacts) worst = Math.max(worst, c.pen);
  assert(worst < 4, 'bodies interpenetrate by ' + worst.toFixed(2));
  for (const b of A.W.bodies) assert(b.x > 0 && b.x < A.MW && b.y < A.MH + 1, 'body escaped the box');
});

test('the claw completes a full cycle and grabs things over many drops', () => {
  const A = fresh(11);
  A.startFight('normal', ['rat'], 0);
  const F = A.F; F.enemies[0].hp = F.enemies[0].max = 99999;
  steps(A, 200);
  let got = 0, drops = 0;
  for (let t = 0; t < 6; t++){
    let g = 0; while (A.F.phase !== 'player' && g++ < 3000) steps(A, 1);
    while (A.F.grabs > 0 && A.F.phase === 'player'){
      const xs = A.W.bodies.filter(b => b.x > A.CHW + 20).map(b => b.x);
      const before = A.F.got.length;
      const k = drop(A, xs.length ? xs[(drops * 7) % xs.length] : 200);
      assert(k < 1500, 'claw got stuck in ' + A.F.claw.st);
      steps(A, 40);
      got += A.F.got.length - before; drops++;
    }
    let g2 = 0; while (A.F.phase === 'player' && g2++ < 600) steps(A, 1);
  }
  assert(drops >= 15, 'too few drops ' + drops);
  const rate = got / drops;
  assert(rate > 0.3 && rate < 2.5, 'grab rate out of range: ' + rate.toFixed(2));
});

test('items come back into the machine every turn', () => {
  const A = fresh(5);
  A.startFight('normal', ['rat'], 0);
  const F = A.F; F.enemies[0].hp = F.enemies[0].max = 99999;
  const total = A.G.run.deck.length;
  steps(A, 120);
  for (let i = 0; i < 3; i++){ drop(A, 150 + i * 60); steps(A, 30); }
  let g = 0; while (A.F.phase !== 'player' || A.F.turn < 2){ steps(A, 1); if (g++ > 5000) break; }
  steps(A, 120);
  const inPlay = A.W.bodies.length + A.F.used.length + A.F.spawnQ.length + A.F.flies.filter(f => f.it).length;
  eq(inPlay, total, 'nothing may vanish');
});

test('effects: damage, block, statuses, chill freezes, echo', () => {
  const A = fresh(9);
  A.startFight('normal', ['goblin'], 0);
  const F = A.F, e = F.enemies[0]; e.hp = e.max = 500;
  A.useItem({ id: 'sword', lvl: 1 }); eq(e.hp, 495, 'sword deals 5');
  A.useItem({ id: 'sword', lvl: 3 }); eq(e.hp, 486, 'level 3 sword deals 9');
  A.useItem({ id: 'shield', lvl: 1 }); eq(F.P.block, 5, 'shield blocks');
  A.useItem({ id: 'poison', lvl: 1 }); eq(e.st.poison, 4);
  A.useItem({ id: 'fire', lvl: 1 }); eq(e.st.burn, 4);
  A.useItem({ id: 'ice', lvl: 1 }); A.useItem({ id: 'ice', lvl: 1 }); A.useItem({ id: 'ice', lvl: 1 });
  assert(e.frozen, 'six chill should freeze');
  A.useItem({ id: 'clover', lvl: 1 });
  const hp = e.hp; A.useItem({ id: 'dagger', lvl: 1 }); eq(hp - e.hp, 6, 'echo fires the dagger twice');
  A.useItem({ id: 'hammer', lvl: 1 }); assert(e.st.vuln >= 2, 'hammer applies vulnerable');
  const h2 = e.hp; A.useItem({ id: 'sword', lvl: 1 }); eq(h2 - e.hp, 7, 'vulnerable adds 50%');
  const g = F.grabs; A.useItem({ id: 'gem', lvl: 1 }); eq(F.grabs, g + 1, 'gem gives a grab');
});

test('enemy turn: attacks hit block first, junk and steal work, frozen skips', () => {
  const A = fresh(4);
  A.startFight('normal', ['rat'], 0);
  const F = A.F, e = F.enemies[0];
  F.P.block = 3; const hp = A.G.run.hp;
  F.phase = 'enemy';
  A.doMove(e, { atk: 5 }); eq(A.G.run.hp, hp - 2, 'block soaks first');
  const q = F.spawnQ.length; A.doMove(e, { junk: 'slime', n: 2 }); eq(F.spawnQ.length, q + 2, 'junk queued');
  steps(A, 60);
  const n = A.W.bodies.length; A.doMove(e, { steal: 2 }); eq(e.pouch.length, 2, 'stole two'); eq(A.W.bodies.length, n - 2);
  A.killEnemy(e); eq(e.pouch.length, 0, 'pouch returns on death');
  const A2 = fresh(4); A2.startFight('normal', ['rat'], 0);
  const e2 = A2.F.enemies[0]; e2.frozen = true; A2.F.phase = 'enemy'; const hp2 = A2.G.run.hp;
  e2.intent = { atk: 50 }; A2.enemyAct(e2); eq(A2.G.run.hp, hp2, 'frozen enemy skips'); assert(!e2.frozen);
});

test('a full fight can be won by the bot and pays out', () => {
  const A = fresh(21);
  A.startFight('normal', ['rat'], 0);
  let guard = 0;
  while (A.F && A.G.scr === 'fight' && guard++ < 40000){
    if (A.F.phase === 'player' && A.F.claw.st === 'idle' && A.F.grabs > 0 && !A.F.claw.pending){
      const xs = A.W.bodies.filter(b => b.x > A.CHW + 20).map(b => b.x);
      A.F.claw.tx = xs.length ? xs[guard % xs.length] : 200; A.F.claw.pending = true;
    }
    A.stepFight(1 / 60);
  }
  assert(A.G.rq, 'reward screen should be up (hp ' + A.G.run.hp + ')');
  const deck = A.G.run.deck.length;
  A.ACT.pickItem(0);
  eq(A.G.run.deck.length, deck + 1, 'picked item joins the machine');
  eq(A.G.scr, 'map', 'back on the map');
});

test('map: boss reachable, brush and inks reveal, walking stops at encounters', () => {
  const A = fresh(13);
  const m = A.G.run.map, cells = m.cells;
  const boss = cells.findIndex(c => c.k === 'boss');
  assert(boss >= 0 && cells[boss].rev, 'boss visible');
  cells.forEach(c => { c.rev = true; });
  assert(A.pathTo({ cells: cells.map(c => Object.assign({}, c, { k: '' })), pos: m.pos }, boss), 'boss reachable');
  const A2 = fresh(13), m2 = A2.G.run.map;
  const before = m2.cells.filter(c => c.rev).length;
  A2.ACT.tool('brush');
  assert(m2.cells.filter(c => c.rev).length >= before, 'brush reveals');
  eq(A2.G.run.brushes, 2);
  const nb = A2.neighbors(m2.cells, m2.pos)[0];
  A2.ACT.tool('line'); A2.tapMap(nb);
  eq(A2.G.run.inks.line, 1, 'first tap only aims');
  A2.tapMap(nb);
  eq(A2.G.run.inks.line, 0, 'second tap paints');
  A2.ACT.tool('brush');
  eq(A2.G.run.brushes, 2, 'a brush with nothing new to paint is not spent');
  // walk somewhere painted
  const tgt = m2.cells.findIndex((c, i) => c.rev && !c.v && i !== m2.pos && A2.pathTo(m2, i));
  assert(tgt >= 0);
  A2.tapMap(tgt);
  for (let i = 0; i < 200 && A2.G.walk; i++) A2.stepWalk(0.05);
  assert(A2.G.walk === null, 'walk ends');
});

test('stuck safety: no tools and no path hands out a brush', () => {
  const A = fresh(2), r = A.G.run;
  r.brushes = 0; r.inks = { dot: 0, line: 0, twin: 0, grand: 0 };
  r.map.cells.forEach((c, i) => { if (i !== r.map.pos && c.k !== 'boss') c.rev = false; });
  A.checkStuck();
  eq(r.brushes, 1);
});

test('every map cell kind can be entered', () => {
  const A = fresh(17), r = A.G.run;
  r.gold = 999;
  for (const k of ['gold', 'ink', 'chest', 'camp', 'shop', 'mystery']){
    const c = r.map.cells[r.map.pos]; c.k = k; c.done = false; c.stock = null; c.ev = null;
    A.enterCell();
    A.draw();
  }
  A.ACT.buyItem(0); A.ACT.buyClaw('grabs'); eq(r.claw.grabs, 4, 'bought a grab');
  for (let i = 0; i < A.EVENTS.length; i++){ const c = r.map.cells[r.map.pos]; c.k = 'mystery'; c.ev = i; c.done = false; A.showEvent(); A.ACT.evPick(0); }
});

test('boss win advances the act, act 3 boss wins the run', () => {
  const A = fresh(19), r = A.G.run;
  const boss = r.map.cells.findIndex(c => c.k === 'boss');
  r.map.pos = boss; A.startFight('boss', A.ENC[1].boss, 0);
  A.F.enemies.forEach(e => A.killEnemy(e));
  steps(A, 120);
  assert(A.G.rq, 'reward up');
  A.ACT.skipStage(); A.ACT.pickClaw('size');
  eq(r.act, 2, 'act 2'); assert(r.claw.size > 1);
  r.act = 3; r.map = A.genMap(3);
  const b3 = r.map.cells.findIndex(c => c.k === 'boss'); r.map.pos = b3;
  A.startFight('boss', A.ENC[3].boss, 0); A.F.enemies.forEach(e => A.killEnemy(e)); steps(A, 120);
  A.ACT.skipStage(); A.ACT.pickClaw('grip');
  eq(A.G.meta.wins, 1, 'win recorded');
});

test('losing ends the run and clears the save', () => {
  const A = fresh(23);
  A.saveRun(); assert(A.loadRunData());
  A.startFight('normal', ['rat'], 0);
  A.F.phase = 'enemy'; A.hurtPlayer(999);
  steps(A, 120);
  eq(A.G.scr, 'over'); assert(!A.loadRunData(), 'save cleared');
});

test('save round-trips a run', () => {
  const A = fresh(29); A.G.run.gold = 321; A.saveRun();
  const B = boot({ store: A._store }); B.ACT.continue();
  eq(B.G.run.gold, 321); eq(B.G.scr, 'map');
});

test('draw() runs on every screen and every enemy', () => {
  const A = fresh(31);
  A.toTitle(); A.draw();
  A.toMap(); A.G.tool = 'line'; A.G.hover = 3; A.draw(); A.G.tool = null;
  for (const id of Object.keys(A.ENEMIES)){
    A.startFight('normal', [id, 'rat', 'bat'], 0.5);
    A.F.enemies[0].st = { poison: 2, burn: 3, weak: 1, vuln: 1, str: 2 }; A.F.enemies[0].chill = 2; A.F.enemies[0].block = 4;
    A.F.P.st = { str: 1, thorns: 2, regen: 1 }; A.F.P.block = 3; A.F.P.frozen = 1;
    A.F.enemies.forEach(e => { e.intent = { atk: 3, x: 2, block: 2, str: 1, poison: 1, junk: 'rock', n: 1, steal: 1, freeze: 1, drain: 1 }; });
    steps(A, 5); A.draw();
    A.useItem({ id: 'bomb', lvl: 2 }); steps(A, 30); A.draw();
  }
  A.showBag(); A.showHelp(); A.draw();
});

test('fixes: vulnerable lasts through the enemy turn, thorns stop multi-hits, heart gem once per fight', () => {
  const A = fresh(41);
  A.startFight('normal', ['rat'], 0);
  const F = A.F, e = F.enemies[0];
  F.P.st.vuln = 1; e.intent = { atk: 10 }; F.phase = 'player';
  eq(A.intentBits(e)[0][1], '15', 'preview includes vulnerable');
  A.endPlayerTurn(); const hp = A.G.run.hp;
  let g = 0; while (A.F.phase === 'enemy' && g++ < 400) A.stepFight(1 / 60);
  eq(hp - A.G.run.hp, 15, 'vulnerable applied to the real hit');
  const B = fresh(42); B.startFight('normal', ['rat'], 0);
  const e2 = B.F.enemies[0]; e2.hp = 1; B.F.P.st.thorns = 5; B.F.phase = 'enemy';
  const hp2 = B.G.run.hp; B.doMove(e2, { atk: 3, x: 3 });
  eq(hp2 - B.G.run.hp, 3, 'dead attacker stops hitting');
  const C = fresh(43); C.startFight('normal', ['rat'], 0);
  const mx = C.G.run.max, it = { id: 'heart', lvl: 1, uid: 999 };
  C.useItem(it); C.useItem(it);
  eq(C.G.run.max, mx + 1, 'max HP from one heart once per fight');
});

test('reload mid-fight puts you back in the fight; reload on rewards keeps them', () => {
  const A = fresh(44), r = A.G.run;
  const c = r.map.cells[r.map.pos]; c.k = 'fight'; c.done = false;
  A.saveRun();
  const B = boot({ store: A._store }); B.ACT.continue();
  eq(B.G.scr, 'fight', 'fight resumes');
  B.F.enemies.forEach(e => B.killEnemy(e));
  for (let i = 0; i < 120; i++) B.stepFight(1 / 60);
  assert(B.G.rq, 'reward pending');
  const C = boot({ store: B._store }); C.ACT.continue();
  assert(C.G.rq && C.G.rq.stages.length, 'reward restored after reload');
});

test('input: long press inspects instead of dropping; release over the chute cancels', () => {
  const A = fresh(45);
  A.startFight('normal', ['rat'], 0); for (let i = 0; i < 200; i++) A.stepFight(1 / 60);
  const b = A.W.bodies[0];
  A.onDown(A.MX + b.x, A.MY + b.y);
  A.update(0.3); A.update(0.3);
  assert(A.G.tip, 'tooltip shows'); A.draw();
  A.onUp(); assert(!A.F.claw.pending, 'no drop after inspect');
  A.onDown(250, 450); A.onMove(40, 450); A.onUp();
  assert(!A.F.claw.pending, 'release over chute cancels');
});

test('input: drag aims, release drops', () => {
  const A = fresh(37);
  A.startFight('normal', ['rat'], 0); steps(A, 100);
  A.onDown(250, 400); A.onMove(260, 420); eq(A.F.claw.tx, 260 - A.MX); A.onUp();
  assert(A.F.claw.pending, 'release queues the drop');
  steps(A, 60); assert(A.F.claw.st !== 'idle', 'claw is moving');
});

console.log(`claw_crawl: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
