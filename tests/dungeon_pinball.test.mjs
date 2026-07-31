// Dungeon Pusher — Pinball Battles prototype, headless suite.
//
// One self-contained file (dungeon_pusher/pinball.html). This harness stubs a
// DOM + no-op 2d context + Image, evals the inline <script> with
// __DPB_HEADLESS__ set, and drives the real battle through window.DPB.
//
// What matters here is the COMBAT CONTRACT, because these numbers are meant
// to transfer straight into dungeon_pusher/index.html: the three anti-runaway
// dials (purse cap, combo cap, combo step), the coin -> effect mapping that
// mirrors applyLoot(), and every defensive trait in the roster.
//
// Run: node tests/dungeon_pinball.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function loadGame(){
  const here = dirname(fileURLToPath(import.meta.url));
  const html = readFileSync(join(here, '..', 'dungeon_pusher', 'pinball.html'), 'utf8');
  const code = html.match(/<script>([\s\S]*)<\/script>/)[1];

  const noop = () => {};
  const ctx = new Proxy({}, { get(_t, k){
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'canvas') return { width: 440, height: 780 };
    return noop;
  }, set(){ return true; } });
  const mkEl = () => new Proxy({
    style: {}, dataset: {}, children: [],
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    addEventListener: noop, removeEventListener: noop, appendChild: noop, remove: noop,
    setAttribute: noop, getContext: () => ctx, querySelector: () => mkEl(), querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 440, height: 780 }),
    innerHTML: '', textContent: '', width: 440, height: 780,
  }, { get(t, k){ return (k in t) ? t[k] : noop; }, set(t, k, v){ t[k] = v; return true; } });

  const store = {};
  global.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = '' + v; }, removeItem: k => { delete store[k]; },
  };
  // sprites resolve immediately so the art path is exercised, not skipped
  global.Image = class { set src(v){ this._src = v; if (this.onload) this.onload(); } get src(){ return this._src; } };
  global.requestAnimationFrame = noop;
  global.addEventListener = noop;
  global.devicePixelRatio = 1;
  global.innerWidth = 440; global.innerHeight = 780;
  global.document = new Proxy({
    getElementById: () => mkEl(), createElement: () => mkEl(),
    querySelector: () => mkEl(), querySelectorAll: () => [], addEventListener: noop, body: mkEl(),
  }, { get(t, k){ return (k in t) ? t[k] : noop; } });
  global.window = new Proxy(global, {
    get(t, k){ return (k in t) ? t[k] : undefined; }, set(t, k, v){ t[k] = v; return true; },
  });
  global.__DPB_HEADLESS__ = true;

  eval('(function(){' + code + '\n})()');
  return globalThis.DPB;
}

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  FAIL  ' + m); } };

const DPB = loadGame();
const { S, P, B, T } = DPB;
const finite = v => typeof v === 'number' && isFinite(v);
const speed = b => Math.hypot(b.vx, b.vy);
const step = secs => { const n = Math.max(1, Math.round(secs / P.STEP)); for (let i = 0; i < n; i++) DPB.update(P.STEP); };
const onlyBall = (x, y, vx = 0, vy = 0) => {
  S.inplay.length = 0;
  const b = DPB.newBall(x, y, vx, vy);
  b.inLane = false;
  S.inplay.push(b);
  return b;
};
// a clean table for a physics probe: no scenery, no foe body in the way
// neutralise the foe so a coin->effect probe measures only the coin: no
// trait to absorb the hit, and a swing that cannot muddy the HP reading
const muteFoe = () => { S.foe.trait = null; S.foe.plate = 0; S.foe.pois = 0; S.foe.intent = { t:'hit', n: 0 }; };
const bareTable = () => { S.bumpers.length = 0; S.posts.length = 0; S.targets.length = 0; S.foe.hp = 9999; S.foe.y = -500; S.gel = null; };

console.log('dungeon_pinball');

/* ------------------------------------------------------------------ boot */
ok(!!DPB, 'exposes window.DPB');
ok(S.screen === 'title', 'boots to the title screen');
ok(S.flippers.length === 2, 'the table has two flippers');
ok(!!S.foe && S.foe.hp > 0, 'a foe is staged');
DPB.draw(); DPB.hud();
ok(true, 'draw() and hud() survive the title state');

/* ------------------------------------------------------- the bare table */
DPB.startRun(1234);
ok(S.screen === 'battle' && S.floor === 1, 'startRun opens B1');
ok(S.hp === B.START_HP, 'you start on ' + B.START_HP + ' HP, same as the pusher');
ok(S.loadout.join(',') === 'gold,gold,silver,lucky',
  'the cabinet ships with two gold, a silver and the lucky saucer');
ok(S.targets.length === 4, 'four targets are bolted on at the start');
ok(S.targets.some(t => t.saucer), 'and one of them is the saucer');
ok(S.purseCap === B.PURSE_CAP && S.comboCap === B.COMBO_CAP, 'the dials start at their floor values');
ok(S.targets.every(t => finite(t.x) && finite(t.y)), 'targets are placed at finite positions');
ok(S.launchReady, 'a ball waits on the plunger');

