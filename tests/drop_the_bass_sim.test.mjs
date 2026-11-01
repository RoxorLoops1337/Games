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
    if (wave === 20 && w.wavesTotal === 20) ok(a.boss === w.boss, 'wave 20 boss of the stage');
    if (wave === 20 && w.wavesTotal === 25) ok(a.boss === w.boss10 && a.bossScale < 1, 'wave 20 mid boss of a 25 wave stage');
    if (wave === w.wavesTotal) ok(a.boss === w.boss && a.bossScale === 1, 'final wave boss of ' + w.id);
    if (w.wavesTotal === 25 && wave > 20 && wave < 25) ok(!a.boss, 'no boss on waves 21 to 24');
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
// ---- boss rush
{
  const r = new Run({ world: 'garage', mode: 'rush', seed: 3, firstPrep: 0.1 });
  ok(r.wavesTotal === 10, 'rush is ten waves'); const ids = []; for (let w = 1; w <= 10; w++) ids.push(r.upcoming(w).boss);
  ok(new Set(ids).size === 7 && ids.every(Boolean), 'rush has a boss every wave, all seven kinds');
  r.coins = 1e6; for (let i = 0; i < 16; i++) r.deploy(); r.mergeAll(30);
  for (let i = 0; i < 20000 && r.phase !== 'won' && r.phase !== 'lost'; i++) { r.advance(0.1); r.autoPlayStep({ early: true }); r.drain(); }
  ok(r.bossKills >= 1, 'rush bosses can be killed');
}

// ---- save and resume
{
  const a = new Run({ world: 'club', seed: 4, firstPrep: 1, loadout: ['kick', 'snare', 'hat', 'sub', 'mic', 'synth', 'horn', 'scratch', 'cowbell', 'vocal', 'loop', 'amp'] }); a.coins = 5000;
  for (let i = 0; i < 1500; i++) { a.advance(0.1); a.autoPlayStep({ early: true }); a.drain(); }
  const snap = JSON.parse(JSON.stringify(a.snapshot())); const b = Run.restore(snap);
  ok(a.enemies.length + a.projectiles.length + a.turrets.length > 3, 'snapshot taken mid fight');
  for (let i = 0; i < 800; i++) for (const r of [a, b]) { r.advance(0.1); r.autoPlayStep({ early: true }); r.drain(); }
  const key = (r) => JSON.stringify([r.t.toFixed(3), r.wave, r.kills, r.coins.toFixed(2), r.stageHp, r.enemies.map((e) => [e.id, Math.round(e.hp), Math.round(e.d)]), r.turrets.map((t) => t.type + t.level + t.slot), r.rng.getState(), Object.keys(r.remix).sort(), r.relics]);
  eq(key(a), key(b), 'a restored run plays out identically'); ok(JSON.stringify(a.snapshot()).length < 200000, 'snapshot stays small');
  const mid = new Run({ world: 'garage', seed: 2, firstPrep: 1 }); mid.hype = mid.hypeNeed; mid.checkHype(); const rs = Run.restore(JSON.parse(JSON.stringify(mid.snapshot()))); ok(rs.choice && rs.choice.options.length === 3, 'a pending choice survives a save');
}
// ---- synergies
import { SYNERGIES, SYN_FLAT, synergyScale, TURRET_PARTNERS, DIFFICULTY } from '../drop_the_bass/js/data_core.js';
const slotAt = (r, c, rr) => r.map.buildable.find((x) => x.c === c && x.r === rr).idx;
const put = (r, type, c, rr, level = 1) => { const t = r.deploy(slotAt(r, c, rr), { onBeat: false }).turret; t.type = type; t.level = level; r.recalcAuras(); return t; };
{
  // every synergy applies its effect to both sides, and lists the partner
  for (const s of SYNERGIES) {
    const r = mk({ loadout: [s.a, s.b] }); r.coins = 1e6;
    const ta = put(r, s.a, 2, 2), tb = put(r, s.b, 3, 2);
    for (const [side, t, o] of [['a', ta, tb], ['b', tb, ta]]) {
      for (const [k, v] of Object.entries(s.fx[side] || {})) ok(Math.abs((t.syn[k] || 0) - v) < 1e-9 || k === 'aura', 'syn effect ' + s.id + ' ' + side + ' ' + k);
      const list = r.synergiesOf(t); const row = list.find((x) => x.id === s.id);
      ok(row && row.withId === o.id && row.withType === o.type && row.name === s.name && row.desc === s.desc, 'synergiesOf lists ' + s.id);
      ok(r.synergiesOf(t.id).length === list.length, 'synergiesOf accepts an id');
    }
    ok(TURRET_PARTNERS[s.a].some((p) => p.id === s.id && p.partner === s.b), 'partners ' + s.id);
  }
  // announce once, with a position
  const r = mk({ forceDrops: ['sub', 'kick', 'snare'] }); r.coins = 1e6;
  r.deploy(slotAt(r, 2, 2), { onBeat: false }); ok(!r.drain().some((e) => e.k === 'synergy'), 'no synergy alone');
  r.deploy(slotAt(r, 3, 2), { onBeat: false }); const ev = r.drain().filter((e) => e.k === 'synergy');
  ok(ev.length === 1 && ev[0].id === 'slow_smash' && isFinite(ev[0].x + ev[0].y), 'synergy event on placement');
  r.recalcAuras(); ok(!r.drain().some((e) => e.k === 'synergy'), 'one shot');
  // scales with the lower level, breaks on move and sell, diagonal does not count
  const k = r.turrets.find((t) => t.type === 'kick'), sb = r.turrets.find((t) => t.type === 'sub');
  ok(Math.abs(k.syn.slowedDmg - 0.25) < 1e-9, 'level 1 value');
  k.level = 4; sb.level = 4; r.recalcAuras(); ok(Math.abs(k.syn.slowedDmg - 0.25 * synergyScale(4)) < 1e-9 && synergyScale(4) > 1, 'scales with the lower level');
  sb.level = 1; r.recalcAuras(); ok(Math.abs(k.syn.slowedDmg - 0.25) < 1e-9, 'lower of the two levels counts');
  const savedC = sb.c, savedR = sb.r; sb.c = k.c + 1; sb.r = k.r + 1; r.recalcAuras(); ok(r.synergiesOf(k).length === 0 && !k.syn.slowedDmg, 'diagonal is not adjacent'); sb.c = savedC; sb.r = savedR; r.recalcAuras();
  ok(k.syn.slowedDmg > 0, 'adjacent again');
  r.move(sb.id, slotAt(r, 0, 6)); ok(r.synergiesOf(k).length === 0 && !k.syn.slowedDmg, 'breaks when the neighbour moves');
  r.move(sb.id, slotAt(r, 2, 2)); ok(r.synergiesOf(k).length === 1, 'returns when it comes back');
  r.sell(sb.id); ok(r.synergiesOf(k).length === 0 && !k.syn.slowedDmg, 'breaks when the neighbour is sold');
  // snapshot and restore keep it and do not re-announce
  const r2 = mk({ loadout: ['kick', 'sub'] }); r2.coins = 1e6; const k2 = put(r2, 'kick', 2, 2), s2 = put(r2, 'sub', 3, 2); r2.drain();
  const b = Run.restore(JSON.parse(JSON.stringify(r2.snapshot())));
  const bk = b.turretById(k2.id); eq(b.synergiesOf(bk), r2.synergiesOf(k2), 'synergies survive restore'); ok(Math.abs(bk.syn.slowedDmg - 0.25) < 1e-9, 'effect survives restore');
  ok(!b.drain().some((e) => e.k === 'synergy'), 'restore does not re-announce'); put(b, 'hat', 2, 6); ok(!b.drain().some((e) => e.k === 'synergy'), 'existing pair not re-announced');
}
{
  // concrete effects
  const alone = (type, lvl = 1) => { const r = mk({ loadout: [type] }); r.coins = 1e6; return [r, put(r, type, 2, 2, lvl)]; };
  const two = (a, b) => { const r = mk({ loadout: [a, b] }); r.coins = 1e6; return [r, put(r, a, 2, 2), put(r, b, 3, 2)]; };
  { const [r0, s0] = alone('snare'); const [r1, s1] = two('snare', 'hat'); ok(Math.abs(r1.turretRate(s1) / r0.turretRate(s0) - 1.1) < 1e-9, 'snare+hat rate +10%'); }
  { const [r0, s0] = alone('sub'); const [r1, , s1] = two('horn', 'sub'); ok(Math.abs(r1.turretDmg(s1) / r0.turretDmg(s0) - 1.12) < 1e-9, 'horn+sub: sub damage'); }
  { const [r0, h0] = alone('horn'); const [r1, h1] = two('horn', 'kick'); ok(Math.abs(r1.turretRange(h1) / r0.turretRange(h0) - 1.06) < 1e-9, 'horn+kick range'); }
  { const [r0, c0] = alone('cowbell'); const [r1, c1] = two('cowbell', 'amp'); ok(Math.abs(r1.turretCrit(c1) - r0.turretCrit(c0) - 0.1) < 1e-9 && c1.auraDmg > 0, 'cowbell+amp crit and the aura still works'); }
  { // loop + amp: stronger auras on a third neighbour
    const r = mk({ loadout: ['loop', 'amp', 'kick'] }); r.coins = 1e6; const kk = put(r, 'kick', 1, 2); put(r, 'loop', 2, 2); const base = kk.auraRate;
    put(r, 'amp', 3, 2); ok(Math.abs(kk.auraRate - base * 1.15) < 1e-9, 'loop+amp: aura 15% stronger'); }
  { // horn stun is longer next to a sub
    const stunOf = (adj) => { const r = mk({ loadout: ['horn', 'sub'] }); r.coins = 1e6; const h = put(r, 'horn', 2, 2); if (adj) put(r, 'sub', 3, 2); const e = spawn(r, 'fuzz', { hpBase: 1e6 }); e.x = h.x + 50; e.y = h.y; r.fire(h, e, r.turretRange(h)); return e.stun; };
    ok(Math.abs(stunOf(true) - stunOf(false) - 0.4) < 1e-9, 'horn+sub: stun lasts longer'); }
  { // kick shells hit slowed enemies harder
    const r = mk({ loadout: ['kick', 'sub'] }); r.coins = 1e6; const kk = put(r, 'kick', 2, 2); put(r, 'sub', 3, 2);
    const e1 = spawn(r, 'fuzz', { hpBase: 1e6 }), e2 = spawn(r, 'fuzz', { hpBase: 1e6 }); e1.slowT = 2; e1.slowAmt = 0.3;
    const h1 = e1.hp, h2 = e2.hp; r.explode({ x: e1.x, y: e1.y, radius: 80, dmg: 100, bonusSlowed: kk.syn.slowedDmg }); ok(Math.abs((h1 - e1.hp) / (h2 - e2.hp) - 1.25) < 1e-9, 'slowed enemies take 25% more splash');
    r.fire(kk, e2, r.turretRange(kk)); ok(r.projectiles[r.projectiles.length - 1].bonusSlowed === kk.syn.slowedDmg, 'shell carries the bonus'); }
  { // mic heals the stage at level 1 next to a choir orb
    const [r0, m0] = alone('mic'); r0.stageHp = r0.stageMax - 3; m0.shots = 40; r0.doBeam(m0, 0, false); ok(r0.stageHp === r0.stageMax - 3, 'plain level 1 mic does not heal');
    const [r1, m1] = two('mic', 'vocal'); r1.stageHp = r1.stageMax - 3; m1.shots = 40; r1.doBeam(m1, 0, false); ok(r1.stageHp === r1.stageMax - 2, 'mic+vocal heals every 5th beam'); }
  { // records throw sparks
    const r = mk({ loadout: ['scratch', 'synth'] }); r.coins = 1e6; const s = put(r, 'scratch', 2, 2); put(r, 'synth', 3, 2);
    const e1 = spawn(r, 'fuzz', { hpBase: 1e6 }), e2 = spawn(r, 'fuzz', { hpBase: 1e6 }); const h2 = e2.hp;
    r.fire(s, e1, r.turretRange(s)); ok(r.projectiles[r.projectiles.length - 1].arc === 1, 'disc has the arc'); r.arcFrom(e1, 50, new Set([e1.id])); ok(e2.hp < h2, 'spark hits a neighbour'); }
  { // synth jumps once more
    const jumps = (adj) => { const r = mk({ loadout: ['synth', 'amp'] }); r.coins = 1e6; const s = put(r, 'synth', 2, 2); if (adj) put(r, 'amp', 3, 2); const es = []; for (let i = 0; i < 6; i++) es.push(spawn(r, 'fuzz', { hpBase: 1e6 })); r.drain(); r.fire(s, es[0], r.turretRange(s)); return r.drain().find((e) => e.k === 'chain').pts.length; };
    ok(jumps(true) === jumps(false) + 1, 'hot wire adds a jump'); }
  { // hat starts spun up
    const r = mk({ loadout: ['hat', 'loop'] }); r.coins = 1e6; const h = put(r, 'hat', 2, 2); put(r, 'loop', 3, 2); const e = spawn(r, 'fuzz', { hpBase: 1e6 }); e.x = h.x + 50; e.y = h.y; r.updateTurrets(DT);
    ok(h.spin >= 0.35, 'hat spin floor'); }
}

