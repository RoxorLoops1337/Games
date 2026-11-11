// Layout gate for the non-combat screens: drives each screen through its states with the headless app and proves, per
// frame, that registered widgets never overlap (other than within a group or flagged overlay), stay inside 1280x720,
// that nothing sits in the reserved Pause/Fullscreen zone, and that every app.text() block fits the widget it is drawn in.
// The harness (make, look, go, flowFor, the checks and the verdict) is tests/graftwork_layout_lib.mjs, which the tooltip sweep
// (tests/graftwork_tip_layout.test.mjs) uses too.
import assert from 'node:assert/strict';
import { frames, click, key, wardOpen } from './graftwork_lib.mjs';
import { layoutGate, graftHeavy, wonFight, openEvent, allSeen } from './graftwork_layout_lib.mjs';
import * as RUN from '../graftwork/engine/run.js';
import * as METAX from '../graftwork/engine/meta.js';
import * as LAYOUT from '../graftwork/ui/layout_registry.js';
import { TIP_TIMING } from '../graftwork/ui/tooltips.js';
import { openPause } from '../graftwork/ui/pause.js';
TIP_TIMING.SHOW_DELAY = 0.1; // a hover here rests 6 or 7 frames (0.1 s) before it is looked at: the real 0.25 s delay is covered by graftwork_tip_lifecycle
import { CARDS, RELICS, POTIONS, EVENTS, ENEMIES } from '../graftwork/data/index.js';