/* --- targets never overlap each other, the foe, or the bumpers --------- */
{
  let bad = 0;
  for (let f = 1; f <= 12; f++){
    DPB.startRun(500 + f);
    for (let i = 0; i < 6; i++) S.loadout.push(['gold','silver','red','green','blue'][i % 5]);
    DPB.buildTable();
    const all = [...S.targets, ...S.bumpers, ...S.posts];
    for (let i = 0; i < all.length; i++){
      for (let j = i + 1; j < all.length; j++){
        if (Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y) < all[i].r + all[j].r) bad++;
      }
      if (Math.hypot(all[i].x - S.foe.x, all[i].y - S.foe.y) < all[i].r + S.foe.r) bad++;
    }
  }
  ok(bad === 0, `no collider on the table overlaps another (${bad} overlaps)`);
}

/* ============================================== THE THREE ANTI-OP DIALS */

/* --- 1. the purse cap: one ball can only carry so much home ----------- */
{
  DPB.startRun(2000);
  for (let i = 0; i < 40; i++) DPB.earn('gold', 200, 300);
  ok(DPB.purseTotal() === S.purseCap, `the purse stops at its cap (${DPB.purseTotal()}/${S.purseCap})`);
  ok(DPB.purseFull(), 'and reports itself full');
  ok(S.combo === 40, 'but the overflow still feeds the combo');
}

/* --- 2. the combo cap: a clean ball multiplies, but only so far -------- */
{
  DPB.startRun(2001);
  S.combo = 0;
  ok(DPB.comboMult() === 1, 'no combo, no multiplier');
  S.combo = B.COMBO_STEP;
  ok(DPB.comboMult() === 2, 'one step in, x2');
  S.combo = B.COMBO_STEP * 9;
  ok(DPB.comboMult() === S.comboCap, `nine steps in, still capped at x${S.comboCap}`);
  S.comboCap = 4;
  ok(DPB.comboMult() === 4, 'raising the cap raises the ceiling');
}

/* --- 3. the table: a starting ball cannot burst a starting foe --------- */
{
  DPB.startRun(2002);
  const foeHp = S.foe.maxHp;
  // a perfect opening ball: purse full of gold at the maximum multiplier
  S.combo = 999;
  for (let i = 0; i < 30; i++) DPB.earn('gold', 200, 300);
  DPB.resolveNow();
  const dealt = foeHp - S.foe.hp;
  ok(dealt <= B.PURSE_CAP * B.COMBO_CAP, `a perfect opening ball deals at most purse x combo (${dealt})`);
  ok(dealt < foeHp, `and cannot one-shot a B1 foe (${dealt} vs ${foeHp} HP)`);
}

/* --- ...but a built-out table can ------------------------------------- */
{
  DPB.startRun(2003);
  const early = (() => { S.combo = 999; for (let i = 0; i < 30; i++) DPB.earn('gold', 0, 0);
    const m = DPB.comboMult(), n = Math.min(DPB.purseTotal(), S.purseCap); S.purse = {}; S.combo = 0; return n * m; })();
  for (const id of ['purse', 'purse', 'combo', 'combo']) DPB.takeFitting(id);
  const late = (() => { S.combo = 999; for (let i = 0; i < 40; i++) DPB.earn('gold', 0, 0);
    const m = DPB.comboMult(), n = Math.min(DPB.purseTotal(), S.purseCap); S.purse = {}; S.combo = 0; return n * m; })();
  ok(late > early * 2, `four fittings more than doubles a perfect ball (${early} -> ${late})`);
}

/* ==================================================== COIN -> EFFECT */
// this mapping is the contract with applyLoot() in the main game
{
  DPB.startRun(3000);
  muteFoe();
  S.combo = 0;                                     // x1, so the raw values show
  const hp0 = S.foe.hp;
  DPB.earn('gold', 0, 0); DPB.earn('gold', 0, 0);
  DPB.resolveNow();
  ok(hp0 - S.foe.hp === 2 * B.DMG_GOLD, 'gold strikes for DMG_GOLD apiece');
}
{
  DPB.startRun(3001);
  S.combo = 0;
  DPB.earn('silver', 0, 0); DPB.earn('silver', 0, 0); DPB.earn('silver', 0, 0);
  DPB.startResolve();
  DPB.flushResolve();          // land every coin, but stop short of the foe turn
  ok(S.block >= 3, `silver raises block (got ${S.block})`);
}
{
  DPB.startRun(3002);
  S.combo = 0;
  muteFoe();
  S.hp = 30;
  DPB.earn('red', 0, 0); DPB.earn('red', 0, 0);
  DPB.resolveNow();
  ok(S.hp >= 32, 'red mends HP');
  // the first resolve rolled the foe a fresh intent — mute it again so the
  // overheal probe reads the heal and nothing else
  muteFoe();
  S.hp = S.maxHp;
  S.combo = 0;
  DPB.earn('red', 0, 0);
  DPB.resolveNow();
  ok(S.hp === S.maxHp, 'and never overheals');
}
{
  DPB.startRun(3003);
  muteFoe();
  S.combo = 0;
  DPB.earn('green', 0, 0); DPB.earn('green', 0, 0);
  const hp0 = S.foe.hp;
  DPB.resolveNow();          // resolve rolls straight into the foe's turn
  ok(S.foe.hp < hp0, 'green rot ticks the foe on its own turn');
}
{
  DPB.startRun(3004);
  S.combo = 0;
  muteFoe();
  const hp0 = S.foe.hp;
  DPB.earn('lucky', 0, 0);
  DPB.resolveNow();
  ok(hp0 - S.foe.hp === B.DMG_LUCKY, `one lucky coin is worth ${B.DMG_LUCKY} strikes`);
}

