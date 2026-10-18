import assert from 'node:assert/strict';
import * as B from '../midnight_mog/js/sim/battle.js';
import * as FX from '../midnight_mog/js/sim/effects.js';
import { newProfile } from '../midnight_mog/js/sim/profile.js';
import { CATS } from '../midnight_mog/js/data/cats.js';
import { ENEMIES } from '../midnight_mog/js/data/enemies.js';
import { CARDS } from '../midnight_mog/js/data/cards.js';

const t0 = Date.now();
const TICKS = (s) => Math.round(s * 30);

function hashStr(h, s) { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }

// A simple scripted player: spend energy on the first affordable summon card, trying tiles column by column.
function bot(b) {
  for (let h = 0; h < b.hand.length; h++) {
    const id = b.hand[h];
    if (!id.startsWith('call_') || !B.canPlay(b, h)) continue;
    for (let col = 1; col <= 4; col++) for (let lane = 0; lane < b.lanes; lane++) {
      if (B.playCard(b, h, { x: col, y: lane }).ok) return true;
    }
    return false;
  }
  return false;
}

function runBattle(opts, maxSeconds = 400, driver = bot) {
  const b = B.createBattle(opts);
  let hash = 2166136261;
  for (let i = 0; i < TICKS(maxSeconds) && !b.over; i++) {
    driver(b);
    B.step(b, 1 / 30);
    for (const ev of B.drainEvents(b)) hash = hashStr(hash, JSON.stringify(ev));
  }
  return { b, hash };
}

function assertFinite(b) {
  for (const arr of [b.units, b.enemies]) {
    for (const u of arr) {
      assert.ok(Number.isFinite(u.x) && Number.isFinite(u.y), 'position finite for ' + u.id);
      assert.ok(Number.isFinite(u.hp), 'hp finite for ' + u.id);
    }
  }
  assert.ok(Number.isFinite(b.energy) && Number.isFinite(b.base.hp));
}

// ---------------------------------------------------------------- 1. stage 1 is winnable by a simple scripted player
{
  const p = newProfile(5);
  const snapshot = JSON.stringify(p);
  const { b } = runBattle({ seed: 7, district: null, stage: 1, profile: p });
  assert.equal(b.over, 'win', 'scripted player wins stage 1');
  const r = B.battleResult(b);
  assert.equal(r.won, true);
  assert.equal(r.wave, r.waves);
  assert.ok(r.seconds > 20 && r.seconds < 200, 'battle length ' + r.seconds);
  assert.ok(r.rewards.some((x) => x.kind === 'fish' && x.amount > 0));
  assert.ok(r.profile.cur.fish > p.cur.fish && r.profile.stats.battlesWon === 1 && r.profile.stats.kills === r.kills);
  assert.ok(r.profile.stats.summons > 0 && r.profile.stats.cardsPlayed > 0);
  assert.equal(r.profile.progress.stage, 2, 'frontier advanced');
  assert.equal(JSON.stringify(p), snapshot, 'input profile untouched');
  assert.equal(B.battleResult(b), r, 'result is cached and stable');
  // a lost or running battle pays nothing
  const live = B.createBattle({ seed: 1, district: null, stage: 1, profile: p });
  assert.equal(B.battleResult(live).won, false);
  assert.equal(B.battleResult(live).rewards.length, 0);
  // step after over is a no op
  const t = b.t; B.step(b, 1 / 30); assert.equal(b.t, t);
}

// ---------------------------------------------------------------- 2. lose when nobody defends
{
  const { b } = runBattle({ seed: 3, district: null, stage: 4, profile: newProfile(3) }, 300, () => {});
  assert.equal(b.over, 'lose');
  const r = B.battleResult(b);
  assert.equal(r.won, false);
  assert.equal(r.rewards.length, 0);
  assert.ok(b.base.hp <= 0);
  assert.equal(r.profile.progress.stage, 1);
}

// ---------------------------------------------------------------- 3. determinism
{
  const mk = (seed) => runBattle({ seed, district: null, stage: 3, profile: newProfile(9) }, 200);
  const a = mk(11), c = mk(11), d = mk(12);
  assert.equal(a.hash, c.hash, 'same seed and inputs give the same event stream');
  assert.equal(a.b.t, c.b.t);
  assert.notEqual(a.hash, d.hash, 'a different seed differs');
  // the bot is part of the input: a different play sequence differs too
  const e = runBattle({ seed: 11, district: null, stage: 3, profile: newProfile(9) }, 200, (b) => { if (b.tick % 90 === 0) bot(b); });
  assert.notEqual(a.hash, e.hash);
}

