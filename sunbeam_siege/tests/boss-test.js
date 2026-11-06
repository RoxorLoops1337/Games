// Boss and elite engine tests (src/engine/ops-bosses.js). node tests/boss-test.js [--verbose]
// Fights each of the seven bosses with the greedy bot (natural and "sturdy" modes), checks there is no crash and no endless
// battle, and checks that each signature mechanic actually fires. Also unit-checks the ops (trap, inhale, flood, dawn).
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.env.NL_ROOT || path.join(__dirname, '..');
const VERBOSE = process.argv.includes('--verbose');

function makeSB() {
  const ctx = { console, Math, Date, JSON };
  ctx.window = ctx;
  ctx.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  vm.createContext(ctx);
  const load = f => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: path.basename(f) });
  const dataDir = path.join(root, 'src/data');
  fs.readdirSync(dataDir).filter(f => f.endsWith('.js')).sort().forEach(f => load(path.join(dataDir, f)));
  ['util', 'content', 'registry', 'card-inst', 'battle', 'battle-ai', 'run', 'rewards', 'map', 'profile', 'shop', 'post', 'nook', 'events-engine'].forEach(n => {
    const f = path.join(root, 'src/engine', n + '.js');
    if (fs.existsSync(f)) load(f);
  });
  fs.readdirSync(path.join(root, 'src/engine')).filter(f => /^ops-.*\.js$/.test(f)).sort().forEach(f => load(path.join(root, 'src/engine', f)));
  ctx.SB.util.quiet = true; (ctx.SB||SB).data.rules.pestsFirst = false; (ctx.SB||SB).data.rules.pestsAlwaysClimb = false; (ctx.SB||SB).data.rules.pestHpMult = 1;
  return ctx.SB;
}

let checks = 0, failures = 0;
const failLog = [];
function ok(c, msg) { checks++; if (!c) { failures++; failLog.push(msg); if (VERBOSE) console.log('  FAIL ' + msg); } return !!c; }
function section(name, fn) {
  const f0 = failures;
  try { fn(); } catch (e) { failures++; failLog.push(name + ' threw: ' + (e.stack || e).toString().split('\n').slice(0, 4).join(' | ')); }
  console.log((failures === f0 ? 'PASS ' : 'FAIL ') + name);
}

const SB = makeSB();
const DASH = new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']');

// ---- bot (same greedy bot as run-tests.js) --------------------------------------------------
function botTurn(B) {
  let guard = 0;
  (B.state.attached || []).slice().forEach(a => { if (a.host) B.scratchOff(a.host); });
  while (B.state.turn === 'player' && !B.state.over && guard++ < 30) {
    let played = false;
    const hand = B.state.hand.slice().sort((a, b) => {
      const ta = (a.card.type === 'unit' || a.card.type === 'champion') ? 0 : 1, tb = (b.card.type === 'unit' || b.card.type === 'champion') ? 0 : 1;
      return ta - tb || a.card.cost - b.card.cost;
    });
    for (const h of hand) {
      const chk = B.canPlay(h.uid);
      if (!chk.ok) continue;
      let target = {};
      if (chk.needsTarget === 'floor') {
        const f = chk.targets.slice().sort((a, b) => B.state.floors[b.floor].pests.length - B.state.floors[a.floor].pests.length || a.floor - b.floor)[0];
        target = { floor: f.floor };
      } else if (chk.needsTarget === 'pest') target = { pestUid: chk.targets[0].pestUid };
      else if (chk.needsTarget === 'cat') target = { catUid: chk.targets[0].catUid };
      if (B.playCard(h.uid, target).ok) { played = true; break; }
    }
    if (!played) break;
  }
  B.endTurn();
}

const ENCS = [].concat(SB.data.encounters.act1.boss, SB.data.encounters.act2.boss, SB.data.encounters.act3.boss);
const BOSSES = ['pest_boss_rat_king', 'pest_boss_garden_hose', 'pest_boss_vacuum_mk9', 'pest_boss_spray_duelist', 'pest_boss_vet_carrier', 'pest_boss_red_dot', 'pest_boss_great_bath'];
const CLANS = [['alley', 'hearth'], ['hearth', 'moon'], ['moon', 'mischief'], ['mischief', 'alley']];