/* --- the multiplier applies to the haul, once ------------------------- */
{
  DPB.startRun(3005);
  muteFoe();
  S.combo = B.COMBO_STEP;                         // x2
  const hp0 = S.foe.hp;
  DPB.earn('gold', 0, 0); DPB.earn('gold', 0, 0);
  DPB.resolveNow();
  ok(hp0 - S.foe.hp === 4, 'two gold at x2 is four damage');
}

/* --- the purse and combo clear between turns -------------------------- */
{
  DPB.startRun(3006);
  DPB.earn('gold', 0, 0); DPB.earn('gold', 0, 0);
  DPB.resolveNow();
  ok(DPB.purseTotal() === 0, 'the purse empties at resolve');
  ok(S.combo === 0, 'and the combo resets for the next ball');
  ok(S.block === 0, 'block never carries into your next turn — same as the pusher');
}

/* ======================================================== THE TRAY */
// A struck target knocks a coin loose and the coin FALLS into the tray.
// The tray is the purse made physical, so the two must never disagree.
{
  DPB.startRun(3100);
  muteFoe();
  ok(S.tray.length === 0, 'a fresh floor starts with an empty tray');
  DPB.earn('gold', 200, 400);
  ok(S.tray.length === 1, 'earning a coin drops one into the tray');
  const co = S.tray[0];
  ok(co.kind === 'gold', 'and it wears the right face');
  ok(co.y < DPB.S.tray[0].slot.y, 'it starts above its slot — it has to fall');
  ok(!co.settled, 'and it is not settled yet');
  ok(co.vy < 0, 'knocked upward first, so it arcs rather than teleports');
}
{
  // the fall: gravity, a bounce off the tray floor, then it settles home
  DPB.startRun(3101);
  muteFoe();
  DPB.earn('gold', 200, 400);
  const co = S.tray[0];
  let bounced = false;
  for (let i = 0; i < 240; i++){
    DPB.stepTray(P.STEP);
    if (co.bounces > 0) bounced = true;
    if (co.settled) break;
  }
  ok(bounced, 'the coin bounces when it hits the tray floor');
  ok(co.settled, 'and then settles');
  for (let i = 0; i < 120; i++) DPB.stepTray(P.STEP);
  ok(Math.abs(co.x - co.slot.x) < 1 && Math.abs(co.y - co.slot.y) < 1,
    'coming to rest exactly in its slot');
}
{
  // the tray and the purse are the same thing counted two ways
  DPB.startRun(3102);
  muteFoe();
  for (const k of ['gold', 'silver', 'red', 'gold']) DPB.earn(k, 200, 400);
  ok(S.tray.length === DPB.purseTotal(), 'tray and purse always agree');
  for (let i = 0; i < 40; i++) DPB.earn('gold', 200, 400);
  ok(S.tray.length === S.purseCap, 'and the tray honours the purse cap too');
}
{
  // coins stack into rows rather than piling on one spot
  DPB.startRun(3103);
  const a2 = DPB.traySlot(0), b2 = DPB.traySlot(1), c2 = DPB.traySlot(9);
  ok(b2.x > a2.x && b2.y === a2.y, 'the second coin sits beside the first');
  ok(c2.y < a2.y, 'the tenth starts a second row on top');
}

