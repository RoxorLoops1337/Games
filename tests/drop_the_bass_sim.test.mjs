// Drop the Bass: battle simulation rules.
import assert from 'node:assert/strict';
import { Run, genWave, waveBaseHp, DT } from '../drop_the_bass/js/sim.js';
import { TURRETS, ENEMIES, BOSSES, WORLDS, WORLD_BY_ID, MAX_LEVEL, ECON, COLS } from '../drop_the_bass/js/data_core.js';
import { REMIX, RELICS, DAILY_MODS } from '../drop_the_bass/js/data_run.js';

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const mk = (o = {}) => new Run(Object.assign({ world: 'garage', seed: 11, firstPrep: 999 }, o));
const spawn = (run, type = 'fuzz', o = {}) => run.spawnEnemy(Object.assign({ type, lane: 0, hpBase: 30, w: 1 }, o));
const runFor = (run, sec) => { for (let i = 0; i < sec * 60; i++) { run.tick(DT); run.drain(); } };

// ---- determinism: same seed, same inputs, same state
{
  const play = () => { const r = mk({ seed: 5, firstPrep: 1 }); r.coins = 500; for (let i = 0; i < 400; i++) { r.advance(0.1); r.autoPlayStep({ early: true }); r.drain(); } return JSON.stringify([r.wave, r.kills, Math.round(r.coins), r.turrets.map((t) => t.type + t.level + t.slot), r.stageHp]); };
  eq(play(), play(), 'deterministic');
}

// ---- deploy, cost growth, slots
{
  const r = mk(); r.coins = 1e6;
  const c0 = r.deployCost(); const a = r.deploy(null, { onBeat: false }); ok(a.ok && a.turret.level === 1, 'deploy works');
  ok(r.deployCost() > c0, 'cost grows'); ok(r.coins === 1e6 - c0, 'coins spent');
  const slot = r.emptySlots()[3]; const b = r.deploy(slot.idx); ok(b.ok && b.turret.slot === slot.idx, 'deploy to chosen slot');
  ok(!r.deploy(slot.idx).ok, 'slot taken');
  r.coins = 0; ok(r.deploy().reason === 'coins', 'needs coins');
  r.coins = 1e9; let n2 = 0; while (r.deploy().ok) n2++; ok(r.turrets.length === r.map.buildable.length, 'fills the board'); ok(r.deploy().reason === 'full', 'full board');
  // on beat discount
  const r2 = mk(); ok(r2.deployCost(true) < r2.deployCost(false), 'beat discount');
}

// ---- merge rules
{
  const r = mk({ loadout: ['kick', 'snare'] }); r.coins = 1e6;
  const a = r.deploy().turret, b = r.deploy().turret;
  a.type = 'kick'; b.type = 'kick';
  ok(r.canMerge(a, b), 'same level can merge'); const res = r.merge(a.id, b.id); ok(res.ok && b.level === 2 && r.turrets.length === 1, 'merge result');
  ok(b.paid > 0, 'paid carried');
  const c = r.deploy().turret; ok(!r.canMerge(b, c), 'different level cannot');
  const d = r.deploy().turret, e = r.deploy().turret; d.level = e.level = MAX_LEVEL; ok(!r.canMerge(d, e), 'max level cannot merge');
  d.level = e.level = 3; d.type = 'kick'; e.type = 'snare'; const cross = r.merge(d.id, e.id); ok(cross.ok && cross.kind === 'remix' && e.level === 4, 'cross type remix merge');
  const r3 = mk({ daily: 'no_merge' }); r3.coins = 1e6; const p = r3.deploy().turret, q = r3.deploy().turret; p.type = q.type = 'kick'; ok(!r3.canMerge(p, q), 'no merge daily');
  const r4 = mk(); r4.coins = 1e6; for (let i = 0; i < 12; i++) r4.deploy(); const before = r4.turrets.length; const m = r4.mergeAll(30); ok(m >= 0 && r4.turrets.length === before - m, 'mergeAll counts');
}

// ---- sell and move
{
  const r = mk(); r.coins = 1000; const t = r.deploy().turret; const paid = t.paid; const before = r.coins;
  const s = r.sell(t.id); ok(s.ok && r.coins > before && s.value === Math.floor(paid * ECON.sellBack), 'sell refund'); ok(r.turrets.length === 0, 'sold');
  const t2 = r.deploy().turret; const free = r.emptySlots()[0]; ok(r.move(t2.id, free.idx).ok && t2.slot === free.idx, 'move');
  const t3 = r.deploy().turret; const old = t3.slot; const sw = r.move(t3.id, t2.slot); ok(sw.ok && t2.slot === old, 'swap');
}

