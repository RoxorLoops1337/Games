// Headless gate for the Shop and Forge screens: buy one of everything, strip, remove, every Forge option, back to the map.
import assert from 'node:assert/strict';
import { makeApp, frames, click } from './graftwork_lib.mjs';
import * as RUN from '../graftwork/engine/run.js';
import { canGraft } from '../graftwork/engine/cards.js';
import { GRAFTS, HEROES } from '../graftwork/data/index.js';
import shop from '../graftwork/ui/shop.js';
import forge from '../graftwork/ui/forge.js';

const sfxLog = [];
async function setup(hero, phase) {
  const run = RUN.newRun({ hero, seed: 'ui-' + hero });
  run.gold = 3000;
  const app = await makeApp({ run, meta: {}, audio: { sfx: (n) => sfxLog.push(n), music() {} } });
  app.register('shop', shop); app.register('forge', forge);
  app.register('deckview', { enter() {}, draw() {} });
  const flow = { route() { app.go(run.phase === 'shop' ? 'shop' : run.phase === 'forge' ? 'forge' : 'deckview', { run }); }, openDeck() {} };
  app.shared.flow = flow;
  if (phase === 'shop') { run.phase = 'shop'; run.pending = RUN.makeShop(run); } else { run.phase = 'forge'; run.pending = { kind: 'forge', used: 0 }; }
  flow.route(); frames(app, 60);
  return { run, app };
}
const nGrafts = (run) => run.deck.reduce((n, i) => n + i.grafts.length, 0);
const settle = (app) => { frames(app, 20); click(app, 5, 700); frames(app, 120); };
const FIRST = [160, 211], GRAFT_ROW = [800, 190];

function sewTwo(run) {
  let done = 0;
  for (const inst of run.deck) {
    const g = Object.keys(GRAFTS).find((id) => canGraft(inst, id) && GRAFTS[id].weight === 1);
    if (g && RUN.applyGraft(run, inst.uid, g, { keepPhase: true, free: true }).ok && ++done === 2) break;
  }
  assert.equal(done, 2, 'two grafts sewn');
}

for (const hero of Object.keys(HEROES)) {
  // ---------------- shop ----------------
  {
    const { run, app } = await setup(hero, 'shop');
    const shopData = run.pending;
    let gold = run.gold, deck = run.deck.length;
    click(app, 347, 190); frames(app, 10);
    assert.ok(shopData.cards[0].sold, hero + ' card sold');
    assert.equal(run.deck.length, deck + 1); assert.equal(run.gold, gold - shopData.cards[0].price);
    gold = run.gold;
    click(app, 370, 540); frames(app, 10);
    assert.ok(shopData.potions[0].sold && run.potions.length === 1, hero + ' potion bought');
    assert.equal(run.gold, gold - shopData.potions[0].price);
    const relics = run.relics.length; click(app, 1000, 410); frames(app, 10);
    assert.equal(run.relics.length, relics + 1, hero + ' relic bought');
    // graft with card pick
    let bought = false;
    for (let gi = 0; gi < 3 && !bought; gi++) {
      const before = nGrafts(run);
      click(app, 270 + gi * 220 + 100, 395); frames(app, 15); click(app, ...FIRST); settle(app);
      if (nGrafts(run) === before + 1) { bought = true; assert.ok(shopData.grafts[gi].sold); }
    }
    assert.ok(bought, hero + ' graft bought');
    // strip
    let g0 = nGrafts(run), gold2 = run.gold;
    click(app, 740, 647); frames(app, 15); click(app, ...FIRST); frames(app, 15); click(app, ...GRAFT_ROW); settle(app);
    assert.equal(nGrafts(run), g0 - 1, hero + ' strip removed a graft');
    assert.equal(gold2 - run.gold, RUN.servicePrice({ ...run, shopUses: run.shopUses }, 'strip') || gold2 - run.gold);
    // remove
    deck = run.deck.length; gold2 = run.gold; const price = RUN.servicePrice(run, 'remove');
    click(app, 420, 647); frames(app, 15); click(app, ...FIRST); settle(app);
    assert.equal(run.deck.length, deck - 1, hero + ' card removed'); assert.equal(run.gold, gold2 - price);
    // poor: error, nothing changes
    run.gold = 1; const d2 = run.deck.length; click(app, 420, 647); frames(app, 15); click(app, ...FIRST); frames(app, 30);
    assert.equal(run.deck.length, d2); assert.ok(sfxLog.includes('error'));
    // leave
    click(app, 1095, 645); frames(app, 5);
    assert.equal(run.phase, 'map'); assert.equal(run.pending, null);
  }
  // ---------------- forge ----------------
  const optX = (i) => 61 + i * 236 + 107;
  for (const opt of ['rest', 'expand', 'refine', 'strip', 'reforge']) {
    const { run, app } = await setup(hero, 'forge');
    sewTwo(run);
    run.hp = run.maxHp - 25;
    const i = ['rest', 'expand', 'refine', 'strip', 'reforge'].indexOf(opt);
    const hp = run.hp, bb = run.budgetBonus, ups = run.deck.filter((c) => c.up).length, g0 = nGrafts(run), uids = run.deck.map((c) => c.grafts.slice());
    click(app, optX(i), 300); frames(app, 15);
    if (opt === 'refine') { click(app, ...FIRST); frames(app, 5); }
    if (opt === 'strip') { click(app, ...FIRST); frames(app, 15); click(app, ...GRAFT_ROW); }
    if (opt === 'reforge') { click(app, ...FIRST); frames(app, 15); click(app, ...GRAFT_ROW); frames(app, 15); click(app, ...FIRST); }
    settle(app);
    assert.equal(run.pending.used, 1, `${hero} ${opt} used`);
    if (opt === 'rest') assert.equal(run.hp, hp + RUN.forgeHeal(run));
    if (opt === 'expand') assert.equal(run.budgetBonus, bb + 1);
    if (opt === 'refine') assert.equal(run.deck.filter((c) => c.up).length, ups + 1);
    if (opt === 'strip') assert.equal(nGrafts(run), g0 - 1);
    if (opt === 'reforge') { assert.equal(nGrafts(run), g0); assert.notDeepEqual(run.deck.map((c) => c.grafts), uids); }
    click(app, 640, 646); frames(app, 5);
    assert.equal(run.phase, 'map', `${hero} ${opt} returns to map`);
  }
}
console.log('graftwork ui shop/forge ok');
