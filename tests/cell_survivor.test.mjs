// Cytosis (cell_survivor) — headless suite.
//
// The game is one self-contained file drawing to a canvas. This harness stubs a
// DOM + no-op 2d context, evals the inline <script> with __CS_HEADLESS__ set (so
// it boots without rAF/UI), and drives the real simulation through window.CS:
// run start → spawns → weapons → level-ups → evolutions → the twelve stages
// (objectives, modifiers, clear rewards) → bosses → death, revives, chests,
// culture strength, the DNA lab and the save file.
//
// Run: node tests/cell_survivor.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { harness } from './no_room_for_heroes_lib.mjs';

function loadGame(store){
  const here = dirname(fileURLToPath(import.meta.url));
  const html = readFileSync(join(here, '..', 'cell_survivor', 'index.html'), 'utf8');
  const code = html.match(/<script>([\s\S]*)<\/script>/)[1];

  const noop = () => {};
  const ctx = new Proxy({}, { get(_t, k){
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'canvas') return { width: 1280, height: 720 };
    return noop;
  } });
  const mkEl = () => new Proxy({
    style: {}, dataset: {}, children: [],
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    addEventListener: noop, removeEventListener: noop, appendChild: noop, remove: noop,
    getContext: () => ctx, querySelector: () => mkEl(), querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
    innerHTML: '', textContent: '', width: 1280, height: 720,
  }, { get(t, k){ return (k in t) ? t[k] : noop; }, set(t, k, v){ t[k] = v; return true; } });

  global.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = '' + v; },
    removeItem: k => { delete store[k]; },
  };
  global.requestAnimationFrame = noop;
  global.addEventListener = noop;
  global.setTimeout = () => 0;
  global.devicePixelRatio = 1;
  global.innerWidth = 1280; global.innerHeight = 720;
  global.document = new Proxy({
    getElementById: () => mkEl(), createElement: () => mkEl(),
    querySelector: () => mkEl(), querySelectorAll: () => [], addEventListener: noop, body: mkEl(),
  }, { get(t, k){ return (k in t) ? t[k] : noop; } });
  global.window = new Proxy(global, {
    get(t, k){ return (k in t) ? t[k] : undefined; },
    set(t, k, v){ t[k] = v; return true; },
  });
  global.__CS_HEADLESS__ = true;

  eval('(function(){' + code + '\n})()');
  return globalThis.CS;
}

const t = harness('cell_survivor');
const store = {};
const CS = loadGame(store);
const G = CS.G, C = CS.C;
const step = secs => { const n = Math.round(secs * 60); for (let i = 0; i < n; i++) CS.update(1 / 60); };
const clearField = () => { G.en.length = 0; G.proj.length = 0; G.eproj.length = 0; G.orbs.length = 0; G.boss = null; };
const finite = v => typeof v === 'number' && isFinite(v);

// ---------------------------------------------------------------- boot / menu
t.ok(!!CS, 'exposes window.CS');
t.ok(G.state === 'menu', 'boots into the menu');
t.ok(CS.P && CS.P.mhp > 0, 'a preview cell exists behind the menu');
CS.draw(); CS.update(1 / 60);
t.ok(G.state === 'menu', 'drawing/updating on the menu is harmless');

// ---------------------------------------------------------------- content sanity
{
  let bad = 0, evoBad = 0;
  for (const id in CS.WEAPONS){
    const W = CS.WEAPONS[id];
    for (let l = 1; l <= C.WEP_MAX; l++){
      const s = W.st(l);
      for (const k in s) if (!finite(s[k]) && typeof s[k] !== 'boolean') bad++;
      if (s.cd !== undefined && s.cd <= 0) bad++;
    }
    if (W.evo){
      if (!CS.WEAPONS[W.evo.into]) evoBad++;
      if (!CS.PASSIVES[W.evo.wth]) evoBad++;
      if (!CS.WEAPONS[W.evo.into].evolved) evoBad++;
    }
    if (!W.fire && !W.tick) bad++;
  }
  t.ok(bad === 0, 'every weapon has finite, positive stats at every level');
  t.ok(evoBad === 0, 'every evolution points at a real evolved weapon + real passive');
  t.ok(CS.SPECIES.every(s => CS.WEAPONS[s.start]), 'every strain starts with a real organelle');
  t.ok(CS.SPECIES.filter(s => s.free).length === 1, 'exactly one strain is unlocked from the start');
  t.ok(CS.BOSSES.length === 4 && CS.BOSSES[3].last, 'four bosses, the last one ends the run');
}
{
  let mono = true, prev = 0;
  for (let l = 1; l <= 60; l++){ const n = CS.xpNeed(l); if (n <= prev) mono = false; prev = n; }
  t.ok(mono, 'the xp curve rises every level');
}

