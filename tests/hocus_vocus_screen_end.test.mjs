// Story and endings suite: the screens story, chapterClear, gameOver and victory (js/screen_end.js, css/end.css) and the first-run hints
// (js/tutorial.js). Everything runs against the REAL modules (RUN, COMBAT, META, UI, ART, AUDIO, GAME and the combat screen) in the headless
// loader. The run summaries come from simulated runs: a bot plays real COMBAT fights for all three Acts (a win) or loses the first one,
// RUN.combatDone / claim / finishNode / chapterEnd move the run exactly as GAME does, and GAME.defeat / GAME.victory / GAME.nodeDone route to
// the screens with the real summary and the real META.recordRun result. The typewriter and the animation clock are checked in a realtime boot.
// The `tutorial` section drives a guided beginning through the bus, the placeholder map and the real combat screen and asserts that every hint
// fires exactly once at its moment, never stacks, never gates input, and honours the settings switch and ?notutorial=1.
import fs from 'node:fs';
import path from 'node:path';
import { boot, harness, DIR } from './hocus_vocus_lib.mjs';

const t = harness('hocus_vocus screen_end');
// DATA-owned names are read from DATA of the same boot (the re-theme renames them); this escapes one for a RegExp
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const DASH = new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']');
const RNG = new RegExp('Math' + '\\.' + 'random');
const SRC = fs.readFileSync(path.join(DIR, 'js', 'screen_end.js'), 'utf8');
const TUT = fs.readFileSync(path.join(DIR, 'js', 'tutorial.js'), 'utf8');
const CSS = fs.readFileSync(path.join(DIR, 'css', 'end.css'), 'utf8');

// ---------------------------------------------------------------------------------------------------- harness
function fresh(opts = {}) {
  const g = boot({ only: ['screen_end', 'screen_combat', 'tutorial', 'main'], seed: 5, continue: true, ...opts });
  const own = g._errors.filter((e) => /screen_end|tutorial|main|ui\.js|run\.js|meta\.js|combat\.js/.test(e.file));
  if (own.length) throw new Error('boot errors: ' + JSON.stringify(own.map((e) => e.file + ': ' + e.message)));
  g.GAME.boot();
  return g;
}
// $(sel, root?) works on the main page `g`; $(page, sel, root?) on another page
const $ = (a, b, c) => (typeof a === 'string' ? (b || g._doc).querySelector(a) : (c || a._doc).querySelector(b));
const $$ = (a, b, c) => Array.from(typeof a === 'string' ? (b || g._doc).querySelectorAll(a) : (c || a._doc).querySelectorAll(b));
const txt = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const settle = (g) => g._settle();
const errs = (g) => g._console.error.length;
const click = async (g, el) => { if (!el) throw new Error('click: no element'); g._click(el); await settle(g); };
const btnByText = (g, re, root) => $$(g, 'button', root).find((b) => re.test(b.textContent));
const num = (s) => Number(String(s).replace(/[^0-9.-]/g, ''));

const g = fresh();
const { DATA, UI, RUN, COMBAT, META, GAME, MAP, ART, U } = g;
await settle(g);

// ---------------------------------------------------------------------------------------------------- a simulated run
// A bot that plays real COMBAT: any playable card, a legal target, picks resolved, then end turn. Heroes are given a big HP pool so a long boss
// fight survives; a fight that drags on is forced to its end the way GAME.debug.win does.
function bot(C, cap = 700) {
  let guard = 0;
  while (C.result === null && guard++ < cap) {
    let did = false;
    if (C.pending) { C.resolvePick(C.pending.uids.slice(0, C.pending.n)); continue; }
    for (const c of C.hand.slice()) {
      const can = C.canPlay(c.uid);
      if (!can.ok && can.reason !== 'target') continue;
      const need = C.needsTarget(c.uid);
      const tg = need ? C.legalTargets(c.uid)[0] : undefined;
      if (need && tg === undefined) continue;
      if (C.play(c.uid, tg).length) { did = true; break; }
    }
    if (!did) C.endTurn();
  }
  if (C.result === null) { C.enemies.forEach((e) => { e.hp = 0; e.down = true; }); C.result = 'win'; C.phase = 'over'; }
  return C;
}

function nodeAt(R, kind) {
  R.node = null;
  const M = R.map, pos = M.pos;
  const cand = MAP.neighbors(M, pos.q, pos.r).map((c) => M.tiles[MAP.key(c[0], c[1])]).filter((x) => x && x.type !== 'block');
  const nb = cand.find((x) => !x.painted) || cand[0];
  nb.type = kind; nb.painted = true; nb.known = true; nb.done = false;
  nb.content = kind === 'boss' ? {} : kind === 'elite' || kind === 'enemy' ? { enc: (DATA.encounters[R.chapter][kind === 'elite' ? 'elite' : 'normal'][0] || {}).id } : {};
  const node = RUN.step(R, nb.q, nb.r);
  if (!node) throw new Error('RUN.step gave no node for ' + kind + ' at ' + JSON.stringify(pos) + ' tile ' + JSON.stringify(nb) + ' pending ' + JSON.stringify(R.pending) + ' done ' + R.done + ' chapter ' + R.chapter);
  return node;
}

function simFight(R, kind, lose) {
  const node = nodeAt(R, kind);
  if (!lose) R.heroes.forEach((h) => { h.hp = Math.max(h.hp, 1500); });
  if (lose) R.heroes.forEach((h) => { h.hp = 1; });
  const C = COMBAT.create(RUN.combatInit(R, node));
  C.start();
  if (lose) { let n = 0; while (C.result === null && n++ < 200) C.endTurn(); } else bot(C);
  return { C, node, rewards: RUN.combatDone(R, C) };
}
// answer whatever choices RUN left waiting (a relic's pickup hook, a card op) so the run can go on
function drainPending(R) {
  let guard = 0;
  while (R.pending && R.pending.length && guard++ < 12) {
    const p = R.pending[0];
    let choice = null;
    if (p.offers && p.offers.length) choice = p.offers[0];
    else if (p.op && /Card/.test(p.op)) choice = R.deck.slice(0, Math.max(1, p.n | 0)).map((c) => c.uid);
    const r = RUN.resolvePending(R, p.id, choice);
    if (!r.ok) { RUN.resolvePending(R, p.id, null); R.pending.shift(); }
  }
}
function takeRewards(R) {
  const rw = R.node && R.node.rewards;
  if (rw) RUN.claim(R, rw, { card: (rw.cards || [])[0] || null, relic: (rw.relics || [])[0] || null, gem: (rw.gems || [])[0] || null, takeBrush: !!rw.brush });
  drainPending(R);
  return RUN.finishNode(R);
}

// a run that clears `chapters` bosses (a win at 3) or dies in Act `die`
function simulate(seed, heroes, outcome, chapters = 3) {
  const R = RUN.newRun({ heroes, seed, trial: 0 });
  if (!R.map) RUN.startChapter(R, 1);
  R.heroes.forEach((h) => { h.maxHp = 3000; h.hp = 3000; });
  const stops = [];
  for (let ch = 1; ch <= chapters; ch++) {
    for (const kind of ['enemy', 'enemy', 'elite']) { simFight(R, kind, false); takeRewards(R); }
    const f = simFight(R, 'boss', false);
    const fin = takeRewards(R);
    if (!fin.chapterEnded) throw new Error('the boss did not end the chapter');
    const ce = RUN.chapterEnd(R);
    stops.push({ ch, ce });
    if (ch < chapters) { R.heroes.forEach((h) => { h.hp = Math.min(h.hp, h.maxHp); }); }
  }
  if (outcome === 'lose') {
    const L = RUN.newRun({ heroes, seed: seed + 1, trial: 0 });
    if (!L.map) RUN.startChapter(L, 1);
    simFight(L, 'enemy', false); takeRewards(L);
    simFight(L, 'elite', true);
    return { R: L, stops: [] };
  }
  return { R, stops };
}

// ================================================================================================ registration and structure
t.test('the four screens and the tutorial are registered', () => {
  ['story', 'chapterClear', 'gameOver', 'victory'].forEach((n) => {
    const s = UI.screens[n];
    t.ok(s && typeof s.enter === 'function' && typeof s.leave === 'function' && typeof s.update === 'function' && typeof s.draw === 'function' && typeof s.onKey === 'function', n + ' has the screen hooks');
  });
  t.ok(UI.tutorial && Array.isArray(UI.tutorial.shown) && typeof UI.tutorial.fire === 'function', 'UI.tutorial exists');
  t.eq(UI.screens.gameOver.music, 'defeat', 'defeat music'); t.eq(UI.screens.victory.music, 'victory', 'victory music'); t.eq(UI.screens.chapterClear.music, 'victory', 'chapter clear music');
});
t.test('house rules in my own files: no dashes, no Math.random, no layer-breaking GAME calls', () => {
  [['screen_end.js', SRC], ['tutorial.js', TUT], ['end.css', CSS]].forEach(([n, s]) => {
    t.ok(!DASH.test(s), n + ' has no em or en dashes');
    t.ok(!RNG.test(s), n + ' never calls the RNG');
  });
  t.ok(!/GAME\.(?!nodeDone|toTitle|enterNode)\w+/.test(TUT), 'tutorial.js never touches GAME');
});
t.test('the css namespaces every selector', () => {
  const sels = CSS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '').split('}').map((b) => b.split('{')[0].trim()).filter(Boolean);
  const bad = [];
  sels.forEach((group) => group.split(',').map((x) => x.trim()).forEach((sel) => {
    if (!sel || sel.startsWith('@')) return;
    if (!/(^|[\s>+~])(\.(en|st|cc|go|vc|tut|tw|fl|s-story|s-chapterClear|s-gameOver|s-victory)[-\w]*|body\.reduce-motion|body\.low)/.test(sel) && !/^\.hanko|^from|^to|^\d/.test(sel)) bad.push(sel);
  }));
  t.eq(bad.length, 0, 'every rule is namespaced: ' + bad.slice(0, 5).join(' | '));
});

