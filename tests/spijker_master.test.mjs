// Headless suite for Spijker Master (3D crowd-runner, Count Master style).
// The game's inline <script> is evaluated with a stubbed DOM and NO three.js,
// which flips its HEADLESS switch: all sim logic (gates, hazards, fights,
// finish stairs, save/load) runs and is driven through window.SM.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { harness } from './no_room_for_heroes_lib.mjs';

function loadGame(store) {
  const here = dirname(fileURLToPath(import.meta.url));
  const html = readFileSync(join(here, '..', 'spijker_master', 'index.html'), 'utf8');
  const code = html.match(/<script>\s*'use strict';([\s\S]*)<\/script>/)[1];

  const noop = () => {};
  const mkEl = () => new Proxy({
    style: {}, addEventListener: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 840 }),
  }, { get(t, k) { return (k in t) ? t[k] : noop; }, set(t, k, v) { t[k] = v; return true; } });

  global.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = '' + v; },
    removeItem: k => { delete store[k]; },
  };
  global.requestAnimationFrame = noop;
  global.addEventListener = noop;
  global.devicePixelRatio = 1;
  global.innerWidth = 480; global.innerHeight = 840;
  global.document = { getElementById: () => mkEl(), addEventListener: noop, hidden: false, body: mkEl() };
  global.window = new Proxy(global, {
    get(t, k) { return (k in t) ? t[k] : undefined; },
    set(t, k, v) { t[k] = v; return true; },
  });
  delete global.THREE;

  eval('(function(){' + code + '\n})()');
  return globalThis.SM;
}

const t = harness('spijker_master');
t.eq = (a, b, msg) => t.ok(a === b, msg + ' [' + a + ' != ' + b + ']');
const store = { sm_mute: '1' };
const SM = loadGame(store);
const C = SM.C;

const DT = 1 / 60;
const step = (secs) => { const n = Math.round(secs * 60); for (let i = 0; i < n; i++) SM.tick(DT); };

// -------- pure helpers --------
t.eq(SM.applyOp(10, { t: 'mul', v: 3 }), 30, 'mul op');
t.eq(SM.applyOp(10, { t: 'add', v: 7 }), 17, 'add op');
t.eq(SM.applyOp(10, { t: 'sub', v: 4 }), 6, 'sub op');
t.eq(SM.applyOp(10, { t: 'div', v: 4 }), 2, 'div op floors');
t.eq(SM.applyOp(1, { t: 'div', v: 9 }), 1, 'div never zeroes');

// -------- level generation: deterministic, well-formed, scaling --------
const L1a = SM.genLevel(1), L1b = SM.genLevel(1), L5 = SM.genLevel(5);
t.eq(JSON.stringify(L1a), JSON.stringify(L1b), 'genLevel deterministic');
t.ok(L5.len > L1a.len, 'levels get longer');
t.ok(L1a.gates.length >= 2 && L1a.gates.length % 2 === 0, 'gates come in pairs');
for (let i = 0; i < L1a.gates.length; i += 2) {
  const a = L1a.gates[i], b = L1a.gates[i + 1];
  t.eq(a.z, b.z, 'pair shares z @' + i);
  t.eq(a.side + b.side, 0, 'pair opposite sides @' + i);
  const goods = [a, b].filter(g => g.op.t === 'mul' || g.op.t === 'add');
  t.eq(goods.length, 1, 'exactly one good gate per pair @' + i);
}
const boss = L1a.foes[L1a.foes.length - 1];
t.ok(boss.boss && boss.count >= 4, 'boss crowd at the end');
t.ok(L1a.finishZ > boss.z, 'finish plank behind the boss');
for (const f of L1a.foes) t.ok(f.count > 0 && f.z < L1a.finishZ, 'foe sane');

// formation offsets stay on the bench
for (const i of [0, 10, 100, 500]) {
  const o = SM.fOff(i);
  t.ok(Math.abs(o[0]) < 4.6 && Math.abs(o[1]) < 4.6, 'formation compact @' + i);
}