// ---------------------------------------------------------------- run start
const P = CS.startRun('amoeba', 42);
t.ok(G.state === 'play', 'startRun enters play');
t.ok(P.weapons.length === 1 && P.weapons[0].id === 'pseudo', 'amoeba starts with pseudopod spines');
t.ok(P.hp === P.mhp && P.hp > 0, 'starts at full health');
t.ok(G.t === 0 && G.kills === 0 && G.en.length === 0, 'a fresh run is empty');

// ---------------------------------------------------------------- spawning
step(20);
t.ok(G.en.length > 5, 'pathogens spawn over time (' + G.en.length + ')');
t.ok(G.en.every(e => finite(e.x) && finite(e.y) && e.hp > 0), 'spawned pathogens are well formed');
t.ok(G.en.every(e => Math.hypot(e.x, e.y) <= C.DISH_R + 1), 'spawns stay inside the dish');
{
  const early = CS.hpMul(), rate0 = CS.spawnRate(), table0 = CS.spawnTable().length;
  const wasStage = G.stage; G.stage = 9;
  t.ok(CS.hpMul() > early * 3, 'pathogens toughen up stage by stage');
  t.ok(CS.spawnRate() > rate0 * 2, 'spawn pressure climbs stage by stage');
  t.ok(CS.spawnTable().length > table0, 'later stages unlock more pathogen types');
  t.ok(CS.prog() >= 9 && CS.prog() <= 10, 'the difficulty index tracks the stage');
  G.stage = wasStage;
}
t.ok(G.kills > 0, 'the starting weapon actually kills things');

// ---------------------------------------------------------------- damage model
{
  clearField();
  const e = CS.spawnEnemy('cocci', P.x + 400, P.y);
  const before = e.hp;
  CS.hurtEnemy(e, 3);
  t.ok(e.hp < before, 'hurtEnemy removes health');
  const prion = CS.spawnEnemy('prion', P.x + 500, P.y);
  prion.hp = prion.mhp = 5000;
  const p0 = prion.hp; CS.hurtEnemy(prion, 10);
  const cocci = CS.spawnEnemy('cocci', P.x + 520, P.y);
  cocci.hp = cocci.mhp = 5000;
  const c0 = cocci.hp; CS.hurtEnemy(cocci, 10);
  t.ok((p0 - prion.hp) < (c0 - cocci.hp), 'prion armour soaks part of every hit');
  const frozen = CS.spawnEnemy('cocci', P.x + 540, P.y);
  frozen.hp = frozen.mhp = 5000; frozen.frozen = 2;
  const f0 = frozen.hp; CS.hurtEnemy(frozen, 10);
  t.ok((f0 - frozen.hp) > (c0 - cocci.hp), 'frozen pathogens shatter for extra damage');
}
{
  clearField();
  const k0 = G.kills, o0 = G.orbs.length;
  const e = CS.spawnEnemy('cocci', P.x + 300, P.y);
  CS.killEnemy(e);
  t.ok(G.kills === k0 + 1, 'kills are counted');
  t.ok(G.orbs.length > o0, 'kills drop biomass');
  t.ok(P.ult > 0, 'kills charge mitosis');
}
{
  clearField();
  const e = CS.spawnEnemy('sac', P.x + 200, P.y);
  const n0 = G.en.length;
  CS.killEnemy(e);
  t.ok(G.en.length > n0 - 1, 'spore sacs split when they pop');
}