// ================================================================================================ story
const LORE = DATA.LISTS && DATA.FIXED.lore.filter((id) => !/^barks_/.test(id));
async function openStory(id, then) {
  await UI.go('story', then ? { id, then } : { id }, { force: true, transition: 'none' });
  await settle(g);
  return $(g, '.s-story');
}
for (const id of LORE) {
  await t.test('story ' + id + ': the page, its seal, drop cap and typed text, and the lore is marked', async () => {
    const e0 = errs(g);
    const root = await openStory(id, { name: 'howto' });
    const lore = DATA.lore[id];
    const info = UI.screens.story._t.pageInfo(id);
    t.ok(root, 'the screen exists');
    t.eq(txt($('.st-title', root)), lore.title, 'the lore title');
    t.eq(txt($('.st-kicker', root)), info.kicker, 'the kicker');
    t.eq(txt($('.st-seal', root)), info.seal, 'the hanko seal');
    t.eq(txt($('.st-drop b', root)), lore.text[0], 'the illuminated first letter');
    t.eq(txt($('.st-typed', root)), lore.text.slice(1).replace(/\s+/g, ' ').trim(), 'the rest of the text, typed in full (headless is instant)');
    t.ok(txt($('.sr-only', root)).indexOf(lore.title) === 0, 'screen readers get the whole page at once');
    t.ok(META.loreSeen(id), 'META.markLore ran');
    t.ok(root.className.indexOf('en-settled') >= 0 && $('.st-turn', root), 'settled, with an On we go button');
    await g._tick(300);
    t.eq(errs(g), e0, 'no console errors while drawing');
    t.ok(ART.scene.lastError === null, 'the scene art drew without error');
  });
}
await t.test('story: scenes and portraits per page', () => {
  const P = UI.screens.story._t;
  t.eq(P.pageInfo('intro').scene, 'title', 'intro on the title scene'); t.eq(P.pageInfo('ch2_intro').scene, 'ch2', 'chapter pages on their chapter');
  t.eq(P.pageInfo('victory').scene, 'victory', 'victory'); t.eq(P.pageInfo('defeat').scene, 'defeat', 'defeat'); t.eq(P.pageInfo('hero_kuro').scene, 'camp', 'hero pages by the fire');
  t.deep(P.castFor('hero_suzu', null, null), ['suzu'], 'a hero page shows that hero alone');
  t.deep(P.castFor('intro', null, null), ['hanae', 'kuro'], 'no run: the default pair');
  t.deep(P.castFor('intro', { heroes: [{ id: 'raiga' }, { id: 'suzu' }] }, null), ['raiga', 'suzu'], 'the run\'s party');
});
await t.test('Hocus Vocus copy: the kickers and seals (HV_STORY 3.4), the curtain call lines, the share text and the unlock cards', () => {
  const P = UI.screens.story._t, V = UI.screens.victory._t;
  const pins = { intro: ['CURTAIN UP', 'ONCE'], ch1_intro: ['ACT ONE', 'I'], ch1_clear: ['END OF ACT ONE', 'I'], ch2_intro: ['ACT TWO', 'II'], ch2_clear: ['END OF ACT TWO', 'II'], ch3_intro: ['ACT THREE', 'III'],
    victory: ['FINALE', 'BRAVO'], defeat: ['INTERMISSION', 'PAUSE'], hero_hanae: ['MEET THE CREW', 'J'], hero_kuro: ['MEET THE CREW', 'R'], hero_suzu: ['MEET THE CREW', 'R'], hero_raiga: ['MEET THE CREW', 'A'], no_such_page: ['A DIARY ENTRY', '?'] };
  Object.keys(pins).forEach((id) => { const info = P.pageInfo(id); t.eq([info.kicker, info.seal].join(' / '), pins[id].join(' / '), id + ': the kicker and the seal'); });
  const lines = V.CURTAIN;
  ['hanae', 'kuro', 'suzu', 'raiga'].forEach((h) => {
    t.ok(lines[h].length <= 140, h + ': a curtain call line of at most 140 characters (' + lines[h].length + ')');
    t.ok(lines[h].indexOf(DATA.heroes[h].name) === 0, h + ': the line names its own hero first');
    t.ok(!DASH.test(lines[h]) && /^[\x20-\x7e]+$/.test(lines[h]), h + ': printable ASCII, no dashes');
  });
  t.ok(lines.raiga.indexOf("'Nice,' he said") > 0, 'Andy says Nice, and that is the whole speech');
  const base = { heroes: [{ id: 'hanae' }, { id: 'kuro' }], score: 1234, seed: 7, deckSize: 20, relics: ['a'], chapter: 2, stats: { bossKills: 2 } };
  const won = V.summaryText(Object.assign({ trial: 3 }, base), null, true).split('\n'), lost = V.summaryText(Object.assign({ trial: 0 }, base), null, false).split('\n'), daily = V.summaryText(Object.assign({ daily: true }, base), null, true).split('\n');
  t.eq(won[0], 'HOCUS VOCUS: still human', 'a win shares as still human'); t.eq(lost[0], 'HOCUS VOCUS: intermission in Act 2', 'a loss shares as an intermission');
  t.ok(/ \| Encore 3$/.test(won[1]) && / \| Encore 0$/.test(lost[1]) && / \| Daily Duet 7$/.test(daily[1]), 'the mode reads Encore N, Encore 0 and Daily Duet seed');
  t.eq(won[2], 'Seed 7 | 20 cards | 1 charm | 2 acts cleared', 'the third line counts cards, charms and acts');
  const cards = V.unlockEntries({ heroesUnlocked: ['suzu'], newTrial: 4 }, null);
  t.eq(cards.map((c) => c.seal + ' / ' + c.title).join(' ; '), 'NEW / ' + DATA.heroes.suzu.name + ' joins the tour! ; ENCORE / Encore 4 unlocked', 'the unlock cards');
  t.ok(/^.+\. Waiting on the hero select\.$/.test(cards[0].text) && /A harder encore of the same tour is waiting on the hero select\.$/.test(cards[1].text), 'and their lines');
  t.eq(V.scoreRows({ stats: { bossKills: 1, elites: 2 }, heroes: [], gold: 10, score: 0 }, null).rows.slice(0, 4).map((r) => r.label).join(' | '), 'Acts cleared | Headliners won over | Rivals defeated | Gold in your pocket', 'the score row labels');
});
await t.test('story: Enter completes then turns the page; Skip, Esc and a tap on the backdrop; no double turn', async () => {
  await UI.go('title', null, { force: true, transition: 'none' }); await settle(g);
  await openStory('ch1_intro', { name: 'howto' });
  g._key('Enter'); await settle(g);
  t.eq(UI.currentName, 'howto', 'Enter turned the page into `then` (the text was already complete headless)');
  await openStory('ch2_intro', { name: 'settings' });
  const epoch0 = UI.epoch;
  await click(g, btnByText(g, /^Skip/));
  t.eq(UI.currentName, 'settings', 'Skip goes straight on');
  await openStory('intro', { name: 'howto' });
  g._key('Escape'); await settle(g);
  t.eq(UI.currentName, 'howto', 'Esc skips');
  await openStory('ch3_intro', { name: 'settings' });
  await click(g, $(g, '.s-story .en-tap')); t.eq(UI.currentName, 'settings', 'a tap turns the page once the text is done');
  await openStory('intro', { name: 'howto' });
  const turn = $(g, '[data-act=turn]');
  g._click(turn); g._click(turn); await settle(g);
  t.eq(UI.currentName, 'howto', 'a double tap lands on `then` once');
  t.ok(UI.epoch >= epoch0, 'the epoch moved on');
});
await t.test('story: without `then` it goes back; a missing lore id is a blank page that still turns', async () => {
  await UI.go('howto', null, { force: true, transition: 'none' }); await settle(g);
  await openStory('defeat');
  await click(g, $(g, '[data-act=turn]'));
  t.eq(UI.currentName, 'howto', 'UI.back returns to where the story was opened from');
  await UI.go('title', null, { force: true, transition: 'none' }); await settle(g);
  const root = await openStory('no_such_page', { name: 'settings' });
  t.eq(txt($('.st-title', root)), 'A Diary Entry', 'a graceful title');
  t.ok(txt($('.st-text', root)).length > 10, 'and some text');
  t.ok(!META.loreSeen('no_such_page'), 'nothing is marked for an unknown page');
  await click(g, $(g, '[data-act=turn]')); t.eq(UI.currentName, 'settings', 'it still turns');
});
await t.test('story: the menu button only shows while a run is live; leaving cleans up', async () => {
  const R = RUN.newRun({ heroes: ['hanae', 'kuro'], seed: 3 }); if (!R.map) RUN.startChapter(R, 1);
  GAME.state.R = R; UI.setRun(R);
  const root = await openStory('ch1_intro', { name: 'howto' });
  t.ok($('.menu-btn', root), 'live run: the pause button is there');
  const L0 = g._listeners('keydown');
  await openStory('intro', { name: 'howto' });
  await click(g, btnByText(g, /Skip/));
  t.eq($$(g, '#screens > .screen').length, 1, 'one screen root at a time');
  t.eq(g._listeners('keydown'), L0, 'no leaked key listeners');
  UI.setRun(null); GAME.state.R = null;
  const r2 = await openStory('intro', { name: 'howto' });
  t.ok(!$('.menu-btn', r2), 'no run: no pause button');
  await click(g, btnByText(g, /Skip/));
});

// ================================================================================================ simulated runs
const WIN = simulate(901, ['hanae', 'kuro'], 'win');
const LOSE = simulate(902, ['suzu', 'raiga'], 'lose');
await t.test('the simulation produced a real win and a real defeat', () => {
  t.ok(WIN.R.done && WIN.R.victory, 'the win ended the run in victory'); t.eq(WIN.R.stats.bossKills, 3, 'three bosses fell');
  t.ok(LOSE.R.done && !LOSE.R.victory, 'the loss ended the run'); t.ok(WIN.R.stats.turns > 0 && WIN.R.stats.damageDealt > 0 && WIN.R.stats.cardsPlayed > 0, 'real combat stats were merged');
  t.eq(WIN.stops.length, 3, 'chapterEnd ran three times'); t.eq(WIN.stops[0].ce.next, 2, 'chapter 1 leads to 2'); t.eq(WIN.stops[2].ce.next, 'victory', 'chapter 3 leads to victory');
});