// -------- gate math via applyGate --------
let S = SM.newRun(1);
t.eq(S.count, C.START, 'run starts with START nails');
t.eq(S.phase, 'run', 'phase run');
SM.applyGate({ z: 10, side: -1, op: { t: 'mul', v: 3 }, used: false });
t.eq(S.count, C.START * 3, 'mul gate multiplies');
SM.applyGate({ z: 11, side: 1, op: { t: 'sub', v: S.count }, used: false });
t.eq(S.phase, 'lose', 'sub to zero loses');

// -------- milestones celebrate crossing thresholds --------
S = SM.newRun(1);
S.count = 20;
S.events.length = 0;
SM.applyGate({ z: 5, side: -1, op: { t: 'mul', v: 3 }, used: false });
const mile = S.events.find(e => e.t === 'milestone');
t.ok(mile && mile.v === 50, 'milestone fires at highest crossed threshold (20→60 = 50)');
S.events.length = 0;
SM.applyGate({ z: 6, side: -1, op: { t: 'add', v: 5 }, used: false });
t.ok(!S.events.find(e => e.t === 'milestone'), 'no milestone without a crossing');

// -------- steering clamps --------
S = SM.newRun(1);
SM.setTX(99);
t.eq(S.tx, C.XMAX, 'tx clamped right');
SM.setTX(-99);
t.eq(S.tx, -C.XMAX, 'tx clamped left');

// -------- full playthrough of level 1 with a greedy pilot --------
function pilot() {
  // steer toward the good gate of the next unused pair; dodge hazards a bit
  const g = S.lvl.gates.filter(o => !o.used && o.z > S.z)
    .sort((a, b) => a.z - b.z)
    .find(o => o.op.t === 'mul' || o.op.t === 'add');
  let tx = g ? g.side * 2.2 : 0;
  for (const h of S.lvl.hazards) {
    if (h.z > S.z - 5 && h.z < S.z + 10) { // keep dodging until the tail is past
      if (h.k === 'spikes') tx = h.x > 0 ? -3.4 : 3.4;
      if (h.k === 'saw') tx = Math.sin(S.time * h.sp + h.ph) > 0 ? -3.4 : 3.4;
    }
  }
  S.tx = tx; S.x = tx; // teleport steering: keeps the run deterministic
}
function playLevel(maxSecs) {
  let el = 0;
  while ((S.phase === 'run' || S.phase === 'fight' || S.phase === 'finish') && el < maxSecs) {
    if (S.phase === 'run') pilot();
    SM.tick(DT); el += DT;
  }
  return S.phase;
}
S = SM.newRun(1);
let sawFight = false, gained = false;
{
  let el = 0;
  while ((S.phase === 'run' || S.phase === 'fight' || S.phase === 'finish') && el < 120) {
    if (S.phase === 'fight') sawFight = true;
    if (S.count > C.START) gained = true;
    if (S.phase === 'run') pilot();
    SM.tick(DT); el += DT;
  }
}
t.eq(S.phase, 'win', 'greedy pilot beats level 1');
t.ok(sawFight, 'fought at least the boss crowd');
t.ok(gained, 'good gates grew the crowd');
t.ok(S.res && S.res.mult >= 1 && S.res.gain === S.res.mult * S.res.start, 'finish gain = start count × mult');
t.eq(S.count, 0, 'every nail was hammered into the plank');
t.eq(S.planted, S.res.start, 'planted count matches the crowd that arrived');
t.ok(S.coins >= S.res.gain, 'coins banked');
t.eq(store.sm_lv, '2', 'next level persisted');
t.eq(store.sm_coins, '' + S.coins, 'coins persisted');
t.ok(S.lvl.foes.every(f => !f.alive), 'all foes cleared on the way');

// events stream is bounded
t.ok(S.events.length <= 300, 'event queue bounded');

