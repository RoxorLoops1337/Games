// Suite for Encore Island's tutorial & onboarding module (js/tutorial.js): step queue, persistence, blocking cards, Help library, rendering.
import { harness } from './no_room_for_heroes_lib.mjs';
import { loadEI } from './encore_island_lib.mjs';

const t = harness('encore_island_tutorial');
const EI = loadEI();
const F = EI.FEATS.find(f => f.id === 'tutorial');
t.ok(F && F.keep === true, 'tutorial feature registered with keep:true');
const A = F.api, TUT = A.TUT, CO = A.CO;
const S = () => EI.S;
const tap = (x, y) => { const hs = EI.hits(); for (let i = hs.length - 1; i >= 0; i--) { const h = hs[i]; if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) { h.act(); return true; } } return false; };
const gotIt = () => { const hs = EI.hits(); const h = hs.filter(q => q.w > 100 && q.w < 200 && q.h >= 44 && q.h <= 60).pop(); if (h) h.act(); return !!h; };
const settle = () => { for (let i = 0; i < 12; i++) A.coachTick(0.3); };
const fresh = () => { EI.initGame(false); EI.S.started = true; CO.cur = null; CO.gap = 99; CO.poll = 0; };

// ---- registration ----
t.ok(TUT.steps.length >= 25, 'core steps registered: ' + TUT.steps.length);
const ord = TUT.steps.map(s => s.order); t.ok(ord.every((o, i) => i === 0 || o >= ord[i - 1]), 'steps sorted by order');
t.ok(new Set(TUT.steps.map(s => s.id)).size === TUT.steps.length, 'step ids unique');
t.ok(TUT.steps[0].id === 'welcome' && TUT.steps[0].block, 'welcome is first and blocking');
t.ok(TUT.steps.every(s => s.title && s.text && s.icon && typeof s.when === 'function'), 'every step has title/text/icon/when');
t.ok(TUT.steps.every(s => s.text.length < 330), 'step texts stay short');
t.ok(TUT.help.length >= 25, 'help library has >= 25 entries: ' + TUT.help.length);
t.ok(TUT.help.every(h => h.title && h.text && h.icon && h.cat), 'help entries complete');
t.ok(!!EI.TABS.more.find(x => x.id === 'help'), 'More > How to play tab registered');

// ---- welcome blocks the world; Got it releases ----
fresh(); settle();
t.ok(CO.cur && CO.cur.id === 'welcome', 'welcome card appears first');
t.ok(S().hold === true, 'block card sets S.hold');
const t0 = S().t; EI.tick(0.5); t.ok(S().t === t0, 'world frozen while the card is up');
EI.draw(0.016); t.ok(gotIt(), 'Got it hit area exists (>=44px)');
t.ok(S().hold === false, 'Got it releases S.hold'); settle(); t.ok(CO.cur === null, 'card finishes after Got it');
t.ok(A.tutorialDone('welcome'), 'welcome marked seen');

// ---- fires once, priority order, gap ----
A.coachTick(0.3); t.ok(!CO.cur, 'no immediate second card (5s gap)');
for (let i = 0; i < 25; i++) A.coachTick(0.3); t.ok(CO.cur && CO.cur.id === 'meadow', 'meadow follows after the gap');
A.dismiss(); settle();
for (let i = 0; i < 40; i++) A.coachTick(0.3); t.ok(!CO.cur || CO.cur.id !== 'meadow', 'meadow never repeats');
fresh(); A.tutFire('welcome'); A.dismiss(); settle();
S().stats.kills = 50; S().player.helmets.push({ k: 1 }, { k: 1 }, { k: 1 }); S().items.push({ x: 0, y: 0, k: 1 }); S().feat.tutorial.seen.meadow = true;
for (let i = 0; i < 25; i++) A.coachTick(0.3); t.ok(CO.cur && CO.cur.id === 'drops', 'lowest ready order first (drops before sell)');
A.dismiss(); settle(); for (let i = 0; i < 25; i++) A.coachTick(0.3); t.ok(CO.cur && CO.cur.id === 'sell', 'then sell');

// ---- never over cards / modals / sheets ----
fresh(); S().feat.tutorial.seen.welcome = true; S().cards = [{ id: 'dmg' }]; settle(); t.ok(!CO.cur, 'not while level-up cards are showing');
S().cards = null; S().modal = { id: 'daily' }; settle(); t.ok(!CO.cur, 'not while a modal is open');
S().modal = null; EI.openSheet('goals'); settle(); t.ok(!CO.cur, 'not while a sheet is open'); EI.closeSheet();
settle(); t.ok(CO.cur && CO.cur.id === 'meadow', 'resumes once the screen is clear');

