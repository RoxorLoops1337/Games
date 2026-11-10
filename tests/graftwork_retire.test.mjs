// The Classic map is retired (graftwork/design/CLEANUP_PLAN.md): every run is a Ward run. A saved run on the old map cannot be continued; it is
// closed exactly as the Abandon button closes a run, its progress counts, the run save is deleted and the title says so once.
//   tests/fixtures/graftwork_oldsave_0675399.json   20 saves made before the Ward existed (no mode field), at every phase the map had
//   tests/fixtures/graftwork_wardsave_5f3e252.json  28 Ward saves made just before the retirement: they must keep resuming (the regression
//                                                   suite plays each one to the end; here they go through the real boot and Continue)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fakeCtx, installDom, frames, click, key } from './graftwork_lib.mjs';

installDom();
globalThis.document.getElementById = () => null;
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear() };
const RUN_KEY = 'graftwork_run_v1', META_KEY = 'graftwork_meta_v1';

const RUN = await import('../graftwork/engine/run.js');
const META = await import('../graftwork/engine/meta.js');
const { loadRun, hasRun, isRetiredRun, saveRun } = await import('../graftwork/engine/save.js');
const { boot } = await import('../graftwork/main.js');
const { NOTICES } = await import('../graftwork/ui/title.js');
const LAYOUT = await import('../graftwork/ui/layout_registry.js');

const OLD = JSON.parse(readFileSync(new URL('./fixtures/graftwork_oldsave_0675399.json', import.meta.url), 'utf8'));
const WARD = JSON.parse(readFileSync(new URL('./fixtures/graftwork_wardsave_5f3e252.json', import.meta.url), 'utf8'));
const HEROES = ['marrow', 'wick', 'odile'];
const SENTENCE = 'The old map has been retired. Your run on it was closed and its progress counted.';
let n = 0;
const t = async (name, fn) => { store.clear(); await fn(); n++; console.log('ok', name); };
// a meta without the wall-clock stamps, to compare two of them
const plain = (m) => { const c = JSON.parse(JSON.stringify(m)); delete c.notice; for (const h of c.history) delete h.date; for (const k of Object.keys(c.achievements)) c.achievements[k] = 1; for (const k of Object.keys(c.practice || {})) delete c.practice[k].ts; return c; };
const mkCanvas = () => ({ getContext: () => fakeCtx(), addEventListener() {}, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }), width: 1280, height: 720, setPointerCapture() {} });
const reg = (id) => LAYOUT.getAll().find((r) => r.id === id);

await t('which saves are retired: no mode or any mode but ward; never a practice fight, never a Ward run', () => {
  assert.equal(isRetiredRun(null), false);
  assert.equal(isRetiredRun({ v: 1, phase: 'map' }), true, 'a save from before the Ward has no mode');
  assert.equal(isRetiredRun({ v: 1, mode: 'classic', phase: 'combat' }), true);
  assert.equal(isRetiredRun({ v: 1, mode: 'ward', phase: 'ward' }), false);
  assert.equal(isRetiredRun({ v: 1, practice: 'the_matron', phase: 'combat' }), false, 'an old practice save has no mode and no map either');
  assert.equal(isRetiredRun(RUN.newRun({ hero: 'marrow', seed: 'new' })), false, 'every new run is a Ward run');
  const pr = META.newPracticeRun({ boss: 'the_matron', kind: 'boss', enemies: ['the_matron'], act: 1, hero: 'marrow', asc: 0, deck: [{ id: 'm_cut', grafts: [], fused: [], up: 0 }], relics: [], maxHp: 70 }, META.defaultMeta());
  assert.equal(isRetiredRun(pr), false); assert.equal(pr.ward, undefined, 'a practice fight lays out no floor'); assert.equal(pr.phase, 'combat');
  assert.equal(RUN.newRun({ hero: 'marrow', seed: 'x', mode: 'classic' }).mode, 'ward', 'asking for the old map by name changes nothing');
  for (const name of ['enterNode', 'availableNodes', 'runMode', 'startEvent', 'ACT_ROWS']) assert.equal(RUN[name], undefined, 'engine/run.js no longer has ' + name);
});