// -------- fight resolution: bigger crowd survives with ~difference --------
S = SM.newRun(2);
S.count = 50;
const foe = S.lvl.foes[0];
foe.count = 20;
S.z = foe.z - 3; S.zPrev = S.z;
SM.tick(DT);
t.eq(S.phase, 'fight', 'contact triggers fight');
for (let i = 0; i < 600 && S.phase === 'fight'; i++) SM.tick(DT);
t.eq(S.phase, 'run', 'won the brawl');
t.ok(!foe.alive, 'foe crowd wiped');
t.ok(S.count >= 25 && S.count <= 35, 'survivors ≈ difference, got ' + S.count);

// losing fight: outnumbered crowd dies
S = SM.newRun(2);
S.count = 5;
const foe2 = S.lvl.foes[0];
foe2.count = 60;
S.z = foe2.z - 3; S.zPrev = S.z;
SM.tick(DT);
step(5);
t.eq(S.phase, 'lose', 'outnumbered crowd loses');

// -------- finish stairs: per-level thresholds, perfect run tops out --------
S = SM.newRun(1);
const TH = S.lvl.steps;
t.ok(Array.isArray(TH) && TH.length === 10 && TH[0] === 0, 'level carries 10 stair thresholds');
{
  let incOk = true;
  for (let i = 1; i < 10; i++) if (TH[i] <= TH[i - 1]) incOk = false;
  t.ok(incOk, 'thresholds strictly increase');
}
S.count = TH[9]; // the crowd a perfect run brings home
S.z = S.lvl.finishZ; S.zPrev = S.z - 1;
for (const f of S.lvl.foes) f.alive = false;
SM.startFinish();
t.eq(S.res.mult, 10, 'perfect crowd tops the stairs at ×10');
t.eq(S.res.gain, TH[9] * 10, 'gain = count × 10');
const expectPlant = TH[9];
let plantEvOk = true, planted = 0;
{
  let el = 0;
  while (S.phase === 'finish' && el < 12) {
    SM.tick(DT); el += DT;
    for (const ev of S.events) {
      if (ev.t === 'plant') {
        planted += ev.n;
        if (ev.step < 0 || ev.step > S.res.step) plantEvOk = false;
      }
    }
    S.events.length = 0;
  }
}
t.eq(S.phase, 'win', 'stairs climb ends in win');
t.eq(planted, expectPlant, 'plant events cover every nail');
t.ok(plantEvOk, 'plant events land on valid steps');
t.eq(S.count, 0, 'crowd fully converted to planted nails');

// mid-tier crowd lands on a middle step
S = SM.newRun(1);
S.count = S.lvl.steps[4];
S.z = S.lvl.finishZ; S.zPrev = S.z - 1;
for (const f of S.lvl.foes) f.alive = false;
SM.startFinish();
t.eq(S.res.mult, 5, 'mid crowd lands ×5');
t.ok(SM.yAt(S.lvl.finishZ + 0.1) > 0, 'stairs have height');
t.eq(SM.yAt(0), 0, 'flat bench before plank');

// -------- hazards kill --------
S = SM.newRun(3);
const spikes = { k: 'spikes', z: S.z + 2, x: 0, w: 7.4 };
S.lvl.hazards.push(spikes);
S.lvl.gates.length = 0; S.lvl.foes.length = 0;
const before = S.count;
S.count = 40;
step(1);
t.ok(S.count < 40, 'spike strip kills crossers (' + S.count + ' left)');

// -------- save / load meta --------
const store2 = { sm_lv: '7', sm_coins: '123', sm_mute: '0' };
const SM2 = loadGame(store2);
const m = SM2.loadMeta();
t.eq(m.lv, 7, 'level restored');
t.eq(m.coins, 123, 'coins restored');
t.eq(m.mute, false, 'mute restored');