// ================================================================================================ chapterClear
// a run frozen right after the Act 1 boss, exactly what GAME.chapterFlow hands the screen
function chapterOne(seed) {
  // the helper bot is simple: on some seeds (and after every balance pass, different ones) it loses the boss. Try the next seed
  // until Act 1 is really cleared, so these screens are always shown a genuine win.
  for (let k = 0; ; k++) {
    const R = RUN.newRun({ heroes: ['hanae', 'kuro'], seed: seed + k, trial: 0 });
    if (!R.map) RUN.startChapter(R, 1);
    R.heroes[0].hp = 30; R.heroes[1].hp = 22;
    simFight(R, 'enemy', false); takeRewards(R);
    R.heroes[0].hp = 30; R.heroes[1].hp = 22;
    simFight(R, 'boss', false);
    if (R.done && k < 12) continue;
    R.heroes[0].hp = Math.min(R.heroes[0].hp, 30); R.heroes[1].hp = Math.min(R.heroes[1].hp, 22);
    const fin = takeRewards(R);
    const ce = RUN.chapterEnd(R);
    return { R, ce, fin };
  }
}
await t.test('chapterClear: the headline, the stats counting from the run, the heal and max HP plan, Charms, Continue', async () => {
  const { R, ce, fin } = chapterOne(31);
  t.ok(fin.chapterEnded, 'the boss ended chapter 1');
  GAME.state.R = R; UI.setRun(R);
  const e0 = errs(g);
  await UI.go('chapterClear', { chapter: 1, next: 2, healed: ce.healed, maxHp: ce.maxHp, R }, { force: true, transition: 'none' }); await settle(g);
  const root = $(g, '.s-chapterClear');
  t.ok(root, 'the screen is up');
  t.eq(txt($('.cc-title', root)), DATA.lore.ch1_clear.title, 'the lore title is the headline');
  t.eq(txt($('.cc-kicker', root)), 'END OF ACT ONE', 'the kicker');
  t.ok(txt($('.cc-boss', root)).indexOf(DATA.enemies.boss_kuzunoha.name) === 0, 'the boss is named');
  t.eq(txt($('.cc-lore', root)), DATA.lore.ch1_clear.text, 'the clear lore is in the scroll');
  t.ok(META.loreSeen('ch1_clear'), 'and marked');
  const tiles = Object.fromEntries($$(g, '.en-tile', root).map((el) => [txt($('.en-tile-lab', el)), num(txt($('.en-num', el)))]));
  t.eq(tiles.Turns, R.stats.turns, 'turns come from R.stats'); t.eq(tiles.Damage, R.stats.damageDealt, 'damage'); t.eq(tiles.Cards, R.stats.cardsPlayed, 'cards played');
  t.eq(tiles.Gold, R.gold, 'gold in the purse'); t.eq(tiles.Foes, R.stats.kills, 'foes'); t.eq(tiles.Hexes, R.stats.hexesPainted, 'hexes painted');
  const heroes = $$(g, '.cc-hero', root);
  t.eq(heroes.length, 2, 'a row per hero');
  heroes.forEach((row, i) => {
    t.eq(txt($('.hp-txt', row)), R.heroes[i].hp + '/' + R.heroes[i].maxHp, 'the bar ends on the real HP of ' + R.heroes[i].id);
    t.eq(txt($('.cc-chip.max', row)), '+' + ce.maxHp + ' max HP', 'the max HP chip');
    t.eq(txt($('.cc-chip.heal', row)), '+' + ce.healed[i].n + ' healed', 'the healing chip');
  });
  const plan = UI.screens.chapterClear._t.healPlan(R, { healed: ce.healed, maxHp: ce.maxHp });
  plan.forEach((p, i) => {
    t.eq(p.hpAfter, R.heroes[i].hp, 'plan ends on the run\'s HP'); t.eq(p.hpMid - p.hpBefore, p.gain, 'the max HP gain lifts HP by the same amount'); t.eq(p.hpAfter - p.hpMid, ce.healed[i].n, 'then the heal');
    t.eq(p.maxAfter - p.maxBefore, ce.maxHp, 'max HP before and after differ by the gain'); t.ok(p.hpBefore <= p.maxBefore && p.hpAfter <= p.maxAfter, 'HP stays within max');
  });
  t.ok($('.cc-extra .stat', root) && txt($('.cc-extra .stat', root)).indexOf(String(R.ink)) >= 0, 'Ink is shown');
  t.ok($('.cc-tip', root) && txt($('.cc-tip', root)).length > 12, 'a tip');
  t.eq(UI.screens.chapterClear._t.heroUnlockedBy(1), META.isUnlocked('hero', 'suzu') ? 'suzu' : null, 'Suzu is announced only when she is unlocked');
  await g._tick(500);
  t.eq(errs(g), e0, 'no console errors');
});
await t.test('chapterClear: a hero the Act unlocks gets her own announcement', async () => {
  const { R, ce } = chapterOne(33);
  GAME.state.R = R; UI.setRun(R);
  META.check(R, 1);
  t.ok(META.isUnlocked('hero', 'suzu'), 'chapter 1 cleared unlocks Suzu through META.check');
  await UI.go('chapterClear', { chapter: 1, next: 2, healed: ce.healed, maxHp: ce.maxHp, R }, { force: true, transition: 'none' }); await settle(g);
  const nh = $(g, '.cc-newhero');
  t.ok(nh && new RegExp(esc(DATA.heroes.suzu.name) + ' joins the tour!').test(txt(nh)), 'the announcement names her'); t.ok(nh.className.indexOf('show') >= 0, 'and is shown');
});
await t.test('chapterClear through GAME: nodeDone after the boss routes here, Continue goes on to the Act 2 story and the map', async () => {
  const R = RUN.newRun({ heroes: ['kuro', 'hanae'], seed: 41, trial: 0 }); if (!R.map) RUN.startChapter(R, 1);
  GAME.state.R = R; UI.setRun(R);
  simFight(R, 'boss', false);
  // the reward screen claims, then calls GAME.nodeDone: RUN.finishNode reports the Act end and GAME routes to chapterClear
  const rw = R.node && R.node.rewards;
  if (rw) RUN.claim(R, rw, { card: null, relic: null, gem: null, takeBrush: false });
  await GAME.nodeDone(); await settle(g);
  t.eq(UI.currentName, 'chapterClear', 'the boss reward leads to chapterClear');
  t.eq(R.chapter, 2, 'RUN.chapterEnd already started chapter 2');
  const hp = $$(g, '.cc-hero .hp-txt').map(txt);
  t.eq(hp.join('|'), R.heroes.map((h) => h.hp + '/' + h.maxHp).join('|'), 'the HP rows match the run');
  await click(g, $(g, '.cc-go'));
  t.eq(UI.currentName, 'story', 'Continue opens the next chapter\'s story page');
  t.ok(txt($(g, '.st-title')).indexOf(DATA.lore.ch2_intro.title) >= 0, 'chapter 2\'s page');
  await click(g, $(g, '[data-act=turn]'));
  t.eq(UI.currentName, 'map', 'then the map');
});
await t.test('chapterClear: Enter continues, a tap on the backdrop never does, no run is survivable', async () => {
  const { R, ce } = chapterOne(35);
  GAME.state.R = R; UI.setRun(R);
  let called = 0; const real = GAME.nodeDone; GAME.nodeDone = () => { called++; return Promise.resolve(); };
  await UI.go('chapterClear', { chapter: 1, next: 2, healed: ce.healed, maxHp: ce.maxHp, R }, { force: true, transition: 'none' }); await settle(g);
  await click(g, $(g, '.s-chapterClear .en-tap')); t.eq(called, 0, 'the backdrop only finishes animations');
  g._key('Enter'); await settle(g); g._key('Enter'); await settle(g);
  t.eq(called, 1, 'Enter continues, once');
  GAME.nodeDone = real;
  UI.setRun(null); GAME.state.R = null;
  await UI.go('chapterClear', { chapter: 2 }, { force: true, transition: 'none' }); await settle(g);
  t.ok($('.s-chapterClear .cc-title') && /The City Looks Up/.test(txt($('.s-chapterClear .cc-title'))), 'with no run it still shows the page');
  t.eq($$(g, '.cc-hero').length, 2, 'and the default heroes');
  t.eq(errs(g), 0, 'no errors without a run');
});