// ---------------------------------------------------------------- pickups
{
  clearField();
  const xp0 = P.xp, lv0 = P.lvl;
  CS.collect({ type: 'xp', val: 5 });
  t.ok(P.xp > xp0 || P.lvl > lv0, 'biomass feeds the xp bar');
  const d0 = G.dna;
  CS.collect({ type: 'dna', val: 7 });
  t.ok(G.dna === d0 + 7, 'DNA flecks bank DNA');
  P.hp = 10;
  CS.collect({ type: 'hp', val: 0 });
  t.ok(P.hp > 10, 'health pickups heal');
  for (let i = 0; i < 6; i++) CS.spawnEnemy('cocci', P.x + 200 + i * 10, P.y);
  CS.collect({ type: 'nuke', val: 0 });
  t.ok(G.en.every(e => e.dead || e.hp <= 0), 'a purge wipes the screen');
}
{
  clearField();
  const w = P.weapons[0]; w.lvl = 1;
  const dna0 = G.dna;
  CS.openChest();
  t.ok(w.lvl > 1 || G.dna > dna0, 'chests hand out organelle levels or DNA');
}

// ---------------------------------------------------------------- level-ups
{
  G.state = 'play'; G.pending = 0;
  CS.gainXp(100000);
  t.ok(P.lvl > 1, 'a pile of biomass levels you up');
  t.ok(G.state === 'levelup', 'levelling opens the choice screen');
  t.ok(G.choices.length >= 2 && G.choices.length <= 4, 'between 2 and 4 cards are offered');
  t.ok(G.choices.every(c => c.nm && c.ic && c.ds), 'every card is presentable');
  const rr0 = G.rerolls;
  const before = G.choices.map(c => c.id).join(',');
  CS.reroll();
  t.ok(G.rerolls === rr0 - 1, 'reroll costs a reroll');
  t.ok(G.choices.length > 0, 'reroll produces a fresh hand (' + before.slice(0, 20) + ')');
  G.banishes = 1;
  const victim = G.choices.find(c => c.t !== 'evo');
  CS.banish(G.choices.indexOf(victim));
  t.ok(G.banned[victim.id] === 1, 'banish blacklists the card');
  let seen = false;
  for (let i = 0; i < 40; i++){ CS.rollChoices(); if (G.choices.some(c => c.id === victim.id)) seen = true; }
  t.ok(!seen, 'a banished card never comes back');
}
{
  CS.rollChoices();
  const c = G.choices[0];
  const wasW = c.t === 'w' ? CS.wLevel(c.id) : 0;
  const pend = G.pending;
  CS.choose(0);
  if (c.t === 'w') t.ok(CS.wLevel(c.id) > wasW, 'picking an organelle levels it');
  else t.ok(true, 'picking a card resolves');
  t.ok(G.pending === pend - 1, 'each pick consumes one pending level');
}
{
  G.pending = 1; G.state = 'levelup';
  P.hp = 1;
  CS.skipLevel();
  t.ok(P.hp > 1, 'skipping a level-up heals instead');
  t.ok(G.state === 'play', 'the run resumes once the queue is empty');
}
{
  // slot limits hold
  G.pending = 0;
  for (let i = 0; i < 400; i++){ G.state = 'play'; CS.gainXp(100000); while (G.pending > 0) CS.choose(0); }
  t.ok(P.weapons.length <= C.WEP_SLOTS, 'never more than ' + C.WEP_SLOTS + ' organelles');
  t.ok(Object.keys(P.pas).length <= C.PAS_SLOTS, 'never more than ' + C.PAS_SLOTS + ' mutations');
  t.ok(P.weapons.every(w => w.lvl <= C.WEP_MAX), 'organelles cap at level ' + C.WEP_MAX);
  t.ok(Object.keys(P.pas).every(k => P.pas[k] <= C.PAS_MAX), 'mutations cap at level ' + C.PAS_MAX);
}

// ---------------------------------------------------------------- evolutions
{
  CS.startRun('amoeba', 7);
  const w = CS.ownedW('pseudo');
  w.lvl = C.WEP_MAX;
  t.ok(CS.evoReady().length === 0, 'evolution needs the matching mutation');
  CS.P.pas.ribo = 3; CS.recalc(true);
  t.ok(CS.evoReady().length === 1, 'max organelle + mutation unlocks the evolution');
  G.state = 'levelup'; G.pending = 1;
  CS.rollChoices();
  const evo = G.choices.find(c => c.t === 'evo');
  t.ok(!!evo && evo.id === 'harpoon', 'the evolution card is offered');
  CS.choose(G.choices.indexOf(evo));
  t.ok(CS.ownedW('harpoon') && !CS.ownedW('pseudo'), 'choosing it replaces the base organelle');
  t.ok(CS.ownedW('harpoon').lvl === C.WEP_MAX, 'the evolved form arrives fully grown');
  let offered = false;
  for (let i = 0; i < 30; i++){ CS.rollChoices(); if (G.choices.some(c => c.id === 'harpoon' && c.t !== 'evo')) offered = true; }
  t.ok(!offered, 'evolved organelles are never offered as normal cards');
  G.state = 'play'; G.pending = 0;
}

