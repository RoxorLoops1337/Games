// Glossary: every rules word in every text the game shows resolves to a definition, and hovering the element that shows it explains it.
import assert from 'node:assert/strict';
import { makeApp, frames } from './graftwork_lib.mjs';
import * as RUN from '../graftwork/engine/run.js';
import { cardSpec } from '../graftwork/engine/cards.js';
import { cardLines, opText } from '../graftwork/engine/text.js';
import { CARDS, GRAFTS, RELICS, POTIONS, EVENTS, ENEMIES, STATUSES, SCHOOLS } from '../graftwork/data/index.js';
import { specGloss, glossaryFor, glossaryEntry, keywordsIn, KEYWORDS, tipSections, defineTerm } from '../graftwork/ui/tooltips.js';
import { getAll } from '../graftwork/ui/layout_registry.js';
import graft from '../graftwork/ui/graft.js';
import shop from '../graftwork/ui/shop.js';
import reward from '../graftwork/ui/reward.js';
import forge from '../graftwork/ui/forge.js';
import event from '../graftwork/ui/event.js';
import deckview from '../graftwork/ui/deckview.js';
import * as audioMod from '../graftwork/ui/audio.js';
import combat from '../graftwork/ui/combat.js';
import { GRAFT_LIST } from '../graftwork/data/index.js';

// ---- (1) the resolver ----
const REQUIRED = ['Gilt', 'Burn', 'Bleed', 'Poison', 'Charge', 'Echo', 'Strength', 'Dexterity', 'Weak', 'Vulnerable', 'Frail', 'Thorns', 'Ritual', 'Plated', 'Barricade', 'Intangible', 'Regen', 'Marked', 'Stunned',
  'Line', 'Stitch', 'Cut', 'Knot', 'Slack', 'Tied', 'Frayed', 'Thread', 'Budget', 'Strain', 'Tithe', 'Backfire', 'Overload', 'Shatter', 'Temper', 'Exhaust', 'Retain', 'Jam', 'Bare', 'Weight', 'Claim', 'Ringing',
  'Ember', 'Hoard', 'Blood', 'Rust', 'Static', 'Gilded', 'Attack', 'Skill', 'Power', 'Pierce', 'X cost', 'Safe', 'Greedy', 'Weird', 'After'];
for (const t of REQUIRED) { const g = glossaryFor(['Safe', 'Greedy', 'Weird', 'After'].includes(t) ? t.toUpperCase() : t, { max: 1 }); assert.ok(g.length === 1 && g[0].definition.length > 8, 'resolves: ' + t); }
for (const id of Object.keys(STATUSES)) { const e = glossaryEntry(id); assert.ok(e && e.text && e.text.length > 4, 'status id resolves: ' + id); const e2 = glossaryEntry(STATUSES[id].name); assert.ok(e2 && e2.text, 'status name resolves: ' + STATUSES[id].name); }
for (const w of ['pierce', 'jammed', 'bare', 'x cost', 'W2', 'SAFE', 'GREEDY', 'WEIRD', 'AFTER']) assert.equal(glossaryFor(w).length, 1, 'loose / tag word: ' + w);
{ // live numbers
  const g = glossaryFor('Gain 4 Gilt when played.')[0];
  assert.equal(g.term, 'Gilt'); assert.equal(g.definition, 'Gain 4 gold at the end of combat.'); assert.equal(g.title, 'Gilt 4');
  assert.match(glossaryFor('Gilt')[0].definition, /^Gain N gold at the end of combat/);
  assert.match(glossaryFor('Apply 3 Burn.')[0].definition, /3 damage at turn start.*Ignores Block/);
  assert.match(glossaryFor('Charge')[0].definition, /Every 2 Charge adds 1 to each hit/);
  assert.match(defineTerm('Weight', 2), /counts 2 against your Budget/);
  assert.ok(glossaryFor('Burn Bleed Poison Echo Charge Gilt Strength', { max: 9 }).length === 7);
  assert.equal(glossaryFor('Burn Bleed Poison Echo Charge Gilt Strength').length, 3, 'default max is 3');
  assert.equal(glossaryFor('Block, Attack and Burn')[0].term, 'Burn', 'statuses before basics');
}

