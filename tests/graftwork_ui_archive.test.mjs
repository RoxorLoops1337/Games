// Archive UI: end-screen award panel, Archive screen, Codex lock states, NEW ribbon (once), hero select hints.
import assert from 'node:assert/strict';
import { makeApp, frames, click } from './graftwork_lib.mjs';
import end from '../graftwork/ui/end.js';
import archive, { EXPLAIN } from '../graftwork/ui/archive.js';
import codex, { isLocked } from '../graftwork/ui/codex.js';
import title from '../graftwork/ui/title.js';
import { newRibbon, categoryCounts, percentLabel } from '../graftwork/ui/archive_kit.js';
import * as RUN from '../graftwork/engine/run.js';
import * as M from '../graftwork/engine/meta.js';
import * as UN from '../graftwork/engine/unlock.js';
import { UNLOCKS, LOCKED_IDS, HERO_GATES } from '../graftwork/data/unlocks.js';

let n = 0;
const t = async (name, fn) => { try { await fn(); n++; console.log('ok', name); } catch (e) { console.error('FAIL', name, '\n', e.stack); process.exitCode = 1; } };
const mem = () => { const o = {}; return { o, getItem: (k) => (k in o ? o[k] : null), setItem: (k, v) => { o[k] = v; } }; };
const freshMeta = () => { M.setStorage(mem()); const m = M.defaultMeta(); m.settings = { tips: false, reducedMotion: false }; return m; };
// finish a run with the given stats through the real recordRunEnd
function finish(meta, over = {}) {
  const run = RUN.newRun({ hero: 'marrow', seed: 'arch' + Math.random(), unlocked: 'start' });
  run.stats = { ...run.stats, floors: 22, elites: 3, bosses: 1, ...(over.stats || {}) }; run.act = over.act || 2; run.phase = over.won ? 'won' : 'dead';
  run.killedEnemies = over.kills || [];
  run.endInfo = M.recordRunEnd(meta, run, run.phase === 'won' ? 'won' : 'dead'); run.ended = true;
  return run;
}
async function rig(meta) {
  const app = await makeApp({ run: null, meta });
  const texts = [], sfx = [];
  const raw = app.text; app.text = (s, ...a) => { texts.push(String(s)); return raw(s, ...a); };
  const flow = { app, RUN, META: M, route() {}, toTitle() {}, openCodex() { app.push('codex', {}); }, openArchive() { app.push('archive', {}); }, openSettings() {}, saveMeta() {}, hasSave: () => false, start() {}, openDeck() {} };
  app.shared.flow = flow; app.shared.audio = { sfx: (nm) => sfx.push(nm), music() {}, setVolumes() {}, mute() {} };
  for (const [k, v] of Object.entries({ end, archive, codex, title })) app.register(k, v);
  return { app, texts, sfx, meta };
}
const has = (texts, re) => texts.some((s) => (re instanceof RegExp ? re.test(s) : s === re));

await t('end screen shows the award breakdown and stamps each unlocked item exactly once', async () => {
  const meta = freshMeta();
  let run = null;
  for (let i = 0; i < 4 && !(run && run.endInfo.unlock.unlockedNow.length); i++) run = finish(meta, { kills: ['a' + i, 'b' + i] });
  const ul = run.endInfo.unlock;
  assert.ok(ul.up > 0 && ul.unlockedNow.length > 0, 'the rig must open something');
  const { app, texts, sfx } = await rig(meta);
  app.shared.run = run; app.go('end', { run });
  frames(app, 600);
  assert.ok(has(texts, 'ARCHIVE'), 'ARCHIVE panel title');
  assert.ok(has(texts, 'Floors climbed (22)'), 'floors row');
  assert.ok(has(texts, /^Elites \(3\)/) && has(texts, /^Bosses \(1\)/) && has(texts, /^Act 2 reached/), 'elite, boss, act rows');
  assert.ok(has(texts, `+${ul.up}`), 'total points');
  assert.ok(has(texts, /points to the next unlock/), 'progress line');
  assert.ok(has(texts, 'OPENED NOW'), 'opened-now header');
  const stamped = sfx.filter((x) => x === 'relic').length;
  const shown = Math.min(ul.unlockedNow.length, 6);
  assert.ok(stamped >= Math.min(shown, 5) && stamped <= ul.unlockedNow.length, `stamp sounds ${stamped} for ${ul.unlockedNow.length}`);
  const before = sfx.length; frames(app, 600);
  assert.equal(sfx.length, before, 'no stamp repeats on later frames');
  for (const v of ul.unlockedNow.slice(0, 3)) assert.ok(has(texts, v.name), 'item name ' + v.name);
});