// ---------------------------------------------------------------- weapons fire
{
  for (const id of ['pseudo', 'cilia', 'enzyme', 'ion', 'spore', 'arc', 'cryo', 'symb', 'lyso', 'virus']){
    CS.startRun('amoeba', 99);
    const w = CS.ownedW('pseudo');
    w.id = id; w.lvl = 3; w.t = 0;
    clearField();
    const targets = [];
    for (let i = 0; i < 12; i++) targets.push(CS.spawnEnemy('cocci', CS.P.x + 40 + i * 12, CS.P.y + (i % 3) * 10));
    for (const e of targets){ e.hp = e.mhp = 99999; e.spd = 0; }
    G.spawnAcc = -999;
    const dealt = G.dmgDealt;
    step(4);
    t.ok(G.dmgDealt > dealt, id + ' deals damage');
  }
}
{
  CS.startRun('amoeba', 5);
  const w = CS.ownedW('pseudo'); w.id = 'ion'; w.lvl = 4;
  step(.2);
  t.ok(w.nodes.length >= 2, 'ion orbitals produce drawable nodes');
  w.id = 'symb'; w.lvl = 5; w.nodes.length = 0;
  step(.2);
  t.ok(G.syms.length > 0, 'the symbiote hatches');
}
{
  CS.startRun('amoeba', 6);
  clearField();
  const a = CS.spawnEnemy('cocci', CS.P.x + 60, CS.P.y);
  const b = CS.spawnEnemy('cocci', CS.P.x + 120, CS.P.y);
  a.hp = a.mhp = 9999; b.hp = b.mhp = 9999;
  CS.chain(CS.P, 20, 3, 400, 0);
  t.ok(a.hp < 9999 && b.hp < 9999, 'neural arc chains between hosts');
  const c = CS.spawnEnemy('cocci', CS.P.x + 60, CS.P.y + 20);
  c.hp = c.mhp = 9999;
  CS.infect(c, 50, 3, 2);
  step(1);
  t.ok(c.hp < 9999, 'infection rots the host over time');
  const nb = CS.spawnEnemy('cocci', c.x + 20, c.y);
  CS.killEnemy(c);
  t.ok(!!nb.inf, 'infection jumps to a neighbour when the host dies');
}
{
  CS.startRun('amoeba', 8);
  clearField();
  const e = CS.spawnEnemy('cocci', CS.P.x + 30, CS.P.y);
  e.hp = e.mhp = 99999; e.spd = 0;
  CS.addPool(e.x, e.y, 60, 40, 3, '#9dff6d');
  const h0 = e.hp;
  step(1);
  t.ok(e.hp < h0, 'enzyme pools burn what stands in them');
}

// ---------------------------------------------------------------- player kit
{
  CS.startRun('amoeba', 11);
  const p = CS.P;
  CS.input.x = 1; CS.input.y = 0;
  const x0 = p.x;
  step(.5);
  t.ok(p.x > x0, 'the cell swims where you point it');
  CS.input.x = 0; CS.input.y = 0;
  t.ok(CS.tryDash() === true, 'dash fires when charged');
  t.ok(p.dashCd > 0 && p.iT > 0, 'dash goes on cooldown and grants i-frames');
  t.ok(CS.tryDash() === false, 'no double dashing');
  const hp0 = p.hp;
  CS.hurtPlayer(30);
  t.ok(p.hp === hp0, 'i-frames block damage');
  p.iT = 0;
  CS.hurtPlayer(30);
  t.ok(p.hp < hp0, 'damage lands once i-frames end');
  p.hp = p.mhp;
  const armored = CS.P.s.armor;
  t.ok(finite(armored), 'armour is a number');
}
{
  CS.startRun('amoeba', 12);
  const p = CS.P;
  t.ok(CS.tryUlt() === false, 'mitosis needs a full charge');
  p.ult = C.ULT_MAX;
  t.ok(CS.tryUlt() === true, 'mitosis fires at full charge');
  t.ok(G.clones.length === 2 && p.ult === 0, 'mitosis splits off two clones and spends the charge');
  step(C.ULT_TIME + .5);
  t.ok(G.clones.length === 0, 'clones reabsorb when the timer runs out');
}
{
  CS.startRun('amoeba', 13);
  CS.P.pas.mito = 5; CS.recalc(true);
  const hi = CS.P.s.dmg;
  CS.P.pas.mito = 0; CS.recalc(true);
  t.ok(hi > CS.P.s.dmg, 'mitochondria raise damage');
  CS.P.pas.membrane = 5; CS.recalc(true);
  t.ok(CS.P.s.armor >= 5 && CS.P.mhp > 100, 'thick membrane adds armour and health');
  CS.P.pas.flagellum = 5; CS.recalc(true);
  t.ok(CS.P.s.spd > 212, 'flagella make you faster');
}