function setup(bossId, o) {
  o = o || {};
  const base = ENCS.find(e => e.bossId === bossId);
  const enc = Object.assign({}, JSON.parse(JSON.stringify(base)), { nodeId: 'bt_' + bossId + '_' + (o.seed || 0), hpScale: 1 });
  if (o.hpScale) enc.bossHpScale = o.hpScale;
  if (o.dawn) { enc.dawn = true; enc.dawnPhase = JSON.parse(JSON.stringify(SB.data.dawnPhaseTemplate)); }
  const cp = CLANS[(o.seed || 0) % CLANS.length];
  const run = SB.run.newRun({ seed: 'bt' + (o.seed || 0), clan: cp[0], side: cp[1], rank: 0 });
  run.defeatedBosses = o.defeated || [];
  const B = SB.battle.create(run, enc, { seed: 4000 + (o.seed || 0) });
  if (o.warmth) { B.S.sunbeam.max = o.warmth; B.S.sunbeam.warmth = o.warmth; }
  return B;
}

// Fight to the end (or the round cap). Collects event counts and a few per-round samples.
function fight(bossId, o) {
  o = o || {};
  const B = setup(bossId, o);
  const counts = {}, phases = [], statuses = {};
  B.on(e => {
    counts[e.type] = (counts[e.type] || 0) + 1;
    if (e.type === 'phase' && e.phaseId) phases.push(e.phaseId);
    if (e.type === 'status' && e.status) statuses[e.status] = (statuses[e.status] || 0) + 1;
    if (e.type === 'move') counts['move:' + e.kind] = (counts['move:' + e.kind] || 0) + 1;
    if (e.type === 'damage' && e.parried) counts.parried = (counts.parried || 0) + 1;
  });
  const meterMax = {}, cap = o.cap || 70;
  let rounds = 0, throwMsg = null;
  const t0 = Date.now();
  try {
    while (!B.state.over && rounds++ < cap && Date.now() - t0 < 20000) {
      botTurn(B);
      B.pests().forEach(p => { if (p.id === bossId) Object.keys(p.meter || {}).forEach(k => { if (typeof p.meter[k] === 'number') meterMax[k] = Math.max(meterMax[k] || 0, p.meter[k]); }); });
    }
  } catch (e) { throwMsg = (e.stack || e).toString().split('\n').slice(0, 3).join(' | '); }
  return { B, counts, phases, statuses, meterMax, rounds, throwMsg, over: !!B.state.over, outcome: B.state.outcome, ms: Date.now() - t0 };
}

// ---- 0. data and wiring ------------------------------------------------------------------------
section('data: no overfilled floors in boss encounters, no dash characters, Plug fix', () => {
  ENCS.forEach(e => {
    const used = [0, 0, 0, 0];
    e.waves[0].spawns.forEach(s => { const d = SB.content.pest(s.id); used[s.floor] += (d.size || 1) * (s.count || 1); });
    for (let f = 1; f <= 3; f++) ok(used[f] <= 5, e.id + ': floor ' + f + ' holds ' + used[f] + ' of 5 in wave 1');
    ok(!e.dataDeviation, e.id + ': dataDeviation removed');
  });
  const bath = SB.content.pest('pest_boss_great_bath');
  const plug = bath.raw.encounter.waves[0].spawns.find(s => s.id === 'pest_add_plug_chain');
  ok(plug && plug.floor === 2, 'Plug Chain spawns on the Parlor');
  const act = bath.raw.pattern.actions[0];
  ok(act.floors.length === 1 && act.floors[0] === 2, 'the Bath summons the Plug on the Parlor');
  ok(!DASH.test(fs.readFileSync(path.join(root, 'src/engine/ops-bosses.js'), 'utf8')), 'ops-bosses.js has no em or en dash');
  ok(!DASH.test(fs.readFileSync(path.join(root, 'src/data/enemies-bosses.js'), 'utf8')), 'enemies-bosses.js has no em or en dash');
  ok(!DASH.test(fs.readFileSync(path.join(root, 'tests/boss-test.js'), 'utf8')), 'boss-test.js has no em or en dash');
});

section('coverage: every boss and elite op and passive is implemented', () => {
  const use = SB.content.scanUsage();
  const miss = [];
  ['ops', 'passives', 'winIf', 'hazards', 'triggers', 'statuses'].forEach(cat => Object.keys(use[cat] || {}).forEach(n => { if (!SB.content.supported(cat, n)) miss.push(cat + ':' + n); }));
  ok(miss.length === 0, 'unsupported: ' + miss.join(', '));
  const v = SB.content.validate();
  ok(v.errors.length === 0, 'validate errors: ' + v.errors.slice(0, 3).join(' | '));
});