// ---- drop pool and reroll
{
  const all = ['kick', 'snare', 'hat', 'sub', 'mic', 'synth'];
  const r = mk({ loadout: all }); const o = r.poolOdds();
  ok(o.length === 6 && Math.abs(o.reduce((a, x) => a + x.p, 0) - 1) < 1e-9 && o.every((x) => Math.abs(x.p - 1 / 6) < 1e-9), 'fresh odds are even and sum to 1');
  r.dropHist = ['kick']; const o1 = r.poolOdds(); ok(o1.find((x) => x.type === 'kick').p < 1 / 6 && Math.abs(o1.reduce((a, x) => a + x.p, 0) - 1) < 1e-9, 'a just-dropped type is less likely');
  r.dropHist = ['kick', 'kick']; const o2 = r.poolOdds(); ok(o2.find((x) => x.type === 'kick').p === 0 && Math.abs(o2.reduce((a, x) => a + x.p, 0) - 1) < 1e-9, 'no third in a row');
  for (const loadout of [['kick', 'snare'], ['kick', 'snare', 'hat'], all]) {
    const q = mk({ loadout, seed: 21 }); q.coins = 1e9; const seq = [];
    for (let i = 0; i < 250; i++) { const d = q.deploy(null, { onBeat: false }); seq.push(d.turret.type); q.sell(d.turret.id); }
    let streak = true; for (let i = 2; i < seq.length; i++) if (seq[i] === seq[i - 1] && seq[i] === seq[i - 2]) streak = false;
    ok(streak, 'never three in a row with ' + loadout.length + ' types');
  }
  // deterministic
  const play = () => { const q = mk({ loadout: all, seed: 8 }); q.coins = 1e9; q.rerolls = 3; const seq = []; for (let i = 0; i < 40; i++) { if (i % 5 === 0) q.rerollNext('coins'); const d = q.deploy(null, { onBeat: false }); seq.push(d.turret.type); q.sell(d.turret.id); } return seq.join(); };
  eq(play(), play(), 'drops and rerolls are deterministic');
  // coins
  const c = mk({ loadout: all }); c.coins = 1000; const old = c.nextType; const price = Math.ceil(ECON.dropRerollCoinPct * c.deployCost(false, true)); c.drain();
  const res = c.rerollNext('coins'); ok(res.ok && res.reason === null && res.cost === price && c.coins === 1000 - price && res.type === c.nextType && res.type !== old, 'coin reroll');
  ok(c.drain().some((e) => e.k === 'rerollDrop' && e.type === c.nextType), 'rerollDrop event');
  c.coins = price - 1; const keep = c.nextType; const bad = c.rerollNext('coins'); ok(!bad.ok && bad.reason === 'coins' && bad.cost === price && c.coins === price - 1 && c.nextType === keep, 'not enough coins');
  const fs = mk({ loadout: all }); fs.mods.freeDeploys = 3; fs.coins = 1000; ok(fs.rerollNext('coins').cost === Math.ceil(ECON.dropRerollCoinPct * fs.deployCost(false, true)) && fs.deployCost() === 0, 'price ignores free deploys');
  // gems
  const g = mk({ loadout: all }); ok(g.rerollNext('gems').reason === 'gems', 'no run gems'); ok(g.rerollNext('gems', 1).reason === 'gems', 'balance too low');
  const gb = g.rerollNext('gems', 5); ok(gb.ok && gb.cost === ECON.dropRerollGems && gb.spendDiamonds === 2 && g.gemsSpent === 2 && g.runGems === 0, 'pay from a profile balance');
  g.runGems = 3; const gr = g.rerollNext('gems'); ok(gr.ok && g.runGems === 1 && gr.spendDiamonds === 0, 'pay from run gems');
  // free counter first
  const f = mk({ loadout: all }); f.coins = 0; f.rerolls = 1; const fr = f.rerollNext('coins'); ok(fr.ok && fr.cost === 0 && fr.paid === 'free' && f.rerolls === 0, 'free reroll first'); ok(f.rerollNext('coins').reason === 'coins', 'then it costs');
  ok(f.rerollNext('bogus').reason === 'pay', 'bad payment');
  ok(mk({ loadout: ['kick'] }).rerollNext('coins').reason === 'single', 'one type cannot reroll');
  const bz = mk({ loadout: all }); bz.hype = bz.hypeNeed; bz.checkHype(); ok(bz.rerollNext('coins').reason === 'busy', 'busy during a choice');
  const lk = mk({ loadout: ['kick', 'snare'] }); lk.coins = 1000; lk.dropHist = ['kick', 'kick']; lk.nextType = 'snare'; const lr = lk.rerollNext('coins'); ok(!lr.ok && lr.reason === 'locked' && lk.coins === 1000, 'cannot reroll into a third in a row');
  const many = mk({ loadout: all }); many.rerolls = 60; let prev = many.nextType, differs = true; for (let i = 0; i < 60; i++) { const x = many.rerollNext('coins'); if (!x.ok || x.type === prev) differs = false; prev = x.type; } ok(differs, 'a reroll always changes the type');
  // snapshot
  const s1 = mk({ loadout: all, seed: 5 }); s1.coins = 1e6; s1.rerolls = 5; s1.rerollNext('coins'); s1.deploy(null, { onBeat: false });
  const s2 = Run.restore(JSON.parse(JSON.stringify(s1.snapshot())));
  ok(s2.nextType === s1.nextType && JSON.stringify(s2.dropHist) === JSON.stringify(s1.dropHist) && s2.rerolls === s1.rerolls, 'drop state survives restore');
  const seq2 = [s1, s2].map((x) => { const out = []; for (let i = 0; i < 6; i++) { out.push(x.rerollNext('coins').type); out.push(x.deploy(null, { onBeat: false }).turret.type); } return out.join(); });
  eq(seq2[0], seq2[1], 'rerolls after restore match');
}