// ---- (2) data sweep: every keyword in every shown text resolves ----
const failures = [];
const check = (where, texts) => {
  for (const t of texts.flat(9)) {
    if (typeof t !== 'string' || !t) continue;
    for (const kw of keywordsIn(t)) { const g = glossaryFor(t, { max: 99 }).find((x) => x.term === kw); if (!g || !g.definition) failures.push(`${where}: ${kw}`); }
  }
};
let scanned = 0;
for (const c of Object.values(CARDS)) for (const up of [0, 1]) { try { check('card ' + c.id, [cardLines(cardSpec({ uid: 0, id: c.id, grafts: [], up }))]); scanned++; } catch (e) { /* needs a run */ } }
for (const g of Object.values(GRAFTS)) check('graft ' + g.id, [g.boon, g.price]);
for (const r of Object.values(RELICS)) check('relic ' + r.id, [r.text]);
for (const p of Object.values(POTIONS)) check('potion ' + p.id, [p.text]);
for (const ev of Object.values(EVENTS)) check('event ' + ev.id, [ev.text, (ev.choices || []).map((c) => [c.label, c.text])]);
for (const e of Object.values(ENEMIES)) for (const [mid, m] of Object.entries(e.moves || {})) check(`enemy ${e.id}.${mid}`, [m.name, m.note, m.tip, (m.fx || []).map((op) => { try { return opText(op, 0); } catch (x) { return ''; } })]);
for (const s of Object.values(SCHOOLS)) check('school ' + s.id, [s.blurb, s.resonance[3], s.resonance[6]]);
assert.ok(scanned > 100, 'cards scanned: ' + scanned);
assert.deepEqual(failures, [], 'keywords without a definition:\n' + failures.join('\n'));
// the keyword in a graft's own text is explained by its tip: every Boon / Price word is found by the resolver
for (const g of Object.values(GRAFTS)) { const kws = keywordsIn([g.boon, g.price]); const got = glossaryFor([g.boon, g.price], { max: 99 }).map((x) => x.term); for (const k of kws) assert.ok(got.includes(k), `${g.id} ${k}`); }

