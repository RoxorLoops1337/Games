// Whole runs for Graftwork, from the first morning to the end screen state (headless, engine only, deterministic). Fights and graft picks
// are the strong bot's (tools/graftwork_driver.mjs); building, walking, rewards, shop, forge and events are the small deterministic player
// of tests/graftwork_lib.mjs.
//  (a) runs for every hero, Assist off and on: no throw, ends won or dead, no NaN in hp/gold/budget, and
//      serializeRun -> deserializeRun -> serializeRun is byte-identical at EVERY decision (every Ward hour included);
//  (b) saves from before the Ward are runs on the retired map: see tests/graftwork_retire.test.mjs;
//  (c) Ward saves made just before the retirement (5f3e252, fixture tests/fixtures/graftwork_wardsave_5f3e252.json) load in the
//      current code and play to the very same end as on the main line without the retirement;
//  (d) the run can be completed: a padded-HP run builds and walks three floors, fights the three bosses and The Grafter and ends won; a run
//      forced to die in Act 2 ends dead with its killer recorded; a plain strong-bot run of the shared driver ends won or dead.
// GW_REG_SEEDS=30 node tests/graftwork_regression.test.mjs   (seeds per hero and assist mode for (a); default 3 keeps it under 10 s)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { botFinish, botStep, runEnded } from './graftwork_lib.mjs';
import * as RUN from '../graftwork/engine/run.js';
import { canGraft, budgetOf } from '../graftwork/engine/cards.js';
import { POLICIES, playWardRun, strongFight, strongPickGraft } from '../tools/graftwork_driver.mjs';

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
// player of tests/graftwork_lib.mjs
function step(run) {
  switch (run.phase) {
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

// ---- (b) saves from before the Ward (commit 0675399, tests/fixtures/graftwork_oldsave_0675399.json) are runs on the retired map: they are no
//      longer played on but closed and counted. tests/graftwork_retire.test.mjs holds that fixture's checks.

// ---- (c) Ward saves made before the Classic map was retired (commit 5f3e252) resume and play to the very same end ----
// The fixture holds saves at every kind of moment (each Ward hour, mid walk, fights, reward, graft, event, shop, forge, the Grafter) and where
// the deterministic player of tests/graftwork_lib.mjs ended from each of them: outcome, day, gold and the hash of the final save. The saves are
// the bytes of 5f3e252. The ends were played on the main line at b0ed267 (the rules fixes are in, the map is not yet retired): the rules fixes
// moved 12 of the 28 ends (two Wick and Odile runs by a few hit points and gold, the rest only in the final save), the retirement none.
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
    assert.deepEqual(end, s.end, `${tag}: the resumed run ends where it ended on the main line before the retirement`);
    kinds.add(s.key.split('|')[0]); resumed++;
  }
}
for (const k of ['ward:morning', 'ward:midday', 'ward:evening', 'ward:night', 'combat:normal', 'combat:elite', 'combat:boss', 'combat:final', 'reward', 'graft', 'event', 'shop', 'forge']) assert.ok(kinds.has(k), 'fixture covers ' + k);
console.log(`ok ${resumed} Ward saves from commit 5f3e252 resume to the same end`);

// ---- (d) the run can be completed ----
function drive(hero, seed, { extraHp = 0, dieInAct = 0 } = {}) {
  const run = RUN.newRun({ hero, seed });
  if (extraHp) { run.maxHp += extraHp; run.hp = run.maxHp; }
  const seen = { acts: new Set(), kinds: new Set(), enemies: new Set(), phases: new Set(), hours: new Set() };
  let guard = 0;
  while (!runEnded(run)) {
    assert.ok(guard++ < 2000, `${hero}: run did not end`);
    seen.acts.add(run.act); seen.phases.add(run.phase); if (run.phase === 'ward') seen.hours.add(run.ward.phase);
    if (run.phase === 'combat') {
      seen.kinds.add(run.pending.fightKind); run.pending.enemies.forEach((e) => seen.enemies.add(e));
      if (dieInAct && run.act === dieInAct) run.hp = 1;
    }
    step(run);
  }
  return { run, seen };
}
let full = 0;
const t = (name, fn) => { fn(); full++; console.log('ok', name); };
for (const hero of HEROES) {
  t(`${hero}: a padded-HP run clears three acts, the Impresario and The Grafter and ends won`, () => {
    const { run, seen } = drive(hero, `fullrun-${hero}`, { extraHp: 500 });
    assert.equal(run.phase, 'won');
    assert.ok(seen.acts.has(2) && seen.acts.has(3), 'reached acts 2 and 3');
    assert.ok(seen.kinds.has('boss') && seen.kinds.has('final'), 'fought a boss and the final boss');
    assert.ok(seen.enemies.has('the_grafter'), 'met The Grafter');
    assert.equal(run.stats.bosses, 3, 'three act bosses fell');
    for (const h of ['morning', 'midday', 'evening', 'night']) assert.ok(seen.hours.has(h), 'played the ' + h);
    for (const p of ['ward', 'combat', 'reward', 'graft', 'event']) assert.ok(seen.phases.has(p), 'saw ' + p);
  });
  t(`${hero}: a run forced to die in Act 2 ends dead with a killer recorded`, () => {
    const { run } = drive(hero, `fullrun-die-${hero}`, { extraHp: 500, dieInAct: 2 });
    assert.equal(run.phase, 'dead');
    assert.equal(run.act, 2);
    assert.ok(run.killedBy, 'killedBy is set for the FLATLINE cause line');
  });
  t(`${hero}: an unpadded strong-bot run ends won or dead without throwing`, () => {
    const r = playWardRun(hero, `fullrun-plain-${hero}`, 'strong', 0);
    assert.ok(['won', 'dead'].includes(r.outcome));
    assert.ok(r.log.acts[1].fights > 0 && r.log.acts[1].walks > 0, 'the bot walked and fought on the first floor');
  });
}
console.log(`ok ${full} completed-run checks`);
console.log(`graftwork regression passed (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