// ---- persistence ----
fresh(); A.tutFire('welcome'); A.dismiss(); settle(); A.tutFire('chest'); A.dismiss(); settle();
const json = JSON.parse(JSON.stringify(EI.serialize()));
t.ok(json.feat.tutorial.seen.welcome && json.feat.tutorial.seen.chest, 'seen flags serialized');
EI.initGame(false); t.ok(!A.tutorialDone('welcome'), 'new game starts unseen'); EI.applySave(json);
t.ok(A.tutorialDone('welcome') && A.tutorialDone('chest') && !A.tutorialDone('boss'), 'round-trip keeps seen flags');
EI.S.started = true; S().stats.kills = 0; S().lands.length = 1;
// Encore Tour keeps progress
S().lands.push(...[]); EI.prestige(); t.ok(A.tutorialDone('welcome'), 'seen flags survive an Encore Tour');
// veteran save is not lectured on basics
const vet = JSON.parse(JSON.stringify(EI.serialize())); vet.feat.tutorial = {}; vet.stats.kills = 500; EI.applySave(vet); t.ok(A.tutorialDone('welcome') && A.tutorialDone('sell'), 'veteran save skips the basics');

// ---- skip / replay / toggle ----
fresh(); A.tutFire('meadow'); A.skip(); settle(); t.ok(S().feat.tutorial.off === true, 'Skip tips turns tips off');
CO.gap = 99; S().stats.kills = 20; S().level = 3; S().perks = { dmg: 1 }; for (let i = 0; i < 30; i++) A.coachTick(0.3); t.ok(!CO.cur, 'no cards while tips are off');
A.tutReplay(); t.ok(S().feat.tutorial.off === false && !A.tutorialDone('meadow'), 'Replay clears seen flags and turns tips on');
S().feat.tutorial.off = false;

// ---- tutFire + info buttons + Help tab ----
fresh(); t.ok(A.tutFire('boss') && CO.cur.id === 'boss', 'tutFire forces a step'); A.finish();
t.ok(!A.tutFire('nope'), 'tutFire unknown id is false');
A.tutHelp('zz_test', 'Test entry', 'Hello there.', 'star', 'Testing'); t.ok(TUT.helpBy.zz_test && TUT.cats.includes('Testing'), 'tutHelp adds entries and categories');
t.ok(A.tutOpen('zz_test') && CO.cur.manual, 'tutOpen shows the help card'); EI.draw(0.016); t.ok(gotIt(), 'help card has a Got it'); settle(); A.finish();
t.ok(!A.tutOpen('missing'), 'tutOpen unknown is false');
EI.openSheet('more', 'help'); for (let i = 0; i < 3; i++) EI.draw(0.016);
t.ok(EI.hits().length > 5, 'Help tab draws with tap areas');
// expand the first entry: the tab content grows
const h1 = S().sheet.H; const hs = EI.hits().filter(h => h.sheet); hs[hs.length > 3 ? 3 : 0].act(); EI.draw(0.016); EI.draw(0.016);
t.ok(S().sheet.H > h1, 'tapping a help entry expands it (' + h1 + ' -> ' + S().sheet.H + ')'); EI.closeSheet();

// ---- rendering at several sizes, every card type ----
let threw = 0;
for (const [w, h] of [[412, 860], [360, 640], [1280, 800], [400, 800]]) {
  global.window.innerWidth = w; global.window.innerHeight = h; EI.resize();
  fresh(); S().lands.push(...[]); S().chest = { x: 100, y: 100, val: 5, t: 0 }; S().unlockPlate = { x: 50, y: 50, cost: 10, paid: 0 };
  for (const s of TUT.steps) {
    try { A.tutFire(s.id); for (let i = 0; i < 4; i++) EI.draw(0.05); A.dismiss(); for (let i = 0; i < 5; i++) { A.coachTick(0.3); EI.draw(0.05); } A.finish(); } catch (e) { threw++; console.log('threw', s.id, w, e.message); }
  }
  try { A.tutOpen('loot'); EI.draw(0.016); A.finish(); EI.openSheet('more', 'help'); EI.draw(0.016); EI.closeSheet(); } catch (e) { threw++; console.log('threw help', e.message); }
}
t.ok(threw === 0, 'every card type draws at 412x860, 360x640, desktop without throwing');
global.window.innerWidth = 400; global.window.innerHeight = 800; EI.resize();

// ---- soak: 600 ticks + draws with the queue live ----
fresh(); S().feat.tutorial.seen = {}; let soak = 0;
try { for (let i = 0; i < 600; i++) { if (CO.cur && CO.cur.block && i % 5 === 0) A.dismiss(); EI.tick(0.05); EI.draw(0.05); if (CO.cur) soak++; } } catch (e) { soak = -1; console.log(e.stack); }
t.ok(soak > 0, '600 ticks + draws with live coaching run clean (' + soak + ' frames with a card)');
t.done();