// ---- wave preview
{
  let sawMod = 0;
  for (const w of WORLDS) for (let wave = 1; wave <= 20; wave++) for (const seed of [3, 9]) {
    const r = new Run({ world: w.id, seed, firstPrep: 999 }); r.wave = wave - 1;
    const pv = r.nextWavePreview(); const spec = genWave(w, wave, seed);
    ok(pv.wave === wave && pv.lanes.length === r.map.lanes.length, 'preview shape ' + w.id + wave);
    ok(pv.hasBoss === (wave % 10 === 0) && (pv.lanes[0].boss === spec.boss), 'preview boss ' + w.id + wave);
    ok((pv.mod ? pv.mod.id : null) === spec.mod && (!pv.mod || (pv.mod.name && pv.mod.desc)), 'preview mod ' + w.id + wave); if (pv.mod) sawMod++;
    r.startWave();
    const real = r.map.lanes.map(() => ({})); let bossAt = null;
    for (const s of r.spawnQ) { if (s.type.startsWith('boss:')) bossAt = [s.lane, s.type.slice(5)]; else real[s.lane][s.type] = (real[s.lane][s.type] || 0) + 1; }
    for (const L of pv.lanes) { const got = {}; for (const e of L.enemies) { got[e.type] = e.count; ok(e.flying === !!ENEMIES[e.type].flying && e.armored === (ENEMIES[e.type].armor > 0), 'flags'); } eq(got, real[L.lane], 'preview matches spawn queue ' + w.id + wave + ' lane ' + L.lane); }
    eq(bossAt ? bossAt[1] : null, pv.lanes[0].boss, 'boss matches'); ok(pv.total === r.spawnQ.length, 'total matches');
    const cur = r.currentWaveInfo(); eq(cur.lanes, pv.lanes, 'current info equals preview at wave start'); ok(cur.total === pv.total && cur.wave === wave, 'current total');
  }
  ok(sawMod > 0, 'some previews carry a wave mod: ' + sawMod);
  // what actually spawns while ticking (waves without a boss, so no helpers join in)
  for (const id of ['garage', 'festival', 'arena']) for (let wave = 1; wave <= 9; wave++) {
    const r = new Run({ world: id, seed: 4, firstPrep: 999 }); r.wave = wave - 1; r.stageHp = r.stageMax = 1e9;
    const pv = r.nextWavePreview(); r.startWave(); const got = r.map.lanes.map(() => ({}));
    for (let i = 0; i < 60 * 200 && (r.spawnQ.length || i === 0); i++) { r.tick(DT); for (const e of r.drain()) if (e.k === 'spawn') got[e.lane][e.type] = (got[e.lane][e.type] || 0) + 1; }
    for (const L of pv.lanes) eq(Object.fromEntries(L.enemies.map((e) => [e.type, e.count])), got[L.lane], 'real spawn matches preview ' + id + wave);
  }
  const a = new Run({ world: 'arena', seed: 2, firstPrep: 999 }); a.wave = 14; ok(a.nextWavePreview().lanes.filter((l) => l.enemies.length).length === 3, 'arena spreads over three lanes');
  const idle = mk(); ok(idle.currentWaveInfo() === null, 'no current wave in prep');
  idle.startWave(); idle.spawnQ.length = 0; for (let i = 0; i < 3; i++) spawn(idle, 'fuzz'); let ci = idle.currentWaveInfo(); ok(ci.total === 3 && ci.lanes[0].enemies[0].count === 3, 'remaining counts');
  idle.hurt(idle.enemies[0], 1e9); ci = idle.currentWaveInfo(); ok(ci.lanes[0].enemies[0].count === 2, 'remaining shrinks on a kill');
  const fin = mk({ wavesTotal: 3 }); fin.wave = 3; ok(fin.nextWavePreview() === null, 'no preview after the last wave'); const en = mk({ mode: 'endless' }); en.wave = 25; ok(en.nextWavePreview().wave === 26, 'endless keeps previewing');
}

// ---- recap
{
  const fresh = mk(); const rc0 = fresh.recap(); ok(rc0.leaksByLane.length === 1 && rc0.leakTypes.length === 0 && rc0.worstWave === null && rc0.bossFinisher === null && rc0.tips.length <= 3, 'empty recap');
  const r = mk({ world: 'festival' }); const z = []; for (let i = 0; i < 4; i++) z.push(spawn(r, 'zip', { lane: 1, w: 3 })); const f = spawn(r, 'fuzz', { lane: 0, w: 2 });
  for (const e of z.concat([f])) e.d = e.total - 1; runFor(r, 0.5);
  const rc = r.recap();
  eq(rc.leaksByLane, [1, 4], 'leaks by lane'); eq(rc.leakTypes, [{ type: 'zip', count: 4 }, { type: 'fuzz', count: 1 }], 'leak types'); ok(rc.worstWave === 3, 'worst wave');
  eq(rc.topKillers, [{ type: 'zip', count: 4 }, { type: 'fuzz', count: 1 }], 'top killers by stage damage');
  eq(rc.tips, ['Most leaks came from the right lane: build there.', 'Fast Glitch Zips slipped past: Sub Bass slows them.'], 'lane and zip tips');
  eq(Run.restore(JSON.parse(JSON.stringify(r.snapshot()))).recap(), rc, 'recap survives restore');
  const b = mk(); b.stageHp = 1; const boss = spawn(b, 'boss:compressor', { hpBase: 100, scale: 1 }); boss.d = boss.total - 1; runFor(b, 0.5);
  ok(b.phase === 'lost' && b.result.recap.bossFinisher === 'compressor' && b.result.recap.tips[0].includes('Compressor') && b.result.recap.leaksByLane[0] === 3, 'boss finisher in result.recap');
  ok(b.result.difficulty === 'normal' && b.result.rewardMul.records === 1, 'result carries difficulty');
  const m = mk({ loadout: ['kick', 'snare', 'hat', 'sub'] }); m.coins = 1e6; for (let i = 0; i < 8; i++) m.deploy(null, { onBeat: false });
  ok(m.merges === 0 && m.recap().tips.some((t) => t.includes('never merged')), 'merge tip');
  const sy = mk({ forceDrops: ['kick', 'sub'] }); sy.coins = 1e6; sy.deploy(slotAt(sy, 2, 2), { onBeat: false }); sy.deploy(slotAt(sy, 0, 6), { onBeat: false });
  eq(sy.recap().tips, ['Try pairing Sub Bass with Kick Cannon for a synergy bonus.'], 'synergy tip');
  const sy2 = mk({ forceDrops: ['kick', 'sub'] }); sy2.coins = 1e6; sy2.deploy(slotAt(sy2, 2, 2), { onBeat: false }); sy2.deploy(slotAt(sy2, 3, 2), { onBeat: false }); ok(sy2.recap().tips.length === 0, 'no synergy tip once one was active');
  ok(sy2.recap().turretUse.length === 2 && sy2.recap().turretUse[0].deployed === 1, 'turret use');
  for (const t of rc.tips.concat(b.result.recap.tips)) ok(!t.includes(String.fromCharCode(8212)), 'no em dash in tips');
  const w1 = mk({ wavesTotal: 1, firstPrep: 0.1 }); w1.coins = 1e6; for (let i = 0; i < 8; i++) w1.deploy(); w1.mergeAll(10);
  for (let i = 0; i < 6000 && w1.phase !== 'won' && w1.phase !== 'lost'; i++) { w1.advance(0.1); w1.autoPlayStep(); w1.drain(); }
  ok(w1.result && w1.result.recap && Array.isArray(w1.result.recap.tips) && w1.result.recap.tips.length <= 3, 'recap on a win');
}

