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
t.ok(S.res && S.res.mult >= 1 && S.res.gain === S.res.mult * S.count, 'finish gain = count × mult');
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

// -------- finish stairs: thresholds pick the right multiplier --------
S = SM.newRun(1);
S.count = 100; // STEPS: 90 -> step 4 -> ×5
S.z = S.lvl.finishZ; S.zPrev = S.z - 1;
for (const f of S.lvl.foes) f.alive = false;
SM.startFinish();
t.eq(S.res.mult, 5, '100 nails reach ×5');
t.eq(S.res.gain, 500, 'gain 100×5');
step(8);
t.eq(S.phase, 'win', 'stairs climb ends in win');
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

t.done();
