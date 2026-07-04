// Headless suite for Horde Runner (crowd-runner / gate-math shooter).
// Evaluates the game's inline <script> with a stubbed DOM/canvas and drives
// the loop through window.HR: steering → gate math (add/sub/mul/div/power) →
// gate shooting → auto-fire kills → barrels → horde contact → boss fight →
// win/lose → save/load.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { harness } from './no_room_for_heroes_lib.mjs';

function loadGame(store) {
  const here = dirname(fileURLToPath(import.meta.url));
  const html = readFileSync(join(here, '..', 'horde_runner', 'index.html'), 'utf8');
  const code = html.match(/<script>([\s\S]*)<\/script>/)[1];

  const noop = () => {};
  const ctx = new Proxy({}, { get(_t, k) {
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
    if (k === 'measureText') return () => ({ width: 10 });
    return noop;
  } });
  const mkEl = () => new Proxy({
    style: {}, addEventListener: noop, getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 840 }),
    width: 480, height: 840,
  }, { get(t, k) { return (k in t) ? t[k] : noop; }, set(t, k, v) { t[k] = v; return true; } });

  global.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = '' + v; },
    removeItem: k => { delete store[k]; },
  };
  const audioNode = () => new Proxy(function () {}, {
    get: (_t, k) => (k === 'currentTime' ? 0 : audioNode()),
    apply: () => audioNode(),
  });
  global.AudioContext = function () { return audioNode(); };
  global.webkitAudioContext = global.AudioContext;
  global.requestAnimationFrame = noop;
  global.addEventListener = noop;
  global.devicePixelRatio = 1;
  global.innerWidth = 480; global.innerHeight = 840;
  Object.defineProperty(globalThis, 'navigator', { value: { vibrate: noop, userAgent: 'node' }, configurable: true, writable: true });
  global.document = { getElementById: () => mkEl(), addEventListener: noop, hidden: false };
  global.window = new Proxy(global, {
    get(t, k) { return (k in t) ? t[k] : undefined; },
    set(t, k, v) { t[k] = v; return true; },
  });
  global.__HR_HEADLESS__ = true;

  eval('(function(){' + code + '\n})()');
  return globalThis.HR;
}

const t = harness('horde_runner');
const store = { hr_muted: '1' };
const HR = loadGame(store);
const S = HR.S, C = HR.C;
const step = (secs) => { const n = Math.round(secs * 60); for (let i = 0; i < n; i++) HR.tick(1 / 60); };
const clearField = () => { S.mon.length = 0; S.barrels.length = 0; S.gates.length = 0; S.bul.length = 0; S.telegraphs.length = 0; };
const drawSafe = (label) => {
  try { HR.draw(); t.ok(true, label); } catch (e) { t.ok(false, label + ' threw: ' + e.stack); }
};

// ---- boot ----
t.ok(HR && typeof HR.tick === 'function', 'HR hooks exposed');
t.ok(S.phase === 'menu', 'boots to menu');
t.ok(S.level === 1, 'fresh save starts at level 1');
drawSafe('draw() on menu overlay');
t.ok(HR.difficulty(1) === 1, 'difficulty(1) is the baseline');
t.ok(HR.difficulty(3) > HR.difficulty(2), 'difficulty ramps with level');

// ---- start + level layout ----
HR.startLevel();
t.ok(S.phase === 'run', 'startLevel enters run phase');
t.ok(S.n === C.START_UNITS && S.pow === 1, 'starts with base army and power');
t.ok(S.gates.length >= 3, 'level has gate pairs');
t.ok(S.gates.every(g => g.L && g.R), 'every gate has a left and right half');
t.ok(S.mon.length >= 5, 'level has monster hordes');
t.ok(S.barrels.length >= 2, 'level has barrels');
drawSafe('draw() during run');

