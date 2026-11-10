// The graft table and the reward screen, headless: sew a graft by keys and by clicks, the three ways to decline, reroll, the reward rows
// (elite, boss relic choice, full potion belt); where their tooltips and notes may sit (never on a sibling choice, a Take chip or a relic
// card); and what the table tells you: the HP a card costs per play once grafts stack, and why a graft is refused.
import assert from 'node:assert/strict';
import { makeApp, frames, click, key, wardOpen, WIN } from './graftwork_lib.mjs';
import * as RUN from '../graftwork/engine/run.js';
import { canGraft, cantGraftWhy, cardSpec } from '../graftwork/engine/cards.js';
import { CARDS, GRAFTS, POTIONS, RELICS } from '../graftwork/data/index.js';
import { BUILD_CARDS } from '../graftwork/data/ward.js';
import graft from '../graftwork/ui/graft.js';
import reward from '../graftwork/ui/reward.js';
import { hpPerPlay } from '../graftwork/ui/graft_parts.js';
import { getAll, clear } from '../graftwork/ui/layout_registry.js';

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

// ================= where the tooltips and the notes of these two screens may sit =================
const inter = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const reg = (id) => getAll().find((r) => r.id === id);
async function boot(run, scr, mod) {
  const app = await makeApp({ run, meta: { settings: { tips: false } }, audio: { sfx() {}, music() {} } });
  app.register(scr, mod); app.register('other', { draw() {} });
  app.shared.flow = { route() {}, openDeck() {} };
  app.go(scr, { run }); frames(app, 90);
  return app;
}
// graft table: a hovered patch or card tip never lands on a sibling choice
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
    const isPatch = /patch/.test(t.me); // a patch tip floats over the cards (it must spell out Boon, Price and every definition) but never over the patch column or the tray buttons; a card tip keeps off every sibling
    for (const r of getAll()) if ((isPatch ? /^graft-(patch\d|reroll|decline|sew)/ : /^graft-(patch|card)\d/).test(r.id) && r.id !== t.me) assert.equal(inter(tip, r), 0, `${t.me} tip covers ${r.id}`);
    if (!isPatch) assert.ok(tip.h <= 200, 'tip height capped: ' + tip.h);
  }
  assert.ok(seen >= 3, 'tips were drawn: ' + seen);
}

// reward: the gold row has no tip at all (the row already says it)
{
  const run = RUN.newRun({ hero: 'marrow', seed: 'r3reward' });
  run.phase = 'reward'; run.pending = { kind: 'normal', gold: 20, potion: null, graft: true };
  const app = await boot(run, 'reward', reward);
  const chip = reg('reward-chip0'); app.mouse.x = chip.x + 10; app.mouse.y = chip.y + 10; frames(app, 40); clear(); frames(app, 1);
  assert.equal(getAll().find((r) => r.id === 'tip0'), undefined, 'no tip on the gold row');
}

// reward: the hover tooltip of a row (potion) never covers that row's Take chip
{
  const run = RUN.newRun({ hero: 'marrow', seed: 'rewardtip' });
  const app = await makeApp({ run, meta: {}, audio: { sfx() {}, music() {} } });
  app.register('reward', reward);
  app.shared.flow = { route() {}, openDeck() {} };
  wardOpen(run, 'fight'); RUN.resolveFight(run, WIN()); // the reward of a won Ward fight
  assert.equal(run.phase, 'reward'); Object.assign(run.pending, { gold: 20, potion: Object.keys(POTIONS)[0] });
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
}