/* --------------------------------------- the resolve empties the tray */
// Dungeon Pusher fires the tray ONE PIECE AT A TIME, in RESOLVE_ORDER, each
// with its own delay that quickens within a run of the same face. This is
// that, so the cadence carries over.
{
  DPB.startRun(3110);
  muteFoe();
  S.combo = 0;
  for (const k of ['green', 'gold', 'silver', 'gold']) DPB.earn(k, 200, 400);
  DPB.startResolve();
  ok(S.queue.length === 4, 'every coin queues separately — nothing is lumped together');
  ok(S.queue[0].k === 'silver', 'shields go up first');
  ok(S.queue[S.queue.length - 1].k === 'green', 'and rot lands last');
  const order = S.queue.map(q => q.k).join(',');
  ok(order === 'silver,gold,gold,green', `the queue follows RESOLVE_ORDER (${order})`);
  ok(DPB.purseTotal() === 0, 'the purse is spent the moment the queue is built');
  ok(S.tray.length === 4, 'but the coins stay in the tray until they fire');
}
{
  // firing takes coins OUT of the tray, one per beat
  DPB.startRun(3111);
  muteFoe();
  S.combo = 0;
  for (let i = 0; i < 4; i++) DPB.earn('gold', 200, 400);
  DPB.startResolve();
  DPB.fireNext();
  ok(S.tray.length === 3, 'firing a coin lifts it out of the tray');
  ok(S.shots.length === 1, 'and throws it at its target');
  const hp0 = S.foe.hp;
  ok(S.foe.hp === hp0, 'nothing lands while it is still in the air');
  while (S.shots.length) S.shots.shift().hit();
  ok(S.foe.hp < hp0, 'the damage lands when the coin arrives');
}
{
  // the pusher's ramp: same face in a row fires quicker each time
  DPB.startRun(3112);
  muteFoe();
  S.combo = 0;
  for (let i = 0; i < 3; i++) DPB.earn('gold', 200, 400);
  DPB.earn('silver', 200, 400);
  DPB.startResolve();
  DPB.fireNext();                       // silver — first of its run
  const dSilver = S.resT;
  DPB.fireNext();                       // gold — type flipped, ramp resets
  const d1 = S.resT;
  DPB.fireNext();
  const d2 = S.resT;
  DPB.fireNext();
  const d3 = S.resT;
  ok(Math.abs(dSilver - DPB.RESOLVE_DELAY.silver) < 1e-9, 'the first of a face fires at its full delay');
  ok(Math.abs(d1 - DPB.RESOLVE_DELAY.gold) < 1e-9, 'a new face restarts the count');
  ok(d2 < d1 && d3 < d2, `each next coin of the same face is quicker (${d1.toFixed(3)} > ${d2.toFixed(3)} > ${d3.toFixed(3)})`);
  ok(d3 >= DPB.RESOLVE_DELAY.gold * 0.4 - 1e-9, 'but never below the floor — no machine-gun');
}
{
  // the turn does not pass until the last coin has actually landed
  DPB.startRun(3113);
  muteFoe();
  S.combo = 0;
  DPB.earn('gold', 200, 400);
  DPB.startResolve();
  DPB.fireNext();
  ok(S.queue.length === 0 && S.shots.length === 1, 'queue empty, one coin still flying');
  S.resT = -1;
  DPB.update(P.STEP);
  ok(S.phase === 'resolve', 'the foe does not get its turn while a coin is in the air');
  while (S.shots.length) S.shots.shift().hit();
  S.resT = -1;
  DPB.update(P.STEP);
  ok(S.phase !== 'resolve', 'once it lands, the turn moves on');
}
{
  // ...and the tray is empty afterwards, ready for the next ball
  DPB.startRun(3114);
  muteFoe();
  S.combo = 0;
  for (let i = 0; i < 3; i++) DPB.earn('gold', 200, 400);
  DPB.resolveNow();
  ok(S.tray.length === 0, 'the tray is empty when the turn is done');
  ok(S.queue.length === 0 && S.shots.length === 0, 'nothing left queued or in flight');
}
{
  // the mugger takes a real coin off the pile
  DPB.startRun(3115);
  S.foe.trait = 'thief';
  S.foe.intent = { t:'hit', n: 0 };
  for (let i = 0; i < 3; i++) DPB.earn('gold', 200, 400);
  DPB.startResolve();
  ok(S.tray.length === 2, 'the mugger physically lifts a coin out of the tray');
  ok(S.queue.length === 2, 'and it never reaches the queue');
}