// ---------------------------------------------------------------- 4. refused plays change nothing
{
  const b = B.createBattle({ seed: 2, district: null, stage: 1, profile: newProfile(2) });
  const hand = b.hand.slice(), energy = b.energy;
  assert.equal(B.playCard(b, 99, { x: 1, y: 0 }).reason, 'bad_index');
  assert.equal(B.playCard(b, 0, null).ok, false);
  b.energy = 0;
  const si = b.hand.findIndex((id) => id.startsWith('call_'));
  assert.equal(B.playCard(b, si, { x: 1, y: 0 }).reason, 'energy');
  assert.deepEqual(b.hand, hand);
  b.energy = energy;
  assert.ok(B.playCard(b, si, { x: 2, y: 2 }).ok);
  const si2 = b.hand.findIndex((id) => id.startsWith('call_'));
  b.energy = 10;
  assert.equal(B.playCard(b, si2, { x: 2, y: 2 }).reason, 'occupied');
  assert.equal(b.hand.length, 5, 'hand refilled after a play');
  const total = b.hand.length + b.draw.length + b.discard.length;
  assert.equal(total, 12);
}

// ---------------------------------------------------------------- 5. merging
{
  const b = B.createBattle({ seed: 4, district: null, stage: 1, profile: newProfile(4), noEcho: true });
  const a = B.placeCat(b, 'scrap_tabby', 3, 2);
  assert.ok(a);
  const hp1 = FX.computeStat(b, a, 'hp');
  assert.equal(B.placeCat(b, 'scrap_tabby', 3, 3), null, 'adjacent twin merges');
  assert.equal(a.merged, 1);
  assert.ok(FX.computeStat(b, a, 'hp') > hp1 && FX.computeStat(b, a, 'dmg') > 14);
  const far = B.placeCat(b, 'scrap_tabby', 6, 0);
  assert.ok(far && far.merged === 0, 'distant twin does not merge');
  const other = B.placeCat(b, 'whisker_scout', 3, 1);
  assert.ok(other, 'different cat does not merge');
  // chain: a is merged 1; two more twins build another merged 1 next to it, then they merge into stars 2
  B.placeCat(b, 'scrap_tabby', 4, 1);
  assert.ok(b.units.find((u) => u.id === 'scrap_tabby' && u.x === 4));
  const ev = B.drainEvents(b).filter((e) => e.type === 'merge');
  assert.ok(ev.length >= 1 && ev[0].uid === a.uid);
  assert.ok(b.stats.merges >= 1);
}

// ---------------------------------------------------------------- 6. echo stage fast path
{
  const p = newProfile(6);
  p.progress = { district: 1, stage: 25, best: {}, echo: 20 };
  assert.equal(B.isEchoStage(p, null, 5), true);
  assert.equal(B.isEchoStage(p, null, 25), false);
  const r = B.resolveEcho(p, { district: null, stage: 5, noAdvance: true });
  assert.equal(r.won, true); assert.equal(r.echo, true); assert.equal(r.seconds, 20);
  assert.ok(r.totals.fish > 0 && r.profile.cur.fish > p.cur.fish);
  const b = B.createBattle({ seed: 1, district: null, stage: 5, profile: p, noAdvance: true });
  assert.equal(b.echo, true);
  let n = 0; while (!b.over && n < 3000) { B.step(b, 1 / 30); n++; }
  assert.equal(b.over, 'win'); assert.ok(n >= 590 && n <= 610, 'echo takes 20 seconds, took ' + n);
  assert.equal(b.enemies.length + b.units.length, 0, 'nothing was simulated');
  assert.equal(B.battleResult(b).echo, true);
  assert.equal(B.battleResult(b).gems, undefined);
  const real = B.createBattle({ seed: 1, district: null, stage: 5, profile: p, noEcho: true });
  assert.equal(real.echo, false);
}

