// Second-hour fixes: tooltips never cover what you choose between, HP stacking warning, jargon glossary, copy tags, tip reset on screen change.
import assert from 'node:assert/strict';
import { makeApp, frames } from './graftwork_lib.mjs';
import * as RUN from '../graftwork/engine/run.js';
import { cardSpec } from '../graftwork/engine/cards.js';
import graft from '../graftwork/ui/graft.js';
import reward from '../graftwork/ui/reward.js';
import { getAll, clear } from '../graftwork/ui/layout_registry.js';
import { KEYWORDS, keywordsIn, queueTip } from '../graftwork/ui/tooltips.js';
import { hpPerPlay } from '../graftwork/ui/graft_parts.js';
import { cardTag } from '../graftwork/ui/shop.js';

const inter = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const reg = (id) => getAll().find((r) => r.id === id);
async function boot(run, scr, mod) {
  const app = await makeApp({ run, meta: { settings: { tips: false } }, audio: { sfx() {}, music() {} } });
  app.register(scr, mod); app.register('other', { draw() {} });
  app.shared.flow = { route() {}, openDeck() {} };
  app.go(scr, { run }); frames(app, 90);
  return app;
}

// (5) graft table: a hovered patch or card tip never lands on a sibling choice
{
  const run = RUN.newRun({ hero: 'marrow', seed: 'r3tips' });
  RUN.startGraftPick(run);
  const app = await boot(run, 'graft', graft);
  const n = run.pending.offer.grafts.length;
  let seen = 0;
  const targets = [];
  for (let j = 0; j < n; j++) { const r = reg('graft-patch' + j); targets.push({ me: 'graft-patch' + j, x: r.x + r.w / 2, y: r.y + r.h / 2 }); }
  for (let i = 0; i < 3; i++) { const r = reg('graft-card' + i); targets.push({ me: 'graft-card' + i, x: r.x + r.w / 2, y: r.y + r.h / 2 }); }
  for (const t of targets) {
    app.mouse.x = t.x; app.mouse.y = t.y; frames(app, 40); clear(); frames(app, 1);
    const tip = getAll().find((r) => r.id === 'tip0'); if (!tip) continue;
    seen++;
    for (const r of getAll()) if (/^graft-(patch|card)\d/.test(r.id) && r.id !== t.me) assert.equal(inter(tip, r), 0, `${t.me} tip covers ${r.id}`);
    assert.ok(tip.h <= 200, 'tip height capped: ' + tip.h);
  }
  assert.ok(seen >= 3, 'tips were drawn: ' + seen);
}

// (6) reward: the gold row has no tip at all (the row already says it)
{
  const run = RUN.newRun({ hero: 'marrow', seed: 'r3reward' });
  run.phase = 'reward'; run.pending = { kind: 'normal', gold: 20, potion: null, graft: true };
  const app = await boot(run, 'reward', reward);
  const chip = reg('reward-chip0'); app.mouse.x = chip.x + 10; app.mouse.y = chip.y + 10; frames(app, 40); clear(); frames(app, 1);
  assert.equal(getAll().find((r) => r.id === 'tip0'), undefined, 'no tip on the gold row');
}

// (8) HP stacking
{
  const run = RUN.newRun({ hero: 'marrow', seed: 'r3hp' });
  const tr = run.deck.find((i) => i.id === 'm_transfuse');
  assert.equal(hpPerPlay(cardSpec(tr)), 3);
  assert.equal(hpPerPlay(cardSpec({ ...tr, grafts: ['g_echo_chamber'] })), 9, 'Echo Chamber triples the card\'s own HP cost');
  const cut = run.deck.find((i) => i.id === 'm_cut'); assert.equal(hpPerPlay(cardSpec(cut)), 0);
}

// (11) glossary words
for (const w of ['Claim', 'Ringing', 'Line', 'Knot', 'Tithe', 'Weight']) assert.ok(KEYWORDS[w] && KEYWORDS[w].text.length > 10, 'keyword ' + w);
assert.deepEqual(keywordsIn(['Counts as 2 knots on the Line. Claim, Ringing, Tithe.']).sort(), ['Claim', 'Knot', 'Line', 'Ringing', 'Tithe']);

// (14) identical copies get a tag
{
  const run = RUN.newRun({ hero: 'marrow', seed: 'r3tag' });
  const cuts = run.deck.filter((i) => i.id === 'm_cut');
  assert.ok(cuts.length >= 2);
  assert.equal(cardTag(cuts, cuts[1]), '#2');
  cuts[1].grafts.push('g_arc_clip'); cuts[1].up = 1;
  assert.equal(cardTag(cuts, cuts[1]), '#2, 1 graft, +');
  assert.equal(cardTag([run.deck.find((i) => i.id === 'm_transfuse')], run.deck.find((i) => i.id === 'm_transfuse')), null);
}

// (15) a screen change clears every tooltip
{
  const run = RUN.newRun({ hero: 'marrow', seed: 'r3reset' });
  const app = await makeApp({ run, meta: { settings: {} } });
  app.register('a', { draw(a) { queueTip(a, 'k', [[{ title: 'Stale', text: 'x' }]], { x: 10, y: 10, w: 20, h: 20 }); a.tooltip('Plain', 'y'); } });
  app.register('b', { draw() {} });
  app.go('a'); frames(app, 5);
  assert.ok(app.tip, 'tip present on screen a');
  app.go('b'); assert.equal(app.tip, null, 'app.go clears the tip');
  clear(); frames(app, 3);
  assert.equal(getAll().find((r) => r.id === 'tip0'), undefined, 'nothing from screen a is drawn on screen b');
}
console.log('graftwork_r3_tips ok');