// ---- every turret kind damages enemies
for (const type of Object.keys(TURRETS)) {
  const def = TURRETS[type]; if (def.kind.startsWith('aura')) continue;
  const r = mk({ loadout: [type] }); r.coins = 1e6;
  const slot = r.map.buildable.find((s) => s.c === 2 && s.r === 2);
  const t = r.deploy(slot.idx).turret; t.level = 3;
  const e = spawn(r, 'brick', { hpBase: 5000 }); e.d = 72 * 3 + 20; r.placeEnemy(e);
  e.x = t.x + 60; e.y = t.y; // right in range
  const hp0 = e.hp; runFor(r, 3.5);
  ok(e.hp < hp0 || e.dead, type + ' damages an enemy');
}

// ---- auras buff neighbours
{
  const r = mk({ loadout: ['loop', 'amp', 'kick'] }); r.coins = 1e6;
  const s = (c, rr) => r.map.buildable.find((x) => x.c === c && x.r === rr).idx;
  const k = r.deploy(s(2, 2)).turret; k.type = 'kick';
  const l = r.deploy(s(3, 2)).turret; l.type = 'loop'; const a = r.deploy(s(1, 2)).turret; a.type = 'amp';
  r.recalcAuras(); ok(k.auraRate > 0 && k.auraDmg > 0, 'neighbour aura'); const far = r.deploy(s(0, 6)).turret; far.type = 'kick'; r.recalcAuras(); ok(far.auraRate === 0, 'far has no aura');
  ok(r.turretRate(k) > r.turretRate(far) && r.turretDmg(k) > r.turretDmg(far), 'aura raises stats');
}

// ---- stats scale with level and mods
{
  const r = mk(); r.coins = 1e6; const t = r.deploy().turret; t.type = 'kick'; const d1 = r.turretDmg(t); t.level = 2; ok(r.turretDmg(t) > d1 * 2, 'level doubles damage'); const d2 = r.turretDmg(t);
  r.applyPick({ type: 'remix', id: 'bass_boost' }); ok(r.turretDmg(t) > d2, 'remix raises damage');
  r.applyPick({ type: 'relic', id: 'tour_van' }); ok(r.stageMax === ECON.stageHp + 8, 'relic health');
}

// ---- leaks, loss, win, revive
{
  const r = mk(); const e = spawn(r, 'fuzz'); e.d = e.total - 1; runFor(r, 0.5);
  ok(r.stageHp === r.stageMax - 1 && r.leaks === 1, 'leak costs a heart');
  r.stageHp = 1; const e2 = spawn(r, 'fuzz'); e2.d = e2.total - 1; runFor(r, 0.5); ok(r.phase === 'lost' && r.result && !r.result.won, 'lost');
  ok(r.revive() && r.phase === 'prep' && r.stageHp > 0, 'revive');
  const w = mk({ wavesTotal: 1, firstPrep: 0.1 }); w.coins = 1e6; for (let i = 0; i < 8; i++) w.deploy(); w.mergeAll(10);
  for (let i = 0; i < 6000 && w.phase !== 'won' && w.phase !== 'lost'; i++) { w.advance(0.1); w.autoPlayStep(); w.drain(); }
  ok(w.phase === 'won' && w.result.won && w.result.stars >= 1, 'story wave win');
}
{
  const r = mk({ mods: 0 }); r.mods.reviveOnce = 1; r.stageHp = 1; const e = spawn(r); e.d = e.total - 1; runFor(r, 0.5); ok(r.phase !== 'lost' && r.stageHp > 1, 'second wind');
}

// ---- waves: generation properties
for (const w of WORLDS) {
  let prevBudget = 0;
  for (let wave = 1; wave <= 45; wave++) {
    const a = genWave(w, wave, 99), b = genWave(w, wave, 99);
    eq(a, b, 'wave gen deterministic');
    ok(a.groups.length >= 1 && a.groups.every((g) => g.count >= 2 && g.count <= 40 && ENEMIES[g.type] && w.pool.includes(g.type)), 'wave groups valid ' + w.id + wave);
    ok(a.groups.reduce((s, g) => s + g.count, 0) <= 90, 'wave size sane');
    if (wave % 10 === 0) ok(a.boss && BOSSES[a.boss], 'boss on wave ' + wave);
    if (wave === 20) ok(a.boss === w.boss, 'wave 20 boss of the stage');
    if (wave === 10) ok(a.boss === w.boss10 && a.bossScale < 1, 'wave 10 mini boss');
  }
  ok(waveBaseHp(w, 20) > waveBaseHp(w, 1) * 5, 'hp grows'); ok(waveBaseHp(w, 40) > waveBaseHp(w, 21), 'endless hp grows');
}
{
  const first = genWave(WORLD_BY_ID.garage, 1, 3); ok(first.groups.length === 1 && first.groups[0].type === 'fuzz', 'wave 1 is just fuzz');
  const w2 = genWave(WORLD_BY_ID.garage, 2, 3); ok(w2.groups.some((g) => g.type === 'zip'), 'zip debuts on 2');
}