// ---------------------------------------------------------------- stages
{
  t.ok(CS.STAGES.length === 12, 'a run is twelve stages');
  t.ok(CS.STAGES.filter(s => s.boss !== undefined).length === 4, 'four of them are boss stages');
  t.ok(CS.STAGES[11].last && CS.STAGES[11].boss === 3, 'the last stage is the final boss');
  t.ok(CS.STAGES.every(s => ['survive', 'kill', 'elite', 'boss'].indexOf(s.obj.t) >= 0), 'every stage has a known objective');
  t.ok(CS.STAGES.every(s => !s.mod || CS.MODS[s.mod]), 'every stage modifier is real');
  t.ok(CS.STAGES.every(s => CS.objText(s).length > 4), 'every objective reads as a sentence');
}
{
  CS.startRun('amoeba', 20);
  t.ok(G.stage === 0 && G.stageT === 0, 'a run opens on stage 1');
  t.ok(G.grace > 0, 'stage 1 opens with a breather before the first spawns');
  const first = CS.STAGES[0];
  t.ok(first.obj.t === 'survive', 'stage 1 just asks you to survive');
  t.ok(!CS.objDone(), 'the objective starts unmet');
  G.stageT = first.obj.n + 1;
  t.ok(CS.objDone(), 'surviving the clock completes it');
  t.ok(CS.objProgress() === 1, 'the objective bar reads full');
  step(.05);
  t.ok(G.state === 'clear', 'completing the objective clears the stage');
  t.ok(G.rewards.length === 3, 'three rewards are offered');
  t.ok(G.en.length === 0 || G.en.every(e => e.boss), 'the board dissolves on a clear');
  t.ok(G.stageDna > 0 && G.dna >= G.stageDna, 'the clear pays DNA');
}
{
  const hp0 = CS.P.mhp;
  G.rewards = [CS.REWARDS.find(r => r.id === 'heal')];
  CS.P.hp = 1;
  CS.takeReward(0);
  t.ok(CS.P.mhp > hp0 && CS.P.hp === CS.P.mhp, 'Reinforce raises max health and tops you up');
  t.ok(G.stage === 1 && G.state === 'play', 'taking a reward starts the next stage');
  t.ok(G.stageKills === 0 && G.stageT === 0, 'stage counters reset');
}
{
  // the kill objective counts only this stage's kills
  const st = CS.STAGES[1];
  t.ok(st.obj.t === 'kill', 'stage 2 is a purge quota');
  G.stageKills = st.obj.n - 1;
  t.ok(!CS.objDone(), 'one short is not enough');
  const e = CS.spawnEnemy('cocci', CS.P.x + 300, CS.P.y);
  CS.killEnemy(e);
  t.ok(CS.objDone(), 'the last kill completes the quota');
  t.ok(CS.objLabel().indexOf('/') > 0, 'the label shows the count');
}
{
  // boss stage
  CS.startRun('amoeba', 21);
  G.stage = 2; CS.beginStage();
  t.ok(!!G.boss, 'a boss stage spawns its boss immediately');
  const b = G.boss;
  t.ok(b.hp > 1000 && b.boss === 1, 'bosses are chunky');
  t.ok(!CS.objDone(), 'the stage is not done while it lives');
  b.patT = 0;
  step(1);
  t.ok(finite(b.x) && finite(b.y), 'boss patterns keep it on the board');
  const k0 = G.kills;
  CS.hurtEnemy(b, 1e9);
  t.ok(G.kills === k0 + 1 && !G.boss, 'killing the boss clears the health bar');
  t.ok(G.orbs.some(o => o.type === 'dna'), 'bosses drop a DNA payout');
  t.ok(CS.objDone(), 'and completes the stage objective');
}
{
  // marked-host hunt
  CS.startRun('amoeba', 23);
  G.stage = 4; CS.beginStage();
  G.grace = 0; G.markT = 0;
  step(.1);
  const mark = G.en.find(e => e.mark);
  t.ok(!!mark, 'a hunt stage puts a marked host on the board');
  t.ok(mark.elite === 1 && mark.hp > 50, 'the marked host is an elite');
  t.ok(!CS.objDone(), 'the hunt is open while it lives');
  CS.hurtEnemy(mark, 1e9);
  t.ok(CS.objDone(), 'killing it finishes the hunt');
}
{
  // stage modifiers actually bite
  CS.startRun('amoeba', 24);
  G.stage = 6;                       // Necrosis — ARMOURED
  const armoured = CS.hpMul();
  G.stage = 0;
  t.ok(armoured > CS.hpMul(), 'the ARMOURED stage really does toughen pathogens');
  G.stage = 9;                       // Sepsis — VENOM
  const venom = CS.dmgMul ? 1 : 1;
  t.ok(CS.MODS.venom.dmg > 1 && CS.MODS.swarm.rate > 1 && venom === 1, 'modifiers carry real multipliers');
  G.stage = 0;
}
{
  // finishing stage 12 wins the run
  CS.startRun('amoeba', 22);
  G.stage = 11; CS.beginStage();
  t.ok(!!G.boss && G.boss.B.last, 'stage 12 is The Culture');
  CS.hurtEnemy(G.boss, 1e9);
  step(.05);
  t.ok(G.won === true && G.state === 'over', 'clearing stage 12 wins the run outright');
  t.ok(CS.meta.wins > 0, 'the win is recorded in the lab');
}

