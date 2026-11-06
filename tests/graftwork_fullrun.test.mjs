// Full-run completion: every hero is played from the first node to the end screen state with the strong bot.
// (a) a padded-HP run must reach Act 3, fight the Impresario and The Grafter and finish 'won';
// (b) a run forced to die in Act 2 must finish 'dead' with a killer recorded; (c) a plain run ends won or dead.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as RUN from '../graftwork/engine/run.js';
import { canGraft } from '../graftwork/engine/cards.js';
import { POLICIES, playRun } from '../tools/graftwork_sim.mjs';
import { strongFight, strongPickGraft } from '../tools/graftwork_strong.mjs';

const pol = POLICIES.strong;
const PRI = ['final', 'boss', 'elite', 'fight', 'event', 'shop', 'forge'];

function drive(hero, seed, { extraHp = 0, dieInAct = 0 } = {}) {
  const run = RUN.newRun({ hero, seed });
  if (extraHp) { run.maxHp += extraHp; run.hp = run.maxHp; }
  const seen = { acts: new Set(), kinds: new Set(), enemies: new Set() };
  let guard = 0;
  while (run.phase !== 'dead' && run.phase !== 'won') {
    assert.ok(guard++ < 800, `${hero}: run did not end`);
    seen.acts.add(run.act);
    switch (run.phase) {
      case 'map': {
        const ns = RUN.availableNodes(run).map((id) => run.map.nodes[id]).sort((a, b) => PRI.indexOf(a.type) - PRI.indexOf(b.type));
        RUN.enterNode(run, ns[0].id); break;
      }
      case 'combat': {
        seen.kinds.add(run.pending.fightKind); run.pending.enemies.forEach((e) => seen.enemies.add(e));
        if (dieInAct && run.act === dieInAct) run.hp = 1;
        const { res } = strongFight(run, pol);
        RUN.resolveFight(run, res); break;
      }
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
  });
  t(`${hero}: a run forced to die in Act 2 ends dead with a killer recorded`, () => {
    const { run } = drive(hero, `fullrun-die-${hero}`, { extraHp: 500, dieInAct: 2 });
    assert.equal(run.phase, 'dead');
    assert.equal(run.act, 2);
    assert.ok(run.killedBy, 'killedBy is set for the FLATLINE cause line');
  });
  t(`${hero}: an unpadded strong-bot run ends won or dead without throwing`, () => {
    const r = playRun(hero, `fullrun-plain-${hero}`, pol, 0);
    assert.ok(['won', 'dead'].includes(r.outcome));
  });
}
t('combat screen wires the Grafter reknit event (phase strip) and brands marked cards', () => {
  const src = readFileSync(new URL('../graftwork/ui/combat.js', import.meta.url), 'utf8');
  assert.match(src, /case 'reknit':[^\n]*phaseBeat\(APP, 'REKNIT'\)/, 'reknit event fires the phase strip');
  assert.match(src, /mark: dc\.w\.reknit \? 'reknit'/, 'marked hand cards are drawn with the reknit brand');
});
console.log(`${n} full-run checks passed`);
