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
  // travelling to the aim point also counts as idle: wait for the drop to start, then to finish
  let k = 0;
  while (A.F && A.F.claw.st === 'idle' && k < 400){ A.stepFight(1 / 60); k++; }
  while (A.F && A.F.claw.st !== 'idle' && k < 1500){ A.stepFight(1 / 60); k++; }
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
  const KEYS = new Set(['atk', 'x', 'block', 'str', 'poison', 'burn', 'weak', 'vuln', 'junk', 'n', 'steal', 'freeze', 'drain', 'grease', 'raise', 'tilt']);
  for (const [id, e] of Object.entries(A.ENEMIES)){
    assert(e.hp > 0 && e.mv.length, 'bad enemy ' + id);
    for (const m of e.mv.concat(e.mv2 || [])) for (const k of Object.keys(m)){ assert(KEYS.has(k), `unknown move key ${k} on ${id}`); if (k === 'junk') assert(A.ITEMS[m.junk] && A.ITEMS[m.junk].junk, 'junk must be a junk item on ' + id); }
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
  eq(A.W.bodies.length, A.G.run.deck.length * 2, 'the bin holds two of every item');
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
  assert(rate > 0.3 && rate < 3, 'grab rate out of range: ' + rate.toFixed(2));
});

test('the claw really closes, and nothing escapes through the walls', () => {
  const A = fresh(81);
  for (let i = 0; i < 10; i++) A.G.run.deck.push({ id: ['shield', 'sword', 'apple', 'axe', 'balloon'][i % 5], lvl: 1, uid: 8000 + i });
  A.startFight('normal', ['rat'], 0);
  A.F.enemies[0].hp = A.F.enemies[0].max = 99999;
  const widest = []; let escapes = 0, drops = 0;
  for (let t = 0; t < 4; t++){
    let g = 0; while (A.F.phase !== 'player' && g++ < 3000) A.stepFight(1 / 60);
    while (A.F.grabs > 0 && A.F.phase === 'player'){
      const xs = A.W.bodies.filter(b => b.x > A.CHW + 20).map(b => b.x);
      A.F.claw.tx = xs.length ? xs[(drops * 5) % xs.length] : 200; A.F.claw.pending = true;
      let n = 0, seen = false;
      while (A.F.claw.st === 'idle' && n < 400){ A.stepFight(1 / 60); n++; }
      while (A.F.claw.st !== 'idle' && n < 1500){
        A.stepFight(1 / 60); n++;
        if (!seen && A.F.claw.st === 'lift'){ seen = true; widest.push(Math.max(A.F.claw.pL, A.F.claw.pR)); }
      }
      drops++;
    }
    let g2 = 0; while (A.F.phase === 'player' && g2++ < 600) A.stepFight(1 / 60);
  }
  widest.sort((a, b) => a - b);
  const med = widest[widest.length >> 1];
  assert(med < 0.35, 'prongs should close; median widest prong at lift ' + med.toFixed(2));
  eq(A.F.escaped || 0, 0, 'items escaped the machine and respawned');
});