// every gate pair offers a positive choice; the first is all-good;
// the opening stretch is monster-free and brutes wait until mid-level
const seen = { runner: 0, spitter: 0, pools: 0, nastyGate: 0 };
const isNasty = s => (s.kind === 'p' && s.op === '-') || (s.kind === 'n' && s.op === '/' && s.v >= 3);
for (let lvl = 1; lvl <= 12; lvl++) {
  HR.buildLevel(lvl);
  t.ok(S.gates.every(g => HR.gateIsGood(g.L) || HR.gateIsGood(g.R)),
    'level ' + lvl + ': every gate pair has at least one good side');
  t.ok(HR.gateIsGood(S.gates[0].L) && HR.gateIsGood(S.gates[0].R),
    'level ' + lvl + ': first gate pair is all-good');
  const g0 = S.gates[0].z;
  t.ok(S.mon.every(m => m.z > g0), 'level ' + lvl + ': no monsters before the first gate');
  t.ok(S.mon.every(m => !m.brute || m.z > g0 + 900), 'level ' + lvl + ': no brutes in the early stretch');
  t.ok(S.mon.length >= 5, 'level ' + lvl + ': still has real hordes');
  // escalation ladder: nothing before its unlock level…
  if (lvl < 4) t.ok(S.mon.every(m => m.kind !== 'runner'), 'level ' + lvl + ': no runners yet');
  if (lvl < 5) t.ok(!S.gates.some(g => isNasty(g.L) || isNasty(g.R)), 'level ' + lvl + ': no nasty gates yet');
  if (lvl < 7) t.ok(S.pools.length === 0, 'level ' + lvl + ': no lava pools yet');
  if (lvl < 9) t.ok(S.mon.every(m => m.kind !== 'spitter'), 'level ' + lvl + ': no spitters yet');
  seen.runner += S.mon.filter(m => m.kind === 'runner').length;
  seen.spitter += S.mon.filter(m => m.kind === 'spitter').length;
  seen.pools += S.pools.length;
  seen.nastyGate += S.gates.filter(g => isNasty(g.L) || isNasty(g.R)).length;
}
// …and everything actually shows up once unlocked
t.ok(seen.runner > 0, 'runners appear in the late game');
t.ok(seen.spitter > 0, 'spitters appear in the late game');
t.ok(seen.pools > 0, 'lava pools appear in the late game');
t.ok(seen.nastyGate > 0, 'nastier gates appear in the late game');
HR.startLevel();

// deterministic layout per level
const gatesA = JSON.stringify(S.gates.map(g => [g.z | 0, HR.gateLabel(g.L), HR.gateLabel(g.R)]));
HR.buildLevel(1);
const gatesB = JSON.stringify(S.gates.map(g => [g.z | 0, HR.gateLabel(g.L), HR.gateLabel(g.R)]));
t.ok(gatesA === gatesB, 'level layout is deterministic per level');
HR.startLevel();

// ---- forward motion + steering ----
clearField();
const d0 = S.dist;
step(0.5);
t.ok(S.dist > d0 + 80, 'crowd runs forward');
S.cxTarget = -120;
step(0.8);
t.ok(S.cx < -80, 'steering pulls the crowd toward the target');
S.cxTarget = 0; step(0.8);

// ---- gate math (direct ops) ----
S.n = 10; S.pow = 1;
HR.applyOp({ kind: 'n', op: '+', v: 5 });
t.ok(S.n === 15, '+5 gate adds units');
HR.applyOp({ kind: 'n', op: 'x', v: 2 });
t.ok(S.n === 30, '×2 gate doubles the army');
HR.applyOp({ kind: 'n', op: '-', v: 8 });
t.ok(S.n === 22, '−8 gate removes units');
HR.applyOp({ kind: 'n', op: '/', v: 2 });
t.ok(S.n === 11, '÷2 gate halves (ceil)');
HR.applyOp({ kind: 'p', op: '+', v: 2 });
t.ok(S.pow === 3, 'PWR +2 gate raises attack power');
HR.applyOp({ kind: 'p', op: 'x', v: 2 });
t.ok(S.pow === 6, 'PWR ×2 gate multiplies attack power');
HR.applyOp({ kind: 'p', op: '-', v: 2 });
t.ok(S.pow === 4, 'PWR −2 gate drains attack power');
HR.applyOp({ kind: 'p', op: '-', v: 99 });
t.ok(S.pow === 1, 'power drain never drops below 1');
t.ok(!HR.gateIsGood({ kind: 'p', op: '-', v: 1 }), 'PWR − counts as a bad side');
t.ok(HR.gateIsGood({ kind: 'p', op: '+', v: 1 }), 'PWR + still counts as a good side');