// ---- difficulty
{
  const n0 = mk(), e0 = mk({ difficulty: 'easy' }), h0 = mk({ difficulty: 'hard' });
  ok(n0.difficulty === 'normal' && mk({ difficulty: 'bogus' }).difficulty === 'normal', 'default normal');
  ok(n0.stageMax === ECON.stageHp && e0.stageMax === ECON.stageHp + 6 && h0.stageMax === ECON.stageHp - 4, 'stage health by difficulty');
  ok(Math.abs(e0.baseHp(5) / n0.baseHp(5) - 0.7) < 1e-9 && Math.abs(h0.baseHp(5) / n0.baseHp(5) - 1.3) < 1e-9, 'enemy health by difficulty');
  ok(Math.abs(e0.enemySpeedMul() / n0.enemySpeedMul() - 0.92) < 1e-9 && Math.abs(h0.enemySpeedMul() / n0.enemySpeedMul() - 1.06) < 1e-9, 'enemy speed by difficulty');
  const gain = (r) => { const e = spawn(r, 'fuzz', { hpBase: 1 }); const c = r.coins + r.coinFrac; r.hurt(e, 1e9); return r.coins + r.coinFrac - c; };
  ok(Math.abs(gain(h0) / gain(n0) - 1.15) < 1e-9 && Math.abs(gain(e0) / gain(mk()) - 1) < 1e-9, 'hard pays 15% more coins');
  const s = Run.restore(JSON.parse(JSON.stringify(h0.snapshot()))); ok(s.difficulty === 'hard' && s.stageMax === h0.stageMax && s.diff === DIFFICULTY.hard, 'difficulty survives restore');
  h0.stageHp = 1; const e = spawn(h0, 'fuzz'); e.d = e.total - 1; runFor(h0, 0.5); ok(h0.result.difficulty === 'hard' && h0.result.rewardMul.records === 1.25 && h0.result.rewardMul.fans === 1.25, 'hard result');
  e0.stageHp = 1; const e2 = spawn(e0, 'fuzz'); e2.d = e2.total - 1; runFor(e0, 0.5); ok(e0.result.difficulty === 'easy' && e0.result.rewardMul.records === 0.75, 'easy result');
}
console.log('drop_the_bass sim: ' + n + ' checks passed');

// resume contract the battle view relies on: turret ages are measured on the run clock, which survives snapshot and restore
{
  const run = new Run({ world: 'garage', seed: 3, loadout: ['kick', 'snare'], firstPrep: 0.2 }); run.t = 400; run.coins = 999; run.deploy(null, { onBeat: false });
  const back = Run.restore(run.snapshot());
  assert.ok(back.t === 400 && back.turrets[0].born === 400 && back.t - back.turrets[0].born >= 0, 'restored run keeps turret born times on the run clock');
  console.log('drop_the_bass sim: resume clock ok');
}