// ---- (3) hover: the tip beside an element explains every keyword that element names ----
const reg = (id) => getAll().find((r) => r.id === id);
async function boot(run, name, mod) {
  const app = await makeApp({ run, meta: { settings: { tips: false } }, audio: { sfx() {}, music() {} } });
  app.register(name, mod); app.register('other', { draw() {} }); app.register('deckview', deckview);
  app.shared.flow = { route() {}, openDeck() {}, META: null };
  app.go(name, { run }); frames(app, 90);
  return app;
}
const hover = (app, r) => { app.mouse.x = r.x + r.w / 2; app.mouse.y = r.y + Math.min(r.h / 2, 60); frames(app, 40); };
const tipDefs = (app) => (app.tip ? tipSections(app.tip).flat().map((s) => `${s.title}|${s.text}`).join('\n') : '');
function expectTip(app, label, sources, opts = {}) {
  const want = glossaryFor(sources, { max: 3, school: opts.school, types: opts.types });
  assert.ok(want.length > 0, `${label}: scenario has keywords`);
  const have = tipDefs(app);
  assert.ok(app.tip, `${label}: a tip is shown`);
  for (const w of want) if (!(opts.titled || []).includes(w.term)) assert.ok(have.includes(w.definition), `${label}: tip explains ${w.term} (${w.definition})\n--- tip:\n${have}`);
}
{ // graft offer: Leaf Gilt
  const run = RUN.newRun({ hero: 'marrow', seed: 'gloss1' });
  RUN.startGraftPick(run);
  run.pending.offer.grafts[0] = 'g_leaf_gilt';
  const raw = run.pending.offer.grafts;
  const app = await boot(run, 'graft', graft);
  const i = raw.findIndex((x) => x === 'g_leaf_gilt');
  const r = reg('graft-patch' + (i < 0 ? 0 : i));
  hover(app, r);
  expectTip(app, 'graft patch Leaf Gilt', [GRAFTS.g_leaf_gilt.boon, GRAFTS.g_leaf_gilt.price, 'SAFE'], { school: 'gilded' });
  assert.ok(tipDefs(app).includes('Gain 4 gold at the end of combat.'), 'Leaf Gilt tip says what Gilt does:\n' + tipDefs(app));
  // every patch and every card in the offer
  for (let j = 0; j < raw.length; j++) { const g = GRAFTS[raw[j]]; hover(app, reg('graft-patch' + j)); expectTip(app, 'patch ' + g.id, [g.boon, g.price, String(g.tier).toUpperCase()], { school: g.school }); }
  // the tip never covers a sibling patch
  const tip0 = getAll().find((x) => x.id === 'tip0'); assert.ok(tip0, 'tip panel registered');
}
{ // shop: card, patch, relic, potion
  const run = RUN.newRun({ hero: 'marrow', seed: 'gloss2' }); run.gold = 999; run.phase = 'shop'; run.pending = RUN.makeShop(run);
  const sh = run.pending;
  const app = await boot(run, 'shop', shop);
  const gi = sh.grafts.findIndex((x) => !x.sold);
  if (gi >= 0) { const g = GRAFTS[sh.grafts[gi].id]; hover(app, reg('shop-graft' + gi)); expectTip(app, 'shop patch ' + g.id, [g.boon, g.price, String(g.tier).toUpperCase()], { school: g.school }); }
  for (let i = 0; i < sh.relics.length; i++) { const r = RELICS[sh.relics[i].id]; if (!keywordsIn(r.text).length) continue; hover(app, reg('shop-relic' + i)); expectTip(app, 'shop relic ' + r.id, [r.text]); }
  for (let i = 0; i < sh.potions.length; i++) { const p = POTIONS[sh.potions[i].id]; if (!keywordsIn(p.text).length) continue; hover(app, reg('shop-potion' + i)); expectTip(app, 'shop potion ' + p.id, [p.text]); }
  for (let i = 0; i < sh.cards.length; i++) { const sp = cardSpec({ uid: 0, id: sh.cards[i].id, grafts: [], up: 0 }); if (!keywordsIn(cardLines(sp)).length) continue; hover(app, reg('shop-card' + i)); assert.ok(app.tip, 'shop card tip'); expectTip(app, 'shop card ' + sp.id, [cardLines(sp)], { types: sp.type, school: sp.school }); }
}
{ // reward: a potion row and a boss relic choice
  const pid = Object.keys(POTIONS).find((id) => keywordsIn(POTIONS[id].text).length);
  const run = RUN.newRun({ hero: 'marrow', seed: 'gloss3' });
  run.phase = 'reward'; run.pending = { kind: 'normal', gold: 20, potion: pid, graft: true };
  const app = await boot(run, 'reward', reward);
  const rows = getAll().filter((r) => /^reward-row\d/.test(r.id));
  const row = rows.find((r) => { hover(app, r); return app.tip && tipDefs(app).includes(POTIONS[pid].name); });
  assert.ok(row, 'potion row has a tip');
  expectTip(app, 'reward potion ' + pid, [POTIONS[pid].text]);
}
{ // forge options and the event choices
  const run = RUN.newRun({ hero: 'marrow', seed: 'gloss4' }); run.phase = 'forge'; run.pending = { kind: 'forge', used: 0 };
  const app = await boot(run, 'forge', forge);
  const opts = getAll().filter((r) => /^forge-opt\d/.test(r.id)); assert.ok(opts.length >= 4);
  let shown = 0; for (const o of opts) { hover(app, o); if (app.tip) shown++; } assert.ok(shown >= 4, 'every forge option has a tip');
  const temper = opts.map((o) => { hover(app, o); return app.tip; }).find((t) => t && t.title === 'Temper');
  if (temper) assert.ok(tipDefs(app).length > 0);
}
{
  let checked = 0;
  for (const ev of Object.values(EVENTS)) {
    if (checked >= 4 || !(ev.choices || []).some((c) => keywordsIn([c.label, c.text]).length)) continue;
    const run = RUN.newRun({ hero: 'marrow', seed: 'gloss5' }); run.phase = 'event'; run.pending = { kind: 'event', id: ev.id, result: null }; run.gold = 500;
    const app = await boot(run, 'event', event); frames(app, 600);
    const ch = RUN.eventChoices(run);
    for (let i = 0; i < ch.length; i++) {
      const c = ch[i]; if (!keywordsIn([c.label, c.text]).length) continue;
      const r = reg('event-choice' + i); if (!r) continue;
      hover(app, r); expectTip(app, `event ${ev.id} choice ${i}`, [c.label, c.text || ''], { titled: [] }); checked++;
    }
  }
  assert.ok(checked >= 2, 'event choices checked: ' + checked);
}
{ // deck view: a grafted card
  const run = RUN.newRun({ hero: 'marrow', seed: 'gloss6' });
  const inst = run.deck.find((i) => !i.id.startsWith('j_')); RUN.applyGraft(run, inst.uid, 'g_leaf_gilt', { keepPhase: true, free: true });
  const app = await makeApp({ run, meta: { settings: {} }, audio: { sfx() {}, music() {} } });
  app.register('deckview', deckview); app.register('other', { draw() {} }); app.shared.flow = { route() {}, openDeck() {} };
  app.go('deckview', { run }); frames(app, 60);
  const sp = cardSpec(inst); let found = false;
  for (let gy = 160; gy < 560 && !found; gy += 40) for (let gx = 40; gx < 700 && !found; gx += 50) {
    app.mouse.x = gx; app.mouse.y = gy; frames(app, 30);
    if (app.tip && tipDefs(app).includes('Gain 4 gold at the end of combat.')) found = true;
  }
  assert.ok(found, 'deck view: hovering a Leaf Gilt card explains Gilt');
  void sp;
}