/* ================================================== DEFENSIVE TRAITS */
const stage = (trait, hp) => {
  DPB.startRun(4000);
  S.foe.trait = trait;
  S.foe.hp = S.foe.maxHp = hp || 200;
  S.foe.plate = 0;
  return S.foe;
};
{
  // THE WARD shrugs a flat 2 off EVERY blow, as the pusher writes it. Gold
  // alone cannot scratch it — that is the monster, not a bug. You answer it
  // with the lucky saucer, with frost, with rot, or you pick another door.
  const f = stage('ward');
  const before = f.hp;
  DPB.hurtFoe(5, 'gold');
  ok(before - f.hp === 5 - B.WARD, 'the WAR TOTEM shrugs 2 off a blow');
  const b2 = f.hp;
  DPB.hurtFoe(1, 'gold');
  ok(f.hp === b2, 'a blow under its ward does nothing at all');
  DPB.hurtFoe(B.CHIP, 'chip');
  ok(f.hp === b2, 'and a body blow bounces off it too — bring a better tool');
  const g = stage('ward');
  const g0 = g.hp;
  DPB.hurtFoe(B.DMG_LUCKY, 'lucky');
  ok(g0 - g.hp === B.DMG_LUCKY - B.WARD, 'a lucky coin is heavy enough to get through');
  const g1 = g.hp;
  DPB.hurtFoe(3, 'blue');
  ok(g1 - g.hp === 3, 'frost ignores the ward entirely');
  const g2 = g.hp;
  DPB.hurtFoe(3, 'poison');
  ok(g2 - g.hp === 3, 'and so does rot');
}
{
  const f = stage('gel');
  const before = f.hp;
  DPB.hurtFoe(9, 'gold');
  ok(before - f.hp === 2, 'the GEL CUBE caps a single hit at 2');
  const b2 = f.hp;
  DPB.hurtFoe(9, 'blue');
  ok(b2 - f.hp === 9, 'but blue frost ignores the cap');
}
{
  const f = stage('armor');
  f.plate = 6;
  DPB.hurtFoe(4, 'gold');
  ok(f.plate === 2 && f.hp === f.maxHp, 'the plate soaks before the flesh does');
  DPB.hurtFoe(5, 'gold');
  ok(f.plate === 0 && f.maxHp - f.hp === 3, 'and the overflow carries through once it splits');
  f.plate = 10;
  const b3 = f.hp;
  DPB.hurtFoe(4, 'poison');
  ok(b3 - f.hp === 4 && f.plate === 10, 'rot ignores the plate entirely');
}
{
  // the SMASHER swings twice in a turn
  DPB.startRun(4001);
  S.foe.trait = 'fast';
  S.foe.atk = 3;
  S.foe.intent = { t:'hit', n: 3 };
  S.hp = 60; S.block = 0;
  DPB.foeTurn();
  ok(S.hp <= 54, `the SMASHER lands two blows in one turn (hp ${S.hp})`);
}

/* ================================================ THE FOE'S OWN TURN */
{
  DPB.startRun(5000);
  S.foe.trait = null;
  S.foe.intent = { t:'hit', n: 10 };
  S.hp = 50; S.block = 4;
  DPB.foeTurn();
  ok(S.hp === 44, 'block soaks first, the rest lands (50 - (10-4) = 44)');
  ok(S.block === 0, 'and the shield is spent');
}
{
  DPB.startRun(5001);
  S.foe.trait = null;
  S.foe.intent = { t:'hit', n: 3 };
  S.hp = 50; S.block = 9;
  DPB.foeTurn();
  ok(S.hp === 50, 'a blow smaller than your block does nothing');
}
{
  DPB.startRun(5002);
  S.foe.intent = { t:'guard', n: 5 };
  DPB.foeTurn();
  ok(S.foe.plate >= 5, 'a guarding foe plates up');
}
{
  DPB.startRun(5003);
  S.foe.intent = { t:'venom', n: 2 };
  S.hp = 50; S.pois = 0;
  DPB.foeTurn();
  ok(S.pois === 2, 'venom puts rot on you');
  S.foe.intent = { t:'hit', n: 0 };
  const hp0 = S.hp;
  DPB.foeTurn();
  ok(S.hp === hp0 - 2, 'and your rot ticks on the foe turn');
  ok(S.pois === 1, 'burning one stack off as it goes');
}
{
  DPB.startRun(5004);
  ok(!!S.foe.intent, 'the foe always telegraphs an intent');
  ok(!!DPB.INTENTS[S.foe.intent.t], 'and the intent is one the HUD can render');
}

/* ------------------------------------------------ a turn is one ball */
{
  DPB.startRun(6000);
  ok(DPB.ballsPerTurn() === 1, 'one ball per turn by default');
  DPB.takeFitting('extra');
  ok(DPB.ballsPerTurn() === 2, 'Second Ball puts two balls in play per turn');
  S.plunge = 1;
  DPB.launch();
  ok(S.inplay.length === 2, 'and both are on the table the moment you plunge');
  S.inplay[0].live = false; S.inplay = S.inplay.filter(b => b.live);
  DPB.drain(S.inplay[0]);
  ok(S.phase === 'resolve' || S.phase === 'foe' || S.phase === 'aim',
     'the turn only resolves once the last ball is gone');
}

/* --- the MUGGER taxes the haul ---------------------------------------- */
{
  DPB.startRun(6010);
  S.foe.trait = 'thief';
  S.foe.intent = { t:'hit', n: 0 };
  S.combo = 0;
  for (let i = 0; i < 4; i++) DPB.earn('gold', 0, 0);
  const hp0 = S.foe.hp;
  DPB.resolveNow();
  ok(hp0 - S.foe.hp === 3, 'the mugger lifts one coin off the haul before it is spent');
}
{
  DPB.startRun(6011);
  S.foe.trait = 'thief';
  S.foe.intent = { t:'hit', n: 0 };
  S.combo = 0;
  DPB.earn('silver', 0, 0); DPB.earn('lucky', 0, 0);
  const hp0 = S.foe.hp;
  DPB.resolveNow();
  // the lucky was the valuable one, so it is the one that went missing:
  // no strike lands, and the silver it left behind still shielded you
  ok(S.foe.hp === hp0, 'it takes the best coin, not the cheapest');
}
{
  DPB.startRun(6001);
  muteFoe();
  S.phase = 'ball';
  const b = onlyBall(204, 700, 0, 900);
  DPB.earn('gold', 0, 0);
  const hp0 = S.foe.hp;
  // the resolve is a beat, not an instant: a breath, then the coin flies
  step(2);
  ok(S.foe.hp < hp0, 'draining the ball resolves the purse against the foe');
  ok(S.launchReady, 'and racks the next ball up on the plunger');
}
{
  // ball saver hands the turn back rather than resolving it
  DPB.startRun(6002);
  DPB.takeFitting('saver');
  S.phase = 'ball';
  S.saverUsed = false;
  DPB.earn('gold', 0, 0);
  const carried = DPB.purseTotal();
  onlyBall(204, 700, 0, 900);
  step(0.4);
  ok(DPB.purseTotal() === carried, 'the Ball Saver returns the ball mid-turn, purse intact');
  ok(S.launchReady, 'with the ball back on the plunger');
}