// -------- difficulty scaling: later levels field bigger bosses --------
const b1 = SM.genLevel(1).foes.pop().count;
const b8 = SM.genLevel(8).foes.pop().count;
t.ok(b8 > b1, 'boss scales with level (' + b1 + ' -> ' + b8 + ')');

// -------- content sweep: golden/mystery gates, pendulum, picks well-formed --------
{
  let sawGold = false, sawMyst = false, sawPend = false;
  for (let lv = 1; lv <= 24; lv++) {
    const L = SM.genLevel(lv);
    const byZ = {};
    for (const g of L.gates) (byZ[g.z] = byZ[g.z] || []).push(g);
    let golds = 0, mysts = 0;
    for (const z in byZ) {
      const pair = byZ[z];
      t.ok(pair.length === 2 && pair[0].side + pair[1].side === 0, 'pair sane lv' + lv);
      if (pair[0].gold) {
        golds++; sawGold = true;
        t.ok(pair.every(g => g.gold && (g.op.t === 'mul' || g.op.t === 'add')), 'golden pair both good lv' + lv);
        t.ok(lv >= 4, 'golden only from L4');
      } else {
        const m = pair.filter(g => g.myst);
        mysts += m.length;
        if (m.length) { sawMyst = true; t.ok(lv >= 6, 'mystery only from L6'); }
        const goods = pair.filter(g => !g.myst && (g.op.t === 'mul' || g.op.t === 'add'));
        t.ok(goods.length === 1, 'exactly one guaranteed-good gate lv' + lv);
        for (const mg of m) t.ok(['add', 'mul', 'sub', 'div'].includes(mg.op.t), 'mystery outcome shape');
      }
    }
    t.ok(golds <= 1, '≤1 golden pair lv' + lv);
    t.ok(mysts <= 2, '≤2 mystery gates lv' + lv);
    for (const h of L.hazards) {
      if (h.k === 'pend') { sawPend = true; t.ok(lv >= 7, 'pendulum only from L7'); }
    }
    const wantPicks = lv >= 5 ? [1, 2] : lv >= 2 ? [1, 1] : [0, 0];
    t.ok(L.picks.length >= wantPicks[0] && L.picks.length <= wantPicks[1], 'pick count lv' + lv);
    for (const p of L.picks) t.ok(p.z >= 60 && p.z < L.finishZ && Math.abs(p.x) <= 2.8, 'pick placement lv' + lv);
  }
  t.ok(sawGold && sawMyst && sawPend, 'sweep hit golden+mystery+pendulum (' + sawGold + ',' + sawMyst + ',' + sawPend + ')');
}

// -------- golden nail pickup: hit collects, miss does not --------
S = SM.newRun(3);
{
  const p = S.lvl.picks[0];
  const coins0 = S.coins;
  S.z = p.z - 2; S.zPrev = S.z; S.x = p.x; S.tx = p.x;
  S.lvl.gates.length = 0; S.lvl.hazards.length = 0; S.lvl.foes.length = 0;
  step(0.5);
  t.ok(p.taken, 'pick collected on crossing');
  t.eq(S.coins, coins0 + 25 + 5 * 3, 'pick pays 25+5*lv');
  t.eq(SM.loadMeta().coins, S.coins, 'pick coins persisted immediately');
}
S = SM.newRun(3);
{
  const p = S.lvl.picks[0];
  S.z = p.z - 2; S.zPrev = S.z;
  S.x = p.x + (p.x > 0 ? -1.5 : 1.5); S.tx = S.x; // 1.5 off: outside the 1.2 radius
  S.lvl.gates.length = 0; S.lvl.hazards.length = 0; S.lvl.foes.length = 0;
  const coins0 = S.coins;
  step(0.5);
  t.ok(!p.taken && S.coins === coins0, 'near miss leaves the golden nail');
}