// ---- gate crossing picks the side you steer to ----
clearField();
S.n = 10; S.cx = -100; S.cxTarget = -100;
S.gates.push({ z: S.dist + 40, L: { kind: 'n', op: '+', v: 10, hits: 0 }, R: { kind: 'n', op: '-', v: 5, hits: 0 }, applied: false });
step(0.3);
t.ok(S.gates[0].applied, 'gate applies when the crowd crosses it');
t.ok(S.n === 20, 'left side (+10) applied because the crowd steered left');
clearField();
S.n = 20; S.cx = 100; S.cxTarget = 100;
S.gates.push({ z: S.dist + 40, L: { kind: 'n', op: '+', v: 10, hits: 0 }, R: { kind: 'n', op: '-', v: 5, hits: 0 }, applied: false });
step(0.3);
t.ok(S.n === 15, 'right side (−5) applied because the crowd steered right');

// ---- shooting a gate improves it ----
clearField();
const g = { z: S.dist + 400, L: { kind: 'n', op: '+', v: 5, hits: 0 }, R: { kind: 'n', op: '-', v: 9, hits: 0 }, applied: false };
S.gates.push(g);
for (let i = 0; i < C.GATE_HITS; i++) S.bul.push({ x: -80, z: g.z - 12, dmg: 1, t: 1 });
HR.tick(1 / 60);
t.ok(g.L.hits === C.GATE_HITS && g.L.v === 6, 'shooting a + gate raises its value');
for (let i = 0; i < C.GATE_HITS; i++) S.bul.push({ x: 80, z: g.z - 12, dmg: 1, t: 1 });
HR.tick(1 / 60);
t.ok(g.R.v === 8, 'shooting a − gate softens the penalty');

// ---- auto-fire kills monsters ----
clearField();
S.n = 30; S.pow = 2; S.cx = 0; S.cxTarget = 0;
const killsBefore = S.kills;
S.mon.push({ z: S.dist + 250, x: 0, hp: 10, max: 10, r: 15, spd: 0, dmg: 2, brute: false, flash: 0, seed: 0 });
let guard = 0;
while (S.mon.length && guard++ < 60 * 5) HR.tick(1 / 60);
t.ok(S.mon.length === 0, 'auto-fire kills a monster in the lane');
t.ok(S.kills === killsBefore + 1, 'kill counted');
drawSafe('draw() with bullets and fx alive');

// ---- barrels grant power-ups ----
clearField();
S.barrels.push({ z: S.dist + 250, x: 0, hp: 2, max: 8, kind: 'rapid', broken: false, flash: 0 });
guard = 0;
while (!S.barrels[0].broken && guard++ < 60 * 5) HR.tick(1 / 60);
t.ok(S.barrels[0].broken, 'shooting a barrel breaks it');
t.ok(S.rapidT > 0, 'rapid-fire barrel starts the rapid timer');
const nBefore = S.n;
HR.grantBarrel({ z: S.dist + 100, x: 0, hp: 0, max: 8, kind: 'units', broken: false, flash: 0 });
t.ok(S.n === nBefore + 8, 'units barrel adds 8 to the army');
HR.grantBarrel({ z: S.dist + 100, x: 0, hp: 0, max: 8, kind: 'double', broken: false, flash: 0 });
t.ok(S.dblT > 0, 'double-damage barrel starts its timer');
clearField();
S.mon.push({ z: S.dist + 260, x: 20, hp: 100, max: 100, r: 15, spd: 0, dmg: 2, brute: false, flash: 0, seed: 0 });
HR.grantBarrel({ z: S.dist + 250, x: 0, hp: 0, max: 8, kind: 'bomb', broken: false, flash: 0 });
t.ok(S.mon[0].hp < 100, 'bomb barrel damages nearby monsters');