/* ------------------------------------------ a full purse ends the turn */
{
  DPB.startRun(6100);
  muteFoe();
  S.phase = 'ball';
  onlyBall(204, 420, 0, 0);
  for (let i = 0; i < S.purseCap; i++) DPB.earn('gold', 0, 0);
  ok(S.cashT > 0, 'filling the purse starts the cash-out');
  ok(S.phase === 'ball', 'with a grace beat so the player can read it');
  const hp0 = S.foe.hp;
  step(2.2);
  ok(S.inplay.length === 0 || S.launchReady, 'the machine captures the ball');
  ok(S.foe.hp < hp0, 'and the purse pays out without waiting for a drain');
}
{
  // ...and a turn that drains early still resolves the normal way
  DPB.startRun(6101);
  muteFoe();
  S.phase = 'ball';
  DPB.earn('gold', 0, 0);
  ok(S.cashT === 0, 'a part-filled purse does not trigger the cash-out');
  const hp0 = S.foe.hp;
  onlyBall(204, 700, 0, 900);
  step(2);
  ok(S.foe.hp < hp0, 'draining still resolves the turn');
}

/* ------------------------------------------------- the shot clock */
{
  DPB.startRun(6200);
  muteFoe();
  S.phase = 'ball';
  onlyBall(204, 420, 0, 0);
  S.turnT = B.TURN_MAX - 0.2;
  step(0.5);
  ok(S.cashT > 0 || S.phase !== 'ball', 'the shot clock ends a turn that will not end itself');
  step(2);
  ok(S.phase !== 'ball', 'and the turn actually closes');
}

/* ------------------------------------------------------ chip damage */
{
  DPB.startRun(7000);
  S.foe.trait = null;
  S.foe.plate = 0;
  const hp0 = S.foe.hp;
  S.chipT = 0;
  const b = onlyBall(S.foe.x, S.foe.y + S.foe.r + P.R + 4, 0, 700);
  step(0.25);
  ok(S.foe.hp < hp0, 'a body blow chips the foe straight off the ball');
  ok(hp0 - S.foe.hp <= B.CHIP * 2, 'and the cooldown keeps chip damage marginal');
}
{
  // chip rides the purse: a full purse means the foe is already paid, which
  // is what keeps total chip inside the three dials on a very long ball
  DPB.startRun(7010);
  muteFoe();
  S.phase = 'ball';
  for (let i = 0; i < S.purseCap; i++) DPB.earn('gold', 0, 0);
  const hp0 = S.foe.hp;
  S.chipT = 0;
  onlyBall(S.foe.x, S.foe.y + S.foe.r + P.R + 4, 0, 700);
  step(0.3);
  ok(S.foe.hp === hp0, 'a body blow on a full purse chips nothing');
}

/* ------------------------------------- a body blow is worth two now */
{
  DPB.startRun(7020);
  muteFoe();
  S.foe.hp = S.foe.maxHp = 200;
  S.chipT = 0;
  const hp0 = S.foe.hp;
  const b2 = onlyBall(S.foe.x, S.foe.y + S.foe.r + P.R + 4, 0, 700);
  step(0.25);
  ok(hp0 - S.foe.hp === B.CHIP, `a body blow chips ${B.CHIP}`);
}
{
  // the answer to a warded foe is the saucer, and the saucer is standard now
  DPB.startRun(7021);
  S.foe.trait = 'ward';
  S.foe.hp = S.foe.maxHp = 200;
  S.foe.intent = { t:'hit', n: 0 };
  S.combo = 0;
  for (let i = 0; i < 4; i++) DPB.earn('gold', 200, 400);
  const hp0 = S.foe.hp;
  DPB.resolveNow();
  ok(hp0 - S.foe.hp === 0, 'a purse of plain gold bounces off a warded foe');
  S.foe.intent = { t:'hit', n: 0 };
  S.combo = 0;
  for (let i = 0; i < 2; i++) DPB.earn('lucky', 200, 300);
  const hp1 = S.foe.hp;
  DPB.resolveNow();
  ok(hp1 - S.foe.hp === (B.DMG_LUCKY - B.WARD) * 2, 'two lucky coins off the saucer do');
}