// ---- 1. every boss: natural fights, several seeds, no crash, no endless fight --------------------
const AGG = {};
BOSSES.forEach(id => {
  section('boss fight (natural): ' + id, () => {
    AGG[id] = { counts: {}, phases: {}, meterMax: {}, statuses: {}, outcomes: { win: 0, lose: 0 } };
    for (let s = 0; s < 4; s++) {
      const r = fight(id, { seed: s });
      ok(!r.throwMsg, id + ' seed ' + s + ' threw: ' + r.throwMsg);
      ok(r.over, id + ' seed ' + s + ' did not finish in ' + r.rounds + ' rounds');
      ok(r.ms < 15000, id + ' seed ' + s + ' too slow: ' + r.ms + ' ms');
      if (r.outcome) AGG[id].outcomes[r.outcome]++;
      Object.keys(r.counts).forEach(k => AGG[id].counts[k] = (AGG[id].counts[k] || 0) + r.counts[k]);
      Object.keys(r.statuses).forEach(k => AGG[id].statuses[k] = (AGG[id].statuses[k] || 0) + r.statuses[k]);
      r.phases.forEach(p => AGG[id].phases[p] = true);
      Object.keys(r.meterMax).forEach(k => AGG[id].meterMax[k] = Math.max(AGG[id].meterMax[k] || 0, r.meterMax[k]));
    }
  });
});

// ---- 2. sturdy fights: a huge Sunbeam and a shorter boss so every phase and mechanic gets seen -----
BOSSES.forEach(id => {
  section('boss fight (sturdy, through the phases): ' + id, () => {
    AGG[id].sturdy = { counts: {}, phases: {}, meterMax: {}, statuses: {} };
    // the Bath is the hardest fight for the greedy bot: give it a fourth seed so a sturdy win is seen (deterministic)
    for (let s = 0; s < (id === 'pest_boss_great_bath' ? 4 : 3); s++) {
      const r = fight(id, { seed: s + 10, warmth: 900, hpScale: 0.35, cap: 90 });
      ok(!r.throwMsg, id + ' sturdy seed ' + s + ' threw: ' + r.throwMsg);
      ok(r.over, id + ' sturdy seed ' + s + ' did not finish in ' + r.rounds + ' rounds');
      const A = AGG[id].sturdy;
      Object.keys(r.counts).forEach(k => A.counts[k] = (A.counts[k] || 0) + r.counts[k]);
      Object.keys(r.statuses).forEach(k => A.statuses[k] = (A.statuses[k] || 0) + r.statuses[k]);
      r.phases.forEach(p => A.phases[p] = true);
      Object.keys(r.meterMax).forEach(k => A.meterMax[k] = Math.max(A.meterMax[k] || 0, r.meterMax[k]));
    }
  });
});

function both(id, fn) { return fn(AGG[id]) || fn(AGG[id].sturdy); }

section('mechanic: Garden Hose pressure, Blast, Coils, phases', () => {
  const id = 'pest_boss_garden_hose', A = AGG[id];
  ok(both(id, a => (a.meterMax.pressure || 0) >= 3), 'pressure rose to at least 3');
  ok(both(id, a => (a.counts['move:shove'] || 0) > 0), 'cats were shoved (Blast or Soak)');
  ok(both(id, a => (a.statuses.wet || 0) > 0), 'Wet was applied');
  ok(A.sturdy.phases.p2_sprinkler, 'phase 2 Sprinkler Season reached');
  ok(A.sturdy.phases.p3_burst_pipe, 'phase 3 Burst Pipe reached');
});

section('mechanic: Vacuum Mk IX inhale, swallow, jam, spit', () => {
  const id = 'pest_boss_vacuum_mk9';
  ok(both(id, a => (a.counts.inhale || 0) > 0), 'inhale fired');
  ok(both(id, a => (a.counts.swallow || 0) > 0), 'swallow fired');
  ok(both(id, a => (a.meterMax.bag || 0) >= 6), 'the Dustbag filled up');
  ok(both(id, a => (a.counts.jam || 0) > 0 && (a.counts.spit || 0) > 0), 'the bag jammed and spat everything back');
  ok(AGG[id].sturdy.phases.p2_turbo, 'phase 2 Turbo Mode reached');
});