// ---- monster contact eats units ----
clearField();
S.rapidT = 0; S.dblT = 0;
S.n = 30; S.cx = 0; S.cxTarget = 0;
S.mon.push({ z: S.dist + 10, x: 0, hp: 999, max: 999, r: 15, spd: 0, dmg: 4, brute: false, flash: 0, seed: 0 });
HR.tick(1 / 60);
t.ok(S.mon[0] && S.mon[0].attacking, 'monster winds up a pounce on contact');
t.ok(S.n === 30, 'no damage during the windup');
step(0.3);
t.ok(S.n === 26, 'the pounce lands and removes its dmg in units');
t.ok(S.mon.length === 0, 'the monster dies on impact');

// ---- spitters lob telegraphed acid globs ----
clearField();
S.n = 50; S.cx = 0; S.cxTarget = 0;
S.mon.push({ z: S.dist + 300, x: 100, hp: 9999, max: 9999, r: 17, spd: 42, dmg: 2, brute: false, kind: 'spitter', spitT: 0.05, flash: 0, seed: 0 });
step(0.2);
t.ok(S.telegraphs.some(tg => tg.kind === 'spit'), 'spitter lobs a telegraphed glob');
drawSafe('draw() with an acid glob in flight');
const nBeforeSpit = S.n;
step(1.2);
t.ok(S.n < nBeforeSpit, 'standing in the acid splash costs units');

// ---- army wiped → lose ----
clearField();
S.n = 2;
S.mon.push({ z: S.dist + 10, x: 0, hp: 999, max: 999, r: 15, spd: 0, dmg: 4, brute: false, flash: 0, seed: 0 });
step(0.3);
t.ok(S.phase === 'lose', 'losing every unit ends the run');
drawSafe('draw() on lose overlay');
HR.tick(1 / 60); // tick in lose phase must be inert
t.ok(S.phase === 'lose', 'lose phase is stable');

// ---- boss fight → next wave, the run never ends ----
HR.startLevel();
clearField();
S.n = 500; S.pow = 3;
S.dist = S.levelLen - C.BOSS_DIST - 5;
step(0.2);
t.ok(S.phase === 'boss' && S.boss, 'reaching the end of the stretch spawns the boss');
t.ok(S.boss.hp === S.boss.max && S.boss.hp > 0, 'boss spawns at full hp');
drawSafe('draw() during boss fight');
S.boss.hp = S.boss.max = 99999; // keep it alive while we watch it fight back
step(2.5);
t.ok(S.telegraphs.length > 0 || S.n < 500 || S.mon.length > 0, 'boss fight is actually happening');
const lenBefore = S.levelLen;
S.boss.hp = 1; // let one volley finish it
guard = 0;
while (S.phase === 'boss' && guard++ < 60 * 8) HR.tick(1 / 60);
t.ok(S.phase === 'run', 'killing the boss continues the run — no level end');
t.ok(S.level === 2, 'wave counter advances');
t.ok(S.boss === null, 'boss cleared from the field');
t.ok(S.levelLen > lenBefore && S.segStart > 0, 'a fresh stretch of track was generated ahead');
t.ok(S.gates.some(g => !g.applied && g.z > S.dist), 'new gates wait down the lane');
t.ok(S.n > C.START_UNITS, 'the army carries over between waves');
t.ok(S.banner && S.banner.msg.length > 0, 'the next wave is announced');
t.ok(store.hr_best === '2', 'wave record saved to localStorage');
drawSafe('draw() right after the boss falls');
step(3);
t.ok(S.phase === 'run' && S.dist > S.segStart - C.BOSS_DIST, 'the march continues into the new stretch');

// ---- fresh run resets to wave 1 + record survives reload ----
HR.startLevel();
t.ok(S.phase === 'run' && S.n === C.START_UNITS && S.level === 1, 'a fresh run starts back at wave 1');
const HR2 = loadGame(store);
t.ok(HR2.S.best === 2, 'wave record survives a reload');
t.ok(HR2.S.level === 1, 'a reloaded game still starts runs at wave 1');

t.done();