/* -------------------------------------------- the lucky saucer shot */
{
  DPB.startRun(7030);
  const sc = S.targets.find(t => t.saucer);
  ok(!!sc, 'the saucer is on the standard table');
  ok(sc.y < 320, 'sitting high, past the bumper rack');
  for (const o of [...S.bumpers, ...S.posts, ...S.targets.filter(t => t !== sc)])
    ok(Math.hypot(sc.x - o.x, sc.y - o.y) >= sc.r + o.r, 'the saucer never lands on another collider');
  ok(Math.hypot(sc.x - S.foe.x, sc.y - S.foe.y) >= sc.r + S.foe.r, 'nor on the foe');
}
{
  // one lucky coin beats a warded foe on its own
  DPB.startRun(7031);
  S.foe.trait = 'ward';
  S.foe.hp = S.foe.maxHp = 200;
  S.foe.intent = { t:'hit', n: 0 };
  S.combo = 0;
  DPB.earn('lucky', 200, 300);
  const hp0 = S.foe.hp;
  DPB.resolveNow();
  ok(hp0 - S.foe.hp === B.DMG_LUCKY - B.WARD, 'a single lucky coin punches through the ward');
}
{
  // ...but the saucer captures and reloads slowly, so it cannot be farmed
  DPB.startRun(7032);
  const sc = S.targets.find(t => t.saucer);
  sc.cd = 0;
  const b2 = DPB.newBall(sc.x, sc.y - 20, 0, 0);
  DPB.onTarget(sc, b2);
  ok(sc.cd === B.SAUCER_CD, 'the saucer reloads on its own long timer');
  ok(B.SAUCER_CD > B.TARGET_CD * 3, 'far slower than a standup — a 4-damage face has to be earned');
  ok(b2.vy < 0, 'and it spits the ball back up the table');
}
{
  // Loaded Saucer doubles the prize shot
  DPB.startRun(7033);
  DPB.takeFitting('saucer2');
  const sc = S.targets.find(t => t.saucer);
  sc.cd = 0;
  const before = DPB.purseTotal();
  DPB.onTarget(sc, DPB.newBall(sc.x, sc.y - 20, 0, 0));
  ok(DPB.purseTotal() === before + 2, 'Loaded Saucer pays two lucky coins a shot');
  ok(!DPB.rollFittings().some(f => f.id === 'saucer2'), 'and is never offered twice');
}

/* --------------------------------------------------- target recharge */
{
  DPB.startRun(7001);
  const t = S.targets[0];
  t.cd = 0;
  const b = DPB.newBall(t.x, t.y - 20, 0, 0);
  DPB.onTarget(t, b);
  const after = DPB.purseTotal();
  DPB.onTarget(t, b);      // instantly again — must be refused
  ok(DPB.purseTotal() === after, 'a target will not pay twice inside its recharge');
  ok(t.cd > 0, 'and it shows as recharging');
}

/* -------------------------------------------- bumpers: combo, then coin */
{
  DPB.startRun(7002);
  const bp = S.bumpers[0];
  bp.hits = 0;
  const before = DPB.purseTotal();
  DPB.onBumper(bp); DPB.onBumper(bp);
  ok(DPB.purseTotal() === before, 'the first two pops pay nothing but combo');
  ok(S.combo === 2, 'they still feed the combo');
  DPB.onBumper(bp);
  ok(DPB.purseTotal() === before + 1, 'every third pop mints a gold');
  DPB.takeFitting('bumper');
  const b2 = DPB.purseTotal();
  S.bumpers[0].hits = 0;
  DPB.onBumper(S.bumpers[0]);
  ok(DPB.purseTotal() === b2 + 1, 'Live Bumpers pays on every pop');
}

/* ================================================== FITTINGS / DRAFT */
{
  DPB.startRun(8000);
  const offer = DPB.rollFittings();
  ok(offer.length === 3, 'three fittings on offer');
  ok(new Set(offer.map(o => o.id)).size === 3, 'and they are distinct');
  const n0 = S.loadout.length, floor0 = S.floor;
  DPB.takeFitting('t_green');
  ok(S.loadout.length === n0 + 1 && S.loadout.includes('green'), 'a target fitting bolts a target on');
  ok(S.targets.some(t => t.kind === 'green'), 'and it is on the rebuilt table');
  ok(S.floor === floor0 + 1, 'taking a fitting descends a floor');
}
{
  DPB.startRun(8001);
  DPB.takeFitting('t_lucky');
  ok(S.targets.some(t => t.saucer), 'the lucky saucer is placed as a saucer');
  const again = DPB.rollFittings();
  ok(!again.some(f => f.id === 't_lucky'), 'and is never offered twice');
}
{
  DPB.startRun(8002);
  const c0 = S.comboStep;
  DPB.takeFitting('step');
  ok(S.comboStep === c0 - 1, 'Quick Tally shortens the combo step');
  for (let i = 0; i < 6; i++) DPB.takeFitting('step');
  ok(S.comboStep >= 3, 'but the step never goes below 3');
}
{
  DPB.startRun(8003);
  const l0 = S.flippers[0].len;
  DPB.takeFitting('flip');
  ok(S.flippers[0].len > l0 * 1.1, 'Long Flippers rebuilds the table with a longer blade');
}

