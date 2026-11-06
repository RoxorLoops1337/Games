// Regression: the hover tooltip of a reward row (potion) must never cover that row's Take chip.
import assert from 'node:assert/strict';
import { makeApp, frames } from './graftwork_lib.mjs';
import * as RUN from '../graftwork/engine/run.js';
import reward from '../graftwork/ui/reward.js';
import { getAll, clear } from '../graftwork/ui/layout_registry.js';

const inter = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const run = RUN.newRun({ hero: 'marrow', seed: 'rewardtip' });
const app = await makeApp({ run, meta: {}, audio: { sfx() {}, music() {} } });
app.register('reward', reward);
app.shared.flow = { route() {}, openDeck() {} };
run.phase = 'reward'; run.pending = { kind: 'normal', gold: 20, potion: 'p_' + Object.keys((await import('../graftwork/data/index.js')).POTIONS)[0].replace(/^p_/, ''), graft: true };
app.go('reward', { run }); frames(app, 90);
const chips = getAll().filter((r) => r.id.startsWith('reward-chip'));
assert.ok(chips.length >= 2, 'reward rows present');
let checked = 0;
for (const c of chips) {
  app.mouse.x = c.x + c.w / 2; app.mouse.y = c.y + c.h / 2; frames(app, 40); clear(); frames(app, 1);
  const chip = getAll().find((r) => r.id === c.id), tip = getAll().find((r) => r.id === 'tip0');
  if (!tip) continue;
  assert.equal(inter(tip, chip), 0, `tooltip over ${c.id}: ${JSON.stringify(tip)} vs ${JSON.stringify(chip)}`);
  checked++;
}
assert.ok(checked >= 1, 'at least one tooltip was drawn');
console.log('graftwork_ui_reward_tip ok ' + checked);
