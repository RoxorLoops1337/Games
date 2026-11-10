// Release-candidate regression loops for Graftwork (headless, engine only, deterministic).
//  (a) full runs for every hero (strong-bot fights and graft picks), Assist off and on: no throw, ends won or dead, no NaN in
//      hp/gold/budget, and serializeRun -> deserializeRun -> serializeRun is byte-identical at EVERY decision (every Ward hour included);
//  (b) saves made by an OLDER main commit (0675399, fixture tests/fixtures/graftwork_oldsave_0675399.json) still load
//      in the current code and can be played to the end.
// GW_REG_SEEDS=30 node tests/graftwork_regression.test.mjs   (seeds per hero and assist mode; default 3 keeps it under 10 s)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { botFinish, botStep } from './graftwork_lib.mjs';
import * as RUN from '../graftwork/engine/run.js';
import { canGraft, budgetOf } from '../graftwork/engine/cards.js';
import { POLICIES, strongFight, strongPickGraft } from '../tools/graftwork_driver.mjs';

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

// one step: fights and graft picks by the strong bot, everything else (building, walking, rewards, shop, forge, events) by the deterministic
// player of tests/graftwork_lib.mjs; same split as tests/graftwork_fullrun.test.mjs
function step(run) {
  switch (run.phase) {
    case 'map': { const ns = RUN.availableNodes(run).map((id) => run.map.nodes[id]); RUN.enterNode(run, ns[run.row < 0 ? 0 : ns.length - 1].id); break; } // saves from before the Ward (block b)
    case 'combat': RUN.resolveFight(run, strongFight(run, pol).res); break;
    case 'graft': {
      const pick = strongPickGraft(run, pol);
      if (pick && canGraft(RUN.findInst(run, pick[0]), pick[1])) RUN.applyGraft(run, pick[0], pick[1]); else RUN.skipGraft(run, 'budget');
      RUN.afterGraft(run); break;
    }
    default: botStep(run);
  }
}
function finish(run, tag, check) {
  let guard = 0;
  while (run.phase !== 'dead' && run.phase !== 'won') {
    assert.ok(guard++ < 2500, `${tag}: run did not end`);
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
      finish(run, tag, (r) => { checkNums(r, tag); roundTrip(r, tag); phasesSeen.add(r.phase); if (r.phase === 'ward') phasesSeen.add('ward:' + r.ward.phase); saves++; });
      n++;
    }
  }
}
for (const p of ['ward', 'ward:morning', 'ward:midday', 'ward:evening', 'ward:night', 'combat', 'reward', 'graft', 'event', 'shop']) assert.ok(phasesSeen.has(p), `never saw phase ${p}`);
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
// ---- (c) Ward saves made before the Classic map was retired (commit 5f3e252) resume and play to the very same end ----
// The fixture holds saves at every kind of moment (each Ward hour, mid walk, fights, reward, graft, event, shop, forge, the Grafter) and where
// the deterministic player of tests/graftwork_lib.mjs ended from each of them on that commit: outcome, day, gold and the hash of the final save.
const wardOld = JSON.parse(readFileSync(new URL('./fixtures/graftwork_wardsave_5f3e252.json', import.meta.url), 'utf8'));
let resumed = 0; const kinds = new Set();
for (const hero of HEROES) {
  assert.ok(wardOld[hero] && wardOld[hero].length >= 5, `${hero}: Ward fixture has saves`);
  for (const s of wardOld[hero]) {
    const tag = `ward-${hero}-${s.key}`;
    const run = RUN.deserializeRun(s.json);
    assert.equal(run.mode, 'ward', `${tag}: a Ward save`); assert.equal(run.phase, s.phase, tag);
    assert.equal(RUN.serializeRun(run), s.json, `${tag}: loading and saving again changes nothing`);
    const steps = botFinish(run, { deep: s.deep }, (r) => checkNums(r, tag));
    const end = { outcome: run.phase, act: run.act, day: run.ward.day, hp: run.hp, gold: run.gold, floors: run.stats.floors, fights: run.stats.fights, steps, sha1: createHash('sha1').update(RUN.serializeRun(run)).digest('hex') };
    assert.deepEqual(end, s.end, `${tag}: the resumed run ends where it ended before the retirement`);
    kinds.add(s.key.split('|')[0]); resumed++;
  }
}
for (const k of ['ward:morning', 'ward:midday', 'ward:evening', 'ward:night', 'combat:normal', 'combat:elite', 'combat:boss', 'combat:final', 'reward', 'graft', 'event', 'shop', 'forge']) assert.ok(kinds.has(k), 'fixture covers ' + k);
console.log(`ok ${resumed} Ward saves from commit 5f3e252 resume to the same end`);
console.log(`graftwork regression passed (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