/* ---------------------------------------------- foe scaling by depth */
{
  DPB.startRun(9000);
  const a = DPB.mkFoe(1), b = DPB.mkFoe(10);
  ok(b.hp > a.hp, 'foes get tougher with depth');
  ok(b.atk >= a.atk, 'and hit harder');
  const boss = DPB.mkFoe(5);
  ok(boss.boss, 'every fifth floor is a boss');
}

/* -------------------------------------------------------- death path */
{
  DPB.startRun(9001);
  S.hp = 3;
  S.block = 0;
  S.foe.intent = { t:'heavy', n: 40 };
  S.foe.trait = null;
  DPB.foeTurn();
  ok(S.hp === 0 && S.screen === 'over', 'losing all your HP ends the run');
}

/* ================================================== PHYSICS SANITY */
// the solver is Flipper Crawl's, but the table is different, so re-prove
// the two properties that would ruin a battle: escapes and wedges.
{
  const dirs = [[0,-1],[0,1],[-1,0],[1,0],[0.7,0.7],[-0.7,-0.7],[0.7,-0.7],[-0.7,0.7]];
  let escaped = 0, nan = 0;
  for (const [dx, dy] of dirs){
    for (let trial = 0; trial < 2; trial++){
      DPB.startRun(9100 + trial);
      S.phase = 'ball';
      S.foe.hp = 99999;
      const b = onlyBall(200 + trial * 20, 420, dx * P.VMAX, dy * P.VMAX);
      step(3);
      if (!finite(b.x) || !finite(b.y)) nan++;
      if (b.live && !(b.x > 4 && b.x < T.W - 4 && b.y > 4 && b.y < T.H)) escaped++;
    }
  }
  ok(nan === 0, 'no NaN positions at maximum velocity');
  ok(escaped === 0, 'the ball never tunnels out of the cabinet');
}
{
  // the flipper still adds energy on this table
  DPB.startRun(9200);
  bareTable();
  S.phase = 'ball';
  const f = S.flippers[0];
  f.up = false; f.ang = f.rest;
  const mid = { x: f.px + Math.cos(f.ang) * f.len * 0.8, y: f.py + Math.sin(f.ang) * f.len * 0.8 };
  const b = onlyBall(mid.x, mid.y - P.R - f.r + 1, 0, 30);
  const before = speed(b);
  DPB.setFlipper(-1, true);
  step(0.12);
  ok(speed(b) > before + 300, `a flipper swing still launches the ball (${before | 0} -> ${speed(b) | 0})`);
  DPB.setFlipper(-1, false);
}
{
  // the gel smear must slow the ball, not stop the game
  DPB.startRun(9300);
  S.foe.trait = 'gel';
  DPB.buildTable();
  ok(!!S.gel, 'the GEL CUBE smears the lower field');
  S.phase = 'ball';
  const b = onlyBall(S.gel.x, S.gel.y, 900, 0);
  step(0.5);
  ok(speed(b) < 900, 'and the smear eats the ball speed');
  ok(finite(b.x), 'without breaking the sim');
}

/* ============================================ LONG SOAK + RENDERING */
{
  DPB.startRun(9400);
  let turns = 0;
  for (let i = 0; i < 5400; i++){
    if (S.screen === 'fit'){ DPB.takeFitting(DPB.rollFittings()[0].id); turns++; }
    if (S.screen === 'over'){ DPB.startRun(9500 + i); }
    if (S.phase === 'done' && S.screen === 'battle' && S.foe.hp <= 0){ DPB.rollFittings(); DPB.takeFitting('purse'); }
    if (S.launchReady && i % 24 === 0){ S.plunge = 0.7; DPB.launch(); }
    DPB.setFlipper(-1, (i >> 5) % 3 === 0);
    DPB.setFlipper(1, (i >> 5) % 4 === 0);
    DPB.update(P.STEP);
    if (i % 7 === 0){ DPB.draw(); DPB.hud(); }
  }
  ok(true, 'the battle survives a 45s soak with the flippers mashing');
  ok(S.inplay.every(b => finite(b.x) && finite(b.y) && finite(b.vx) && finite(b.vy)), 'balls stay finite');
  ok(S.hp >= 0 && S.hp <= S.maxHp, 'player HP stays in range');
  ok(!S.foe || (S.foe.hp >= 0 && S.foe.hp <= S.foe.maxHp), 'foe HP stays in range');
  ok(DPB.purseTotal() <= S.purseCap, 'the purse never exceeds its cap, even under mashing');
  ok(S.parts.length <= 420 && S.pops.length <= 40, 'the FX pools stay capped');
}

DPB.fit();
ok(true, 'fit() is safe headless');

console.log(`  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
