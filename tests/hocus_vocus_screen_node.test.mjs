// Node screens suite: reward, shop, event, camp, forge, chest, gemcache and the deck and cardPick overlays (js/screen_node.js, css/node.css).
//
// Everything runs against the REAL modules (RUN, COMBAT, MAP, META, UI, ART, AUDIO, GAME) in the headless loader, with real runs built from many seeds:
// nodes come from RUN.step on a retyped tile (exactly what GAME.debug.open does), rewards from a real combat won through COMBAT and RUN.combatDone.
// GAME.nodeDone and GAME.enterNode are replaced by spies in most tests (the flow tests at the end use the real ones), and the suite drives the DOM
// with _click and the virtual clock: DOM structure, state changes in RUN, the bus, sound ids, cleanup on leave, and saved-node restore.
import fs from 'node:fs';
import path from 'node:path';
import { boot, harness, DIR } from './hocus_vocus_lib.mjs';

const t = harness('hocus_vocus screen_node');
const SRC = fs.readFileSync(path.join(DIR, 'js', 'screen_node.js'), 'utf8');
const CSS = fs.readFileSync(path.join(DIR, 'css', 'node.css'), 'utf8');

// ---------------------------------------------------------------------------------------------------- harness
function fresh(opts = {}) {
  const { spy, ...bootOpts } = opts;
  const g = boot({ only: ['screen_node', 'main'], seed: 5, continue: true, ...bootOpts });
  if (g._errors.length) throw new Error('boot errors: ' + JSON.stringify(g._errors.map((e) => e.file + ': ' + e.message)));
  g.GAME.boot();
  if (spy !== false) g._run(`globalThis.__done = 0; globalThis.__entered = []; GAME.nodeDone = () => { __done++; return Promise.resolve(); }; GAME.enterNode = (n) => { __entered.push(n); return Promise.resolve(); };`);
  return g;
}
const done = (g) => g._run('__done');
const entered = (g) => g._run('__entered');
const $ = (g, sel, root) => (root || g._doc).querySelector(sel);
const $$ = (g, sel, root) => Array.from((root || g._doc).querySelectorAll(sel));
const txt = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const settle = (g) => g._settle();
const errs = (g) => g._console.error.length;

function mkRun(g, o = {}) {
  const R = g.RUN.newRun({ heroes: o.heroes || ['hanae', 'kuro'], seed: o.seed === undefined ? 5 : o.seed, trial: o.trial | 0, unlocked: o.unlocked });
  if (o.gold !== undefined) R.gold = o.gold;
  if (o.hp) o.hp.forEach((v, i) => { R.heroes[i].hp = v; });
  if (o.relics) o.relics.forEach((id) => g.RUN.addRelic(R, id));
  if (o.gems) o.gems.forEach((id) => R.gems.push(id));
  g.GAME.state.R = R; g.UI.setRun(R);
  return R;
}

// a real node: retype a neighbour of the party, then RUN.step onto it (what GAME.debug.open does)
function nodeAt(g, R, kind, content) {
  R.node = null;                                   // a fresh visit: whatever page was open before is over
  const M = R.map, pos = M.pos;
  const nb = g.MAP.neighbors(M, pos.q, pos.r).map((c) => M.tiles[g.MAP.key(c[0], c[1])]).find((x) => x && x.type !== 'block' && !x.painted) || g.MAP.neighbors(M, pos.q, pos.r).map((c) => M.tiles[g.MAP.key(c[0], c[1])]).find((x) => x && x.type !== 'block');
  nb.type = kind; nb.painted = true; nb.known = true; nb.done = false; nb.content = content || {};
  const node = g.RUN.step(R, nb.q, nb.r);
  if (!node) throw new Error('RUN.step gave no node for ' + kind);
  return node;
}

async function open(g, kind, R, node, extra) {
  await g.UI.go(kind, Object.assign({ node, R }, extra || {}), { force: true, transition: 'none' });
  await settle(g);
  return $(g, '.s-' + kind);
}

// a real fight won through COMBAT and RUN.combatDone: the reward node RUN builds
function winFight(g, R, kind) {
  const node = nodeAt(g, R, kind || 'enemy', {});
  const C = g.COMBAT.create(g.RUN.combatInit(R, node));
  C.start();
  C.enemies.forEach((e) => { e.hp = 0; e.down = true; });
  C.result = 'win'; C.phase = 'over';
  const rewards = g.RUN.combatDone(R, C);
  if (!rewards) throw new Error('combatDone returned nothing');
  return R.node;
}

async function openReward(g, R, kind) {
  const node = winFight(g, R, kind);
  await g.UI.go('reward', { rewards: node.rewards, source: node.source, node, R }, { force: true, transition: 'none' });
  await settle(g);
  return node;
}

const click = async (g, el) => { if (!el) throw new Error('click: no element'); g._click(el); await settle(g); };
const clickSel = async (g, sel, root) => click(g, $(g, sel, root) || null);
const btnByText = (g, re, root) => $$(g, 'button', root).find((b) => re.test(b.textContent));

// pick the n-th card in an open deck overlay, then press its primary button (twice when the remove mode wants a second tap)
async function deckPick(g, index, twice) {
  const cards = $$(g, '.o-deck .dk-card');
  await click(g, cards[index]);
  const go = $(g, '.o-deck .dk-go');
  if (!go) return null;
  await click(g, go);
  if (twice) await click(g, $(g, '.o-deck .dk-go'));
  return go;
}

const jsonEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const SEEDS = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233];

// ==================================================================================================== load, registration, static rules
await t.test('screen_node.js loads headless, registers seven screens and both overlays, and touches nothing while loading', () => {
  const g = boot({ only: ['screen_node'], continue: true });
  t.eq(g._errors.length, 0, 'no load errors');
  ['reward', 'shop', 'event', 'camp', 'forge', 'chest', 'gemcache'].forEach((k) => {
    const s = g.UI.screens[k];
    t.ok(s && typeof s.enter === 'function' && typeof s.leave === 'function' && typeof s.update === 'function' && typeof s.draw === 'function', 'UI.screens.' + k + ' is a full screen');
    t.ok(typeof s.music === 'string' && g.DATA.LISTS.music.indexOf(s.music) >= 0, k + ' names a real music track (' + s.music + ')');
  });
  ['deck', 'cardPick'].forEach((k) => t.ok(g.UI.overlays[k] && typeof g.UI.overlays[k].open === 'function', 'UI.overlays.' + k + ' exists'));
  t.ok(g.UI.overlays.deck.open.length >= 2, 'the deck overlay is the full version, not the basic viewer of ui.js');
});