// ================================================================================================ gameOver
function expectRows(root, summary, R) {
  const rows = $$(g, '.en-row', root);
  const sum = rows.reduce((a, r) => a + (txt($('.en-row-pts', r)).startsWith('-') ? -1 : 1) * num(txt($('.en-row-pts', r)).replace(/^[+-]/, '')), 0);
  return { rows, sum };
}
await t.test('gameOver through GAME.defeat: the breakdown adds up to the real score, Cheers, recap and heroes', async () => {
  const R = LOSE.R;
  GAME.state.R = R; UI.setRun(R);
  const e0 = errs(g);
  await GAME.defeat(); await settle(g);
  const root = $(g, '.s-gameOver');
  t.eq(UI.currentName, 'gameOver', 'routed');
  const sm = RUN.summary(R);
  const rec = META.profile.history[0];
  t.eq(txt($('.go-title', root)), DATA.lore.defeat.title, 'the defeat page title'); t.ok(META.loreSeen('defeat'), 'defeat lore marked');
  t.eq(txt($('.go-lore-text', root)), DATA.lore.defeat.text, 'the defeat text');
  t.ok(/Curtain fell in Act I/.test(txt($('.go-fell', root))), 'which page the tale ended on');
  t.eq(txt($('.go-kicker', root)), 'THE LIGHTS GO DOWN', 'the defeat kicker'); t.ok(/Cheers earned/.test(txt($('.go-stones', root))), 'the currency line says Cheers');
  const { rows, sum } = expectRows(root, sm, R);
  t.ok(rows.length >= 8, 'a row per score term'); t.eq(sum, sm.score, 'the rows add up to RUN.score exactly');
  t.eq(num(txt($('.en-total-n', root))), sm.score, 'the total shows the score');
  const stones = txt($('.go-stone-n', root));
  t.eq(stones, '+' + rec.inkstones, 'Inkstones earned = what META.recordRun paid (history row)');
  t.eq($$(g, '.go-fallen .badge', root).length, 2, 'the fallen heroes');
  t.eq(txt($('.go-fallen .hp-txt', root)), '0/' + R.heroes[0].maxHp, 'at 0 HP');
  t.ok($$(g, '.go-fan .card', root).length >= 1 && $$(g, '.go-fan .card', root).length <= 6, 'a fan of the best cards');
  t.ok(txt($('.go-deckbtn', root)).indexOf(R.deck.length + ' cards') === 0, 'the deck count');
  t.ok($('.go-tip', root), 'a tip');
  await click(g, $('.go-deckbtn', root));
  t.ok(UI.overlay.has('deck'), 'tapping the deck opens the deck viewer'); UI.overlay.close(); await settle(g);
  t.eq(errs(g), e0, 'no console errors');
  t.ok(g._issues.length === 0, 'the canvas saw no invalid calls: ' + JSON.stringify(g._issues.slice(0, 2)));
});
await t.test('gameOver: Try Again starts a new run with the same heroes and trial; Title goes home', async () => {
  const R = LOSE.R;
  const before = GAME.state.R;
  t.ok(before === R, 'the finished run is still current');
  await click(g, $(g, '.go-again'));
  await settle(g);
  const N = GAME.state.R;
  t.ok(N && N !== R && !N.done, 'a fresh run began');
  t.deep(N.heroes.map((h) => h.id), R.heroes.map((h) => h.id), 'the same heroes, in the same order'); t.eq(N.trial, R.trial, 'the same trial');
  t.ok(['story', 'map'].indexOf(UI.currentName) >= 0, 'routed into the story chain: ' + UI.currentName);
  await UI.go('gameOver', { summary: RUN.summary(R), R }, { force: true, transition: 'none' }); await settle(g);
  await click(g, $(g, '.go-title-btn'));
  t.eq(UI.currentName, 'title', 'Title');
});
// ---------------------------------------------------------------------------------------------------- follow the duo, Share and Support (P9, HV_STORY 5.4)
// ui.js owns the panel, the sheet and Share (its own suite pins them); these checks pin where the end screens place them.
const HANDLE = 'Made for RoxorLoops and Jasmin. Find them as @roxorloopsandjasmin.';
const SHARE_TEXT = 'I just played HOCUS VOCUS: A Vocal Magic Adventure, with RoxorLoops and Jasmin. Still human.';
const BLANK_LINKS = { handle: '@roxorloopsandjasmin', website: '', youtube: '', facebook: '', tiktok: '', instagram: '', support: '', game: '' };
const setLinks = (o) => g._run(`DATA.LINKS = Object.freeze(${JSON.stringify(Object.assign({}, BLANK_LINKS, o))});`);
const closeSheet = async () => { await click(g, btnByText(g, /^Close$/, $(g, '.o-modal'))); };
await t.test('gameOver: a slim ghost row under Try Again and Title offers Share and Follow the duo, and never Support (HV_STORY 5.4, principle 3)', async () => {
  const R = LOSE.R;
  const e0 = errs(g);
  await UI.go('gameOver', { summary: RUN.summary(R), R }, { force: true, transition: 'none' }); await settle(g);
  const root = $(g, '.s-gameOver');
  const mid = $('.go-mid', root);
  const kids = Array.from(mid.children).map((c) => c.className.split(' ')[0]);
  t.ok(kids.indexOf('go-follow') === kids.indexOf('go-btns') + 1, 'the row follows the Try Again and Title buttons: ' + kids.join(','));
  const row = $('.go-follow', root);
  t.deep($$(g, 'button', row).map((b) => txt(b)), ['Share', 'Follow the duo'], 'Share and Follow the duo');
  t.ok($$(g, 'button', row).every((b) => b.classList.contains('btn-ghost') && b.classList.contains('btn-sm')), 'slim ghost buttons, quieter than Try Again');
  t.eq($('.go-share', root).getAttribute('aria-label'), 'Share Hocus Vocus', 'Share names the game for screen readers');
  t.deep($$(g, '.go-btns .btn .btn-label', root).map((b) => txt(b)), ['Try Again', 'Title'], 'Try Again and Title stay as they were');
  t.ok(!/Support the duo/.test(txt(root)), 'no Support the duo on a lost tour'); t.eq($$(g, 'a', root).length, 0, 'and no link at all');
  await click(g, $('.go-share', root));
  t.eq(g._clipboard, SHARE_TEXT + ' ' + UI.shareUrl(), 'Share copies the share text and the page address (no share sheet in the sandbox)');
  await click(g, $('.go-follow-btn', root));
  t.ok(UI.overlay.has('modal') && $(g, '.o-modal .hv-follow.hv-sheet'), 'Follow the duo opens the sheet');
  t.eq($$(g, '.o-modal a.hv-support').length, 0, 'and with no URL set the sheet has no Support either');
  await closeSheet();
  t.ok(!UI.overlay.has('modal'), 'Close closes it'); t.eq(UI.currentName, 'gameOver', 'the page is still the game over page');
  // the owners set a Support URL: it shows on the sheet's own terms elsewhere, but never on this page
  setLinks({ support: 'https://example.invalid/support', website: 'https://example.invalid/' });
  try {
    await UI.go('gameOver', { summary: RUN.summary(R), R }, { force: true, transition: 'none' }); await settle(g);
    const r2 = $(g, '.s-gameOver');
    t.ok(!/Support the duo/.test(txt(r2)), 'with a Support URL set the game over page still shows no Support the duo');
    t.eq($$(g, 'a', r2).length, 0, 'and still no anchor');
    t.deep($$(g, '.go-follow button', r2).map((b) => txt(b)), ['Share', 'Follow the duo'], 'only Share and Follow the duo');
    await click(g, $('.go-follow-btn', r2));
    t.eq($$(g, '.o-modal a.hv-support').length, 1, 'the sheet itself is the owners panel and may offer Support (it is the player who asked)');
    await closeSheet();
  } finally { setLinks({}); }
  t.eq(errs(g), e0, 'no console errors');
});
// P3 3C (bible 7.1, HV_ART_AUDIO 2.11): a Sticker that unlocks an outfit adds a "New outfit: <name>" card in the unlock style, its art the hero
// portrait in the outfit, smiling. Andy's Sticker unlocks no outfit, so it adds no card.
await t.test('end screens: the New outfit card follows the Sticker that unlocks it, drawn with the portrait in the outfit', async () => {
  const P = UI.screens.gameOver._t;
  const ents = P.unlockEntries({ newAchievements: ['ch1_clear', 'petal_and_steel', 'thunder_and_laughter', 'moonlit_vigil'] }, {});
  t.eq(ents.map((e) => e.kind).join(','), 'ach,ach,outfit,ach,ach,outfit', 'each outfit card sits right under its Sticker; Andy\'s Sticker has none');
  const outfits = ents.filter((e) => e.kind === 'outfit');
  t.deep(outfits.map((e) => e.title), ['New outfit: ' + DATA.outfits.hanae.name, 'New outfit: ' + DATA.outfits.suzu.name], 'titled New outfit: Unicorn Onesie and Goat Suit (bible 7.1)');
  t.deep(outfits.map((e) => e.id), ['hanae', 'suzu'], 'for Jasmin and RawClaw'); t.ok(outfits.every((e) => e.seal === 'NEW' && /hero select\.$/.test(e.text)), 'a NEW seal and a line that says where to pick it');
  t.ok(outfits.every((e) => /^[\x20-\x7e]+$/.test(e.text + e.title) && !DASH.test(e.text + e.title)), 'printable ASCII, no dashes');
  g._run(`globalThis.__portraits = []; (function () { const p = ART.hero.portrait; ART.hero.portrait = function (ctx, id, o) { __portraits.push(id + ':' + (o && o.skin) + ':' + (o && o.expr)); return p.apply(this, arguments); }; })();`);
  const sm = RUN.summary(LOSE.R);
  await UI.go('gameOver', { summary: sm, record: { inkstones: 15, newAchievements: ['ink_and_insight'], heroesUnlocked: [] }, R: LOSE.R }, { force: true, transition: 'none' }); await settle(g);
  const card = $('.s-gameOver .en-unlock.k-outfit');
  t.ok(card, 'the game over list shows the outfit card');
  t.eq(txt(card.querySelector('.en-unlock-t')), 'New outfit: ' + DATA.outfits.kuro.name, 'New outfit: Monster Onesie');
  t.ok(card.querySelector('.en-unlock-art canvas'), 'with a portrait canvas');
  t.ok(g._run('__portraits.slice()').indexOf('kuro:skin:smile') >= 0, 'drawn by ART.hero.portrait in the outfit (skin), smiling');
  t.ok(/\.en-unlock\.k-outfit\s*\{/.test(CSS) && /\.en-unlock-art\s*\{/.test(CSS), 'css: the outfit card and its art have their look in end.css');
  await UI.go('victory', { summary: Object.assign({}, sm, { victory: true }), record: { inkstones: 15, newAchievements: ['petal_and_steel'], heroesUnlocked: [] }, R: LOSE.R }, { force: true, transition: 'none' }); await settle(g);
  await click(g, btnByText(g, /^Skip/)); await settle(g);
  t.ok(/New outfit: Unicorn Onesie/.test(txt($('.s-victory .vc-newcard'))), 'the victory showcase lists it too');
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('gameOver: unlock entries from a record, the achievements, a hero, a trial, and no record', async () => {
  const P = UI.screens.gameOver._t;
  const rec = { inkstones: 33, bonus: 10, total: 120, newAchievements: ['ch1_clear', 'nonexistent_achievement'], newTrial: 2, heroesUnlocked: ['suzu'] };
  const ents = P.unlockEntries(rec, {});
  t.eq(ents.map((e) => e.kind).join(','), 'hero,ach,trial', 'hero, then known achievements, then the trial (unknown ids are skipped)');
  t.eq(ents[1].reward, DATA.achievements.ch1_clear.reward.inkstones, 'the achievement reward');
  const sm = RUN.summary(LOSE.R);
  await UI.go('gameOver', { summary: sm, record: rec, R: LOSE.R }, { force: true, transition: 'none' }); await settle(g);
  const list = $$(g, '.en-unlock');
  t.eq(list.length, 3, 'three rows'); t.ok(new RegExp(esc(DATA.heroes.suzu.name) + ' joins the tour!').test(txt(list[0])), 'Suzu'); t.ok(/Encore 2 unlocked/.test(txt(list[2])), 'the trial');
  t.eq(txt($('.go-stone-n')), '+33', 'the Inkstone count'); t.ok(/Sticker bonus \+10/.test(txt($('.go-stone-sub'))), 'bonus and library total shown');
  await UI.go('gameOver', { summary: sm, R: LOSE.R }, { force: true, transition: 'none' }); await settle(g);
  t.ok(/not recorded/.test(txt($('.s-gameOver .go-stonescard'))), 'no record: an honest empty state');
  UI.setRun(null); GAME.state.R = null;
  await UI.go('gameOver', { summary: Object.assign({}, sm, { stats: { bossKills: 1, elites: 2, turns: 9 }, score: 999 }), record: { inkstones: 0, newAchievements: [], heroesUnlocked: [] } }, { force: true, transition: 'none' }); await settle(g);
  t.ok(/Nothing new/.test(txt($('.en-unlocks'))), 'an empty unlock list says so');
  t.ok($$(g, '.en-row').some((r) => /Deck work/.test(txt(r))), 'with no deck the unknown terms ride on one Deck work row');
  t.eq(expectRows($('.s-gameOver'), null, null).sum, 999, 'and the rows still add up');
});
await t.test('gameOver: no run, no summary at all still renders and keys work', async () => {
  UI.setRun(null); GAME.state.R = null;
  await UI.go('gameOver', null, { force: true, transition: 'none' }); await settle(g);
  t.ok($('.s-gameOver .go-title'), 'a page'); t.eq($$(g, '.go-fallen .badge').length, 2, 'the default heroes');
  g._key('Escape'); await settle(g); t.eq(UI.currentName, 'title', 'Esc goes to the title');
  t.eq(errs(g), 0, 'no errors');
});

// ================================================================================================ victory
await t.test('victory through GAME.victory: the three beats, the share card, the summary, Cheers and Continue', async () => {
  const R = WIN.R;
  GAME.state.R = R; UI.setRun(R);
  const e0 = errs(g);
  await GAME.victory(); await settle(g);
  const root = $(g, '.s-victory');
  t.eq(UI.currentName, 'victory', 'routed'); t.ok(META.loreSeen('victory'), 'victory lore marked');
  t.eq(txt($('.st-title', root)), DATA.lore.victory.title, 'beat one: the victory page');
  t.eq(txt($('.st-kicker', root)), 'FINALE', 'the victory kicker'); t.eq(txt($('.st-seal', root)), 'BRAVO', 'and its seal'); t.ok(/Tap to continue/.test(txt($('.st-hint', root))), 'with the Hocus Vocus tap prompt');
  t.eq(txt($('.st-typed', root)), DATA.lore.victory.text.slice(1).replace(/\s+/g, ' ').trim(), 'typed in full');
  t.ok($$(g, 'button, a', root).every((b) => !/Share|Follow the duo|Support the duo/.test(txt(b))), 'the typed epilogue has no follow, share or support button');
  g._key('Enter'); await settle(g);
  t.ok($('.vc-caps', root), 'beat two: the curtain call'); t.eq(txt($('.vc-cast-title', root)), 'Everyone Who Sang Along', 'the cast heading');
  t.eq($$(g, '.vc-cap', root).length, 4, 'four heroes, a line each');
  t.eq($$(g, '.vc-cap.party', root).map((c) => txt($('.vc-cap-name', c)).replace(/ \*$/, '')).join(','), DATA.heroes.hanae.name + ',' + DATA.heroes.kuro.name, 'the party is marked');
  t.ok($$(g, '.vc-cap-line', root).every((l) => txt(l).length > 40), 'every line is written');
  t.deep(UI.screens.victory._t.curtainOrder(['kuro', 'hanae']), ['kuro', 'hanae', 'suzu', 'raiga'], 'the party first, in party order');
  t.eq(txt($('.vc-credit', root)), HANDLE, 'the cast phase ends with the one plain credit line (HV_STORY 3.5)');
  t.ok($$(g, 'button, a', root).every((b) => !/Share|Follow the duo|Support the duo/.test(txt(b))) && $$(g, 'a', root).length === 0, 'and no follow, share or support button: the curtain call is for the heroes');
  g._key('Enter'); await settle(g);
  t.ok($('.vc-card', root), 'beat three: the share card canvas'); t.eq(txt($('.vc-kicker', root)), 'FINALE', 'the showcase kicker'); t.eq(txt($('.vc-title', root)), 'Human', 'and heading');
  const sm = RUN.summary(R);
  const rec = META.profile.history[0];
  const { rows, sum } = expectRows(root, sm, R);
  t.eq(sum, sm.score, 'the rows add up to RUN.score'); t.eq(num(txt($('.en-total-n', root))), sm.score, 'the total');
  t.eq(txt($('.go-stone-n', root)), '+' + rec.inkstones, 'Inkstones earned');
  const tiles = Object.fromEntries($$(g, '.en-tile', root).map((el) => [txt($('.en-tile-lab', el)), num(txt($('.en-num', el)))]));
  t.eq(tiles.Turns, R.stats.turns, 'turns'); t.eq(tiles.Damage, R.stats.damageDealt, 'damage'); t.eq(tiles['Cards played'], R.stats.cardsPlayed, 'cards'); t.eq(tiles.Foes, R.stats.kills, 'foes');
  t.ok($('.en-petals', root) && $$(g, '.en-petal', root).length >= 10, 'confetti of petals');
  // P9: Share joins Copy summary and Save card, and a slim follow row sits under the Newly Unlocked card
  t.deep($$(g, '.vc-cardbtns .btn', root).map((b) => txt(b)), ['Copy summary', 'Save card', 'Share'], 'Share joins Copy summary and Save card under the share card');
  t.eq($('.vc-share', root).getAttribute('aria-label'), 'Share Hocus Vocus', 'Share names the game for screen readers');
  t.deep(Array.from($('.vc-left', root).children).map((c) => c.className.split(' ')[0]), ['vc-cardwrap', 'panel', 'vc-follow'], 'the follow row is the last thing in the left column, under the Newly Unlocked card');
  t.ok($('.vc-left', root).children[1].classList.contains('vc-newcard'), 'which is the Newly Unlocked card');
  const frow = $('.vc-follow', root);
  t.eq(txt($('.vc-follow-line', frow)), HANDLE, 'the row starts with the handle line');
  t.deep($$(g, '.vc-follow-btns > *', frow).map((b) => txt(b)), ['Follow the duo'], 'Follow the duo, and no Support the duo while the owners URL is empty');
  t.eq($$(g, 'a', root).length, 0, 'no anchor on the page without a URL');
  await click(g, $('.vc-share', root));
  t.eq(g._clipboard, SHARE_TEXT + ' ' + UI.shareUrl(), 'Share copies the share text and the page address');
  await click(g, $('.vc-follow-btn', root));
  t.ok(UI.overlay.has('modal') && $(g, '.o-modal .hv-follow.hv-sheet'), 'Follow the duo opens the sheet');
  await closeSheet();
  t.eq(UI.currentName, 'victory', 'closing it leaves the showcase as it was');
  await click(g, $('.vc-copy', root));
  const text = UI.screens.victory._t.summaryText(sm, R, true);
  t.eq(g._clipboard, text, 'Copy summary puts the share text on the clipboard');
  t.ok(new RegExp(esc(DATA.heroes.hanae.name) + ' and ' + esc(DATA.heroes.kuro.name) + ' \\| Score [\\d,]+ \\| Encore 0').test(text) && text.indexOf('Seed ' + (R.seed >>> 0)) > 0 && text.indexOf(R.deck.length + ' cards') > 0, 'the text names heroes, score, trial, seed and deck size');
  t.ok(!DASH.test(text), 'and has no dashes');
  await click(g, $('.vc-save', root));
  t.ok($$(g, '#toasts .toast').some((x) => /Card saved|Could not save/.test(txt(x))), 'Save card answers either way');
  await g._tick(600);
  t.eq(errs(g), e0, 'no console errors'); t.ok(g._issues.length === 0, 'no invalid canvas calls: ' + JSON.stringify(g._issues.slice(0, 2)));
  await click(g, $('.vc-go', root));
  t.eq(UI.currentName, 'title', 'Continue goes to the title');
});
await t.test('victory: Skip jumps to the showcase; Esc too; the share card draws with a no-op context; empty states', async () => {
  const R = WIN.R;
  await UI.go('victory', { summary: RUN.summary(R), R }, { force: true, transition: 'none' }); await settle(g);
  await click(g, btnByText(g, /^Skip/));
  t.ok($('.s-victory .vc-card'), 'Skip: the showcase');
  t.ok(/not recorded/.test(txt($('.s-victory .vc-newcard'))), 'no record: an honest empty state');
  await UI.go('victory', null, { force: true, transition: 'none' }); await settle(g);
  g._key('Escape'); await settle(g);
  t.ok($('.s-victory .vc-card'), 'Esc: the showcase, with no run and no summary');
  const ctx = $('.s-victory .vc-card').getContext('2d');
  UI.screens.victory._t.drawCard(ctx, 600, 338, { heroes: ['suzu', 'raiga'], score: 12345, trial: 4, seed: 7, deckSize: 31, relics: ['a', 'b'], win: true }, 0);
  UI.screens.victory._t.drawCard(ctx, 600, 338, { heroes: ['suzu'], score: 0, win: false }, 0);
  t.ok(g._issues.length === 0, 'drawCard is clean on the strict context');
  g._key('Enter'); await settle(g); t.eq(UI.currentName, 'title', 'Enter on the showcase continues to the title');
});

await t.test('victory: Support the duo joins the follow row only once DATA.LINKS.support is a web address, as a new-tab anchor, and never in the story or cast beats', async () => {
  const R = WIN.R;
  setLinks({ support: 'https://example.invalid/support' });
  try {
    await UI.go('victory', { summary: RUN.summary(R), R }, { force: true, transition: 'none' }); await settle(g);
    const root = $(g, '.s-victory');
    t.eq($$(g, 'a', root).length, 0, 'the typed epilogue has no anchor');
    g._key('Enter'); await settle(g);
    t.ok($('.vc-caps', root), 'the curtain call');
    t.eq($$(g, 'a', root).length, 0, 'and none on the curtain call either: only the showcase asks');
    g._key('Enter'); await settle(g);
    t.ok($('.vc-card', root), 'the showcase');
    t.deep($$(g, '.vc-follow-btns > *', root).map((b) => txt(b)), ['Follow the duo', 'Support the duo'], 'Follow the duo, then Support the duo');
    const a = $('.vc-follow a.vc-support', root);
    t.ok(a && a.localName === 'a', 'Support the duo is an anchor');
    t.eq(a.getAttribute('href'), 'https://example.invalid/support', 'to the owners URL'); t.eq(a.getAttribute('target'), '_blank', 'in a new tab');
    t.ok(/\bnoopener\b/.test(a.getAttribute('rel')) && /\bnoreferrer\b/.test(a.getAttribute('rel')), 'rel noopener noreferrer');
    t.eq(a.getAttribute('aria-label'), 'Support the duo, opens in a new tab', 'named for screen readers');
    const nav0 = g._navigations.length;
    await click(g, a);
    t.eq(g._navigations.length, nav0, 'a tap leaves the navigation to the browser');
    t.eq(UI.currentName, 'victory', 'the showcase stays put');
  } finally { setLinks({}); }
  setLinks({ support: 'javascript:alert(1)' });
  try {
    await UI.go('victory', { summary: RUN.summary(R), R }, { force: true, transition: 'none' }); await settle(g);
    await click(g, btnByText(g, /^Skip/));
    t.eq($$(g, '.vc-follow a').length, 0, 'a value that is not a web address is no link');
  } finally { setLinks({}); }
  g._key('Enter'); await settle(g);
});

// ================================================================================================ alignment (the overlay lines up with the art and with itself)
// Headless has no layout, so these read end.css as text and check the placing rules against the numbers the screens use. They guard the sources of truth: a
// variable the page and its seal share, one height the Continue button and the panels above it are both sized from, one column width for both showcase columns.
const cssBlock = (sel) => { const m = new RegExp('(?:^|\\n|\\})\\s*' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{([^}]*)\\}').exec(CSS.replace(/\/\*[\s\S]*?\*\//g, '')); return m ? m[1] : ''; };
const cssNum = (block, prop) => { const m = new RegExp('(?:^|[;\\s])' + prop + ':\\s*(-?[\\d.]+)px').exec(block); return m ? +m[1] : NaN; };
await t.test('finding 33: the Act clear panels end 12 px above Continue at any hit size, and keep their 244 px', () => {
  const root = cssBlock('.s-chapterClear'), cols = cssBlock('.cc-cols'), foot = cssBlock('.cc-foot');
  t.ok(/--foot-h:\s*max\(56px,\s*var\(--hit\),\s*calc\(50\.2px\s*\*\s*var\(--ts\)\s*\+\s*4px\)\)/.test(root), 'the Continue row is max(56px, --hit, its own size at the text scale) tall (a phone makes it 81 to 91 px, Larger text 69.2 px)');
  t.ok(/bottom:\s*calc\(var\(--foot-b\)\s*\+\s*var\(--foot-h\)\s*\+\s*12px\)/.test(cols), 'the panels end --foot-b + --foot-h + 12 px above the stage floor');
  t.ok(/bottom:\s*var\(--foot-b\)/.test(foot), 'and the Continue row sits --foot-b above it: one variable for both');
  const fb = cssNum(root, '--foot-b'), top = cssNum(root, '--cc-top');
  t.ok(/--cc-lift:\s*calc\(var\(--foot-h\)\s*-\s*56px\)/.test(root) && /top:\s*calc\(var\(--cc-top\)\s*-\s*var\(--cc-lift\)\)/.test(cols), 'the extra height of a phone button is taken from the panels\' top, not from their content');
  [44, 56, 81.2, 91].forEach((hit) => {
    const F = Math.max(56, hit), panelsBottom = 720 - (fb + F + 12), buttonTop = 720 - fb - F, panelsTop = top - (F - 56);
    t.ok(buttonTop - panelsBottom >= 12 - 1e-9, 'hit ' + hit + ': the Continue button starts ' + (buttonTop - panelsBottom) + ' px below the panels (it overlapped them by 14 to 21 px)');
    t.eq(Math.round((panelsBottom - panelsTop) * 100) / 100, 244, 'hit ' + hit + ': the panels keep their 244 px');
  });
  // the button's own height: a .btn-lg is 21 px x --ts at line-height 1.15, padding .62em top and bottom and 2 px borders (50.2 x --ts + 4: 54.2 at 1, 61.7 at 1.15, 69.2 at 1.3);
  // the panels were sized for 56, so at Larger text the button rose 13 px into them (browser: 2.4 px of overlap at 1.3 with the button's breathing scale)
  const BASE_CSS = fs.readFileSync(path.join(DIR, 'css', 'base.css'), 'utf8').replace(/\n/g, ' ');
  t.ok(/\.btn-lg \{[^}]*padding:\s*\.62em[^}]*font-size:\s*calc\(21px/.test(BASE_CSS) && /font:\s*800 calc\(17px \* var\(--ts\)\) \/ 1\.15/.test(BASE_CSS), 'the 50.2 x --ts + 4 model matches base.css (.btn-lg: .62em padding, 21 px font, line-height 1.15)');
  const rowM = /--foot-h:\s*max\(56px,\s*var\(--hit\),\s*calc\(([\d.]+)px\s*\*\s*var\(--ts\)\s*\+\s*([\d.]+)px\)\)/.exec(root), rowK = rowM ? +rowM[1] : 0, rowC = rowM ? +rowM[2] : 0;      // the sheet's own numbers
  [1, 1.15, 1.3].forEach((ts) => [44, 81.2, 91].forEach((hit) => {
    const own = 50.2 * ts + 4, F = Math.max(56, hit, rowK * ts + rowC), panelsBottom = 720 - (fb + F + 12), panelsTop = (ts > 1.1 ? 338 : top) - (F - 56);
    t.ok(720 - fb - F - panelsBottom >= 12 - 1e-6, 'text ' + ts + ', hit ' + hit + ': the Continue row (' + F.toFixed(1) + ' px, its button ' + own.toFixed(1) + ') starts ' + (720 - fb - F - panelsBottom).toFixed(1) + ' px below the panels (the 56 px row let a 69.2 px button overlap them by 1.2 px at 1.3)');
    t.ok(F >= own - 0.1, 'text ' + ts + ', hit ' + hit + ': the row is never shorter than the button (' + F.toFixed(1) + ' against ' + own.toFixed(1) + ')');
    t.eq(Math.round((panelsBottom - panelsTop) * 100) / 100, ts > 1.1 ? 302 : 244, 'text ' + ts + ', hit ' + hit + ': the panels keep their ' + (ts > 1.1 ? 302 : 244) + ' px (the lift takes the extra from the top)');
  }));
  const big = cssBlock('.s-chapterClear.ts-big'), topBig = cssNum(big, '--cc-top');
  t.ok(topBig === 338 && !/--cc-lift/.test(big), 'Larger text has its own taller panels (top 338) and keeps the same lift rule');
  [44, 81.2, 91].forEach((hit) => {
    const F = Math.max(56, hit), h = (720 - (fb + F + 12)) - (topBig - (F - 56));
    t.eq(Math.round(h * 100) / 100, 302, 'hit ' + hit + ': at Larger text the panels keep their 302 px (six tiles and the heal chips need it: at 270 px the last tile was cut off on a phone)');
  });
});
await t.test('finding 34: the stat tile labels fit their tiles', () => {
  const tile = cssBlock('.cc-stats .en-tile'), lab = cssBlock('.cc-stats .en-tile-lab');
  t.ok(/letter-spacing:\s*\.06em/.test(lab), 'the label letter-spacing is .06em (DAMAGE ran 3 px past its tile at .1em)');
  t.ok(cssNum(tile, 'column-gap') <= 7 && /padding:\s*6px 8px/.test(tile), 'with a 7 px icon gap and 8 px side padding');
});
await t.test('finding 32: the game over recap is a two column grid, so the two buttons share both edges and the fan gives way', async () => {
  const body = cssBlock('.go-recap > .p-body'), btn = cssBlock('.go-deckbtn, .go-relbtn'), fan = cssBlock('.go-fan');
  t.ok(/display:\s*grid/.test(body) && /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto/.test(body), 'the body is a grid: what was kept, then the narrow button column');
  t.ok(/display:\s*contents/.test(cssBlock('.go-recap-row')), 'the two rows share its columns, so the column is as wide as the wider button');
  t.ok(/justify-self:\s*stretch/.test(btn), 'and both buttons stretch to it (the same left and right edge)');
  t.ok(/min-width:\s*0/.test(fan), 'the fan may shrink instead of pushing a button out of the panel');
  t.ok(/grid-column:\s*1\s*\/\s*-1/.test(cssBlock('.go-recap > .p-body > .en-h')), 'the title spans both columns');
  // the fan: 6 mini cards (72 px wide) overlapping by --ov, in the room the column leaves it (panel body 386 less 32 padding, a 10 px gap and the button column)
  const ov = cssNum(fan, '--ov'), room = (button) => 386 - 32 - 10 - button, width = (o) => 72 + 5 * (72 - o) + 10, swing = 12;
  t.ok(width(ov) + swing <= room(117.6), 'at the normal size the fan (' + width(ov) + ' + ' + swing + ' px of turned cards) fits beside a 117.6 px button');
  const ovBig = cssNum(cssBlock('.ts-big .go-fan'), '--ov'), btnBig = 128.5;
  t.ok(width(ovBig) + swing <= room(btnBig), 'at Larger text (a 14 px x 1.12 label, ' + btnBig + ' px) it still fits with an overlap of ' + ovBig);
  t.ok(/font-size:\s*calc\(14px \* min\(var\(--ts\), 1\.12\)\)/.test(btn), 'because the two buttons stop growing past text size 1.12');
  const g1 = fresh({ seed: 9 }); await settle(g1);
  await g1.UI.go('gameOver', null, { force: true, transition: 'none' }); await settle(g1);
  const row = $(g1, '.go-recap .p-body') || $(g1, '.go-recap');
  t.ok(!!$(g1, '.go-deckbtn', row) && !!$(g1, '.go-relbtn', row), 'both recap buttons are in the one panel');
  t.eq(errs(g1), 0, 'no console errors');
});
await t.test('findings 31 and 56: the hanko seal is anchored by its centre on the page corner and stays on the stage', async () => {
  const seal = cssBlock('.st-seal');
  t.ok(/left:\s*calc\(var\(--pg-x\)\s*-\s*20px\)/.test(seal) && /translate:\s*-50%\s*0/.test(seal), 'the seal\'s centre (not its left edge) is 20 px left of the page edge, whatever its word');
  t.ok(cssNum(seal, 'top') >= 27, 'its top is 36 px: the tallest stamps (ONCE, BLANK, at 12 degrees and 1.7x) need 27 px or more to stay on the stage');
  t.eq(cssNum(cssBlock('.s-story'), '--pg-x'), 540, 'the story page starts at x 540'); t.ok(/left:\s*var\(--pg-x\)/.test(cssBlock('.st-page')), 'and the page reads the same variable');
  t.eq(cssNum(cssBlock('.s-victory'), '--pg-x'), 250, 'the epilogue page starts at x 250'); t.ok(!/left:/.test(cssBlock('.vc-page')), 'its rule has no left of its own');
  t.ok(!cssBlock('.vc-seal'), 'and the END seal has no rule of its own that could put it off the stage again (it was top 0, clipped by 23 px)');
  for (const id of ['intro', 'ch1_intro', 'victory']) {
    const root = await openStory(id);
    t.ok(!!$('.st-seal', root), id + ': has a seal');
  }
});
await t.test('finding 35: the showcase columns are equal, the page head is centred, and Skip and Continue match on the curtain call', async () => {
  const vc = cssBlock('.s-victory'), W = cssNum(vc, '--vc-col'), l = cssBlock('.vc-left'), r = cssBlock('.vc-right');
  t.ok(/width:\s*var\(--vc-col\)/.test(l) && /width:\s*var\(--vc-col\)/.test(r), 'both columns use --vc-col');
  const ml = cssNum(l, 'left'), mr = cssNum(r, 'right');
  const leftEnd = ml + W, rightStart = 1280 - mr - W;
  t.eq((leftEnd + rightStart) / 2, 640, 'the gap between the columns is centred on the stage axis (it was 16 px right of it)'); t.eq(ml, mr, 'with equal side margins');
  const pad = /\.st-page > \.p-body \{[^}]*padding:\s*(\d+)px (\d+)px (\d+)px (\d+)px/.exec(CSS), head = /\.st-head \{[^}]*margin:\s*0 (-?\d+)px 0 (-?\d+)px/.exec(CSS);
  t.ok(!!pad && !!head, 'the page padding and the head margin are both there');
  if (pad && head) { t.eq(+head[2], -(+pad[4] - +pad[2]) / 2, 'the head shifts by half the difference of the page padding (50 left, 42 right)'); t.eq(+head[1], -(+head[2]), 'and keeps its width'); }
  t.ok(/height:\s*max\(56px,\s*var\(--hit\)\)/.test(cssBlock('.vc-cast-go, .vc-cast-skip')), 'Skip and Continue on the curtain call are the same height (and so have the same centre)');
  t.eq(cssNum(cssBlock('.vc-cast-go'), 'top'), cssNum(cssBlock('.vc-cast-skip'), 'top'), 'at the same top'); t.eq(cssNum(cssBlock('.vc-cast-go'), 'right'), cssNum(cssBlock('.vc-cast-skip'), 'left'), 'and the same margin from their sides');
  t.ok(/margin-left:\s*auto/.test(cssBlock('.vc-go')), 'Continue stays on the right of the showcase column when the Inkstones chip beside it is empty');
  const R = WIN.R;
  await UI.go('victory', { summary: RUN.summary(R), R }, { force: true, transition: 'none' }); await settle(g);
  await click(g, btnByText(g, /^Skip/));
  const card = $('.s-victory .vc-card');
  t.ok(!card.style.width && !card.style.height, 'the share card has no inline size: CSS fits it to its column (width 100%)');
  t.ok(/\.vc-card \{[^}]*width:\s*100%[^}]*height:\s*auto/.test(CSS), 'width 100% and height auto');
  t.eq(card.width, Math.round(600 * (UI.px || 1)), 'while the saved image keeps its full 600 px backing store');
  g._key('Enter'); await settle(g);
});
await t.test('P9 layout: the credit line has its own strip under the curtain boxes, the follow rows take pointer events themselves, and big text or a phone keep the Newly Unlocked card', () => {
  const caps = cssBlock('.vc-caps'), credit = cssBlock('.vc-credit');
  t.ok(cssNum(caps, 'bottom') >= cssNum(credit, 'bottom') + 14, 'the boxes end at least 14 px (one 12 px line) above the credit line: ' + cssNum(caps, 'bottom') + ' over ' + cssNum(credit, 'bottom'));
  t.ok(/pointer-events:\s*none/.test(credit), 'the credit line is plain text: it never takes a click');
  t.ok(/opacity:\s*0/.test(credit) && /\.vc-cast-done \.vc-credit \{[^}]*opacity:\s*\.9/.test(CSS), 'it appears with the Continue button, once the four boxes are in');
  t.ok(/pointer-events:\s*auto/.test(cssBlock('.vc-follow a.btn')), 'the Support anchor takes clicks inside the click-through row (an anchor does not by default)');
  t.ok(/pointer-events:\s*auto/.test(cssBlock('.go-follow .btn')), 'and so do the game over buttons');
  t.ok(/flex:\s*none/.test(cssBlock('.vc-follow')), 'the follow row never shrinks, so the Newly Unlocked card (flex 1) gives way, not the buttons');
  t.ok(/font-size:\s*calc\(17px \* min\(var\(--ts\), 1\.12\)\)/.test(cssBlock('.ts-big .vc-cardbtns .btn')), 'Larger text stops growing Copy summary, Save card and Share past 1.12, so the three share one row');
  t.ok(/flex-wrap:\s*wrap/.test(cssBlock('.vc-cardbtns')), 'and the row can still wrap rather than clip');
  t.ok(/width:\s*70%/.test(cssBlock('.compact .vc-card')), 'on a phone the share card gives up height (every button is --hit tall there) so the Newly Unlocked card keeps room');
  t.ok(/\.vc-card \{[^}]*width:\s*100%/.test(CSS), 'while the desktop card still fills its column');
});
await t.test('finding 38 (tutorial.js): an anchor that fills most of the stage is not an anchor', () => {
  t.ok(/const FULL_STAGE = 0\.6;/.test(TUT) && /\* W \* H\) continue;/.test(TUT), 'findAnchor skips an anchor over 60 percent of the stage');
  t.ok(/hand: \{[^}]*anchor: \['hand'\][^}]*at: \{ x: 611, y: 620 \}/.test(TUT), 'the hand hint falls back to a point above the hand fan axis (x 611, the middle of the strip between the docks)');
});

// ================================================================================================ the score terms
await t.test('scoreRows: every term of RUN.score for many simulated runs, with a deck and without', () => {
  const P = UI.screens.gameOver._t;
  const runs = [WIN.R, LOSE.R, simulate(903, ['kuro', 'suzu'], 'win', 1).R, simulate(904, ['raiga', 'hanae'], 'win', 2).R];
  runs.forEach((R, i) => {
    const sm = RUN.summary(R);
    const withDeck = P.scoreRows(sm, R);
    t.eq(withDeck.rows.reduce((a, r) => a + r.pts, 0), sm.score, 'run ' + i + ': the terms add up with the deck');
    const noDeck = P.scoreRows(sm, null);
    t.eq(noDeck.rows.reduce((a, r) => a + r.pts, 0), sm.score, 'run ' + i + ': and still add up without it (one Deck work row)');
    t.ok(withDeck.rows.every((r) => r.label && Array.isArray(r.icon)), 'rows carry a label and an icon');
  });
});

// ================================================================================================ accessibility and settings
await t.test('reduced motion: no petals, no typewriter delay, final states at once; textScale and colorblind leave the structure alone', async () => {
  META.set('reduceMotion', true); UI.applySettings();
  t.ok(UI.opt.reduceMotion, 'reduce motion is on');
  await UI.go('victory', { summary: RUN.summary(WIN.R), R: WIN.R }, { force: true, transition: 'none' }); await settle(g);
  t.eq($$(g, '.en-petals').length, 0, 'no petals');
  g._key('Escape'); await settle(g);
  t.eq($$(g, '.en-petal').length, 0, 'still none on the showcase');
  META.set('reduceMotion', false); META.set('textScale', 1.3); META.set('colorblind', true); UI.applySettings();
  await UI.go('gameOver', { summary: RUN.summary(LOSE.R), R: LOSE.R }, { force: true, transition: 'none' }); await settle(g);
  t.ok($('.go-again') && $('.go-title-btn') && $$(g, '.en-row').length >= 8, 'every part is still there at text 1.3');
  META.set('textScale', 1); META.set('colorblind', false); UI.applySettings();
  await UI.go('title', null, { force: true, transition: 'none' }); await settle(g);
});
await t.test('every interactive element is a real button or has a role; images are labelled', async () => {
  await UI.go('victory', { summary: RUN.summary(WIN.R), R: WIN.R }, { force: true, transition: 'none' }); await settle(g);
  g._key('Escape'); await settle(g);
  const root = $(g, '.s-victory');
  $$(g, 'button, [role=button], [tabindex]', root).forEach((el) => t.ok(el.localName === 'button' || el.getAttribute('role') === 'button' || el.getAttribute('tabindex') !== null, 'focusable things are buttons'));
  t.ok($('.vc-card', root).getAttribute('aria-label').length > 20, 'the card canvas has a text alternative');
  await UI.go('title', null, { force: true, transition: 'none' }); await settle(g);
  t.eq($$(g, '#screens > .screen').length, 1, 'one root');
});

// ================================================================================================ realtime: the typewriter and the animation clock
{
  const gr = boot({ only: ['screen_end', 'tutorial', 'main'], realtime: true, continue: true, seed: 5 });
  gr.GAME.boot();
  await gr._tick(1500);
  // in a realtime page nothing resolves without frames: start the route, then tick
  const goRT = async (name, params, ms = 200) => { gr.UI.go(name, params, { force: true, transition: 'none' }); await gr._tick(ms); };
  await t.test('typewriter at 30 characters per second, tap completes, the next tap turns the page', async () => {
    await goRT('story', { id: 'ch1_intro', then: { name: 'howto' } }, 100);
    const typed = () => (gr._doc.querySelector('.st-typed .tw-on') || { textContent: '' }).textContent.length;
    t.eq(typed(), 0, 'nothing is written during the flourish');
    await gr._tick(700 + 1000);
    const n = typed();
    t.ok(n >= 26 && n <= 34, 'about 30 characters after one second of writing (' + n + ')');
    await gr._tick(1000);
    t.ok(typed() - n >= 26 && typed() - n <= 34, 'and 30 more the next second (' + (typed() - n) + ')');
    t.ok(!gr._doc.querySelector('.s-story').className.includes('st-done'), 'the page is not done yet');
    gr._click(gr._doc.querySelector('.st-page'));
    await gr._tick(40);
    const full = gr.DATA.lore.ch1_intro.text.slice(1);
    t.eq(gr._doc.querySelector('.st-typed .tw-on').textContent, full, 'a tap completes the text');
    t.eq(gr.UI.currentName, 'story', 'and does not turn the page');
    gr._click(gr._doc.querySelector('.st-page'));
    await gr._tick(40);
    t.eq(gr.UI.currentName, 'story', 'a second tap inside the guard window does not turn it either');
    await gr._tick(400);
    gr._click(gr._doc.querySelector('.st-page'));
    await gr._tick(900);
    t.eq(gr.UI.currentName, 'howto', 'a later tap turns the page');
  });
  await t.test('keys wake up 0.7 s into a screen: mashing Enter through a fight cannot restart a run, a click always works', async () => {
    const R = gr.RUN.newRun({ heroes: ['suzu', 'raiga'], seed: 9 }); if (!R.map) gr.RUN.startChapter(R, 1);
    const sm = gr.RUN.summary(R);
    let started = 0; const real = gr.GAME.newRun; gr.GAME.newRun = () => { started++; return null; };
    await goRT('gameOver', { summary: sm, R: null }, 100);
    gr._key('Enter'); await gr._tick(60);
    t.eq(started, 0, 'Enter in the first 0.2 s is ignored');
    await gr._tick(900);
    gr._key('Enter'); await gr._tick(60);
    t.eq(started, 1, 'Enter after the screen has settled starts a new run');
    await goRT('gameOver', { summary: sm, R: null }, 100);
    gr._click(gr._doc.querySelector('.go-again')); await gr._tick(60);
    t.eq(started, 2, 'a click on the button is never held back');
    gr.GAME.newRun = real;
  });
  await t.test('counters tick up and finish on the exact value; a backdrop tap finishes them at once', async () => {
    const R = gr.RUN.newRun({ heroes: ['hanae', 'kuro'], seed: 8 }); if (!R.map) gr.RUN.startChapter(R, 1);
    R.stats.turns = 40; R.stats.damageDealt = 1234; R.stats.cardsPlayed = 77; R.stats.kills = 19;
    gr.GAME.state.R = R; gr.UI.setRun(R);
    await goRT('chapterClear', { chapter: 1, next: 2, healed: R.heroes.map((h) => ({ id: h.id, n: 20 })), maxHp: 8, R }, 1300);
    const dmg = () => Number(gr._doc.querySelectorAll('.en-tile .en-num')[1].textContent.replace(/,/g, ''));
    const mid = dmg();
    t.ok(mid >= 0 && mid < 1234, 'the damage counter is part way (' + mid + ')');
    gr._click(gr._doc.querySelector('.s-chapterClear .en-tap'));
    await gr._tick(40);
    t.eq(dmg(), 1234, 'a backdrop tap finishes it');
    await gr._tick(3000);
    t.eq(gr._doc.querySelector('.cc-chip.max').className.includes('on'), true, 'the max HP chip popped');
    t.eq(gr._doc.querySelector('.cc-hero .hp-txt').textContent, R.heroes[0].hp + '/' + R.heroes[0].maxHp, 'the bar ends on the run\'s HP');
    t.eq(gr._console.error.length, 0, 'no console errors in the realtime run');
  });
  await t.test('victory: a showcase built seconds into the screen still counts the ledger up in turn and ends on the exact score', async () => {
    const R = WIN.R;
    const sm = g.RUN.summary(R);
    await goRT('victory', { summary: sm, R }, 4200);              // the epilogue has been on screen for four seconds when Skip is pressed
    gr._click(Array.from(gr._doc.querySelectorAll('.s-victory button')).find((b) => /Skip/.test(b.textContent)));
    await gr._tick(300);
    const rows = () => gr._doc.querySelectorAll('.en-row.show').length;
    t.ok(rows() < gr._doc.querySelectorAll('.en-row').length, 'the rows are not all in at once (' + rows() + ')');
    const total = () => Number(gr._doc.querySelector('.en-total-n').textContent.replace(/,/g, ''));
    t.ok(total() < sm.score, 'and the total is still counting (' + total() + ')');
    await gr._tick(6000);
    t.eq(rows(), gr._doc.querySelectorAll('.en-row').length, 'every row is in');
    t.eq(total(), sm.score, 'the total ends on the exact score, not on the last row that finished');
    await goRT('title', null, 500);
  });
  await t.test('the ledger reveals row by row and ends on the exact score; leaving mid animation is safe', async () => {
    const R = WIN.R;
    const sm = g.RUN.summary(R);
    await goRT('gameOver', { summary: sm, R: null }, 1400);
    const shown = () => gr._doc.querySelectorAll('.en-row.show').length;
    t.ok(shown() >= 1 && shown() < gr._doc.querySelectorAll('.en-row').length, 'some rows are in, not all (' + shown() + ')');
    await gr._tick(5000);
    t.eq(gr._doc.querySelectorAll('.en-row.show').length, gr._doc.querySelectorAll('.en-row').length, 'all rows revealed');
    t.eq(Number(gr._doc.querySelector('.en-total-n').textContent.replace(/,/g, '')), sm.score, 'the total ends on the score');
    await goRT('gameOver', { summary: sm }, 300);
    await goRT('title', null, 3000);
    t.eq(gr._console.error.length, 0, 'leaving mid-animation never throws later');
  });
}

// ================================================================================================ the tutorial
const TU = UI.tutorial;
await t.test('tutorial catalog: every hint is written well and wired to real bus events, anchors and screens', () => {
  const ids = Object.keys(TU.HINTS);
  t.ok(ids.length >= 18, 'at least eighteen hints (' + ids.length + ')');
  const screens = DATA.LISTS.screens, buses = DATA.LISTS.busEvents, anchors = DATA.LISTS.tutAnchors;
  ids.forEach((id) => {
    const h = TU.HINTS[id];
    t.ok(h.title && h.title.length <= 30, id + ': a short title');
    t.ok(h.text && h.text.length >= 40 && h.text.length <= 230, id + ': brief copy (' + h.text.length + ')');
    t.ok(!DASH.test(h.title + h.text), id + ': no dashes');
    t.ok(h.scope && h.scope.length && h.scope.every((s) => screens.indexOf(s) >= 0), id + ': scopes are real screens');
    (h.anchor || []).forEach((a) => t.ok(anchors.indexOf(a) >= 0 || /^[.#\[]/.test(a), id + ': anchor ' + a + ' is a data-tut name or a selector'));
    (h.completeOn || []).forEach((e) => t.ok(buses.indexOf(e) >= 0, id + ': completeOn ' + e + ' is a bus event'));
    t.ok(h.at || h.anchor, id + ': somewhere to point');
    if (h.after) t.ok(TU.HINTS[h.after], id + ': its prerequisite exists');
  });
  TU.RULES.forEach((r) => { t.ok(TU.HINTS[r.hint], 'rule for ' + r.hint + ' names a real hint'); [].concat(r.on).forEach((e) => t.ok(buses.indexOf(e) >= 0, 'rule event ' + e + ' is a bus event')); });
  ['paint', 'ink', 'walk', 'tiles', 'brush', 'energy', 'hand', 'intent', 'endturn', 'block', 'swap', 'status', 'boss', 'camp', 'shop', 'gems', 'event', 'reward'].forEach((id) => t.ok(TU.HINTS[id], 'covers ' + id));
  // the hint titles are bible 5.6, exact and in order (the Gems hint keeps its plain title)
  t.eq(['paint', 'ink', 'walk', 'tiles', 'goal', 'brush', 'relics', 'energy', 'hand', 'intent', 'endturn', 'block', 'swap', 'status', 'pick', 'boss', 'reward', 'camp', 'shop', 'event'].map((id) => TU.HINTS[id].title).join(' | '),
    'Unmute the Soundlands | Vox is your budget | Now roll | Read the map signs | The road to the headliner | A Spell unmutes for free | Charms | Breath | Play a card | Read the intents | End your turn | Block | Lead and backing | Statuses | Choose cards | A headliner | The goodie bag | A green room | Jordan\'s merch stall | A detour', 'the titles are the bible 5.6 list');
  t.eq(TU.HINTS.paint.text, 'The Soundlands are on mute. Tap a hex beside the live patch to spend 1 Vox and hear what hides there.', 'the first hint is the bible 5.6 example');
  t.eq(TU.HINTS.gems.title, 'Gems', 'the Gems hint keeps its title');
  const old = /\b(Echo|Echowake|Hush|Verses?|Songs?|Treasures?|Energy|Keepers?|Bosses|boss|Champions?|peddlers?|camps?|fables?|forges?|journey|awake|wake|Meditate|Sharpen|prism|front row|back row)\b/;
  ids.forEach((id) => t.ok(!old.test(TU.HINTS[id].title + ' ' + TU.HINTS[id].text), id + ': no Echowake word in the hint (' + TU.HINTS[id].title + ')'));
});

// a fresh page for the guided run: the tutorial flags start empty
const gt = fresh({ seed: 12 });
await settle(gt);
{
  const { UI: U2, RUN: R2, META: M2, GAME: G2, DATA: D2, MAP: MAP2, COMBAT: C2 } = gt;
  const tuts = () => Array.from(gt._doc.querySelectorAll('#tips .tut'));
  const cur = () => (U2.tutorial.current() ? U2.tutorial.current().id : null);
  const bubble = () => { const b = tuts()[0]; return b ? b.dataset.hint : null; };
  const tick = async () => { await gt._settle(); await gt._settle(); };
  const flags = () => Object.keys(M2.profile.tutorial || {}).filter((k) => /^tut_/.test(k)).sort();

  await t.test('tutorial: nothing shows before anything happens, and the intro story fires no hint', async () => {
    t.eq(tuts().length, 0, 'no bubbles on the title'); t.eq(flags().length, 0, 'no flags yet'); t.ok(U2.tutorial.enabled(), 'enabled by default');
    t.deep(U2.tutorial.shown, [], 'nothing shown');
  });
  await t.test('tutorial: the story chain and the map: paint, ink, walk, tiles, goal, one bubble at a time', async () => {
    const R = G2.newRun({ heroes: ['hanae', 'kuro'], seed: 12, trial: 0 });
    R.brushes = [];                                   // a clean tray, so the Spell hint does not join this part of the sequence
    await tick();
    t.eq(U2.currentName, 'story', 'the intro story'); t.eq(tuts().length, 0, 'no hint over a story page');
    gt._key('Enter'); await tick(); gt._key('Enter'); await tick(); gt._key('Enter'); await tick(); gt._key('Enter'); await tick();
    t.eq(U2.currentName, 'map', 'the (placeholder) map after two story pages');
    await tick();
    t.eq(bubble(), 'paint', 'the first map hint: paint'); t.eq(tuts().length, 1, 'exactly one bubble'); t.ok(M2.tutorial('tut_paint'), 'its flag is stored the moment it shows');
    t.ok(/Vox/.test(txt(tuts()[0])) && $(gt, '.tut-ok'), 'it says something about Vox and has Got it');
    // the player acts: painting completes the hint, and the next one follows
    U2.bus.emit('map:paint', { q: 3, r: 2, cost: 1 }); await tick();
    t.eq(cur(), 'ink', 'painting completes paint, and ink follows'); t.eq(tuts().length, 1, 'still one bubble');
    U2.bus.emit('map:paint', { q: 4, r: 2, cost: 1 }); await tick();
    t.eq(cur(), 'ink', 'a second paint does not stack another bubble');
    await click(gt, $(gt, '.tut-ok')); await tick();
    t.eq(cur(), 'walk', 'Got it closes ink, the queue brings walk');
    t.ok(!U2.tutorial.queue().includes('walk'), 'walk left the queue');
    U2.bus.emit('map:walk', { q: 4, r: 2 }); await tick();
    t.eq(cur(), 'tiles', 'walking completes walk; the stamps guide follows'); t.ok(M2.tutorial('tut_walk'), 'walk was stored');
    U2.bus.emit('map:paint', { q: 5, r: 2, cost: 1 }); await tick();
    t.deep(U2.tutorial.queue().filter((x) => x === 'goal'), ['goal'], 'the third paint queues the road to the boss behind the open bubble');
    await click(gt, $(gt, '.tut-ok')); await tick();
    t.eq(cur(), 'goal', 'then goal');
    await click(gt, $(gt, '.tut-ok')); await tick();
    t.eq(cur(), null, 'the queue is empty'); t.eq(tuts().length, 0, 'no bubble left in #tips');
    ['paint', 'ink', 'walk', 'tiles', 'goal'].forEach((id) => t.eq(U2.tutorial.shown.filter((x) => x === id).length, 1, id + ' shown exactly once'));
  });
  await t.test('tutorial: events repeated later raise nothing; a Spell hint needs a Spell and completes on use', async () => {
    const before = U2.tutorial.shown.length;
    for (let i = 0; i < 4; i++) { U2.bus.emit('map:paint', { q: i, r: 1, cost: 1 }); U2.bus.emit('map:walk', { q: i, r: 1 }); }
    await tick();
    t.eq(U2.tutorial.shown.length, before, 'nothing new fires for events already taught');
    const R = G2.state.R;
    R.brushes = [];
    U2.bus.emit('screen', { name: 'map', params: { R } }); await tick();
    t.ok(!U2.tutorial.shown.includes('brush'), 'no brush in the tray: no brush hint');
    R.brushes = ['stroke'];
    U2.bus.emit('screen', { name: 'map', params: { R } }); await tick();
    t.eq(cur(), 'brush', 'a brush in the tray raises it');
    U2.bus.emit('map:brush', { id: 'stroke' }); await tick();
    t.eq(U2.tutorial.queue().length, 0, 'using it completes the hint'); t.eq(U2.tutorial.shown.filter((x) => x === 'brush').length, 1, 'once');
    R.relics = ['brass_lantern'];
    U2.bus.emit('screen', { name: 'map', params: { R } }); await tick();
    t.eq(cur(), 'relics', 'the first treasure raises the treasures hint'); await click(gt, $(gt, '.tut-ok')); await tick();
  });
  await t.test('tutorial: a real fight: energy, hand, then intent and end turn after the first play, block and swap on turn two', async () => {
    const R = G2.state.R;
    const node = nodeAtG(gt, R, 'enemy');
    await G2.enterNode(node); await tick(); await tick();
    t.eq(U2.currentName, 'combat', 'the real combat screen');
    t.eq(cur(), 'energy', 'energy first'); t.ok($(gt, '#tips .tut-ring'), 'a spotlight ring is drawn around the anchor');
    t.ok(!$(gt, '#tips .tut').closest('.screen'), 'the bubble lives in #tips, not inside the screen');
    // never gates input: the bubble does not capture pointer events (it is pointer-transparent except its buttons)
    t.ok(/\.tut \{[^}]*pointer-events: none/.test(CSS), 'the bubble is pointer-transparent in css');
    const d = G2.debug.combat();
    await click(gt, $(gt, '.tut-ok')); await tick();
    t.eq(cur(), 'hand', 'hand follows energy');
    // play a card with the real screen: the hint completes and intent + end turn queue
    const hand0 = d.C.hand.findIndex((c) => d.C.canPlay(c.uid).ok || d.C.canPlay(c.uid).reason === 'target');
    await d.play(hand0 < 0 ? 0 : hand0, 0); await tick(); await tick();
    t.ok(M2.tutorial('tut_hand'), 'hand is stored');
    t.eq(cur(), 'intent', 'after the first play: intents'); await click(gt, $(gt, '.tut-ok')); await tick();
    t.eq(cur(), 'endturn', 'then end turn');
    await d.endTurn(); await tick(); await tick();
    t.ok(M2.tutorial('tut_endturn'), 'ending the turn completed it');
    const order = U2.tutorial.shown.slice();
    t.ok(order.indexOf('energy') < order.indexOf('hand') && order.indexOf('hand') < order.indexOf('intent') && order.indexOf('intent') < order.indexOf('endturn'), 'in teaching order: ' + order.join(','));
    // turn two raises block and swap (and status when a chip exists), one at a time
    let guard = 0;
    while (U2.tutorial.queue().length + (cur() ? 1 : 0) && guard++ < 6) { if (cur()) await click(gt, $(gt, '.tut-ok')); await tick(); await tick(); }
    ['energy', 'hand', 'intent', 'endturn', 'block', 'swap'].forEach((id) => t.eq(U2.tutorial.shown.filter((x) => x === id).length, 1, id + ' exactly once'));
    t.ok(U2.tutorial.shown.indexOf('block') < U2.tutorial.shown.indexOf('swap'), 'block before swap');
    t.eq(U2.tutorial.queue().length, 0, 'the queue drained');
    const eN = gt._console.error.length;
    t.eq(eN, 0, 'no console errors through the whole fight');
  });
  await t.test('tutorial: a hint that loses its screen is dropped, an overlay hides the bubble, the settings switch and Hide hints work', async () => {
    const R = G2.state.R;
    U2.tutorial.reset();
    t.eq(flags().length, 0, 'reset clears the flags');
    U2.bus.emit('screen', { name: 'camp', params: { R } });
    await U2.go('camp', { node: nodeAtG(gt, R, 'camp'), R }, { force: true, transition: 'none' }); await tick(); await tick();
    t.eq(cur(), 'camp', 'the camp hint shows on the camp screen');
    UI_overlay(gt, 'deck'); await tick();
    t.ok(tuts()[0].className.includes('hold'), 'an open overlay hides the bubble');
    U2.overlay.close(); await tick();
    t.ok(!tuts()[0].className.includes('hold'), 'and it comes back');
    await U2.go('howto', null, { force: true, transition: 'none' }); await tick(); await tick();
    t.eq(tuts().length, 0, 'leaving the screen removes a bubble that belongs to it');
    t.ok(!U2.tutorial.fire('nonexistent_hint'), 'firing an unknown hint is refused');
    await U2.go('shop', { node: nodeAtG(gt, R, 'shop'), R }, { force: true, transition: 'none' }); await tick(); await tick();
    t.eq(cur(), 'shop', 'the shop hint');
    M2.set('hints', false);
    await click(gt, $(gt, '.tut-ok')); await tick();
    U2.bus.emit('screen', { name: 'event', params: {} }); await U2.go('howto', null, { force: true, transition: 'none' }); await tick();
    t.ok(!U2.tutorial.enabled(), 'the Hints setting turns the system off'); t.ok(!U2.tutorial.fire('event'), 'and nothing is queued');
    M2.set('hints', true);
    await U2.go('event', { node: nodeAtG(gt, R, 'event'), R }, { force: true, transition: 'none' }); await tick(); await tick();
    t.eq(cur(), 'event', 'back on, the fable hint shows');
    await click(gt, $(gt, '.tut-off')); await tick();
    t.eq(M2.get('hints'), false, 'Hide hints writes the setting'); t.eq(tuts().length, 0, 'and closes the bubble');
    M2.set('hints', true);
  });
  await t.test('tutorial: a real boss fight raises energy then the boss hint; a pick prompt and a status chip raise theirs, each exactly once', async () => {
    const R = G2.state.R;
    U2.tutorial.reset(); U2.tutorial.shown.length = 0;
    R.chapter = 1;
    const node = nodeAtG(gt, R, 'boss');
    await G2.enterNode(node); await tick(); await tick();
    t.eq(U2.currentName, 'combat', 'the boss fight');
    t.eq(cur(), 'energy', 'energy first in a first fight, even a boss one');
    await click(gt, $(gt, '.tut-ok')); await tick();
    t.eq(cur(), 'hand', 'hand next (it was waiting on energy)');
    await click(gt, $(gt, '.tut-ok')); await tick();
    t.eq(cur(), 'boss', 'then the boss hint');
    await click(gt, $(gt, '.tut-ok')); await tick();
    U2.bus.emit('combat:pick', { pending: { n: 1 } }); await tick();
    t.eq(cur(), 'pick', 'a pick prompt raises its hint'); await click(gt, $(gt, '.tut-ok')); await tick();
    const d = G2.debug.combat();
    d.setStatus('hanae', 'might', 2); await tick();
    U2.bus.emit('combat:turn', { turn: 3, phase: 'player' }); await tick(); await tick();
    let guard = 0;
    while ((cur() || U2.tutorial.queue().length) && guard++ < 8) { if (cur()) await click(gt, $(gt, '.tut-ok')); await tick(); await tick(); }
    ['energy', 'hand', 'boss', 'pick', 'status', 'block', 'swap'].forEach((id) => t.eq(U2.tutorial.shown.filter((x) => x === id).length, 1, id + ' exactly once'));
    t.eq(new Set(U2.tutorial.shown).size, U2.tutorial.shown.length, 'no hint was ever shown twice');
    t.eq(gt._console.error.length, 0, 'no console errors');
  });
  await t.test('tutorial: boss fights raise the boss hint; a status chip raises the status hint; gems raise on the first gem', async () => {
    const R = G2.state.R;
    U2.tutorial.reset(); U2.tutorial.shown.length = 0;
    await U2.go('howto', null, { force: true, transition: 'none' }); await tick();
    U2.bus.emit('screen', { name: 'combat', params: { node: { tier: 'boss' }, R } });
    await tick(); await tick();
    t.eq(U2.tutorial.shown.length, 0, 'a combat hint raised while another screen is current never shows (scope)');
    R.gems = ['red_g0'];
    await U2.go('reward', { rewards: { gold: 5, ink: 0, cards: [], relics: [], gems: [], brush: null, maxHp: 0, boss: false, tier: 'normal', source: 'combat' }, source: 'combat', node: { kind: 'reward', rewards: { gold: 5, cards: [], relics: [], gems: [] } }, R }, { force: true, transition: 'none' });
    await tick(); await tick();
    t.eq(cur(), 'reward', 'the spoils hint comes first (catalog order)');
    await click(gt, $(gt, '.tut-ok')); await tick();
    t.eq(cur(), 'gems', 'then, with a gem in the pouch, gems');
    await click(gt, $(gt, '.tut-ok')); await tick();
  });
}
// the off switch: ?notutorial=1 and a run of events show nothing
{
  const go = fresh({ search: '?notutorial=1', seed: 4 });
  await go._settle();
  await t.test('tutorial: ?notutorial=1 disables every hint', async () => {
    go.UI.bus.emit('screen', { name: 'map', params: {} });
    go.UI.bus.emit('map:paint', { q: 1, r: 1, cost: 1 });
    await go._settle(); await go._settle();
    t.ok(!go.UI.tutorial.enabled(), 'disabled'); t.eq(go._doc.querySelectorAll('#tips .tut').length, 0, 'no bubble'); t.eq(go.UI.tutorial.shown.length, 0, 'nothing shown');
    t.ok(!go.UI.tutorial.fire('paint'), 'fire refuses');
  });
}

// tiny helpers that need the page they run in
function nodeAtG(gp, R, kind) {
  R.node = null;
  const M = R.map, pos = M.pos;
  const cand = gp.MAP.neighbors(M, pos.q, pos.r).map((c) => M.tiles[gp.MAP.key(c[0], c[1])]).filter((x) => x && x.type !== 'block');
  const nb = cand.find((x) => !x.painted) || cand[0];
  nb.type = kind; nb.painted = true; nb.known = true; nb.done = false;
  nb.content = kind === 'shop' ? { seed: 7 } : kind === 'enemy' ? { enc: (gp.DATA.encounters[R.chapter].normal[0] || {}).id } : {};
  const node = gp.RUN.step(R, nb.q, nb.r);
  if (!node) throw new Error('RUN.step gave no node for ' + kind);
  return node;
}
function UI_overlay(gp, name) { gp.UI.overlay.open(name, { mode: 'view' }); }

await t.done();