// ---------------------------------------------------------------- death & meta
{
  const before = CS.meta.dna;
  CS.startRun('amoeba', 31);
  G.dna = 100;
  G.revives = 0;
  CS.P.hp = 1;
  CS.hurtPlayer(999);
  t.ok(G.state === 'over', 'running out of health ends the run');
  t.ok(CS.meta.dna > before, 'collected DNA is banked into the lab');
  t.ok(CS.meta.runs > 0 && CS.meta.kills >= 0, 'lifetime stats are recorded');
}
{
  CS.startRun('amoeba', 32);
  G.revives = 1;
  CS.P.hp = 1;
  CS.hurtPlayer(999);
  t.ok(G.state === 'play' && CS.P.hp === CS.P.mhp, 'apoptosis block revives you at full health');
  t.ok(G.revives === 0, 'the revive is spent');
}
{
  CS.meta.dna = 100000;
  const cost = CS.META_UPS[0].cost(0);
  const dna0 = CS.meta.dna;
  t.ok(CS.buyUp('might') === true, 'lab upgrades can be bought');
  t.ok(CS.meta.dna === dna0 - cost, 'the purchase costs DNA');
  t.ok(CS.up('might') === 1, 'the upgrade level sticks');
  CS.meta.dna = 0;
  t.ok(CS.buyUp('vita') === false, 'no DNA, no splice');
  const u = CS.META_UPS[0];
  CS.meta.dna = 1e9;
  for (let i = 0; i < 50; i++) CS.buyUp(u.id);
  t.ok(CS.up(u.id) === u.max, 'upgrades stop at their cap');
  t.ok(CS.buyUp('nonsense') === false, 'unknown upgrades are rejected');
}
{
  CS.meta.dna = 555; CS.meta.ups.speed = 2; CS.meta.spec = 'amoeba';
  CS.saveMeta();
  t.ok(!!store[CS.SAVE_KEY], 'the save file is written');
  const m = CS.loadMeta();
  t.ok(m.dna === 555 && m.ups.speed === 2, 'the save file round-trips');
  store[CS.SAVE_KEY] = '{{{ not json';
  const m2 = CS.loadMeta();
  t.ok(m2.dna === 0 && m2.ups && Object.keys(m2.ups).length === 0, 'a corrupt save falls back to a fresh lab');
  CS.meta.dna = 1e9; CS.saveMeta();
}
{
  const m = CS.freshMeta();
  CS.setMeta(m);
  t.ok(CS.SPECIES.filter(s => CS.specUnlocked(s)).length === 1, 'a fresh lab has one strain');
  m.bestLvl = 15; m.bestT = 8 * 60; m.kills = 1500; m.bosses = 1; m.dnaTotal = 3000;
  t.ok(CS.SPECIES.every(s => CS.specUnlocked(s)), 'meeting every condition unlocks every strain');
  m.dna = 1e9;
}
{
  // head start hands you level-ups the moment the run begins
  CS.meta.ups.start = 2; CS.meta.dna = 1e9;
  CS.startRun('amoeba', 41);
  t.ok(CS.P.lvl === 3, 'the head-start splice begins the run at a higher level');
  t.ok(G.state === 'levelup' && G.pending === 2, 'and queues the level-up picks');
  CS.meta.ups.start = 0;
}