// ---- boss tricks
{
  const r = mk({ world: 'arena' }); r.coins = 1e9;
  const cap = spawn(r, 'boss:compressor', { hpBase: 100, scale: 1 }); const hp = cap.hp; r.hurt(cap, 1e9); ok(hp - cap.hp <= hp * 0.0601, 'compressor caps a hit');
  const gate = spawn(r, 'boss:noisegate', { hpBase: 100, scale: 1 }); gate.gated = true; const g0 = gate.hp; r.hurt(gate, 500); ok(gate.hp === g0, 'gated boss is immune');
  gate.gated = false; gate.timer = 0.01; runFor(r, 0.2); ok(gate.gated, 'gate closes'); ok(r.enemies.some((e) => e.type === 'fuzz'), 'gate calls fuzz');
  const rev = spawn(r, 'boss:reverb', { hpBase: 100, scale: 1 }); rev.timer = 0.01; const cnt = r.enemies.length; runFor(r, 0.1); ok(r.enemies.length > cnt, 'reverb spawns echoes');
  const dj = spawn(r, 'boss:djglitch', { hpBase: 100, scale: 1 }); r.coins = 1e9; for (let i = 0; i < 4; i++) r.deploy(); dj.timer = 0.01; const d0 = dj.d; runFor(r, 0.1); ok(dj.d > d0 && r.turrets.some((t) => t.jam > 0), 'djglitch teleports and jams');
  const pb = spawn(r, 'boss:playback', { hpBase: 1000, scale: 1 }); const c2 = r.enemies.length; pb.hp = pb.maxHp * 0.6; runFor(r, 0.1); ok(pb.phase === 2 && r.enemies.length > c2, 'playback phase 2 summons');
}

// ---- enemy specials
{
  const r = mk(); r.coins = 1e6; const t = r.deploy().turret;
  const echo = spawn(r, 'echo'); const before = r.enemies.length; r.hurt(echo, 1e9); ok(r.enemies.filter((e) => e.type === 'mini').length === 2 && r.enemies.length === before + 1, 'echo splits');
  const sq = spawn(r, 'squeal'); sq.x = t.x; sq.y = t.y; r.hurt(sq, 1e9); ok(t.jam > 0, 'feedback jams turrets');
  const gate = spawn(r, 'gate'); ok(gate.shield > 0, 'gate has shield'); const hp0 = gate.hp; r.hurt(gate, gate.shield * 0.5); ok(gate.hp === hp0, 'shield absorbs');
  const mute = spawn(r, 'mute'); ok(mute.immune, 'mute immune');
  const brick = spawn(r, 'brick', { hpBase: 100 }); const h0 = brick.hp; r.hurt(brick, 2); ok(h0 - brick.hp >= 0.5 - 1e-9 && h0 - brick.hp <= 2, 'armor reduces but never to zero');
  const drone = spawn(r, 'drone'); ok(drone.flying, 'drone flies');
}

// ---- heroes and duet
{
  const r = mk(); const e = spawn(r, 'fuzz', { hpBase: 100000 }); r.heroCd.roxor = 0; r.heroCd.jasmin = 0; const hp = e.hp;
  ok(r.useHero('roxor') && e.hp < hp && e.stun > 0, 'blast hurts and stuns'); ok(!r.useHero('roxor'), 'cooldown');
  ok(r.useHero('jasmin') && e.slowT > 0 && r.sirenT > 0, 'song slows'); ok(r.duets === 1, 'duet triggers within the window');
  ok(r.heroUses === 2, 'hero uses counted');
}

// ---- hype, choices and relics
{
  const r = mk({ loadout: ['kick', 'snare', 'hat', 'sub'] });
  r.hype = r.hypeNeed; r.checkHype(); ok(r.choice && r.choice.options.length === 3 && r.level === 2, 'level up opens a choice');
  const ids = r.choice.options.map((o) => o.id); ok(new Set(ids).size === 3, 'distinct options');
  ok(!r.deploy().ok, 'cannot deploy during a choice'); const prev = r.tick(DT); const t0 = r.t; r.tick(DT); ok(r.t === t0, 'sim pauses during a choice');
  r.rerolls = 2; ok(r.rerollChoice() && r.choice.options.length === 3, 'reroll'); ok(r.pick(0) && !r.choice && r.remixCount === 1, 'pick closes');
  r.queueChoice('chest'); ok(r.choice.options.every((o) => o.type === 'relic'), 'chest offers relics'); r.pick(1); ok(r.relics.length === 1, 'relic added');
  for (let i = 0; i < 300; i++) { r.queueChoice('remix'); if (r.choice) r.pick(0); }
  for (const id of Object.keys(r.remix)) ok(r.remix[id] <= REMIX[id].max, 'stack cap ' + id);
  const only = mk({ loadout: ['kick'] }); for (let i = 0; i < 40; i++) { only.queueChoice('remix'); ok(only.choice.options.every((o) => !REMIX[o.id].turret || REMIX[o.id].turret === 'kick'), 'turret cards only for loadout'); only.pick(0); }
}