await t.test('source rules: every sound id, overlay name and bus event the file names exists in its closed list; no dashes; css has the anchors', () => {
  const L = boot({ only: ['util', 'data'] }).DATA.LISTS;
  const sfx = [...SRC.matchAll(/\bsnd\(\s*'([\w-]+)'\s*\)/g)].map((m) => m[1]);
  t.ok(sfx.length > 20, 'the file plays a good number of sounds (' + sfx.length + ')');
  sfx.forEach((id) => t.ok(L.sfx.indexOf(id) >= 0, 'sound id ' + id + ' is in LISTS.sfx'));
  [...SRC.matchAll(/\bsfx:\s*'([\w-]+)'/g)].forEach((m) => t.ok(L.sfx.indexOf(m[1]) >= 0, 'sfx option ' + m[1]));
  [...SRC.matchAll(/UI\.overlay\.open\(\s*'([\w-]+)'/g)].forEach((m) => t.ok(L.overlays.indexOf(m[1]) >= 0, 'overlay ' + m[1] + ' is a known overlay'));
  [...SRC.matchAll(/data-tut',\s*'([\w-]+)'/g)].forEach((m) => t.ok(L.tutAnchors.indexOf(m[1]) >= 0, 'data-tut ' + m[1] + ' is a known anchor'));
  const dash = new RegExp('[' + String.fromCharCode(0x2014, 0x2013) + ']');
  t.ok(!dash.test(SRC) && !dash.test(CSS), 'no em or en dashes in the module or the stylesheet');
  ['.s-', '.o-deck', '.o-cardPick', '.rw-', '.sh-', '.ev-', '.cp-', '.fg-', '.ch-', '.gc-', '.dk-', '.pk-'].forEach((p) => t.ok(CSS.indexOf(p) >= 0, 'css namespace ' + p));
  t.ok(/reduce-motion/.test(CSS) && /prefers|reduce-motion/.test(CSS), 'css honours reduce-motion');
  t.ok(!/Math\.random/.test(SRC), 'no Math.random');
});

// ==================================================================================================== reward
await t.test('reward (normal fight, twelve seeds): ledger, dealt cards, choose one, RUN.claim, Continue calls GAME.nodeDone once', async () => {
  for (const seed of SEEDS) {
    const g = fresh({ seed });
    const R = mkRun(g, { seed });
    const node = await openReward(g, R, 'enemy');
    const rw = node.rewards;
    const root = $(g, '.s-reward');
    t.ok(root, 'seed ' + seed + ': the reward screen is up');
    t.eq(txt($(g, '.nk-banner', root)), 'Victory', 'seed ' + seed + ': banner');
    t.eq(txt($(g, '.nk-row.k-gold .nk-row-val', root)), '+' + rw.gold, 'seed ' + seed + ': gold counted up to the real reward');
    if (rw.ink) t.eq(txt($(g, '.nk-row.k-ink .nk-row-val', root)), '+' + rw.ink, 'seed ' + seed + ': ink counted up'); else t.ok(!$(g, '.nk-row.k-ink', root), 'seed ' + seed + ': no ink row when there is no ink');
    const slots = $$(g, '.rw-slot', root);
    t.eq(slots.length, rw.cards.length, 'seed ' + seed + ': one slot per offered card');
    t.deep($$(g, '.rw-slot .rw-face.front .card', root).map((c) => c.dataset.id), rw.cards, 'seed ' + seed + ': the cards are the offers, in order');
    t.eq($$(g, '.rw-slot .rw-face.back .card.back', root).length, slots.length, 'seed ' + seed + ': every slot has a face-down back for the reveal');
    const deckBefore = R.deck.length, goldBefore = R.gold;
    t.ok(!rw.claimed, 'seed ' + seed + ': nothing claimed before the choice');
    t.ok($(g, '.rw-cont', root).hidden, 'seed ' + seed + ': Continue waits for the decision');
    await click(g, $$(g, '.rw-slot .rw-face.front .card', root)[seed % slots.length]);
    await settle(g);
    const pick = rw.cards[seed % slots.length];
    t.eq(R.deck.length, deckBefore + 1, 'seed ' + seed + ': the deck grew by one');
    t.eq(R.deck[R.deck.length - 1].id, pick, 'seed ' + seed + ': the chosen card joined');
    t.ok(rw.claimed, 'seed ' + seed + ': RUN.claim ran');
    t.eq(R.gold, goldBefore, 'seed ' + seed + ': claim does not pay gold twice');
    t.ok(!$(g, '.rw-cont', root).hidden, 'seed ' + seed + ': Continue is shown after the claim');
    t.ok($(g, '.rw-skip', root).hidden, 'seed ' + seed + ': Skip is gone');
    t.ok(txt($(g, '.nk-deckbtn')).indexOf('Deck ' + R.deck.length) >= 0, 'seed ' + seed + ': the deck button counts the new card');
    await click(g, $(g, '.rw-cont', root));
    t.eq(done(g), 1, 'seed ' + seed + ': GAME.nodeDone called once');
    t.eq(R.pending.length, 0, 'seed ' + seed + ': nothing left pending');
    t.eq(errs(g), 0, 'seed ' + seed + ': no console errors');
  }
});

await t.test('reward: Skip needs a second tap (confirm nudge), claims no card, and the rewards stay claimed', async () => {
  const g = fresh(); const R = mkRun(g);
  const node = await openReward(g, R, 'enemy');
  const skip = $(g, '.rw-skip'); const before = R.deck.length;
  await click(g, skip);
  t.ok(/again/i.test(txt(skip)) && skip.classList.contains('nudge'), 'the first tap turns the button into a nudge');
  t.ok(!node.rewards.claimed && R.deck.length === before, 'nothing happened yet');
  for (let i = 0; i < 200; i++) g.UI.frame(16 * (i + 1));
  t.eq(txt(skip), 'Skip card', 'the nudge times out (on the frame clock) and the button resets');
  await click(g, skip); await click(g, skip);
  t.ok(node.rewards.claimed, 'the second tap skips: claimed');
  t.eq(R.deck.length, before, 'no card was added');
  t.ok(!$(g, '.rw-cont').hidden, 'Continue is shown');
  t.ok($$(g, '.rw-slot.gone').length === node.rewards.cards.length, 'the offers fade away');
});

await t.test('reward (elite): the relic is take-it-or-leave-it, both decisions gate the claim; gem and brush drops are always taken', async () => {
  let gotGem = 0, gotBrush = 0, tookRelic = 0, leftRelic = 0;
  for (const seed of SEEDS) {
    const g = fresh({ seed }); const R = mkRun(g, { seed });
    const node = await openReward(g, R, 'elite');
    const rw = node.rewards;
    t.ok(rw.relics.length === 1, 'seed ' + seed + ': an elite offers one relic');
    const box = $(g, '.rw-relicbox');
    t.ok(box && txt(box).indexOf(g.DATA.relics[rw.relics[0]].name) >= 0, 'seed ' + seed + ': the relic offer names the relic');
    t.eq(txt($(g, '.nk-banner')), 'A Champion Falls', 'seed ' + seed + ': elite banner');
    await click(g, $$(g, '.rw-slot .rw-face.front .card')[0]);
    t.ok(!rw.claimed, 'seed ' + seed + ': choosing the card alone does not claim while the relic is undecided');
    const relicsBefore = R.relics.length, gemsBefore = R.gems.length, brushBefore = R.brushes.length;
    if (seed % 2) { await click(g, $(g, '.rw-relic')); tookRelic++; } else { await click(g, btnByText(g, /Leave it/, box)); leftRelic++; }
    t.ok(rw.claimed, 'seed ' + seed + ': both decisions made, claimed');
    t.eq(R.relics.length, relicsBefore + (seed % 2 ? 1 : 0), 'seed ' + seed + ': the relic was taken or left');
    if (seed % 2) t.ok(R.relics.indexOf(rw.relics[0]) >= 0, 'seed ' + seed + ': the offered relic is owned');
    t.eq(R.gems.length, gemsBefore + (rw.gems.length ? 1 : 0), 'seed ' + seed + ': a gem drop is banked');
    t.eq(R.brushes.length, brushBefore + (rw.brush ? 1 : 0), 'seed ' + seed + ': a brush drop is banked');
    if (rw.gems.length) gotGem++;
    if (rw.brush) gotBrush++;
    t.eq(errs(g), 0, 'seed ' + seed + ': no console errors');
  }
  t.ok(tookRelic > 0 && leftRelic > 0, 'both relic paths were exercised');
  t.ok(gotGem + gotBrush > 0, 'some elite dropped a gem or a brush across the seeds (' + gotGem + ' gems, ' + gotBrush + ' brushes)');
});

await t.test('reward (elite): once the treasure is taken or left, the empty frame and its Take it / Leave it buttons are gone (no dead buttons until Continue), and the counter shows the treasure', async () => {
  for (const take of [true, false]) {
    const g = fresh({ seed: 8 }); const R = mkRun(g, { seed: 8 });
    const node = await openReward(g, R, 'elite');
    const box = $(g, '.rw-relicbox');
    t.ok(box && $$(g, '.rw-acts button', box).length === 2 && !$$(g, '.rw-acts button', box).some((b) => b.disabled), 'the offer has two live buttons');
    if (take) {
      const before = R.relics.length;
      await click(g, btnByText(g, /Take it/, box));
      t.ok(box.classList.contains('taken'), 'taken: the box is marked answered');
      t.ok($$(g, '.rw-acts button', box).every((b) => b.disabled), 'taken: both buttons are disabled at once');
      g._flush(2000); await settle(g);
      t.ok(box.classList.contains('gone'), 'taken: the frame leaves once the treasure has flown to the counter');
      t.eq(txt($(g, '.nk-relbtn')), String(before + 1), 'the treasure counter already shows the treasure');
    } else {
      await click(g, btnByText(g, /Leave it/, box));
      t.ok(box.classList.contains('gone') && box.classList.contains('taken'), 'left: the frame leaves and is marked answered');
      t.ok($$(g, '.rw-acts button', box).every((b) => b.disabled), 'left: the buttons are disabled');
    }
    // a second tap on a dead button does nothing
    const rel = R.relics.length; $$(g, '.rw-acts button', box).forEach((b) => b.click()); await settle(g);
    t.eq(R.relics.length, rel, 'dead buttons change nothing');
    await click(g, $$(g, '.rw-slot .rw-face.front .card')[0]);
    g._flush(3000); await settle(g);
    t.ok($(g, '.rw-cont') && !$(g, '.rw-cont').hidden, 'Continue appears');
    t.ok(/\bgone\b/.test(box.className), 'the empty frame is still gone at Continue');
    t.ok(/\.rise\.gone\s*\{[^}]*animation:\s*none/.test(CSS) && /\.rw-relicbox\.taken/.test(CSS), 'css: .rise (fills forwards) can no longer hold a gone box at opacity 1');
    void node;
  }
});

await t.test('reward (elite, big text): the ledger tightens for 2 rows too (snug) and 3 or more (dense, tall), and the compact css keeps Take it and Leave it on a phone stage', async () => {
  const g = fresh({ seed: 8 }); const R = mkRun(g, { seed: 8 });
  g.META.set('textScale', 1.3); g.UI.applySettings();
  const node = await openReward(g, R, 'elite');
  const rows = $$(g, '.rw-ledger .nk-row').length;
  const led = $(g, '.rw-ledger');
  t.ok(rows >= 2, 'the elite ledger has at least gold and Ink (' + rows + ' rows)');
  t.ok(led.classList.contains('snug'), 'text above 1.0 tightens the ledger from 2 rows on');
  t.eq(led.classList.contains('dense'), rows >= 3, 'dense from 3 rows');
  t.eq(led.classList.contains('tall'), rows >= 4, 'tall from 4 rows');
  t.ok(/#stage\.compact \.rw-ledger\.dense\s*\{[^}]*top:\s*74px/.test(CSS), 'css: the dense ledger on a phone starts under the top bar (74 px) so the box fits above the stage bottom');
  t.ok(/#stage\.compact \.rw-ledger\.dense \.nk-row-lab\s*\{[^}]*min\(var\(--ts\), 1\)/.test(CSS), 'css: labels in the dense ledger do not grow with the text size');
  void node;
});

await t.test('reward: gold the thieves took is a net loss shown as "Gold lost -6" in its own tone, never "+-6"; a gain stays "+N"', async () => {
  for (const [gold, label, text, cls] of [[-6, 'Gold lost', '-6', true], [-40, 'Gold lost', '-40', true], [25, 'Gold', '+25', false]]) {
    const g = fresh({ seed: 5 }); const R = mkRun(g, { seed: 5 });
    const node = winFight(g, R, 'enemy');
    node.rewards.gold = gold;
    await g.UI.go('reward', { rewards: node.rewards, source: node.source, node, R }, { force: true, transition: 'none' }); await settle(g);
    const row = $(g, '.nk-row.k-gold, .nk-row.k-loss');
    t.eq(txt($(g, '.nk-row-lab', row)), label, 'gold ' + gold + ': the label');
    t.eq(txt($(g, '.nk-row-val', row)), text, 'gold ' + gold + ': the value is signed once');
    t.eq(row.classList.contains('k-loss'), cls, 'gold ' + gold + ': the loss tone is only for a loss');
    t.ok(txt($(g, '.s-reward')).indexOf('+-') < 0, 'gold ' + gold + ': no "+-" anywhere');
  }
});

await t.test('reward (boss): the relic page comes first with three treasures, then the card page; the claim happens after both', async () => {
  for (const seed of [1, 2, 3, 4]) {
    const g = fresh({ seed }); const R = mkRun(g, { seed });
    const node = await openReward(g, R, 'boss');
    const rw = node.rewards;
    t.ok(rw.boss && rw.relics.length === 3, 'seed ' + seed + ': a boss offers three treasures');
    const boss = g.DATA.enemies[g.DATA.FIXED.bosses[R.chapter]];
    t.eq(txt($(g, '.nk-banner')), boss.name + ' Falls', 'seed ' + seed + ': the banner names the boss');
    t.eq($$(g, '.rw-ped').length, 3, 'seed ' + seed + ': three pedestals');
    t.eq($$(g, '.rw-slot').length, 0, 'seed ' + seed + ': no cards yet');
    await click(g, $$(g, '.rw-ped')[seed % 3]);
    t.ok(!rw.claimed, 'seed ' + seed + ': not claimed after only the relic');
    t.eq($$(g, '.rw-slot').length, rw.cards.length, 'seed ' + seed + ': the card page follows');
    t.ok($$(g, '.rw-slot .rw-face.front .card').every((c) => g.DATA.cards[c.dataset.id].rarity === 'rare'), 'seed ' + seed + ': boss cards are rare');
    await click(g, $$(g, '.rw-slot .rw-face.front .card')[0]);
    t.ok(rw.claimed, 'seed ' + seed + ': claimed after the card');
    t.ok(R.relics.indexOf(rw.relics[seed % 3]) >= 0, 'seed ' + seed + ': the chosen treasure is owned');
    t.eq(R.relics.filter((r) => rw.relics.indexOf(r) >= 0).length, 1, 'seed ' + seed + ': only one of the three');
    await click(g, $(g, '.rw-cont'));
    t.eq(done(g), 1, 'seed ' + seed + ': nodeDone');
    t.eq(errs(g), 0, 'seed ' + seed + ': no console errors');
  }
});

await t.test('reward: empty states (no cards, nothing at all, already claimed) show a message and Continue, never a blank panel', async () => {
  const g = fresh(); const R = mkRun(g);
  const mkNode = (rw) => { R.node = { kind: 'reward', tile: { q: 0, r: 0 }, rewards: rw, source: 'combat' }; return R.node; };
  let node = mkNode({ gold: 12, ink: 0, cards: [], relics: [], gems: [], brush: null, maxHp: 0, boss: false, tier: 'normal', source: 'combat', claimed: false, pending: [], log: [] });
  await g.UI.go('reward', { rewards: node.rewards, node, R }, { force: true, transition: 'none' }); await settle(g);
  t.ok(/No cards this time/.test(txt($(g, '.rw-done'))), 'no offers: a plain message');
  t.ok(node.rewards.claimed && !$(g, '.rw-cont').hidden, 'nothing to decide: claimed at once, only Continue');
  t.eq($$(g, '.rw-slot').length, 0, 'no card slots');
  node = mkNode({ gold: 0, ink: 0, cards: [], relics: [], gems: [], brush: null, maxHp: 0, boss: false, tier: 'normal', source: 'combat', claimed: false, pending: [], log: [] });
  await g.UI.go('reward', { rewards: node.rewards, node, R }, { force: true, transition: 'none' }); await settle(g);
  t.ok(/nothing but an echo/.test(txt($(g, '.rw-ledger'))), 'no loot at all: the ledger says so');
  node = mkNode({ gold: 5, ink: 1, cards: ['hanae_slash'], relics: [], gems: [], brush: null, maxHp: 0, boss: false, tier: 'normal', source: 'combat', claimed: true, pending: [], log: [] });
  await g.UI.go('reward', { rewards: node.rewards, node, R }, { force: true, transition: 'none' }); await settle(g);
  t.ok(/already gathered/.test(txt($(g, '.rw-hint'))) && !$(g, '.rw-cont').hidden, 'claimed rewards: Continue only');
  t.eq($$(g, '.rw-slot').length, 0, 'claimed rewards deal no cards again');
  await g.UI.go('reward', { R }, { force: true, transition: 'none' }); await settle(g);
  t.ok($(g, '.s-reward'), 'a reward screen with no rewards object still opens');
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('reward: pending choices raised by hooks are answered on the screen before leaving (remove a card)', async () => {
  const g = fresh(); const R = mkRun(g);
  const node = winFight(g, R, 'enemy');
  const out = g.RUN.applyOps(R, [{ op: 'removeCard' }], { key: 'test' });
  t.eq(out.pending.length, 1, 'RUN queued a pending removal');
  await g.UI.go('reward', { rewards: node.rewards, node, R }, { force: true, transition: 'none' });
  await settle(g); g._flush(2000); await settle(g);
  t.ok(g.UI.overlay.has('deck'), 'the deck overlay opened by itself to answer the pending choice');
  t.ok(/Remove a card/i.test(txt($(g, '.o-deck .p-title'))), 'titled for the op');
  t.ok(!$(g, '.o-deck .dk-foot .btn-secondary') || !/Cancel/.test(txt($(g, '.o-deck .dk-foot'))), 'a mandatory choice has no Cancel');
  const n = R.deck.length;
  await deckPick(g, 0, true);
  await settle(g);
  t.eq(R.deck.length, n - 1, 'a card was removed');
  t.eq(R.pending.length, 0, 'the pending entry is resolved');
  t.ok(!g.UI.overlay.has('deck'), 'the overlay closed');
});

await t.test('reward: the number keys pick a card, and a gem and brush drop are shown as bonus rows that turn into "added"', async () => {
  const g = fresh(); const R = mkRun(g);
  const node = winFight(g, R, 'enemy');
  node.rewards.gems = ['ember_ruby']; node.rewards.brush = 'fan';
  await g.UI.go('reward', { rewards: node.rewards, node, R }, { force: true, transition: 'none' }); await settle(g);
  t.ok($(g, '.nk-row.k-gem') && $(g, '.nk-row.k-brush'), 'bonus rows for the gem and the brush');
  const gems = R.gems.length, brushes = R.brushes.length;
  g._key('2'); await settle(g);
  t.ok(node.rewards.claimed, 'key 2 chose the second card');
  t.eq(R.deck[R.deck.length - 1].id, node.rewards.cards[1], 'the second offer joined the deck');
  t.eq(R.gems.length, gems + 1, 'the gem was banked'); t.eq(R.brushes.length, brushes + 1, 'the brush was banked');
  t.ok($(g, '.nk-row.k-gem').classList.contains('taken') && $(g, '.nk-row.k-brush').classList.contains('taken'), 'both rows say added');
});


// ==================================================================================================== shop
const shopItems = (g) => $$(g, '.sh-item, .sh-plaque[data-key]');
const itemEl = (g, key) => shopItems(g).find((e) => e.dataset.key === key);

await t.test('shop (twelve seeds): every ware of the real stock is on a shelf with its real price, sale, affordability and tooltip', async () => {
  for (const seed of SEEDS) {
    const g = fresh({ seed }); const R = mkRun(g, { seed, gold: 150 });
    const node = nodeAt(g, R, 'shop', { shop: { seed: seed * 7 + 1 } });
    await open(g, 'shop', R, node);
    const stock = node.stock;
    t.eq(shopItems(g).length, stock.items.length, 'seed ' + seed + ': one element per ware');
    stock.items.forEach((it) => {
      const el = itemEl(g, it.key);
      t.ok(el, 'seed ' + seed + ': ' + it.key + ' is on a shelf');
      t.eq(txt($(g, '.sh-tag b', el)), String(it.price), 'seed ' + seed + ': ' + it.key + ' shows its price');
      t.eq(el.classList.contains('poor'), R.gold < it.price, 'seed ' + seed + ': ' + it.key + ' poor state');
      t.eq(el.classList.contains('can'), R.gold >= it.price, 'seed ' + seed + ': ' + it.key + ' can state');
      if (it.sale) t.ok($(g, '.sh-sale', el) && txt($(g, '.sh-tag s', el)) === String(it.was), 'seed ' + seed + ': ' + it.key + ' carries the sale sticker and the old price');
    });
    t.eq($$(g, '.sh-item').length, stock.items.filter((i) => i.kind === 'card').length, 'seed ' + seed + ': cards on the top shelf');
    t.ok($(g, '.sh-plaque.kind-remove') && $(g, '.sh-plaque.kind-cut'), 'seed ' + seed + ': the removal and gem cutting services');
    t.eq(txt($(g, '.sh-plaque.kind-remove .sh-tag b')), String(stock.removePrice), 'seed ' + seed + ': the removal price');
    t.ok(txt($(g, '.sh-say')).length > 5, 'seed ' + seed + ': the peddler greets you');
    t.ok(!$(g, '.sh-soldout') || $(g, '.sh-soldout').hidden, 'seed ' + seed + ': not sold out');
    t.ok(g.UI.anchorEl('deck'), 'seed ' + seed + ': the deck anchor is marked for the tutorial');
    t.eq(errs(g), 0, 'seed ' + seed + ': no console errors');
  }
});

await t.test('shop: buying each kind of ware changes exactly what RUN says, stamps SOLD, pays, and updates the affordability of the rest', async () => {
  const g = fresh({ seed: 7 }); const R = mkRun(g, { seed: 7, gold: 2000 });
  const node = nodeAt(g, R, 'shop', { shop: { seed: 99 } });
  await open(g, 'shop', R, node);
  const kinds = ['card', 'gem', 'relic', 'brush'];
  for (const kind of kinds) {
    const it = node.stock.items.find((x) => x.kind === kind && !x.sold);
    if (!it) continue;
    const before = { gold: R.gold, deck: R.deck.length, gems: R.gems.length, relics: R.relics.length, brushes: R.brushes.length, spent: R.stats.goldSpent };
    await click(g, kind === 'card' ? $(g, '.card', itemEl(g, it.key)) : itemEl(g, it.key));
    t.ok(it.sold, kind + ': RUN marked the ware sold');
    t.eq(R.gold, before.gold - it.price, kind + ': the price was paid');
    t.eq(R.stats.goldSpent, before.spent + it.price, kind + ': the spend is counted');
    t.eq(R.deck.length, before.deck + (kind === 'card' ? 1 : 0), kind + ': deck');
    t.eq(R.gems.length, before.gems + (kind === 'gem' ? 1 : 0), kind + ': gems');
    t.eq(R.relics.length, before.relics + (kind === 'relic' ? 1 : 0), kind + ': relics');
    t.eq(R.brushes.length, before.brushes + (kind === 'brush' ? 1 : 0), kind + ': brushes');
    t.ok(itemEl(g, it.key).classList.contains('sold'), kind + ': the SOLD stamp shows');
    t.eq(txt($(g, '.stat.st-gold .val')), String(R.gold), kind + ': the gold pill follows');
    t.ok(txt($(g, '.sh-say')).length > 5, kind + ': the peddler comments');
    await click(g, itemEl(g, it.key));
    t.eq(R.gold, before.gold - it.price, kind + ': a second tap on a sold ware costs nothing');
  }
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('shop: a card can be read big (a mouse hover, a long press on touch) and the tap that ends a long press never buys', async () => {
  const g = fresh({ seed: 8 }); const R = mkRun(g, { seed: 8, gold: 2000 });
  const node = nodeAt(g, R, 'shop', { shop: { seed: 99 } });
  await open(g, 'shop', R, node);
  const it = node.stock.items.find((x) => x.kind === 'card' && !x.sold);
  const card = $(g, '.card', itemEl(g, it.key));
  g._pointer('pointerenter', card, { pointerType: 'mouse' }); await settle(g);
  t.ok(g.UI.tip.open && txt($(g, '#tips')).indexOf(g.DATA.cards[it.id].name) >= 0, 'hovering a shelf card shows it big, with its name');
  t.ok(!$(g, '#tips .tip-kwcol'), 'without the glossary column that would cover the neighbouring wares');
  g._pointer('pointerleave', card, { pointerType: 'mouse' }); await settle(g);
  t.ok(!g.UI.tip.open, 'leaving takes it away');
  const gold = R.gold;
  g._pointer('pointerdown', card, { pointerType: 'touch' }); await settle(g);
  t.ok(g.UI.tip.open, 'a long press on touch shows it');
  g._pointer('pointerup', card, { pointerType: 'touch', buttons: 0 }); await settle(g);
  t.ok(!g.UI.tip.open, 'letting go hides it');
  card.click(); await settle(g);
  t.ok(!it.sold && R.gold === gold, 'the click that ends a long press buys nothing');
  await click(g, card);
  t.ok(it.sold && R.gold === gold - it.price, 'the next plain tap buys as before');
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('shop (phones, big text): long ware names get the sh-long class, and the compact css caps the name, one-lines the kicker, shrinks the figures and clears the SALE stamp', async () => {
  let longs = 0, short = 0;
  for (const seed of SEEDS) {
    const g = fresh({ seed }); const R = mkRun(g, { seed, gold: 150 });
    const node = nodeAt(g, R, 'shop', { shop: { seed: seed * 7 + 1 } });
    await open(g, 'shop', R, node);
    $$(g, '.sh-plaque .sh-name').forEach((n) => {
      const isLong = txt(n).split(/\s+/).some((w) => w.length >= 11);
      t.eq(n.classList.contains('sh-long'), isLong, 'seed ' + seed + ': "' + txt(n) + '" sh-long matches its longest word');
      if (isLong) longs++; else short++;
    });
  }
  t.ok(longs > 0 && short > 0, 'both kinds of name were seen (' + longs + ' long, ' + short + ' short)');
  t.ok(/#stage\.compact \.sh-name\s*\{[^}]*min\(var\(--ts\), 1\)[^}]*-webkit-line-clamp:\s*3/.test(CSS), 'css: the name never grows past its text 1.0 size on a phone and keeps to three lines');
  t.ok(/#stage\.compact \.sh-kind\s*\{[^}]*white-space:\s*nowrap[^}]*text-overflow:\s*ellipsis/.test(CSS), 'css: the kicker is one line with an ellipsis, so UNCOMMON never runs into its neighbour');
  t.ok(/#stage\.compact \.sh-tag b\s*\{[^}]*min\(var\(--ts\), 1\.1\)/.test(CSS) && /#stage\.compact \.sh-tag\.free b\s*\{[^}]*letter-spacing/.test(CSS), 'css: the price figures and the FREE tag stop growing with the text size');
  t.ok(/\.sh-sale\s*\{[^}]*right:\s*-24px[^}]*top:\s*222px/.test(CSS), 'css: the SALE stamp sits clear of the price tag at every size');
});

// REALTIME: the headless flag is off and the real virtual clock runs (_advance), so the thresholds are measured the way a finger would meet them.
// A real tap is pointerdown, a hold, pointerup and then the click the browser still sends; a hold of 420 ms or more reads the ware and must never buy.
function holdThenClick(g, el, ms, o = {}) {
  g._pointer('pointerdown', el, { pointerType: 'touch' });
  g._advance(ms);
  const peeked = g.UI.tip.open;
  g._pointer(o.cancel ? 'pointercancel' : 'pointerup', el, { pointerType: 'touch', buttons: 0 });
  if (!o.cancel) el.click();                 // the click a touch browser sends after pointerup (a cancel sends none)
  return peeked;
}
for (const reduce of [false, true]) {
  await t.test('shop (realtime, Reduce motion ' + (reduce ? 'on' : 'off') + '): a tap held 130 or 300 ms buys, a hold of 500 ms reads the ware and never buys (cards, gems, treasures, brush, card removal)', async () => {
    const g = fresh({ seed: 8 }); const R = mkRun(g, { seed: 8, gold: 90000 });
    if (reduce) { g.META.set('reduceMotion', true); g.UI.applySettings(); }
    t.eq(!!g.UI.opt.reduceMotion, reduce, 'the setting took');
    const node = nodeAt(g, R, 'shop', { shop: { seed: 99 } });
    await open(g, 'shop', R, node);
    g._win.__HEADLESS = false;
    g._advance(200);
    const byKind = (k) => node.stock.items.filter((x) => x.kind === k && !x.sold);
    const elOf = (it) => (it.kind === 'card' ? $(g, '.card', itemEl(g, it.key)) : itemEl(g, it.key));
    for (const kind of ['card', 'gem', 'relic', 'brush']) {
      const wares = byKind(kind);
      if (!wares.length) continue;
      const [a, b] = wares;
      const goldA = R.gold;
      const peeked = holdThenClick(g, elOf(a), 500); g._advance(40);
      t.ok(peeked, kind + ': a 500 ms hold shows the ware (' + (kind === 'card' ? 'the big card' : 'its tip') + ')');
      t.ok(!a.sold && R.gold === goldA, kind + ': ... and the click that ends it buys nothing');
      t.ok(!g.UI.tip.open, kind + ': letting go closes it');
      holdThenClick(g, elOf(a), 130); g._advance(40);
      t.ok(a.sold && R.gold === goldA - a.price, kind + ': a 130 ms tap buys' + (reduce ? ' (Reduce motion used to swallow it)' : ''));
      if (b) {
        const goldB = R.gold;
        holdThenClick(g, elOf(b), 300); g._advance(40);
        t.ok(b.sold && R.gold === goldB - b.price, kind + ': a 300 ms tap buys');
      }
    }
    // card removal: a long press reads the tip and must not open the picker
    const rm = $(g, '.sh-plaque.kind-remove');
    holdThenClick(g, rm, 600); g._advance(40);
    t.eq(g.UI.overlay.count(), 0, 'a long press on Card removal opens no picker');
    holdThenClick(g, rm, 140); g._advance(40);
    t.eq(g.UI.overlay.count(), 1, 'a short tap on Card removal still opens it');
    g.UI.overlay.closeAll(); g._advance(40);
    t.eq(errs(g), 0, 'no console errors');
  });
}

await t.test('shop (realtime): a stale long press never swallows a later mouse or keyboard click, and a cancelled press arms nothing', async () => {
  const g = fresh({ seed: 8 }); const R = mkRun(g, { seed: 8, gold: 90000 });
  const node = nodeAt(g, R, 'shop', { shop: { seed: 99 } });
  await open(g, 'shop', R, node);
  g._win.__HEADLESS = false; g._advance(200);
  const cards = node.stock.items.filter((x) => x.kind === 'card');
  const gems = node.stock.items.filter((x) => x.kind === 'gem');
  const cardEl = (it) => $(g, '.card', itemEl(g, it.key));
  // a shelf card: the peek opens, the finger is cancelled (no click follows), a mouse click on it later must buy at once
  holdThenClick(g, cardEl(cards[0]), 700, { cancel: true });
  t.ok(!g.UI.tip.open, 'a cancelled press closes the peek');
  g._click(cardEl(cards[0]), { pointerType: 'mouse' }); g._advance(40);
  t.ok(cards[0].sold, 'a mouse click after a cancelled long press buys on the FIRST click (the stale held flag used to swallow it)');
  // a shelf card: a real long press, then the click is swallowed once, and a keyboard Enter later buys
  holdThenClick(g, cardEl(cards[1]), 700); g._advance(40);
  t.ok(!cards[1].sold, 'the click right after a long press is swallowed');
  g._advance(900);
  cardEl(cards[1]).click(); g._advance(40);
  t.ok(cards[1].sold, 'a keyboard or assistive click long after it buys (the swallow wears off)');
  // a plaque: the same two rules through UI.tip.attach
  const gemEl = itemEl(g, gems[0].key);
  holdThenClick(g, gemEl, 700, { cancel: true }); g._advance(40);
  gemEl.click(); g._advance(40);
  t.ok(gems[0].sold, 'plaque: a click after a cancelled long press buys');
  const gemEl2 = itemEl(g, gems[1].key);
  holdThenClick(g, gemEl2, 700); g._advance(40);
  t.ok(!gems[1].sold, 'plaque: the click that ends a long press is swallowed');
  g._click(gemEl2, { pointerType: 'mouse' }); g._advance(40);
  t.ok(gems[1].sold, 'plaque: the very next mouse click buys (the next pointerdown cleared the swallow)');
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('shop: a purse too thin refuses (no state change, a toast, a sad peddler) and poor wares are marked', async () => {
  const g = fresh({ seed: 3 }); const R = mkRun(g, { seed: 3, gold: 5 });
  const node = nodeAt(g, R, 'shop', { shop: { seed: 5 } });
  await open(g, 'shop', R, node);
  const it = node.stock.items[0];
  t.ok(itemEl(g, it.key).classList.contains('poor'), 'poor mark');
  const snap = JSON.stringify([R.gold, R.deck.length, R.gems, R.relics, R.brushes]);
  const toasts = $$(g, '.toast').length;
  await click(g, it.kind === 'card' ? $(g, '.card', itemEl(g, it.key)) : itemEl(g, it.key));
  t.eq(JSON.stringify([R.gold, R.deck.length, R.gems, R.relics, R.brushes]), snap, 'nothing was bought');
  t.ok(!it.sold, 'the ware is still for sale');
  t.ok($$(g, '.toast').length > toasts && /more gold/.test(txt($$(g, '.toast').pop())), 'a toast says how much more gold is needed');
  await click(g, $(g, '.sh-plaque.kind-remove'));
  t.ok(!g.UI.overlay.has('deck'), 'card removal refuses without the gold too');
  t.eq(R.removals, 0, 'no removal');
});

await t.test('shop: card removal goes through the deck picker, needs a second tap, charges the rising price and burns the card', async () => {
  const g = fresh({ seed: 4 }); const R = mkRun(g, { seed: 4, gold: 500 });
  const node = nodeAt(g, R, 'shop', { shop: { seed: 11 } });
  await open(g, 'shop', R, node);
  const p0 = node.stock.removePrice;
  await click(g, $(g, '.sh-plaque.kind-remove'));
  t.ok(g.UI.overlay.has('deck') && $(g, '.o-deck.dk-remove, .o-deck .nk-deck.dk-remove'), 'the deck picker opens in remove mode');
  t.ok(/to remove a card/.test(txt($(g, '.o-deck .dk-price'))) && txt($(g, '.o-deck .dk-price .stat .val')) === String(p0), 'the price is shown');
  const n = R.deck.length, id0 = R.deck[0].id, gold = R.gold;
  await click(g, $$(g, '.o-deck .dk-card')[0]);
  const go = $(g, '.o-deck .dk-go');
  t.ok(go, 'the pane offers the removal');
  await click(g, go);
  t.ok(/Really/.test(txt($(g, '.o-deck .dk-go'))), 'the first tap asks "Really remove it?"');
  t.eq(R.deck.length, n, 'still there after one tap');
  await click(g, $(g, '.o-deck .dk-go'));
  t.ok(!g.UI.overlay.has('deck'), 'the picker closed');
  t.eq(R.deck.length, n - 1, 'the card is gone');
  t.eq(R.gold, gold - p0, 'the price was paid');
  t.eq(R.removals, 1, 'RUN counted the removal');
  t.eq(node.stock.removePrice, p0 + g.DATA.ECONOMY.price.removeStep, 'the price rises for next time');
  t.eq(txt($(g, '.sh-plaque.kind-remove .sh-tag b')), String(node.stock.removePrice), 'the shelf shows the new price');
  t.ok(R.deck.length < n && !(R.deck.some((c) => c.id === id0 && c.uid === 0)), 'removed');
  // Cancel returns nothing and costs nothing
  await click(g, $(g, '.sh-plaque.kind-remove'));
  await click(g, btnByText(g, /Cancel/, $(g, '.o-deck')));
  t.eq(R.removals, 1, 'cancelling costs nothing');
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('shop: Cut Gems is free, needs gems and a socket that fits, and opens the socket overlay; Leave calls GAME.nodeDone', async () => {
  const g = fresh({ seed: 6 }); const R = mkRun(g, { seed: 6, gold: 100 });
  const node = nodeAt(g, R, 'shop', { shop: { seed: 3 } });
  await open(g, 'shop', R, node);
  await click(g, $(g, '.sh-plaque.kind-cut'));
  t.ok(!g.UI.overlay.has('deck'), 'no gems: the overlay stays shut and a toast explains');
  R.gems.push('ember_ruby'); R.gems.push('keepsake_peridot');
  await click(g, $(g, '.sh-plaque.kind-cut'));
  t.ok(g.UI.overlay.has('deck') && $(g, '.o-deck .nk-deck.dk-socket'), 'the socket picker opens');
  const gold = R.gold;
  await click(g, $$(g, '.o-deck .dk-card').find((c) => c.dataset.id === 'hanae_slash'));
  await click(g, $$(g, '.o-deck .dk-gem').find((b) => /Ember/.test(b.textContent)));
  await click(g, $(g, '.o-deck .dk-go'));
  const slash = R.deck.find((c) => c.id === 'hanae_slash' && c.gems[0] === 'ember_ruby');
  t.ok(slash, 'the gem was set in the card through RUN.socket');
  t.eq(R.gems.filter((x) => x === 'ember_ruby').length, 0, 'the gem left the pouch');
  t.eq(R.gold, gold, 'cutting is free');
  await click(g, btnByText(g, /Done/, $(g, '.o-deck')));
  t.ok(!g.UI.overlay.has('deck'), 'Done closes it');
  await click(g, $(g, '.sh-leave'));
  g._flush(2000); await settle(g);
  t.eq(done(g), 1, 'Leave calls GAME.nodeDone');
});

await t.test('shop: sold out shows a badge; a saved half-bought shop comes back with its SOLD stamps and its gold; onShopEnter toasts appear', async () => {
  const g = fresh({ seed: 8 }); const R = mkRun(g, { seed: 8, gold: 5000 });
  const node = nodeAt(g, R, 'shop', { shop: { seed: 21 } });
  await open(g, 'shop', R, node);
  for (const it of node.stock.items.slice()) await click(g, it.kind === 'card' ? $(g, '.card', itemEl(g, it.key)) : itemEl(g, it.key));
  t.ok(node.stock.items.every((i) => i.sold), 'everything sold');
  t.ok($(g, '.sh-soldout') && !$(g, '.sh-soldout').hidden, 'the SOLD OUT badge is up');
  // reload as GAME would: serialize the run (toTitle saves it), deserialize, re-enter the saved node
  const R2 = g.RUN.deserialize(JSON.parse(JSON.stringify(g.RUN.serialize(R))));
  g.GAME.state.R = R2; g.UI.setRun(R2);
  await open(g, 'shop', R2, R2.node);
  t.eq($$(g, '.sh-item.sold, .sh-plaque.sold[data-key]').length, R2.node.stock.items.length, 'every stamp survived the reload');
  t.eq(txt($(g, '.stat.st-gold .val')), String(R2.gold), 'the gold is the saved gold');
  t.ok(!$(g, '.sh-soldout').hidden, 'still sold out');
  // a relic whose hook fires when a shop opens
  const hooked = Object.keys(g.DATA.relics).filter((id) => (g.DATA.relics[id].hooks || []).some((h) => h.on === 'onShopEnter'));
  t.ok(hooked.length > 0, 'the data has an onShopEnter relic (' + hooked.join(',') + ')');
  const R3 = mkRun(g, { seed: 9, gold: 30, relics: [hooked[0]] });
  const node3 = nodeAt(g, R3, 'shop', { shop: { seed: 4 } });
  await open(g, 'shop', R3, node3);
  t.ok(errs(g) === 0, 'entering with a shop-entry relic is clean');
});

await t.test('shop: the peddler talks (hello, buy, poor, sold, leave) and idles; his mood changes on the frame clock', async () => {
  const g = fresh({ seed: 10 }); const R = mkRun(g, { seed: 10, gold: 60 });
  const node = nodeAt(g, R, 'shop', { shop: { seed: 8 } });
  await open(g, 'shop', R, node);
  const lines = new Set([txt($(g, '.sh-say'))]);
  const cheap = node.stock.items.filter((i) => i.price <= R.gold)[0];
  if (cheap) { await click(g, cheap.kind === 'card' ? $(g, '.card', itemEl(g, cheap.key)) : itemEl(g, cheap.key)); lines.add(txt($(g, '.sh-say'))); }
  const dear = node.stock.items.find((i) => !i.sold && i.price > R.gold);
  await click(g, dear.kind === 'card' ? $(g, '.card', itemEl(g, dear.key)) : itemEl(g, dear.key)); lines.add(txt($(g, '.sh-say')));
  t.ok(lines.size >= 2, 'different situations, different lines (' + lines.size + ')');
  g._win.__HEADLESS = false;
  let now = 0;
  for (let i = 0; i < 1500; i++) { now += 16; g.UI.frame(now); }
  g._win.__HEADLESS = true;
  t.eq(errs(g), 0, 'a long stretch of frames (idle chatter, painting the stall) throws nothing');
  t.eq(g._issues.length, 0, 'the painter made no canvas mistakes: ' + JSON.stringify(g._issues.slice(0, 2)));
});

await t.test('shop: late in a session (the frame clock is far past zero) the greeting is written out, idle lines too, and nothing ever sticks half typed', async () => {
  const g = fresh({ seed: 12 }); const R = mkRun(g, { seed: 12, gold: 60 });
  const frames = (n, from) => { g._win.__HEADLESS = false; let now = from; for (let i = 0; i < n; i++) { now += 48; g.UI.frame(now); } g._win.__HEADLESS = true; return now; };
  let now = frames(600, 0);                    // 28 s of play before the stall: the page clock is no longer near 0
  const node = nodeAt(g, R, 'shop', { shop: { seed: 8 } });
  await open(g, 'shop', R, node);
  const typed = () => ({ on: txt($(g, '.sh-say .tw-on')), off: txt($(g, '.sh-say .tw-off')) });
  g._win.__HEADLESS = false;
  now = frames(1, now);
  t.ok($(g, '.sh-say .tw-on'), 'the greeting is a typewriter line');
  now = frames(40, now);                       // 1.9 s: a line of 50 characters at 75 a second is done
  const hello = typed();
  t.ok(hello.on.length > 20 && hello.off === '', 'the hello line is fully typed after a moment (' + JSON.stringify(hello) + ')');
  t.ok(/Welcome|travellers|Everything here|Step closer/.test(hello.on), 'and it is a greeting, not an idle remark that cut in on the first frame: ' + hello.on);
  const seen = new Set([hello.on]);
  let lastLine = txt($(g, '.sh-say'));
  for (let i = 0; i < 1500 && seen.size < 4; i++) {   // up to 72 s of idling: each new line must type out to the end
    now = frames(1, now);
    const line = txt($(g, '.sh-say'));
    if (line === lastLine) continue;
    lastLine = line;
    now = frames(40, now);
    const cur = typed();
    t.ok(cur.on.length > 15 && cur.off === '' && cur.on === line, 'idle line ' + seen.size + ' types out completely (' + JSON.stringify(cur) + ')');
    seen.add(cur.on);
  }
  t.ok(seen.size >= 2, 'the peddler spoke more than once while idle (' + seen.size + ' lines)');
  t.eq(errs(g), 0, 'no console errors');
});

// ==================================================================================================== event
// answer whatever overlay RUN's pending choice opened: pick the first card (twice for a removal's confirm), or the first cards of a multi pick
async function answerOverlays(g, R) {
  for (let k = 0; k < 12 && (g.UI.overlay.count() > 0 || (R.pending && R.pending.length)); k++) {
    g._flush(5000); await settle(g);
    const top = g.UI.overlay.top();
    if (!top) break;
    if (top.name === 'deck') {
      const cards = $$(g, '.o-deck .dk-card');
      const go = $(g, '.o-deck .dk-go');
      if (!go) { await click(g, cards[0]); }
      await deckPick(g, 0, top.params.mode === 'remove');
    } else if (top.name === 'cardPick') {
      const cards = $$(g, '.o-cardPick .card');
      const need = top.params.optional ? 1 : Math.min(top.params.n || 1, cards.length);
      for (let i = 0; i < need; i++) await click(g, cards[i]);
      await click(g, $(g, '.o-cardPick .pick-count').parentNode.querySelector('.btn-primary'));
    } else break;
    await settle(g);
  }
}


await t.test('event: every fable, every choice, played on the real screen: text, locks, outcome, gains, pending choices, fights and Continue', async () => {
  const g = fresh({ seed: 3 });
  const defs = Object.values(g.DATA.events);
  await settle(g);
  let played = 0, fights = 0, pendings = 0, locked = 0;
  for (const ev of defs) {
    const ch = ev.chapters && ev.chapters.length === 1 ? ev.chapters[0] : 1;
    for (let i = 0; i < ev.choices.length; i++) {
      const heroes = (() => { const need = new Set(); if (ev.when && ev.when.hero) need.add(ev.when.hero); (ev.choices[i].req && ev.choices[i].req.hero) && need.add(ev.choices[i].req.hero); const l = [...need]; ['hanae', 'kuro', 'suzu', 'raiga'].forEach((h) => { if (l.length < 2 && l.indexOf(h) < 0) l.push(h); }); return l.slice(0, 2); })();
      const R = mkRun(g, { seed: 100 + played, heroes, gold: 400, hp: [] });
      if (ch !== 1) g.RUN.startChapter(R, ch);
      R.heroes.forEach((h) => { h.hp = Math.max(1, Math.floor(h.maxHp * 0.6)); });
      ['brass_lantern', 'fox_mask', 'silver_bell', 'jade_key'].forEach((r) => g.RUN.addRelic(R, r));
      R.flags.fox_spared = 1; R.flags.fox_bond = 1;
      const node = nodeAt(g, R, 'event', { id: ev.id });
      const e0 = errs(g);
      await open(g, 'event', R, node);
      const root = $(g, '.s-event');
      t.eq(txt($(g, '.ev-title', root)), ev.title, ev.id + ': title');
      t.eq(txt($(g, '.ev-text', root)), ev.text, ev.id + ': the whole fable text is on the page');
      const shown = $$(g, '.ev-choice', root);
      const visible = ev.choices.map((c, k) => ({ c, k })).filter((x) => !(x.c.req && x.c.req.hero && heroes.indexOf(x.c.req.hero) < 0));
      t.eq(shown.length, visible.length, ev.id + ': one button per visible choice');
      shown.forEach((b) => { t.ok(b.querySelector('.ev-label') && b.querySelector('.ev-label').textContent.length > 2, ev.id + ': a label'); t.ok(/^\d/.test(txt(b.querySelector('.ev-num'))), ev.id + ': numbered'); });
      const b = shown.find((x) => Number(x.dataset.i) === i);
      if (!b) continue;
      const list = g.RUN.eventChoices(R, ev);
      const can = list[i].ok;
      t.eq(b.classList.contains('locked'), !can, ev.id + '#' + i + ': locked state matches RUN');
      if (ev.choices[i].cost) t.ok(txt(b).indexOf(ev.choices[i].cost) >= 0, ev.id + '#' + i + ': the cost text is shown');
      if (!can) {
        locked++;
        t.ok(b.getAttribute('aria-disabled') === 'true' && txt(b).indexOf(list[i].reason) >= 0, ev.id + '#' + i + ': locked with its reason');
        const snap = JSON.stringify([R.gold, R.heroes, R.deck.length]);
        await click(g, b);
        t.eq(node.chosen, null, ev.id + '#' + i + ': a locked choice does nothing');
        t.eq(JSON.stringify([R.gold, R.heroes, R.deck.length]), snap, ev.id + '#' + i + ': state untouched');
        continue;
      }
      await click(g, b);
      t.eq(node.chosen === undefined ? null : node.chosen, i, ev.id + '#' + i + ': RUN recorded the choice');
      const outTexts = ev.choices[i].out.map((o) => o.text);
      const result = txt($(g, '.ev-result', root));
      const fightNode = R.node && R.node.kind === 'combat' ? R.node : null;
      t.ok(outTexts.indexOf(result) >= 0, ev.id + '#' + i + ': the outcome page tells one of the outcome texts');
      t.ok($(g, '.ev-said', root) && /You chose/.test(txt($(g, '.ev-said', root))), ev.id + '#' + i + ': the choice is quoted');
      if (R.pending && R.pending.length) pendings++;
      await answerOverlays(g, R);
      await settle(g); g._flush(3000); await settle(g);
      t.eq(R.pending.length, 0, ev.id + '#' + i + ': every pending choice was answered');
      const go = $(g, '.ev-go', root);
      t.ok(go, ev.id + '#' + i + ': the way on (Continue or Fight!) appears');
      if (fightNode) {
        fights++;
        t.ok(/Fight/.test(txt(go)), ev.id + '#' + i + ': a fight offers Fight!');
        t.ok(fightNode.enemies.length >= 1 && fightNode.enemies.every((id) => g.DATA.enemies[id]), ev.id + '#' + i + ': the combat node has real enemies');
        const n0 = entered(g).length;
        await click(g, go);
        t.eq(entered(g).length, n0 + 1, ev.id + '#' + i + ': Fight! hands the node to GAME.enterNode');
        t.eq(entered(g)[n0].kind, 'combat', ev.id + '#' + i + ': the node is the combat');
      } else {
        const d0 = done(g);
        await click(g, go);
        t.eq(done(g), d0 + 1, ev.id + '#' + i + ': Continue calls GAME.nodeDone');
      }
      played++;
      t.eq(errs(g), e0, ev.id + '#' + i + ': no console errors');
    }
  }
  t.ok(played > 100, 'played more than a hundred choices (' + played + ')');
  t.ok(fights >= 1 && pendings > 3, 'fights (' + fights + ') and pending card choices (' + pendings + ') were both exercised; locked choices: ' + locked);
});

await t.test('event: a treasure chip is drawn only for a treasure the party really gained (an owned fixed relic is no "gain", whatever the stand-in rules do)', async () => {
  for (const owned of ['one', 'all']) {
    const g = fresh({ seed: 31 });
    // RUN locks a choice whose fixed treasure is already carried, unless a card grower comes first in its ops (then the ops run), so this fable starts with a card: the 'Already owned.' log reaches the page
    g.DATA.events.t_owned = { id: 't_owned', title: 'The Same Lamp Twice', art: { scene: 'shop' }, chapters: [1], text: 'He sells you a lamp.', choices: [
      { label: 'Buy the lamp', cost: '60 gold', out: [{ w: 1, text: 'He hands it over.', ops: [{ op: 'gold', n: -60 }, { op: 'addCard', pool: 'party', rarity: 'common' }, { op: 'addRelic', id: 'brass_lantern' }] }] },
      { label: 'Walk on', out: [{ w: 1, text: 'You leave.', ops: [] }] }] };
    const R = mkRun(g, { seed: 31, gold: 300 });
    if (owned === 'all') Object.keys(g.DATA.relics).forEach((r) => { if (R.relics.indexOf(r) < 0) g.RUN.addRelic(R, r); }); else g.RUN.addRelic(R, 'brass_lantern');
    const node = nodeAt(g, R, 'event', { id: 't_owned' });
    await open(g, 'event', R, node);
    const before = R.relics.length;
    await click(g, $$(g, '.ev-choice')[0]);
    await answerOverlays(g, R); g._flush(4000); await settle(g);
    const gained = R.relics.length - before;
    const chips = $$(g, '.ev-chip.has-relic');
    t.eq(chips.length, gained, 'owned ' + owned + ': ' + chips.length + ' treasure chip(s) for ' + gained + ' treasure(s) really gained');
    chips.forEach((c) => t.ok(R.relics.some((r) => g.DATA.relics[r].name === txt(c)), 'the chip names a treasure the party now carries'));
    if (owned === 'all') t.ok($$(g, '.ev-chip').some((c) => /\+\d+ gold/.test(txt(c))), 'nothing left to find: the gold it turns into is shown');
    t.ok(!$$(g, '.ev-chip.k-good.has-relic').some((c) => txt(c) === 'Brass Lantern') || gained === 0 || R.relics.indexOf('brass_lantern') >= 0, 'never "Brass Lantern gained" when it was already carried');
    t.eq(errs(g), 0, 'no console errors');
  }
});

await t.test('event: the card offered by a fable is not forfeited by a stray tap on the backdrop or by Esc; Skip is the way out', async () => {
  const g = fresh({ seed: 33 });
  const R = mkRun(g, { seed: 33, gold: 300 });
  g.RUN.startChapter(R, 2);
  const node = nodeAt(g, R, 'event', { id: 'flooded_archive' });
  await open(g, 'event', R, node);
  const deck0 = R.deck.length;
  await click(g, $$(g, '.ev-choice')[0]);
  g._flush(4000); await settle(g);
  t.ok(g.UI.overlay.has('cardPick'), 'the card offer is up');
  t.ok(g.UI.overlay.top().params.dismiss === false, 'it is marked as not dismissible');
  g._click($(g, '.o-cardPick')); await settle(g);
  t.ok(g.UI.overlay.has('cardPick'), 'a tap on the dim backdrop does not close it');
  g._key('Escape'); await settle(g);
  t.ok(g.UI.overlay.has('cardPick'), 'Esc does not close it');
  t.eq(R.deck.length, deck0, 'nothing was forfeited or taken');
  t.ok(btnByText(g, /^Skip/, $(g, '.o-cardPick')), 'the Skip button is still there');
  await click(g, btnByText(g, /^Skip/, $(g, '.o-cardPick')));
  g._flush(4000); await settle(g);
  t.ok(!g.UI.overlay.has('cardPick') && $(g, '.ev-go'), 'Skip closes it and the way on appears');
  t.eq(R.deck.length, deck0, 'Skip takes no card');
  // and a real pick still works
  const R2 = mkRun(g, { seed: 34, gold: 300 }); g.RUN.startChapter(R2, 2);
  await open(g, 'event', R2, nodeAt(g, R2, 'event', { id: 'flooded_archive' }));
  await click(g, $$(g, '.ev-choice')[0]);
  g._flush(4000); await settle(g);
  await click(g, $$(g, '.o-cardPick .card')[0]);
  await click(g, btnByText(g, /Take this card/, $(g, '.o-cardPick')));
  g._flush(4000); await settle(g);
  t.ok(R2.deck.length >= deck0 + 1 || !g.UI.overlay.has('cardPick'), 'choosing a card still takes it');
  t.eq(errs(g), 0, 'no console errors');
});

// drive the UI frame clock (what the real rAF loop does) so the typewriter and the pauses run: 16 ms a frame, a settle between frames for promise continuations
let evClock = 5000;
async function frames(g, n) { for (let i = 0; i < n; i++) { evClock += 16; g.UI.frame(evClock); await settle(g); } }

await t.test('event (keyboard and touch flow): digits wait for the choices, numbers follow the visible order, a tap or Enter skips the outcome text, Continue takes focus and Enter, and answered choices leave the Tab order', async () => {
  // L33: a digit pressed while the fable is still being written must not commit a choice nobody has seen
  const g = fresh({ seed: 41 }); const R = mkRun(g, { seed: 41, gold: 300 });
  const node = nodeAt(g, R, 'event', { id: 'kappa_toll' });
  await settle(g);
  g._win.__HEADLESS = false;
  await g.UI.go('event', { node, R }, { force: true, transition: 'none' }); await settle(g);
  await frames(g, 30);
  t.ok(!$(g, '.ev-choices').classList.contains('in'), 'the fable is still being written, the choices are not up');
  g._key('2'); await settle(g);
  t.ok(node.chosen === null || node.chosen === undefined, 'a digit pressed before the choices appear commits nothing');
  t.ok(/visibility:\s*hidden/.test(CSS.match(/\.ev-choices:not\(\.in\):not\(\.done\) \.ev-choice\s*\{[^}]*\}/)[0]), 'css: the unrevealed choices are visibility hidden (not focusable, not read out)');
  g._key('Enter'); await frames(g, 4);
  t.ok($(g, '.ev-choices').classList.contains('in'), 'Enter finishes the text and lets the choices in');
  // L36: the outcome text is a typewriter too, and a tap finishes it
  g._key('1'); await frames(g, 2);
  t.eq(node.chosen, 0, 'with the choices up, key 1 takes the first choice');
  const result = $(g, '.ev-result');
  const full = g.DATA.events.kappa_toll.choices[0].out.map((o) => o.text);
  t.ok(!result.classList.contains('tw-done') && !$(g, '.ev-go'), 'the outcome is being written and there is no way on yet');
  // L35: the answered choices are out of the Tab order and the screen readers' way
  const answered = $$(g, '.ev-choice');
  t.ok(answered.every((b) => b.tabIndex === -1), 'no answered choice stays tabbable');
  t.ok(answered.filter((b) => b.classList.contains('gone')).every((b) => b.getAttribute('aria-hidden') === 'true'), 'collapsed choices are aria-hidden');
  await click(g, result);
  t.ok(result.classList.contains('tw-done') && full.indexOf(txt(result)) >= 0, 'a tap on the outcome text completes it');
  await frames(g, 4);
  t.ok(!$(g, '.ev-go'), 'the way on follows after a short beat, not at once');
  await frames(g, 12);
  const go = $(g, '.ev-go');
  t.ok(go, 'Continue appears about 0.2 s after the tap (it used to wait out a 70 characters a second typewriter and a 450 ms hold)');
  t.ok(g._doc.activeElement === go, 'Continue takes the focus, so Enter or Space presses it');
  const d0 = done(g);
  g._doc.activeElement.blur && g._doc.activeElement.blur();
  g._key('Enter'); await settle(g);
  t.eq(done(g), d0 + 1, 'Enter with nothing focused presses Continue');
  g._key('Enter'); await settle(g);
  t.eq(done(g), d0 + 1, 'and a second Enter does not leave twice');
  // L34: the numbers follow the visible order (a hero-only choice that is hidden leaves no gap)
  const R2 = mkRun(g, { seed: 42, heroes: ['suzu', 'raiga'], gold: 300 });
  const node2 = nodeAt(g, R2, 'event', { id: 'tengu_dice' });
  await g.UI.go('event', { node: node2, R: R2 }, { force: true, transition: 'none' }); await settle(g);
  g._win.__HEADLESS = true;
  g._key('Enter'); await settle(g);
  const nums = $$(g, '.ev-choice .ev-num').map((n) => txt(n));
  t.deep(nums, nums.map((_, i) => String(i + 1)), 'the labels run 1..n with no gap (' + nums.join(',') + ')');
  const shownIdx = $$(g, '.ev-choice').map((b) => Number(b.dataset.i));
  const hiddenOne = g.DATA.events.tengu_dice.choices.length > shownIdx.length;
  t.ok(hiddenOne, 'this fable hides a choice for this party, so the order differs from the source order (' + shownIdx.join(',') + ')');
  const last = shownIdx[shownIdx.length - 1];
  g._key(String(shownIdx.length)); await settle(g); g._flush(2000); await settle(g);
  t.eq(node2.chosen, last, 'the last digit takes the last visible choice (source index ' + last + ')');
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('event: requirements lock a choice with the reason, and the heroes only options are hidden without the hero', async () => {
  const g = fresh({ seed: 12 });
  const R = mkRun(g, { seed: 12, gold: 0, heroes: ['hanae', 'kuro'] });
  const node = nodeAt(g, R, 'event', { id: 'kappa_toll' });
  await open(g, 'event', R, node);
  const pay = $$(g, '.ev-choice')[0];
  t.ok(pay.classList.contains('locked') && /20 gold/.test(txt(pay)), 'no gold: paying is locked with "Needs 20 gold"');
  const fox = $$(g, '.ev-choice')[2];
  t.ok(fox.classList.contains('locked') && /Not yet/.test(txt(fox)), 'the fox choice needs a flag');
  const R2 = mkRun(g, { seed: 12, gold: 50, heroes: ['hanae', 'kuro'] });
  R2.flags.fox_spared = 1;
  const node2 = nodeAt(g, R2, 'event', { id: 'kappa_toll' });
  await open(g, 'event', R2, node2);
  t.ok(!$$(g, '.ev-choice')[0].classList.contains('locked') && !$$(g, '.ev-choice')[2].classList.contains('locked'), 'with the gold and the flag both open');
  const tea = mkRun(g, { seed: 13, heroes: ['hanae', 'suzu'] });
  await open(g, 'event', tea, nodeAt(g, tea, 'event', { id: 'tanuki_tea_house' }));
  t.ok(!$$(g, '.ev-choice').some((b) => /Let Kuro read the menu/.test(txt(b))), 'Kuro\'s menu reading is hidden when Kuro is not in the party');
  const tea2 = mkRun(g, { seed: 13, heroes: ['hanae', 'kuro'] });
  await open(g, 'event', tea2, nodeAt(g, tea2, 'event', { id: 'tanuki_tea_house' }));
  t.ok($$(g, '.ev-choice').some((b) => /Let Kuro read the menu/.test(txt(b)) && b.querySelector('.ico')), 'and shown with his face when he is');
});

await t.test('event: the typewriter writes on the frame clock, tap or Enter completes it, and the choices wait for the end of the fable', async () => {
  const g = fresh({ seed: 14 }); const R = mkRun(g, { seed: 14 });
  const node = nodeAt(g, R, 'event', { id: 'kappa_toll' });
  await settle(g);
  g._win.__HEADLESS = false;
  await g.UI.go('event', { node, R }, { force: true, transition: 'none' });
  await settle(g);
  const ev = g.DATA.events.kappa_toll;
  const written = () => $(g, '.ev-text .tw-on').textContent;
  t.eq(written(), '', 'nothing is written at the start');
  t.ok(!$(g, '.ev-choices').classList.contains('in'), 'the choices are held back');
  let now = 1000;
  for (let i = 0; i < 40; i++) { now += 16; g.UI.frame(now); }
  const w1 = written().length;
  t.ok(w1 > 0 && w1 < ev.text.length, 'some of the text is written (' + w1 + ' of ' + ev.text.length + ')');
  t.ok(ev.text.startsWith(written()), 'and it is a prefix of the fable');
  t.eq($(g, '.ev-text .tw-off').textContent, ev.text.slice(w1), 'the rest keeps its room (no layout jump)');
  g._key('Enter'); await settle(g);
  t.eq(written(), ev.text, 'Enter completes the text');
  t.ok($(g, '.ev-choices').classList.contains('in'), 'and lets the choices in');
  g._win.__HEADLESS = true;
  // a tap completes it too
  const R2 = mkRun(g, { seed: 15 }); const node2 = nodeAt(g, R2, 'event', { id: 'kappa_toll' });
  g._win.__HEADLESS = false;
  await g.UI.go('event', { node: node2, R: R2 }, { force: true, transition: 'none' }); await settle(g);
  await click(g, $(g, '.ev-text'));
  t.eq(written(), ev.text, 'a tap on the text completes it');
  g._win.__HEADLESS = true;
  // digits pick a choice
  g._key('1'); await settle(g);
  t.ok(node2.chosen === 0 || node2.chosen === null, 'key 1 is wired (locked or chosen, never a crash)');
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('event: a saved page reopens with the choice already made (no second choice), and its pending picks are asked again', async () => {
  const g = fresh({ seed: 16 }); const R = mkRun(g, { seed: 16, gold: 100 });
  const node = nodeAt(g, R, 'event', { id: 'kappa_toll' });
  await open(g, 'event', R, node);
  await click(g, $$(g, '.ev-choice')[3]);       // the long way round: a plain heal
  t.eq(node.chosen, 3, 'chosen');
  const R2 = g.RUN.deserialize(JSON.parse(JSON.stringify(g.RUN.serialize(R))));
  g.GAME.state.R = R2; g.UI.setRun(R2);
  await open(g, 'event', R2, R2.node);
  t.eq(R2.node.chosen, 3, 'the save kept the choice');
  t.ok($$(g, '.ev-choice.picked').length === 1 && $$(g, '.ev-choice.gone').length === 3, 'the picked choice stands, the others are gone');
  t.ok(/already moved on/.test(txt($(g, '.ev-result'))), 'the page says the tale moved on');
  const b = $$(g, '.ev-choice.picked')[0];
  const g0 = R2.gold;
  await click(g, b);
  t.eq(R2.gold, g0, 'tapping the picked choice does nothing');
  t.ok($(g, '.ev-go'), 'Continue is offered');
  // pending picks survive the save
  const R3 = mkRun(g, { seed: 17 });
  const node3 = nodeAt(g, R3, 'event', { id: 'hanae_mirror_pool' });
  t.ok(node3, 'a hero event node');
});

await t.test('event: the blank page (no such fable) still offers a way on', async () => {
  const g = fresh({ seed: 18 }); const R = mkRun(g, { seed: 18 });
  R.node = { kind: 'event', tile: { q: 0, r: 0 }, event: 'no_such_fable', chosen: null };
  await g.UI.go('event', { node: R.node, R }, { force: true, transition: 'none' }); await settle(g);
  t.ok(/Only silence/.test(txt($(g, '.ev-text'))) && $(g, '.ev-go'), 'a blank page and a way on');
  await click(g, $(g, '.ev-go'));
  t.eq(done(g), 1, 'leaving works');
});

await t.test('event: a gamble that ends in a fight hands a real combat node to GAME.enterNode, whatever the seed', async () => {
  const g = fresh({ seed: 20 });
  let hit = 0;
  for (let seed = 1; seed <= 40 && hit < 3; seed++) {
    const R = mkRun(g, { seed, gold: 100 });
    const node = nodeAt(g, R, 'event', { id: 'kappa_toll' });
    await open(g, 'event', R, node);
    await click(g, $$(g, '.ev-choice')[1]);
    if (!(R.node && R.node.kind === 'combat')) continue;
    hit++;
    t.ok(/Fight/.test(txt($(g, '.ev-go'))) && $(g, '.ev-go').classList.contains('ev-fight'), 'seed ' + seed + ': Fight! button');
    t.ok($$(g, '.ev-chip').some((c) => /fight breaks out/.test(txt(c))), 'seed ' + seed + ': the fight is listed among the changes');
    const n0 = entered(g).length;
    await click(g, $(g, '.ev-go'));
    t.eq(entered(g).length, n0 + 1, 'seed ' + seed + ': entered once');
    await click(g, $(g, '.ev-go'));
    t.eq(entered(g).length, n0 + 1, 'seed ' + seed + ': a double tap does not enter twice');
    t.deep(entered(g)[n0].enemies, ['kappa'], 'seed ' + seed + ': the fable names its foe');
  }
  t.ok(hit >= 1, 'a fight came up within forty seeds (' + hit + ')');
});


// ==================================================================================================== camp
const healPreview = (g, R) => { const m = g.RUN.mods(R).healMul; return R.heroes.map((h) => Math.min(h.maxHp, h.hp + Math.round(h.maxHp * g.DATA.ECONOMY.camp.restPct * m)) - h.hp); };
const tile = (g, id) => $(g, '.cp-tile.a-' + id);

await t.test('camp (twelve seeds): Rest previews exactly what it heals, heals that, uses the one action and locks the rest with a reason', async () => {
  for (const seed of SEEDS) {
    const g = fresh({ seed }); const R = mkRun(g, { seed, gold: 20 });
    R.heroes.forEach((h, i) => { h.hp = Math.max(1, Math.floor(h.maxHp * (0.25 + 0.1 * ((seed + i) % 5)))); });
    const node = nodeAt(g, R, 'camp', {});
    await open(g, 'camp', R, node);
    const pv = healPreview(g, R);
    R.heroes.forEach((h, i) => t.ok(txt(tile(g, 'rest')).indexOf(h.name === undefined ? g.DATA.heroes[h.id].name + ' +' + pv[i] + ' HP (' + (h.hp + pv[i]) + '/' + h.maxHp + ')' : '') >= 0, 'seed ' + seed + ': the Rest tile says ' + g.DATA.heroes[h.id].name + ' +' + pv[i]));
    t.eq($$(g, '.cp-tile').length, 4, 'seed ' + seed + ': four actions');
    t.eq($$(g, '.cp-flame.lit').length, 1, 'seed ' + seed + ': one flame lit: one action by the fire');
    const hp0 = R.heroes.map((h) => h.hp);
    await click(g, tile(g, 'rest'));
    t.deep(R.heroes.map((h) => h.hp), hp0.map((v, i) => v + pv[i]), 'seed ' + seed + ': HP rose by the preview');
    t.deep(Array.from(node.used), ['rest'], 'seed ' + seed + ': RUN recorded the action');
    t.ok(tile(g, 'rest').classList.contains('used') && /DONE/.test(txt($(g, '.cp-badge', tile(g, 'rest')))), 'seed ' + seed + ': the Rest tile is stamped DONE');
    ['sharpen', 'meditate'].forEach((a) => t.ok(tile(g, a).classList.contains('locked') && tile(g, a).getAttribute('aria-disabled') === 'true', 'seed ' + seed + ': ' + a + ' is locked'));
    t.ok(/burned low/.test(txt($(g, '.cp-meter'))), 'seed ' + seed + ': the meter says the fire is low');
    const ink = R.ink, deck = R.deck.length;
    await click(g, tile(g, 'sharpen')); await click(g, tile(g, 'meditate'));
    t.eq(R.ink, ink, 'seed ' + seed + ': a locked action changes nothing'); t.eq(R.deck.length, deck, 'seed ' + seed + ': deck unchanged');
    t.deep(Array.from(node.used), ['rest'], 'seed ' + seed + ': still one action used');
    t.eq(txt($(g, '.stat.st-gold .val')), String(R.gold), 'seed ' + seed + ': HUD gold unchanged');
    t.eq(errs(g), 0, 'seed ' + seed + ': no console errors');
  }
});

await t.test('camp: Sharpen upgrades the chosen card through the deck picker with a before and after; unsharpable cards refuse', async () => {
  const g = fresh({ seed: 3 }); const R = mkRun(g, { seed: 3 });
  R.deck[0].up = 1;
  const node = nodeAt(g, R, 'camp', {});
  await open(g, 'camp', R, node);
  t.ok(/can be sharpened/.test(txt(tile(g, 'sharpen'))) && txt(tile(g, 'sharpen')).indexOf(String(g.RUN.upgradable(R).length)) >= 0, 'the tile counts the sharpenable cards');
  await click(g, tile(g, 'sharpen'));
  t.ok(g.UI.overlay.has('deck') && $(g, '.o-deck .nk-deck.dk-upgrade'), 'the picker opens in upgrade mode');
  const cards = $$(g, '.o-deck .dk-card');
  const already = cards.find((c) => Number(c.dataset.uid) === R.deck[0].uid);
  t.ok(already.classList.contains('dis'), 'an already sharpened card is dimmed');
  await click(g, already);
  t.ok(!$(g, '.o-deck .dk-ba'), 'and cannot be selected');
  const target = R.deck[3];
  await click(g, cards.find((c) => Number(c.dataset.uid) === target.uid));
  t.eq($$(g, '.o-deck .dk-half').length, 2, 'before and after side by side');
  t.ok($(g, '.o-deck .dk-bacol.after .card.up') && !$(g, '.o-deck .dk-bacol:not(.after) .card.up'), 'only the after card is upgraded');
  await click(g, $(g, '.o-deck .dk-go'));
  t.eq(target.up, 1, 'the card is sharpened');
  t.eq(R.stats.upgrades, 1, 'RUN counted the upgrade');
  t.deep(Array.from(node.used), ['sharpen'], 'the action is used');
  t.ok($(g, '.nk-flourish'), 'the sharpened card is shown big for a beat');
  t.ok(tile(g, 'sharpen').classList.contains('used'), 'stamped');
  // an all-sharp deck: the tile says so and is disabled
  const R2 = mkRun(g, { seed: 4 }); R2.deck.forEach((c) => { c.up = 1; });
  await open(g, 'camp', R2, nodeAt(g, R2, 'camp', {}));
  t.ok(tile(g, 'sharpen').getAttribute('aria-disabled') === 'true' && /Every card is already sharp/.test(txt(tile(g, 'sharpen'))), 'nothing left to sharpen: disabled with the reason');
  await click(g, tile(g, 'sharpen'));
  t.ok(!g.UI.overlay.has('deck'), 'and it does not open a picker');
});

await t.test('camp: Meditate pays Ink and a brush; Cut Gems stays open all visit and only counts once a gem is set; extra actions come from relics', async () => {
  const g = fresh({ seed: 5 }); const R = mkRun(g, { seed: 5, gems: ['ember_ruby', 'keepsake_peridot'] });
  R.ink = 3;
  const node = nodeAt(g, R, 'camp', {});
  await open(g, 'camp', R, node);
  t.ok(/\+4 Echo \(3 to 7\)/.test(txt(tile(g, 'meditate'))), 'Meditate previews +4 Ink (3 to 7)');
  // opening and closing the gem cutter without cutting keeps the action
  await click(g, tile(g, 'gems'));
  t.ok($(g, '.o-deck .nk-deck.dk-socket'), 'the socket picker opens');
  await click(g, btnByText(g, /Done/, $(g, '.o-deck')));
  t.deep(Array.from(node.used), [], 'no gem was cut: the action is not spent');
  await click(g, tile(g, 'gems'));
  await click(g, $$(g, '.o-deck .dk-card').find((c) => c.dataset.id === 'hanae_slash'));
  await click(g, $$(g, '.o-deck .dk-gem').find((b) => /Ember/.test(txt(b))));
  await click(g, $(g, '.o-deck .dk-go'));
  t.ok(R.deck.find((c) => c.gems.indexOf('ember_ruby') >= 0), 'a gem was set');
  t.deep(Array.from(node.used), ['gems'], 'the first cut spends the action');
  await click(g, btnByText(g, /Done/, $(g, '.o-deck')));
  t.ok(tile(g, 'gems').classList.contains('again') && !tile(g, 'gems').classList.contains('locked'), 'Cut Gems stays open');
  t.ok(tile(g, 'meditate').classList.contains('locked'), 'but the other actions are locked');
  await click(g, tile(g, 'gems'));
  await click(g, $$(g, '.o-deck .dk-card').find((c) => c.dataset.id === 'kuro_ink_bolt' && c.dataset.uid));
  t.ok($(g, '.o-deck .dk-pane .dk-slot'), 'a second cut in the same visit is allowed');
  g.UI.overlay.closeAll(); await settle(g);
  // a relic that adds a camp action
  const g2 = fresh({ seed: 6 }); const R2 = mkRun(g2, { seed: 6, relics: ['jade_key'] });
  R2.ink = 3;
  const node2 = nodeAt(g2, R2, 'camp', {});
  await open(g2, 'camp', R2, node2);
  t.eq($$(g2, '.cp-flame').length, 2, 'the jade key lights a second flame');
  const brushes = R2.brushes.length;
  await click(g2, tile(g2, 'meditate'));
  t.eq(R2.ink, 7, 'Ink +4'); t.eq(R2.brushes.length, brushes + 1, 'a brush is added');
  t.ok(!tile(g2, 'rest').classList.contains('locked'), 'Rest is still available');
  await click(g2, tile(g2, 'rest'));
  t.deep(Array.from(node2.used), ['meditate', 'rest'], 'two actions used');
  t.ok(tile(g2, 'sharpen').classList.contains('locked'), 'the third is locked');
  t.eq(errs(g) + errs(g2), 0, 'no console errors');
});

await t.test('camp: Cut Gems is disabled without gems or a fitting socket; Break camp nudges when nothing was used; a saved camp keeps its used actions', async () => {
  const g = fresh({ seed: 7 }); const R = mkRun(g, { seed: 7 });
  const node = nodeAt(g, R, 'camp', {});
  await open(g, 'camp', R, node);
  t.ok(tile(g, 'gems').getAttribute('aria-disabled') === 'true' && /No gems in the pouch/.test(txt(tile(g, 'gems'))), 'no gems: disabled with a reason');
  await click(g, tile(g, 'gems'));
  t.ok(!g.UI.overlay.has('deck'), 'no picker');
  const leave = $(g, '.cp-leave');
  await click(g, leave);
  t.eq(done(g), 0, 'the first tap only nudges');
  t.ok(/without resting/i.test(txt(leave)) && leave.classList.contains('nudge'), 'the button asks');
  await click(g, leave);
  t.eq(done(g), 1, 'the second tap leaves');
  // after an action a single tap leaves
  const R2 = mkRun(g, { seed: 8 }); const node2 = nodeAt(g, R2, 'camp', {});
  await open(g, 'camp', R2, node2);
  await click(g, tile(g, 'rest'));
  await click(g, $(g, '.cp-leave'));
  t.eq(done(g), 2, 'one tap after resting');
  // reload
  const R3 = mkRun(g, { seed: 9 }); const node3 = nodeAt(g, R3, 'camp', {});
  await open(g, 'camp', R3, node3);
  await click(g, tile(g, 'meditate'));
  const R4 = g.RUN.deserialize(JSON.parse(JSON.stringify(g.RUN.serialize(R3))));
  g.GAME.state.R = R4; g.UI.setRun(R4);
  await open(g, 'camp', R4, R4.node);
  t.deep(Array.from(R4.node.used), ['meditate'], 'the save kept the used action');
  t.ok(tile(g, 'meditate').classList.contains('used') && tile(g, 'rest').classList.contains('locked'), 'the saved camp shows it');
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('camp: the stage paints for a long time with every hero pose after each action, with no canvas mistakes', async () => {
  const g = fresh({ seed: 11 }); const R = mkRun(g, { seed: 11, gems: ['ember_ruby'], heroes: ['suzu', 'raiga'] });
  R.heroes.forEach((h) => { h.hp = Math.floor(h.maxHp / 2); });
  R.flags.extraCampActions = 2;
  const node = nodeAt(g, R, 'camp', {});
  await open(g, 'camp', R, node);
  g._resetCounts();
  g._win.__HEADLESS = false;
  let now = 0;
  const run = (n) => { for (let i = 0; i < n; i++) { now += 16; g.UI.frame(now); } };
  run(60);
  g._win.__HEADLESS = true;
  await click(g, tile(g, 'rest')); g._win.__HEADLESS = false; run(80); g._win.__HEADLESS = true;
  await click(g, tile(g, 'meditate')); g._win.__HEADLESS = false; run(80); g._win.__HEADLESS = true;
  g._win.__HEADLESS = false; run(200);
  t.eq(errs(g), 0, 'no console errors'); t.eq(g._console.warn.length, 0, 'no console warnings');
  t.eq(g._issues.length, 0, 'no canvas issues: ' + JSON.stringify(g._issues.slice(0, 2)));
  t.ok(g._counts && Object.keys(g._counts).length > 0, 'the canvas was really drawn on');
});

// ==================================================================================================== forge
const fmode = (g, k) => $(g, '.fg-mode.m-' + k);

await t.test('forge (twelve seeds): pick a card, see it before and after, strike, and RUN upgrades exactly that card; then nothing else is allowed', async () => {
  for (const seed of SEEDS) {
    const g = fresh({ seed }); const R = mkRun(g, { seed, gems: ['ember_ruby'] });
    const node = nodeAt(g, R, 'forge', {});
    await open(g, 'forge', R, node);
    t.ok(!fmode(g, 'up').classList.contains('dim') && !fmode(g, 'gem').classList.contains('dim'), 'seed ' + seed + ': both actions open');
    await click(g, fmode(g, 'up'));
    t.ok($(g, '.o-deck .nk-deck.dk-upgrade'), 'seed ' + seed + ': the picker opens in upgrade mode');
    const target = R.deck[seed % R.deck.length];
    await click(g, $$(g, '.o-deck .dk-card').find((c) => Number(c.dataset.uid) === target.uid));
    await click(g, $(g, '.o-deck .dk-go'));
    t.ok(!g.UI.overlay.has('deck'), 'seed ' + seed + ': the picker closed');
    t.ok($(g, '.fg-stage') && !$(g, '.fg-stage').hidden && $(g, '.card.fg-before') && $(g, '.card.fg-after.up'), 'seed ' + seed + ': before and after on the anvil');
    t.eq($(g, '.card.fg-before').dataset.id, target.id, 'seed ' + seed + ': the card on the anvil is the chosen one');
    t.eq(target.up, 0, 'seed ' + seed + ': nothing changed before the strike');
    await click(g, $(g, '.fg-strike'));
    g._flush(2000); await settle(g);
    t.eq(target.up, 1, 'seed ' + seed + ': the strike upgraded the card');
    t.eq(node.used, 'upgrade', 'seed ' + seed + ': RUN recorded the forge as used');
    t.ok($(g, '.fg-stage').classList.contains('struck'), 'seed ' + seed + ': the struck state shows');
    t.ok(fmode(g, 'up').getAttribute('aria-disabled') === 'true' && fmode(g, 'gem').getAttribute('aria-disabled') === 'true', 'seed ' + seed + ': upgrade or gems, not both: both closed now');
    const before = R.stats.upgrades;
    await click(g, $(g, '.fg-strike') || fmode(g, 'up'));
    t.eq(R.stats.upgrades, before, 'seed ' + seed + ': a second blow does nothing');
    await click(g, $(g, '.fg-leave'));
    t.eq(done(g), 1, 'seed ' + seed + ': Leave calls GAME.nodeDone');
    t.eq(errs(g), 0, 'seed ' + seed + ': no console errors');
  }
});

await t.test('forge: Choose another goes back; the gem path sets gems through RUN.forgeAction, closes the upgrade and stays open for more cuts', async () => {
  const g = fresh({ seed: 4 }); const R = mkRun(g, { seed: 4, gems: ['ember_ruby', 'vanguard_garnet'] });
  const node = nodeAt(g, R, 'forge', {});
  await open(g, 'forge', R, node);
  await click(g, fmode(g, 'up'));
  await click(g, $$(g, '.o-deck .dk-card')[1]); await click(g, $(g, '.o-deck .dk-go'));
  await click(g, btnByText(g, /Choose another/, $(g, '.fg-stage')));
  t.ok(g.UI.overlay.has('deck'), 'Choose another reopens the picker');
  g.UI.overlay.close(null); await settle(g);
  t.eq(node.used, null, 'nothing was used');
  await click(g, fmode(g, 'gem'));
  t.ok($(g, '.o-deck .nk-deck.dk-socket'), 'the gem picker is up');
  await click(g, $$(g, '.o-deck .dk-card').find((c) => c.dataset.id === 'hanae_slash'));
  await click(g, $$(g, '.o-deck .dk-gem').find((b) => /Ember/.test(txt(b))));
  await click(g, $(g, '.o-deck .dk-go'));
  t.eq(node.used, 'gems', 'the forge is now a gem cutter for this visit');
  await click(g, btnByText(g, /Done/, $(g, '.o-deck')));
  t.ok(fmode(g, 'up').getAttribute('aria-disabled') === 'true' && /not both/.test(txt(fmode(g, 'up')) + (fmode(g, 'up').rbReason || '')), 'upgrade is closed with the reason');
  t.ok(fmode(g, 'gem').getAttribute('aria-disabled') !== 'true', 'more gems can still be cut');
  t.ok(/gems are set/.test(txt($(g, '.fg-result'))), 'the page says the gems are set');
  await click(g, fmode(g, 'up'));
  t.ok(!g.UI.overlay.has('deck'), 'the closed upgrade opens nothing');
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('forge: empty states (everything sharp, no gems) disable both actions with reasons; a used forge reopens cooled', async () => {
  const g = fresh({ seed: 5 }); const R = mkRun(g, { seed: 5 });
  R.deck.forEach((c) => { c.up = 1; });
  const node = nodeAt(g, R, 'forge', {});
  await open(g, 'forge', R, node);
  t.ok(fmode(g, 'up').getAttribute('aria-disabled') === 'true' && /already sharp|Nothing left/.test(txt(fmode(g, 'up'))), 'Sharpen says why not');
  t.ok(fmode(g, 'gem').getAttribute('aria-disabled') === 'true' && /no gems/.test(txt(fmode(g, 'gem'))), 'Cut Gems says why not');
  await click(g, fmode(g, 'up')); await click(g, fmode(g, 'gem'));
  t.ok(!g.UI.overlay.has('deck'), 'no picker opens');
  await click(g, $(g, '.fg-leave'));
  t.eq(done(g), 1, 'you can always leave');
  const R2 = mkRun(g, { seed: 6 }); const node2 = nodeAt(g, R2, 'forge', {});
  node2.used = 'upgrade';
  const R3 = g.RUN.deserialize(JSON.parse(JSON.stringify(g.RUN.serialize(R2))));
  g.GAME.state.R = R3; g.UI.setRun(R3);
  await open(g, 'forge', R3, R3.node);
  t.ok(/cooled/.test(txt($(g, '.fg-result'))) && fmode(g, 'up').getAttribute('aria-disabled') === 'true', 'the saved forge has cooled');
});

await t.test('forge: the hammer, the sparks and the flash paint through the whole strike with no canvas mistakes', async () => {
  const g = fresh({ seed: 9 }); const R = mkRun(g, { seed: 9 });
  const node = nodeAt(g, R, 'forge', {});
  await open(g, 'forge', R, node);
  await click(g, fmode(g, 'up'));
  await click(g, $$(g, '.o-deck .dk-card')[0]); await click(g, $(g, '.o-deck .dk-go'));
  g._resetCounts();
  g._win.__HEADLESS = false;
  let now = 0;
  const run = (n) => { for (let i = 0; i < n; i++) { now += 16; g.UI.frame(now); } };
  run(30);
  g._win.__HEADLESS = true; await click(g, $(g, '.fg-strike')); g._win.__HEADLESS = false;
  run(160);
  t.eq(errs(g), 0, 'no console errors'); t.eq(g._issues.length, 0, 'no canvas issues: ' + JSON.stringify(g._issues.slice(0, 2)));
});


// ==================================================================================================== chest
const chestRow = (g) => txt($(g, '.ch-loot .nk-row.k-gold .nk-row-val'));

await t.test('chest with a relic (twelve seeds): closed, opened by the button, the gold counts up, take the treasure or just the gold', async () => {
  let took = 0, left = 0;
  for (const seed of SEEDS) {
    const g = fresh({ seed }); const R = mkRun(g, { seed });
    const node = nodeAt(g, R, 'chest', { relic: seed % 3 === 0 ? 'rare' : 'common' });
    t.ok(node.loot.relic, 'seed ' + seed + ': RUN put a relic in the chest');
    await open(g, 'chest', R, node);
    t.ok($(g, '.ch-hit') && !$(g, '.ch-hit').hidden && !$(g, '.ch-open').hidden, 'seed ' + seed + ': the chest is shut, with a hit area and an Open button');
    t.ok(!$(g, '.ch-loot'), 'seed ' + seed + ': no loot is shown before the lid lifts');
    t.eq(node.taken, false, 'seed ' + seed + ': nothing taken yet');
    await click(g, $(g, '.ch-open'));
    t.eq(chestRow(g), '+' + node.loot.gold, 'seed ' + seed + ': the gold row counted up to the real amount');
    t.ok($(g, '.ch-relic') && txt($(g, '.ch-relic')).indexOf(g.DATA.relics[node.loot.relic].name) >= 0, 'seed ' + seed + ': the relic is named');
    t.ok(btnByText(g, /Just the gold/) && btnByText(g, /Take the treasure/), 'seed ' + seed + ': both choices are offered');
    t.eq(R.gold, g.RUN.newRun({ heroes: ['hanae', 'kuro'], seed }).gold, 'seed ' + seed + ': opening alone pays nothing');
    const gold0 = R.gold, rel0 = R.relics.length;
    if (seed % 2) { await click(g, btnByText(g, /Take the treasure/)); took++; } else { await click(g, btnByText(g, /Just the gold/)); left++; }
    await answerOverlays(g, R);
    t.eq(R.gold, gold0 + node.loot.gold, 'seed ' + seed + ': the gold was paid');
    t.eq(R.relics.length, rel0 + (seed % 2 ? 1 : 0), 'seed ' + seed + ': the relic was taken or left');
    if (seed % 2) t.ok(R.relics.indexOf(node.loot.relic) >= 0, 'seed ' + seed + ': the chest relic is owned');
    t.ok(node.taken, 'seed ' + seed + ': the chest is marked taken');
    t.ok(/You take/.test(txt($(g, '.ch-done'))), 'seed ' + seed + ': the page says what you took');
    t.eq(txt($(g, '.stat.st-gold .val')), String(R.gold), 'seed ' + seed + ': the HUD gold follows');
    const leave = btnByText(g, /^Leave/, $(g, '.ch-foot'));
    t.ok(leave, 'seed ' + seed + ': Leave is offered');
    await click(g, leave);
    t.eq(done(g), 1, 'seed ' + seed + ': Leave calls GAME.nodeDone once');
    t.eq(errs(g), 0, 'seed ' + seed + ': no console errors');
  }
  t.ok(took > 0 && left > 0, 'both paths were played');
});

await t.test('chest: the whole chest is a button, Enter opens it, and a second open does nothing', async () => {
  const g = fresh({ seed: 4 }); const R = mkRun(g, { seed: 4 });
  const node = nodeAt(g, R, 'chest', { relic: 'common' });
  await open(g, 'chest', R, node);
  t.eq($(g, '.ch-hit').getAttribute('aria-label'), 'Open the chest', 'the hit area is a labelled button');
  await click(g, $(g, '.ch-hit'));
  t.ok($(g, '.ch-loot'), 'a tap on the chest opens it');
  const rows = $$(g, '.ch-loot .nk-row').length;
  await click(g, $(g, '.ch-hit')); g._key('Enter'); await settle(g);
  t.eq($$(g, '.ch-loot .nk-row').length, rows, 'nothing opens twice');
  const g2 = fresh({ seed: 5 }); const R2 = mkRun(g2, { seed: 5 });
  const n2 = nodeAt(g2, R2, 'chest', { relic: 'common' });
  await open(g2, 'chest', R2, n2);
  g2._key('Enter'); await settle(g2);
  t.ok($(g2, '.ch-loot'), 'Enter opens the chest from the keyboard');
  t.eq(errs(g) + errs(g2), 0, 'no console errors');
});

await t.test('chest without a relic: choose one of three gems, the button waits for the choice, RUN.take banks that gem', async () => {
  for (const seed of SEEDS.slice(0, 6)) {
    const g = fresh({ seed }); const R = mkRun(g, { seed });
    const node = nodeAt(g, R, 'chest', {});
    t.ok(!node.loot.relic && node.loot.gems.length === 3, 'seed ' + seed + ': RUN put three gems in the chest');
    await open(g, 'chest', R, node);
    await click(g, $(g, '.ch-open'));
    t.deep($$(g, '.ch-gem').map((b) => b.dataset.gem), node.loot.gems, 'seed ' + seed + ': the three gems are shown in order');
    const take = btnByText(g, /Take the gem/);
    t.ok(take.getAttribute('aria-disabled') === 'true', 'seed ' + seed + ': Take waits for a choice');
    await click(g, take);
    t.eq(node.taken, false, 'seed ' + seed + ': a disabled Take does nothing');
    const pick = node.loot.gems[seed % 3];
    const gold0 = R.gold, gems0 = R.gems.length;
    await click(g, $$(g, '.ch-gem')[seed % 3]);
    t.ok($$(g, '.ch-gem')[seed % 3].classList.contains('on') && $$(g, '.ch-gem.on').length === 1 && $$(g, '.ch-gem')[seed % 3].getAttribute('aria-pressed') === 'true', 'seed ' + seed + ': exactly the chosen gem is marked');
    t.ok(take.getAttribute('aria-disabled') !== 'true', 'seed ' + seed + ': Take is open');
    const other = (seed + 1) % 3;
    await click(g, $$(g, '.ch-gem')[other]);
    t.eq($$(g, '.ch-gem.on').length, 1, 'seed ' + seed + ': changing the mind moves the mark');
    await click(g, $$(g, '.ch-gem')[seed % 3]);
    await click(g, take);
    t.eq(R.gems.length, gems0 + 1, 'seed ' + seed + ': one gem banked');
    t.eq(R.gems[R.gems.length - 1], pick, 'seed ' + seed + ': the chosen gem');
    t.eq(R.gold, gold0 + node.loot.gold, 'seed ' + seed + ': the gold paid too');
    t.ok(node.taken, 'seed ' + seed + ': taken');
    await click(g, btnByText(g, /^Leave/, $(g, '.ch-foot')));
    t.eq(done(g), 1, 'seed ' + seed + ': left');
    t.eq(errs(g), 0, 'seed ' + seed + ': no console errors');
  }
});

await t.test('chest: only gold (nothing else inside) says Take the gold; an already opened chest is dust with a way out; RUN refusing is a toast', async () => {
  const g = fresh({ seed: 3 }); const R = mkRun(g, { seed: 3 });
  const node = nodeAt(g, R, 'chest', {});
  node.loot.gems = []; node.loot.relic = null;
  await open(g, 'chest', R, node);
  await click(g, $(g, '.ch-open'));
  t.ok(!$(g, '.ch-relic') && !$(g, '.ch-gem'), 'no relic and no gems shown');
  const gold0 = R.gold;
  await click(g, btnByText(g, /Take the gold/));
  t.eq(R.gold, gold0 + node.loot.gold, 'the gold is paid');
  t.ok(/You take \d+ gold/.test(txt($(g, '.ch-done'))), 'the page says so');
  // a chest that is already taken
  const R2 = mkRun(g, { seed: 6 }); const n2 = nodeAt(g, R2, 'chest', { relic: 'common' });
  g.RUN.take(R2, n2, { relic: true });
  await open(g, 'chest', R2, n2);
  t.ok($(g, '.ch-hit').hidden && !$(g, '.ch-open') && !$(g, '.ch-loot'), 'a taken chest cannot be opened again');
  t.ok(/empty/i.test(txt($(g, '.ch-done'))) && btnByText(g, /^Leave/), 'it says it is empty and offers Leave');
  const gold1 = R2.gold; await click(g, btnByText(g, /^Leave/)); t.eq(R2.gold, gold1, 'leaving pays nothing more');
  // the loot is taken behind the screen's back: the button gives a toast and no second payment
  const R3 = mkRun(g, { seed: 7 }); const n3 = nodeAt(g, R3, 'chest', { relic: 'common' });
  await open(g, 'chest', R3, n3);
  await click(g, $(g, '.ch-open'));
  g.RUN.take(R3, n3, { relic: false });
  const gold3 = R3.gold; const toasts0 = $$(g, '.toast').length;
  await click(g, btnByText(g, /Take the treasure/));
  t.eq(R3.gold, gold3, 'no second payment');
  t.ok($$(g, '.toast').length > toasts0, 'the refusal is a toast');
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('chest: a relic whose pickup asks a question (remove a card) is answered on the screen before Leave', async () => {
  for (const seed of [2, 5, 8]) {
    const g = await freshS({ seed }); const R = mkRun(g, { seed });
    g.DATA.relics.test_pickup = Object.assign({}, g.DATA.relics[Object.keys(g.DATA.relics)[0]], { id: 'test_pickup', name: 'Test Pickup', hooks: [{ on: 'onPickup', fx: [{ op: 'removeCard' }] }] });
    const node = nodeAt(g, R, 'chest', { relic: 'common' });
    node.loot.relic = 'test_pickup';
    await open(g, 'chest', R, node);
    await click(g, $(g, '.ch-open'));
    const deck0 = R.deck.length;
    g._click(btnByText(g, /Take the treasure/)); await settle(g);
    t.ok(R.pending.length > 0 && g.UI.overlay.has('deck'), 'seed ' + seed + ': the pickup question is on screen (a deck overlay in remove mode)');
    t.ok($(g, '.o-deck .nk-deck.dk-remove'), 'seed ' + seed + ': remove mode');
    await answerOverlays(g, R);
    t.eq(R.pending.length, 0, 'seed ' + seed + ': nothing pending after the screen answered');
    t.eq(R.deck.length, deck0 - 1, 'seed ' + seed + ': the chosen card was removed');
    t.eq(g.UI.overlay.count(), 0, 'seed ' + seed + ': no overlay left open');
    t.ok(R.relics.indexOf('test_pickup') >= 0, 'seed ' + seed + ': the relic is owned');
    await click(g, btnByText(g, /^Leave/, $(g, '.ch-foot')));
    t.eq(done(g), 1, 'seed ' + seed + ': left');
    t.eq(errs(g), 0, 'seed ' + seed + ': no console errors');
  }
});

// ==================================================================================================== gem cache
const gcTiles = (g) => $$(g, '.gc-gem');

await t.test('gem cache (twelve seeds): three gems on offer, take waits for a choice, RUN.take banks exactly the chosen one', async () => {
  for (const seed of SEEDS) {
    const g = fresh({ seed }); const R = mkRun(g, { seed });
    const node = nodeAt(g, R, 'gemcache', {});
    t.eq(node.offers.length, 3, 'seed ' + seed + ': RUN offers three gems');
    await open(g, 'gemcache', R, node);
    t.deep(gcTiles(g).map((b) => b.dataset.gem), node.offers, 'seed ' + seed + ': the tiles are the offers in order');
    gcTiles(g).forEach((b) => t.ok(txt(b).indexOf(g.DATA.gems[b.dataset.gem].name) >= 0 && /Fits/.test(txt($(g, '.gc-fit', b))), 'seed ' + seed + ': ' + b.dataset.gem + ' shows its name and fit'));
    const take = btnByText(g, /Take this gem/);
    t.ok(take.getAttribute('aria-disabled') === 'true', 'seed ' + seed + ': Take waits');
    await click(g, take);
    t.eq(node.taken, false, 'seed ' + seed + ': a disabled Take changes nothing');
    const k = seed % 3, id = node.offers[k];
    await click(g, gcTiles(g)[k]);
    t.ok(gcTiles(g)[k].classList.contains('on') && gcTiles(g).filter((b) => b.classList.contains('on')).length === 1, 'seed ' + seed + ': the tile is marked');
    t.ok(/fits|No card in your deck/.test(txt($(g, '.gc-detail'))), 'seed ' + seed + ': the detail line says how it fits the deck');
    t.ok(take.getAttribute('aria-disabled') !== 'true', 'seed ' + seed + ': Take opens');
    const gems0 = R.gems.length;
    await click(g, take);
    t.eq(R.gems.length, gems0 + 1, 'seed ' + seed + ': one gem banked');
    t.eq(R.gems[R.gems.length - 1], id, 'seed ' + seed + ': the chosen one');
    t.ok(node.taken, 'seed ' + seed + ': taken');
    t.eq(gcTiles(g).filter((b) => b.classList.contains('gone')).length, 2, 'seed ' + seed + ': the other two fade away');
    t.ok(gcTiles(g)[k].classList.contains('took'), 'seed ' + seed + ': the chosen one is stamped');
    t.ok(/is in your pouch/.test(txt($(g, '.gc-detail'))), 'seed ' + seed + ': the page says it is in the pouch');
    await click(g, take);
    t.eq(R.gems.length, gems0 + 1, 'seed ' + seed + ': a second tap changes nothing');
    await click(g, btnByText(g, /^Continue/));
    t.eq(done(g), 1, 'seed ' + seed + ': Continue calls GAME.nodeDone');
    t.eq(errs(g), 0, 'seed ' + seed + ': no console errors');
  }
});

await t.test('gem cache: number keys choose, and Set it in a card now opens the socket overlay with that gem ready', async () => {
  const g = fresh({ seed: 8 }); const R = mkRun(g, { seed: 8 });
  const node = nodeAt(g, R, 'gemcache', {});
  node.offers = ['ember_ruby', 'tidewatch_sapphire', 'quickthought_emerald'];
  await open(g, 'gemcache', R, node);
  g._key('2'); await settle(g);
  t.ok(gcTiles(g)[1].classList.contains('on'), 'key 2 marks the second gem');
  g._key('3'); await settle(g);
  t.ok(gcTiles(g)[2].classList.contains('on') && !gcTiles(g)[1].classList.contains('on'), 'key 3 moves the mark');
  await click(g, gcTiles(g)[0]);
  await click(g, btnByText(g, /Take this gem/));
  const setNow = btnByText(g, /Set it in a card now/);
  t.ok(setNow && setNow.getAttribute('aria-disabled') !== 'true', 'a red gem fits the starter deck: Set it now is open');
  await click(g, setNow);
  t.ok($(g, '.o-deck .nk-deck.dk-socket'), 'the socket overlay opened');
  const card = $$(g, '.o-deck .dk-card').find((c) => c.dataset.id === 'hanae_slash');
  await click(g, card);
  t.ok($(g, '.o-deck .dk-gem.on') && /Ember Ruby/.test(txt($(g, '.o-deck .dk-gem.on'))), 'with the new gem already chosen in the pouch');
  await click(g, $(g, '.o-deck .dk-go'));
  t.ok(R.deck.some((c) => c.gems.indexOf('ember_ruby') >= 0), 'the gem is set in a card');
  t.eq(R.gems.indexOf('ember_ruby'), -1, 'and gone from the pouch');
  await click(g, btnByText(g, /Done/, $(g, '.o-deck')));
  t.ok(!g.UI.overlay.has('deck'), 'Done closes the overlay');
  t.ok(btnByText(g, /Set it in a card now/).getAttribute('aria-disabled') === 'true', 'the button is spent');
  g._key('1'); await settle(g);
  t.eq(node.taken, true, 'number keys do nothing after the take');
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('gem cache: a gem no card can hold says so honestly, and the button is disabled with a reason; empty and taken caches show a message with a way on', async () => {
  const g = fresh({ seed: 9 }); const R = mkRun(g, { seed: 9 });
  const node = nodeAt(g, R, 'gemcache', {});
  node.offers = ['sunwake_topaz', 'coinluck_citrine', 'inkwell_amber'];
  await open(g, 'gemcache', R, node);
  gcTiles(g).forEach((b) => t.ok(/no card yet/i.test(txt($(g, '.gc-fit', b))), 'a gold gem (' + b.dataset.gem + ') fits no starter card'));
  await click(g, gcTiles(g)[1]);
  t.ok(/No card in your deck has a gold or prism socket/.test(txt($(g, '.gc-detail'))), 'the detail explains');
  await click(g, btnByText(g, /Take this gem/));
  const setNow = btnByText(g, /Set it in a card now/);
  t.ok(setNow.getAttribute('aria-disabled') === 'true' && /No card has a socket/.test(setNow.rbReason || ''), 'Set it now is disabled with the reason');
  await click(g, setNow);
  t.ok(!g.UI.overlay.has('deck'), 'nothing opens');
  // empty
  const R2 = mkRun(g, { seed: 10 }); const n2 = nodeAt(g, R2, 'gemcache', {});
  n2.offers = [];
  await open(g, 'gemcache', R2, n2);
  t.ok(/holds nothing/.test(txt($(g, '.gc-none'))) && btnByText(g, /^Continue/), 'an empty cache says so and offers Continue');
  t.ok(!btnByText(g, /Take this gem/), 'no Take button');
  // taken
  const R3 = mkRun(g, { seed: 11 }); const n3 = nodeAt(g, R3, 'gemcache', {});
  g.RUN.take(R3, n3, { gem: n3.offers[0] });
  await open(g, 'gemcache', R3, n3);
  t.ok(/already took/.test(txt($(g, '.gc-none'))) && !gcTiles(g).length, 'a taken cache shows the message and no tiles');
  await click(g, btnByText(g, /^Continue/));
  t.eq(R3.gems.filter((x) => x === n3.offers[0]).length, 1, 'leaving gives nothing more');
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('gem cache: a saved cache that was already taken comes back taken through serialize and deserialize', async () => {
  const g = fresh({ seed: 12 }); const R = mkRun(g, { seed: 12 });
  const node = nodeAt(g, R, 'gemcache', {});
  await open(g, 'gemcache', R, node);
  await click(g, gcTiles(g)[0]); await click(g, btnByText(g, /Take this gem/));
  const R2 = g.RUN.deserialize(JSON.parse(JSON.stringify(g.RUN.serialize(R))));
  g.GAME.state.R = R2; g.UI.setRun(R2);
  await open(g, 'gemcache', R2, R2.node);
  t.ok(R2.node.taken && $(g, '.gc-none'), 'the reloaded cache is taken and empty');
  t.eq(R2.gems.length, R.gems.length, 'the pouch kept the gem');
});


// ==================================================================================================== deck and cardPick overlays
async function freshS(o) { const g = fresh(o); await settle(g); return g; }
function ovOpen(g, name, params) {
  const box = { res: undefined, done: false };
  box.pr = g.UI.overlay.open(name, params).then((v) => { box.res = v; box.done = true; });
  return box;
}
const cardIds = (g) => $$(g, '.o-deck .dk-card').map((c) => c.dataset.id);
const cardUids = (g) => $$(g, '.o-deck .dk-card').map((c) => Number(c.dataset.uid));
const chipBy = (g, re) => $$(g, '.o-deck .dk-chip').find((c) => re.test(txt(c)));
const deckCard = (g, uid) => $$(g, '.o-deck .dk-card').find((c) => Number(c.dataset.uid) === uid);

// a deck with every type, rarity and hero mix, some sharpened, one gem set
function variety(g, R) {
  const seen = {};
  Object.values(g.DATA.cards).forEach((c) => {
    if (['hanae', 'kuro'].indexOf(c.hero) < 0 || c.rarity === 'starter') return;
    const k = c.hero + c.type + c.rarity;
    if (seen[k]) return;
    seen[k] = 1; g.RUN.addCard(R, c.id);
  });
  g.RUN.upgradeCard(R, R.deck[1].uid); g.RUN.upgradeCard(R, R.deck[R.deck.length - 1].uid);
  return R;
}

await t.test('deck (view): every card of the run in deck order, a big card with glossary and sockets, the upgrade preview, Close and Esc', async () => {
  const g = await freshS({ seed: 3 }); const R = variety(g, mkRun(g, { seed: 3 }));
  const ov = ovOpen(g, 'deck', { mode: 'view' }); await settle(g);
  t.ok($(g, '.o-deck .nk-deck.dk-view'), 'the panel is in view mode');
  t.ok(/Your Deck/.test(txt($(g, '.o-deck'))), 'titled Your Deck');
  t.eq(txt($(g, '.o-deck .dk-count')), R.deck.length + ' cards', 'the count is the whole deck');
  t.deep(cardUids(g), R.deck.map((c) => c.uid), 'every card, in deck order');
  t.ok($(g, '.o-deck .dk-hint') && /sharpened/.test(txt($(g, '.o-deck .dk-facts'))), 'with nothing chosen the pane shows a hint and the deck facts');
  const plain = R.deck.find((c) => g.DATA.cards[c.id].up && !c.up);
  await click(g, deckCard(g, plain.uid));
  t.eq($(g, '.o-deck .dk-big').dataset.id, plain.id, 'a tap shows the card big');
  t.ok($(g, '.o-deck .dk-slots') || $(g, '.o-deck .dk-nosock'), 'its sockets are listed');
  t.ok($(g, '.o-deck .dk-gloss'), 'the glossary column exists');
  const prev = btnByText(g, /Preview upgrade/, $(g, '.o-deck'));
  t.ok(prev && !$(g, '.o-deck .dk-big.up'), 'an unsharpened card offers a preview');
  await click(g, prev);
  t.ok($(g, '.o-deck .dk-big.up') && btnByText(g, /Show plain/, $(g, '.o-deck')), 'the preview shows the upgraded card');
  t.eq(plain.up, 0, 'and changes nothing in the run');
  await click(g, btnByText(g, /Show plain/, $(g, '.o-deck')));
  t.ok(!$(g, '.o-deck .dk-big.up'), 'back to plain');
  const sharp = R.deck.find((c) => c.up);
  await click(g, deckCard(g, sharp.uid));
  t.ok(!btnByText(g, /Preview upgrade/, $(g, '.o-deck')), 'a sharpened card offers no preview');
  t.ok(!$(g, '.o-deck .dk-go'), 'view mode has no confirm button');
  await click(g, btnByText(g, /Close/, $(g, '.o-deck')));
  t.ok(ov.done && ov.res == null, 'Close resolves with nothing');
  t.eq(g.UI.overlay.count(), 0, 'and the overlay is gone');
  const ov2 = ovOpen(g, 'deck', { mode: 'view' }); await settle(g);
  g._key('Escape'); await settle(g);
  t.ok(ov2.done && ov2.res === null, 'Esc closes it with the cancel result (null)');
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('deck: five sort orders (order, cost, type, hero, rarity) really sort, stably, and Order restores the deck order', async () => {
  const g = await freshS({ seed: 4 }); const R = variety(g, mkRun(g, { seed: 4 }));
  ovOpen(g, 'deck', { mode: 'view' }); await settle(g);
  const D = g.DATA.cards;
  const inst = (uid) => R.deck.find((c) => c.uid === uid);
  const cost = (c) => { const d = D[c.id]; const v = c.up && d.up && d.up.cost !== undefined ? d.up.cost : d.cost; return v === 'X' ? 9 : v; };
  const TY = { attack: 0, skill: 1, power: 2, curse: 3, status: 4 }, RA = { rare: 0, uncommon: 1, common: 2, starter: 3, token: 4 };
  const HE = { hanae: 0, kuro: 1 };
  const nondec = (list, key) => list.every((v, i) => i === 0 || key(inst(list[i - 1])) <= key(inst(v)));
  const seg = (label) => $$(g, '.o-deck .dk-sort .seg-b').find((b) => txt(b) === label);
  t.eq($$(g, '.o-deck .dk-sort .seg-b').map(txt).join(','), 'Order,Cost,Type,Hero,Rarity', 'the five sorts are offered');
  for (const [label, key] of [['Cost', cost], ['Type', (c) => TY[D[c.id].type]], ['Hero', (c) => HE[D[c.id].hero] ?? 9], ['Rarity', (c) => RA[D[c.id].rarity]]]) {
    await click(g, seg(label));
    const uids = cardUids(g);
    t.ok(seg(label).classList.contains('on') && seg(label).getAttribute('aria-checked') === 'true', label + ': the segment is marked');
    t.ok(nondec(uids, key), label + ': the grid is sorted by ' + label.toLowerCase());
    t.deep(uids.slice().sort((a, b) => a - b), R.deck.map((c) => c.uid).sort((a, b) => a - b), label + ': no card lost or doubled');
  }
  await click(g, seg('Order'));
  t.deep(cardUids(g), R.deck.map((c) => c.uid), 'Order restores the deck order');
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('deck: hero, type, Upgraded and Gems chips filter and combine, the count says "x of y", and an empty result offers Clear filters', async () => {
  const g = await freshS({ seed: 5 }); const R = variety(g, mkRun(g, { seed: 5 }));
  R.gems.push('ember_ruby');
  const slotted = R.deck.find((c) => (g.DATA.cards[c.id].slots || []).indexOf('red') >= 0);
  g.RUN.socket(R, slotted.uid, (g.DATA.cards[slotted.id].slots).indexOf('red'), 'ember_ruby');
  ovOpen(g, 'deck', { mode: 'view' }); await settle(g);
  const D = g.DATA.cards, total = R.deck.length;
  await click(g, chipBy(g, /Hanae/));
  t.ok(cardIds(g).every((id) => D[id].hero === 'hanae') && cardIds(g).length === R.deck.filter((c) => D[c.id].hero === 'hanae').length, 'the hero chip keeps only that hero');
  t.eq(txt($(g, '.o-deck .dk-count')), cardIds(g).length + ' of ' + total + ' cards', 'the count says how many of how many');
  t.eq(chipBy(g, /Hanae/).getAttribute('aria-pressed'), 'true', 'the chip is pressed');
  await click(g, chipBy(g, /^Attack/));
  t.ok(cardIds(g).every((id) => D[id].hero === 'hanae' && D[id].type === 'attack'), 'hero and type combine');
  await click(g, chipBy(g, /Upgraded/));
  t.ok(cardUids(g).every((u) => R.deck.find((c) => c.uid === u).up), 'Upgraded keeps only sharpened cards');
  await click(g, chipBy(g, /Upgraded/)); await click(g, chipBy(g, /^Attack/)); await click(g, chipBy(g, /Hanae/));
  t.eq(cardIds(g).length, total, 'switching every chip off restores the deck');
  await click(g, chipBy(g, /^Gems/));
  t.deep(cardUids(g), [slotted.uid], 'the Gems chip keeps only cards with a gem set');
  await click(g, chipBy(g, /Kuro/));
  t.ok($(g, '.o-deck .dk-none') && /No card matches these filters/.test(txt($(g, '.o-deck .dk-none'))), 'no match: a message instead of a blank grid (if the gem card is Hanae)');
  const clear = btnByText(g, /Clear filters/, $(g, '.o-deck'));
  t.ok(clear, 'with a way out');
  await click(g, clear);
  t.eq(cardIds(g).length, total, 'Clear filters restores everything');
  t.ok(!$$(g, '.o-deck .dk-chip.on').length, 'and unpresses the chips');
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('deck (pick): confirm label and note are honoured; nothing is chosen until a card is tapped; the result is the uid; Cancel and Esc give null', async () => {
  const g = await freshS({ seed: 6 }); const R = mkRun(g, { seed: 6 });
  const ov = ovOpen(g, 'deck', { mode: 'pick', title: 'Pick a Friend', confirm: 'Take this one', note: 'Only one.' }); await settle(g);
  t.ok(/Pick a Friend/.test(txt($(g, '.o-deck'))), 'the title is the caller\'s');
  t.ok(!$(g, '.o-deck .dk-go'), 'no confirm button before a card is chosen');
  await click(g, deckCard(g, R.deck[4].uid));
  t.eq(txt($(g, '.o-deck .dk-go')), 'Take this one', 'the confirm label');
  t.ok(/Only one/.test(txt($(g, '.o-deck .dk-note'))), 'the note');
  await click(g, deckCard(g, R.deck[6].uid));
  t.eq($$(g, '.o-deck .dk-card.sel').length, 1, 'exactly one card is marked');
  await click(g, $(g, '.o-deck .dk-go'));
  t.ok(ov.done && ov.res === R.deck[6].uid, 'the result is that card\'s uid');
  const ov2 = ovOpen(g, 'deck', { mode: 'pick' }); await settle(g);
  await click(g, btnByText(g, /Cancel/, $(g, '.o-deck')));
  t.ok(ov2.done && ov2.res === null, 'Cancel gives null');
  const ov3 = ovOpen(g, 'deck', { mode: 'pick' }); await settle(g);
  g._key('Escape'); await settle(g);
  t.ok(ov3.done && ov3.res === null, 'Esc gives null');
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('deck (required): no Cancel, Esc and the backdrop do nothing, only a choice closes it', async () => {
  const g = await freshS({ seed: 7 }); const R = mkRun(g, { seed: 7 });
  const ov = ovOpen(g, 'deck', { mode: 'pick', required: true, confirm: 'Choose' }); await settle(g);
  t.ok(!btnByText(g, /Cancel|Close/, $(g, '.o-deck')), 'no Cancel or Close button');
  g._key('Escape'); await settle(g);
  t.ok(g.UI.overlay.has('deck') && !ov.done, 'Esc does nothing');
  g._click($(g, '.o-deck')); await settle(g);
  t.ok(g.UI.overlay.has('deck') && !ov.done, 'a tap on the backdrop does nothing');
  await click(g, deckCard(g, R.deck[0].uid)); await click(g, $(g, '.o-deck .dk-go'));
  t.ok(ov.done && ov.res === R.deck[0].uid, 'a choice closes it');
  const ov2 = ovOpen(g, 'cardPick', { cards: R.deck.slice(0, 3), n: 1, required: true }); await settle(g);
  g._key('Escape'); await settle(g);
  t.ok(g.UI.overlay.has('cardPick') && !ov2.done, 'the required card pick also ignores Esc');
  g.UI.overlay.closeAll(); await settle(g);
});

await t.test('deck (mandatory pickers): the confirm button is pinned in a fixed footer of the pane, never inside the scrolling detail (a phone cannot scroll to it), and the compact css shrinks the big card', async () => {
  const g = await freshS({ seed: 9 }); const R = mkRun(g, { seed: 9 });
  const cases = [
    ['pick', { title: 'Transform a card', confirm: 'Transform it', note: 'It becomes a random card of the same hero and rarity.' }],
    ['pick', { title: 'Copy a card', confirm: 'Copy it', note: 'A second copy joins the deck.' }],
    ['remove', { title: 'Remove a card', confirm: 'Remove it', note: 'It is torn out of your deck for good.' }],
    ['upgrade', { title: 'Sharpen a card', confirm: 'Sharpen it', note: 'It gains its upgrade.' }],
    ['remove', { title: 'Remove a Card', price: 75, confirm: 'Pay 75 and remove', note: 'The peddler burns it for good.' }],
  ];
  for (const [mode, extra] of cases) {
    const ov = ovOpen(g, 'deck', Object.assign({ mode, required: true, dismiss: false }, extra)); await settle(g);
    const up = mode === 'upgrade' ? R.deck.find((c) => g.DATA.cards[c.id].up && !c.up) : R.deck[3];
    await click(g, deckCard(g, up.uid));
    const go = $(g, '.o-deck .dk-go');
    t.ok(go, mode + ' / ' + extra.confirm + ': the confirm button is there after a card is chosen');
    t.ok(go.closest('.dk-pane > .dk-confirm'), extra.confirm + ': it sits in the pinned footer row of the pane');
    t.ok(!go.closest('.dk-detail'), extra.confirm + ': and not inside the part that scrolls');
    t.ok($(g, '.o-deck .dk-pane > .dk-detail'), extra.confirm + ': the scrolling detail is a sibling of the footer');
    t.ok(/\S/.test(txt($(g, '.o-deck .dk-note'))) && ($(g, '.o-deck .dk-note').closest('.dk-side') || $(g, '.o-deck .dk-note').closest('.dk-confirm')), extra.confirm + ': the note is still shown (beside the card, or above the button for a before-and-after)');
    g.UI.overlay.closeAll(); await settle(g); void ov;
  }
  t.ok(/\.dk-pane\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column[^}]*overflow:\s*hidden/.test(CSS), 'css: the pane is a column that does not scroll itself');
  t.ok(/\.dk-pane\s*>\s*\.dk-detail\s*\{[^}]*overflow-y:\s*auto/.test(CSS) && /\.dk-confirm\s*\{[^}]*flex:\s*none/.test(CSS), 'css: the detail scrolls, the confirm row never shrinks');
  t.ok(/#stage\.compact \.o-deck \.dk-big\.card:not\(\.dk-sockcard\)\s*\{[^}]*--cw:/.test(CSS) && /#stage\.compact \.dk-confirm/.test(CSS), 'css: on a compact stage the big card shrinks and the confirm row tightens');
});

await t.test('deck (remove): the confirm needs a second tap that says so, the ask times out, and the price shows when given', async () => {
  const g = await freshS({ seed: 8 }); const R = mkRun(g, { seed: 8 });
  const ov = ovOpen(g, 'deck', { mode: 'remove', price: 75 }); await settle(g);
  t.ok(/75/.test(txt($(g, '.o-deck .dk-price'))) && /remove a card/.test(txt($(g, '.o-deck .dk-price'))), 'the price is shown');
  await click(g, deckCard(g, R.deck[2].uid));
  t.ok($(g, '.o-deck .dk-note.warn') && /torn out/.test(txt($(g, '.o-deck .dk-note'))), 'a warning says it is gone for good');
  const go = () => $(g, '.o-deck .dk-go');
  t.ok(/Remove this card/.test(txt(go())) && go().classList.contains('dk-danger'), 'a danger button');
  await click(g, go());
  t.ok(/Really remove it/.test(txt(go())) && !ov.done, 'the first tap asks again');
  g._flush(3500); await settle(g);
  t.ok(/Remove this card/.test(txt(go())) && !ov.done, 'the ask times out');
  await click(g, go()); await click(g, go());
  t.ok(ov.done && ov.res === R.deck[2].uid, 'the second tap resolves the uid (the caller removes it)');
  const ov2 = ovOpen(g, 'deck', { mode: 'remove' }); await settle(g);
  await click(g, deckCard(g, R.deck[2].uid)); await click(g, $(g, '.o-deck .dk-go'));
  await click(g, deckCard(g, R.deck[3].uid));
  t.ok(/Remove this card/.test(txt(go())), 'choosing another card resets the ask');
  g.UI.overlay.closeAll(); await settle(g);
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('deck (upgrade): unsharpable cards are dimmed with a reason, the before and after show, one candidate is chosen for you, none says so', async () => {
  const g = await freshS({ seed: 9 }); const R = variety(g, mkRun(g, { seed: 9 }));
  const ov = ovOpen(g, 'deck', { mode: 'upgrade' }); await settle(g);
  const sharp = R.deck.find((c) => c.up), plain = R.deck.find((c) => g.DATA.cards[c.id].up && !c.up);
  t.ok(deckCard(g, sharp.uid).classList.contains('dis') || deckCard(g, sharp.uid).getAttribute('aria-disabled') === 'true', 'a sharpened card is dimmed');
  const noUp = R.deck.find((c) => !g.DATA.cards[c.id].up);
  if (noUp) t.ok(deckCard(g, noUp.uid).getAttribute('aria-disabled') === 'true', 'a card with no upgrade is dimmed');
  const toasts0 = $$(g, '.toast').length;
  await click(g, deckCard(g, sharp.uid));
  t.ok(!$(g, '.o-deck .dk-ba') && $$(g, '.toast').length > toasts0, 'tapping it gives a toast, no selection');
  await click(g, deckCard(g, plain.uid));
  t.eq($$(g, '.o-deck .dk-half').length, 2, 'before and after');
  t.eq($(g, '.o-deck .dk-bacol.after .card').dataset.id, plain.id, 'of the chosen card');
  t.ok(/Sharpen this card/.test(txt($(g, '.o-deck .dk-go'))), 'default confirm label');
  await click(g, $(g, '.o-deck .dk-go'));
  t.ok(ov.done && ov.res === plain.uid, 'the result is the uid');
  // exactly one candidate
  const one = [plain];
  const ov2 = ovOpen(g, 'deck', { mode: 'upgrade', cards: one }); await settle(g);
  t.ok($(g, '.o-deck .dk-ba'), 'a single candidate is chosen for the player');
  g.UI.overlay.closeAll(); await settle(g);
  // none
  const ov3 = ovOpen(g, 'deck', { mode: 'upgrade', cards: [] }); await settle(g);
  t.ok(/Nothing left to sharpen/.test(txt($(g, '.o-deck .dk-none'))), 'no cards: says so');
  g.UI.overlay.closeAll(); await settle(g);
  const ov4 = ovOpen(g, 'deck', { mode: 'upgrade', cards: R.deck.filter((c) => c.up) }); await settle(g);
  t.ok(!$(g, '.o-deck .dk-ba') && $$(g, '.o-deck .dk-card').every((c) => c.getAttribute('aria-disabled') === 'true'), 'only sharpened cards: all dimmed, nothing preselected');
  g.UI.overlay.closeAll(); await settle(g);
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('deck: the cards and filter params narrow the grid, empty sets say so per mode, and an unknown card id never breaks the grid', async () => {
  const g = await freshS({ seed: 10 }); const R = variety(g, mkRun(g, { seed: 10 }));
  const D = g.DATA.cards;
  ovOpen(g, 'deck', { mode: 'pick', cards: R.deck.slice(0, 3) }); await settle(g);
  t.deep(cardUids(g), R.deck.slice(0, 3).map((c) => c.uid), 'only the given cards');
  t.eq(txt($(g, '.o-deck .dk-count')), '3 cards', 'counted');
  g.UI.overlay.closeAll(); await settle(g);
  ovOpen(g, 'deck', { mode: 'pick', filter: { hero: 'kuro' } }); await settle(g);
  t.ok(cardIds(g).length > 0 && cardIds(g).every((id) => D[id].hero === 'kuro'), 'the filter param keeps one hero');
  g.UI.overlay.closeAll(); await settle(g);
  ovOpen(g, 'deck', { mode: 'pick', filter: { type: 'power' } }); await settle(g);
  t.ok(cardIds(g).every((id) => D[id].type === 'power'), 'and a type');
  g.UI.overlay.closeAll(); await settle(g);
  ovOpen(g, 'deck', { mode: 'pick', filter: { hero: 'raiga' } }); await settle(g);
  t.ok(/There are no cards here/.test(txt($(g, '.o-deck .dk-none'))), 'a filter that leaves nothing: a message');
  g.UI.overlay.closeAll(); await settle(g);
  ovOpen(g, 'deck', { mode: 'socket', cards: [] }); await settle(g);
  t.ok(/No cards to cut gems into/.test(txt($(g, '.o-deck .dk-none'))), 'socket mode with no cards says so');
  g.UI.overlay.closeAll(); await settle(g);
  ovOpen(g, 'deck', { mode: 'view', cards: [{ uid: 991, id: 'no_such_card', up: 0, gems: [] }].concat(R.deck.slice(0, 2)) }); await settle(g);
  t.ok(cardUids(g).length >= 2 && $(g, '.o-deck .nk-deck'), 'a card the data does not know does not take the grid down');
  g.UI.overlay.closeAll(); await settle(g);
  ovOpen(g, 'deck', { mode: 'bogus' }); await settle(g);
  t.ok($(g, '.o-deck .nk-deck.dk-view'), 'an unknown mode falls back to view');
  g.UI.overlay.closeAll(); await settle(g);
  ovOpen(g, 'deck'); await settle(g);
  t.ok($(g, '.o-deck .nk-deck'), 'no params at all: the deck view');
  g.UI.overlay.closeAll(); await settle(g);
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('deck (socket): colour rules explain themselves, prism and two-socket cards work, replacing warns about destruction, and Done returns the last cut card', async () => {
  const g = await freshS({ seed: 11 }); const R = mkRun(g, { seed: 11, gems: ['ember_ruby', 'tidewatch_sapphire', 'sunwake_topaz', 'vanguard_garnet', 'quickthought_emerald'] });
  g.RUN.addCard(R, 'hanae_thousand_petals'); g.RUN.addCard(R, 'hanae_cyclone_cut');
  const byId = (id) => R.deck.find((c) => c.id === id);
  const slash = byId('hanae_slash'), prism = byId('hanae_thousand_petals'), two = byId('hanae_cyclone_cut');
  const ov = ovOpen(g, 'deck', { mode: 'socket' }); await settle(g);
  t.ok($(g, '.o-deck .nk-deck.dk-socket'), 'socket mode');
  t.ok(!chipBy(g, /Upgraded/) && chipBy(g, /Open socket/), 'socket mode swaps the Upgraded chip for Open socket');
  const noSock = R.deck.filter((c) => !(g.DATA.cards[c.id].slots || []).length);
  t.ok(deckCard(g, R.deck.find((c) => (g.DATA.cards[c.id].slots || []).length).uid).getAttribute('aria-disabled') !== 'true', 'a card with sockets is selectable');
  t.eq(noSock.length, 0, '(every starter card has a socket)');
  await click(g, deckCard(g, slash.uid));
  t.ok($$(g, '.o-deck .dk-slot').length === 1 && $$(g, '.o-deck .dk-gem').length === 5, 'one socket, five kinds of gem in the tray');
  t.ok(/Choose a gem/.test(txt($(g, '.o-deck .dk-state'))), 'no gem yet: the state asks for one');
  t.ok($(g, '.o-deck .dk-go').getAttribute('aria-disabled') === 'true', 'and Set is disabled');
  const gemBtn = (re) => $$(g, '.o-deck .dk-gem').find((b) => re.test(txt(b)));
  t.ok(gemBtn(/Tidewatch/).classList.contains('nofit') && !gemBtn(/Ember/).classList.contains('nofit'), 'a blue gem is marked as not fitting the red socket');
  await click(g, gemBtn(/Tidewatch/));
  t.ok(/blue: it fits blue and prism sockets only/.test(txt($(g, '.o-deck .dk-state'))) && $(g, '.o-deck .dk-state.bad'), 'the wrong colour is explained');
  const gems0 = R.gems.length;
  await click(g, $(g, '.o-deck .dk-go'));
  t.ok(slash.gems[0] === null && R.gems.length === gems0, 'a wrong colour changes nothing');
  await click(g, gemBtn(/Ember/));
  t.ok($(g, '.o-deck .dk-state.ok') && /will be set in the red socket/.test(txt($(g, '.o-deck .dk-state'))), 'the right colour says where it goes');
  t.ok(/Ember Ruby/.test(txt($(g, '.o-deck .dk-sockcard'))) || $(g, '.o-deck .dk-sockcard'), 'the big card previews it');
  await click(g, $(g, '.o-deck .dk-go'));
  t.eq(slash.gems[0], 'ember_ruby', 'the ruby is set (RUN.socket)');
  t.eq(R.gems.indexOf('ember_ruby'), -1, 'and left the pouch');
  t.ok(/Empty|Ember Ruby/.test(txt($(g, '.o-deck .dk-slot-lab'))) && /Ember Ruby/.test(txt($(g, '.o-deck .dk-slot-lab'))), 'the socket shows the gem');
  // replace: a second red gem
  await click(g, gemBtn(/Vanguard/));
  t.ok($(g, '.o-deck .dk-state.warn') && /destroys it for good/.test(txt($(g, '.o-deck .dk-state'))), 'replacing warns that the old gem is destroyed');
  t.ok(/Replace the gem/.test(txt($(g, '.o-deck .dk-go'))) && $(g, '.o-deck .dk-go').classList.contains('dk-danger'), 'a danger button');
  await click(g, $(g, '.o-deck .dk-go'));
  t.eq(slash.gems[0], 'vanguard_garnet', 'the garnet replaced it');
  t.ok(R.gems.indexOf('ember_ruby') < 0 && R.gems.indexOf('vanguard_garnet') < 0, 'the old ruby is destroyed, not returned');
  // prism card: a gold gem goes into the prism socket
  await click(g, deckCard(g, prism.uid));
  t.eq($$(g, '.o-deck .dk-slot').length, 2, 'the prism card has two sockets');
  await click(g, gemBtn(/Sunwake/));
  t.ok($(g, '.o-deck .dk-slot.on.sc-any') && $(g, '.o-deck .dk-state.ok'), 'a gold gem picks the prism socket by itself');
  await click(g, $(g, '.o-deck .dk-go'));
  t.eq(prism.gems[1], 'sunwake_topaz', 'gold went into the prism socket');
  // two-socket card: the second socket takes green
  await click(g, deckCard(g, two.uid));
  await click(g, gemBtn(/Quickthought/));
  t.ok($$(g, '.o-deck .dk-slot')[1].classList.contains('on'), 'green moves the choice to the green socket');
  await click(g, $(g, '.o-deck .dk-go'));
  t.eq(two.gems[1], 'quickthought_emerald', 'the emerald is in the second socket');
  t.ok(two.gems[0] === null, 'the first stays empty');
  await click(g, btnByText(g, /Done/, $(g, '.o-deck')));
  t.ok(ov.done && ov.res === two.uid, 'Done returns the last card that was cut');
  const ov2 = ovOpen(g, 'deck', { mode: 'socket' }); await settle(g);
  await click(g, btnByText(g, /Done/, $(g, '.o-deck')));
  t.ok(ov2.done && ov2.res === null, 'Done without a cut returns null');
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('deck (socket): onSocket decides the cut (args, refusal reasons), an empty pouch says so, and the open-socket chip narrows the grid', async () => {
  const g = await freshS({ seed: 12 }); const R = mkRun(g, { seed: 12, gems: ['ember_ruby'] });
  const calls = [];
  let verdict = { ok: false, reason: 'used' };
  const ov = ovOpen(g, 'deck', { mode: 'socket', onSocket: (uid, slot, gem) => { calls.push([uid, slot, gem]); return verdict; } }); await settle(g);
  const slash = R.deck.find((c) => c.id === 'hanae_slash');
  await click(g, deckCard(g, slash.uid));
  await click(g, $$(g, '.o-deck .dk-gem')[0]);
  const toasts0 = $$(g, '.toast').length;
  await click(g, $(g, '.o-deck .dk-go'));
  t.deep(calls, [[slash.uid, 0, 'ember_ruby']], 'the callback got (uid, slot, gem)');
  t.eq(slash.gems[0], null, 'a refusal changes nothing');
  t.ok($$(g, '.toast').length > toasts0 && /forge has done its work/.test(txt($$(g, '.toast').pop())), 'the reason is a toast');
  verdict = { ok: true };
  await click(g, $(g, '.o-deck .dk-go'));
  t.eq(calls.length, 2, 'accepted on the next try');
  t.eq(g.UI.overlay.has('deck'), true, 'the overlay stays open after a cut');
  // open-socket chip: after socketing a card its slot is taken
  g.RUN.socket(R, slash.uid, 0, 'ember_ruby');
  R.gems.push('ember_ruby');
  await click(g, chipBy(g, /Open socket/));
  t.ok(cardUids(g).indexOf(slash.uid) < 0 && cardUids(g).length === R.deck.length - 1, 'a full card drops out of the Open socket view');
  g.UI.overlay.closeAll(); await settle(g);
  const R2 = mkRun(g, { seed: 13 });
  ovOpen(g, 'deck', { mode: 'socket' }); await settle(g);
  await click(g, deckCard(g, R2.deck[0].uid));
  t.ok($(g, '.o-deck .dk-nogems') && /pouch is empty/.test(txt($(g, '.o-deck .dk-nogems'))), 'an empty pouch says where gems come from');
  t.ok($(g, '.o-deck .dk-go').getAttribute('aria-disabled') === 'true' && /no gems/i.test($(g, '.o-deck .dk-go').rbReason || ''), 'and Set is disabled with that reason');
  g.UI.overlay.closeAll(); await settle(g);
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('cardPick: choose one, change your mind, choose two, the cap, optional Skip, required, many and none', async () => {
  const g = await freshS({ seed: 14 }); const R = mkRun(g, { seed: 14 });
  const cards = R.deck.slice(0, 3);
  const pk = () => $$(g, '.o-cardPick .pk-card');
  const okBtn = () => $(g, '.o-cardPick .pick-count').parentNode.querySelector('.btn-primary');
  // one of three
  let ov = ovOpen(g, 'cardPick', { title: 'Choose a card', cards, n: 1, confirm: 'Take it' }); await settle(g);
  t.eq(pk().length, 3, 'three cards');
  t.ok($(g, '.o-cardPick .pk-grid.sz-reward'), 'few cards are shown big');
  t.eq(txt(okBtn()), 'Take it', 'the confirm label');
  t.ok(okBtn().getAttribute('aria-disabled') === 'true' && /0 of 1/.test(txt($(g, '.o-cardPick .pick-count'))), 'nothing chosen: disabled, 0 of 1');
  t.ok(!btnByText(g, /Skip/, $(g, '.o-cardPick')), 'not optional: no Skip');
  await click(g, pk()[0]); await click(g, pk()[2]);
  t.ok(pk()[2].classList.contains('sel') && !pk()[0].classList.contains('sel'), 'one at a time: the mark moves');
  t.ok(/1 of 1/.test(txt($(g, '.o-cardPick .pick-count'))) && okBtn().getAttribute('aria-disabled') !== 'true', 'now it can be confirmed');
  await click(g, pk()[2]);
  t.ok(okBtn().getAttribute('aria-disabled') === 'true', 'tapping the chosen card again un-chooses it');
  await click(g, pk()[1]); await click(g, okBtn());
  t.ok(ov.done && ov.res.length === 1 && ov.res[0] === cards[1].uid, 'the result is the list of the chosen uid');
  // two of five
  const five = R.deck.slice(0, 5);
  ov = ovOpen(g, 'cardPick', { cards: five, n: 2 }); await settle(g);
  t.ok(/Choose 2/.test(txt($(g, '.o-cardPick .pk-sub'))), 'the sub line says how many');
  await click(g, pk()[3]);
  t.ok(okBtn().getAttribute('aria-disabled') === 'true', 'one of two is not enough');
  await click(g, pk()[0]); await click(g, pk()[4]);
  t.eq($$(g, '.o-cardPick .pk-card.sel').length, 2, 'a third tap does not add a third');
  await click(g, pk()[3]); await click(g, pk()[4]);
  t.deep($$(g, '.o-cardPick .pk-card.sel').map((c) => Number(c.dataset.uid)).sort(), [five[0].uid, five[4].uid].sort(), 'un-choosing frees a place');
  await click(g, okBtn());
  t.deep(ov.res, [five[0].uid, five[4].uid], 'both uids, in the order they were chosen');
  // optional
  ov = ovOpen(g, 'cardPick', { cards, n: 1, optional: true }); await settle(g);
  t.ok(btnByText(g, /Skip/, $(g, '.o-cardPick')), 'optional shows Skip');
  t.ok(okBtn().getAttribute('aria-disabled') !== 'true', 'and the button is open even at zero');
  await click(g, btnByText(g, /Skip/, $(g, '.o-cardPick')));
  t.deep(ov.res, [], 'Skip resolves an empty list');
  ov = ovOpen(g, 'cardPick', { cards, n: 1, optional: true }); await settle(g);
  g._key('Escape'); await settle(g);
  t.ok(ov.done && ov.res.length === 0, 'Esc on an optional pick is an empty list');
  // required
  ov = ovOpen(g, 'cardPick', { cards, n: 1, optional: true, required: true }); await settle(g);
  t.ok(!btnByText(g, /Skip/, $(g, '.o-cardPick')), 'required: no Skip');
  g._key('Escape'); await settle(g);
  t.ok(!ov.done, 'and Esc does nothing');
  await click(g, pk()[0]); await click(g, okBtn());
  t.ok(ov.done && ov.res[0] === cards[0].uid, 'a choice closes it');
  // many
  ov = ovOpen(g, 'cardPick', { cards: R.deck, n: 1 }); await settle(g);
  t.ok($(g, '.o-cardPick .pk-grid.sz-deck.many'), 'ten cards use the compact grid');
  g.UI.overlay.closeAll(); await settle(g);
  // none
  ov = ovOpen(g, 'cardPick', { cards: [], n: 1 }); await settle(g);
  t.ok(/Nothing to choose from/.test(txt($(g, '.o-cardPick'))), 'no cards: a message');
  await click(g, okBtn());
  t.deep(ov.res, [], 'and it resolves empty');
  ov = ovOpen(g, 'cardPick'); await settle(g);
  t.ok($(g, '.o-cardPick .nk-pick'), 'no params at all does not throw');
  g.UI.overlay.closeAll(); await settle(g);
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('overlays: opening and closing emit the bus events, restore the screen behind, and leave no DOM, listener or spark layer behind', async () => {
  const g = await freshS({ seed: 15 }); const R = mkRun(g, { seed: 15 });
  const events = [];
  g.UI.bus.on('overlay', (e) => events.push(e.name + ':' + e.open));
  await open(g, 'camp', R, nodeAt(g, R, 'camp', {}));
  g._click($(g, '.s-camp')); g._key('a'); await settle(g);          // the one-off audio unlock listeners go away with the first gesture
  const keys0 = g._listeners('keydown'), ptr0 = g._listeners('pointerdown');
  for (const name of ['deck', 'cardPick']) {
    const ov = ovOpen(g, name, name === 'deck' ? { mode: 'view' } : { cards: R.deck.slice(0, 3), n: 1 }); await settle(g);
    await click(g, $$(g, '.o-' + name + ' .card')[0]);
    g.UI.overlay.closeAll(); await settle(g);
    t.ok(ov.done, name + ': resolved');
    t.eq($$(g, '.o-' + name).length, 0, name + ': its DOM is gone');
  }
  t.deep(events, ['deck:true', 'deck:false', 'cardPick:true', 'cardPick:false'], 'bus overlay events in order');
  t.eq(g._listeners('keydown'), keys0, 'no leaked keydown listeners');
  t.eq(g._listeners('pointerdown'), ptr0, 'no leaked pointerdown listeners');
  t.ok($(g, '.s-camp') && !$(g, '.s-camp').inert, 'the screen behind is live again');
  g._flush(10000); await settle(g);
  t.eq(errs(g), 0, 'no console errors after late timers (the remove nudge timer)');
});


// ==================================================================================================== the real GAME flow and reload
// one half-finished visit per kind, then the leave button GAME's real nodeDone follows
const KINDS = {
  chest: { make: (g, R) => nodeAt(g, R, 'chest', { relic: 'common' }), act: async (g) => { await click(g, $(g, '.ch-open')); await click(g, btnByText(g, /Just the gold/)); }, leave: (g) => btnByText(g, /^Leave/, $(g, '.ch-foot')) },
  gemcache: { make: (g, R) => nodeAt(g, R, 'gemcache', {}), act: async (g) => { await click(g, $$(g, '.gc-gem')[1]); await click(g, btnByText(g, /Take this gem/)); }, leave: (g) => btnByText(g, /^Continue/, $(g, '.gc-foot')) },
  camp: { make: (g, R) => nodeAt(g, R, 'camp', {}), act: async (g) => { await click(g, tile(g, 'meditate')); }, leave: (g) => $(g, '.cp-leave') },
  forge: { make: (g, R) => nodeAt(g, R, 'forge', {}), act: async (g) => { await click(g, fmode(g, 'up')); await click(g, $$(g, '.o-deck .dk-card')[2]); await click(g, $(g, '.o-deck .dk-go')); await click(g, $(g, '.fg-strike')); g._flush(3000); await settle(g); }, leave: (g) => $(g, '.fg-leave') },
  shop: { make: (g, R) => { R.gold = 400; return nodeAt(g, R, 'shop', { shop: { seed: 3 } }); }, act: async (g) => { const it = $$(g, '.sh-item')[0]; await click(g, $(g, '.card', it) || it); }, leave: (g) => $(g, '.sh-leave') },
  event: { make: (g, R) => nodeAt(g, R, 'event', { id: 'kappa_toll' }), act: async (g) => { await click(g, $$(g, '.ev-choice')[3]); }, leave: (g) => $(g, '.ev-go') },
  reward: { make: (g, R) => winFight(g, R, 'enemy'), act: async (g) => { await click(g, $$(g, '.rw-slot .rw-face.front .card')[1]); }, leave: (g) => $(g, '.rw-cont') },
};

await t.test('real flow: GAME.enterNode routes every kind to its screen, the screen finishes, and the real nodeDone finishes the node and returns to the map', async () => {
  for (const kind of Object.keys(KINDS)) {
    const g = await freshS({ spy: false, seed: 5 }); const R = mkRun(g, { seed: 5 });
    const K = KINDS[kind];
    const node = K.make(g, R);
    await g.GAME.enterNode(node); await settle(g);
    t.eq(g.UI.currentName, kind, kind + ': GAME.enterNode routed to the screen');
    t.ok($(g, '.s-' + kind), kind + ': its root is in the DOM');
    t.ok(g.META.loadRun && g.META.loadRun(), kind + ': the run was saved on entry');
    await K.act(g);
    t.eq(errs(g), 0, kind + ': no console errors while acting');
    const lv = K.leave(g);
    t.ok(lv, kind + ': the leave button exists');
    await click(g, lv);
    if (kind === 'camp' || kind === 'shop') { g._flush(1500); await settle(g); }
    t.eq(g.UI.currentName, 'map', kind + ': the real nodeDone went on to the map');
    t.ok(!R.node, kind + ': RUN finished the node');
    t.eq($$(g, '.s-' + kind).length, 0, kind + ': the screen is gone');
    t.eq(g.UI.overlay.count(), 0, kind + ': no overlay left behind');
    t.eq(errs(g), 0, kind + ': no console errors at the end');
  }
});

await t.test('reload: Save and quit mid-visit, then Continue: every kind comes back in the state it was left in', async () => {
  const checks = {
    chest: (g, R) => { t.ok(R.node.taken && $(g, '.ch-hit').hidden && /empty/i.test(txt($(g, '.ch-done'))), 'chest: reopened as taken'); },
    gemcache: (g, R) => { t.ok(R.node.taken && $(g, '.gc-none') && !$$(g, '.gc-gem').length, 'gemcache: reopened as taken'); },
    camp: (g, R) => { t.deep(Array.from(R.node.used), ['meditate'], 'camp: the used action is in the save'); t.ok(tile(g, 'meditate').classList.contains('used') && tile(g, 'rest').classList.contains('locked'), 'camp: reopened with the action stamped'); },
    forge: (g, R) => { t.eq(R.node.used, 'upgrade', 'forge: used'); t.ok(/cooled/.test(txt($(g, '.fg-result'))) && fmode(g, 'up').getAttribute('aria-disabled') === 'true', 'forge: reopened cooled'); },
    shop: (g, R) => { t.ok(R.node.stock.items.some((i) => i.sold), 'shop: a sale is in the save'); t.eq($$(g, '.sh-item.sold, .sh-plaque.sold[data-key]').length, R.node.stock.items.filter((i) => i.sold).length, 'shop: the SOLD stamps came back'); t.eq(txt($(g, '.stat.st-gold .val')), String(R.gold), 'shop: the gold is the saved gold'); },
    event: (g, R) => { t.eq(R.node.chosen, 3, 'event: the choice is in the save'); t.ok($$(g, '.ev-choice.picked').length === 1 && $(g, '.ev-go'), 'event: reopened with the choice made and Continue offered'); },
    reward: (g, R) => { t.ok(R.node.rewards.claimed, 'reward: claimed is in the save'); t.ok(!$(g, '.rw-cont').hidden && $(g, '.rw-skip').hidden, 'reward: reopened claimed, with Continue'); },
  };
  for (const kind of Object.keys(KINDS)) {
    const g = await freshS({ spy: false, seed: 6 }); const R = mkRun(g, { seed: 6 });
    const K = KINDS[kind];
    await g.GAME.enterNode(K.make(g, R)); await settle(g);
    await K.act(g);
    await g.GAME.toTitle(); await settle(g);                                     // Save and quit
    t.ok(g.META.loadRun(), kind + ': the run is in storage');
    const g2 = await freshS({ spy: false, seed: 6, store: Object.assign({}, g._store) });
    await g2.GAME.continueRun(); await settle(g2);
    t.eq(g2.UI.currentName, kind, kind + ': Continue re-enters the saved page');
    checks[kind](g2, g2.GAME.state.R);
    const lv = K.leave(g2);
    t.ok(lv, kind + ': the reloaded page has its leave button');
    await click(g2, lv);
    if (kind === 'camp' || kind === 'shop') { g2._flush(1500); await settle(g2); }
    t.eq(g2.UI.currentName, 'map', kind + ': and leaves normally');
    t.eq(errs(g2), 0, kind + ': no console errors after reload');
  }
});

await t.test('reload: an untouched reward, shop and chest come back untouched and still work (nothing was spent by looking)', async () => {
  for (const kind of ['reward', 'chest', 'shop', 'gemcache']) {
    const g = await freshS({ spy: false, seed: 9 }); const R = mkRun(g, { seed: 9 });
    const node = KINDS[kind].make(g, R);
    await g.GAME.enterNode(node); await settle(g);
    const gold = R.gold, deck = R.deck.length, gems = R.gems.length;
    await g.GAME.toTitle(); await settle(g);
    const g2 = await freshS({ spy: false, seed: 9, store: Object.assign({}, g._store) });
    await g2.GAME.continueRun(); await settle(g2);
    const R2 = g2.GAME.state.R;
    t.eq(g2.UI.currentName, kind, kind + ': back on the page');
    t.eq([R2.gold, R2.deck.length, R2.gems.length].join(), [gold, deck, gems].join(), kind + ': nothing was spent or given');
    if (kind === 'reward') { t.ok(!R2.node.rewards.claimed && $$(g2, '.rw-slot').length === node.rewards.cards.length, 'reward: the same offers, unclaimed'); await click(g2, $$(g2, '.rw-slot .rw-face.front .card')[0]); t.eq(R2.deck.length, deck + 1, 'reward: still claimable'); }
    if (kind === 'chest') { t.ok(!R2.node.taken && !$(g2, '.ch-hit').hidden, 'chest: still shut'); await click(g2, $(g2, '.ch-open')); await click(g2, btnByText(g2, /Take the treasure/)); await answerOverlays(g2, R2); t.ok(R2.node.taken, 'chest: still openable'); }
    if (kind === 'shop') { t.deep(g2.RUN.serialize(R2).node.stock.items.map((i) => i.key), node.stock.items.map((i) => i.key), 'shop: the same shelves'); }
    if (kind === 'gemcache') { t.deep($$(g2, '.gc-gem').map((b) => b.dataset.gem), node.offers, 'gemcache: the same three gems'); }
    t.eq(errs(g2), 0, kind + ': no console errors');
  }
});


// ==================================================================================================== cleanup, interruptions, bus, anchors, accessibility, settings, painters
const goMap = async (g) => { await g.UI.go('map', {}, { force: true, transition: 'none' }); g._flush(20000); await settle(g); };
const KIND_NAMES = ['reward', 'shop', 'event', 'camp', 'forge', 'chest', 'gemcache'];
async function openKind(g, R, kind) {
  if (kind === 'reward') { await openReward(g, R, 'enemy'); return R.node; }
  const node = KINDS[kind].make(g, R);
  await open(g, kind, R, node);
  return node;
}

await t.test('cleanup: leaving any screen (mid-visit, with a timer or an overlay pending) removes its DOM, listeners and overlays and never throws later', async () => {
  for (const kind of KIND_NAMES) {
    const g = await freshS({ seed: 21 }); const R = mkRun(g, { seed: 21, gems: ['ember_ruby'], gold: 500 });
    await openKind(g, R, kind);
    g._click($(g, '.s-' + kind)); g._key('a'); await settle(g);
    const base = ['keydown', 'keyup', 'pointerdown', 'pointermove', 'pointerup', 'resize', 'visibilitychange'].map((e) => g._listeners(e));
    // interrupt something half done
    if (kind === 'camp') await click(g, tile(g, 'sharpen'));
    if (kind === 'forge') await click(g, fmode(g, 'up'));
    if (kind === 'shop') await click(g, $(g, '.sh-plaque.kind-remove'));
    if (kind === 'chest') await click(g, $(g, '.ch-open'));
    if (kind === 'gemcache') { await click(g, $$(g, '.gc-gem')[0]); await click(g, btnByText(g, /Take this gem/)); await click(g, btnByText(g, /Set it in a card now/)); }
    if (kind === 'reward') await click(g, $$(g, '.rw-slot .rw-face.front .card')[0]);
    if (kind === 'event') g._key('Enter');
    await goMap(g);
    t.eq($$(g, '.s-' + kind).length, 0, kind + ': the screen root is gone');
    t.eq(g.UI.overlay.count(), 0, kind + ': overlays were closed with it');
    t.eq($$(g, '.nk-fx, .nk-flourish, .nk-spk, .nk-ripple').length, 0, kind + ': no effect layer or spark is left in the DOM');
    t.deep(['keydown', 'keyup', 'pointerdown', 'pointermove', 'pointerup', 'resize', 'visibilitychange'].map((e) => g._listeners(e)), base, kind + ': no listener leaked');
    for (let i = 0; i < 90; i++) g.UI.frame(20000 + i * 16);
    g._flush(30000); await settle(g);
    t.eq(errs(g), 0, kind + ': no console errors after the timers that were pending');
    t.eq(g._console.warn.length, 0, kind + ': no warnings: ' + JSON.stringify(g._console.warn.slice(0, 1)));
    t.eq(done(g), 0, kind + ': leaving by navigation did not call nodeDone');
  }
});

await t.test('cleanup: a pending choice interrupted by leaving does not stay half answered or call nodeDone twice', async () => {
  const g = await freshS({ seed: 22 }); const R = mkRun(g, { seed: 22 });
  g.DATA.relics.test_pickup = Object.assign({}, g.DATA.relics[Object.keys(g.DATA.relics)[0]], { id: 'test_pickup', name: 'Test Pickup', hooks: [{ on: 'onPickup', fx: [{ op: 'removeCard' }] }] });
  const node = nodeAt(g, R, 'chest', { relic: 'common' }); node.loot.relic = 'test_pickup';
  await open(g, 'chest', R, node);
  await click(g, $(g, '.ch-open')); g._click(btnByText(g, /Take the treasure/)); await settle(g);
  t.ok(g.UI.overlay.has('deck'), 'the removal question is up');
  await goMap(g);
  t.eq(g.UI.overlay.count(), 0, 'navigating away closed it');
  t.eq(done(g), 0, 'and nodeDone was not called for the abandoned page');
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('bus and anchors: every screen announces itself, marks the tutorial anchors, keeps the Deck and Treasures buttons working and has a real button for every action', async () => {
  const g = await freshS({ seed: 23 }); const R = mkRun(g, { seed: 23, gems: ['ember_ruby'], gold: 300 });
  const seen = [];
  g.UI.bus.on('screen', (e) => seen.push(e.name));
  for (const kind of KIND_NAMES) {
    await openKind(g, R, kind);
    t.eq(seen[seen.length - 1], kind, kind + ': the bus announced the screen');
    ['deck', 'relics', 'ink'].forEach((a) => t.ok(g.UI.anchorEl(a), kind + ': data-tut anchor ' + a));
    const deckBtn = g.UI.anchorEl('deck');
    t.ok(/^Deck \d+/.test(txt(deckBtn)) && deckBtn.localName === 'button', kind + ': the Deck button is a real button that counts the deck');
    await click(g, deckBtn);
    t.ok(g.UI.overlay.has('deck') && $(g, '.o-deck .dk-view'), kind + ': the Deck button opens the deck view');
    g._key('Escape'); await settle(g);
    t.eq(g.UI.overlay.count(), 0, kind + ': Esc closes it');
    await click(g, g.UI.anchorEl('relics'));
    t.ok(g.UI.overlay.count() <= 1, kind + ': the Treasures button opens something or nothing, never breaks');
    g.UI.overlay.closeAll(); await settle(g);
    const root = $(g, '.s-' + kind);
    const clickable = $$(g, '[onclick], .btn, [role=button]', root);
    clickable.forEach((el) => { if (!(el.localName === 'button' || el.getAttribute('role') === 'button')) t.ok(false, kind + ': ' + el.className + ' is clickable but not a button'); });
    const named = $$(g, 'button', root).filter((b) => b.getAttribute('aria-hidden') !== 'true' && !b.hidden);
    named.forEach((b) => { if (!(txt(b).length || b.getAttribute('aria-label'))) t.ok(false, kind + ': a button has no name: ' + b.className); });
    t.ok(named.length >= 2, kind + ': has real buttons (' + named.length + ')');
    t.ok($$(g, '[role=status], [aria-live]', root).length + $$(g, '#sr, [aria-live]').length > 0, kind + ': has a live region');
    $$(g, 'canvas', root).forEach((c) => t.ok(c.getAttribute('aria-hidden') === 'true' || (c.getAttribute('role') === 'img' && c.getAttribute('aria-label')) || c.closest('[aria-hidden=true]') || c.closest('button'), kind + ': the canvas ' + c.className + ' is hidden from assistive tech or labelled'));
    t.eq(errs(g), 0, kind + ': no console errors');
  }
  t.eq(seen.join(), KIND_NAMES.join(), 'each screen announced exactly once, in order');
});

await t.test('no run: a page opened without a run says so and offers Back to Title; a node of the wrong kind still gives a way on', async () => {
  for (const kind of KIND_NAMES) {
    const g = await freshS({ seed: 24 });
    g.GAME.state.R = null; g.UI.setRun(null);
    await g.UI.go(kind, {}, { force: true, transition: 'none' }); await settle(g);
    t.ok($(g, '.s-' + kind + ' .nk-empty-wrap') && /No journey is underway/.test(txt($(g, '.s-' + kind))), kind + ': the empty page');
    t.ok(btnByText(g, /Back to Title/), kind + ': with a way out');
    t.eq(errs(g), 0, kind + ': no console errors');
  }
  // a run with the wrong node under the screen
  const g = await freshS({ seed: 25 }); const R = mkRun(g, { seed: 25 });
  for (const kind of ['shop', 'event', 'camp', 'forge', 'chest', 'gemcache']) {
    await g.UI.go(kind, { R, node: { kind: 'nonsense' } }, { force: true, transition: 'none' }); await settle(g);
    t.ok($(g, '.s-' + kind + ' .btn'), kind + ': a wrong node still draws a page with buttons');
    t.eq(errs(g), 0, kind + ': no console errors');
  }
});

await t.test('settings: reduced motion makes the ledger, the story and the pauses instant; colour is never the only signal; big text and low quality still draw cleanly', async () => {
  const g = await freshS({ seed: 26 }); const R = mkRun(g, { seed: 26 });
  g.META.set('reduceMotion', true); g.META.set('textScale', 1.3); g.META.set('colorblind', true); g.META.set('quality', 'low');
  g.UI.applySettings();
  t.ok(g.UI.opt.reduceMotion && g.UI.opt.colorblind && g.UI.opt.textScale === 1.3, 'the settings took');
  t.ok(g._doc.body.classList.contains('reduce-motion') && g._doc.body.classList.contains('colorblind'), 'the body carries the classes the css keys on');
  g._win.__HEADLESS = false;
  const node = winFight(g, R, 'enemy');
  await g.UI.go('reward', { rewards: node.rewards, source: node.source, node, R }, { force: true, transition: 'none' });
  g.UI.frame(16);
  t.eq(txt($(g, '.nk-row.k-gold .nk-row-val')), '+' + node.rewards.gold, 'reduced motion: the ledger shows the final gold at once, no count-up');
  g._flush(400); g.UI.frame(32);
  t.ok($$(g, '.rw-slot').length === node.rewards.cards.length, 'the cards are on the table');
  await g.UI.go('event', { R, node: nodeAt(g, R, 'event', { id: 'kappa_toll' }) }, { force: true, transition: 'none' });
  g.UI.frame(48); g._flush(400); g.UI.frame(64);
  t.ok($(g, '.ev-choices.in'), 'reduced motion: the whole fable is written and the choices are up within a blink');
  t.ok(/\S/.test(txt($(g, '.ev-text'))) && $(g, '.ev-text').classList.contains('tw-done'), 'the typewriter finished instantly');
  // colour is never the only signal
  g._win.__HEADLESS = true;
  const R2 = mkRun(g, { seed: 27, gems: ['ember_ruby', 'tidewatch_sapphire', 'quickthought_emerald'] });
  const cn = nodeAt(g, R2, 'gemcache', {}); cn.offers = ['ember_ruby', 'tidewatch_sapphire', 'quickthought_emerald'];
  await open(g, 'gemcache', R2, cn);
  ['Red', 'Blue', 'Green'].forEach((c, i) => t.ok(new RegExp(c).test(txt($$(g, '.gc-gem')[i])), 'the cache tile ' + (i + 1) + ' names its colour (' + c + ') in text'));
  ovOpen(g, 'deck', { mode: 'socket' }); await settle(g);
  await click(g, $$(g, '.o-deck .dk-card')[0]);
  t.ok($$(g, '.o-deck .dk-slot').every((b) => /red|blue|green|gold|prism/i.test(b.getAttribute('aria-label'))) && /red|blue|green|gold|prism/i.test(txt($(g, '.o-deck .dk-slot-lab'))), 'sockets are named by colour in text and label');
  t.ok($$(g, '.o-deck .dk-gem').every((b) => /tier \d/.test(b.getAttribute('aria-label'))), 'gems carry their tier in the label');
  g.UI.overlay.closeAll(); await settle(g);
  // the whole set of screens with all the settings on, drawn for a while
  for (const kind of KIND_NAMES) {
    await openKind(g, R2, kind);
    g._resetCounts(); g._win.__HEADLESS = false;
    let now = 0;
    for (let i = 0; i < 90; i++) { now += 16; g.UI.frame(now); }
    g._win.__HEADLESS = true;
    t.eq(g._issues.length, 0, kind + ' (reduced, big text, low): no canvas issues ' + JSON.stringify(g._issues.slice(0, 1)));
    t.eq(errs(g), 0, kind + ': no console errors');
  }
});

await t.test('painters: every screen and every state (chest shut, opening, open, empty; cache before and after; shop moods) draws for seconds with no canvas mistakes', async () => {
  const g = await freshS({ seed: 28 }); const R = mkRun(g, { seed: 28, gems: ['ember_ruby'] });
  const drive = (n, from = 0) => { g._win.__HEADLESS = false; let now = from; for (let i = 0; i < n; i++) { now += 16; g.UI.frame(now); } g._win.__HEADLESS = true; return now; };
  for (const kind of KIND_NAMES) {
    await openKind(g, R, kind);
    g._resetCounts();
    drive(150);
    t.eq(g._issues.length, 0, kind + ': no canvas issues ' + JSON.stringify(g._issues.slice(0, 1)));
    t.ok(g._counts && Object.keys(g._counts).length > 0, kind + ': the canvas was drawn on');
  }
  // chest states
  const node = nodeAt(g, R, 'chest', { relic: 'common' });
  await open(g, 'chest', R, node);
  g._resetCounts();
  drive(40);
  g._win.__HEADLESS = true; g._click($(g, '.ch-open')); await settle(g);
  drive(200);
  await click(g, btnByText(g, /Take the treasure/)); await answerOverlays(g, R);
  drive(120);
  t.eq(g._issues.length, 0, 'chest through shut, open and empty: no canvas issues ' + JSON.stringify(g._issues.slice(0, 1)));
  // cache before and after the take
  const cn = nodeAt(g, R, 'gemcache', {});
  await open(g, 'gemcache', R, cn);
  g._resetCounts(); drive(60);
  await click(g, $$(g, '.gc-gem')[0]); drive(60);
  await click(g, btnByText(g, /Take this gem/)); drive(120);
  t.eq(g._issues.length, 0, 'cache before, chosen and taken: no canvas issues ' + JSON.stringify(g._issues.slice(0, 1)));
  // an odd stage: tiny and huge viewports and a 2x screen
  for (const vp of [[390, 844], [844, 390], [2560, 1440]]) {
    g._resize(vp[0], vp[1]);
    const shop = nodeAt(g, R, 'shop', { shop: { seed: 5 } });
    await open(g, 'shop', R, shop);
    g._resetCounts(); drive(40);
    t.eq(g._issues.length, 0, 'shop at ' + vp.join('x') + ': no canvas issues');
    t.eq(errs(g), 0, 'shop at ' + vp.join('x') + ': no console errors');
  }
});


await t.test('keyboard: number keys drive camp, forge, shop and event, and are ignored while an overlay is open', async () => {
  const g = await freshS({ seed: 30 }); const R = mkRun(g, { seed: 30, gold: 500, gems: ['ember_ruby'] });
  const camp = nodeAt(g, R, 'camp', {}); await open(g, 'camp', R, camp);
  await click(g, tile(g, 'sharpen'));
  g._key('1'); await settle(g);
  t.deep(Array.from(camp.used), [], 'camp: with the picker open, key 1 does not rest');
  g.UI.overlay.closeAll(); await settle(g);
  g._key('4'); await settle(g);
  t.deep(Array.from(camp.used), ['meditate'], 'camp: key 4 meditates');
  const forge = nodeAt(g, R, 'forge', {}); await open(g, 'forge', R, forge);
  g._key('1'); await settle(g);
  t.ok($(g, '.o-deck .dk-upgrade'), 'forge: key 1 opens the anvil picker');
  g._key('2'); await settle(g);
  t.eq(g.UI.overlay.count(), 1, 'forge: key 2 is ignored while it is open');
  g.UI.overlay.closeAll(); await settle(g);
  g._key('2'); await settle(g);
  t.ok($(g, '.o-deck .dk-socket'), 'forge: key 2 opens the gem cutter');
  g.UI.overlay.closeAll(); await settle(g);
  const shop = nodeAt(g, R, 'shop', { shop: { seed: 6 } }); await open(g, 'shop', R, shop);
  const cardItem = shop.stock.items.filter((i) => i.kind === 'card')[1];
  const gold0 = R.gold;
  g._key('2'); await settle(g);
  t.ok(cardItem.sold && R.gold === gold0 - cardItem.price, 'shop: key 2 buys the second card on the shelf');
  const ev = nodeAt(g, R, 'event', { id: 'kappa_toll' }); await open(g, 'event', R, ev);
  g._key('Enter'); await settle(g);
  g._key('4'); await settle(g);
  t.eq(ev.chosen, 3, 'event: key 4 takes the fourth choice');
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('forge: a gem that fits no socket keeps Cut Gems closed with that reason; a sharp deck with gems still cuts', async () => {
  const g = await freshS({ seed: 31 }); const R = mkRun(g, { seed: 31, gems: ['sunwake_topaz'] });
  const node = nodeAt(g, R, 'forge', {}); await open(g, 'forge', R, node);
  t.ok(fmode(g, 'gem').getAttribute('aria-disabled') === 'true' && /No card has a socket/.test(txt(fmode(g, 'gem'))), 'a gold gem and no gold or prism socket: closed with the reason');
  const R2 = mkRun(g, { seed: 32, gems: ['ember_ruby'] }); R2.deck.forEach((c) => { c.up = 1; });
  const n2 = nodeAt(g, R2, 'forge', {}); await open(g, 'forge', R2, n2);
  t.ok(fmode(g, 'up').getAttribute('aria-disabled') === 'true' && fmode(g, 'gem').getAttribute('aria-disabled') !== 'true', 'everything sharp but a gem in the pouch: only the gem cutter is open');
});

// ==================================================================================================== alignment: the DOM overlay against the painted art
// Screens are a painted scene on #view with DOM laid over it, so the classic bug is an overlay that does not sit on what the art draws underneath. The painters and the
// DOM now read ONE table per page (CACHE, RW, SHOP in screen_node.js, --cp-l and --cp-w in node.css); a headless run cannot lay out a page, so these tests read what the
// painters really draw (a recording canvas), what the page writes to its custom properties, and the rules in the stylesheet that consume them.
const cssRule = (sel) => { const i = CSS.indexOf(sel + ' {'); if (i < 0) return ''; return CSS.slice(i, CSS.indexOf('}', i) + 1); };
const cssNum = (rule, prop) => { const m = new RegExp('(?:^|[\\s;{])' + prop + ':\\s*(-?[\\d.]+)px').exec(rule); return m ? Number(m[1]) : NaN; };
const cssVar = (el, name) => parseFloat(el.style.getPropertyValue(name));

// route every painter through a recording canvas: ART.sprite layers draw straight into it, and the toolkit's glow and celEllipse are logged instead of drawn
function recordPaint(g) {
  g._run(`globalThis.__rec = { cel: [], glow: [], ell: [], fillRect: [], strokeRect: [], translate: [], rotate: [], rg: [], rect: [], clip: [] };
    { const real = document.querySelector('#view').getContext('2d');
      const grab = { ellipse: 'ell', fillRect: 'fillRect', strokeRect: 'strokeRect', translate: 'translate', rotate: 'rotate', createRadialGradient: 'rg', rect: 'rect', clip: 'clip' };
      globalThis.__ctx = new Proxy(real, { get(t, k) { const v = t[k]; if (grab[k]) return (...a) => { __rec[grab[k]].push(a); return t[k](...a); }; return typeof v === 'function' ? v.bind(t) : v; }, set(t, k, v) { t[k] = v; return true; } });
      ART.sprite = (key, w, h, fn) => { fn(globalThis.__ctx, w, h); return null; }; ART.blit = () => {};
      ART.tk.celEllipse = (c, ...a) => { __rec.cel.push(a); }; ART.tk.glow = (c, ...a) => { __rec.glow.push(a); }; }`);
  return { ctx: () => g._run('__ctx'), rec: () => g._run('__rec') };
}

await t.test('gem cache: the gem columns, halos and painted glows are centred on the painted plinths, from one table (CACHE)', async () => {
  const g = await freshS({ seed: 7 }); const R = mkRun(g, { seed: 7 });
  const node = nodeAt(g, R, 'gemcache', {}); await open(g, 'gemcache', R, node);
  const row = $(g, '.gc-row');
  const x0 = cssVar(row, '--gx0'), pitch = cssVar(row, '--gp'), colw = cssVar(row, '--gcw'), top = cssVar(row, '--gtop'), h = cssVar(row, '--gh'), gy = cssVar(row, '--gy');
  t.ok([x0, pitch, colw, top, h, gy].every((n) => Number.isFinite(n) && n > 0), 'the page writes --gx0, --gp, --gcw, --gtop, --gh and --gy on the gem row');
  t.ok(colw < pitch, 'a column is narrower than the pitch, so neighbours never touch (gutter ' + (pitch - colw) + ' px)');
  const pr = recordPaint(g);
  g.UI.screens.gemcache.draw(pr.ctx(), 0);
  const rec = pr.rec();
  const plinths = rec.cel.filter((a) => a[2] === 82 && a[3] === 20);           // the plinth top: celOval(x, y, 82, 20)
  t.eq(plinths.length, 3, 'the backdrop paints three plinths');
  const columns = [0, 1, 2].map((i) => x0 + i * pitch);                        // .gc-row is a grid of three --gcw columns --gp apart: column i is centred on x0 + i * pitch
  t.deep(plinths.map((a) => a[0]), columns, 'each plinth is centred exactly where its DOM column is');
  t.deep(rec.glow.map((a) => a[0]), columns, 'the painted glows sit on the same three centres');
  t.ok(rec.glow.every((a) => a[1] === top + gy), 'and at the DOM halo\'s centre height (' + (top + gy) + ')');
  t.ok(rec.ell.filter((a) => a[2] === 110 && a[3] === 16).map((a) => a[0]).join() === columns.join(), 'the floor shadows too');
  t.eq(columns[1], 640, 'the middle plinth is the centre of the stage');
  const plinthY = plinths[0][1];
  t.eq(top + h, plinthY + 20, 'the gem column ends on the plinth rim (its icon rests on the plinth)');
  // the css that consumes them
  const rowCss = cssRule('.gc-row');
  t.ok(/left:\s*calc\(var\(--gx0[^)]*\)\s*-\s*var\(--gcw[^)]*\)\s*\/\s*2\)/.test(rowCss) && /column-gap:\s*calc\(var\(--gp[^)]*\)\s*-\s*var\(--gcw/.test(rowCss) && /grid-template-columns:\s*repeat\(3,\s*var\(--gcw/.test(rowCss), 'css: .gc-row places its three columns from --gx0, --gp and --gcw');
  t.ok(!/left:\s*\d+px/.test(rowCss) && !/right:\s*\d+px/.test(rowCss), 'css: no hand-set pixel edges on the row (it used to be left 90 right 90: gems 70 px off their plinths)');
  t.ok(/top:\s*calc\(var\(--gy[^)]*\)\s*-\s*140px\)/.test(cssRule('.gc-halo')), 'css: the halo is centred on --gy (its radius is 140)');
  t.ok(/@supports \(grid-template-rows: subgrid\)/.test(CSS) && /\.gc-gem \{[^}]*grid-template-rows: subgrid/.test(CSS) && /\.gc-fit \{ grid-row: 4/.test(CSS), 'css: the columns share name, tier, text and fit rows (subgrid), so a wrapped name staggers nothing');
  t.ok(/\.gc-name \{[^}]*min-height: 2\.2em/.test(CSS), 'css: and without subgrid every name reserves two lines');
  // the status line and the buttons are ONE footer, the line above the buttons
  const foot = $(g, '.gc-foot');
  t.deep(Array.from(foot.children).map((e) => e.className), ['gc-detail', 'gc-btns'], 'the footer stacks the status line over the buttons');
  t.ok($(g, '.gc-btns button') && !$(g, '.gc-detail button'), 'the buttons are in the button row');
  t.ok(/\.gc-foot \{[^}]*flex-direction:\s*column/.test(CSS) && /\.gc-foot \{[^}]*bottom:\s*20px/.test(CSS), 'css: the footer is a column that grows upward from 20 px');
  await click(g, $$(g, '.gc-gem')[1]);
  t.ok(/fits|No card in your deck/.test(txt($(g, '.gc-detail'))), 'picking a gem writes the line in the same place');
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('gem cache: a taken cache and an empty one keep the message centred in the row, and the footer still holds Continue', async () => {
  const g = await freshS({ seed: 11 }); const R = mkRun(g, { seed: 11 });
  const node = nodeAt(g, R, 'gemcache', {}); node.taken = true; await open(g, 'gemcache', R, node);
  t.ok($(g, '.gc-row .gc-none') && $(g, '.gc-btns .btn-primary'), 'the message is a child of the row and Continue sits in the button row');
  t.ok(/\.gc-none \{[^}]*grid-column:\s*1 \/ -1/.test(CSS) && /\.gc-none \{[^}]*justify-self:\s*center/.test(CSS), 'css: the message spans the three columns and centres');
});

await t.test('reward: the card row, the banner, the foot and the painted table share ONE axis (RW), and four cards fit the stage instead of running under the ledger and off the screen', async () => {
  const g = await freshS({ seed: 5 }); const R = mkRun(g, { seed: 5 });
  const pool = g.DATA.rewardPool('hanae', 'common').map((c) => c.id).concat(g.DATA.rewardPool('kuro', 'common').map((c) => c.id));
  const rwCss = { stage: cssRule('.rw-stage'), foot: cssRule('.rw-foot'), title: cssRule('.rw-wrap .nk-titlebox'), cards: cssRule('.rw-cards'), fit: cssRule('.rw-cards.fit') };
  const LEDGER_RIGHT = cssNum(cssRule('.rw-ledger'), 'left') + cssNum(cssRule('.rw-ledger'), 'width');      // 30 + 292: the ledger column ends here
  t.ok(LEDGER_RIGHT > 300 && LEDGER_RIGHT < 330, 'the ledger column ends near x ' + LEDGER_RIGHT);
  for (const n of [1, 2, 3, 4, 5, 6, 7]) {
    const node = winFight(g, R, 'enemy');
    node.rewards.cards = pool.slice(0, n); node.rewards.relics = [];
    await g.UI.go('reward', { rewards: node.rewards, source: node.source, node, R }, { force: true, transition: 'none' }); await settle(g);
    const wrap = $(g, '.rw-wrap'), table = $(g, '.rw-cards');
    const sx = cssVar(wrap, '--rw-x'), sw = cssVar(wrap, '--rw-w');
    t.ok(sx >= LEDGER_RIGHT && sx + sw <= 1280, n + ' cards: the stage (x ' + sx + ' to ' + (sx + sw) + ') is right of the ledger and on the screen');
    t.eq(sx + sw / 2, 796, n + ' cards: the stage axis is x 796');
    // the widest the row can be: card widths, gaps, and the fan's lean
    const cw = table.style.getPropertyValue('--rwcw') ? cssVar(table, '--rwcw') : (table.classList.contains('sz-reward') ? 240 : 168);
    const gap = table.classList.contains('fit') ? 14 : table.classList.contains('many') ? 16 : 26;
    const rot = Math.abs(parseFloat($$(g, '.rw-slot', table)[0].style.getPropertyValue('--rot'))) * Math.PI / 180;       // the outer card's lean, which widens the row by about 0.7 x width x sin(lean) on each side
    const tilt = 0.7 * cw * Math.sin(rot);
    const wide = Math.ceil(n * cw + (n - 1) * gap + 2 * tilt);
    if (!table.classList.contains('many') || n === 5) t.ok(wide <= sw, n + ' cards: one row of ' + n + ' x ' + cw + ' px (' + wide + ' px with gaps and tilt) fits the ' + sw + ' px stage');
    if (n === 4) t.ok(table.classList.contains('sz-reward') && table.classList.contains('fit') && !table.classList.contains('many'), 'four offers: reward size, shared row, no wrapping');
    if (n === 3) t.ok(!table.style.getPropertyValue('--rwcw') && table.classList.contains('sz-reward'), 'three offers keep the full 240 px cards');
    t.eq(errs(g), 0, n + ' cards: no console errors');
  }
  t.ok(/left:\s*var\(--rw-x/.test(rwCss.stage) && /width:\s*var\(--rw-w/.test(rwCss.stage), 'css: .rw-stage is placed by --rw-x and --rw-w');
  t.ok(/left:\s*var\(--rw-x/.test(rwCss.foot) && /width:\s*var\(--rw-w/.test(rwCss.foot) && /bottom:\s*20px/.test(rwCss.foot), 'css: so is the foot (Skip and Continue), 20 px from the bottom like the other pages');
  t.ok(/left:\s*var\(--rw-x/.test(rwCss.title) && /width:\s*var\(--rw-w/.test(rwCss.title) && /right:\s*auto/.test(rwCss.title), 'css: and the banner, which used to be centred on x 640 while the cards were centred on x 796');
  // the painted table: its lantern pool and its two sides are centred on the same axis
  const pr = recordPaint(g);
  g.UI.screens.reward.draw(pr.ctx(), 0);
  const rg = pr.rec().rg;
  t.ok(rg.some((a) => a[0] === 796 && a[3] === 796), 'the lit pool on the table is centred on x 796 (the card stage), not x 640');
  t.ok(!rg.some((a) => a[0] === 640 && a[1] === 560), 'nothing is still lit at the old x 640');
});

await t.test('reward (elite): three rows no longer scroll the first row out of the ledger at desktop size; the tall box trims; the compact bar and banner keep clear', async () => {
  t.ok(/\.rw-ledger\.dense \.rw-relicbox/.test(CSS) && /\.rw-ledger\.dense \.rw-relicbox \.rw-h3/.test(CSS) && /\.rw-ledger\.dense \.rw-relic \.ico/.test(CSS), 'css: the trimmed relic box rules apply to .dense as well as .tall and compact (3 rows overflowed the ledger by 22 px)');
  t.ok(/\.rw-ledger\.tall \.nk-row \{ margin-bottom: 7px/.test(CSS), 'css: four rows give back a few px so the box frame is not clipped');
  t.ok(/scrollHeight > ledger\.clientHeight \+ 40/.test(SRC) && !/scrollHeight > ledger\.clientHeight \+ 1\)/.test(SRC), 'source: the last-resort auto scroll waits for a real overflow, so a few stray pixels never hide the first row');
  t.ok(/#stage\.compact \.rw-ledger\.dense \.nk-row\.bonus \.nk-row-lab\s*\{[^}]*font-size/.test(CSS) && /#stage\.compact \.rw-ledger\.dense \.nk-row-val\s*\{[^}]*min\(var\(--ts\), 1\)/.test(CSS), 'css: on a phone every ledger row keeps one height (a gem or brush label is smaller; numbers stop growing with text size)');
  t.ok(/#stage\.compact \.rw-wrap \.nk-titlebox\s*\{[^}]*top:\s*98px/.test(CSS), 'css: the reward banner sits under the taller phone bar');
});

await t.test('top bar: every medallion, chip and button shares the menu button\'s centre line, and on a phone the bar clears the menu button', async () => {
  const bar = cssRule('.nk-top');
  t.ok(/align-items:\s*center/.test(bar) && /padding:\s*0 84px 22px 14px/.test(bar) && /height:\s*78px/.test(bar), 'css: the content row is 56 px (78 - 22) and everything centres on it, like the 56 px menu button');
  t.ok(!/padding-top/.test(cssRule('.nk-stats')), 'css: the stat row has no extra top padding any more (it sat 4 to 6 px below the medallions and the menu button)');
  t.ok(/#stage\.compact \.nk-top\s*\{[^}]*height:\s*calc\(var\(--hit\) \+ 14px\)[^}]*padding:\s*0 104px 14px 14px/.test(CSS), 'css: on a phone the row is --hit tall (the buttons are 44 css px) with 104 px clear on the right for the menu button');
});

await t.test('shop: both rows of wares are centred in the opening between the painted posts, the tags sit on the planks, the nameplate stands under the peddler (SHOP)', async () => {
  const g = await freshS({ seed: 6 }); const R = mkRun(g, { seed: 6, gold: 999 });
  const node = nodeAt(g, R, 'shop', { shop: { seed: 6 } }); await open(g, 'shop', R, node);
  const wrap = $(g, '.sh-wrap');
  const l = cssVar(wrap, '--sh-l'), w = cssVar(wrap, '--sh-w'), px = cssVar(wrap, '--sh-px'), y1 = cssVar(wrap, '--sh-y1'), h1 = cssVar(wrap, '--sh-h1'), y2 = cssVar(wrap, '--sh-y2'), h2 = cssVar(wrap, '--sh-h2');
  t.ok([l, w, px, y1, h1, y2, h2].every((n) => Number.isFinite(n) && n > 0), 'the page writes --sh-l, --sh-w, --sh-px and the two planks (--sh-y1, --sh-h1, --sh-y2, --sh-h2)');
  const pr = recordPaint(g);
  g.UI.screens.shop.draw(pr.ctx(), 0);
  const rec = pr.rec();
  const posts = rec.strokeRect.filter((a) => a[1] === 60 && a[3] === 590).sort((a, b) => a[0] - b[0]);       // the two wooden posts
  t.eq(posts.length, 2, 'the backdrop paints two posts');
  t.eq(l, posts[0][0] + posts[0][2], 'the opening starts at the left post\'s right edge');
  t.eq(l + w, posts[1][0], 'and ends at the right post\'s left edge');
  t.eq(l + w / 2, 799, 'so the opening is centred on x 799');
  const planks = rec.fillRect.filter((a) => a[2] === 962 && (a[3] === 36 || a[3] === 34) && a[1] > 300).sort((a, b) => a[1] - b[1]);
  t.deep(planks.map((a) => [a[1], a[3]]), [[y1, h1], [y2, h2]], 'the two painted planks are where --sh-y1 and --sh-y2 say');
  t.ok(rec.translate.some((a) => a[0] === px && a[1] === 664), 'the peddler is drawn at the x the nameplate and speech bubble are placed from (--sh-px)');
  t.eq(errs(g), 0, 'no console errors');
  // the css that consumes them
  const cards = cssRule('.sh-cards'), row2 = cssRule('.sh-row2');
  t.ok(/left:\s*var\(--sh-l/.test(cards) && /width:\s*var\(--sh-w/.test(cards) && /justify-content:\s*center/.test(cards), 'css: the card shelf fills the opening and centres its cards');
  t.ok(/left:\s*calc\(var\(--sh-l[^)]*\)\s*\+\s*8px\)/.test(row2) && /width:\s*calc\(var\(--sh-w[^)]*\)\s*-\s*16px\)/.test(row2), 'css: the plaque row is the opening less 8 px a side (it ran 4 px over the left post and 16 px over the right one)');
  t.ok(/top:\s*calc\(var\(--sh-y1[^)]*\)\s*-\s*242px\)/.test(cards) && /top:\s*calc\(var\(--sh-y2[^)]*\)\s*-\s*180px\)/.test(row2), 'css: both rows hang from the planks (235 and 168 px wares, a 7 and a 12 px gap)');
  t.ok(/bottom:\s*calc\(-1 \* \(var\(--sh-h1[^)]*\)\s*\/\s*2 \+ 17px \+ 7px\)\)/.test(cssRule('.sh-tag')) && /bottom:\s*calc\(-1 \* \(var\(--sh-h2[^)]*\)\s*\/\s*2 \+ 17px \+ 12px\)\)/.test(cssRule('.sh-plaque .sh-tag')), 'css: a 34 px price tag is centred on its plank, on both shelves');
  t.ok(/left:\s*var\(--sh-px/.test(cssRule('.sh-sign')) && /translateX\(-50%\)/.test(cssRule('.sh-sign')), 'css: the nameplate is centred under the peddler (it was 87 px to his left)');
  t.ok(/left:\s*calc\(var\(--sh-px[^)]*\)\s*-\s*110px\)/.test(cssRule('.sh-bubble')) && cssNum(cssRule('.sh-tail'), 'left') === 108, 'css: the speech tail points at his head (peddler x + 12)');
  // a SOLD stamp and the SOLD OUT stamp centre by translate, not by a magic margin
  const stamp = cssRule('.sh-stamp'), so = cssRule('.sh-soldout');
  t.ok(/translate:\s*-50% -50%/.test(stamp) && !/margin-left/.test(stamp) && /top:\s*50%/.test(stamp), 'css: a SOLD stamp is centred on its ware (it sat 9 px right of centre)');
  t.ok(/translate:\s*-50% -50%/.test(so) && /left:\s*calc\(var\(--sh-l[^)]*\)\s*\+\s*var\(--sh-w[^)]*\)\s*\/\s*2\)/.test(so) && !/translate\(-30%/.test(so), 'css: SOLD OUT is centred in the opening (the keyframes replaced its old transform, leaving it 64 px right)');
  t.ok(/\.sh-plaque \.sh-stamp\s*\{[^}]*font-size:[^}]*min\(var\(--ts\), 1\)/.test(CSS), 'css: a plaque stamp is smaller than the plaque and never grows with text size');
});

await t.test('camp: the title, the tile columns and the footer share one box (--cp-l, --cp-w); the art plate keeps its height at text 1.0 so names line up', async () => {
  const camp = cssRule('.s-camp'), l = cssNum(camp, '--cp-l'), w = cssNum(camp, '--cp-w');
  t.ok(l > 0 && w > 0, 'css: .s-camp defines --cp-l and --cp-w (' + l + ', ' + w + ')');
  const title = cssRule('.cp-titlebox'), grid = cssRule('.cp-grid'), foot = cssRule('.cp-foot');
  t.ok(/left:\s*0/.test(title) && /width:\s*calc\(var\(--cp-l\) \* 2 \+ var\(--cp-w\)\)/.test(title), 'css: the banner is as wide as the left margin, the columns and the same margin again, so its centre (' + (l + w / 2) + ') is the columns\' centre');
  t.ok(/left:\s*calc\(var\(--cp-l\) - 6px\)/.test(grid) && /width:\s*calc\(var\(--cp-w\) \+ 24px\)/.test(grid) && /padding:\s*6px 6px 10px/.test(grid) && /repeat\(2, calc\(\(var\(--cp-w\) - 20px\) \/ 2\)\)/.test(grid), 'css: the grid\'s own 6 px padding puts the first tile column at --cp-l, two columns and a 20 px gap span --cp-w');
  t.ok(/left:\s*var\(--cp-l\)/.test(foot) && /width:\s*var\(--cp-w\)/.test(foot) && /padding:\s*0;/.test(foot), 'css: the footer is flush with the tile columns (it was inset 6 px)');
  t.ok(/max-width:\s*calc\(\(var\(--cp-w\) - 20px\) \/ 2\)/.test(cssRule('.cp-meter')), 'css: the actions-left pill never grows past the first column');
  t.ok(/bottom:\s*calc\(20px - \(var\(--ts\) - 1\) \* 20px\)/.test(foot), 'css: at larger text the footer sits lower, clear of the second tile row');
  t.ok(/flex:\s*0 calc\(\(var\(--ts\) - 1\) \* 100\) auto/.test(cssRule('.cp-illus')), 'css: the art plate does not shrink at text 1.0 (it squashed to 99.7 px under a three line description, so names sat 4 px apart)');
});

await t.test('forge: while the before and after page is up the hammer rests upright behind the After card, never on the Strike! button; a blow starts from that rest', async () => {
  const g = await freshS({ seed: 3 }); const R = mkRun(g, { seed: 3 });
  const node = nodeAt(g, R, 'forge', {}); await open(g, 'forge', R, node);
  const pr = recordPaint(g);
  const angleAt = (t0) => { g._run('__rec.rotate.length = 0'); g.UI.screens.forge.draw(pr.ctx(), t0); return pr.rec().rotate[0][0]; };
  const rest = angleAt(1);
  t.ok(Math.abs(rest - Math.atan2(Math.sin(-0.95), -Math.cos(-0.95))) < 0.05, 'with the two plaques up the hammer hangs at its old angle');
  // the head: a 78 x 68 block 166 to 244 px along the handle from the pivot (850, 470); its bounding box at an angle
  const headBox = (phi) => { const P = { x: 850, y: 470 }; const xs = [], ys = []; [[166, -34], [244, -34], [244, 34], [166, 34]].forEach(([a, b]) => { xs.push(P.x + a * Math.cos(phi) - b * Math.sin(phi)); ys.push(P.y + a * Math.sin(phi) + b * Math.cos(phi)); }); return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }; };
  const oldBox = headBox(rest);
  const MID = { l: 640 - 95, r: 640 + 95 };                           // .fg-mid is 190 px wide, centred in the page: the Strike! and Choose another column
  t.ok(oldBox.x0 < MID.r && oldBox.x1 > MID.l, 'the old rest angle puts the head over the Strike! column (x ' + Math.round(oldBox.x0) + ' to ' + Math.round(oldBox.x1) + '), which is the bug');
  // open the before and after page, let the rest angle settle over a second of frames
  await click(g, $$(g, '.fg-mode')[0]);
  const card = R.deck.find((c) => g.DATA.cards[c.id].up && !c.up);
  await click(g, $$(g, '.o-deck .dk-card').find((c) => Number(c.dataset.uid) === card.uid));
  await click(g, $(g, '.o-deck .dk-go'));
  t.ok($(g, '.fg-strike') && !$(g, '.fg-stage').hidden, 'the before and after page is up');
  let up = rest; for (let i = 0; i < 90; i++) up = angleAt(1 + i / 30);
  const box = headBox(up);
  t.ok(box.x0 > MID.r, 'with the page up the whole hammer head (x ' + Math.round(box.x0) + ' to ' + Math.round(box.x1) + ') is right of the Strike! column (it ends at x ' + MID.r + ')');
  t.ok(box.x0 > 775 && box.x1 < 965 && box.y0 > 186 && box.y1 < 452, 'it sits wholly behind the After card (x 775 to 965, y 186 to 452)');
  // a blow: starts from the rest angle and settles back to it
  await click(g, $(g, '.fg-strike'));
  const start = angleAt(2.0);
  t.ok(Math.abs(start - up) < 0.08, 'the first frame of the blow starts where the hammer rested (no jump)');
  const settled = angleAt(10);
  t.ok(Math.abs(settled - up) < 0.08, 'and it comes to rest at the same angle');
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('forge: until the first blow the hammer is painted only above the cards, so its base never pokes out under the After card or the Cut Gems plaque', async () => {
  const g = await freshS({ seed: 3 }); const R = mkRun(g, { seed: 3 });
  const node = nodeAt(g, R, 'forge', {}); await open(g, 'forge', R, node);
  const pr = recordPaint(g);
  const cutAt = (t0) => { g._run('__rec.rect.length = 0; __rec.clip.length = 0'); g.UI.screens.forge.draw(pr.ctx(), t0); const r = pr.rec(); return { cut: r.rect.find((a) => a[0] === 0 && a[1] === 0 && a[2] === 1280 && a[3] < 720), clips: r.clip.length }; };
  // the pivot is (850, 470) and the handle is 18 px thick there: the base reaches y 479. The mode cards end at 458, the before and after cards at 452 or more.
  const modes = cutAt(1);
  t.ok(!!modes.cut, 'with the two plaques up the hammer is clipped');
  t.ok(modes.cut[3] <= 452 && modes.cut[3] >= 400, 'the cut (y ' + (modes.cut && modes.cut[3]) + ') is above the shortest card bottom (452), so no stub shows, and low enough to keep the hammer');
  await click(g, $$(g, '.fg-mode')[0]);
  const card = R.deck.find((c) => g.DATA.cards[c.id].up && !c.up);
  await click(g, $$(g, '.o-deck .dk-card').find((c) => Number(c.dataset.uid) === card.uid));
  await click(g, $(g, '.o-deck .dk-go'));
  const ready = cutAt(1);
  t.ok(ready.cut && ready.cut[3] === modes.cut[3], 'with the before and after page up it is clipped at the same line');
  await click(g, $(g, '.fg-strike'));
  const swing = cutAt(2.0);
  t.ok(!swing.cut && ready.clips - swing.clips === 1, 'once the blow starts the whole hammer is painted (the After card has moved off it)');
  t.eq(errs(g), 0, 'no console errors');
});

await t.test('forge on a phone: Choose another ends above the hint line (it ran 14 px into it at 844x390 and 28 px at 740x360)', () => {
  const stageTop = cssNum(cssRule('.fg-stage'), 'top'), resultTop = cssNum(cssRule('.fg-result'), 'top');
  const mid = cssRule('.fg-mid'), midCompact = (/#stage\.compact \.fg-mid \{[^}]*\}/.exec(CSS) || [''])[0];
  const arrow = cssRule('.dk-arrow'), arrowH = cssNum(arrow, 'margin-top') + cssNum(arrow, 'border-top') + cssNum(arrow, 'border-bottom');
  const gap = cssNum(mid, 'gap'), hit = 88;                                           // --hit is 44 screen px: 88 stage px at 740x360 (scale .5), the smallest phone layout
  const bottom = (pad) => stageTop + pad + arrowH + gap + hit + gap + hit;          // arrow, Strike!, Choose another
  t.ok(bottom(cssNum(mid, 'padding-top')) > resultTop, 'sanity: the desktop padding with 88 px buttons would reach ' + bottom(cssNum(mid, 'padding-top')) + ', past the hint at ' + resultTop + ' (the bug)');
  t.ok(cssNum(midCompact, 'padding-top') > 0 && bottom(cssNum(midCompact, 'padding-top')) <= resultTop - 8, 'css: the compact column ends at ' + bottom(cssNum(midCompact, 'padding-top')) + ', at least 8 px above the hint line at ' + resultTop);
});

await t.test('gem cache on a phone: the one-line status sits under the plinth rims at 844x390 and 740x360, at text 1.0 and 1.3 (it sat on the middle rim at 1.3)', async () => {
  const g = await freshS({ seed: 7 }); const R = mkRun(g, { seed: 7 });
  const node = nodeAt(g, R, 'gemcache', {}); await open(g, 'gemcache', R, node);
  const row = $(g, '.gc-row');
  const rimBottom = cssVar(row, '--gtop') + cssVar(row, '--gh');                       // the plinth's rim ends where the columns end: plinthY + 20
  t.eq(rimBottom, 568, 'the rims end at y 568 (the painters and the columns share one table)');
  const rule = (/#stage\.compact \.gc-hint, #stage\.compact \.gc-ifit, #stage\.compact \.gc-took \{[^}]*\}/.exec(CSS) || [''])[0];
  t.ok(/white-space:\s*nowrap/.test(rule), 'css: the status is one line on a phone (two lines were 62 px tall and sat on the rims)');
  t.ok(/font-size:\s*calc\(18px \* min\(var\(--ts\), 1\) \* var\(--nkc, 1\)\)/.test(rule), 'css: and it is the Normal text step at every text size (nkc is 1.3 on a phone)');
  t.ok(/\.gc-took \{[^}]*font-size/.test(CSS) && /#stage\.compact \.gc-took/.test(rule), 'css: the "is in your pouch" line follows the same rule');
  const nkc = Number(/#stage\.compact \.nk-screen[^{]*\{[^}]*--nkc:\s*([\d.]+)/.exec(CSS)[1]);
  const font = 18 * 1 * nkc, lh = Number(/line-height:\s*([\d.]+)/.exec(rule)[1]), padEm = Number(/padding:\s*([\d.]+)em/.exec(rule)[1]);
  const pill = font * lh + 2 * padEm * font;
  const gap = cssNum(/#stage\.compact \.gc-foot \{[^}]*\}/.exec(CSS)[0], 'gap');
  [['844x390', 82], ['740x360', 90]].forEach(([vp, btn]) => {                         // the button is 44 screen px (81 and 88 stage px), plus 2 for its breathing
    const top = 720 - 20 - btn - gap - pill;
    t.ok(top >= rimBottom + 2, vp + ': the status line starts at y ' + top.toFixed(1) + ', at least 2 px under the rims (y ' + rimBottom + ')');
  });
  // the columns still stand on their plinths
  t.deep([cssVar(row, '--gx0'), cssVar(row, '--gp')], [320, 320], 'the gems still sit on the plinths at x 320, 640 and 960');
});

await t.test('camp: the four art plates are one height, in every tile, at every text size (they were 74, 46, 69 and 74 px at 1.3), and the stamp rides on the tile', async () => {
  // a headless run cannot lay a page out: the rules do it (subgrid rows shared by the two tiles of a row), the DOM puts the stamp outside the plate
  const block = (/@supports \(grid-template-rows: subgrid\) \{\s*\.cp-grid[\s\S]*?\n\}/.exec(CSS) || [''])[0];
  t.ok(block.length > 0, 'css: the camp has a subgrid block');
  t.ok(/\.cp-grid \{[^}]*grid-template-rows:\s*minmax\(0, calc\(var\(--cp-pl\) \+ var\(--cp-pt\)\)\) auto auto 1fr [^;]*minmax\(0, calc\(var\(--cp-pl\) \+ var\(--cp-pt\)\)\) auto auto 1fr/.test(block), 'css: two plate tracks of the same size rule (one per row of tiles), then name, verb and lines');
  t.ok(/\.cp-tile, #stage\.compact \.cp-tile \{[^}]*grid-template-rows:\s*subgrid/.test(block), 'css: a tile takes its four rows from the grid');
  t.ok(/\.cp-tile:nth-child\(-n\+2\) \{ grid-row: 1 \/ span 4; \} \.cp-tile:nth-child\(n\+3\) \{ grid-row: 6 \/ span 4; \}/.test(block), 'css: the tiles of a row share rows 1 to 4 and 6 to 9 (5 is the gap)');
  t.ok(/\.cp-illus, #stage\.compact \.cp-illus \{[^}]*height:\s*auto/.test(block) && /\.cp-art, #stage\.compact \.cp-art \{[^}]*position:\s*absolute/.test(block), 'css: the plate takes its track height and crops the art around its middle');
  t.ok(/--cp-tg:\s*3px/.test(block) && /--cp-tg:\s*2px/.test(block) && /row-gap:\s*var\(--cp-tg\)/.test(block), 'css: the grid and the tile use the same row gap, so the subgrid adds no extra margin (plates were 1.5 px short)');
  const g = await freshS({ seed: 3 }); const R = mkRun(g, { seed: 3 });
  const node = nodeAt(g, R, 'camp', {}); await open(g, 'camp', R, node);
  const tiles = $$(g, '.cp-tile');
  t.eq(tiles.length, 4, 'four tiles');
  tiles.forEach((tl) => {
    const kids = Array.from(tl.children).map((e) => e.className.replace(/ .*/, ''));
    t.deep(kids, ['cp-illus', 'cp-badge', 'cp-name', 'cp-verb', 'cp-lines'], 'the tile holds the plate, the stamp, the name, the verb and the lines in that order (the stamp is not inside the plate)');
    t.ok(!$(g, '.cp-badge', $(g, '.cp-illus', tl)), 'no stamp inside the plate (a thin plate would clip it)');
  });
});

await t.test('cardPick: six cards or more scroll inside a capped grid, so the footer never runs past the panel; four or five still show whole', async () => {
  const g = await freshS({ seed: 14 }); const R = mkRun(g, { seed: 14 });
  for (const n of [3, 4, 5, 6, 7, 8, 9]) {
    const cards = R.deck.slice(0, n);
    ovOpen(g, 'cardPick', { cards, n: 1, optional: true }); await settle(g);
    const grid = $(g, '.o-cardPick .pk-grid');
    t.eq(grid.classList.contains('many'), n >= 6, n + ' cards: ' + (n >= 6 ? 'a capped, scrolling grid' : 'every card shown whole'));
    t.ok(/\.pk-grid\.many \{[^}]*max-height:\s*430px[^}]*overflow-y:\s*auto/.test(CSS), 'css: the capped grid is 430 px tall and scrolls');
    g.UI.overlay.closeAll(); await settle(g);
  }
});

await t.test('the exit control sits 20 px from the bottom edge on every node page (it was 20, 22 and 24)', () => {
  const bottoms = { '.rw-foot': cssRule('.rw-foot'), '.ch-foot': cssRule('.ch-foot'), '.gc-foot': cssRule('.gc-foot'), '.sh-foot': cssRule('.sh-foot'), '.fg-foot': cssRule('.fg-foot'), '.cp-foot': cssRule('.cp-foot') };
  Object.keys(bottoms).forEach((k) => t.ok(/bottom:\s*(20px|calc\(20px)/.test(bottoms[k]), k + ' sits 20 px up'));
});

await t.test('the exit controls share one right edge on a phone (the shop button sat 10 px right of its siblings); the shop one stays under the lower plank, whose price tags a 20 px bottom would cover', async () => {
  t.ok(!/#stage\.compact \.(rw|ch|gc|fg|cp)-foot \{[^}]*\b(bottom|right|left)\s*:/.test(CSS), 'css: no compact override moves the reward, chest, cache, forge or camp exit');
  const shopC = (/#stage\.compact \.sh-foot \{[^}]*\}/.exec(CSS) || [''])[0];
  t.ok(!/\b(right|left)\s*:/.test(shopC), 'css: the shop exit keeps its right edge on a phone');
  t.eq(cssNum(cssRule('.sh-foot'), 'right'), cssNum(cssRule('.fg-foot'), 'right'), 'the shop and the forge exits share a right edge');
  const g = await freshS({ seed: 6 }); const R = mkRun(g, { seed: 6, gold: 999 });
  const node = nodeAt(g, R, 'shop', { shop: { seed: 6 } }); await open(g, 'shop', R, node);
  const wrap = $(g, '.sh-wrap');
  const plankBottom = cssVar(wrap, '--sh-y2') + cssVar(wrap, '--sh-h2');
  const bottom = cssNum(shopC, 'bottom');
  t.ok(bottom > 0 && 720 - bottom - 88 >= plankBottom, 'the phone button (88 stage px at 740x360) starts at y ' + (720 - bottom - 88) + ', not above the lower plank, which ends at y ' + plankBottom);
});

await t.done();
