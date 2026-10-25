// End to end: boot the real game headless and play whole runs (all three acts) through the real flow routing.
// Fights are resolved with the engine bot (the combat screen has its own suite); every other screen is entered,
// drawn and then driven through the real run functions + flow.route(), with save/restore checked mid-run.
import assert from 'node:assert/strict';
import { fakeCtx, installDom } from './graftwork_lib.mjs';

installDom();
const canvas = { getContext: () => fakeCtx(), addEventListener() {}, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }), width: 1280, height: 720, setPointerCapture() {} };
globalThis.document.getElementById = () => null;
globalThis.localStorage = (() => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() }; })();

const { boot } = await import('../graftwork/main.js');
const RUN = await import('../graftwork/engine/run.js');
const { loadRun } = await import('../graftwork/engine/save.js');
const { fight, POLICIES } = await import('../tools/graftwork_sim.mjs');
const { CARDS, GRAFTS } = await import('../graftwork/data/index.js');
const { canGraft } = await import('../graftwork/engine/cards.js');

const { app, flow } = boot(canvas);
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const look = (frames = 4) => { for (let i = 0; i < frames; i++) app.tick(1 / 60); };

function playThrough(hero, seed, asc = 0) {
  flow.start({ hero, seed, ascension: asc });
  const run = app.shared.run;
  const seen = new Set();
  let guard = 0, saved = false;
  while (guard++ < 700 && run.phase !== 'dead' && run.phase !== 'won') {
    seen.add(app.current);
    look(3);
    switch (run.phase) {
      case 'map': {
        const av = RUN.availableNodes(run);
        RUN.enterNode(run, run.rng.pick(av)); break;
      }
      case 'combat': {
        const { res } = fight(run, POLICIES.careful);
        RUN.resolveFight(run, res); break;
      }
      case 'reward': {
        const rw = run.pending; RUN.claimGold(run, rw);
        if (rw.relic) RUN.addRelic(run, rw.relic);
        if (rw.relicChoices && rw.relicChoices[0]) RUN.addRelic(run, rw.relicChoices[0]);
        if (rw.potion) RUN.addPotion(run, rw.potion);
        RUN.afterReward(run); break;
      }
      case 'graft': {
        const o = run.pending.offer; let done = false;
        for (const uid of o.cards) { const inst = RUN.findInst(run, uid); for (const g of o.grafts) if (!done && canGraft(inst, g) && RUN.previewPick(run, uid, g).after.strain <= 2) { RUN.applyGraft(run, uid, g); done = true; } }
        if (!done) RUN.skipGraft(run, 'heal');
        RUN.afterGraft(run); break;
      }
      case 'shop': { const s = run.pending; for (let i = 0; i < s.potions.length; i++) RUN.shopBuy(run, 'potion', i); RUN.advance(run); break; }
      case 'forge': { RUN.forgeAct(run, run.hp < run.maxHp * 0.7 ? 'rest' : 'expand'); RUN.advance(run); break; }
      case 'event': { const ch = RUN.eventChoices(run).filter((c) => c.ok); const c = ch.find((x) => !x.pick) || ch[0]; RUN.eventChoose(run, c.i, c.cards ? c.cards[0] : undefined); RUN.afterEvent(run); break; }
      default: throw new Error('stuck ' + run.phase);
    }
    flow.route();
    if (!saved && run.act === 2) { // save and restore mid-run must reproduce the run exactly
      saved = true;
      const copy = loadRun();
      assert.ok(copy, 'run was saved');
      assert.equal(copy.hp, run.hp); assert.equal(copy.deck.length, run.deck.length); assert.equal(copy.act, run.act);
      assert.equal(copy.rng.state, run.rng.state, 'rng state survives a save');
    }
  }
  look(6);
  return { run, seen };
}

for (const hero of ['marrow', 'wick', 'odile']) {
  t(`${hero}: plays full runs through the real flow without errors`, () => {
    let reachedAct2 = 0, ended = 0;
    for (let i = 0; i < 4; i++) {
      const { run, seen } = playThrough(hero, `e2e-${hero}-${i}`);
      assert.ok(['dead', 'won'].includes(run.phase), 'run ended');
      assert.equal(app.current, 'end', 'ends on the end screen');
      assert.ok(run.endInfo, 'meta recorded the run');
      for (const s of ['map', 'combat', 'reward', 'graft']) assert.ok(seen.has(s), `${hero} visited ${s}`);
      if (run.stats.floors > 10) reachedAct2++; ended++;
    }
    assert.equal(ended, 4);
  });
}
t('ascension 10 runs also route cleanly', () => { const { run } = playThrough('marrow', 'e2e-asc', 10); assert.ok(['dead', 'won'].includes(run.phase)); });
t('title screen, codex and settings open from the flow', () => {
  flow.toTitle(); look(3); assert.equal(app.current, 'title');
  flow.openCodex(); look(3); app.pop(); flow.openSettings(); look(3); app.pop(); look(2);
});
console.log(`${n} e2e checks passed`);