// ---- wave flow: prep timer, early bonus, mods, clear rewards
{
  const r = mk({ firstPrep: 5 }); ok(r.phase === 'prep' && r.wave === 0, 'starts in prep'); const c0 = r.coins; ok(r.startWave(true) && r.coins > c0 && r.wave === 1, 'early start gives bonus');
  const cap = mk({ firstPrep: 999 }); const c1 = cap.coins; cap.startWave(true); ok(cap.coins - c1 <= ECON.prepSeconds * ECON.earlyBonusPerSec + 1, 'early bonus is capped');
  const auto = mk({ firstPrep: 0.5 }); runFor(auto, 1); ok(auto.wave === 1, 'wave starts by itself');
  let seenMod = false; for (let w = 4; w < 40 && !seenMod; w++) if (genWave(WORLD_BY_ID.club, w, 5).mod) seenMod = true; ok(seenMod, 'some waves carry a twist');
}

// ---- daily mods and endless
{
  for (const id of Object.keys(DAILY_MODS)) { const r = mk({ daily: id, mode: 'daily' }); ok(r.stageMax > 0, 'daily ' + id); r.coins = 1e6; r.deploy(); ok(r.turrets.length === 1, 'daily deploy ' + id); runFor(r, 0.5); }
  const e = new Run({ world: 'garage', mode: 'endless', seed: 2, firstPrep: 0.1 }); e.coins = 1e6; for (let i = 0; i < 20; i++) e.deploy(); e.mergeAll(30);
  let guard = 0; while (e.wave < 22 && e.phase !== 'lost' && guard++ < 40000) { e.advance(0.1); e.autoPlayStep({ early: true }); e.drain(); }
  ok(e.wave >= 21 || e.phase === 'lost', 'endless goes past the story length'); ok(e.phase !== 'won', 'endless never wins');
  const t = mk({ daily: 'tiny_stage' }); t.coins = 1e9; for (let i = 0; i < 30; i++) t.deploy(); ok(t.turrets.length === 14, 'slot limit daily');
}

// ---- events are plain data and drain empties
{
  const r = mk(); r.coins = 1e6; r.deploy(); const ev = r.drain(); ok(ev.length > 0 && ev[0].k === 'deploy', 'events'); ok(r.drain().length === 0, 'drained');
  ok(JSON.stringify(ev).length > 0, 'events serialisable');
}

// ---- long fuzz: random actions never throw and invariants hold
{
  let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (const w of WORLDS) {
    const r = new Run({ world: w.id, seed: Math.floor(rnd() * 1e6), firstPrep: 1, loadout: Object.keys(TURRETS) });
    r.coins = 20000;
    for (let i = 0; i < 4000; i++) {
      r.advance(0.12); r.drain();
      const x = rnd();
      if (x < 0.12) r.deploy(); else if (x < 0.2) r.mergeAll(2); else if (x < 0.23 && r.turrets.length) r.sell(r.turrets[Math.floor(rnd() * r.turrets.length)].id);
      else if (x < 0.26 && r.turrets.length) r.move(r.turrets[Math.floor(rnd() * r.turrets.length)].id, r.map.buildable[Math.floor(rnd() * r.map.buildable.length)].idx);
      else if (x < 0.3) r.useHero(rnd() < 0.5 ? 'roxor' : 'jasmin'); else if (x < 0.33) r.startWave(true); else if (x < 0.36) r.rerollDrop();
      if (r.choice) { if (rnd() < 0.3) r.rerollChoice(); r.pick(Math.floor(rnd() * 3)); }
      if (r.phase === 'lost') r.revive();
      for (const e of r.enemies) assert.ok(isFinite(e.x + e.y + e.hp) && e.hp > 0 && !e.dead, 'enemy sane');
      assert.ok(r.stageHp <= r.stageMax && r.coins >= 0, 'invariants');
      assert.ok(new Set(r.turrets.map((t) => t.slot)).size === r.turrets.length, 'slots unique');
    }
    n++;
  }
}
console.log('drop_the_bass sim: ' + n + ' checks passed');
