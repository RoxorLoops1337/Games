// Thread onboarding: the two one-time callouts (driven by real seam events, stored in meta.tips), the glossary
// (Thread words and every status reachable from tooltips and the codex) and consistent Thread phrasing.
import assert from 'node:assert/strict';
import { makeApp, frames, click } from './graftwork_lib.mjs';
import * as RUN from '../graftwork/engine/run.js';
import * as audio from '../graftwork/ui/audio.js';
import { newCombat, playCard } from '../graftwork/engine/combat.js';
import { newInst } from '../graftwork/engine/cards.js';
import { CARDS, GRAFTS, RELICS, STATUSES, ENEMIES } from '../graftwork/data/index.js';
import { cardLines } from '../graftwork/engine/text.js';
import { onSeamEvent, seamTip } from '../graftwork/ui/seam_ui.js';
import { TIP_TEXTS, threadLesson, skipThreadLesson, tipSeen } from '../graftwork/ui/tutorial.js';
import { KEYWORDS, THREAD_TERMS, glossaryEntry, keywordsIn, keywordSection, statusSection } from '../graftwork/ui/tooltips.js';
import * as L from '../graftwork/ui/combat_layout.js';
import codex from '../graftwork/ui/codex.js';

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('ok', name); };

// fixtures: free one-school skills
for (const s of ['ember', 'rust']) CARDS['ob_' + s] = { id: 'ob_' + s, name: 'OB ' + s, type: 'skill', cost: 0, rarity: 'common', school: s, target: 'none', fx: [], flavor: 'x', flags: {} };
const saved = [];
const mkApp = async (tips = {}, settings = {}) => makeApp({ audio, meta: { settings, tips }, flow: { saveMeta() { saved.push(1); }, RUN } });
const eid = Object.keys(ENEMIES).find((k) => ENEMIES[k].kind === 'normal');
let uid = 0;
function fight() {
  const c = newCombat(RUN.newRun({ hero: 'marrow', seed: 'onb' }), [eid]);
  c.run.hero = ''; for (const e of c.enemies) e.hp = e.maxHp = 99999;
  c.hand = []; c.energy = 99; c.maxEnergy = 99; c.ev.length = 0; return c;
}
function play(app, c, id) {
  const inst = newInst(id, () => 'ob' + uid++);
  const card = { inst, uid: inst.uid, tithed: false, jam: false, costMod: 0, plays: 0, rolled: false, temp: true };
  c.hand.push(card); c.ev.length = 0;
  assert.ok(playCard(c, c.hand.indexOf(card), 0).ok);
  const evs = c.ev.slice(); c.ev.length = 0;
  for (const ev of evs) onSeamEvent(app, ev, { fx: { burst() {}, emit() {}, float() {}, bolt() {}, ring() {}, shake() {}, flash() {} }, entPos: () => ({ x: 800, y: 300 }), c });
  return evs;
}
const tipFor = (app, c) => { app._tipFrame = -1; app.frame += 1; return seamTip(app, c, L.SEAM); };

await t('callouts: chain on the first overlap, cut on the first paid cut, once only', async () => {
  const app = await mkApp(); const c = fight();
  play(app, c, 'ob_ember');
  assert.equal(tipFor(app, c), false, 'one card is not a chain yet');
  play(app, c, 'ob_ember');
  assert.equal(c.seam.len, 2);
  assert.equal(tipFor(app, c), true, 'two overlapping cards show the callout');
  assert.equal(app._tipKey, 'thread_chain');
  // clicking the bubble stores it in meta and it never shows again
  app.shared.meta.tips.thread_chain = 1;
  assert.equal(tipFor(app, c), false);
  assert.ok(tipSeen(app.shared.meta, 'thread_chain'));
  // the cut cashes in: second callout
  play(app, c, 'ob_rust');
  assert.equal(tipFor(app, c), true);
  assert.equal(app._tipKey, 'thread_cut');
  app.shared.meta.tips.thread_cut = 1;
  assert.equal(tipFor(app, c), false);
  // a new fight does not replay either lesson
  const c2 = fight(); play(app, c2, 'ob_ember'); play(app, c2, 'ob_ember'); play(app, c2, 'ob_rust');
  assert.equal(tipFor(app, c2), false);
});
await t('threadLesson respects meta, the tips setting and the unpaid cut', () => {
  const a = { shared: { meta: { tips: {}, settings: {} } } };
  assert.equal(threadLesson(a, { t: 'seamExtend', len: 1 }), null);
  assert.equal(threadLesson(a, { t: 'seamExtend', len: 2 }), 'thread_chain');
  assert.equal(threadLesson(a, { t: 'seamCut', paid: 0, len: 1 }), null, 'an empty cut teaches nothing');
  assert.equal(threadLesson(a, { t: 'seamCut', paid: 2, len: 3 }), 'thread_cut');
  assert.equal(threadLesson(a, { t: 'seamSlack' }), null);
  a.shared.meta.tips.thread = 1; // players who dismissed the old single tip already know the chain
  assert.equal(threadLesson(a, { t: 'seamExtend', len: 2 }), null);
  assert.equal(threadLesson(a, { t: 'seamCut', paid: 2, len: 3 }), 'thread_cut');
  a.shared.meta.settings.tips = false;
  assert.equal(threadLesson(a, { t: 'seamCut', paid: 2, len: 3 }), null, 'tips off means no callouts');
  assert.equal(threadLesson({ shared: {} }, { t: 'seamCut', paid: 2 }), null);
});
await t('skip marks both lessons seen and saves meta', async () => {
  const app = await mkApp(); saved.length = 0;
  skipThreadLesson(app);
  assert.ok(tipSeen(app.shared.meta, 'thread_chain') && tipSeen(app.shared.meta, 'thread_cut'));
  assert.ok(saved.length >= 1);
});
await t('lesson text is short, plain and has no em dash', () => {
  for (const k of ['thread_chain', 'thread_cut']) { assert.ok(TIP_TEXTS[k] && TIP_TEXTS[k].length <= 150, k); assert.ok(!/—|–/.test(TIP_TEXTS[k])); }
});