// ---- (4) COMPLETENESS: every hover tip is ONE compact panel. It names the item's own Boon / Price (or rules text) and gives one short definition per rules word. ----
// Space is limited, so a tip may show only the first definitions plus a visible '+N more (hold)' marker; while the player HOLDS (Shift) the panel shows every
// definition in full. Nothing is silently dropped: shown + hidden = every word the item names, and the held panel has them all. A card never defines its own type or school.
const SCALES = [1, 0.64, 0.54];
async function bootScaled(run, name, mod, scale, extra = {}) {
  const app = await makeApp({ run, meta: { settings: { tips: false } }, audio: { sfx() {}, music() {} }, ...extra });
  if (scale < 1) { app.scale = scale; app.minPx = 11; }
  app.ctx.measureText = (t) => { const m = /(\d+(?:\.\d+)?)px/.exec(String(app.ctx.font || '')); const sz = m ? +m[1] : 16; return { width: String(t).length * sz * (/bold/.test(String(app.ctx.font || '')) ? 0.56 : 0.52) }; };
  app.register(name, mod); app.register('other', { draw() {} }); app.register('deckview', deckview);
  app.shared.flow = { route() {}, openDeck() {}, META: null };
  app.go(name, { run }); frames(app, 90);
  return app;
}
const hit = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1;
// the terms an item's own sources need, resolved exactly as the tip does (without the max-3 cap)
const needed = (tip, extra = []) => { const o = tip.o || {}; return glossaryFor([tip.text || '', tip.lines || [], o.gloss || [], extra], { max: 99, school: o.school, types: o.types, ids: o.ids, terms: o.terms }); };
const TYPE_NAMES = ['Attack', 'Skill', 'Power', 'Junk'];
function tipComplete(app, label, { must = [], extra = [], titled = [], src = null, school, types } = {}) {
  const tip = app.tip || { o: { school, types } }, L = app.tipLayout; // combat HUD tips are queued (no app.tip): pass src, the item's own sources
  assert.ok((app.tip || src) && L && L.frame === app.frame, `${label}: a tip is drawn`);
  const secsOf = (Lx) => Lx.panels.flatMap((p) => p.secs);
  const textOf = (secs) => secs.map((x) => `${x.title}\n${x.text}\n${(x.why || []).join('\n')}`).join('\n');
  const secs = secsOf(L), all = textOf(secs);
  assert.equal(L.panels.length, 1, `${label}: ONE panel, not stacked boxes`);
  for (const m of must) assert.ok(all.includes(m), `${label}: tip says "${m}"\n--- drawn:\n${all}`);
  const want = (src ? glossaryFor([src, extra], { max: 99, school, types }) : needed(tip, extra)).filter((g) => !(titled.includes(g.term) || (tip.title && tip.title.replace(/\s*\d+$/, '') === g.term)));
  const drawn = want.filter((g) => secs.some((x) => x.title.startsWith(g.term) && x.text.includes(g.definition)));
  const missing = want.length - drawn.length;
  if (missing) { const mk = secs.find((x) => /^\+\d+ more \(hold\)$/.test(x.title)); assert.ok(mk, `${label}: ${missing} definitions are not shown and there is no '+N more (hold)' marker\n${all}`); assert.equal(+mk.title.match(/\d+/)[0], missing, `${label}: the marker counts the hidden words`); assert.equal(L.hidden, missing); }
  else assert.ok(!secs.some((x) => /more \(hold\)/.test(x.title)), `${label}: no marker when nothing is hidden`);
  assert.ok(!/…/.test(all), `${label}: no definition was cut with an ellipsis`);
  for (const t of TYPE_NAMES) assert.ok(!secs.some((x) => x.title === t && x.text === KEYWORDS[t].text) || !types || String(types).toLowerCase() !== t.toLowerCase(), `${label}: the card's own type ${t} is not explained`);
  if (school && SCHOOLS[school]) assert.ok(!secs.some((x) => x.title === SCHOOLS[school].name && /school\./.test(x.text)), `${label}: the own school is not explained`);
  const r = L.rect;
  assert.ok(r.x >= 5.5 && r.y >= 5.5 && r.x + r.w <= 1274.5 && r.y + r.h <= 714.5, `${label}: tip inside the stage ${JSON.stringify(r)}`);
  for (const p of L.panels) p.secs.forEach((x, i) => { const n = p.secs[i + 1]; if (n) assert.ok(x.y + x.h <= n.y + 0.5, `${label}: sections "${x.title}" and "${n.title}" overlap`); assert.ok(x.y + x.h <= p.y + p.h - 4, `${label}: "${x.title}" inside its panel`); });
  // HOLD (Shift): every definition in full, no marker
  if (missing) {
    app.keys.add('Shift'); frames(app, 4);
    const H = app.tipLayout; assert.ok(H && H.frame === app.frame && H.hold, `${label}: holding Shift opens the details`);
    const hs = secsOf(H);
    for (const g of want) assert.ok(hs.some((x) => x.title.startsWith(g.term) && x.text.includes(g.definition)), `${label}: held tip defines ${g.term} in full ("${g.definition}")\n--- drawn:\n${textOf(hs)}`);
    assert.ok(!hs.some((x) => /more \(hold\)/.test(x.title)), `${label}: nothing is hidden while held`);
    assert.ok(H.rect.x >= 5.5 && H.rect.y >= 5.5 && H.rect.x + H.rect.w <= 1274.5 && H.rect.y + H.rect.h <= 714.5, `${label}: held tip inside the stage`);
    app.keys.delete('Shift'); frames(app, 3);
  }
  return L;
}
// the richest grafts (most rules words in Boon + Price) plus the ones the owner reported
const RICH = GRAFT_LIST.map((g) => ({ id: g.id, n: glossaryFor([g.boon, g.price], { max: 99, school: g.school }).length })).sort((a, b) => b.n - a.n).slice(0, 6).map((x) => x.id);
const SWEEP = [...new Set(['g_reef_knot', 'g_scorch_thread', 'g_vampire_teeth', 'g_leaf_gilt', ...RICH])];
for (const sc of SCALES) {
  { // graft offer: every patch tip has Boon, Price, a definition per word, tier and weight, and stays off the patch column and the tray buttons
    for (let k = 0; k < SWEEP.length; k += 3) {
      const run = RUN.newRun({ hero: 'marrow', seed: 'w5g' + k }); RUN.startGraftPick(run);
      SWEEP.slice(k, k + 3).forEach((gid, j) => { run.pending.offer.grafts[j] = gid; });
      const app = await bootScaled(run, 'graft', graft, sc);
      for (let j = 0; j < 3; j++) {
        const g = GRAFTS[run.pending.offer.grafts[j]]; hover(app, reg('graft-patch' + j));
        const L = tipComplete(app, `graft ${g.id} @${sc}`, { must: [`Boon: ${g.boon}`, `Price: ${g.price}`], extra: ['W' + g.weight, String(g.tier).toUpperCase()] });
        for (const id of ['graft-patch0', 'graft-patch1', 'graft-patch2', 'graft-reroll', 'graft-decline', 'graft-sew']) { const r = reg(id); if (r) assert.ok(!hit(L.rect, r), `graft ${g.id} @${sc}: tip covers ${id}`); }
      }
    }
    // the owner's report: Reef Knot explains Line, Cut, Jam, Echo as a status
    const run = RUN.newRun({ hero: 'marrow', seed: 'w5reef' }); RUN.startGraftPick(run); run.pending.offer.grafts[1] = 'g_reef_knot';
    const app = await bootScaled(run, 'graft', graft, sc); hover(app, reg('graft-patch1'));
    app.keys.add('Shift'); frames(app, 4); // a rich patch: the compact panel keeps '+N more (hold)', the held panel explains every word
    const txt = app.tipLayout.panels.flatMap((p) => p.secs).map((x) => `${x.title}|${x.text}`).join('\n');
    for (const t of ['Line', 'Cut', 'Jam', 'Echo 1|Your next card plays twice', 'Weight', 'Greedy']) assert.ok(txt.includes(t), `Reef Knot @${sc} explains ${t}\n${txt}`);
    app.keys.delete('Shift');
  }
  { // shop: patches, relics, potions, cards
    const run = RUN.newRun({ hero: 'marrow', seed: 'w5s' }); run.gold = 999; run.phase = 'shop'; run.pending = RUN.makeShop(run);
    const sh = run.pending; SWEEP.slice(0, sh.grafts.length).forEach((gid, i) => { sh.grafts[i].id = gid; });
    const app = await bootScaled(run, 'shop', shop, sc);
    for (let i = 0; i < sh.grafts.length; i++) { const g = GRAFTS[sh.grafts[i].id]; hover(app, reg('shop-graft' + i)); tipComplete(app, `shop patch ${g.id} @${sc}`, { must: [`Boon: ${g.boon}`, `Price: ${g.price}`], extra: ['W' + g.weight] }); }
    for (let i = 0; i < sh.relics.length; i++) { const r = RELICS[sh.relics[i].id]; if (!keywordsIn(r.text).length) continue; hover(app, reg('shop-relic' + i)); tipComplete(app, `shop relic ${r.id} @${sc}`, { must: [r.text] }); }
    for (let i = 0; i < sh.potions.length; i++) { const p = POTIONS[sh.potions[i].id]; if (!keywordsIn(p.text).length) continue; hover(app, reg('shop-potion' + i)); tipComplete(app, `shop potion ${p.id} @${sc}`, { must: [p.text] }); }
    for (let i = 0; i < sh.cards.length; i++) { const sp = cardSpec({ uid: 0, id: sh.cards[i].id, grafts: [], up: 0 }); if (!keywordsIn(cardLines(sp)).length) continue; hover(app, reg('shop-card' + i)); tipComplete(app, `shop card ${sp.id} @${sc}`, { extra: [cardLines(sp)] }); }
  }
  { // forge options
    const run = RUN.newRun({ hero: 'marrow', seed: 'w5f' }); run.phase = 'forge'; run.pending = { kind: 'forge', used: 0 };
    const app = await bootScaled(run, 'forge', forge, sc);
    for (const o of getAll().filter((r) => /^forge-opt\d/.test(r.id))) { hover(app, o); if (app.tip && app.tip.text) tipComplete(app, `forge ${o.id} @${sc}`, { must: [app.tip.text] }); }
  }
  { // reward: relic choice and potion row
    const pid = Object.keys(POTIONS).find((id) => keywordsIn(POTIONS[id].text).length);
    const run = RUN.newRun({ hero: 'marrow', seed: 'w5r' }); run.phase = 'reward'; run.pending = { kind: 'normal', gold: 20, potion: pid, graft: true };
    const app = await bootScaled(run, 'reward', reward, sc);
    for (const r of getAll().filter((x) => /^reward-row\d/.test(x.id))) { hover(app, r); if (app.tip && app.tipLayout && keywordsIn(JSON.stringify(app.tip.o && app.tip.o.gloss || '')).length) tipComplete(app, `reward ${r.id} @${sc}`); }
  }
  { // deck view: a card carrying two grafts explains every word on the card and in both grafts
    const run = RUN.newRun({ hero: 'marrow', seed: 'w5d' });
    const inst = run.deck.find((i) => !i.id.startsWith('j_'));
    for (const gid of ['g_reef_knot', 'g_scorch_thread']) RUN.applyGraft(run, inst.uid, gid, { keepPhase: true, free: true });
    const app = await bootScaled(run, 'deckview', deckview, sc); let done = false;
    for (let gy = 160; gy < 560 && !done; gy += 40) for (let gx = 40; gx < 700 && !done; gx += 50) {
      app.mouse.x = gx; app.mouse.y = gy; frames(app, 30);
      if (app.tip && JSON.stringify(app.tip.o && app.tip.o.gloss || '').includes('gain 1 Echo')) { tipComplete(app, `deck card with grafts @${sc}`); done = true; }
    }
    assert.ok(done, `deck view card with grafts found @${sc}`);
  }
  { // the Ward: every building card (reward pick) names its rooms and words, and each gets a definition
    const run = RUN.newRun({ hero: 'marrow', seed: 'w5w' }); run.phase = 'reward'; run.pending = RUN.fightRewards(run, 'elite', {}); run.pending.buildChoice = run.pending.buildChoice || ['b_night_shift', 'b_lamp_oil', 'b_scrub_in'];
    const app = await bootScaled(run, 'reward', reward, sc); let n = 0;
    for (const r of getAll().filter((x) => /^reward-build\d/.test(x.id))) { hover(app, r); if (app.tip && app.tip.o && app.tip.o.terms && app.tip.o.terms.length) { tipComplete(app, `ward building card ${r.id} @${sc}`, { must: [app.tip.text] }); n++; } }
    assert.ok(n >= 1, `ward building cards checked @${sc}: ${n}`);
  }
  { // combat: a hand card carrying two grafts
    const run = RUN.newRun({ hero: 'marrow', seed: 'w5c' }); const inst = run.deck.find((i) => !i.id.startsWith('j_') && CARDS[i.id].type === 'attack');
    for (const gid of ['g_reef_knot', 'g_scorch_thread']) RUN.applyGraft(run, inst.uid, gid, { keepPhase: true, free: true });
    run.deck = run.deck.filter((i) => i.uid === inst.uid || run.deck.indexOf(i) < 4); // the grafted card is sure to be in the opening hand
    run.phase = 'combat'; run.pending = { kind: 'combat', fightKind: 'normal', enemies: ['bedpan_slime'] };
    const app = await bootScaled(run, 'combat', combat, sc, { audio: audioMod }); frames(app, 120);
    const rs = getAll().filter((r) => /^hand_/.test(r.id)); let seen = 0;
    const gs = ['g_reef_knot', 'g_scorch_thread'].map((id) => GRAFTS[id]), sp = cardSpec(inst);
    for (const r of rs) { hover(app, r); if (app.tipLayout && app.tipLayout.frame === app.frame && JSON.stringify(app.tipLayout.panels).includes('Reef Knot')) { tipComplete(app, `combat hand card ${r.id} @${sc}`, { src: specGloss(sp), must: gs.flatMap((g) => [`Boon: ${g.boon}`, `Price: ${g.price}`]), school: sp.school, types: sp.type }); seen++; } }
    assert.ok(seen >= 1 || rs.length === 0, `combat hand: a grafted card tip was checked @${sc}`);
  }
}
console.log('graftwork glossary ok');
