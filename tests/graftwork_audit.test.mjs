// Exploit audit: per-graft power smoke, adversarial combo decks (no hang / exception / runaway damage), Tithe + Overload math.
// The full ranked table is tools/graftwork_audit.mjs (node tools/graftwork_audit.mjs 40).
import assert from 'node:assert/strict';
import * as RUN from '../graftwork/engine/run.js';
import { newCombat, playCard, endTurn, canPlay, resolvePending, finishCombat, MAX_PLAYS_TURN, HAND_CAP } from '../graftwork/engine/combat.js';
import { strainInfo, instWeight, isBare, canGraft, cardSpec } from '../graftwork/engine/cards.js';
import { GRAFTS, CARDS, RELICS, HEROES, ENEMIES } from '../graftwork/data/index.js';
import { runAudit, targetsFor } from '../tools/graftwork_audit.mjs';

let n = 0;
const ok = (m) => { n++; console.log('ok ' + m); };

// ---- 1. every graft is legal on at least one starter card of some hero (none "works on nothing"), audit runs without throwing
const dead = Object.keys(GRAFTS).filter((g) => targetsFor(g).length === 0);
assert.deepEqual(dead, [], 'grafts legal on no starter card: ' + dead);
const res = runAudit({ N: 2, only: 'g_ember_pin' });
assert.ok(res.length === 1 && res[0].cards > 0 && Number.isFinite(res[0].power));
ok('audit tool runs; every graft has a legal target');

// ---- 2. adversarial decks
const ENGINE = Object.values(GRAFTS).filter((g) => g.mods.some((m) => ['repeat', 'cost', 'aoe', 'flag'].includes(m.k) || (m.k === 'addFx' && m.fx.some((o) => ['energy', 'draw'].includes(o.op))) || (m.k === 'custom')));
const bigRelics = ['r_gamblers_thread', 'r_overload_valve', 'r_monolith', 'r_jam_engine', 'r_second_wind', 'r_pale_deck', 'r_strain_gauge'].filter((r) => RELICS[r]);
function bot(c, stats) {
  let guard = 0;
  while (!c.over && c.turn <= 12 && guard++ < 60) {
    let plays = 0, dealt = 0, energyGain = 0;
    while (!c.over && plays++ < 40) {
      if (c.pending) { const p = c.pending; const pool = p.kind === 'fetch' ? (p.zone === 'exhaust' ? c.exhaust : c.discard) : c.hand; resolvePending(c, pool.slice(0, p.n).map((k) => k.uid)); continue; }
      let hi = -1;
      for (let i = 0; i < c.hand.length; i++) if (canPlay(c, i).ok) { hi = i; break; }
      if (hi < 0) break;
      const tgt = c.enemies.findIndex((e) => !e.dead);
      playCard(c, hi, tgt);
      assert.ok(c.hand.length <= HAND_CAP, 'hand over cap');
      assert.ok(c.playsTurn <= MAX_PLAYS_TURN, 'plays over cap');
      for (const e of c.ev) if (e.t === 'dmg' && e.who !== 'player') dealt += e.n + e.absorbed;
      c.ev.length = 0;
    }
    stats.maxTurnDmg = Math.max(stats.maxTurnDmg, dealt);
    for (const k of Object.keys(c.player.st)) stats.maxStatus = Math.max(stats.maxStatus, c.player.st[k]);
    assert.ok(c.energy < 40, 'runaway energy ' + c.energy);
    c.ev.length = 0;
    if (c.over) break;
    endTurn(c); c.ev.length = 0;
  }
}
function adversarial(hero, seed, depth, relics) {
  const run = RUN.newRun({ hero, seed });
  run.budgetBonus = 40; // isolate the engine combos from Tithe
  for (const r of relics) RUN.addRelic(run, r);
  const rng = run.rng;
  for (const inst of run.deck) {
    const want = depth;
    for (let tries = 0; tries < 60 && inst.grafts.length < want; tries++) { const g = rng.pick(ENGINE); if (canGraft(inst, g.id)) RUN.applyGraft(run, inst.uid, g.id, { keepPhase: true, free: true }); }
  }
  run.hp = run.maxHp = 999;
  run.gold = 500;
  const act1 = Object.values(ENEMIES).filter((e) => e.act === 1 && e.kind === 'normal' && !e.summonOnly && !e.minion).map((e) => e.id);
  const c = newCombat(run, [rng.pick(act1), rng.pick(act1)]);
  // starting statuses
  c.player.st.echo = 3; c.player.st.strength = 3;
  const stats = { maxTurnDmg: 0, maxStatus: 0 };
  bot(c, stats);
  finishCombat(c);
  return stats;
}
let worst = 0;
const t0 = Date.now();
for (const hero of Object.keys(HEROES)) for (let i = 0; i < 12; i++) {
  const depth = 2 + (i % 2); // 2 grafts, or 3 = Overload
  const s = adversarial(hero, `adv-${hero}-${i}`, depth, i % 3 === 0 ? [] : bigRelics.slice(0, 2 + (i % 5)));
  worst = Math.max(worst, s.maxTurnDmg);
  assert.ok(s.maxStatus <= 99, 'status over cap');
}
console.log('  worst Act-1 damage in one turn:', worst, 'in', Date.now() - t0, 'ms');
assert.ok(worst <= 600, 'single-turn damage runaway: ' + worst);
ok('adversarial engine/overload/relic decks: no hang, no exception, caps hold');

