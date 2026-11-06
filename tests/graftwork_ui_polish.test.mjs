// Regression gate for the playtest polish round (J1): graft refusal reasons, tooltips under a modal, move-name plates,
// the coin-flip event, hero label contrast, first-run tip placement and the reward layout.
import assert from 'node:assert/strict';
import { makeApp, frames } from './graftwork_lib.mjs';
import * as RUN from '../graftwork/engine/run.js';
import { CARDS, GRAFTS, EVENTS } from '../graftwork/data/index.js';
import { canGraft, cantGraftWhy } from '../graftwork/engine/cards.js';
import { shortMove } from '../graftwork/ui/combat_hud.js';
import { labelColor } from '../graftwork/ui/title.js';
import { maybeTip } from '../graftwork/ui/tutorial.js';
import { getAll, clear } from '../graftwork/ui/layout_registry.js';

let n = 0; const t = (name, fn) => { fn(); n++; };

t('cantGraftWhy agrees with canGraft and always names a real reason', () => {
  let refused = 0, vague = 0;
  for (const c of Object.values(CARDS)) for (const g of Object.values(GRAFTS)) for (const have of [[], [Object.keys(GRAFTS)[0]]]) {
    const inst = { uid: 1, id: c.id, grafts: have, up: 0 };
    const why = cantGraftWhy(inst, g.id);
    assert.equal(canGraft(inst, g.id), why === null, `${c.id} + ${g.id}: canGraft and cantGraftWhy disagree (${why})`);
    if (why !== null) { refused++; assert.ok(typeof why === 'string' && why.length > 3 && !/[—–]/.test(why), 'reason text: ' + why); if (why === 'Does not fit this card') vague++; }
  }
  assert.ok(refused > 1000);
  assert.ok(vague / refused < 0.02, `too many vague refusals: ${vague}/${refused}`);
});
t('cantGraftWhy gives the concrete reasons', () => {
  const atk = (g) => cantGraftWhy({ uid: 1, id: 'm_dress', grafts: [], up: 0 }, g);
  assert.equal(atk('g_kiln_heart'), 'Attacks only');
  const full = { uid: 2, id: 'm_cut', grafts: ['g_kiln_heart', 'g_double_spine', 'g_cinder_lung'], up: 0 };
  assert.equal(cantGraftWhy(full, 'g_open_vein'), 'Card is full');
  assert.match(cantGraftWhy({ uid: 3, id: 'm_cut', grafts: ['g_kiln_heart'], up: 0 }, 'g_kiln_heart'), /^Already has /);
  assert.match(cantGraftWhy({ uid: 4, id: 'j_paperwork', grafts: [], up: 0 }, 'g_kiln_heart'), /Junk/);
  const costs = new Set();
  for (const c of Object.values(CARDS)) for (const g of Object.values(GRAFTS)) { const w = cantGraftWhy({ uid: 5, id: c.id, grafts: [], up: 0 }, g.id); if (w && /^Needs cost/.test(w)) costs.add(w); }
  assert.ok([...costs].some((w) => /or more|or less/.test(w)), 'cost rules are explained: ' + [...costs].join('; '));
  // an explicit why on a graft wins
  const g = GRAFTS.g_kiln_heart, keep = g.why; g.why = 'Test reason'; 
  try { const sk = { uid: 6, id: 'm_cut', grafts: [], up: 0 }; const spec = CARDS.m_cut; if (!canGraft(sk, 'g_kiln_heart')) assert.equal(cantGraftWhy(sk, 'g_kiln_heart'), 'Test reason'); } finally { if (keep === undefined) delete g.why; else g.why = keep; }
});
{
  const app = await makeApp({ run: RUN.newRun({ hero: 'marrow', seed: 'pol' }), meta: {}, audio: { sfx() {}, music() {} } });
  app.register('probe', { draw(a) { a.tooltip('Under', 'x'); } });
  app.register('top', { draw(a) { if (a.inRect(0, 0, 10, 10)) a.tooltip('Top', 'y'); } });
  app.go('probe'); app.push('top', {}); app.mouse.x = 5; app.mouse.y = 5; frames(app, 3);
  assert.equal(app.tip && app.tip.title, 'Top', 'only the top screen may raise a tooltip');
  app.pop(); frames(app, 2); assert.equal(app.tip && app.tip.title, 'Under', 'visible again once uncovered'); n++;
}
t('enemy move plates drop the parenthetical detail', () => {
  assert.equal(shortMove('Stamp (+4 if 3+ junk)'), 'Stamp');
  assert.equal(shortMove('Clipboard'), 'Clipboard');
  assert.equal(shortMove(''), '');
});
t('hero select labels are readable on the dark panel', () => {
  const lum = (h) => { const v = parseInt(h.slice(1), 16); const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(v >> 16) + 0.7152 * f((v >> 8) & 255) + 0.0722 * f(v & 255); };
  const bg = lum('#1c1512');
  for (const col of ['#9E0F2E', '#FF6A2B', '#C9A227']) { const l = lum(labelColor(col)); assert.ok((l + 0.05) / (bg + 0.05) >= 7, `${col} -> ${labelColor(col)} contrast too low`); }
});
t('Heads, Tails, Teeth: the stake is paid on a win and the text says so', () => {
  const ch = EVENTS.e_coin_flip.choices[0];
  assert.match(ch.text, /net \+60/);
  let wins = 0, losses = 0;
  for (let i = 0; i < 40 && (!wins || !losses); i++) {
    const run = RUN.newRun({ hero: 'marrow', seed: 'coin' + i }); run.gold = 100;
    ch.apply(run, RUN.R);
    if (run.gold === 160) wins++; else { assert.equal(run.gold, 60, 'a loss costs exactly the 40 stake'); losses++; }
  }
  assert.ok(wins && losses, 'both outcomes occur');
});
{
  // tutorial bubbles honour a fixed corner and stay on screen
  const app = await makeApp({ run: RUN.newRun({ hero: 'marrow', seed: 'tip' }), meta: { tips: {}, settings: {} }, audio: { sfx() {}, music() {} } });
  app.register('tipscreen', { draw(a) { maybeTip(a, 'energy', 125, 575, undefined, { pos: { x: 16, y: 80 }, w: 250 }); } });
  app.go('tipscreen'); frames(app, 5);
  assert.ok(app._tipBtn && app._tipBtn.x < 300 && app._tipBtn.y < 260, 'Got it button sits in the fixed corner: ' + JSON.stringify(app._tipBtn)); n++;
}
{
  // reward: the forfeit notes and the relic cards never overlap, and a short list is not left hanging at the top
  const reward = (await import('../graftwork/ui/reward.js')).default;
  const boxes = async (kind, extra) => {
    const run = RUN.newRun({ hero: 'marrow', seed: 'rw' + kind });
    const app = await makeApp({ run, meta: { tips: {}, settings: { tips: false } }, audio: { sfx() {}, music() {} } });
    app.register('reward', reward); app.shared.flow = { route() {}, openDeck() {} };
    run.phase = 'reward'; run.pending = { kind, gold: 20, graft: true, ...extra };
    app.go('reward', { run }); frames(app, 90); return getAll();
  };
  const inter = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const r1 = await boxes('boss', { relicChoices: Object.keys((await import('../graftwork/data/index.js')).RELICS).slice(0, 3), potion: null, relic: null });
  const notes = r1.find((r) => r.id === 'reward-notes'), choices = r1.filter((r) => r.id.startsWith('reward-choice') && r.id !== 'reward-choose');
  assert.ok(choices.length === 3, 'relic cards present');
  if (notes) for (const c of choices) assert.equal(inter(notes, c), 0, 'forfeit notes overlap a relic card');
  const r2 = await boxes('normal', {});
  const row = r2.find((r) => r.id === 'reward-row0');
  assert.ok(row && row.y > 150, 'a short reward list is centred, not stuck under the header: y=' + (row && row.y)); n++;
}
console.log('graftwork_ui_polish ok ' + n);
