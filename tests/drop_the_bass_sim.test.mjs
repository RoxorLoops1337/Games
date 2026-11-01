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
// ---- boss rush
{
  const r = new Run({ world: 'garage', mode: 'rush', seed: 3, firstPrep: 0.1 });
  ok(r.wavesTotal === 10, 'rush is ten waves'); const ids = []; for (let w = 1; w <= 10; w++) ids.push(r.upcoming(w).boss);
  ok(new Set(ids).size === 5 && ids.every(Boolean), 'rush has a boss every wave, all five kinds');
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
  r.move(sb.id, slotAt(r, 3, 2)); ok(r.synergiesOf(k).length === 1, 'returns when it comes back');
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