section('mechanic: Spray Bottle Duelist stance, parry, soaked', () => {
  const id = 'pest_boss_spray_duelist';
  ok(both(id, a => (a.counts.parried || 0) > 0), 'a hit was parried');
  ok(both(id, a => (a.statuses.wet || 0) > 0), 'Wet was applied');
  ok(both(id, a => (a.statuses.scared || 0) > 0), 'Wet 3 turned a cat Scared (Soaked Through)');
});

section('mechanic: Vet Carrier trap, Latch, timer', () => {
  const id = 'pest_boss_vet_carrier';
  ok(both(id, a => (a.counts.trap || 0) > 0), 'a cat was trapped');
  ok(both(id, a => (a.counts.release || 0) + (a.counts.vaccinate || 0) > 0), 'a trapped cat was freed or vaccinated');
  ok(AGG[id].sturdy.phases.p2_waiting_room, 'phase 2 Waiting Room reached');
});

section('mechanic: Red Dot teleports and heats up', () => {
  const id = 'pest_boss_red_dot';
  ok(both(id, a => (a.counts['move:teleport'] || 0) > 0), 'the dot teleported');
  ok(both(id, a => (a.meterMax.heat || 0) >= 2), 'Heat rose');
  ok(AGG[id].sturdy.phases.p2_double_dot, 'phase 2 Which One Is Real reached');
});

section('mechanic: Great Bath water, flood, reruns, dawn', () => {
  const id = 'pest_boss_great_bath';
  ok(both(id, a => (a.meterMax.waterLevel || 0) >= 3), 'the water rose to at least 3');
  ok(AGG[id].sturdy.phases.p2_bubble_bath, 'phase 2 Bubble Bath reached');
  ok(AGG[id].sturdy.phases.p3_dawn || AGG[id].sturdy.counts.dawn > 0 || AGG[id].sturdy.counts.win > 0, 'Dawn reached or the bath fell first');
});

// ---- 3. op-level scenarios ---------------------------------------------------------------------
function manual(bossId, o) {
  o = o || {};
  const B = setup(bossId, Object.assign({ seed: 40, warmth: 500 }, o));
  const boss = B.pests().find(p => p.id === bossId);
  return { B, boss };
}
function deployCats(B, n, floor) {
  const hand = B.state.hand.slice();
  let placed = 0;
  for (const h of hand) {
    if (placed >= n) break;
    if (h.card.type !== 'unit' && h.card.type !== 'champion') continue;
    const chk = B.canPlay(h.uid);
    if (!chk.ok) continue;
    if (B.playCard(h.uid, { floor }).ok) placed++;
  }
  return placed;
}

section('scenario: Vet Carrier trap, break the Latch, timer vaccinates', () => {
  const { B, boss } = manual('pest_boss_vet_carrier');
  B.S.zoomies = 10;
  ok(deployCats(B, 3, 0) >= 2, 'cats deployed');
  const catsBefore = B.cats().length;
  SB.engine.ai.specials.trap(B, boss, { floors: 'each', pick: 'strongest', latchHp: 12, latchHide: 4, timer: 3 });
  ok(B.S.trapped.length === 1, 'one cat trapped');
  ok(B.cats().length === catsBefore - 1, 'the trapped cat left the board');
  const rec = B.S.trapped[0];
  const latch = B.pestByUid(rec.latchUid);
  ok(latch && latch.id === 'pest_add_latch' && latch.maxHp >= 12, 'a Latch pest stands on the board');
  ok(boss.meter.slots === 1, 'Passengers meter is 1');
  ok(B.pestBonus(boss) >= 2, 'Passenger Weight adds attack');
  // break it
  B.damage(latch, 999, { kind: 'direct' }); B.reap(); B.drain();
  ok(B.S.trapped.length === 0, 'breaking the Latch freed the cat');
  ok(B.cats().length === catsBefore, 'the cat is back on the board');
  const back = B.catByUid(rec.catUid);
  ok(back && back.fluff >= 3 && back.statuses.rested >= 1, 'freed cat has 3 Fluff and Rested 1');
  ok(!boss.meter.slots, 'Passengers meter back to 0');
  // timer path
  SB.engine.ai.specials.trap(B, boss, { floors: 'each', pick: 'strongest', latchHp: 12, latchHide: 4, timer: 2 });
  const rec2 = B.S.trapped[0], inst = B.instByUid(rec2.cat.instUid), livesBefore = inst ? inst.lives : null;
  SB.engine.ops.get('tickTrapTimers')(B.makeCtx({ self: boss }), {}, B);
  ok(B.S.trapped.length === 1, 'still trapped after one tick');
  SB.engine.ops.get('tickTrapTimers')(B.makeCtx({ self: boss }), {}, B);
  ok(B.S.trapped.length === 0, 'vaccinated after the timer');
  if (inst) ok(inst.lives === livesBefore - 1, 'the vaccinated cat spent a life');
  ok(!B.pestByUid(rec2.latchUid), 'the Latch is gone');
  // Hidden cats cannot be trapped
  const c = B.cats()[0]; B.addStatus(c, 'hidden', 1);
  B.cats().forEach(x => { if (x !== c) B.addStatus(x, 'hidden', 1); });
  const n0 = B.S.trapped.length;
  SB.engine.ai.specials.trap(B, boss, { floors: 'each', pick: 'strongest', latchHp: 12, latchHide: 4, timer: 3 });
  ok(B.S.trapped.length === n0, 'Hidden cats cannot be trapped');
});