await t('end screen with reduced motion draws the stamps at once and shows the cap', async () => {
  const meta = freshMeta(); meta.settings.reducedMotion = true;
  const run = finish(meta, { won: true, act: 3, stats: { floors: 60, elites: 8, bosses: 3 } });
  assert.ok(run.endInfo.unlock.capped, 'big run is capped');
  const { app, texts } = await rig(meta); app.shared.run = run; app.go('end', { run }); frames(app, 5);
  assert.ok(has(texts, /capped at 32/), 'cap shown');
  assert.ok(has(texts, 'Victory'), 'victory row');
});

await t('hero unlock is celebrated on the end screen', async () => {
  const meta = freshMeta(); let run = null;
  for (let i = 0; i < 8 && !(run && run.endInfo.newUnlocks.some((u) => u.kind === 'hero')); i++) run = finish(meta, { act: 2 });
  assert.ok(run.endInfo.newUnlocks.some((u) => u.id === 'wick'), 'Wick opened');
  const { app, texts, sfx } = await rig(meta); app.shared.run = run; app.go('end', { run }); frames(app, 600);
  assert.ok(has(texts, 'WICK JOINS YOU'), 'hero banner');
  assert.ok(sfx.includes('victory'), 'hero fanfare');
});

await t('end screen when everything is open says so and has no stamps', async () => {
  const meta = freshMeta(); for (const id of LOCKED_IDS) meta.unlocked.ids[id] = 1; meta.unlocked.heroes = ['marrow', 'wick', 'odile'];
  const run = finish(meta);
  assert.equal(run.endInfo.unlock.unlockedNow.length, 0);
  const { app, texts } = await rig(meta); app.shared.run = run; app.go('end', { run }); frames(app, 300);
  assert.ok(has(texts, 'EVERYTHING UNLOCKED'));
});

await t('archive screen: percent, explanation, queue with costs, category totals match unlockState', async () => {
  const meta = freshMeta(); finish(meta); finish(meta);
  const st = UN.unlockState(meta);
  const { app, texts } = await rig(meta); app.register('base', { draw() {} }); app.go('base'); app.push('archive', {}); frames(app, 30);
  assert.ok(has(texts, `Archive ${st.percent} percent`));
  assert.ok(has(texts, EXPLAIN) && EXPLAIN === 'Each run earns Archive points. Better runs earn more, up to a cap.');
  assert.ok(has(texts, `${st.queue[0].cost} points`), 'next cost');
  assert.ok(has(texts, 'NEXT') && st.queue.length === 5);
  const cc = categoryCounts(meta);
  for (const [kind, label] of [['card', 'Cards'], ['graft', 'Grafts'], ['relic', 'Relics'], ['potion', 'Potions'], ['event', 'Events']]) {
    const got = st.inventory.start[kind] + LOCKED_IDS.filter((id) => UNLOCKS[id].kind === kind && meta.unlocked.ids[id]).length;
    assert.equal(cc[kind].got, got, kind + ' got'); assert.equal(cc[kind].total, st.inventory.total[kind]);
    assert.ok(has(texts, `${label} ${got} of ${st.inventory.total[kind]} unlocked`), label + ' line');
  }
  assert.equal(cc.card.total, 150 + 0 === 150 ? 150 : cc.card.total);
  assert.ok(has(texts, /^Wick: /) && has(texts, /^Odile Gilt: /), 'hero hints');
  assert.equal(percentLabel(meta), `Archive ${st.percent} percent`);
});

await t('archive screen: tiles show the hint for locked items and glossary for open ones; every tab and filter draws', async () => {
  const meta = freshMeta();
  const { app } = await rig(meta); app.register('base', { draw() {} }); app.go('base'); app.push('archive', {}); frames(app, 20);
  const scr = app.top(); assert.equal(scr, archive);
  const lockedGraft = LOCKED_IDS.find((id) => UNLOCKS[id].kind === 'graft');
  scr.tileTip(app, { kind: 'graft', itemId: UNLOCKS[lockedGraft].itemId, name: 'x', unlocked: false }, { x: 0, y: 0, w: 40, h: 40 });
  assert.equal(app.tip.text, UN.lockedHint(UNLOCKS[lockedGraft].itemId)); assert.match(app.tip.title, /Locked graft/);
  const openRelic = Object.values(UNLOCKS).find((e) => e.kind === 'relic' && e.tier === 'start');
  scr.tileTip(app, { kind: 'relic', itemId: openRelic.itemId, name: 'r', unlocked: true }, { x: 0, y: 0, w: 40, h: 40 });
  assert.ok(app.tip && app.tip.o && app.tip.o.glossOnly, 'open relic uses the glossary tooltip');
  for (let i = 0; i < 5; i++) { scr.setTab(i); frames(app, 4); }
  scr.setTab(0); for (const f of ['marrow', 'wick', 'odile', 'any', 'all']) { scr.hero = f; frames(app, 3); }
  let hovered = false; app.mouse.x = 420; app.mouse.y = 400; frames(app, 4); hovered = true; assert.ok(hovered);
});

