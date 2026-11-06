// Release-candidate regression loops for Graftwork (headless, engine only, deterministic).
//  (a) strong-bot full runs for every hero, Assist off and on: no throw, ends won or dead, no NaN in hp/gold/budget,
//      and serializeRun -> deserializeRun -> serializeRun is byte-identical at EVERY phase;
//  (b) saves made by an OLDER main commit (0675399, fixture tests/fixtures/graftwork_oldsave_0675399.json) still load
//      in the current code and can be played to the end.
// GW_REG_SEEDS=30 node tests/graftwork_regression.test.mjs   (seeds per hero and assist mode; default 3 keeps it under 10 s)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as RUN from '../graftwork/engine/run.js';
import { canGraft, budgetOf } from '../graftwork/engine/cards.js';
import { POLICIES } from '../tools/graftwork_sim.mjs';
import { strongFight, strongPickGraft } from '../tools/graftwork_strong.mjs';

const pol = POLICIES.strong;
const SEEDS = Number(process.env.GW_REG_SEEDS || 3);
const HEROES = ['marrow', 'wick', 'odile'];
const ASSIST = { on: true, sturdy: true, gentle: true, kind: true, mercy: true };

function checkNums(run, tag) {
  for (const k of ['hp', 'maxHp', 'gold']) assert.ok(Number.isFinite(run[k]), `${tag}: run.${k} = ${run[k]}`);
  assert.ok(run.hp >= 0 && run.hp <= run.maxHp, `${tag}: hp ${run.hp}/${run.maxHp}`);
  assert.ok(run.gold >= 0, `${tag}: gold ${run.gold}`);
  assert.ok(Number.isFinite(budgetOf(run)), `${tag}: budget ${budgetOf(run)}`);
}
function roundTrip(run, tag) {
  const a = RUN.serializeRun(run);
  const b = RUN.serializeRun(RUN.deserializeRun(a));
  assert.equal(b, a, `${tag}: serialize/deserialize round trip differs at phase ${run.phase}`);
  // the restored run must keep drawing the same random numbers
  const r2 = RUN.deserializeRun(a);
  assert.equal(r2.rng.next(), run.rng.next(), `${tag}: restored rng diverges`);
  assert.equal(RUN.serializeRun(r2) === a, false, 'rng advanced');
  run.rng.state = RUN.deserializeRun(a).rng.state; // undo our peek on the original
}

// one step of the strong bot; same logic as tests/graftwork_fullrun.test.mjs
function step(run) {
  switch (run.phase) {
    case 'map': { const ns = RUN.availableNodes(run).map((id) => run.map.nodes[id]); RUN.enterNode(run, ns[run.row < 0 ? 0 : ns.length - 1].id); break; }
    case 'combat': RUN.resolveFight(run, strongFight(run, pol).res); break;
    case 'reward': {
      const rw = run.pending; RUN.claimGold(run, rw);
      if (rw.relic) RUN.addRelic(run, rw.relic);
      if (rw.relicChoices && rw.relicChoices[0]) RUN.addRelic(run, rw.relicChoices[0]);
      if (rw.potion) RUN.addPotion(run, rw.potion);
      RUN.afterReward(run); break;
    }
    case 'graft': {
      const pick = strongPickGraft(run, pol);
      if (pick && canGraft(RUN.findInst(run, pick[0]), pick[1])) RUN.applyGraft(run, pick[0], pick[1]); else RUN.skipGraft(run, 'budget');
      RUN.afterGraft(run); break;
    }
    case 'shop': { const s = run.pending; for (let i = 0; i < s.potions.length; i++) RUN.shopBuy(run, 'potion', i); RUN.advance(run); break; }
    case 'forge': RUN.forgeAct(run, 'expand'); RUN.advance(run); break;
    case 'event': { const ch = RUN.eventChoices(run).filter((c) => c.ok); const c = ch.find((x) => !x.pick) || ch[0]; RUN.eventChoose(run, c.i, c.cards ? c.cards[0] : undefined); RUN.afterEvent(run); break; }
    default: throw new Error('stuck in phase ' + run.phase);
  }
}
function finish(run, tag, check) {
  let guard = 0;
  while (run.phase !== 'dead' && run.phase !== 'won') {
    assert.ok(guard++ < 800, `${tag}: run did not end`);
    check(run);
    step(run);
  }
  check(run);
  assert.ok(['won', 'dead'].includes(run.phase), `${tag}: ended in ${run.phase}`);
}

let n = 0, phasesSeen = new Set(), saves = 0;
const t0 = Date.now();
for (const assist of [false, true]) {
  for (const hero of HEROES) {
    for (let s = 1; s <= SEEDS; s++) {
      const tag = `${hero}#${s}${assist ? '+assist' : ''}`;
      const run = RUN.newRun({ hero, seed: `reg-${hero}-${s}`, assist: assist ? ASSIST : undefined });
      assert.equal(!!run.assist, assist, `${tag}: assist flag`);
      finish(run, tag, (r) => { checkNums(r, tag); roundTrip(r, tag); phasesSeen.add(r.phase); saves++; });
      n++;
    }
  }
}
for (const p of ['map', 'combat', 'reward', 'graft']) assert.ok(phasesSeen.has(p), `never saw phase ${p}`);
console.log(`ok ${n} strong-bot runs (${SEEDS} seeds x 3 heroes x assist off/on), ${saves} round trips`);

// ---- (b) saves from the previous main commit still load and play on ----
const old = JSON.parse(readFileSync(new URL('./fixtures/graftwork_oldsave_0675399.json', import.meta.url), 'utf8'));
let loaded = 0;
for (const hero of HEROES) {
  assert.ok(old[hero] && old[hero].length >= 5, `${hero}: fixture has saves`);
  for (const { phase, json } of old[hero]) {
    const tag = `old-${hero}-${phase}`;
    const run = RUN.deserializeRun(json);
    assert.equal(run.v, 1, `${tag}: save version`);
    assert.equal(run.phase, phase);
    checkNums(run, tag);
    finish(run, tag, (r) => checkNums(r, tag));
    loaded++;
  }
}
console.log(`ok ${loaded} saves from commit 0675399 load and play to the end`);
console.log(`graftwork regression passed (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