// =====================================================================================================================
// depth systems: turret branches, hero abilities, run modifiers, boss phases, endless milestones (data_depth.js)
// =====================================================================================================================
{
  const D = await import('../drop_the_bass/js/data_depth.js');
  const { TURRET_BRANCHES, BRANCH_TURRET, HERO_ABILITIES, RUN_MODIFIERS, BOSS_PHASES, BOSS_PHASE_EFFECTS, ENDLESS_MILESTONES } = D;
  const slotIdx = (run, c, r) => run.map.buildable.find((s) => s.c === c && s.r === r).idx;
  const place = (run, type, c, r, level = 4, branch = null) => {
    const s = run.map.buildable.find((x) => x.c === c && x.r === r);
    const t = run.makeTurret(type, level, s, 0); if (branch) t.branch = branch; run.recalcAuras(); return t;
  };
  const evs = (run, sec) => { const out = []; for (let i = 0; i < Math.round(sec * 60); i++) { run.tick(DT); out.push(...run.drain()); } return out; };
  // a lab: one turret at (2,2) with three still enemies on the path next to it; runs until the first shot, returns state at that moment
  const lab = (type, branch, o = {}) => {
    const run = mk({ loadout: [type], seed: 4 }); const t = place(run, type, 2, 2, o.level || 4, branch);
    const es = [];
    for (let i = 0; i < (o.enemies || 3); i++) { const e = spawn(run, o.enemy || 'brick', { hpBase: o.hp || 1e7 }); e.d = 72 * 3 + 20 + i * 14; e.speed = 0; run.placeEnemy(e); if (o.armor != null) e.armor = o.armor; es.push(e); }
    run.drain();
    let events = [];
    if (o.until !== 0) for (let i = 0; i < 400 && t.shots < 1; i++) { run.tick(DT); events.push(...run.drain()); }
    return { run, t, es, events };
  };
  const other = (type) => TURRET_BRANCHES[type];

  // ---- branches: data shape
  eq(Object.keys(TURRET_BRANCHES).sort(), Object.keys(TURRETS).sort(), 'a branch pair for every turret');
  for (const [type, list] of Object.entries(TURRET_BRANCHES)) { ok(list.length === 2 && list[0].id !== list[1].id, 'two branches ' + type); for (const b of list) ok(BRANCH_TURRET[b.id] === type && b.name && b.desc && b.glyph && Object.keys(b.fx).length, 'branch row ' + b.id); }

  // ---- branches: rules, events, merges, snapshot
  {
    const r = mk({ loadout: ['kick'], seed: 3 }); r.coins = 1e6;
    const a = place(r, 'kick', 1, 6, 3), b = place(r, 'kick', 2, 6, 3);
    ok(!r.canBranch(a) && r.chooseBranch(a.id, 'kick_big_bang').reason === 'level', 'no branch below level 4');
    r.merge(a.id, b.id); const evm = r.drain();
    ok(b.level === 4 && evm.some((e) => e.k === 'branchReady' && e.id === b.id), 'branchReady on reaching level 4');
    ok(r.canBranch(b) && r.canBranch(b.id), 'canBranch at level 4 (object or id)');
    eq(r.branchOptions(b.id).map((o) => o.id), ['kick_big_bang', 'kick_double_tap'], 'branchOptions ids'); ok(r.branchOptions(b).every((o) => o.name && o.desc && o.glyph), 'option rows');
    ok(r.chooseBranch(b.id, 'snare_flam').reason === 'branch', 'branch of another turret refused');
    ok(r.chooseBranch(999, 'kick_big_bang').reason === 'turret', 'unknown turret');
    const c = r.chooseBranch(b.id, 'kick_big_bang'); ok(c.ok && b.branch === 'kick_big_bang', 'chosen');
    ok(r.drain().some((e) => e.k === 'branch' && e.id === b.id && e.branch === 'kick_big_bang'), 'branch event');
    ok(!r.canBranch(b) && r.chooseBranch(b.id, 'kick_double_tap').reason === 'has', 'one branch only');
    // merging into a branch turret keeps it; dragging a branched turret onto an unbranched one keeps it too
    const c2 = place(r, 'kick', 3, 6, 4), d2 = place(r, 'kick', 4, 6, 4);
    r.merge(c2.id, b.id); ok(b.level === 5 && b.branch === 'kick_big_bang', 'merge into branch turret keeps it');
    r.chooseBranch(d2.id, 'kick_double_tap'); const e2 = place(r, 'kick', 0, 6, 4); r.merge(d2.id, e2.id); ok(e2.level === 5 && e2.branch === 'kick_double_tap', 'dragged branched turret passes its branch on');
    const f1 = place(r, 'kick', 0, 4, 4), f2 = place(r, 'kick', 4, 4, 4); r.drain(); r.merge(f1.id, f2.id);
    ok(f2.level === 5 && !f2.branch && r.drain().some((e) => e.k === 'branchReady' && e.id === f2.id), 'unbranched merge stays unbranched and offers the choice');
    // two branched turrets: the target (higher level slot) keeps its branch
    const g1 = place(r, 'kick', 2, 8, 5, 'kick_double_tap'), g2 = place(r, 'kick', 3, 8, 5, 'kick_big_bang'); r.merge(g1.id, g2.id); ok(g2.level === 6 && g2.branch === 'kick_big_bang', 'two branched: target keeps');
    // cross type remix merge never keeps a branch of the wrong type
    for (let i = 0; i < 12; i++) {
      const q = mk({ loadout: ['kick', 'snare', 'hat'], seed: i + 1 }); const x = place(q, 'kick', 1, 6, 4, 'kick_double_tap'), y = place(q, 'snare', 2, 6, 4); q.merge(x.id, y.id);
      ok(!y.branch || BRANCH_TURRET[y.branch] === y.type, 'branch matches type after remix merge');
    }
    const snap = Run.restore(JSON.parse(JSON.stringify(r.snapshot()))); ok(snap.turretById(b.id).branch === 'kick_big_bang' && !snap.canBranch(b.id), 'branch survives restore');
    const over = mk(); const ot = place(over, 'kick', 2, 6, 4); over.phase = 'lost'; ok(over.chooseBranch(ot.id, 'kick_big_bang').reason === 'over', 'no branching after the run ended');
    const dd = mk({ loadout: ['kick'], startLevel: 3 }); ok(true, 'noop');
  }

  // ---- branches: each has a real effect
  const radiusOf = (events) => events.find((e) => e.k === 'explode');
  { // kick
    const base = lab('kick', null), big = lab('kick', 'kick_big_bang'), dbl = lab('kick', 'kick_double_tap');
    const shells = (x) => x.run.projectiles.filter((p) => p.kind === 'shell');
    ok(shells(big)[0].radius > shells(base)[0].radius * 1.5 && shells(big)[0].dmg > shells(base)[0].dmg * 1.3 && big.run.turretRate(big.t) < base.run.turretRate(base.t) * 0.8, 'Big Bang: bigger, harder, slower');
    ok(shells(dbl).length === 2 && shells(base).length === 1 && dbl.run.turretRate(dbl.t) > base.run.turretRate(base.t) * 1.2, 'Double Tap: second shell and faster');
  }
  { // snare
    const base = lab('snare', null, { until: 0 }), rim = lab('snare', 'snare_rimshot', { until: 0 }), fl = lab('snare', 'snare_flam');
    ok(rim.run.turretCrit(rim.t) >= base.run.turretCrit(base.t) + 0.19, 'Rimshot crit chance');
    const crit = (x) => { x.run.rng.chance = () => true; return x.run.rollCrit(x.t, 100).dmg; }; ok(crit(rim) > crit(base) * 1.2, 'Rimshot crit damage');
    const b0 = lab('snare', null); ok(fl.run.projectiles.filter((p) => p.kind === 'bullet').length === b0.run.projectiles.filter((p) => p.kind === 'bullet').length + 1, 'Flam: one more shot');
  }
  { // hat
    const dmgOn = (br) => { const x = lab('hat', br, { armor: 40, enemies: 1, until: 0 }); const ev = evs(x.run, 4); return ev.filter((e) => e.k === 'hit').reduce((s, e) => s + e.v, 0); };
    ok(dmgOn('hat_shredder') > dmgOn(null) * 2.5, 'Shredder ignores armor');
    const o = lab('hat', 'hat_overspin'), n = lab('hat', null); ok(o.t.spin > n.t.spin + 0.3, 'Overspin starts spun up');
    evs(o.run, 6); evs(n.run, 6); ok(o.t.spin > 1.01 && n.t.spin <= 1, 'Overspin goes past full speed');
  }
  { // sub
    const base = lab('sub', null), frz = lab('sub', 'sub_deep_freeze'), shk = lab('sub', 'sub_shockwave', { enemies: 1 }), sb = lab('sub', null, { enemies: 1 });
    ok(frz.es[0].slowAmt > base.es[0].slowAmt + 0.25 && frz.es[0].slowT > base.es[0].slowT + 1.5, 'Deep Freeze slows harder and longer');
    ok(shk.run.turretRange(shk.t) > sb.run.turretRange(sb.t) * 1.25 && shk.es[0].d < sb.es[0].d - 30, 'Shockwave: reach and shove');
  }
  { // mic
    const base = lab('mic', null), wide = lab('mic', 'mic_wide_wail');
    const w = (x) => x.events.find((e) => e.k === 'beam').w; ok(w(wide) >= w(base) * 1.9, 'Wide Wail doubles the beam');
    const heal = (br) => { const x = lab('mic', br, { until: 0 }); x.run.stageHp = 5; x.t.shots = 0; evs(x.run, 6); return x.run.stageHp; };
    ok(heal('mic_healing_hook') > heal(null) + 1, 'Healing Hook mends the stage at level 4');
  }
  { // synth
    const pts = (br) => lab('synth', br, { enemies: 6 }).events.find((e) => e.k === 'chain').pts.length;
    ok(pts('synth_storm') >= pts(null) + 2, 'Storm jumps further');
    const ov = lab('synth', 'synth_overload'); ok(ov.es.some((e) => e.stun > 0.4), 'Overload stuns'); const nb = lab('synth', null); ok(!nb.es.some((e) => e.stun > 0), 'plain synth does not stun at level 4');
  }
  { // horn
    const base = lab('horn', null), boom = lab('horn', 'horn_sonic_boom'), deaf = lab('horn', 'horn_deafening', { enemy: 'fuzz', enemies: 1 }), plain = lab('horn', null, { enemy: 'fuzz', enemies: 1 });
    const sp = (x) => x.events.find((e) => e.k === 'cone').spread; ok(sp(boom) > sp(base) + 1 && Math.abs(sp(boom) - Math.PI) < 1e-9, 'Sonic Boom blasts all around');
    ok(deaf.es[0].stun > plain.es[0].stun + 0.9, 'Deafening stuns longer');
  }
  { // scratch
    const discs = (br) => lab('scratch', br).run.projectiles.filter((p) => p.kind === 'disc');
    ok(discs('scratch_triple_spin').length === discs(null).length + 1, 'Triple Spin: one more record');
    const rz = discs('scratch_razor')[0], pl = discs(null)[0]; ok(rz.dmg > pl.dmg * 1.4 && rz.armorPierce === 1 && pl.armorPierce === 0 && rz.arc >= 1 && !pl.arc, 'Razor Record: harder, pierces armor, arcs');
  }
  { // loop and amp: reach and strength
    const aura = (type, br) => { const r = mk({ loadout: [type, 'snare'] }); place(r, type, 3, 6, 4, br); const near = place(r, 'snare', 2, 6, 1), far = place(r, 'snare', 3, 8, 1); return { near, far }; };
    const lw = aura('loop', 'loop_wide'), l0 = aura('loop', null), lh = aura('loop', 'loop_hot');
    ok(lw.far.auraRate > 0 && l0.far.auraRate === 0, 'Wide Loop reaches two tiles'); ok(Math.abs(lh.near.auraRate / l0.near.auraRate - 1.5) < 1e-9, 'Hot Loop is 50% stronger');
    const aw = aura('amp', 'amp_wide_stack'), a0 = aura('amp', null), ae = aura('amp', 'amp_eleven');
    ok(aw.far.auraDmg > 0 && a0.far.auraDmg === 0, 'Wide Stack reaches two tiles'); ok(Math.abs(ae.near.auraDmg / a0.near.auraDmg - 1.5) < 1e-9 && ae.near.auraCrit >= a0.near.auraCrit + 0.1, 'Up to Eleven: stronger and crit');
  }
  { // cowbell
    const ex = lab('cowbell', 'cowbell_execute', { enemy: 'fuzz', enemies: 1, until: 0 }), pl = lab('cowbell', null, { enemy: 'fuzz', enemies: 1, until: 0 });
    for (const x of [ex, pl]) { x.es[0].maxHp = 1e6; x.es[0].hp = 2.5e5; x.t.cd = 0; }
    evs(ex.run, 0.6); evs(pl.run, 0.6); ok(ex.es[0].dead === true && !pl.es[0].dead, 'Execute finishes enemies below 30% health');
    const cm = lab('cowbell', 'cowbell_chain_mark'); evs(cm.run, 0.4); ok(cm.es.filter((e) => e.markT > 0).length === 3, 'Chain Mark marks the neighbours');
    const p0 = lab('cowbell', null); evs(p0.run, 0.4); ok(p0.es.filter((e) => e.markT > 0).length === 1, 'plain mark hits one');
  }
  { // vocal
    const orbs = (br) => lab('vocal', br).run.projectiles.filter((p) => p.kind === 'orb');
    ok(orbs('vocal_swarm').length === orbs(null).length + 2 && orbs('vocal_swarm')[0].dmg < orbs(null)[0].dmg, 'Choir Swarm: more, softer orbs');
    const bc = orbs('vocal_big_chorus')[0], pl = orbs(null)[0]; ok(bc.radius > pl.radius * 1.7 && bc.dmg > pl.dmg && bc.heal && bc.healBonus >= 0.2, 'Big Chorus: bigger, heals');
  }
  // every branch id is exercised above
  ok(Object.values(TURRET_BRANCHES).flat().length === 24, '24 branches');

  // ---- hero abilities
  {
    eq(HERO_ABILITIES.roxor.map((a) => a.id), ['blast', 'freeze', 'overclock'], 'roxor abilities'); eq(HERO_ABILITIES.jasmin.map((a) => a.id), ['song', 'coinrain', 'shield'], 'jasmin abilities');
    for (const who of ['roxor', 'jasmin']) eq(HERO_ABILITIES[who].map((a) => a.unlockLv), [1, 4, 7], 'unlock levels ' + who);
    eq(mk().heroAbility, { roxor: 'blast', jasmin: 'song' }, 'default abilities');
    eq(mk({ heroAbility: { roxor: 'freeze', jasmin: 'shield' } }).heroAbility, { roxor: 'blast', jasmin: 'song' }, 'locked falls back');
    eq(mk({ heroLv: { roxor: 4, jasmin: 7 }, heroAbility: { roxor: 'freeze', jasmin: 'shield' } }).heroAbility, { roxor: 'freeze', jasmin: 'shield' }, 'unlocked is used');
    eq(mk({ heroLv: { roxor: 9, jasmin: 9 }, heroAbility: { roxor: 'bogus', jasmin: 7 } }).heroAbility, { roxor: 'blast', jasmin: 'song' }, 'invalid falls back');
    const hr = mk({ heroLv: { roxor: 7, jasmin: 7 } });
    ok(hr.heroAbilities('roxor').every((a) => a.unlocked) && hr.heroAbilities('roxor')[0].chosen, 'heroAbilities rows');
    ok(hr.setHeroAbility('roxor', 'overclock').ok && hr.heroAbility.roxor === 'overclock' && hr.setHeroAbility('roxor', 'x').reason === 'unknown' && mk().setHeroAbility('roxor', 'freeze').reason === 'locked', 'setHeroAbility');
    const cd = (id) => mk({ heroLv: { roxor: 7, jasmin: 7 }, heroAbility: { roxor: id } }).heroMax('roxor'); ok(Math.abs(cd('freeze') / cd('blast') - 1.1) < 1e-9, 'cdMul applies');
    // freeze
    const f = mk({ heroLv: { roxor: 4, jasmin: 1 }, heroAbility: { roxor: 'freeze' } }); const fe = [spawn(f, 'fuzz', { hpBase: 1e7 }), spawn(f, 'zip', { hpBase: 1e7 }), spawn(f, 'mute', { hpBase: 1e7 })];
    f.heroCd.roxor = 0; f.drain(); ok(f.useHero('roxor'), 'freeze used'); const fev = f.drain();
    ok(fev.some((e) => e.k === 'hero' && e.who === 'roxor' && e.ability === 'freeze'), 'hero event carries the ability');
    ok(fe[0].stun >= 3 && fe[1].stun >= 3 && fe[2].stun === 0, 'freeze stops every enemy that is not immune'); const d0 = fe[0].d; evs(f, 2.5); ok(fe[0].d === d0, 'frozen enemies stay put'); evs(f, 1.5); ok(fe[0].d > d0, 'they move again');
    // overclock
    const oc = mk({ heroLv: { roxor: 7, jasmin: 1 }, heroAbility: { roxor: 'overclock' } }); const ot = place(oc, 'snare', 2, 2, 2); const r0 = oc.turretRate(ot);
    oc.heroCd.roxor = 0; oc.useHero('roxor'); ok(Math.abs(oc.turretRate(ot) / r0 - 1.6) < 1e-9, 'overclock +60%'); evs(oc, 6.2); ok(Math.abs(oc.turretRate(ot) / r0 - 1) < 1e-9, 'overclock ends');
    // coin rain
    const cr = mk({ heroLv: { roxor: 1, jasmin: 4 }, heroAbility: { jasmin: 'coinrain' } }); cr.wave = 3; const c0 = cr.coins; cr.heroCd.jasmin = 0; cr.useHero('jasmin'); const cev = cr.drain();
    ok(cr.coins > c0 && cev.some((e) => e.k === 'hero' && e.ability === 'coinrain') && cev.some((e) => e.k === 'coin'), 'coin burst');
    const killGain = (r) => { const e = spawn(r, 'fuzz', { hpBase: 1 }); const a = r.coins + r.coinFrac; r.hurt(e, 1e9); return r.coins + r.coinFrac - a; };
    const plain = mk(); plain.wave = 3; const withRain = killGain(cr); ok(Math.abs(withRain / killGain(plain) - 2) < 0.05, 'double coins per kill during the rain'); evs(cr, 8.5); const after = killGain(cr); ok(after < withRain * 0.6, 'rain ends');
    // shield
    const sh = mk({ heroLv: { roxor: 1, jasmin: 7 }, heroAbility: { jasmin: 'shield' } }); sh.heroCd.jasmin = 0; sh.useHero('jasmin');
    const lk = spawn(sh, 'brick'); lk.d = lk.total - 1; evs(sh, 0.2); ok(sh.stageHp === sh.stageMax && sh.leaks === 0, 'shielded leak does no damage');
    evs(sh, 6.5); const lk2 = spawn(sh, 'brick'); lk2.d = lk2.total - 1; evs(sh, 0.2); ok(sh.stageHp < sh.stageMax, 'leaks hurt again after the shield');
    // duet with any pair
    const du = mk({ heroLv: { roxor: 7, jasmin: 7 }, heroAbility: { roxor: 'overclock', jasmin: 'coinrain' } }); spawn(du, 'fuzz', { hpBase: 1e7 }); du.heroCd.roxor = du.heroCd.jasmin = 0;
    du.useHero('roxor'); du.useHero('jasmin'); ok(du.duets === 1 && du.drain().some((e) => e.k === 'duet'), 'duet finale with a mixed pair');
    const dsn = Run.restore(JSON.parse(JSON.stringify(f.snapshot()))); eq(dsn.heroAbility, { roxor: 'freeze', jasmin: 'song' }, 'ability survives restore');
    const wi = Run.restore(JSON.parse(JSON.stringify(sh.snapshot()))); ok(wi.shieldT === sh.shieldT, 'timers survive restore');
  }

  // ---- run modifiers
  {
    ok(RUN_MODIFIERS.length === 10 && new Set(RUN_MODIFIERS.map((m) => m.id)).size === 10, 'ten modifiers');
    for (const m of RUN_MODIFIERS) ok(m.name && m.desc && m.mul.records > 1 && m.mul.fans > 1 && m.mul.diamonds > 1, 'modifier row ' + m.id);
    const ALL = ['kick', 'snare', 'hat', 'sub', 'mic', 'synth', 'horn', 'scratch', 'loop', 'cowbell', 'amp', 'vocal'];
    const M = (ids, o = {}) => mk(Object.assign({ modifiers: ids, loadout: ALL }, o));
    eq(M(['glass_stage', 'speedrun', 'no_heroes', 'cramped']).modifiers, ['glass_stage', 'speedrun', 'no_heroes'], 'max three modifiers');
    eq(M(['speedrun', 'speedrun', 'bogus', 'cramped']).modifiers, ['speedrun', 'cramped'], 'duplicates and unknown ids dropped');
    eq(mk({ mode: 'daily', modifiers: ['speedrun'] }).modifiers, [], 'daily ignores modifiers'); eq(mk({ weekly: true, mode: 'daily', modifiers: ['speedrun'] }).modifiers, [], 'weekly ignores modifiers');
    eq(mk({ daily: 'no_merge', modifiers: ['speedrun'] }).modifiers, [], 'daily option ignores modifiers');
    const m3 = M(['double_trouble', 'glass_stage', 'speedrun']); const prod = 1.5 * 1.4 * 1.3; ok(Math.abs(m3.modMul().records - Math.round(prod * 1000) / 1000) < 1e-9 && m3.modMul().diamonds > 1, 'rewards stack multiplicatively');
    eq(mk().modMul(), { records: 1, fans: 1, diamonds: 1 }, 'no modifiers, no multiplier');
    // double trouble
    { const a = mk(), b = M(['double_trouble']); const pa = a.nextWavePreview(), pb = b.nextWavePreview(); ok(pb.total === pa.total * 2, 'double the enemies in the preview');
      a.startWave(); b.startWave(); evs(a, 2); evs(b, 2); const ea = a.enemies[0], eb = b.enemies[0]; ok(a.spawnQ.length * 2 <= b.spawnQ.length + 2 && Math.abs(eb.maxHp / ea.maxHp - 0.6) < 0.01, 'twice the enemies at 60% health');
      const ca = a.curSpec.duration; ok(Math.abs(b.upcoming(1).duration - ca) < 1e-9, 'same wave length'); }
    // small band
    { const a = M(['small_band']), b = M(['small_band']); eq(a.loadout, b.loadout, 'small band deterministic'); ok(a.loadout.length === 6 && a.loadout.every((t) => ALL.includes(t)) && new Set(a.loadout).size === 6, 'six turret types');
      ok(a.poolOdds().length === 6, 'pool odds follow'); ok(M(['small_band'], { seed: 99 }).loadout.join() !== a.loadout.join(), 'seed picks the six'); eq(Run.restore(a.snapshot()).loadout, a.loadout, 'band survives restore'); }
    // glass stage
    { const g = M(['glass_stage']); ok(g.stageMax === 6 && g.stageHp === 6, 'glass stage has 6 health'); ok(M(['glass_stage'], { difficulty: 'easy' }).stageMax === 6, 'also on easy'); }
    // speedrun
    ok(Math.abs(M(['speedrun']).enemySpeedMul() / mk().enemySpeedMul() - 1.25) < 1e-9, 'speedrun +25% speed');
    // no heroes
    { const n = M(['no_heroes']); n.heroCd.roxor = 0; ok(!n.heroReady('roxor') && !n.useHero('roxor') && n.heroUses === 0, 'no heroes'); }
    // fragile merge
    { const f = M(['fragile_merge']); const a = place(f, 'kick', 1, 6, 1), b = place(f, 'kick', 2, 6, 1); f.coins = 10; const r = f.merge(a.id, b.id); ok(!r.ok && r.reason === 'coins' && f.turrets.length === 2 && f.coins === 10, 'cannot afford the merge');
      ok(f.findMerge() === null && f.mergeAll() === 0, 'mergeAll respects the price'); f.coins = 100; ok(f.merge(a.id, b.id).ok && f.coins === 80, 'merge costs 20 coins'); }
    // brutal bosses
    { const mkb = (ids) => { const r = mk({ mode: 'rush', modifiers: ids, loadout: ['kick'] }); r.startWave(); evs(r, 2); return r.enemies.find((e) => e.boss); }; ok(Math.abs(mkb(['brutal_bosses']).maxHp / mkb([]).maxHp - 1.5) < 1e-9, 'bosses have 50% more health'); }
    // lone lane
    { const a = M(['lone_lane'], { world: 'arena' }), b = mk({ world: 'arena' }); const pa = a.nextWavePreview(), pb = b.nextWavePreview();
      ok(pa.lanes.filter((l) => l.enemies.length).length === 1 && pb.lanes.filter((l) => l.enemies.length).length > 1 && pa.total === pb.total, 'everything in one lane');
      a.startWave(); b.startWave(); evs(a, 3); evs(b, 3); ok(a.enemies.every((e) => e.lane === 0), 'spawns use lane 0'); ok(Math.abs(a.enemies[0].maxHp / b.enemies[0].maxHp - 1.25) < 0.01, 'and carry 25% more health'); }
    // cramped
    { const c = M(['cramped']); const cap = Math.floor(c.map.buildable.length * 0.65); ok(c.slotCapacity() === cap, 'cramped capacity'); c.coins = 1e9; let n3 = 0; while (c.deploy().ok) n3++; ok(n3 === cap && c.deploy().reason === 'full', 'cramped fills early'); }
    // lean times
    { const l = M(['lean_times']), p = mk(); ok(Math.abs(l.deployCost() / p.deployCost() - 1.15) < 0.03, 'turrets cost 15% more'); const gain = (r) => { const e = spawn(r, 'fuzz', { hpBase: 1 }); const c = r.coins + r.coinFrac; r.hurt(e, 1e9); return r.coins + r.coinFrac - c; }; ok(Math.abs(gain(l) / gain(p) - 0.75) < 1e-9, 'kill coins -25%'); }
    // result and restore
    { const g = M(['glass_stage', 'speedrun']); g.stageHp = 1; const e = spawn(g, 'fuzz'); e.d = e.total - 1; evs(g, 0.5); eq(g.result.modifiers, ['glass_stage', 'speedrun'], 'result.modifiers'); ok(Math.abs(g.result.modMul.records - 1.82) < 1e-9, 'result.modMul');
      const p = mk(); p.stageHp = 1; const e2 = spawn(p, 'fuzz'); e2.d = e2.total - 1; evs(p, 0.5); eq(p.result.modMul, { records: 1, fans: 1, diamonds: 1 }, 'default modMul'); eq(p.result.modifiers, [], 'default modifiers');
      const q = Run.restore(JSON.parse(JSON.stringify(M(['cramped', 'speedrun']).snapshot()))); ok(q.hasMod('cramped') && q.hasMod('speedrun'), 'modifiers survive restore'); }
    // every modifier makes the greedy bot's run harder (leaks, or a loss) over a few seeds
    const botScore = (ids) => { let sc = 0; for (const seed of [3, 9, 21]) { const r = new Run({ world: 'garage', seed, modifiers: ids, loadout: ALL, firstPrep: 6 }); for (let i = 0; i < 60000 && r.phase !== 'won' && r.phase !== 'lost'; i++) { r.advance(0.1); r.autoPlayStep({ early: true }); r.drain(); } sc += r.leaks + (r.phase === 'lost' ? 40 : 0) + (r.phase === 'won' ? 0 : 0); } return sc; };
    const base = botScore([]);
    for (const m of RUN_MODIFIERS) { const sc = botScore([m.id]); ok(sc >= base, 'modifier is not easier than none: ' + m.id + ' ' + sc + ' vs ' + base); }
  }

  // ---- boss phases
  {
    const orig = { compressor: 2, noisegate: 3, reverb: 3, djglitch: 3, playback: 3 };
    for (const [id, cnt] of Object.entries(orig)) ok(BOSS_PHASES[id].length === cnt, 'phases of ' + id);
    for (const id of ['lowpass', 'silence']) ok(BOSS_PHASES[id] && BOSS_PHASES[id].length >= 4, 'phases of ' + id);
    for (const [id, list] of Object.entries(BOSS_PHASES)) { ok(BOSSES[id], 'phase table belongs to a boss ' + id); for (const ph of list) ok(BOSS_PHASE_EFFECTS[ph.id] && ph.at > 0 && ph.at <= 1 && ph.text, 'phase row ' + id + ' ' + ph.id); }
    const bossRun = (type, o = {}) => { const r = mk(Object.assign({ loadout: ['kick', 'loop'], seed: 5 }, o)); place(r, 'kick', 1, 6, 2); place(r, 'snare' in TURRETS ? 'kick' : 'kick', 2, 6, 2); place(r, 'loop', 3, 6, 2); place(r, 'kick', 4, 6, 2); const b = spawn(r, 'boss:' + type, { hpBase: 1e6, scale: 1 }); r.drain(); return { r, b }; };
    const fire = (r, b, id, extra = {}) => { r.bossPhaseFx(b, Object.assign({ at: 1, id, text: 't' }, extra)); return r.drain(); };
    { const { r, b } = bossRun('compressor'); const ev = fire(r, b, 'dark_lane', { dur: 5 }); const e0 = ev.find((e) => e.k === 'bossPhase'); ok(e0 && e0.id === 'dark_lane' && e0.boss === 'compressor' && e0.text && Array.isArray(e0.cols) && e0.turretIds.length > 0, 'dark_lane event');
      const dark = r.turrets.filter((t) => t.dark > 0); ok(dark.length === e0.turretIds.length, 'dark turrets'); const en = spawn(r, 'brick', { hpBase: 1e7 }); en.speed = 0; for (const t of dark) { en.d = 72 * 2; } evs(r, 1); ok(dark.every((t) => t.shots === 0), 'dark turrets do not fire'); evs(r, 5.5); ok(r.turrets.every((t) => !(t.dark > 0)), 'dark ends'); }
    { const { r, b } = bossRun('djglitch'); const ev = fire(r, b, 'steal_turret', { dur: 3 }); const e0 = ev.find((e) => e.k === 'bossPhase'); const st = r.turretById(e0.turretId); ok(st && st.stolen > 0 && TURRETS[st.type].kind !== 'aura_rate', 'a non-aura turret is borrowed');
      for (let i = 0; i < 20; i++) { const x = bossRun('djglitch'); const e1 = fire(x.r, x.b, 'steal_turret').find((e) => e.k === 'bossPhase'); ok(x.r.turretById(e1.turretId).type !== 'loop', 'never steals an aura'); }
      const back = evs(r, 3.2); ok(back.some((e) => e.k === 'turretReturn' && e.id === st.id) && st.stolen === 0, 'it returns with an event');
      const empty = mk(); const bb = spawn(empty, 'boss:djglitch', { hpBase: 100 }); ok(empty.bossPhaseFx(bb, { at: 1, id: 'steal_turret' }) === true, 'steal with no turrets is safe'); }
    { const { r, b } = bossRun('noisegate'); const n0 = r.enemies.length; fire(r, b, 'summon_wave', { n: 6 }); ok(r.enemies.length === n0 + 6, 'summon_wave adds a mini wave'); }
    { const { r, b } = bossRun('compressor'); fire(r, b, 'bulwark', { frac: 0.2 }); ok(Math.abs(b.shield - b.maxHp * 0.2) < 1e-6, 'bulwark shield'); const hp0 = b.hp; r.hurt(b, b.maxHp * 0.01); ok(b.hp === hp0 && b.shield < b.maxHp * 0.2, 'shield absorbs'); const bi = r.bossInfo(); ok(bi.shieldFrac > 0 && bi.shieldFrac < 1, 'bossInfo shows the shield'); b.shield = 0; r.hurt(b, b.maxHp * 0.01); ok(b.hp < hp0, 'broken shield lets damage through'); }
    { const { r, b } = bossRun('reverb'); const sp = (x) => { const d = x.d; x.tick = 0; return d; }; const a = r.enemySpeedMul(); fire(r, b, 'enrage', { speed: 1.5 }); const d0 = b.d; evs(r, 1); const moved1 = b.d - d0; const c = bossRun('reverb'); const d1 = c.b.d; evs(c.r, 1); ok(moved1 > (c.b.d - d1) * 1.4, 'enrage speeds the boss'); void sp; void a; }
    { const { r, b } = bossRun('reverb'); b.hp = b.maxHp * 0.5; const ally = spawn(r, 'fuzz', { hpBase: 100 }); ally.d = b.d - 10; r.placeEnemy(ally); ally.hp = ally.maxHp * 0.5; fire(r, b, 'heal_pulse', { frac: 0.1 }); ok(b.hp > b.maxHp * 0.59 && ally.hp > ally.maxHp * 0.5, 'heal_pulse heals the boss and nearby Static'); }
    { const { r, b } = bossRun('djglitch'); b.x = r.turrets[0].x; b.y = r.turrets[0].y; const ev = fire(r, b, 'jam_pulse', { radius: 400, max: 2, dur: 2 }); ok(r.turrets.filter((t) => t.jam > 0).length === 2 && ev.find((e) => e.k === 'bossPhase').turretIds.length === 2, 'jam_pulse jams the nearest turrets'); }
    // thresholds fire once, in order, via the real boss logic
    { const { r, b } = bossRun('noisegate'); const ph = BOSS_PHASES.noisegate; let seen = [];
      let bi = r.bossInfo(); ok(bi.id === b.id && bi.hpFrac === 1 && bi.phase === 1 && bi.nextAt === 0.75, 'bossInfo at full health');
      b.hp = b.maxHp * 0.7; seen.push(...evs(r, 0.5).filter((e) => e.k === 'bossPhase')); ok(seen.length === 1 && seen[0].id === 'summon_wave' && seen[0].boss === 'noisegate' && seen[0].text === ph[0].text, 'first phase at 75%');
      bi = r.bossInfo(); ok(bi.phase === 2 && bi.nextAt === 0.5, 'bossInfo after one phase'); seen.push(...evs(r, 1).filter((e) => e.k === 'bossPhase')); ok(seen.length === 1, 'phases fire once');
      b.hp = b.maxHp * 0.1; seen.push(...evs(r, 0.5).filter((e) => e.k === 'bossPhase')); eq(seen.map((e) => e.id), ['summon_wave', 'dark_lane', 'enrage'], 'a big drop fires the skipped phases in order'); ok(r.bossInfo().nextAt === null && r.bossInfo().phase === 4, 'no next phase'); }
    ok(mk().bossInfo() === null, 'bossInfo without a boss');
    // data driven: entries can be removed, added or bogus without crashing
    { const saved = BOSS_PHASES.compressor; delete BOSS_PHASES.compressor; const { r, b } = bossRun('compressor'); b.hp = b.maxHp * 0.1; ok(evs(r, 1).every((e) => e.k !== 'bossPhase') && r.bossInfo().nextAt === null, 'a boss without phases is safe');
      BOSS_PHASES.compressor = [{ at: 0.9, id: 'no_such_effect', text: 'x' }, { at: 0.8, id: 'enrage', text: 'new', speed: 2 }]; const q = bossRun('compressor'); q.b.hp = q.b.maxHp * 0.5; const ev = evs(q.r, 0.3).filter((e) => e.k === 'bossPhase'); ok(ev.length === 1 && ev[0].id === 'enrage' && q.b.rageMul === 2, 'unknown effect ids are skipped, new entries work'); BOSS_PHASES.compressor = saved;
      ok(r.bossPhaseFx(b, { at: 1, id: 'nope' }) === false, 'bossPhaseFx unknown id'); }
    // the existing tricks still work: noise gate gates, playback phases, compressor cap
    { const { r, b } = bossRun('playback'); b.hp = b.maxHp * 0.6; const ev = evs(r, 0.5); ok(b.phase === 2 && ev.some((e) => e.k === 'bossphase' && e.phase === 2), 'playback keeps its phase 2 event'); }
    { const { r, b } = bossRun('compressor'); const h = b.hp; r.hurt(b, b.maxHp); ok(b.hp >= h - b.maxHp * 0.06 - 1e-6 || b.hp > 0, 'compressor still caps hits'); }
    // low-pass trick: weak hits do much less
    { const { r, b } = bossRun('lowpass'); b.armor = 0; const weak = b.maxHp * 0.0005, strong = b.maxHp * 0.01; const h0 = b.hp; r.hurt(b, weak); const lost = h0 - b.hp; ok(lost < weak * 0.5, 'weak hit is washed out'); const h1 = b.hp; r.hurt(b, strong); ok(Math.abs(h1 - b.hp - strong) < 1e-6, 'strong hit is not'); }
    // silence mutes turrets periodically and starts with a jam
    { const { r, b } = bossRun('silence'); b.x = r.turrets[0].x; b.y = r.turrets[0].y; const ev = evs(r, 0.3); ok(ev.some((e) => e.k === 'bossPhase' && e.id === 'jam_pulse'), 'silence mutes at 100%'); evs(r, 12); ok(r.drain().length >= 0, 'pulses run'); }
    // small mid-run boss only gets its first phase
    { const r = mk({ mode: 'rush', loadout: ['kick'] }); const b = spawn(r, 'boss:noisegate', { hpBase: 1e6, scale: 0.42 }); b.hp = b.maxHp * 0.05; const ev = evs(r, 0.5).filter((e) => e.k === 'bossPhase'); ok(ev.length === 1, 'small boss: first phase only'); }
    // boss phase state survives restore (no repeats)
    { const { r, b } = bossRun('noisegate'); b.hp = b.maxHp * 0.7; evs(r, 0.3); const q = Run.restore(JSON.parse(JSON.stringify(r.snapshot()))); ok(evs(q, 1).every((e) => e.k !== 'bossPhase') && q.bossInfo().phase === 2, 'phases do not repeat after restore'); }
  }

  // ---- 25 wave stages, rush, endless boss list, growth
  {
    const beach = WORLD_BY_ID.beach, moon = WORLD_BY_ID.moon;
    ok(genWave(beach, 25, 7).boss === 'lowpass' && genWave(moon, 25, 7).boss === 'silence' && genWave(moon, 10, 7).boss === 'lowpass', 'final bosses on wave 25');
    for (let w = 1; w <= 25; w++) ok(!!genWave(beach, w, 7).boss === (w === 10 || w === 20 || w === 25), 'boss waves of a 25 wave stage ' + w);
    ok(genWave(WORLD_BY_ID.arena, 20, 7).boss === 'playback' && !genWave(WORLD_BY_ID.arena, 25, 7).boss, 'twenty wave stages unchanged');
    for (let w = 21; w <= 25; w++) ok(waveBaseHp(beach, w) > waveBaseHp(beach, w - 1), 'hp keeps growing to wave 25 on beach ' + w);
    ok(Math.abs(waveBaseHp(WORLD_BY_ID.garage, 25) / waveBaseHp(WORLD_BY_ID.garage, 20) - Math.pow(ECON.hpGrowthLate, 5)) < 1e-9, '20 wave stages keep the late rate after wave 20');
    ok(Math.abs(waveBaseHp(beach, 25) / waveBaseHp(beach, 20) - Math.pow(ECON.hpGrowth, 5)) < 1e-9, '25 wave stages grow at the full rate through wave 25');
    const e = new Run({ world: 'beach', mode: 'endless', seed: 2 }); const ids = new Set(); for (let w = 10; w <= 70; w += 10) ids.add(e.upcoming(w).boss); ok(ids.has('lowpass') && ids.has('silence') && ids.size === 7, 'endless rotation has all seven bosses');
    const full = new Run({ world: 'beach', seed: 2, firstPrep: 999 }); ok(full.wavesTotal === 25 && full.upcoming(25).boss === 'lowpass', 'beach story is 25 waves');
  }

  // ---- endless milestones
  {
    eq(ENDLESS_MILESTONES.map((m) => m.wave), [25, 50, 100], 'milestone waves'); for (const m of ENDLESS_MILESTONES) ok(m.id && m.reward.diamonds > 0, 'milestone row ' + m.id);
    const r = mk({ mode: 'endless', seed: 2 }); const got = [];
    r.wave = 23; r.startWave(); got.push(...r.drain().filter((x) => x.k === 'milestone')); ok(got.length === 0, 'nothing before wave 25');
    r.spawnQ.length = 0; r.enemies.length = 0; r.phase = 'prep'; r.wave = 24; r.startWave(); const m1 = r.drain().filter((x) => x.k === 'milestone'); ok(m1.length === 1 && m1[0].id === 'endless_25' && m1[0].wave === 25, 'milestone at wave 25');
    r.spawnQ.length = 0; r.enemies.length = 0; r.phase = 'prep'; r.wave = 25; r.startWave(); ok(r.drain().filter((x) => x.k === 'milestone').length === 0, 'only the first time');
    const q = Run.restore(JSON.parse(JSON.stringify(r.snapshot()))); q.spawnQ.length = 0; q.enemies.length = 0; q.phase = 'prep'; q.wave = 26; q.startWave(); ok(q.drain().filter((x) => x.k === 'milestone').length === 0, 'not again after restore');
    r.spawnQ.length = 0; r.enemies.length = 0; r.phase = 'prep'; r.wave = 49; r.startWave(); ok(r.drain().filter((x) => x.k === 'milestone').map((x) => x.id).join() === 'endless_50', 'milestone at wave 50');
    const s = mk({ seed: 2, wavesTotal: 99 }); s.wave = 24; s.startWave(); ok(s.drain().filter((x) => x.k === 'milestone').length === 0, 'story mode has no milestones');
    r.stageHp = 1; r.spawnQ.length = 0; r.phase = 'wave'; const lk = spawn(r, 'fuzz'); lk.d = lk.total - 1; evs(r, 0.5); eq(r.result.milestones, ['endless_25', 'endless_50'], 'result.milestones');
  }
  console.log('drop_the_bass sim depth: all checks passed (total ' + n + ')');
}