// -------- pendulum: bites a centered crowd, deterministic --------
S = SM.newRun(7);
{
  S.lvl.gates.length = 0; S.lvl.foes.length = 0;
  S.lvl.hazards.length = 0;
  // phase chosen so the blade is low and centered as the crowd crosses z=20
  S.lvl.hazards.push({ k: 'pend', z: 20, w: 2.8, ph: Math.PI - 1.4 });
  S.count = 60; S.x = 0; S.tx = 0; S.z = 14; S.zPrev = 14;
  step(1.2);
  t.ok(S.count < 60, 'pendulum takes a bite (' + S.count + ' left)');
}

// -------- flanking (from L8): swing wide to win an outnumbered brawl --------
function brawl(lv, count, foeCount, offset) {
  S = SM.newRun(lv);
  const f = S.lvl.foes[0];
  f.count = foeCount; f.x = 0;
  S.count = count;
  S.z = f.z - 3; S.zPrev = S.z;
  S.x = offset; S.tx = offset;
  SM.tick(DT);
  for (let i = 0; i < 2000 && S.phase === 'fight'; i++) { S.x = offset; S.tx = offset; SM.tick(DT); }
  return S.phase;
}
t.eq(brawl(8, 100, 120, 2.0), 'run', 'L8: flanked 100v120 wins');
t.eq(brawl(8, 100, 120, 0), 'lose', 'L8: head-on 100v120 loses');
t.eq(brawl(3, 100, 120, 2.0), 'lose', 'L3: flanking not unlocked yet');

// -------- upgrades: crowd start, steel tips, golden grip --------
{
  const st2 = { sm_mute: '1', sm_u_crowd: '3' };
  const SM3 = loadGame(st2);
  t.eq(SM3.startCount(), 11, 'NAIL PACK: 5 + 2*3 start');
  t.eq(SM3.newRun(1).count, 11, 'run starts with upgraded crowd');
  t.eq(SM3.S.lvl.steps.length, 10, 'stairs still calibrate');
}
{
  const st3 = { sm_mute: '1', sm_coins: '1000' };
  const SM4 = loadGame(st3);
  t.ok(SM4.buyUpg('crowd'), 'buyUpg spends coins');
  t.eq(st3.sm_u_crowd, '1', 'upgrade level persisted');
  t.eq(st3.sm_coins, '900', 'cost deducted');
  t.ok(!SM4.buyUpg('grip') || +st3.sm_coins >= 0, 'never negative coins');
  const st4 = { sm_mute: '1', sm_coins: '50' };
  const SM5 = loadGame(st4);
  t.ok(!SM5.buyUpg('crowd'), 'cannot afford = no purchase');
  t.eq(st4.sm_coins, '50', 'coins untouched on failed buy');
}
{
  const st5 = { sm_mute: '1', sm_u_tips: '6' };
  const SM6 = loadGame(st5);
  const S6 = SM6.newRun(2);
  const f = S6.lvl.foes[0];
  f.count = 60; S6.count = 60;
  S6.z = f.z - 3; S6.zPrev = S6.z;
  SM6.tick(DT);
  for (let i = 0; i < 2000 && S6.phase === 'fight'; i++) SM6.tick(DT);
  t.eq(S6.phase, 'run', 'STEEL TIPS max wins an even 60v60 brawl');
}
{
  const st6 = { sm_mute: '1', sm_u_grip: '5' };
  const SM7 = loadGame(st6);
  const S7 = SM7.newRun(1);
  S7.count = 40;
  S7.z = S7.lvl.finishZ; S7.zPrev = S7.z - 1;
  for (const f of S7.lvl.foes) f.alive = false;
  SM7.startFinish();
  t.eq(S7.res.gain, Math.round(40 * S7.res.mult * 1.5), 'GOLDEN GRIP: +50% plank coins');
}