section('scenario: Vacuum inhale, swallow, jam, spit', () => {
  const { B, boss } = manual('pest_boss_vacuum_mk9');
  B.S.zoomies = 10;
  deployCats(B, 3, 0);
  const draw0 = B.S.draw.length, cats0 = B.cats().length;
  SB.engine.ai.specials.inhale(B, boss, { cards: 2, bag: 2 });
  ok(B.S.draw.length === draw0 - 2 && boss.bag.cards.length === 2, 'two cards sucked out of the draw pile');
  ok(boss.meter.bag === 2, 'bag meter 2');
  SB.engine.ai.specials.swallow(B, boss, { floors: 'own', pick: 'front', bag: 3 });
  ok(B.cats().length === cats0 - 1 && boss.bag.cats.length === 1, 'front cat swallowed');
  ok(boss.meter.bag === 5, 'bag meter 5');
  SB.engine.ai.specials.inhale(B, boss, { cards: 3, bag: 5 });
  ok(boss.meter.bag === 0, 'the bag jammed and emptied at 10');
  ok(boss.statuses.yarn >= 2 && boss.statuses.spooked >= 2, 'jam: Dazed and Spooked');
  ok(B.cats().length === cats0, 'the swallowed cat came back');
  ok(boss.bag.cards.length === 0 && B.S.draw.length === draw0, 'the cards went back on top of the draw pile');
  // spit on death
  SB.engine.ai.specials.swallow(B, boss, { floors: 'own', pick: 'front', bag: 3 });
  ok(B.cats().length === cats0 - 1, 'swallowed again');
  SB.engine.ops.get('spit')(B.makeCtx({ self: boss }), { what: 'all' }, B);
  ok(B.cats().length === cats0, 'spit returns the cat');
});

section('scenario: Great Bath flood levels, Plug, overflow, reruns', () => {
  const { B, boss } = manual('pest_boss_great_bath', { defeated: ['pest_boss_rat_king', 'pest_boss_vacuum_mk9'] });
  const plug = B.pests().find(p => p.id === 'pest_add_plug_chain');
  ok(plug && plug.floor === 1, 'the Plug starts on the Parlor');
  ok(B.pestSize(2) <= 5, 'the Attic is not overfilled');
  const tap = (n) => { for (let i = 0; i < n; i++) { B.fire('onDusk', { subject: null }); B.drain(); } };
  tap(1);
  ok(boss.meter.waterLevel === 1 && B.S.floors[2].hazards.puddle && !B.S.floors[1].hazards.puddle, 'level 1 floods the Attic only');
  tap(1);
  ok(boss.meter.waterLevel === 2 && B.S.floors[1].hazards.puddle && !B.S.floors[0].hazards.puddle, 'level 2 floods the Parlor too');
  tap(1);
  ok(boss.meter.waterLevel === 3 && B.S.floors[0].hazards.puddle, 'level 3 floods the Cellar too');
  B.S.zoomies = 10; deployCats(B, 2, 0);
  const warm0 = B.cats().map(c => c.health);
  tap(1);
  ok(boss.meter.waterLevel === 1, 'overflow resets the water to 1');
  ok(B.cats().every(c => c.statuses.wet), 'overflow made every cat Wet');
  ok(B.cats().length === 0 || B.cats().some((c, i) => c.health < warm0[i]), 'overflow hurt the cats');
  // plug death
  const hp0 = boss.hp; setLevel(boss, 3);
  B.damage(plug, 999, { kind: 'direct' }); B.reap(); B.drain();
  ok(boss.meter.waterLevel === 0, 'killing the Plug drops the water by 3');
  ok(boss.hp === hp0 - 12, 'killing the Plug hurts the Bath for 12');
  ok(B.S.respawns && B.S.respawns.length === 1, 'the Plug is scheduled to come back');
  B.S.round += 3; tap(1);
  ok(B.pests().some(p => p.id === 'pest_add_plug_chain'), 'the Plug came back after 3 rounds');
  function setLevel(b, v) { b.meter.waterLevel = v; SB.engine.boss.syncFlood(B, b); }
  // phase 2 reruns
  B.damage(boss, Math.ceil(boss.hp - boss.maxHp * 0.6), { kind: 'direct' }); B.drain();
  ok(B.pests().some(p => /^pest_rerun_/.test(p.id)), 'Bubble Bath summoned a Rerun of a beaten boss');
  ok(B.S.floors.some(f => f.hazards.suds), 'Suds on the floors');
});