await t('every Thread term has a glossary entry', () => {
  for (const w of ['Line', 'Stitch', 'Cut', 'Slack', 'Tied', 'Frayed', 'Knot', 'Thread']) {
    assert.ok(THREAD_TERMS.includes(w), w);
    const g = glossaryEntry(w); assert.ok(g && g.text.length > 10 && g.text.length <= 160, w);
    assert.ok(keywordSection(w).text, w);
    assert.deepEqual(keywordsIn(['The ' + w + ' here']).includes(w), true, w + ' underlines in card text');
  }
});
await t('every status (including the 12 afflictions) has a glossary entry and tooltip section', () => {
  const afflictions = ['poison', 'brittle', 'rejection', 'infection', 'numb', 'unpicked', 'cadencelock', 'stagefright', 'dread', 'leaden', 'weightofdebt', 'stitchedup'];
  for (const id of afflictions) assert.ok(STATUSES[id], id + ' exists');
  for (const [id, d] of Object.entries(STATUSES)) {
    const g = glossaryEntry(id); assert.ok(g && g.text && g.text.length > 5, id + ' glossary text');
    assert.equal(glossaryEntry(d.name).title, d.name, id + ' by name');
    assert.ok(KEYWORDS[d.name], id + ' is a keyword');
    for (const nn of [1, 3]) { const s = statusSection(id, nn); assert.ok(s.text, id + ' tooltip text'); assert.ok(!/—/.test(s.text), id); }
  }
  assert.equal(glossaryEntry('nonsense'), null);
});
await t('codex: Statuses tab lists every status readable, Rules tab teaches the Thread words', async () => {
  const app = await mkApp(); app.register('codex', codex); app.push('codex', {}); frames(app, 4);
  const { isSeen } = await import('../graftwork/ui/codex.js');
  for (const id of Object.keys(STATUSES)) assert.equal(isSeen(app, 'statuses', id), true, id);
  for (let i = 0; i < 7; i++) { codex.setTab(i); frames(app, 3); app.mouse.wheel = 300; frames(app, 2); }
  codex.setTab(6); frames(app, 5); click(app, 640, 400); // Rules
  assert.ok(app.ctx.__calls > 100, 'rendered');
});

await t('Thread phrasing: one vocabulary in card, graft and relic text', () => {
  const re = /\b(Line|knot|knots|Slack|Tied|Tie|Cut|cut|cuts|extends|extend|stitch|stitches)\b/;
  const bad = [];
  for (const c of Object.values(CARDS)) { let l = []; try { l = cardLines(c); } catch (e) { continue; } for (const ln of l) { if (/knots? in the Thread/.test(ln)) bad.push(c.id + ': ' + ln); if (/\b(the line|the seam|a seam)\b/.test(ln)) bad.push(c.id + ' lowercase: ' + ln); } }
  for (const g of Object.values(GRAFTS)) for (const s of [g.boon, g.price]) { if (/\b(the line|the seam|in the Thread|chain)\b/.test(s) && re.test(s)) bad.push(g.id + ': ' + s); if (/—/.test(s)) bad.push(g.id + ' em dash'); }
  for (const r of Object.values(RELICS)) { if (/\b(the line|the seam|in the Thread)\b/.test(r.text)) bad.push(r.id + ': ' + r.text); }
  assert.deepEqual(bad, []);
  // extend / cut verbs: grafts that talk about the Line say "extends the Line" or "cuts the Line"
  for (const g of Object.values(GRAFTS)) if (/\bLine\b/.test(g.boon)) assert.ok(!/\b(joins|ends|breaks|snips) the Line\b/.test(g.boon), g.id + ': ' + g.boon);
  for (const k of THREAD_TERMS) assert.ok(!/—/.test(KEYWORDS[k].text));
});

console.log(`${n} graftwork onboarding checks passed`);