// -------- revive: second wind once per level --------
S = SM.newRun(2);
S.count = 30;
SM.applyGate({ z: 1, side: -1, op: { t: 'add', v: 20 }, used: false }); // peak 50
SM.killN(50, 0, S.z, 'p');
t.eq(S.phase, 'lose', 'wiped out');
t.ok(SM.revive(), 'revive accepted');
t.eq(S.phase, 'run', 'back in the fight');
t.eq(S.count, 25, 'half the peak crowd returns');
t.ok(S.revived, 'revive marked used');
SM.killN(25, 0, S.z, 'p');
t.eq(S.phase, 'lose', 'down again');
t.ok(!SM.revive(), 'only one second wind per level');
{
  const zBefore = S.z;
  S = SM.newRun(2);
  t.ok(!S.revived, 'revive resets each run');
}

// -------- revive clears the killer fight --------
S = SM.newRun(2);
{
  const f = S.lvl.foes[0];
  f.count = 500;
  S.count = 20;
  S.z = f.z - 3; S.zPrev = S.z;
  SM.tick(DT);
  for (let i = 0; i < 2000 && S.phase === 'fight'; i++) SM.tick(DT);
  t.eq(S.phase, 'lose', 'crushed by the mob');
  SM.revive();
  t.ok(!f.alive && S.fight === null, 'killer mob cleared on revive');
}

// -------- daily gift & streak (dates injected, no clock in sim) --------
{
  const st7 = { sm_mute: '1' };
  const SM8 = loadGame(st7);
  let d = SM8.dailyState('2026-07-05');
  t.ok(d.claimable && d.streak === 1 && d.reward === 100, 'day 1 gift');
  SM8.claimDaily('2026-07-05');
  t.eq(st7.sm_coins, '100', 'gift banked');
  t.ok(!SM8.dailyState('2026-07-05').claimable, 'no double dip same day');
  d = SM8.dailyState('2026-07-06');
  t.ok(d.claimable && d.streak === 2 && d.reward === 150, 'day 2 streak grows');
  SM8.claimDaily('2026-07-06');
  d = SM8.dailyState('2026-07-08'); // skipped the 7th
  t.ok(d.claimable && d.streak === 1 && d.reset, 'missed day resets streak');
  const st8 = { sm_mute: '1', sm_day: '2026-07-01', sm_streak: '9' };
  const SM9 = loadGame(st8);
  t.eq(SM9.dailyState('2026-07-02').reward, 1000, 'day 7+ caps at 1000');
}

// -------- skins: buy, own, select --------
{
  const st9 = { sm_mute: '1', sm_coins: '800' };
  const SM10 = loadGame(st9);
  t.ok(!SM10.buySkin(2), 'cannot afford Gold Standard');
  t.ok(SM10.buySkin(1), 'Copper Crew bought');
  t.eq(st9.sm_coins, '50', 'skin price deducted');
  t.ok(SM10.ownedSkins().includes(1) && SM10.curSkin() === 1, 'owned + selected');
  t.ok(SM10.buySkin(0), 'default skin reselects free');
  t.eq(st9.sm_coins, '50', 'no double charge');
  t.ok(SM10.buySkin(1) && st9.sm_coins === '50', 'owned skin reselects free');
}

// -------- lifetime stats --------
{
  const st10 = { sm_mute: '1' };
  const SM11 = loadGame(st10);
  const S11 = SM11.newRun(1);
  t.eq(st10.sm_s_runs, '1', 'run counted');
  S11.count = 40;
  S11.z = S11.lvl.finishZ; S11.zPrev = S11.z - 1;
  for (const f of S11.lvl.foes) f.alive = false;
  SM11.startFinish();
  for (let i = 0; i < 1200 && S11.phase === 'finish'; i++) SM11.tick(DT);
  t.eq(st10.sm_s_wins, '1', 'win counted');
  t.eq(st10.sm_s_planted, '40', 'planted nails counted');
  t.ok(+st10.sm_s_peak >= 40, 'peak crowd recorded');
}

// -------- title event fires at run start --------
S = SM.newRun(1);
t.ok(S.events.some(e => e.t === 'title' && e.lv === 1), 'title card event on new run');

t.done();