let closed = 0; const phases = new Set();
for (const hero of HEROES) for (const { phase, json } of OLD[hero]) {
  await t(`a ${hero} save on the old map at "${phase}" is closed like an abandoned run, counted and deleted`, () => {
    assert.equal(JSON.parse(json).mode, undefined, 'the fixture is from before the Ward');
    // what the Abandon button does (main.js flow.abandon then flow.route): dead, abandoned, recordRunEnd
    const twin = META.defaultMeta(), tr = RUN.deserializeRun(json);
    tr.phase = 'dead'; tr.abandoned = true; tr.ended = true; const want = META.recordRunEnd(twin, tr, 'dead');
    // the retirement
    store.clear(); store.set(RUN_KEY, json);
    const m = META.defaultMeta(); assert.ok(hasRun());
    const info = META.retireClassicRun(m);
    assert.ok(info, 'a run was closed');
    assert.deepEqual(plain(m), plain(twin), 'the meta is what abandoning the run leaves');
    assert.equal(info.unlock.up, want.unlock.up, 'the same Unlock Points'); assert.deepEqual(info.caseFile, want.caseFile, 'the same case file');
    assert.deepEqual(info.newAchievements.map((a) => a.id), want.newAchievements.map((a) => a.id));
    assert.equal(hasRun(), false, 'the run save is deleted'); assert.equal(loadRun(), null);
    assert.equal(m.notice, 'classic_retired'); assert.equal(m.stats.deaths, 1); assert.equal(m.stats.wins, 0); assert.equal(m.history.length, 1);
    const h = m.history[0], old = JSON.parse(json);
    assert.equal(h.outcome, 'dead'); assert.equal(h.hero, hero); assert.equal(h.floors, old.stats.floors); assert.equal(h.grafts, old.stats.grafts); assert.equal(h.seed, old.seed);
    assert.equal(m.stats.floors, old.stats.floors); assert.equal(m.stats.goldEarned, old.stats.goldEarned); assert.equal(m.stats.grafts, old.stats.grafts);
    for (const c of old.deck) assert.ok(m.seen.cards[c.id], 'the deck is in the Codex: ' + c.id);
    assert.deepEqual(JSON.parse(store.get(META_KEY)), JSON.parse(JSON.stringify(m)), 'the meta was saved');
    assert.equal(META.retireClassicRun(m), null, 'nothing left to close: a run is never counted twice'); assert.equal(m.history.length, 1);
    closed++; phases.add(phase);
  });
}
for (const p of ['map', 'combat', 'reward', 'graft', 'event', 'shop', 'forge']) assert.ok(phases.has(p), 'the fixture has a save at ' + p);

await t('a Ward save and a practice save are left alone; a Ward save that Endless left on the map screen resumes on its floor', () => {
  const m = META.defaultMeta(), before = JSON.stringify(m);
  const s = WARD.marrow[2]; store.set(RUN_KEY, s.json);
  assert.equal(META.retireClassicRun(m), null); assert.equal(JSON.stringify(m), before, 'meta untouched'); assert.equal(store.get(RUN_KEY), s.json, 'save untouched');
  assert.equal(RUN.serializeRun(loadRun()), s.json, 'and it loads as it was saved');
  // an old practice save: a Classic run object with the fight forced (no mode, a map, practice set)
  const pr = JSON.parse(OLD.marrow[1].json); pr.practice = 'the_matron'; pr.metaDone = true; pr.phase = 'combat'; pr.pending = { kind: 'combat', fightKind: 'boss', enemies: ['the_matron'] };
  store.set(RUN_KEY, JSON.stringify(pr));
  assert.equal(META.retireClassicRun(m), null, 'practice is not a run on the map'); assert.equal(loadRun().practice, 'the_matron'); assert.equal(JSON.stringify(m), before);
  // the state Endless used to leave a won Ward run in: next floor laid out, phase 'map'
  const run = RUN.deserializeRun(WARD.odile[5].json); run.phase = 'won'; RUN.startLoop(run); assert.equal(run.phase, 'ward');
  const stuck = JSON.parse(RUN.serializeRun(run)); stuck.phase = 'map'; store.set(RUN_KEY, JSON.stringify(stuck));
  const back = loadRun(); assert.equal(back.phase, 'ward', 'mended on load'); assert.equal(back.loop, run.loop); assert.equal(back.ward.day, 1); assert.equal(META.retireClassicRun(m), null);
});