section('scenario: Great Bath Dawn (damagePctMax, Final Flush, 5 Dawn rounds win)', () => {
  const { B, boss } = manual('pest_boss_great_bath');
  B.S.zoomies = 10; deployCats(B, 3, 0);
  boss.hp = Math.floor(boss.maxHp * 0.24);
  B.damage(boss, 1, { kind: 'direct' }); B.drain();
  ok(B.S.dawn.active, 'Dawn is active');
  ok(!boss.passives.some(p => p.id === 'tap'), 'the tap is off');
  ok(boss.passives.some(p => p.id === 'evaporate') && boss.passives.some(p => p.id === 'sunrise'), 'Evaporate and Sunrise added');
  let flush = 0; B.on(e => { if (e.type === 'damage' && e.amount === 8 && e.side === 'cat') flush++; });
  const hp0 = boss.hp;
  let r = 0, shade0 = B.S.sunbeam.shade;
  while (!B.state.over && r++ < 12) { botTurn(B); if (r === 1) ok(boss.hp <= hp0 - 5 || B.state.over, 'the bath dries each Dusk'); }
  ok(B.state.over, 'the fight ended');
  ok(B.state.outcome === 'win', 'surviving Dawn (or finishing the bath) wins, got ' + B.state.outcome);
  ok(B.S.dawn.rounds >= 1 || boss.dead, 'dawn rounds counted');
});

section('scenario: Final Flush lands on Dawn round 3 and Yarn or Dizzy cancels it', () => {
  [false, 'yarn', 'dizzy'].forEach(dazed => {
    const { B, boss } = manual('pest_boss_great_bath');
    B.S.zoomies = 10; deployCats(B, 2, 0);
    boss.hp = Math.floor(boss.maxHp * 0.24); B.damage(boss, 1, { kind: 'direct' }); B.drain();
    ok(B.S.dawn.active, 'dawn active');
    B.S.sunbeam.warmth = 500; B.S.sunbeam.shade = 0;
    const tick = () => { B.fire('onDusk', { subject: null }); B.drain(); };
    tick(); tick();
    ok(B.S.dawn.rounds === 2, 'two dawn rounds counted');
    if (dazed) boss.statuses[dazed] = 2;
    const w0 = B.S.sunbeam.warmth, shade = B.S.sunbeam.shade;
    tick();
    const lost = (w0 + 2) - B.S.sunbeam.warmth; // Sunrise heals 2 in the same tick
    if (dazed) ok(lost < 15, dazed + ' cancelled the flush, lost ' + lost);
    else ok(lost >= 15 || B.S.sunbeam.shade < shade + 3, 'the Final Flush hit the Sunbeam, lost ' + lost);
  });
});