// ---------------------------------------------------------------- 7. boss stage: phases, summons, escort, crate key
{
  const p = newProfile(8);
  const b = B.createBattle({ seed: 5, district: 'rooftop_row', stage: 10, profile: p, noEcho: true });
  assert.equal(b.waves, 7, 'six normal waves plus the boss wave');
  assert.equal(b.info.isBoss, true);
  for (const [c, x, y] of [['ember_mog', 2, 1], ['whisker_scout', 2, 3], ['biscuit_bruiser', 1, 2], ['nyx_longshot', 3, 2], ['tin_can_tom', 1, 0]]) B.placeCat(b, c, x, y, { level: 20 });
  let boss = null, phases = 0, kills = 0;
  for (let i = 0; i < TICKS(500) && !b.over; i++) {
    B.step(b, 1 / 30);
    for (const ev of B.drainEvents(b)) { if (ev.type === 'wave' && ev.boss !== undefined && typeof ev.boss === 'number') phases++; }
    if (!boss) boss = b.enemies.find((e) => e.boss);
    if (boss && boss.dead) for (const e of b.enemies) FX.killUnit(b, e, null, { silent: true, force: true }); // wipe the escort
    if (b.tick % 15 === 0 && !(boss && boss.dead)) { /* keep the cats healthy so the phases play out */ for (const u of b.units) u.hp = u.maxHp; b.base.hp = b.base.maxHp; }
  }
  assert.ok(boss, 'boss spawned');
  assert.equal(b.over, 'win');
  assert.ok(phases >= 2, 'boss phases announced: ' + phases);
  assert.equal(B.battleResult(b).bossKills, 1);
  assert.ok(B.battleResult(b).boss);
  assert.ok(B.battleResult(b).rewards.some((r) => r.kind === 'gems'));
  assert.ok(B.battleResult(b).rewards.some((r) => r.kind === 'key'), 'boss first clear drops a crate key');
  assert.ok(Object.keys(B.battleResult(b).profile.town.keys).length > 0);
  void kills;
}

// ---------------------------------------------------------------- 8. traits behave
{
  const mk = (stage = 30) => B.createBattle({ seed: 21, district: null, stage, profile: newProfile(21), noEcho: true });
  // armored takes less; flying ignores melee cats; splitter splits
  let b = mk();
  const armored = B.spawnEnemy(b, 'sewer_gator', 2, 5);
  const plain = B.spawnEnemy(b, 'sludge_glob', 2, 5);
  const ha = armored.hp, hp = plain.hp;
  FX.damageUnit(b, null, armored, 100, { noCrit: true }); FX.damageUnit(b, null, plain, 100, { noCrit: true });
  assert.ok(ha - armored.hp < 100 && ha - armored.hp > 0);
  void hp;
  b = mk();
  const bird = B.spawnEnemy(b, 'pigeon_bomber', 1, 3);
  const melee = B.placeCat(b, 'scrap_tabby', 3, 1);
  for (let i = 0; i < 60; i++) B.step(b);
  assert.equal(FX.canHit(b, melee, bird, 'hit'), false, 'melee cannot hit flying');
  b = mk();
  const blob = B.spawnEnemy(b, 'sludge_blob', 2, 5);
  FX.damageUnit(b, null, blob, blob.maxHp * 5, { noCrit: true });
  B.step(b);
  assert.equal(b.enemies.filter((e) => e.id === 'sludge_glob').length, 2, 'splitter splits into two');
  // enemies stop at the first cat of their lane and attack it, cats in other lanes are not touched
  b = mk(1);
  const cat = B.placeCat(b, 'tin_can_tom', 4, 1);
  const bystander = B.placeCat(b, 'tin_can_tom', 4, 3);
  const rat = B.spawnEnemy(b, 'dumpster_raccoon', 1, 9);
  for (let i = 0; i < TICKS(14); i++) B.step(b);
  assert.ok(rat.x >= 4.9 || rat.dead, 'enemy stopped in front of the cat, x=' + rat.x);
  assert.equal(bystander.hp, bystander.maxHp);
  assert.ok(cat.hp < cat.maxHp || rat.dead);
  // barricade blocks melee, a flyer goes over
  b = mk();
  B.placeCat(b, 'tin_can_tom', 2, 2);
  b.hand = b.deck.hand = ['cardboard_fort']; b.energy = 10;
  assert.ok(B.playCard(b, 0, { x: 5, y: 2 }).ok);
  const walker = B.spawnEnemy(b, 'sewer_gator', 2, 9);
  const flyer = B.spawnEnemy(b, 'red_dot_drone', 2, 9);
  for (let i = 0; i < TICKS(8); i++) B.step(b);
  assert.ok(walker.dead || walker.x >= 5.9, 'walker held at the barricade, x=' + walker.x);
  assert.ok(flyer.x < 5 || flyer.dead, 'flyer passed over the barricade, x=' + flyer.x);
  // healer heals, burrower burrows and emerges, summoner summons
  b = mk();
  const med = B.spawnEnemy(b, 'microwave_medic', 0, 8);
  const hurt = B.spawnEnemy(b, 'arcade_clanker', 0, 8);
  hurt.hp = hurt.maxHp * 0.3;
  const hh = hurt.hp;
  for (let i = 0; i < TICKS(8); i++) B.step(b);
  assert.ok(hurt.hp > hh, 'healer healed');
  void med;
  b = mk();
  B.placeCat(b, 'tin_can_tom', 2, 2);
  const mole = B.spawnEnemy(b, 'mud_mole', 2, 9);
  let burrowed = 0, emerged = 0;
  for (let i = 0; i < TICKS(30); i++) { B.step(b); for (const ev of B.drainEvents(b)) { if (ev.type === 'burrow') burrowed++; if (ev.type === 'emerge') emerged++; } }
  assert.ok(burrowed >= 1 && emerged >= 1, 'burrower cycle ' + burrowed + '/' + emerged);
  void mole;
  b = mk();
  const king = B.spawnEnemy(b, 'king_coo', 2, 9);
  for (let i = 0; i < TICKS(12); i++) B.step(b);
  assert.ok(b.enemies.filter((e) => e.id === 'pigeon_scout').length >= 4, 'summoner summoned');
  void king;
  // shielded has a shield, explosive blows up on contact
  b = mk();
  const sh = B.spawnEnemy(b, 'strobe_sentry', 1, 6);
  assert.ok(sh.statuses.some((s) => s.type === 'shield' && s.amount > 0));
  const tom = B.placeCat(b, 'tin_can_tom', 3, 3);
  const bomber = B.spawnEnemy(b, 'pigeon_bomber', 3, 5);
  const thp = tom.hp;
  for (let i = 0; i < TICKS(10); i++) B.step(b);
  assert.ok(bomber.dead && tom.hp < thp, 'bomber exploded on contact');
}

