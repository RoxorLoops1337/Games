// Headless smoke test: deck view (view + pick, 0/5/3-grafted decks), scroll, filters, every codex tab, tips fire once.
import assert from 'node:assert';
import { makeApp, frames, click, key as rawKey } from './graftwork_lib.mjs';
const RUN = await import('../graftwork/engine/run.js');
const { GRAFT_LIST } = await import('../graftwork/data/index.js');
const deckview = (await import('../graftwork/ui/deckview.js')).default;
const codex = (await import('../graftwork/ui/codex.js')).default;
const { maybeTip, tipsActive, TIP_TEXTS } = await import('../graftwork/ui/tutorial.js');

let app;
const key = (a, k) => { const t = a.top(); if (t && t.key) t.key(a, { key: k }); rawKey(a, k); };
const saved = [];
const meta = { seen: { cards: { m_cut: 1 }, grafts: {}, enemies: {}, relics: {}, statuses: {} }, settings: {}, tips: {} };
const run = RUN.newRun({ hero: 'marrow', seed: 'x' });
app = await makeApp({ run, meta, flow: { saveMeta: () => saved.push(1) } });
app.register('deckview', deckview); app.register('codex', codex);
app.register('base', { draw() {} }); app.go('base');

const safe = GRAFT_LIST.filter((g) => g.tier === 'safe');
const variants = [
  () => {},
  () => { for (let i = 0; i < 5; i++) run.deck[i].grafts = [safe[i].id]; },
  () => { run.deck[0].grafts = [safe[0].id, safe[1].id, safe[2].id]; run.deck[1].grafts = [safe[3].id]; run.deck[2].grafts = [safe[4].id]; },
];
for (const setup of variants) {
  for (const d of run.deck) d.grafts = [];
  setup();
  app.push('deckview', {}); frames(app, 20);
  app.mouse.x = 120; app.mouse.y = 250; frames(app, 5);
  app.mouse.wheel = 300; frames(app, 5);
  click(app, 400, 600); // maybe a card or nothing
  for (const [x, y] of [[60, 123], [140, 123], [220, 123], [350, 123], [460, 123], [540, 123], [640, 123], [700, 123], [60, 123]]) click(app, x, y);
  key(app, 'ArrowRight'); key(app, 'ArrowDown'); frames(app, 3);
  key(app, 'Escape');
  assert.equal(app.stack.length, 1, 'esc closes deck view');
}
// pick mode
let picked = null;
app.push('deckview', { mode: 'pick', filter: (i) => i.id === 'm_cut', onPick: (i) => { picked = i; } });
frames(app, 10);
key(app, 'ArrowRight'); key(app, 'Enter'); frames(app, 3);
if (!picked) { click(app, 130, 250); }
assert.ok(picked && picked.id === 'm_cut', 'pick mode returns an eligible inst');
assert.equal(app.stack.length, 1, 'pick closes the view');
// empty pick
app.push('deckview', { mode: 'pick', filter: () => false }); frames(app, 5); key(app, 'Escape');
// codex
app.push('codex', {}); frames(app, 5);
for (let i = 0; i < 7; i++) { codex.setTab(i); frames(app, 5); app.mouse.wheel = 200; frames(app, 3); click(app, 300, 300); }
codex.setTab(0); key(app, 'c'); key(app, 'u'); frames(app, 3); key(app, 'Backspace');
key(app, 'Escape'); key(app, 'Escape');
assert.equal(app.stack.length, 1, 'codex closes');
// tips
app.screens.base.draw = (a) => { maybeTip(a, 'strain', 600, 300, TIP_TEXTS.strain); };
assert.equal(Object.keys(TIP_TEXTS).length, 14);
frames(app, 5);
assert.equal(meta.tips.strain, undefined);
click(app, 600, 360 + 10);
frames(app, 3);
if (!meta.tips.strain) { for (let y = 320; y < 420 && !meta.tips.strain; y += 10) click(app, 600, y); }
assert.equal(meta.tips.strain, 1, 'tip dismissed and stored'); assert.ok(saved.length >= 1);
const n = saved.length; frames(app, 5); click(app, 600, 340); assert.equal(saved.length, n, 'fires once');
meta.settings.tips = false; assert.equal(tipsActive(meta), false);
console.log('graftwork ui deck: ok');