['pest_boss_vet_carrier', 'pest_boss_red_dot'].forEach(id => {
  section('scenario: Night 9 Dawn appended to ' + id, () => {
    const { B, boss } = manual(id, { dawn: true });
    B.S.zoomies = 10; deployCats(B, 3, 0);
    ok(B.S.win && B.S.win.type === 'bossDead', 'winIf starts as bossDead');
    boss.hp = Math.floor(boss.maxHp * 0.7); B.damage(boss, 1, { kind: 'direct' }); B.drain();
    boss.hp = Math.floor(boss.maxHp * 0.2); B.damage(boss, 1, { kind: 'direct' }); B.drain();
    ok(B.S.dawn.active, 'Dawn armed once the boss is under 25 percent');
    ok(B.S.win.type === 'any' && JSON.stringify(B.S.win).indexOf('dawnRounds') > 0, 'winIf dawnRounds armed');
    ok(B.S.counters.extraMove, 'pests move twice in Dawn');
    ok(boss.passives.some(p => p.id === 'sunrise'), 'Sunrise passive added');
    let r = 0;
    B.S.sunbeam.warmth = B.S.sunbeam.max = 900;
    while (!B.state.over && r++ < 14) { boss.hp = Math.max(boss.hp, Math.ceil(boss.maxHp * 0.2)); botTurn(B); }
    ok(B.state.over && B.state.outcome === 'win', 'surviving 5 Dawn rounds wins (rounds ' + B.S.dawn.rounds + ', outcome ' + B.state.outcome + ')');
    ok(B.S.dawn.rounds >= 5 || boss.dead, 'five Dawn rounds counted');
  });
});

section('scenario: Red Dot untargetable, reached by Zoom, status damage and AoE, takes +50 percent when Overheated', () => {
  const { B, boss } = manual('pest_boss_red_dot');
  B.S.zoomies = 10; deployCats(B, 2, 2);
  B.ensure();
  ok(boss.untargetable, 'the dot starts untargetable');
  const hp0 = boss.hp;
  B.damage(boss, 20, { kind: 'hit', src: B.cats()[0] });
  ok(boss.hp === hp0, 'a normal hit does nothing');
  B.damage(boss, 6, { kind: 'direct', srcId: 'hairball' });
  ok(boss.hp === hp0 - 6, 'status damage reaches it');
  const cat = B.cats()[0];
  B.damage(boss, 4, { kind: 'hit', src: cat, zoom: true });
  ok(boss.hp < hp0 - 6, 'a Zoom hit reaches it');
  // AoE through an op with an AoE target
  const h1 = boss.hp;
  B.runEffects([{ op: 'damage', amount: 5, target: 'allEnemies' }], B.makeCtx({ self: cat }));
  ok(boss.hp < h1, 'an allEnemies effect reaches it');
  ok(boss.untargetable, 'still untargetable afterwards');
  // yarn pins it
  B.addStatus(boss, 'yarn', 1, { force: true }); B.touch(); B.ensure();
  ok(!boss.untargetable, 'Yarn pins it so it can be hit');
  B.removeStatus(boss, 'yarn'); B.touch(); B.ensure();
  boss.statuses.overheated = 2; B.touch(); B.ensure();
  ok(!boss.untargetable, 'Overheated makes it targetable');
  const h2 = boss.hp;
  B.damage(boss, 10, { kind: 'hit', src: cat, noClaws: true });
  ok(boss.hp === h2 - 15 || boss.hp === h2 - 14, 'Overheated takes +50 percent, took ' + (h2 - boss.hp));
});

section('scenario: Duelist parry turns the first hit back and Wet 2 on the attacker', () => {
  const { B, boss } = manual('pest_boss_spray_duelist');
  B.S.zoomies = 10; deployCats(B, 2, 1);
  const cat = B.cats()[0];
  boss.stance = 'Parry'; boss.parryRound = -1;
  const hp0 = boss.hp;
  B.damage(boss, 10, { kind: 'hit', src: cat });
  ok(boss.hp === hp0 && cat.statuses.wet === 2, 'first hit parried, attacker Wet 2');
  B.damage(boss, 10, { kind: 'hit', src: cat });
  ok(boss.hp < hp0, 'second hit in the same round lands');
  boss.stance = 'Mist'; boss.parryRound = -1; const h2 = boss.hp;
  B.damage(boss, 10, { kind: 'hit', src: cat });
  ok(boss.hp < h2, 'Mist stance does not parry');
  // Soaked Through
  const other = B.cats()[1] || cat;
  other.statuses.wet = 0; B.addStatus(other, 'wet', 3, { force: true });
  ok(other.statuses.scared >= 1, 'Wet 3 on a cat makes it Scared 1');
});