// ---------------------------------------------------------------- 9. endless mode: elite affixes and scaling
{
  const p = newProfile(31);
  const b = B.createBattle({ seed: 31, district: null, stage: 70, profile: p, noEcho: true });
  assert.ok(b.info.endless);
  let elites = 0;
  for (let i = 0; i < 60 * 30; i++) { B.step(b); B.drainEvents(b); for (const e of b.enemies) if (e.elite) elites++; }
  assertFinite(b);
  assert.ok(b.wave >= 1);
  void elites;
}

// ---------------------------------------------------------------- 10. every cat, every enemy, every card without throwing
{
  const prof = newProfile(41);
  let casts = 0;
  for (const cat of CATS) {
    const b = B.createBattle({ seed: 41, district: null, stage: 12, profile: prof, noEcho: true });
    const u = B.placeCat(b, cat.id, 2, 2, { level: 5 });
    B.placeCat(b, 'tin_can_tom', 3, 2);
    B.spawnEnemy(b, 'dumpster_raccoon', 2, 6); B.spawnEnemy(b, 'rat_courier', 1, 7); B.spawnEnemy(b, 'pigeon_scout', 3, 8);
    u.hp = u.maxHp * 0.5;
    for (let i = 0; i < TICKS(25); i++) { B.step(b); for (const ev of B.drainEvents(b)) if (ev.type === 'cast' && ev.src === u.uid) casts++; if (i === 200) FX.castAbility(b, u, {}); }
    assertFinite(b);
  }
  assert.ok(casts >= CATS.length * 0.5, 'abilities fire on their own: ' + casts);
  for (const en of ENEMIES) {
    const b = B.createBattle({ seed: 42, district: null, stage: 25, profile: prof, noEcho: true });
    for (const [c, x, y] of [['tin_can_tom', 2, 2], ['whisker_scout', 1, 2], ['spark_kit', 1, 1], ['nurse_purrnell', 1, 3]]) B.placeCat(b, c, x, y, { level: 8 });
    const e = B.spawnEnemy(b, en.id, 2, 7);
    if (en.boss) { e.hp = e.maxHp * 0.2; FX.checkPhases(b, e); }
    for (let i = 0; i < TICKS(20); i++) { B.step(b); B.drainEvents(b); }
    assertFinite(b);
  }
  for (const card of CARDS) {
    const b = B.createBattle({ seed: 43, district: null, stage: 25, profile: prof, noEcho: true, deck: [card.id, card.id, card.id, card.id, card.id, card.id] });
    B.placeCat(b, 'tin_can_tom', 3, 2); B.placeCat(b, 'whisker_scout', 2, 2);
    B.spawnEnemy(b, 'dumpster_raccoon', 2, 6); B.spawnEnemy(b, 'pigeon_scout', 2, 7); B.spawnEnemy(b, 'rat_courier', 1, 8);
    for (let i = 0; i < 30; i++) B.step(b);
    b.energy = 10;
    const r = B.playCard(b, 0, { x: 4, y: 2 });
    assert.ok(r.ok, 'card ' + card.id + ' playable: ' + r.reason);
    for (let i = 0; i < 60; i++) { B.step(b); B.drainEvents(b); }
    assertFinite(b);
  }
}

