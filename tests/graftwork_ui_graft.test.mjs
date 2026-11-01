// Headless smoke tests for the graft table and reward screens.
import assert from 'node:assert/strict';
import { makeApp, frames, click, key } from './graftwork_lib.mjs';
import * as RUN from '../graftwork/engine/run.js';
import { canGraft } from '../graftwork/engine/cards.js';
import graft from '../graftwork/ui/graft.js';
import reward from '../graftwork/ui/reward.js';

const PHASE = { graft: 'graft', reward: 'reward' };
async function setup(run) {
  const shared = { run, meta: { settings: {} } };
  const app = await makeApp(shared);
  const flow = { routed: 0, openedDeck: 0, route() { flow.routed++; app.go(PHASE[run.phase] || 'other', { run }); }, openDeck() { flow.openedDeck++; } };
  shared.flow = flow;
  app.register('graft', graft); app.register('reward', reward); app.register('other', { draw() {} });
  return { app, flow };
}
const grafts = (run) => run.deck.reduce((n, i) => n + i.grafts.length, 0);
const play = (app, n = 400) => frames(app, n);

let count = 0;
for (const hero of ['marrow', 'wick', 'odile']) for (const seed of ['a', 'b', 'c']) {
  const run = RUN.newRun({ hero, seed });
  RUN.startGraftPick(run);
  const { app } = await setup(run);
  app.go('graft', { run }); frames(app, 60);
  const offer = run.pending.offer;
  let ci = -1, gi = -1;
  offer.cards.forEach((u, i) => offer.grafts.forEach((g, j) => { if (ci < 0 && canGraft(RUN.findInst(run, u), g)) { ci = i; gi = j; } }));
  assert.ok(ci >= 0, 'a compatible pair exists');
  const before = grafts(run);
  if (count % 2) { key(app, String(ci + 1)); key(app, 'qwer'[gi]); }
  else { click(app, app.current && 412 - 257 + ci * 257 - 0, 274); click(app, 1000, 80 + gi * 117 + 50); }
  frames(app, 40);
  const uid = offer.cards[ci];
  key(app, 'Enter'); play(app);
  assert.equal(grafts(run), before + 1, `${hero}/${seed} gained one graft`);
  assert.notEqual(run.phase, 'graft');
  count++;
}

// skip options
for (const choice of ['1', '2', '3']) {
  const run = RUN.newRun({ hero: 'marrow', seed: 's' }); run.hp = 40;
  RUN.startGraftPick(run);
  const { app } = await setup(run);
  app.go('graft', { run }); frames(app, 30);
  const hp = run.hp, gold = run.gold, bb = run.budgetBonus;
  key(app, 'Escape'); frames(app, 5); key(app, choice); key(app, 'Enter'); play(app, 90);
  if (choice === '1') assert.equal(run.hp, hp + 8);
  if (choice === '2') assert.equal(run.budgetBonus, bb + 1);
  if (choice === '3') assert.equal(run.gold, gold + 10);
  assert.notEqual(run.phase, 'graft');
}

// reroll
{
  const run = RUN.newRun({ hero: 'marrow', seed: 'r' }); run.gold = 100;
  RUN.startGraftPick(run);
  const { app } = await setup(run);
  app.go('graft', { run }); frames(app, 60);
  click(app, 930, 579); frames(app, 5);
  assert.equal(run.gold, 80); assert.equal(run.pending.offer.rerolled, 1);
}

// reward: elite (gold, relic, potion) then continue to graft
{
  const run = RUN.newRun({ hero: 'marrow', seed: 'e' });
  const rw = RUN.fightRewards(run, 'elite', {}); rw.potion = rw.potion || 'p_tonic';
  const g0 = run.gold, g = rw.gold, relic = rw.relic;
  const { app } = await setup(run);
  app.go('reward', { run }); frames(app, 60);
  key(app, '1'); key(app, '2'); key(app, '3'); frames(app, 5);
  assert.equal(run.gold, g0 + g); assert.equal(run.potions.length, 1); assert.ok(run.relics.includes(relic));
  click(app, 640, 676); frames(app, 3);
  assert.equal(run.phase, 'graft');
}
// reward: boss relic choice
{
  const run = RUN.newRun({ hero: 'wick', seed: 'b' });
  const rw = RUN.fightRewards(run, 'boss', {});
  const choices = rw.relicChoices.slice(); const n0 = run.relics.length;
  const { app } = await setup(run);
  app.go('reward', { run }); frames(app, 60);
  key(app, 'q'); key(app, 'w'); frames(app, 3);
  assert.equal(run.relics.length, n0 + 1); assert.ok(run.relics.includes(choices[0]));
  key(app, 'Enter'); frames(app, 3);
  assert.equal(run.phase, 'graft');
}
// potion slots full
{
  const run = RUN.newRun({ hero: 'marrow', seed: 'f' });
  const rw = RUN.fightRewards(run, 'normal', {}); rw.potion = 'p_tonic';
  for (let i = 0; i < 3; i++) run.potions.push('p_tonic');
  const { app } = await setup(run);
  app.go('reward', { run }); frames(app, 60);
  key(app, '2'); frames(app, 3);
  assert.equal(run.potions.length, 3);
}
console.log('graftwork_ui_graft OK');