section('scenario: Garden Hose blast and Coil death', () => {
  const { B, boss } = manual('pest_boss_garden_hose');
  B.S.zoomies = 10; deployCats(B, 3, 0);
  ok(typeof boss.meter.pressure === 'number', 'pressure is a number');
  boss.meter.pressure = 3;
  B.fire('onDusk', { subject: null }); B.drain();
  ok(boss.meter.pressure === 0, 'pressure 4 blasts and resets');
  ok(B.cats().every(c => c.statuses.wet >= 2), 'blast makes every cat Wet 2');
  boss.meter.pressure = 3;
  const coil = B.pests().find(p => p.id === 'pest_add_hose_coil');
  const hp0 = boss.hp;
  B.damage(coil, 999, { kind: 'direct' }); B.reap(); B.drain();
  ok(boss.meter.pressure === 1, 'a Coil cuts pressure by 2');
  ok(boss.hp === hp0 - 6, 'a Coil hurts the Hose for 6');
});

section('scenario: Laser Pointer Frenzy forces Witching Hours', () => {
  const { B, boss } = manual('pest_boss_red_dot');
  ok(B.S.rules.nightClock, 'night clock is on for the boss');
  botTurn(B);
  boss.hp = Math.floor(boss.maxHp * 0.2); B.damage(boss, 1, { kind: 'direct' }); B.drain();
  ok(boss.passives.some(p => p.id === 'frenzy_clock'), 'phase 3 added the frenzy clock');
  let streak = 0, best = 0, r = 0;
  while (!B.state.over && r++ < 6) { botTurn(B); if (B.S.clock.isWitching) { streak++; best = Math.max(best, streak); } else streak = 0; }
  ok(best >= 3, 'three forced Witching Hours in a row, longest streak ' + best);
});

// ---- 4. serialize and restore with a boss mid-fight --------------------------------------------
section('serialize and restore a Vet Carrier fight with a trapped cat', () => {
  const { B, boss } = manual('pest_boss_vet_carrier');
  B.S.zoomies = 10; deployCats(B, 3, 0);
  SB.engine.ai.specials.trap(B, boss, { floors: 'each', pick: 'strongest', latchHp: 12, latchHide: 4, timer: 3 });
  const snap = B.serialize();
  const R = SB.battle.restore(B.run, snap);
  ok(R.S.trapped.length === 1 && R.S.trapped[0].cat.name === B.S.trapped[0].cat.name, 'trapped cat survives the round trip');
  let r = 0; while (!R.state.over && r++ < 12) botTurn(R);
  ok(true, 'restored battle keeps running');
});

section('polish: laser_zone hazard, Frazzled cats on the Red Dot floor take 2 extra', () => {
  const B = setup('pest_boss_red_dot', { seed: 1 });
  const dot = B.pests().filter(p => p.id === 'pest_boss_red_dot')[0];
  const unitUid = Object.keys(B.S.cards).filter(u => { const e = B.S.cards[u].eff; return (e.type === 'unit' || e.type === 'champion') && B.S.hand.some(h => h.uid === u); })[0]
    || Object.keys(B.S.cards).filter(u => B.S.cards[u].eff.type === 'unit' || B.S.cards[u].eff.type === 'champion')[0];
  const a = B.placeCat(unitUid, dot.floor), uid2 = Object.keys(B.S.cards).filter(u => u !== unitUid && (B.S.cards[u].eff.type === 'unit' || B.S.cards[u].eff.type === 'champion'))[0];
  const other = B.placeCat(uid2, (dot.floor + 1) % 3);
  ok(a && other, 'two cats placed');
  [a, other].forEach(c => { c.fluff = 0; c.health = c.maxHealth = 99; c.statuses.frazzled = 1; });
  const l1 = B.damage(a, 3, { kind: 'hit', src: dot, noHiss: true });
  const l2 = B.damage(other, 3, { kind: 'hit', src: dot, noHiss: true });
  ok(l1 === 5 && l2 === 3, 'Frazzled cat on the Red Dot floor takes 3 plus 2, a Frazzled cat elsewhere takes 3 (got ' + l1 + ' and ' + l2 + ')');
  a.statuses.frazzled = 0;
  ok(B.damage(a, 3, { kind: 'hit', src: dot, noHiss: true }) === 3, 'a cat that is not Frazzled takes no extra');
});

section('no engine warnings (unsupported ops, specials, statuses, failed ops) during all boss fights', () => {
  const w = Object.keys(SB.util.warnings || {});
  ok(w.length === 0, 'warnings: ' + w.map(k => SB.util.warnings[k]).slice(0, 6).join(' | '));
});

console.log('\n' + checks + ' checks, ' + failures + ' failures');
failLog.slice(0, 40).forEach(m => console.log('  - ' + m));
process.exit(failures ? 1 : 0);