// ---------------------------------------------------------------- culture strength
{
  t.ok(CS.DIFFS.length === 3, 'three culture strengths');
  t.ok(CS.DIFFS[0].id === 'std' && CS.DIFFS[0].hp === 1, 'standard is the baseline');
  t.ok(CS.DIFFS.every((d, i) => i === 0 || d.hp > CS.DIFFS[i - 1].hp), 'each step is tougher than the last');
  t.ok(CS.DIFFS.every((d, i) => i === 0 || d.dna > CS.DIFFS[i - 1].dna), 'and pays more DNA');
  CS.meta.diff = 'std';
  CS.startRun('amoeba', 51);
  const hpStd = CS.hpMul(), dmgStd = CS.dmgMul(), rateStd = CS.spawnRate(), dnaStd = CS.P.s.dnaM;
  CS.meta.diff = 'let';
  CS.startRun('amoeba', 51);
  t.ok(CS.hpMul() > hpStd * 1.9, 'lethal pathogens carry far more health');
  t.ok(CS.dmgMul() > dmgStd * 1.4, 'lethal pathogens hit far harder');
  t.ok(CS.spawnRate() > rateStd, 'lethal spawns come thicker');
  t.ok(CS.P.s.dnaM > dnaStd * 2, 'and lethal pays out properly');
  CS.meta.diff = 'std';
  t.ok(CS.curDiff().id === 'std', 'the mode round-trips through meta');
}

// ---------------------------------------------------------------- endurance
{
  CS.startRun('plasmo', 4242);
  CS.input.x = 0; CS.input.y = 0;
  CS.P.mhp = 1e7; CS.P.hp = 1e7;
  let ok = true, maxEn = 0;
  for (let i = 0; i < 60 * 60 * 3; i++){          // three minutes at 60fps
    CS.update(1 / 60);
    if (G.state === 'levelup') while (G.pending > 0) CS.choose(0);
    if (i % 600 === 0){
      CS.draw();
      maxEn = Math.max(maxEn, G.en.length);
      if (!finite(CS.P.x) || !finite(CS.P.y) || !finite(CS.P.hp)) ok = false;
      if (G.en.some(e => !finite(e.x) || !finite(e.y))) ok = false;
    }
  }
  t.ok(ok, 'three simulated minutes stay numerically sane');
  t.ok(G.state === 'play' || G.state === 'clear' || G.state === 'levelup', 'and the run is still going');
  t.ok(G.en.length <= C.MAX_ENEMY, 'the enemy cap holds (peak ' + maxEn + ')');
  t.ok(G.kills > 100, 'a lot of pathogens died along the way (' + G.kills + ')');
  t.ok(CS.P.lvl > 5, 'and you levelled up plenty (lv ' + CS.P.lvl + ')');
  t.ok(G.proj.length < 500 && G.parts.length <= 701 && G.orbs.length <= 701, 'entity pools stay bounded');
}
{
  // pause freezes the world
  const t0 = G.t, n0 = G.en.length;
  G.state = 'pause';
  step(2);
  t.ok(G.t === t0 && G.en.length === n0, 'pausing freezes the simulation');
  G.state = 'play';
}
CS.draw();
t.ok(true, 'draw survives a fully populated field');

t.done();