await t('boot with a save on the old map: closed before the title looks, no Continue, one notice until it is dismissed', async () => {
  store.set(RUN_KEY, OLD.wick[3].json);
  const { app, flow } = boot(mkCanvas());
  const meta = app.shared.meta;
  assert.equal(flow.hasSave(), false, 'no saved run'); assert.equal(meta.notice, 'classic_retired'); assert.equal(meta.history.length, 1); assert.equal(meta.history[0].hero, 'wick');
  const texts = []; const raw = app.text; app.text = (s, ...r) => { texts.push(String(s)); return raw(s, ...r); };
  frames(app, 90);
  assert.equal(app.current, 'title'); assert.equal(app.screens.title.hasSave, false);
  assert.equal(NOTICES.classic_retired, SENTENCE);
  assert.ok(texts.includes(SENTENCE), 'the title shows the notice'); assert.ok(!texts.includes('Continue'), 'no Continue slab');
  const box = reg('title-notice'); assert.ok(box && box.overlay, 'registered as an overlay'); assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.w <= 1280 && box.y + box.h <= 720, 'on the stage');
  // the menu under it takes no input: New Run (640,330) does not open the hero select while the notice is up
  click(app, 640, 330); frames(app, 5); assert.equal(app.screens.title.state, 'menu', 'the menu is held');
  assert.equal(meta.notice, 'classic_retired', 'a click beside the button does not dismiss it');
  // a reload before dismissing: the notice is still there (it lives in the meta save), the run is not counted again
  const again = boot(mkCanvas()); assert.equal(again.app.shared.meta.notice, 'classic_retired'); assert.equal(again.app.shared.meta.history.length, 1);
  // Understood dismisses it for good
  frames(app, 3); texts.length = 0; frames(app, 2); const btnY = box.y + box.h - 26 - 24;
  click(app, 640, btnY); frames(app, 5);
  assert.equal(meta.notice, undefined, 'dismissed'); assert.equal(JSON.parse(store.get(META_KEY)).notice, undefined, 'and saved');
  texts.length = 0; frames(app, 3); assert.ok(!texts.includes(SENTENCE)); assert.equal(reg('title-notice'), undefined);
  assert.equal(app.screens.title.state, 'menu', 'the dismissing click pressed nothing under the notice');
  click(app, 640, 330); frames(app, 20); assert.equal(app.screens.title.state, 'select', 'the menu plays again');
  const third = boot(mkCanvas()); frames(third.app, 30); assert.equal(third.app.shared.meta.notice, undefined, 'it does not come back');
});

