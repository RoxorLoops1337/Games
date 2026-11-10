// End to end: boot the real game headless and play whole runs (all three floors) through the real flow routing.
// Fights are resolved with the engine bot (the combat screen has its own suite); mornings are built and walks are planned through the
// engine and routed like the Ward screen does it, so the walk interlude (the hero walking to the next room on the Ward before its screen
// opens) runs for real. Every screen is entered and drawn; save and restore are checked mid-run.
import assert from 'node:assert/strict';
import { fakeCtx, installDom, botStep } from './graftwork_lib.mjs';

installDom();
const canvas = { getContext: () => fakeCtx(), addEventListener() {}, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }), width: 1280, height: 720, setPointerCapture() {} };
globalThis.document.getElementById = () => null;
globalThis.localStorage = (() => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() }; })();

const { boot } = await import('../graftwork/main.js');
const RUN = await import('../graftwork/engine/run.js');
const { loadRun } = await import('../graftwork/engine/save.js');
const { fight, POLICIES } = await import('../tools/graftwork_driver.mjs');
const { CARDS, GRAFTS } = await import('../graftwork/data/index.js');
const { canGraft } = await import('../graftwork/engine/cards.js');

const { app, flow } = boot(canvas);
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const look = (frames = 4) => { for (let i = 0; i < frames; i++) app.tick(1 / 60); };

const SCREEN = { ward: 'ward', combat: 'combat', reward: 'reward', graft: 'graft', shop: 'shop', forge: 'forge', event: 'event', dead: 'end', won: 'end' };
// route, then let the screens settle: the Ward may first walk the hero to the next room and only then open that room's screen
function routed(run, tag) {
  flow.route();
  for (let i = 0; i < 900 && app.current !== SCREEN[run.phase]; i++) app.tick(1 / 60);
  assert.equal(app.current, SCREEN[run.phase], `${tag}: the screen for phase ${run.phase} opened (stuck on ${app.current})`);
}
function playThrough(hero, seed, asc = 0) {
  app.shared.meta.settings.reducedMotion = true; // the walk between two rooms is a quick hop
  flow.start({ hero, seed, ascension: asc });
  const run = app.shared.run;
  const seen = new Set(), hours = new Set();
  let guard = 0, saved = false, interludes = 0;
  assert.equal(run.mode, 'ward'); assert.equal(app.current, 'ward', 'a new run opens on the Ward');
  while (guard++ < 2500 && run.phase !== 'dead' && run.phase !== 'won') {
    seen.add(app.current);
    look(3);
    switch (run.phase) {
      case 'ward': hours.add(run.ward.phase); botStep(run); break; // build the morning, plan and start a walk
      case 'combat': {
        const { res } = fight(run, POLICIES.careful);
        RUN.resolveFight(run, res); break;
      }
      case 'graft': {
        const o = run.pending.offer; let done = false;
        for (const uid of o.cards) { const inst = RUN.findInst(run, uid); for (const g of o.grafts) if (!done && canGraft(inst, g) && RUN.previewPick(run, uid, g).after.strain <= 2) { RUN.applyGraft(run, uid, g); done = true; } }
        if (!done) RUN.skipGraft(run, 'heal');
        RUN.afterGraft(run); break;
      }
      default: botStep(run); // reward (takes the relic, the potion, a building plan), shop, forge, event
    }
    const hero0 = run.ward.hero.room;
    flow.route();
    if (app.current === 'ward' && run.phase !== 'ward') interludes++; // the hero is walking to the room whose screen comes next
    routed(run, `${seed} step ${guard}`); void hero0;
    if (!saved && run.stats.fights >= 3 && run.phase !== 'dead' && run.phase !== 'won') { // save and restore mid-run must reproduce the run exactly
      saved = true;
      const copy = loadRun();
      assert.ok(copy, 'run was saved');
      assert.equal(copy.hp, run.hp); assert.equal(copy.deck.length, run.deck.length); assert.equal(copy.act, run.act);
      assert.equal(copy.rng.state, run.rng.state, 'rng state survives a save');
      assert.equal(RUN.serializeRun(copy), RUN.serializeRun(run), 'the save is the run');
    }
  }
  look(6);
  return { run, seen, hours, interludes, saved };
}

for (const hero of ['marrow', 'wick', 'odile']) {
  t(`${hero}: plays full runs through the real flow without errors`, () => {
    let reachedAct2 = 0, ended = 0, walked = 0;
    for (let i = 0; i < 4; i++) {
      const { run, seen, hours, interludes, saved } = playThrough(hero, `e2e-${hero}-${i}`);
      assert.ok(saved, 'the mid-run save was checked');
      assert.ok(['dead', 'won'].includes(run.phase), 'run ended');
      assert.equal(app.current, 'end', 'ends on the end screen');
      assert.ok(run.endInfo, 'meta recorded the run');
      for (const s of ['ward', 'combat', 'reward', 'graft', 'event']) assert.ok(seen.has(s), `${hero} visited ${s}`);
      for (const h of ['morning', 'midday', 'evening', 'night']) assert.ok(hours.has(h), `${hero} played the ${h}`);
      walked += interludes; if (run.act > 1 || run.phase === 'won') reachedAct2++; ended++;
    }
    assert.equal(ended, 4);
    assert.ok(walked > 0, 'the Ward walked the hero between two rooms of one route at least once');
    console.log(`   ${hero}: ${reachedAct2} of 4 runs reached the second floor, ${walked} walk interludes`);
  });
}
t('ascension 10 runs also route cleanly', () => { const { run } = playThrough('marrow', 'e2e-asc', 10); assert.ok(['dead', 'won'].includes(run.phase)); });
t('title screen, codex and settings open from the flow', () => {
  flow.toTitle(); look(3); assert.equal(app.current, 'title');
  flow.openCodex(); look(3); app.pop(); flow.openSettings(); look(3); app.pop(); look(2);
});
console.log(`${n} e2e checks passed`);
