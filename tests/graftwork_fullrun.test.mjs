// Full-run completion: every hero is played from the first morning to the end screen state. Fights and graft picks are the strong bot's
// (tools/graftwork_driver.mjs); building, walking, rewards, shop, forge and events are the small deterministic player of tests/graftwork_lib.mjs.
// (a) a padded-HP run must build and walk three floors, fight the three bosses and The Grafter and finish 'won';
// (b) a run forced to die in Act 2 must finish 'dead' with a killer recorded; (c) a plain strong-bot run ends won or dead.
import assert from 'node:assert/strict';
import * as RUN from '../graftwork/engine/run.js';
import { canGraft } from '../graftwork/engine/cards.js';
import { POLICIES, playWardRun, strongFight, strongPickGraft } from '../tools/graftwork_driver.mjs';
import { botStep, runEnded } from './graftwork_lib.mjs';

const pol = POLICIES.strong;

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
      RUN.resolveFight(run, strongFight(run, pol).res);
    } else if (run.phase === 'graft') {
      const pick = strongPickGraft(run, pol);
      if (pick && canGraft(RUN.findInst(run, pick[0]), pick[1])) RUN.applyGraft(run, pick[0], pick[1]); else RUN.skipGraft(run, 'budget');
      RUN.afterGraft(run);
    } else botStep(run);
  }
  return { run, seen };
}

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };

for (const hero of ['marrow', 'wick', 'odile']) {
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
console.log(`${n} full-run checks passed`);