// ---- 3. Tithe / Backfire / Overload math, 0..15 grafts
function deckWith(k, weight = 1, relics = []) {
  const run = RUN.newRun({ hero: 'marrow', seed: 'tithe' });
  for (const r of relics) RUN.addRelic(run, r);
  run.relics = run.relics.filter((r) => !RELICS[r].mod || !RELICS[r].mod.budget);
  const g = Object.values(GRAFTS).find((x) => x.weight === weight && canGraft(run.deck[0], x.id));
  for (let i = 0; i < k; i++) { const inst = run.deck.filter((d) => d.grafts.length === 0 && CARDS[d.id].type !== 'junk')[0]; if (!inst) break; inst.grafts.push(g.id); }
  return run;
}
for (let k = 0; k <= 15; k++) {
  const run = deckWith(k);
  const si = strainInfo(run);
  const placed = run.deck.reduce((a, i) => a + i.grafts.length, 0);
  assert.equal(si.weight, placed);
  assert.equal(si.strain, Math.max(0, placed - 6));
  const bare = run.deck.filter(isBare);
  assert.equal(si.tithed.length, Math.min(si.strain, bare.length));
  assert.equal(si.overflow, Math.max(0, si.strain - bare.length));
  assert.equal(si.backfire, Math.ceil(si.overflow / 2));
  // tithed = cheapest, then oldest
  const order = bare.slice().sort((a, b) => (CARDS[a.id].cost === 'X' ? 9 : CARDS[a.id].cost) - (CARDS[b.id].cost === 'X' ? 9 : CARDS[b.id].cost) || a.uid - b.uid).map((i) => i.uid);
  assert.deepEqual(si.tithed, order.slice(0, si.tithed.length));
  const c = newCombat(run, ['bedpan_slime']);
  assert.deepEqual(c.drawPile.concat(c.hand).filter((w) => w.tithed).map((w) => w.uid).sort(), si.tithed.slice().sort());
}
// third graft weighs +1, Overload multiplier, shatter rolls once per combat
{
  const run = RUN.newRun({ hero: 'marrow', seed: 'ov' });
  const inst = run.deck.find((d) => d.id === 'm_bonesaw');
  const ids = Object.values(GRAFTS).filter((g) => g.weight === 1 && g.mods.every((m) => m.k !== 'maxHp')).map((g) => g.id).filter((g) => canGraft(inst, g));
  inst.grafts.push(ids[0], ids[1]);
  const w2 = instWeight(inst);
  inst.grafts.push(ids[2]);
  assert.equal(instWeight(inst), w2 + 2, 'third graft weighs its own weight + 1');
  assert.equal(cardSpec(inst).overload, true);
  const rolls = [];
  run.relics.push('r_gamblers_thread');
  run.budgetBonus = 40; run.hp = run.maxHp = 999;
  for (const g of [ids[0], ids[1], ids[2]]) { const gg = GRAFTS[g]; }
  const c = newCombat(run, ['bedpan_slime', 'orderly']);
  const w = [...c.hand, ...c.drawPile, ...c.discard].find((k) => k.inst === inst);
  assert.ok(w);
  let seen = 0;
  for (let t = 0; t < 6 && !c.over; t++) {
    for (let i = 0; i < c.hand.length; i++) if (c.hand[i] === w) { c.energy = 9; playCard(c, i, 0); rolls.push(w.rolled); break; }
    if (c.over) break;
    endTurn(c);
  }
  assert.ok(rolls.every(Boolean), 'rolled flag set after first play');
  ok('Tithe / Backfire / Overload math for 0..15 grafts');
}
console.log(`${n} audit checks done`);
