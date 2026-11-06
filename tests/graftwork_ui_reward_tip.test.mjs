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

// Regression: on a boss reward (gold + potion + relic pair + building plan row) the "left behind" notes were drawn over the relic cards.
{
  const D = await import('../graftwork/data/index.js');
  const relics = Object.values(D.RELICS).filter((r) => r.rarity === 'boss').map((r) => r.id).slice(0, 3);
  const build = Object.keys((await import('../graftwork/data/ward.js')).BUILD_CARDS).slice(0, 3);
  for (const [label, sc, mode] of [['desktop', 0, 'ward'], ['phone .64', 0.64, 'ward'], ['phone .54', 0.54, 'ward'], ['phone .46', 0.46, 'ward'], ['desktop classic', 0, 'classic'], ['phone .54 classic', 0.54, 'classic']]) {
    const r2 = RUN.newRun({ hero: 'marrow', seed: 'bossrw', ...(mode === 'ward' ? { mode: 'ward' } : {}) });
    const a2 = await makeApp({ run: r2, meta: { settings: {}, tips: {} }, audio: { sfx() {}, music() {} } });
    if (sc) { a2.scale = sc; a2.minPx = 11; }
    a2.register('reward', reward); a2.shared.flow = { route() {}, openDeck() {} };
    r2.phase = 'reward';
    r2.pending = { kind: 'boss', gold: 80, potion: Object.keys(D.POTIONS)[0], relicChoices: relics.slice(0, 3), graft: true, ...(mode === 'ward' ? { buildChoice: build } : {}) };
    a2.go('reward', { run: r2 }); frames(a2, 120); clear(); frames(a2, 1);
    const regs = getAll(), notes = regs.find((r) => r.id === 'reward-notes');
    assert.ok(notes, label + ': notes shown');
    for (const r of regs.filter((q) => /^reward-(choice\d|choose|row|chip|build)/.test(q.id) || q.id.startsWith('reward-choice'))) assert.equal(inter(notes, r), 0, `${label}: notes over ${r.id}: ${JSON.stringify(notes)} vs ${JSON.stringify(r)}`);
    const cont = regs.find((r) => r.id === 'reward-continue');
    for (const r of regs.filter((q) => q.id.startsWith('reward-choice'))) assert.ok(r.y + r.h <= notes.y + 0.5 && r.y + r.h <= cont.y, `${label}: relic card ${r.id} runs into the footer (${r.y + r.h} vs ${notes.y})`);
  }
}
console.log('graftwork_ui_reward_tip ok ' + checked);