await t('the notice by keyboard, and on the phone stages: on the stage, text whole, a touch target of 40 css px', async () => {
  for (const k of ['Enter', ' ', 'Escape']) {
    store.clear(); store.set(RUN_KEY, OLD.marrow[0].json);
    const { app } = boot(mkCanvas()); frames(app, 60); assert.ok(reg('title-notice'));
    key(app, k); frames(app, 3); assert.equal(app.shared.meta.notice, undefined, `"${k}" dismisses it`); assert.equal(app.screens.title.state, 'menu'); assert.equal(app.stack.length, 1, 'and opens nothing');
  }
  for (const scale of [1, 0.64, 0.54, 0.46]) for (const ts of [100, 150]) {
    store.clear(); store.set(RUN_KEY, OLD.odile[2].json);
    const { app } = boot(mkCanvas());
    app.scale = scale; app.minPx = 11; app.shared.meta.settings.textScale = ts; app.shared.meta.settings.reducedMotion = true;
    app.ctx.measureText = (s) => { const f = String(app.ctx.font || ''), m = /(\d+(?:\.\d+)?)px/.exec(f), size = m ? +m[1] : 16; return { width: String(s).length * size * (/bold/.test(f) ? 0.56 : 0.52) }; };
    const seen = []; const raw = app.text; app.text = (s, x, y, o = {}) => { if (String(s) === SENTENCE || s === 'Understood') { const L = app.layoutText(String(s), o); seen.push({ s: String(s), x: x - L.w / 2, y, w: L.w, h: L.h, trunc: L.trunc, lines: L.lines.length }); } return raw(s, x, y, o); };
    const hits = []; const oc = app.clicked; app.clicked = (x, y, w, h) => { const g = app.hitRect(x, y, w, h); hits.push({ x, y, w, h, cw: g.w * app.scale, ch: g.h * app.scale }); return oc(x, y, w, h); };
    frames(app, 40); seen.length = 0; hits.length = 0; frames(app, 1);
    const tag = `scale ${scale} text ${ts}`, box = reg('title-notice'); assert.ok(box, tag + ': shown');
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.w <= 1280 && box.y + box.h <= 720, tag + ': the panel is on the stage ' + JSON.stringify(box));
    const txt = seen.find((q) => q.s === SENTENCE), lab = seen.find((q) => q.s === 'Understood');
    assert.ok(txt && !txt.trunc, tag + ': the sentence is whole'); assert.ok(lab && !lab.trunc, tag + ': the button label is whole');
    for (const q of [txt, lab]) assert.ok(q.x >= box.x && q.x + q.w <= box.x + box.w && q.y >= box.y && q.y + q.h <= box.y + box.h, `${tag}: "${q.s.slice(0, 12)}" inside the panel`);
    assert.ok(txt.y + txt.h <= lab.y - 8, tag + ': the sentence ends above the button');
    const btn = hits.find((q) => q.y > txt.y + txt.h - 2 && q.y + q.h <= box.y + box.h && q.x > box.x); assert.ok(btn, tag + ': the button is a click target');
    assert.ok(btn.cw >= 39.5 && btn.ch >= 39.5, `${tag}: the button is ${Math.round(btn.cw)}x${Math.round(btn.ch)} css px to the finger`);
    assert.deepEqual(LAYOUT.findOverlaps().filter((o) => /title-notice/.test(o.a + o.b)), [], tag + ': overlaps nothing it should not');
    click(app, btn.x + btn.w / 2, btn.y + btn.h / 2); frames(app, 3); assert.equal(app.shared.meta.notice, undefined, tag + ': a tap dismisses it');
  }
});

await t('boot with a Ward save from before the retirement: Continue resumes it on the right screen, unchanged', async () => {
  const SCREEN = { ward: 'ward', combat: 'combat', reward: 'reward', graft: 'graft', shop: 'shop', forge: 'forge', event: 'event' };
  let resumed = 0;
  for (const hero of HEROES) for (const s of WARD[hero]) {
    store.clear(); store.set(RUN_KEY, s.json);
    const { app, flow } = boot(mkCanvas());
    app.shared.meta.settings.reducedMotion = true;
    assert.equal(app.shared.meta.notice, undefined, 'no notice for a Ward save'); assert.ok(flow.hasSave(), 'the save is offered'); assert.equal(app.shared.meta.history.length, 0);
    frames(app, 20); assert.equal(app.screens.title.hasSave, true); assert.ok(app.screens.title.saveInfo && app.screens.title.saveInfo.dayLimit > 0, 'the Continue line names the day');
    assert.ok(flow.resume(), `${hero} ${s.key}: resumed`);
    for (let i = 0; i < 900 && app.current !== SCREEN[s.phase]; i++) app.tick(1 / 60); // a save taken mid walk first shows the hero's steps on the Ward
    assert.equal(app.current, SCREEN[s.phase], `${hero} ${s.key}: on the ${s.phase} screen`);
    if (s.phase !== 'combat') assert.equal(RUN.serializeRun(app.shared.run), s.json, `${hero} ${s.key}: the run is the save, byte for byte`);
    frames(app, 30); resumed++;
  }
  assert.equal(resumed, 28);
});

console.log(`graftwork retire: ${n} checks, ${closed} old saves closed and counted`);