// ---------------------------------------------------------------- 10b. relics, town hooks, relic triggers
{
  const plain = B.createBattle({ seed: 71, district: null, stage: 1, profile: newProfile(71) });
  const p = newProfile(71);
  p.relics = { rusty_bell: true, tin_whistle: true, warm_sock: true };
  p.town.plots[1] = { b: 'vet_clinic', level: 10, t: 0 };
  const b = B.createBattle({ seed: 71, district: null, stage: 1, profile: p });
  assert.equal(b.energy, plain.energy + 1, 'rusty bell: +1 start energy');
  assert.equal(b.hand.length, 6, 'tin whistle: hand size 6');
  assert.ok(b.base.maxHp > plain.base.maxHp, 'vet clinic raises base hp');
  const c1 = B.placeCat(plain, 'scrap_tabby', 2, 2), c2 = B.placeCat(b, 'scrap_tabby', 2, 2);
  assert.ok(c2.maxHp > c1.maxHp * 1.1, 'warm sock: +15% hp');
  // on_kill relic (scratch pad notes) and reward_mult cards feed the result
  const q = newProfile(72);
  q.relics = { fish_skeleton: true };
  const r1 = runBattle({ seed: 72, district: null, stage: 1, profile: newProfile(72) }).b;
  const r2 = runBattle({ seed: 72, district: null, stage: 1, profile: q }).b;
  assert.ok(B.battleResult(r2).totals.fish > B.battleResult(r1).totals.fish, 'fish relic pays more');
}

// ---------------------------------------------------------------- 11. performance: 150 live units under 2 ms per step
{
  const b = B.createBattle({ seed: 51, district: null, stage: 5, profile: newProfile(51), noEcho: true });
  b.sp.done = false; b.sp.startAt = 1e9; // no scheduled spawns, the field is hand built
  const catIds = CATS.map((c) => c.id);
  let n = 0;
  for (let lane = 0; lane < 5; lane++) for (let col = 1; col <= 8; col++) { const id = catIds[(n++ * 7) % catIds.length]; B.placeCat(b, id, col, lane, { level: 3 }); }
  // tanks of data: huge hp so nothing dies and the count stays at 150
  const buff = () => { b.base.hp = b.base.maxHp = 1e15; for (const u of b.units) { u.hp = u.maxHp = 1e9; } for (const e of b.enemies) { e.hp = e.maxHp = 1e9; } };
  const ids = ENEMIES.filter((e) => !e.boss).map((e) => e.id);
  let k = 0;
  while (b.units.length + b.enemies.length < 150) B.spawnEnemy(b, ids[k++ % ids.length], k % 5, 3 + (k % 7) * 0.9);
  buff();
  B.drainEvents(b);
  for (let i = 0; i < 60; i++) { B.step(b); B.drainEvents(b); }
  buff();
  const live = b.units.length + b.enemies.length;
  assert.equal(b.over, null, 'battle still running');
  assert.ok(live >= 140, 'live units ' + live);
  const N = 600;
  const t = process.hrtime.bigint();
  for (let i = 0; i < N; i++) { B.step(b); if (i % 30 === 0) buff(); B.drainEvents(b); }
  const ms = Number(process.hrtime.bigint() - t) / 1e6 / N;
  console.log('perf: ' + live + ' live units, ' + ms.toFixed(3) + ' ms per step');
  assert.ok(ms < 2, 'avg step ' + ms.toFixed(3) + ' ms');
  assert.equal(b.over, null, 'battle still running after the measurement');
  assertFinite(b);
}

// ---------------------------------------------------------------- 12. no NaN after 10k steps (chaos: bot, endless, relics)
{
  const p = newProfile(61);
  p.relics = { tesla_whisker: true, ember_locket: true, hairball_amulet: true, tin_whistle: true, bulwark_bowl: true, rusty_bell: true };
  const b = B.createBattle({ seed: 61, district: null, stage: 95, profile: p, noEcho: true });
  b.base.hp = b.base.maxHp = 1e12;
  let steps = 0;
  for (; steps < 10000 && !b.over; steps++) {
    if (steps % 20 === 0) { bot(b); if (b.hand.length && b.energy > 1) B.playCard(b, 0, { x: 1 + (steps % 8), y: steps % 5 }); }
    B.step(b, 1 / 30);
    if (steps % 50 === 0) { B.drainEvents(b); assertFinite(b); }
  }
  assertFinite(b);
  assert.ok(steps >= 5000, 'ran ' + steps + ' steps');
  assert.ok(b.projectiles.length < 400);
}

console.log('midnight_mog battle: all passed in ' + (Date.now() - t0) + ' ms');