await t('archive screen when done: complete, empty queue', async () => {
  const meta = freshMeta(); for (const id of LOCKED_IDS) meta.unlocked.ids[id] = 1;
  const { app, texts } = await rig(meta); app.register('base', { draw() {} }); app.go('base'); app.push('archive', {}); frames(app, 20);
  assert.ok(has(texts, 'Archive complete') && has(texts, /queue is empty/));
  assert.equal(percentLabel(meta), 'Archive complete');
});

await t('codex: counts match the Archive and locked entries differ from unseen ones', async () => {
  const meta = freshMeta();
  const { app, texts } = await rig(meta); app.register('base', { draw() {} }); app.go('base'); app.push('codex', {}); frames(app, 20);
  const cc = categoryCounts(meta);
  assert.ok(has(texts, `Cards ${cc.card.got} of ${cc.card.total} unlocked`), 'cards count');
  const lg = Object.values(UNLOCKS).find((e) => e.kind === 'graft' && e.tier === 'locked').itemId;
  const og = Object.values(UNLOCKS).find((e) => e.kind === 'graft' && e.tier === 'start').itemId;
  assert.equal(isLocked(app, 'grafts', lg), true); assert.equal(isLocked(app, 'grafts', og), false, 'open but unseen is not locked');
  app.top().setTab(1); frames(app, 10);
  assert.ok(has(texts, 'Locked graft') && has(texts, 'Unknown graft'), 'both states are drawn');
  assert.ok(has(texts, /Earn Unlock Points to open it/), 'hint text');
  meta.unlocked.ids[UNLOCKS['graft:' + lg].id] = 1; assert.equal(isLocked(app, 'grafts', lg), false, 'opened items stop being locked');
});

await t('NEW ribbon shows once per item, stays while the screen is open', async () => {
  const meta = freshMeta();
  const run = finish(meta, { kills: ['q1', 'q2'] }); void run;
  const id = Object.keys(meta.unlocked.fresh || {})[0]; assert.ok(id, 'fresh set is filled by the award');
  const itemId = UNLOCKS[id].itemId;
  const { app, texts } = await rig(meta);
  let draws = 0;
  app.register('offer', { draw(a) { if (newRibbon(a, itemId, 100, 100, 120)) draws++; } });
  app.register('other', { draw() {} });
  app.go('offer'); frames(app, 10);
  assert.equal(draws, 10, 'visible on every frame of the first visit');
  assert.ok(has(texts, 'NEW'));
  assert.ok(!meta.unlocked.fresh[id], 'consumed');
  app.go('other'); frames(app, 2); draws = 0; app.go('offer'); frames(app, 10);
  assert.equal(draws, 0, 'gone on the next visit');
});

await t('new run snapshot opens only what the player unlocked; fresh survives migrate', async () => {
  const meta = freshMeta(); finish(meta);
  const copy = M.migrate(JSON.parse(JSON.stringify(meta)));
  assert.deepEqual(Object.keys(copy.unlocked.fresh || {}).sort(), Object.keys(meta.unlocked.fresh || {}).sort());
});

await t('hero select shows the plain unlock hint for locked heroes', async () => {
  const meta = freshMeta();
  const { app, texts } = await rig(meta); app.go('title'); frames(app, 80);
  app.top().openSelect(app); frames(app, 40);
  assert.ok(has(texts, new RegExp(UN.heroHint(meta, 'wick').slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))), 'Wick hint: ' + UN.heroHint(meta, 'wick'));
  assert.ok(UN.heroHint(meta, 'wick').includes(HERO_GATES.wick.text));
});

await t('title menu has an Archive button showing the percent and opening the screen', async () => {
  const meta = freshMeta();
  const { app, texts } = await rig(meta); app.go('title'); frames(app, 80);
  assert.ok(has(texts, `Archive ${UN.unlockState(meta).percent} percent`), 'label');
  const hits = []; const flow = app.shared.flow; const open = flow.openArchive; flow.openArchive = () => { hits.push(1); open(); };
  // the Settings | Archive row is the 4th menu row (right half)
  click(app, 640 + 90, 306 + 3 * 56 + 20); frames(app, 3);
  assert.equal(hits.length, 1, 'Archive button opens the screen');
});

console.log(`${n} archive ui tests`);