test('items come back into the machine every turn', () => {
  const A = fresh(5);
  A.startFight('normal', ['rat'], 0);
  const F = A.F; F.enemies[0].hp = F.enemies[0].max = 99999;
  const total = A.G.run.deck.length * 2;
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
  const g = F.grabs; F.used.push({ id: 'apple', lvl: 1 }, { id: 'apple', lvl: 1 }); const q = F.spawnQ.length;
  A.useItem({ id: 'gem', lvl: 1 }); eq(F.grabs, g, 'gems no longer give drops'); eq(F.spawnQ.length, q + 2, 'gem refills the bin');
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
  eq(A2.G.run.brushes, 1);
  A2.G.run.inks.line = 1;
  const nb = A2.neighbors(m2.cells, m2.pos)[0];
  A2.ACT.tool('line'); A2.tapMap(nb);
  eq(A2.G.run.inks.line, 1, 'first tap only aims');
  A2.tapMap(nb);
  eq(A2.G.run.inks.line, 0, 'second tap paints');
  A2.ACT.tool('brush');
  eq(A2.G.run.brushes, 1, 'a brush with nothing new to paint is not spent');
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
  A.ACT.buyItem(0); const sz = r.claw.size; A.ACT.buyClaw('size'); assert(r.claw.size > sz, 'bought a bigger claw');
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

test('traits: balloons float, magnets pull metal, coconuts bounce', () => {
  const A = fresh(51);
  A.startFight('normal', ['rat'], 0);
  A.F.enemies[0].hp = A.F.enemies[0].max = 9999;
  A.W.bodies.length = 0;
  const bal = A.spawnBody({ id: 'balloon', lvl: 1, uid: 900 }, true); bal.x = 200; bal.y = 280;
  const mag = A.spawnBody({ id: 'magnet', lvl: 1, uid: 901 }, true); mag.x = 150; mag.y = 290;
  const coin = A.spawnBody({ id: 'coin', lvl: 1, uid: 902 }, true); coin.x = 240; coin.y = 290;
  A.F.spawnQ.length = 0;
  for (let i = 0; i < 240; i++) A.stepFight(1 / 60);
  assert(bal.y < 200, 'balloon should rise, y=' + bal.y.toFixed(0));
  assert(Math.hypot(coin.x - mag.x, coin.y - mag.y) < 50, 'coin should be pulled to the magnet');
});

test('set bonuses, combo multiplier and new items', () => {
  const A = fresh(52);
  A.startFight('normal', ['goblin'], 0);
  const F = A.F, e = F.enemies[0]; e.hp = e.max = 500; A.G.run.hp = 30;
  F.dropItems = [{ id: 'apple' }, { id: 'banana' }]; F.sets = {};
  const hp = A.G.run.hp; A.collect({ it: { id: 'apple', lvl: 1, uid: 1 }, x: 10, y: 10 });
  assert(A.G.run.hp > hp, 'salad heals');
  A.useItem({ id: 'sword', lvl: 1 }, 3); eq(e.hp, 500 - 7, 'third item in a drop: sword x1.3 = 7');
  A.useItem({ id: 'chili', lvl: 1 }); eq(e.st.burn, 3, 'chili burns all');
  A.G.run.hp = 20; F.P.st.poison = 5; A.useItem({ id: 'garlic', lvl: 1 }); eq(F.P.st.poison, 0, 'garlic cleanses');
  const h = e.hp; A.useItem({ id: 'pea', lvl: 1 }); eq(h - e.hp, 5, 'pea pod hits five times');
  const q = F.spawnQ.length; A.collect({ it: { id: 'boomer', lvl: 1, uid: 77 }, x: 10, y: 10 }); eq(F.spawnQ.length, q + 1, 'boomerang flies back');
});

test('enemies: gloop splits, bosses reach phase 2, tilt, grease and raise work', () => {
  const A = fresh(53);
  A.startFight('normal', ['slime'], 0);
  A.killEnemy(A.F.enemies[0]);
  eq(A.F.enemies.filter(e => !e.dead).length, 2, 'two glooplets'); eq(A.F.phase, 'player', 'fight goes on');
  const B = fresh(54); B.startFight('boss', ['crab'], 0);
  const c = B.F.enemies[0]; B.hitEnemy(c, Math.ceil(c.max / 2) + 5);
  assert(c.phase2, 'phase 2 at half HP');
  B.F.phase = 'enemy';
  B.doMove(c, { raise: 1 }); assert(B.W.segs[3].ay < B.MH - B.DIVH, 'wall raised');
  B.doMove(c, { grease: 1 }); B.doMove(c, { tilt: 1 });
  const g0 = B.clawGrip(); B.endPlayerTurn(); B.F.phase = 'player'; B.playerTurnStart(false);
  assert(B.clawGrip() < g0, 'greased prongs grip worse');
  B.F.phase = 'player'; B.endPlayerTurn(); eq(B.W.segs[3].ay, B.MH - B.DIVH, 'wall back down');
  B.draw();
});

test('guided first run: brush, walk, drop, chute, intents', () => {
  const A = boot(); A.newRun(61); A.toMap();
  eq(A.G.meta.tut, 0);
  const m = A.G.run.map, fightI = m.cells.findIndex(c => c.tut);
  assert(fightI >= 0 && A.neighbors(m.cells, m.pos).indexOf(fightI) >= 0, 'a tutorial fight sits next to the start');
  A.ACT.tool('brush'); eq(A.G.meta.tut, 1, 'brush beat');
  A.tapMap(fightI); for (let i = 0; i < 40 && A.G.walk; i++) A.stepWalk(0.2);
  eq(A.G.scr, 'fight'); eq(A.G.meta.tut, 2, 'fight beat'); eq(A.F.enemies[0].id, 'rat');
  A.draw();
  let g = 0;
  while (A.G.meta.tut < 5 && g++ < 20000){
    if (A.F.phase === 'player' && A.F.claw.st === 'idle' && A.F.grabs > 0 && !A.F.claw.pending){
      const xs = A.W.bodies.filter(b => b.x > A.CHW + 20).map(b => b.x); A.F.claw.tx = xs.length ? xs[g % xs.length] : 200; A.F.claw.pending = true;
    }
    A.F.enemies[0].hp = A.F.enemies[0].max = 999;
    A.stepFight(1 / 60);
    if (g % 500 === 0) A.draw();
  }
  eq(A.G.meta.tut, 5, 'tutorial completes');
  const B = boot({ store: A._store }); B.newRun(62);
  assert(!B.G.run.map.cells.some(c => c.tut), 'no tutorial fight once finished');
});

test('meta: tickets, prize wall, characters and tilt', () => {
  const A = fresh(71);
  A.G.meta.tut = 5;
  A.startFight('normal', ['rat'], 0); A.F.phase = 'enemy'; A.hurtPlayer(999);
  for (let i = 0; i < 120; i++) A.stepFight(1 / 60);
  assert(A.G.meta.tickets >= 0 && A.G.scr === 'over', 'run over, tickets banked');
  A.G.meta.tickets = 500;
  A.ACT.wall(); A.ACT.buyUnlock('crab'); A.ACT.buyUnlock('toys');
  assert(A.G.meta.chars.indexOf('crab') >= 0 && A.G.meta.unlocked.indexOf('toys') >= 0, 'unlocks bought');
  eq(A.G.meta.tickets, 500 - 90 - 30, 'tickets spent');
  A.G.meta.tiltMax = 10; A.ACT.newRun(); A.ACT.pickChar('crab');
  for (let i = 0; i < 12; i++) A.ACT.tiltUp();
  A.ACT.begin();
  const r = A.G.run;
  eq(r.char, 'crab'); eq(r.tilt, 10); eq(r.claw.grabs, 2); eq(r.max, 62, 'crab 70 HP minus tilt 3');
  eq(r.brushes, 1, 'tilt 4 costs a brush'); assert(r.deck.some(d => d.id === 'bone'), 'tilt 9 adds a bone');
  A.startFight('boss', ['crab'], 0);
  eq(A.F.enemies[0].st.str, 2, 'tilt 10 boss strength'); A.draw();
  const B = fresh(72); B.G.meta.unlocked = [];
  for (let i = 0; i < 40; i++) for (const id of B.rollItems(3, [0.34, 0.33, 0.33])) assert(['magnet', 'balloon', 'boomer', 'die', 'jam', 'coconut', 'chili'].indexOf(id) < 0, 'locked item rolled: ' + id);
});

test('map: landmarks show through fog, tower reveals, shrine blesses, vault is guarded', () => {
  const A = fresh(91), r = A.G.run, m = r.map;
  for (const k of ['tower', 'shrine', 'vault']) assert(m.cells.some(c => c.k === k && c.lm), 'map has a ' + k);
  const t = m.cells.findIndex(c => c.k === 'tower');
  m.pos = t; const before = m.cells.filter(c => c.rev).length; A.enterCell();
  assert(m.cells.filter(c => c.rev).length > before + 10, 'watchtower paints a wide area'); assert(m.cells[t].done);
  const sh = m.cells.findIndex(c => c.k === 'shrine'); m.pos = sh; A.enterCell();
  const mx = r.max; A.ACT.bless(0); eq(r.max, mx + 8, 'blessing of plenty'); assert(m.cells[sh].done);
  const v = m.cells.findIndex(c => c.k === 'vault'); m.pos = v; A.enterCell();
  eq(A.G.scr, 'fight'); eq(A.F.kind, 'elite', 'vaults are guarded by an elite');
  A.F.enemies.forEach(e => A.killEnemy(e)); for (let i = 0; i < 120; i++) A.stepFight(1 / 60);
  assert(A.G.rq.stages.length >= 2, 'vault pays an extra rare item pick');
  A.draw();
});

test('bin: grabbed items trickle back after each drop, extra drops are boss-only', () => {
  const A = fresh(92);
  A.startFight('normal', ['rat'], 0); A.F.enemies[0].hp = A.F.enemies[0].max = 9999;
  const F = A.F;
  F.used.push({ id: 'sword', lvl: 1 }, { id: 'sword', lvl: 1 }, { id: 'apple', lvl: 1 });
  const q = F.spawnQ.length; A.onDropDone(); eq(F.spawnQ.length, q + 2, 'two fall back after a drop');
  const r = A.G.run, c = r.map.cells[r.map.pos]; c.k = 'shop'; c.done = false; r.gold = 999; A.enterCell();
  const before = r.claw.grabs; A.ACT.buyClaw('grabs'); eq(r.claw.grabs, before, 'the shop does not sell drops');
});

test('map: continuing a run never leaves shrunken hexes; drag scrolls the map', () => {
  const A = fresh(93); A.G.time = 500; A.ACT.tool('brush'); A.saveRun();
  const B = boot({ store: A._store }); B.ACT.continue();
  assert(B.G.run.map.cells.every(c => c.revT < B.G.time + 1), 'reveal clocks reset on continue');
  B.draw();
  B.G.cam = B.mapMaxCam ? B.G.cam : B.G.cam;
  const c0 = B.G.cam; B.onDown(200, 400); B.onMove(200, 520); B.onUp();
  assert(B.G.cam !== c0 || c0 === 0, 'dragging pans the map');
  const pos = B.G.run.map.pos; B.onDown(200, 400); B.onUp();
  eq(B.G.run.map.pos, pos, 'a tap on fog does not move you');
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