// reward: on a boss reward (gold + potion + relic pair + building plan row) the "left behind" notes were drawn over the relic cards.
{
  const relics = Object.values(RELICS).filter((r) => r.rarity === 'boss').map((r) => r.id).slice(0, 3);
  const build = Object.keys(BUILD_CARDS).slice(0, 3);
  for (const [label, sc] of [['desktop', 0], ['phone .64', 0.64], ['phone .54', 0.54], ['phone .46', 0.46]]) {
    const r2 = RUN.newRun({ hero: 'marrow', seed: 'bossrw' });
    const a2 = await makeApp({ run: r2, meta: { settings: {}, tips: {} }, audio: { sfx() {}, music() {} } });
    if (sc) { a2.scale = sc; a2.minPx = 11; }
    a2.register('reward', reward); a2.shared.flow = { route() {}, openDeck() {} };
    // the boss reward as the game makes it: the hero is pulled into the Theatre on the last night and wins
    wardOpen(r2, 'boss'); RUN.resolveFight(r2, WIN());
    assert.equal(r2.phase, 'reward'); assert.equal(r2.pending.kind, 'boss'); assert.equal(r2.pending.buildChoice.length, 3, label + ': a boss reward carries the building plan row');
    Object.assign(r2.pending, { gold: 80, potion: Object.keys(POTIONS)[0], relicChoices: relics.slice(0, 3), buildChoice: build });
    a2.go('reward', { run: r2 }); frames(a2, 120); clear(); frames(a2, 1);
    const regs = getAll(), notes = regs.find((r) => r.id === 'reward-notes');
    assert.ok(notes, label + ': notes shown');
    for (const r of regs.filter((q) => /^reward-(choice\d|choose|row|chip|build)/.test(q.id) || q.id.startsWith('reward-choice'))) assert.equal(inter(notes, r), 0, `${label}: notes over ${r.id}: ${JSON.stringify(notes)} vs ${JSON.stringify(r)}`);
    const cont = regs.find((r) => r.id === 'reward-continue');
    for (const r of regs.filter((q) => q.id.startsWith('reward-choice'))) assert.ok(r.y + r.h <= notes.y + 0.5 && r.y + r.h <= cont.y, `${label}: relic card ${r.id} runs into the footer (${r.y + r.h} vs ${notes.y})`);
  }
}
// reward: the forfeit notes and the relic cards never overlap, and a short list is not left hanging at the top
{
  const boxes = async (kind, extra) => {
    const run = RUN.newRun({ hero: 'marrow', seed: 'rw' + kind });
    const app = await makeApp({ run, meta: { tips: {}, settings: { tips: false } }, audio: { sfx() {}, music() {} } });
    app.register('reward', reward); app.shared.flow = { route() {}, openDeck() {} };
    run.phase = 'reward'; run.pending = { kind, gold: 20, graft: true, ...extra };
    app.go('reward', { run }); frames(app, 90); return getAll();
  };
  const r1 = await boxes('boss', { relicChoices: Object.keys(RELICS).slice(0, 3), potion: null, relic: null });
  const notes = r1.find((r) => r.id === 'reward-notes'), choices = r1.filter((r) => r.id.startsWith('reward-choice') && r.id !== 'reward-choose');
  assert.ok(choices.length === 3, 'relic cards present');
  if (notes) for (const c of choices) assert.equal(inter(notes, c), 0, 'forfeit notes overlap a relic card');
  const r2 = await boxes('normal', {});
  const row = r2.find((r) => r.id === 'reward-row0');
  assert.ok(row && row.y > 150, 'a short reward list is centred, not stuck under the header: y=' + (row && row.y));
}

// ================= what the table tells you =================
// HP stacking: the HP a card costs per play, with the grafts that multiply it
{
  const run = RUN.newRun({ hero: 'marrow', seed: 'r3hp' });
  const tr = run.deck.find((i) => i.id === 'm_transfuse');
  assert.equal(hpPerPlay(cardSpec(tr)), 3);
  assert.equal(hpPerPlay(cardSpec({ ...tr, grafts: ['g_echo_chamber'] })), 9, 'Echo Chamber triples the card\'s own HP cost');
  const cut = run.deck.find((i) => i.id === 'm_cut'); assert.equal(hpPerPlay(cardSpec(cut)), 0);
}
// cantGraftWhy agrees with canGraft and always names a real reason
{
  let refused = 0, vague = 0;
  for (const c of Object.values(CARDS)) for (const g of Object.values(GRAFTS)) for (const have of [[], [Object.keys(GRAFTS)[0]]]) {
    const inst = { uid: 1, id: c.id, grafts: have, up: 0 };
    const why = cantGraftWhy(inst, g.id);
    assert.equal(canGraft(inst, g.id), why === null, `${c.id} + ${g.id}: canGraft and cantGraftWhy disagree (${why})`);
    if (why !== null) { refused++; assert.ok(typeof why === 'string' && why.length > 3 && !/[—–]/.test(why), 'reason text: ' + why); if (why === 'Does not fit this card') vague++; }
  }
  assert.ok(refused > 1000);
  assert.ok(vague / refused < 0.02, `too many vague refusals: ${vague}/${refused}`);
}
// cantGraftWhy gives the concrete reasons
{
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
  try { const sk = { uid: 6, id: 'm_cut', grafts: [], up: 0 }; if (!canGraft(sk, 'g_kiln_heart')) assert.equal(cantGraftWhy(sk, 'g_kiln_heart'), 'Test reason'); } finally { if (keep === undefined) delete g.why; else g.why = keep; }
}
console.log('graftwork_ui_graft OK');