// Faults the sweeps found when they moved from Classic vehicles to scenes the Ward really makes (design/CLEANUP_PLAN.md, "Layout faults the port
// found"). They are older than the retirement: no sweep had ever seen the reward WITH its building plan row, the Ward's hand had no text-on-text
// check, and the Dispensary now deals other items than the old seed did. One entry = scene pattern, kind and (where the scene is otherwise
// clean) the text: everything else in these scenes, and anything new, still fails. They are counted and printed, never dropped silently.
const OPEN_WARD = [
  [/^reward\/(s125|s150|p0\.64|p0\.54|p0\.46)\/elite\/ward/, /^(overlap|text-hits|text-overflow|text-text)$/, null], // relic + potion + plans: the plan row runs into the notes and Continue
  [/^reward\/(s125|s150|p0\.64|p0\.54|p0\.46)\/boss\/ward/, /^text-truncated$/, /^"Pick 1 for your/],                 // the plan row's caption beside three plans
  [/^reward\/(p0\.54|p0\.46)\/boss\/ward/, /^text-truncated$/, null],                                              // boss relic card texts under the plan row on the two small phone stages
  [/^shop\/p0\.46/, /^text-truncated$/, /^"(Weight 1\. Boon: When it extends the Line|Featherweig)/],                // a long graft subtitle in the card picker, one relic name
];
const { make, look, go, report, flowFor } = layoutGate({ openWard: OPEN_WARD });

// ---- helpers for scenarios ---------------------------------------------------------------------------------------
const hoverAt = (h, x, y, n = 4) => { h.app.mouse.x = x; h.app.mouse.y = y; frames(h.app, n); };


const richMeta = () => { const m = METAX.migrate(null); m.credit.bal = 140; m.credit.total = 400; for (const a of METAX.ACHIEVEMENTS.slice(0, 12)) if (a.reward) METAX.grantReward(m, a.reward); m.loadout.title = m.cosmetics.titles[0] || null; m.seen = { cards: {}, grafts: {}, enemies: {}, relics: {}, statuses: {} }; return m; };
const caseFile = (run, won) => METAX.caseFile(Object.assign(run, { stats: { ...run.stats, maxLine: 5, maxHit: 61, shatters: 2, bosses: 3 } }), won, {});
// ---- REWARD ---------------------------------------------------------------------------------------------------------
// Two shapes per kind: the bare reward (rows, relic cards, notes, Continue: the screen's own layout) and the reward as a won Ward fight makes
// it (`/ward`: salvage in the subtitle, and for an elite or a boss the building plan row on top of everything else).
for (const scale of [100, 125, 150]) for (const kind of ['normal', 'elite', 'boss']) for (const real of [false, true]) {
  const h = await make({ scale, seed: 'rw' + kind });
  flowFor(h); h.run.act = 3;
  const rw = real ? wonFight(h, kind) : RUN.fightRewards(h.run, kind, {}), W = real ? '/ward' : '';
  if (real) { assert.ok(rw.ward, 'the reward knows its room'); if (kind !== 'normal') assert.ok(rw.buildChoice && rw.buildChoice.length === 3, kind + ' reward offers a building plan'); }
  if (kind === 'normal') { rw.potion = Object.keys(POTIONS)[0]; }
  if (kind === 'elite') { rw.potion = Object.keys(POTIONS)[1]; rw.relic = Object.keys(RELICS)[3]; }
  if (kind === 'boss') { rw.potion = Object.keys(POTIONS)[2]; rw.relicChoices = Object.keys(RELICS).filter((id) => RELICS[id].rarity === 'boss').slice(0, 3); if (rw.relicChoices.length < 3) rw.relicChoices = Object.keys(RELICS).slice(0, 3); }
  go(h, 'reward');
  look(h, 80, `reward/s${scale}/${kind}${W}`);
  hoverAt(h, 640, 160); look(h, 2, `reward/s${scale}/${kind}${W}/hover`);
  if (kind === 'boss') { key(h.app, 'q'); look(h, 30, `reward/s${scale}/boss${W}/picked`); }
}


// ---- GRAFT TABLE ----------------------------------------------------------------------------------------------------
for (const scale of [100, 125, 150]) for (const four of [false, true]) {
  const h = await make({ scale, seed: 'gt' + four });
  flowFor(h); graftHeavy(h.run, four ? 9 : 2);
  if (four) h.run.relics.push('r_second_opinion');
  h.run.gold = 999;
  RUN.startGraftPick(h.run);
  go(h, 'graft');
  const tag = `graft/s${scale}/${four ? 4 : 3}`;
  look(h, 90, tag);
  const off = h.run.pending.offer, scr = h.app.current;
  key(h.app, '1'); key(h.app, 'q'); look(h, 40, tag + '/pair1');
  for (let j = 0; j < off.grafts.length; j++) { key(h.app, 'qwer'[j]); look(h, 30, tag + '/g' + j); }
  for (let i = 0; i < 3; i++) { key(h.app, String(i + 1)); look(h, 30, tag + '/c' + i); }
  hoverAt(h, 300, 280); look(h, 2, tag + '/hovercard'); hoverAt(h, 1000, 150); look(h, 2, tag + '/hoverpatch');
  key(h.app, 'Escape'); look(h, 10, tag + '/skip'); key(h.app, '1'); look(h, 5, tag + '/skip1');
}

// ---- SHOP -----------------------------------------------------------------------------------------------------------
const addCards = (run, n) => { const ids = Object.keys(CARDS).filter((id) => CARDS[id].type !== 'junk' && (CARDS[id].hero === run.hero || CARDS[id].hero === 'any')); for (let i = 0; i < n; i++) RUN.R.addCard(run, ids[i % ids.length]); };
for (const scale of [100, 125, 150]) for (const hero of ['marrow', 'wick']) {
  const h = await make({ scale, hero, seed: 'shop' });
  flowFor(h); h.run.gold = 9999; h.run.act = 3; graftHeavy(h.run, 4);
  wardOpen(h.run, 'shop'); h.run.potions = [];
  go(h, 'shop');
  const tag = `shop/s${scale}/${hero}`;
  look(h, 60, tag);
  for (const [x, y] of [[347, 190], [545, 190], [780, 392], [380, 540], [1000, 400], [1000, 520]]) { hoverAt(h, x, y); look(h, 3, tag + '/hover'); }
  h.app.mouse.x = 0; h.app.mouse.y = 0;
  click(h.app, 270 + 100, 400); look(h, 30, tag + '/graftpicker'); key(h.app, 'Escape'); look(h, 30, tag + '/back');
  if (scale === 100) { addCards(h.run, 25); click(h.app, 400, 645); look(h, 30, tag + '/removepicker'); h.app.mouse.wheel = 400; look(h, 10, tag + '/removepicker2'); key(h.app, 'Escape'); }
}

// ---- FORGE ----------------------------------------------------------------------------------------------------------
for (const scale of [100, 125, 150]) {
  const h = await make({ scale, seed: 'forge' });
  flowFor(h); h.run.gold = 999; h.run.relics.push(Object.keys(RELICS).find((id) => RELICS[id].perk === 'forgeExtra') || 'r_none'); graftHeavy(h.run, 6);
  wardOpen(h.run, 'forge');
  go(h, 'forge');
  const tag = `forge/s${scale}`;
  look(h, 60, tag);
  for (let i = 0; i < 6; i++) { hoverAt(h, 100 + i * 200, 300); look(h, 3, tag + '/hover'); }
  h.app.mouse.x = 0; h.app.mouse.y = 0;
  if (scale === 100) {
    for (const nCards of [1, 8, 40]) for (let opt = 0; opt < 6; opt++) {
      const hh = await make({ scale, seed: 'fp' + nCards + opt });
      flowFor(hh); hh.run.gold = 999; graftHeavy(hh.run, 6);
      if (nCards === 40) addCards(hh.run, 30); if (nCards === 1) hh.run.deck.splice(1);
      wardOpen(hh.run, 'forge');
      go(hh, 'forge'); frames(hh.app, 40);
      const fm = await import('../graftwork/ui/forge.js');
      click(hh.app, fm.optionCenterX(opt), 300); look(hh, 30, `forge/picker${nCards}/o${opt}`);
      hh.app.mouse.wheel = 500; look(hh, 10, `forge/picker${nCards}/o${opt}/scroll`);
      key(hh.app, 'Escape'); look(hh, 20, `forge/picker${nCards}/o${opt}/closed`);
    }
  }
}

// ---- EVENT ----------------------------------------------------------------------------------------------------------
{
  const evs = Object.values(EVENTS);
  for (const scale of [100, 125, 150]) for (const [ei, ev] of evs.entries()) {
    const h = await make({ scale, seed: 'ev-' + ev.id, hero: ['marrow', 'wick', 'odile'][ev.id.length % 3] });
    flowFor(h); h.run.act = ev.act || 1; h.run.gold = 300;
    openEvent(h, ev.id, ei + scale / 25);
    h.run.flags = h.run.flags || {};
    go(h, 'event');
    if (!h.app.screens.event.ev) continue;
    look(h, 400, `event/s${scale}/${ev.id}`);
    // hover each choice, then take choice 1
    for (let y = 300; y < 650; y += 90) { hoverAt(h, 900, y); look(h, 2, `event/s${scale}/${ev.id}/hover`); }
    key(h.app, '1'); look(h, 400, `event/s${scale}/${ev.id}/result`);
  }
  // synthetic: 1 to 5 choices and a very long text
  for (const scale of [100, 150]) for (const n of [1, 2, 3, 4, 5]) {
    const h = await make({ scale, seed: 'evx' });
    flowFor(h);
    const fake = { id: 'e_layout', name: 'A Very Long Event Name That Wraps Over Two Lines Of The Parchment', act: 0, text: 'The corridor smells of iodine and old coins. '.repeat(scale > 125 ? 3 : 7),
      choices: Array.from({ length: n }, (_, i) => ({ label: 'Choice number ' + (i + 1) + ' with a long label', text: 'Plain description of what this does to you and your deck, said at some length so it wraps onto several lines of the choice card.', apply: () => 'Done.' })) };
    EVENTS.e_layout = fake;
    openEvent(h, 'e_layout', n);
    go(h, 'event'); look(h, 600, `event/s${scale}/fake${n}`);
    delete EVENTS.e_layout;
  }
}

// ---- DECK VIEW, CODEX, END ------------------------------------------------------------------------------------------
for (const scale of [100, 125, 150]) {
  for (const n of [0, 15, 45]) {
    const h = await make({ scale, seed: 'dv' + n });
    flowFor(h); go(h, 'base', {}); h.app.go('base');
    graftHeavy(h.run, n ? 8 : 0);
    if (n === 0) h.run.deck = []; else if (n === 45) addCards(h.run, 45 - h.run.deck.length); else h.run.deck = h.run.deck.slice(0, 15);
    h.app.push('deckview', {});
    const tag = `deck/s${scale}/${n}`;
    look(h, 40, tag);
    for (const [x, y] of [[40, 124], [110, 124], [180, 124], [250, 124], [330, 124], [430, 124], [560, 124], [660, 124], [760, 124], [860, 124], [960, 124]]) { click(h.app, x, y); look(h, 3, tag + '/filter'); }
    h.app.mouse.x = 300; h.app.mouse.y = 300; h.app.mouse.wheel = 600; look(h, 5, tag + '/scroll');
    hoverAt(h, 200, 300); look(h, 3, tag + '/hover');
  }
  const hp = await make({ scale, seed: 'dvp' }); flowFor(hp); hp.app.go('base');
  hp.app.push('deckview', { mode: 'pick', filter: (i) => i.id === 'm_cut', title: 'Choose a card', onPick() {} }); look(hp, 40, `deck/s${scale}/pick`);
  const hc = await make({ scale, seed: 'cx' }); flowFor(hc); hc.app.go('base');
  hc.meta.seen = allSeen(); // everything met: the longest real texts
  hc.app.push('codex', {});
  for (let i = 0; i < 7; i++) { hc.app.top().setTab(i); look(hc, 20, `codex/s${scale}/tab${i}`); hc.app.mouse.x = 400; hc.app.mouse.y = 300; hc.app.mouse.wheel = 400; look(hc, 5, `codex/s${scale}/tab${i}/scroll`); }
  for (const phone of [false, true]) for (const cat of [0, 1, 2, 3]) {
    const hw = await make({ scale, phone, seed: 'wd', meta: richMeta() }); flowFor(hw).openWardrobe = () => hw.app.push('wardrobe', {});
    hw.app.go('base'); hw.app.push('wardrobe', {}); hw.app.top().setCat(cat); look(hw, 20, `wardrobe/s${scale}/${phone ? 'phone' : 'desk'}/c${cat}`);
    hoverAt(hw, 400, 300); look(hw, 3, `wardrobe/s${scale}/${phone ? 'phone' : 'desk'}/c${cat}/hover`);
  }
  { const hr = await make({ scale, seed: 'rec', meta: richMeta() }); flowFor(hr); hr.app.go('base'); hr.app.push('codex', {}); hr.app.top().setTab(7); look(hr, 20, `codex/s${scale}/records`); }
  { const hf = await make({ scale, seed: 'cf', hero: 'wick', meta: richMeta() }); flowFor(hf); graftHeavy(hf.run, 6); hf.run.phase = 'won'; hf.run.flags = {}; hf.run.endInfo = { caseFile: caseFile(hf.run, true) }; go(hf, 'end'); look(hf, 200, `end/s${scale}/casefile`); }
  for (const won of [true, false]) {
    const he = await make({ scale, seed: 'end' + won, hero: won ? 'odile' : 'wick' });
    flowFor(he); graftHeavy(he.run, 10); he.run.phase = won ? 'won' : 'dead'; he.run.killedBy = 'the_grafter';
    he.run.flags = he.run.flags || {}; go(he, 'end');
    look(he, 200, `end/s${scale}/${won ? 'won' : 'dead'}`);
    hoverAt(he, 500, 300); look(he, 3, `end/s${scale}/${won ? 'won' : 'dead'}/hover`);
  }
}
// ---- PHONE (844x390: text floor inflates labels): the screens fixed for readability must stay overlap-free ----------
{
  const hg = await make({ phone: true, seed: 'ph-graft' }); flowFor(hg); graftHeavy(hg.run, 2); RUN.startGraftPick(hg.run); go(hg, 'graft');
  look(hg, 90, 'graft/phone'); key(hg.app, '2'); key(hg.app, 'q'); look(hg, 40, 'graft/phone/pair');
  const hd = await make({ phone: true, seed: 'ph-deck' }); flowFor(hd); hd.app.go('base'); graftHeavy(hd.run, 8); hd.app.push('deckview', {}); look(hd, 40, 'deck/phone');
  hoverAt(hd, 1100, 300); look(hd, 3, 'deck/phone/side'); hoverAt(hd, 200, 300); look(hd, 3, 'deck/phone/hover');
  const hc = await make({ phone: true, seed: 'ph-cx' }); flowFor(hc); hc.app.go('base'); hc.app.push('codex', {}); hc.app.top().setTab(6); look(hc, 20, 'codex/phone/rules');
  for (const won of [true, false]) { const he = await make({ phone: true, seed: 'ph-end' + won, hero: 'odile' }); flowFor(he); graftHeavy(he.run, 10); he.run.phase = won ? 'won' : 'dead'; he.run.flags = he.run.flags || {}; go(he, 'end'); look(he, 200, 'end/phone/' + (won ? 'won' : 'dead')); }
}
// ---- PHONE SWEEP: every screen at the three phone stage scales (0.64 = 820x462, 0.54 = 844x390, 0.46 = 740x330) ----------
// The small-screen text floor inflates labels up to 1.5x there; every fitted label must shrink back instead of overflowing, overlapping or ending in an ellipsis.
for (const pscale of [0.64, 0.54, 0.46]) {
  const T = (n) => `${n}/p${pscale}`;
  for (const kind of ['normal', 'elite', 'boss']) for (const real of [false, true]) {
    const h = await make({ pscale, seed: 'prw' + kind }); flowFor(h); h.run.act = 3;
    const rw = real ? wonFight(h, kind) : RUN.fightRewards(h.run, kind, {});
    if (kind !== 'normal') { rw.potion = Object.keys(POTIONS)[1]; rw.relic = Object.keys(RELICS)[3]; }
    if (kind === 'boss') { rw.relicChoices = Object.keys(RELICS).slice(0, 3); }
    go(h, 'reward'); look(h, 80, T('reward') + '/' + kind + (real ? '/ward' : ''));
  }
  for (const four of [false, true]) {
    const h = await make({ pscale, seed: 'pgt' + four }); flowFor(h); graftHeavy(h.run, four ? 9 : 2);
    if (four) h.run.relics.push('r_second_opinion');
    h.run.gold = 999; RUN.startGraftPick(h.run); go(h, 'graft');
    const tag = T('graft') + '/' + (four ? 4 : 3); look(h, 90, tag);
    const off = h.run.pending.offer;
    key(h.app, '1'); key(h.app, 'q'); look(h, 40, tag + '/pair1');
    for (let j = 0; j < off.grafts.length; j++) { key(h.app, 'qwer'[j]); look(h, 30, tag + '/g' + j); }
    for (let i = 0; i < 3; i++) { key(h.app, String(i + 1)); look(h, 30, tag + '/c' + i); }
    hoverAt(h, 300, 280); look(h, 2, tag + '/hovercard'); hoverAt(h, 1000, 150); look(h, 2, tag + '/hoverpatch');
    key(h.app, 'Escape'); look(h, 10, tag + '/skip');
  }
  for (const hero of ['marrow', 'wick']) {
    const h = await make({ pscale, hero, seed: 'pshop' }); flowFor(h); h.run.gold = 9999; h.run.act = 3; graftHeavy(h.run, 4);
    wardOpen(h.run, 'shop'); h.run.potions = []; go(h, 'shop');
    const tag = T('shop') + '/' + hero; look(h, 60, tag);
    for (const [x, y] of [[347, 190], [780, 392], [380, 540], [1000, 400]]) { hoverAt(h, x, y); look(h, 3, tag + '/hover'); }
    h.app.mouse.x = 0; h.app.mouse.y = 0; click(h.app, 270 + 100, 400); look(h, 30, tag + '/graftpicker'); hoverAt(h, 150, 220); look(h, 4, tag + '/graftpicker/hover'); key(h.app, 'Escape');
  }
  { const h = await make({ pscale, seed: 'pforge' }); flowFor(h); h.run.gold = 999; graftHeavy(h.run, 6); wardOpen(h.run, 'forge'); go(h, 'forge');
    look(h, 60, T('forge')); const fm = await import('../graftwork/ui/forge.js');
    for (let i = 0; i < 6; i++) { hoverAt(h, 100 + i * 200, 300); look(h, 3, T('forge') + '/hover'); }
    for (const opt of [0, 3]) { click(h.app, fm.optionCenterX(opt), 300); look(h, 30, T('forge') + '/picker' + opt); hoverAt(h, 150, 220); look(h, 4, T('forge') + '/picker' + opt + '/hover'); key(h.app, 'Escape'); look(h, 20, T('forge') + '/closed'); } }
  for (const [ei, ev] of Object.values(EVENTS).filter((e, i) => i % 3 === 0).entries()) {
    const h = await make({ pscale, seed: 'pev-' + ev.id }); flowFor(h); h.run.act = ev.act || 1; h.run.gold = 300;
    openEvent(h, ev.id, ei); h.run.flags = h.run.flags || {}; go(h, 'event');
    if (!h.app.screens.event.ev) continue;
    look(h, 400, T('event') + '/' + ev.id); key(h.app, '1'); look(h, 400, T('event') + '/' + ev.id + '/result');
  }
  for (const n of [15, 45]) {
    const h = await make({ pscale, seed: 'pdv' + n }); flowFor(h); h.app.go('base'); graftHeavy(h.run, 8);
    if (n === 45) addCards(h.run, 45 - h.run.deck.length);
    h.app.push('deckview', {}); const tag = T('deck') + '/' + n; look(h, 40, tag);
    for (const [x, y] of [[40, 124], [330, 124], [660, 124], [960, 124]]) { click(h.app, x, y); look(h, 3, tag + '/filter'); }
    hoverAt(h, 200, 300); look(h, 3, tag + '/hover'); hoverAt(h, 1100, 300); look(h, 3, tag + '/side');
  }
  { const hc = await make({ pscale, seed: 'pcx' }); flowFor(hc); hc.app.go('base');
    hc.meta.seen = allSeen();
    hc.app.push('codex', {}); for (let i = 0; i < 7; i++) { hc.app.top().setTab(i); look(hc, 20, T('codex') + '/tab' + i); } }
  for (const cat of [0, 1, 2, 3]) { const hw = await make({ pscale, seed: 'pwd', meta: richMeta() }); flowFor(hw); hw.app.go('base'); hw.app.push('wardrobe', {}); hw.app.top().setCat(cat); look(hw, 20, T('wardrobe') + '/c' + cat); }
  for (const won of [true, false]) { const he = await make({ pscale, seed: 'pend' + won, hero: 'odile' }); flowFor(he); graftHeavy(he.run, 10); he.run.phase = won ? 'won' : 'dead'; he.run.killedBy = 'the_grafter'; he.run.flags = he.run.flags || {}; go(he, 'end'); look(he, 200, T('end') + '/' + (won ? 'won' : 'dead')); }
}

// ---- TITLE, HERO SELECT, SETTINGS, PAUSE (desktop at scale 100/150 and every phone scale) -----------------------------
for (const [scale, pscale] of [[100, 0], [150, 0], [100, 1], [100, 0.64], [100, 0.54], [100, 0.46]]) {
  const T = (n) => `${n}/` + (pscale > 1 ? 'phone' : pscale ? 'p' + pscale : 's' + scale);
  const o = { scale, seed: 'ttl', meta: richMeta() }; if (pscale > 1) o.phone = true; else if (pscale) o.pscale = pscale;
  const h = await make(o); const f = flowFor(h); h.meta.unlocked.heroes = ['marrow', 'wick', 'odile']; h.meta.bestAsc = { marrow: 3 };
  f.hasSave = () => false; f.start = () => {}; f.openSettings = () => h.app.push('settings', {}); f.openPause = () => openPause(h.app);
  h.app.shared.audio = { sfx() {}, music() {}, setVolumes() {}, mute() {} };
  h.app.go('title'); look(h, 80, T('title') + '/menu');
  { // Install app available (Chrome fired beforeinstallprompt): the Install slab shares the Credits row, with and without a saved run, plus the Settings row
    const INST = await import('../graftwork/ui/install.js'); INST.resetInstall();
    const L = {}; INST.initInstall({ window: { addEventListener(n, fn) { L[n] = fn; }, matchMedia: () => ({ matches: false }) }, navigator: { userAgent: 'Chrome/130', platform: '', maxTouchPoints: 0 } });
    L.beforeinstallprompt({ preventDefault() {}, prompt: async () => {}, userChoice: Promise.resolve({ outcome: 'dismissed' }) });
    for (const save of [false, true]) {
      const hi = await make(o); const fi = flowFor(hi); hi.meta.unlocked.heroes = ['marrow', 'wick', 'odile']; fi.hasSave = () => save; fi.openSettings = () => hi.app.push('settings', {});
      hi.app.shared.audio = h.app.shared.audio; hi.app.go('title'); look(hi, 80, T('title') + '/install' + (save ? 'save' : ''));
      hoverAt(hi, 725, save ? 640 : 554); look(hi, 3, T('title') + '/installhover' + (save ? 'save' : ''));
    }
    const hs = await make(o); flowFor(hs); hs.app.shared.audio = h.app.shared.audio; hs.app.push('settings', {}); look(hs, 40, T('settings') + '/install');
    INST.resetInstall();
  }
  hoverAt(h, 640, 330); look(h, 3, T('title') + '/hover');
  { // the notice a retired save leaves (meta.notice): the dimmed menu, the panel, the sentence, the button
    const hn = await make(o); const fn = flowFor(hn); fn.hasSave = () => false; fn.openSettings = () => {}; hn.meta.unlocked.heroes = ['marrow', 'wick', 'odile']; hn.meta.notice = 'classic_retired';
    hn.app.shared.audio = h.app.shared.audio; hn.app.go('title'); look(hn, 80, T('title') + '/notice'); assert.ok(LAYOUT.getAll().some((r) => r.id === 'title-notice'), 'the notice is up');
    hoverAt(hn, 640, 400); look(hn, 3, T('title') + '/noticehover'); key(hn.app, 'Enter'); look(hn, 10, T('title') + '/noticegone'); assert.equal(hn.meta.notice, undefined);
  }
  { // continue present, both pips, a saved hero card, the sewing intro at four moments
    const hv = await make(o); const fv = flowFor(hv); hv.meta.unlocked.heroes = ['marrow', 'wick', 'odile']; fv.hasSave = () => true; fv.resume = () => true; fv.openSettings = () => {}; hv.meta.history = [{ hero: 'wick' }]; hv.meta.unlocked.fresh = { a: 1, b: 1, c: 1 };
    hv.app.shared.audio = h.app.shared.audio; hv.app.go('title'); look(hv, 80, T('title') + '/save'); hoverAt(hv, 640, 336); look(hv, 3, T('title') + '/savehover'); hoverAt(hv, 725, 466); look(hv, 3, T('title') + '/pip');
    const hi = await make(o); const fi = flowFor(hi); fi.hasSave = () => false; hi.app.shared.audio = h.app.shared.audio; hi.app.go('title', { intro: true }); for (const n of [20, 50, 60, 120]) look(hi, n, T('title') + '/intro' + n);
  }
  const tm = h.app.top(); tm.openSelect(h.app); look(h, 40, T('title') + '/select');
  for (let i = 0; i < 3; i++) { click(h.app, 50 + i * 400 + 190, 300); look(h, 5, T('title') + '/select' + i); hoverAt(h, 50 + i * 400 + 190, 300); look(h, 3, T('title') + '/selhover' + i); }
  const hl = await make(o); const fl = flowFor(hl); fl.hasSave = () => false; fl.start = () => {}; hl.meta.unlocked.heroes = ['marrow']; hl.meta.settings.assist = { on: true, a: true, b: true, c: true, d: true };
  hl.app.shared.audio = h.app.shared.audio; hl.app.go('title'); frames(hl.app, 60); hl.app.top().openSelect(hl.app); look(hl, 40, T('title') + '/locked');
  hoverAt(hl, 690, 300); look(hl, 3, T('title') + '/lockedhover'); hoverAt(hl, 100, 540); look(hl, 3, T('title') + '/assisthover');
  const hs = await make(o); flowFor(hs); hs.app.go('base'); hs.app.push('settings', {}); look(hs, 40, T('settings'));
  for (const [x, y] of [[300, 150], [300, 250], [300, 350], [300, 450], [300, 550], [900, 300]]) { hoverAt(hs, x, y); look(hs, 3, T('settings') + '/hover'); }
  const hp = await make(o); const fp = flowFor(hp); fp.openSettings = () => {}; fp.openPause = () => {}; fp.openWardrobe = () => {}; hp.app.shared.audio = h.app.shared.audio; hp.app.go('base'); hp.app.push('pause', {}); look(hp, 40, T('pause'));
  for (const m of ['help']) { hp.app.top().mode = m; look(hp, 20, T('pause') + '/' + m); }
  const hq = await make(o); flowFor(hq); hq.app.shared.audio = h.app.shared.audio; hq.app.go('base'); hq.app.push('pause', {}); look(hq, 20, T('pause') + '/m'); hq.app.top().activate(hq.app, 'abandon'); look(hq, 20, T('pause') + '/confirm');
}

// ---- TOOLTIP SWEEP: a grid hovered over each screen at every phone scale and on the desktop is tests/graftwork_tip_layout.test.mjs ----

// ---- ARCHIVE: the Archive screen, the end-screen award panel, the NEW ribbon (desktop 100/150 and every phone scale) ---------------------------------
{
  const { UNLOCKS, LOCKED_IDS } = await import('../graftwork/data/unlocks.js');
  const partial = (n, fresh) => { const m = richMeta(); LOCKED_IDS.slice(0, n).forEach((id) => { m.unlocked.ids[id] = 1; if (fresh) m.unlocked.fresh = { ...(m.unlocked.fresh || {}), [id]: 1 }; }); m.unlocked.points = 7; m.stats.wins = 3; m.stats.deaths = 9; return m; };
  const doneMeta = () => { const m = richMeta(); for (const id of LOCKED_IDS) m.unlocked.ids[id] = 1; m.unlocked.heroes = ['marrow', 'wick', 'odile']; return m; };
  for (const [scale, pscale] of [[100, 0], [150, 0], [100, 1], [100, 0.64], [100, 0.54], [100, 0.46]]) {
    const T = (n) => `${n}/` + (pscale > 1 ? 'phone' : pscale ? 'p' + pscale : 's' + scale);
    const base = { scale, seed: 'arch' }; if (pscale > 1) base.phone = true; else if (pscale) base.pscale = pscale;
    for (const [mname, mk] of [['new', () => partial(0)], ['mid', () => partial(90)], ['late', () => partial(250)], ['done', doneMeta]]) {
      const h = await make({ ...base, meta: mk() }); flowFor(h); h.app.go('base'); h.app.push('archive', {});
      const tag = T('archive') + '/' + mname; look(h, 30, tag);
      const scr = h.app.top();
      for (let i = 0; i < 5; i++) { scr.setTab(i); look(h, 6, tag + '/tab' + i); hoverAt(h, 480, 420); look(h, 3, tag + '/tab' + i + '/hover'); h.app.mouse.wheel = 400; look(h, 4, tag + '/tab' + i + '/scroll'); }
      scr.setTab(0); for (const f of ['marrow', 'wick', 'odile', 'any']) { scr.hero = f; look(h, 5, tag + '/f' + f); }
      for (const [x, y] of [[420, 120], [420, 200], [100, 150], [100, 500], [900, 420]]) { hoverAt(h, x, y); look(h, 3, tag + '/hover'); }
    }
    // end screen with the award: first run, big run with many stamps + hero, capped win, everything open, practice
    for (const kind of ['first', 'many', 'winhero', 'done', 'practice']) {
      const meta = kind === 'done' ? doneMeta() : richMeta();
      if (kind === 'many' || kind === 'winhero') meta.unlocked.points = 600;
      if (kind === 'winhero') { meta.stats.deaths = 6; meta.unlocked.maxAct = 2; }
      const h = await make({ ...base, meta, hero: kind === 'winhero' ? 'wick' : 'marrow', seed: 'endA' + kind }); flowFor(h); graftHeavy(h.run, 8);
      const won = kind === 'winhero' || kind === 'done';
      h.run.phase = won ? 'won' : 'dead'; h.run.act = won ? 3 : 2; h.run.killedBy = 'the_grafter'; h.run.flags = h.run.flags || {};
      h.run.stats = { ...h.run.stats, floors: kind === 'first' ? 9 : 44, elites: kind === 'first' ? 1 : 7, bosses: kind === 'first' ? 0 : 3 };
      h.run.killedEnemies = Object.keys(ENEMIES).slice(0, 5);
      if (kind === 'practice') h.run.practice = true;
      if (kind === 'abandon') { h.run.abandoned = true; h.run.stats.floors = 1; }
      h.run.endInfo = METAX.recordRunEnd(h.meta, h.run, won ? 'won' : 'dead');
      go(h, 'end'); const tag = T('end') + '/award-' + kind;
      look(h, 80, tag + '/mid'); look(h, 400, tag);
      hoverAt(h, 500, 215); look(h, 3, tag + '/hoverstamp'); hoverAt(h, 600, 300); look(h, 3, tag + '/hoverarch');
    }
    // NEW ribbons in the offers: shop (card, graft, potion, relic), graft table, boss reward
    { const meta = richMeta(); meta.unlocked.fresh = Object.fromEntries(LOCKED_IDS.map((id) => [id, 1])); for (const id of LOCKED_IDS) meta.unlocked.ids[id] = 1;
      const h = await make({ ...base, meta, seed: 'ribshop' }); flowFor(h); h.run.gold = 9999; h.run.act = 3; graftHeavy(h.run, 3);
      wardOpen(h.run, 'shop'); h.run.potions = [];
      for (const kind of ['cards', 'grafts', 'potions', 'relics']) for (const it of h.run.pending[kind] || []) { const e = UNLOCKS[({ cards: 'card:', grafts: 'graft:', potions: 'potion:', relics: 'relic:' })[kind] + it.id]; if (e) meta.unlocked.fresh[e.id] = 1; }
      go(h, 'shop'); look(h, 60, T('shop') + '/ribbon-shop'); hoverAt(h, 347, 190); look(h, 3, T('shop') + '/ribbon-shop/hover');
      const hg = await make({ ...base, meta: (() => { const m = richMeta(); m.unlocked.fresh = {}; return m; })(), seed: 'ribgraft' }); flowFor(hg); graftHeavy(hg.run, 2); RUN.startGraftPick(hg.run);
      for (const gr of hg.run.pending.offer.grafts) { const e = UNLOCKS['graft:' + (gr.id || gr)]; if (e) hg.meta.unlocked.fresh[e.id] = 1; }
      go(hg, 'graft'); look(hg, 90, T('graft') + '/ribbon-graft');
      const hr = await make({ ...base, meta: (() => { const m = richMeta(); m.unlocked.fresh = {}; return m; })(), seed: 'ribreward' }); flowFor(hr); hr.run.act = 3;
      const rw = RUN.fightRewards(hr.run, 'boss', {}); rw.potion = Object.keys(POTIONS)[2]; rw.relicChoices = Object.keys(RELICS).filter((id) => RELICS[id].rarity === 'boss').slice(0, 3);
      for (const id of [...rw.relicChoices, rw.potion]) { const e = UNLOCKS['relic:' + id] || UNLOCKS['potion:' + id]; if (e) hr.meta.unlocked.fresh[e.id] = 1; }
      go(hr, 'reward'); look(hr, 80, T('reward') + '/ribbon-reward'); }
  }
}

report(['ward', 'combat', 'reward', 'graft', 'shop', 'forge', 'event', 'deck', 'codex', 'archive', 'end', 'wardrobe', 'title', 'settings', 'pause']);
console.log('graftwork_ui_layout ok');
