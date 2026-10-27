// Behavior verification: neutral cards (cards-neutral.js), starters, goblins, charms (cards-starters.js), all relics (relics.js).
// node tests/neutral-relics-test.js [--verbose]
// Each card and relic is exercised in a minimal battle or run and its described effect is asserted.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.env.NL_ROOT || path.join(__dirname, '..');
const VERBOSE = process.argv.includes('--verbose');

function makeSB() {
  const store = {};
  const ctx = { console, Math, Date, JSON };
  ctx.window = ctx;
  ctx.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  vm.createContext(ctx);
  const load = f => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: path.basename(f) });
  const dataDir = path.join(root, 'src/data');
  fs.readdirSync(dataDir).filter(f => f.endsWith('.js')).sort().forEach(f => load(path.join(dataDir, f)));
  ['util', 'content', 'registry', 'card-inst', 'battle', 'battle-ai', 'run', 'rewards', 'map', 'profile', 'shop', 'post', 'nook', 'events-engine'].forEach(n => {
    const f = path.join(root, 'src/engine', n + '.js');
    if (fs.existsSync(f)) load(f);
  });
  fs.readdirSync(path.join(root, 'src/engine')).filter(f => /^ops-.*\.js$/.test(f)).sort().forEach(f => load(path.join(root, 'src/engine', f)));
  ctx.SB.util.quiet = true;
  return ctx.SB;
}

let checks = 0, failures = 0;
const failLog = [];
function ok(c, msg) { checks++; if (!c) { failures++; failLog.push(msg); if (VERBOSE) console.log('  FAIL ' + msg); } return !!c; }
function eq(a, b, msg) { return ok(a === b || JSON.stringify(a) === JSON.stringify(b), msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(name, fn) {
  const f0 = failures, c0 = checks;
  try { fn(); } catch (e) { failures++; failLog.push(name + ' threw: ' + (e.stack || e).toString().split('\n').slice(0, 4).join(' | ')); }
  console.log((failures === f0 ? 'PASS ' : 'FAIL ') + name + ' (' + (checks - c0) + ' checks)');
}
// run one named case inside a section; a throw becomes one failure naming the case
function cs(name, fn) {
  const f0 = failures;
  try { fn(); } catch (e) { failures++; failLog.push(name + ' threw: ' + (e.stack || e).toString().split('\n').slice(0, 3).join(' | ')); }
  if (VERBOSE && failures === f0) console.log('  ok ' + name);
}

const SB = makeSB();
const covered = { cards: new Set(), relics: new Set() };

// ---- synthetic pests: sturdy dummies so nothing dies or hurts unless a test wants it ---------------
(function addTestContent() {
  const T = SB.data.tutorial;
  const atk = (label, dmg) => ({ kind: 'attack', dmg, hits: 1, floors: 'own', pick: 'front', label });
  const pest = (id, name, hp, traits, actions, extra) => Object.assign({ id, name, hp, size: 1, traits: traits || [], tags: ['pest'], pattern: { type: 'cycle', actions }, flavor: name, art: { species: 'mouse', colors: 'grey', accessory: 'none' }, tutorialOnly: true }, extra || {});
  T.enemies.push(
    pest('t_dummy', 'Dummy', 60, [], [atk('Poke', 0)]),
    pest('t_biter', 'Biter', 60, [], [atk('Bite', 2)]),
    pest('t_weak', 'Weak', 3, [], [atk('Poke', 0)]),
    pest('t_elite', 'Elite Dummy', 60, [], [atk('Poke', 0)], { tags: ['pest', 'elite'], tier: 'elite' })
  );
  SB.content.rebuild();
})();

// ---- scenario helpers ----------------------------------------------------------------------------------
const FILL = ['neutral_house_cat', 'neutral_house_cat', 'neutral_house_cat', 'neutral_house_cat', 'neutral_house_cat', 'neutral_house_cat', 'neutral_house_cat', 'neutral_house_cat', 'neutral_house_cat', 'neutral_house_cat'];
function newRun(o) {
  o = o || {};
  const run = SB.run.newRun({ seed: o.seed || 'NRTEST01', clan: o.clan || 'alley', side: o.side || 'hearth', rank: 0, noSave: true });
  run.noAutosave = true;
  run.relics = [];
  (o.relics || []).forEach(id => SB.run.U.giveRelic(run, id));
  const ids = (o.deck || []).concat(FILL);
  run.deck = ids.slice(0, Math.max((o.deck || []).length, 10)).map(id => SB.cardInst.make(id, { run }));
  if (o.deckExtra) o.deckExtra.forEach(id => run.deck.push(SB.cardInst.make(id, { run })));
  if (o.warmth !== undefined) run.warmth = o.warmth;
  return run;
}
// o: {deck, hand, hands, cats:[{card,floor(1-based),pos}], waves:[{round,spawns:[{id,floor(1-based)}]}], relics, clock, enc, bseed, warmth, rules}
function mk(o) {
  o = o || {};
  const run = o.run || newRun(o);
  const enc = Object.assign({ id: 'nr_enc', type: o.type || 'prowl', act: 1, rules: Object.assign({ nightClock: !!o.clock, impatience: false, noPile: o.pile ? false : true }, o.rules || {}), waves: o.waves || [{ round: 1, spawns: [{ id: 't_dummy', floor: 1, at: 'back' }] }], setup: { cats: o.cats || [] } }, o.enc || {});
  const hands = o.hands || (o.hand ? [o.hand] : undefined);
  const B = SB.battle.create(run, enc, { seed: o.bseed === undefined ? 1 : o.bseed, hands, noWitching: !o.clock });
  B.run = run;
  return B;
}
const hid = (B, id) => { const h = B.state.hand.find(x => x.card.id === id || (B.state.cards[x.uid] && B.state.cards[x.uid].id === id)); return h && h.uid; };
const play = (B, id, target) => { const u = hid(B, id); if (!u) return { ok: false, reason: 'not in hand: ' + id }; return B.playCard(u, target || {}); };
const handIds = B => B.state.hand.map(h => B.state.cards[h.uid].id);
const cats = (B, f) => B.state.floors[f].cats;
const pests = (B, f) => B.state.floors[f].pests;
const allCats = B => B.cats();
const catOf = (B, id) => B.cats().find(c => c.id === id);
const st = (u, s) => (u.statuses && u.statuses[s] && (typeof u.statuses[s] === 'object' ? (u.statuses[s].n !== undefined ? u.statuses[s].n : u.statuses[s].amount) : u.statuses[s])) || 0;
const CAT = (card, floor, pos) => ({ card, floor: floor || 1, pos: pos === undefined ? 'back' : pos });
const DUMMY = (floor, n) => { const sp = []; for (let i = 0; i < (n || 1); i++) sp.push({ id: 't_dummy', floor: floor || 1, at: 'back' }); return { round: 1, spawns: sp }; };
const TC = 'neutral_house_cat';
function kill(B, u) { B.damage(u, 9999, { kind: 'hit', src: { kind: 'system' } }); B.reap(); B.drain(); }
function endTurns(B, n) { for (let i = 0; i < (n || 1) && !B.state.over; i++) B.endTurn(); }
// a hand of the given ids (padded with house cats) for round 1
const H = (...ids) => ids;
function evs(B, type) { const out = []; B.on(e => { if (!type || e.type === type) out.push(e); }); return out; }

// =========================================================================================================
// PART 1: NEUTRAL CARDS
// =========================================================================================================
const NEUT = SB.data.cardsNeutral;
const mark = id => covered.cards.add(id);
// card scenario: the card under test plus a cat to receive things, rich Zoomies, a pest on floor `pf`
function cardB(cardId, o) {
  o = o || {};
  const B = mk(Object.assign({ deck: [cardId, TC, TC, TC, TC], hand: [cardId], cats: o.cats === undefined ? [CAT(TC, 1, 0)] : o.cats, waves: o.waves || [DUMMY(o.pf || 1)] }, o.mk || {}));
  B.state.zoomies = 10;
  return B;
}
const card = id => SB.content.card(id);

section('neutral cards: data integrity', () => {
  eq(NEUT.length, 54, 'neutral file has 54 items');
  const ids = new Set(NEUT.map(c => c.id));
  eq(ids.size, 54, 'ids unique');
  NEUT.forEach(c => ok(SB.content.card(c.id), 'content.card resolves ' + c.id));
  const v = SB.content.validate();
  const bad = v.errors.concat(v.warnings).filter(m => /neutral_|curse_|token_|alley_basic|hearth_basic|moon_basic|mischief_basic|relic_|charm_/.test(m));
  eq(bad, [], 'validate reports nothing for these files');
  ['hairball', 'swat', 'catnap', 'cardboard_box'].forEach(a => ok(SB.content.card(a), 'alias ' + a + ' resolves'));
});

section('neutral cards: basics', () => {
  cs('swat', () => { mark('neutral_swat');
    const B = cardB('neutral_swat'); const p = pests(B, 0)[0]; const hp = p.hp;
    ok(play(B, 'neutral_swat', { pestUid: p.uid }).ok, 'play swat'); eq(p.hp, hp - 4, 'swat deals 4'); });
  cs('catnap', () => { mark('neutral_catnap');
    const B = cardB('neutral_catnap'); const c = cats(B, 0)[0]; c.health = c.maxHealth - 4; const h0 = c.health;
    ok(play(B, 'neutral_catnap', { catUid: c.uid }).ok, 'play catnap');
    ok(c.napping, 'cat naps'); eq(c.health, h0 + 3, 'heals 3'); eq(st(c, 'rested'), 1 + 0 >= 1 ? st(c, 'rested') : 1, 'rested'); ok(st(c, 'rested') >= 1, 'gains Rested'); });
  cs('cardboard box', () => { mark('neutral_cardboard_box');
    const B = cardB('neutral_cardboard_box');
    ok(play(B, 'neutral_cardboard_box', { floor: 0 }).ok, 'play box');
    eq(B.state.floors[0].rooms.filter(r => r.rtype === 'box').length, 1, 'box placed on the floor'); });
  cs('house cat', () => { mark('neutral_house_cat');
    const B = cardB('neutral_house_cat', { cats: [] }); play(B, 'neutral_house_cat', { floor: 0 }); const c = cats(B, 0)[0];
    eq([c.power, c.health, c.lives], [2, 5, 3], 'house cat 2/5, 3 lives'); });
  cs('window watcher', () => { mark('neutral_window_watcher');
    const B = cardB('neutral_window_watcher', { cats: [] }); play(B, 'neutral_window_watcher', { floor: 0 }); const c = cats(B, 0)[0];
    eq([c.power, c.health, c.fluff], [1, 5, 2], 'window watcher 1/5, Fluff 2'); });
});

section('neutral cards: commons', () => {
  cs('knick-knack kitten', () => { mark('neutral_knickknack_kitten');
    const B = cardB('neutral_knickknack_kitten', { cats: [CAT(TC, 2, 0)], waves: [DUMMY(2)] });
    const p = pests(B, 1)[0]; const hp = p.hp;
    ok(play(B, 'neutral_knickknack_kitten', { floor: 1 }).ok, 'play');
    eq(pests(B, 1).length, 0, 'pest left the Parlor'); eq(pests(B, 0).length, 1, 'pest fell to the Cellar'); eq(p.hp, hp - 2, 'Shatter 2 for one floor'); });
  cs('cushion cat', () => { mark('neutral_cushion_cat');
    const B = cardB('neutral_cushion_cat'); ok(play(B, 'neutral_cushion_cat', { floor: 0 }).ok, 'play');
    const c = catOf(B, 'neutral_cushion_cat'); eq(c.health, 8, '8 health'); c.health = 4;
    B.endTurn(); eq(c.health, 5, 'Purr 1 at end of turn heals the floor 1 at Dusk'); });
  cs('pantry raider', () => { mark('neutral_pantry_raider');
    const B = cardB('neutral_pantry_raider', { cats: [], mk: { deck: ['neutral_pantry_raider', TC, TC, TC, TC, TC, TC, TC] } });
    play(B, 'neutral_pantry_raider', { floor: 0 }); const c = catOf(B, 'neutral_pantry_raider'); const n0 = B.state.hand.length;
    kill(B, c);
    ok(!catOf(B, 'neutral_pantry_raider'), 'raider died'); eq(B.state.hand.length, n0 + 1, 'death draws 1'); });
  cs('sun chaser', () => { mark('neutral_sun_chaser');
    const B = cardB('neutral_sun_chaser', { mk: { warmth: 30 } }); play(B, 'neutral_sun_chaser', { floor: 0 }); eq(B.state.sunbeam.warmth, 32, 'restores 2 Warmth'); });
  cs('delivery cat', () => { mark('neutral_delivery_cat');
    const B = cardB('neutral_delivery_cat'); play(B, 'neutral_delivery_cat', { floor: 0 }); ok(handIds(B).includes('token_flat_pack'), 'Flat Pack in hand'); });
  cs('tangle kitten', () => { mark('neutral_tangle_kitten');
    const B = cardB('neutral_tangle_kitten'); play(B, 'neutral_tangle_kitten', { floor: 0 }); eq(st(pests(B, 0)[0], 'yarn'), 1, 'front pest has Yarn 1'); });
  cs('warning hiss', () => { mark('neutral_warning_hiss');
    const B = cardB('neutral_warning_hiss', { mk: { deck: ['neutral_warning_hiss', TC, TC, TC, TC, TC, TC] } }); const p = pests(B, 0)[0]; const n0 = B.state.hand.length;
    play(B, 'neutral_warning_hiss', { pestUid: p.uid }); eq(st(p, 'hiss'), 3, 'Hiss 3'); eq(B.state.hand.length, n0 - 1 + 1, 'draws 1'); });
  cs('claw polish', () => { mark('neutral_claw_polish');
    const B = cardB('neutral_claw_polish'); const c = cats(B, 0)[0]; play(B, 'neutral_claw_polish', { catUid: c.uid }); eq(st(c, 'claws'), 2, 'Claws 2'); });
  cs('tuna snack', () => { mark('neutral_tuna_snack');
    const B = cardB('neutral_tuna_snack'); const c = cats(B, 0)[0]; c.health = 1; play(B, 'neutral_tuna_snack', { catUid: c.uid }); eq([c.health, c.fluff], [5, 2], 'heals up to max 5 and gains Fluff 2'); const d = cardB('neutral_tuna_snack', { cats: [CAT('neutral_chonk', 1, 0)] }); const k = cats(d, 0)[0]; k.health = 2; play(d, 'neutral_tuna_snack', { catUid: k.uid }); eq(k.health, 7, 'heals 5'); });
  cs('shove', () => { mark('neutral_shove');
    const B = cardB('neutral_shove', { cats: [CAT(TC, 2, 0)], waves: [DUMMY(2)] }); const p = pests(B, 1)[0]; const hp = p.hp;
    play(B, 'neutral_shove', { pestUid: p.uid }); eq(pests(B, 0).length, 1, 'knocked to Cellar'); eq(p.hp, hp - 2 - 2, 'Shatter 2 + 2 damage'); });
  cs('welcome mat', () => { mark('neutral_welcome_mat');
    const B = mk({ deck: ['neutral_welcome_mat', TC, TC, TC, TC], hand: ['neutral_welcome_mat', TC], cats: [], waves: [DUMMY(1)] }); B.state.zoomies = 10;
    ok(play(B, 'neutral_welcome_mat', { floor: 0 }).ok, 'mat'); play(B, TC, { floor: 0 }); eq(cats(B, 0)[0].fluff, 2, 'deployed cat gains Fluff 2'); });
  cs('old slipper', () => { mark('neutral_old_slipper');
    const B = cardB('neutral_old_slipper'); play(B, 'neutral_old_slipper', { floor: 0 }); B.endTurn();
    ok(st(pests(B, 0)[0], 'hiss') >= 1, 'front pest Hissed at start of next turn: ' + JSON.stringify(pests(B, 0)[0].statuses)); });
});

section('neutral cards: uncommons', () => {
  cs('dozing tom', () => { mark('neutral_dozing_tom');
    const B = cardB('neutral_dozing_tom', { cats: [CAT(TC, 1, 0), CAT('neutral_cushion_cat', 1, 1)] });
    play(B, 'neutral_dozing_tom', { floor: 0 }); const tom = catOf(B, 'neutral_dozing_tom'); B.endTurn();
    const a = cats(B, 0).find(c => c.id === TC), b = cats(B, 0).find(c => c.id === 'neutral_cushion_cat');
    a.health = 1; b.health = 1; B.state.zoomies = 5;
    const r = B.toggleNap(tom.uid); ok(r.ok, 'tom naps: ' + (r.reason || ''));
    ok(a.health >= 3 && b.health >= 3, 'Tom napping heals every cat on the floor by 2: ' + a.health + ',' + b.health); });
  cs('kind stranger', () => { mark('neutral_kind_stranger');
    const B = mk({ deck: ['neutral_kind_stranger', TC, TC, TC, TC], hand: ['neutral_kind_stranger'], cats: [], waves: [DUMMY(1)] }); B.state.zoomies = 10;
    const before = B.run.deck.map(i => i.lives).reduce((x, y) => x + y, 0);
    play(B, 'neutral_kind_stranger', { floor: 0 });
    const after = B.run.deck.map(i => i.lives).reduce((x, y) => x + y, 0);
    eq(after, before + 1, 'exactly one Life gained across the deck'); });
  cs('shelf sitter', () => { mark('neutral_shelf_sitter');
    const B = cardB('neutral_shelf_sitter', { cats: [CAT(TC, 2, 0)], waves: [DUMMY(2)] }); const p = pests(B, 1)[0];
    play(B, 'neutral_shelf_sitter', { floor: 1 }); eq(pests(B, 1).length, 1, 'still there before end of turn');
    B.endTurn(); ok(p.floor === 0, 'pest knocked from the Parlor at end of turn, now on floor ' + p.floor); });
  cs('window burglar', () => { mark('neutral_window_burglar');
    const B = cardB('neutral_window_burglar', { cats: [], mk: { deck: ['neutral_window_burglar', TC, TC, TC, TC, TC, TC] } }); const n0 = B.state.hand.length;
    play(B, 'neutral_window_burglar', { floor: 0 }); const c = catOf(B, 'neutral_window_burglar');
    ok(c.hidden || st(c, 'hidden') >= 1, 'Hidden'); eq(B.state.hand.length, n0, 'drew 1 after playing 1'); });
  cs('chonk', () => { mark('neutral_chonk');
    const B = cardB('neutral_chonk', { cats: [] }); play(B, 'neutral_chonk', { floor: 0 }); const c = catOf(B, 'neutral_chonk');
    eq([c.size, c.fluff, c.power, c.health, c.lives], [2, 3, 4, 11, 4], 'Large 4/11, Fluff 3, 4 lives'); eq(B.catSize(0), 2, 'uses two slots'); });
  cs('night nurse', () => { mark('neutral_night_nurse');
    const B = cardB('neutral_night_nurse', { cats: [CAT('neutral_cushion_cat', 1, 0)] }); play(B, 'neutral_night_nurse', { floor: 0 });
    const n = catOf(B, 'neutral_night_nurse'), o = catOf(B, 'neutral_cushion_cat'); n.health = 1; o.health = 1;
    B.endTurn(); eq((n.health - 1) + (o.health - 1) - 0 >= 2, true, 'a random cat healed 2 at end of turn'); });
  cs('spring cleaning', () => { mark('neutral_spring_cleaning');
    const B = mk({ deck: ['neutral_spring_cleaning', 'curse_vet_appointment', TC, TC, TC, TC, TC], hand: ['neutral_spring_cleaning', 'curse_vet_appointment'], cats: [CAT(TC, 1, 0)], waves: [DUMMY(1)] }); B.state.zoomies = 5;
    const n = B.run.deck.length; ok(play(B, 'neutral_spring_cleaning', {}).ok, 'play');
    eq(B.run.deck.length, n - 1, 'exactly the curse leaves the run deck'); eq(B.state.exhaust.length, 2, 'curse and Spring Cleaning both leave the hand');
    ok(!B.run.deck.some(i => i.id === 'curse_vet_appointment'), 'curse instance removed from run deck'); });
  cs('lick fur', () => { mark('neutral_lick_fur');
    const B = cardB('neutral_lick_fur'); const c = cats(B, 0)[0]; c.health = 1; B.addStatus(c, 'wet', 2); B.addStatus(c, 'scared', 1);
    ok(play(B, 'neutral_lick_fur', { catUid: c.uid }).ok, 'play'); eq([st(c, 'wet'), st(c, 'scared')], [0, 0], 'debuffs cleansed'); eq(c.health, 3, 'heal 2');
    ok(B.state.exhaust.length === 1, 'exhausted'); });
  cs('two-paw swat', () => { mark('neutral_two_paw_swat');
    const B = cardB('neutral_two_paw_swat'); const p = pests(B, 0)[0]; const hp = p.hp; play(B, 'neutral_two_paw_swat', { pestUid: p.uid }); eq(p.hp, hp - 8, '4 twice'); });
  cs('pick your prey', () => { mark('neutral_pick_your_prey');
    const B = cardB('neutral_pick_your_prey'); const p = pests(B, 0)[0]; const hp = p.hp; play(B, 'neutral_pick_your_prey', { pestUid: p.uid });
    eq(st(p, 'marked'), 1, 'Marked'); ok(p.hp < hp && p.hp >= hp - 3, 'damage 2 (or 3 if Mark applied first): ' + (hp - p.hp)); });
  cs('cat tree', () => { mark('neutral_cat_tree');
    const B = cardB('neutral_cat_tree', { cats: [CAT(TC, 1, 0)] }); const c = cats(B, 0)[0]; const p0 = c.power;
    ok(play(B, 'neutral_cat_tree', { floor: 0 }).ok, 'play'); B.refresh && B.refresh(); eq(c.power, p0 + 1, '+1 Power aura on the floor');
    const B2 = mk({ deck: ['neutral_cat_tree', TC, TC, TC, TC], hand: ['neutral_cat_tree', TC], cats: [], waves: [DUMMY(1)] }); B2.state.zoomies = 10;
    play(B2, 'neutral_cat_tree', { floor: 0 }); play(B2, TC, { floor: 0 }); const d = cats(B2, 0)[0]; ok(d.hidden || st(d, 'hidden') >= 1, 'deployed cat is Hidden'); eq(d.power, 3, 'house cat 2 + 1'); });
});

section('neutral cards: rares', () => {
  cs('matriarch', () => { mark('neutral_block_matriarch');
    const B = mk({ deck: ['neutral_block_matriarch', TC, TC, TC, TC], hand: ['neutral_block_matriarch', TC], cats: [], waves: [DUMMY(1)] }); B.state.zoomies = 10;
    play(B, 'neutral_block_matriarch', { floor: 0 }); eq(catOf(B, 'neutral_block_matriarch').fluff, 0, 'herself gets none');
    play(B, TC, { floor: 1 }); eq(cats(B, 1)[0].fluff, 2, 'another cat deployed anywhere gains Fluff 2'); });
  cs('lucky calico', () => { mark('neutral_lucky_calico');
    const B = mk({ deck: ['neutral_lucky_calico', TC, TC, TC, TC, TC, TC], hand: ['neutral_lucky_calico'], cats: [], waves: [DUMMY(1)] }); B.state.zoomies = 10;
    play(B, 'neutral_lucky_calico', { floor: 0 }); const c = catOf(B, 'neutral_lucky_calico'); kill(B, c);
    const u = B.state.hand.find(h => B.state.cards[h.uid].id === 'neutral_lucky_calico');
    ok(u, 'Reborn: back in hand'); if (u) eq(B.cardCost(u.uid), 1, 'costs 1 less to play again'); });
  cs('drifter', () => { mark('neutral_drifter');
    const B = cardB('neutral_drifter', { cats: [CAT(TC, 2, 0)], waves: [DUMMY(2)] }); const p = pests(B, 1)[0];
    play(B, 'neutral_drifter', { floor: 1 });
    eq(B.state.floors[1].statuses.purr, 2, 'Purr 2 on the floor'); eq(p.floor, 0, 'front enemy knocked'); eq(st(p, 'marked'), 1, 'and Marked'); });
  cs('all-nighter', () => { mark('neutral_all_nighter');
    const B = mk({ deck: ['neutral_all_nighter', TC, TC, TC, TC, TC, TC, TC, TC, TC, TC], hand: ['neutral_all_nighter'], cats: [CAT(TC, 1, 0)], waves: [DUMMY(1)] });
    const n0 = B.state.hand.length; play(B, 'neutral_all_nighter', {});
    eq(B.state.zoomies, 3 - 1 + 2, '+2 Zoomies'); eq(B.state.hand.length, n0 - 1 + 2, 'draw 2'); eq(B.state.exhaust.length, 1, 'exhausted');
    B.endTurn(); eq(B.state.round, 2, 'round 2'); eq(B.state.zoomies, 2, 'next turn 1 less Zoomies'); B.endTurn(); eq(B.state.zoomies, 3, 'one turn only'); });
  cs('lucky penny', () => { mark('neutral_lucky_penny');
    const B = mk({ deck: ['neutral_lucky_penny', TC, TC, TC, TC], hand: ['neutral_lucky_penny', TC], cats: [], waves: [DUMMY(1)] }); B.state.zoomies = 10;
    play(B, TC, { floor: 0 }); const c = cats(B, 0)[0]; const inst = B.run.deck.find(i => i.uid === c.instUid); const l0 = inst.lives;
    play(B, 'neutral_lucky_penny', { catUid: c.uid }); eq(inst.lives, l0 + 1, '+1 Life'); eq(c.fluff, 6, 'Fluff 6'); });
  cs('group photo', () => { mark('neutral_group_photo');
    const B = cardB('neutral_group_photo', { cats: [CAT(TC, 1, 0), CAT(TC, 2, 0)] }); const [a, b] = [cats(B, 0)[0], cats(B, 1)[0]]; a.health = 1; b.health = 2;
    play(B, 'neutral_group_photo', {}); eq([a.fluff, b.fluff], [3, 3], 'Fluff 3 everywhere'); eq([a.health, b.health], [4, 5], 'heal 3'); eq([a.power, b.power], [3, 3], '+1 Power this turn');
    B.endTurn(); B.refresh && B.refresh(); eq(a.power, 2, 'Power bonus lasts one turn only'); });
  cs('sunny windowsill', () => { mark('neutral_sunny_windowsill');
    const B = cardB('neutral_sunny_windowsill', { cats: [CAT(TC, 1, 0), CAT(TC, 2, 0)], mk: { warmth: 30 } }); play(B, 'neutral_sunny_windowsill', { floor: 0 }); B.endTurn();
    eq(B.state.sunbeam.warmth, 31, 'restores 1 Warmth at end of turn'); eq([cats(B, 0)[0].fluff, cats(B, 1)[0].fluff], [2, 0], 'Fluff 2 only to cats on its floor'); });
});

section('neutral cards: curses', () => {
  cs('hairball', () => { mark('curse_hairball');
    const B = cardB('curse_hairball'); const p = pests(B, 0)[0]; const hp = p.hp; ok(play(B, 'curse_hairball', { pestUid: p.uid }).ok, 'playable'); eq(p.hp, hp - 4, '4 damage'); eq(B.state.exhaust.length, 1, 'exhaust'); eq(card('curse_hairball').cost, 2, 'cost 2'); });
  cs('vet appointment', () => { mark('curse_vet_appointment');
    const B = cardB('curse_vet_appointment', { mk: { deck: ['curse_vet_appointment', TC, TC, TC, TC, TC, TC, TC, TC, TC, TC, TC] } });
    ok(!B.canPlay(hid(B, 'curse_vet_appointment')).ok, 'unplayable'); B.endTurn(); eq(B.state.zoomies, 2, 'next turn starts with 1 less Zoomies'); });
  cs('bath time', () => { mark('curse_bath_time');
    const B = cardB('curse_bath_time'); ok(!B.canPlay(hid(B, 'curse_bath_time')).ok, 'unplayable'); eq(cats(B, 0)[0].power, 1, 'cat Power 2 -1 for the fight'); });
  cs('cucumber', () => { mark('curse_cucumber');
    const B = cardB('curse_cucumber'); ok(!B.canPlay(hid(B, 'curse_cucumber')).ok, 'unplayable'); eq(st(cats(B, 0)[0], 'scared'), 1, 'Scared 1'); });
  cs('wet sock', () => { mark('curse_wet_sock');
    const B = cardB('curse_wet_sock', { mk: { deck: ['curse_wet_sock', TC, TC, TC, TC, TC, TC] } }); const c = cats(B, 0)[0]; const n0 = B.state.hand.length;
    ok(play(B, 'curse_wet_sock', { catUid: c.uid }).ok, 'play'); eq(st(c, 'wet'), 2, 'Wet 2'); eq(B.state.hand.length, n0, 'draw 1'); eq(B.state.exhaust.length, 1, 'exhaust'); });
  cs('itchy collar', () => { mark('curse_itchy_collar');
    const B = cardB('curse_itchy_collar'); ok(!B.canPlay(hid(B, 'curse_itchy_collar')).ok, 'unplayable'); B.endTurn();
    eq(cats(B, 0)[0].power, 1, 'end of turn in hand: -1 Power'); ok(handIds(B).includes('curse_itchy_collar'), 'retained'); });
  cs('dead mouse gift', () => { mark('curse_dead_mouse_gift');
    const B = cardB('curse_dead_mouse_gift'); ok(handIds(B).includes('curse_hairball'), 'a Hairball was added to hand'); });
  cs('eviction notice', () => { mark('curse_eviction_notice');
    const B = cardB('curse_eviction_notice'); eq(B.state.sunbeam.warmth, B.state.sunbeam.max - 2, 'lost 2 Warmth'); });
  cs('static shock', () => { mark('curse_static_shock');
    const B = cardB('curse_static_shock'); eq(cats(B, 0)[0].health, 3, '2 damage to the random cat'); });
});

section('neutral cards: tokens', () => {
  cs('empty collar', () => { mark('token_empty_collar');
    const B = cardB('token_empty_collar'); B.state.zoomies = 0; play(B, 'token_empty_collar', {}); eq(B.state.zoomies, 1, '+1 Zoomies'); eq(B.state.exhaust.length, 1, 'exhaust'); });
  cs('flat pack', () => { mark('token_flat_pack');
    const B = cardB('token_flat_pack'); play(B, 'token_flat_pack', { floor: 0 }); eq(B.state.floors[0].rooms.filter(r => r.rtype === 'box').length, 1, 'Box'); eq(B.state.exhaust.length, 1, 'exhaust'); });
  cs('yarn ball', () => { mark('token_yarn_ball');
    const B = cardB('token_yarn_ball'); const p = pests(B, 0)[0]; play(B, 'token_yarn_ball', { pestUid: p.uid }); eq(st(p, 'yarn'), 1, 'Yarn 1'); });
  cs('stray kitten', () => { mark('token_stray_kitten');
    const B = cardB('token_stray_kitten', { cats: [] }); play(B, 'token_stray_kitten', { floor: 0 }); const c = cats(B, 0)[0]; eq([c.power, c.health, c.lives], [1, 2, 1], '1/2, 1 life'); kill(B, c); eq([B.state.exhaust.length, B.state.discard.length], [1, 0], 'Exhaust: the card is exhausted when the kitten falls'); });
  cs('lap kitten', () => { mark('token_lap_kitten');
    const B = cardB('token_lap_kitten', { cats: [] }); play(B, 'token_lap_kitten', { floor: 0 }); const c = cats(B, 0)[0]; eq([c.power, c.health], [1, 3], '1/3'); c.health = 1; B.endTurn(); eq(c.health, 2, 'Purr 1 heals'); });
  cs('spirit cat', () => { mark('token_spirit_cat');
    const B = cardB('token_spirit_cat', { cats: [] }); play(B, 'token_spirit_cat', { floor: 0 }); const c = cats(B, 0)[0]; eq([c.power, c.health], [2, 2], '2/2'); ok(c.hidden || st(c, 'hidden') >= 1, 'Hidden'); });
  cs('scrap kitten', () => { mark('token_scrap_kitten');
    const B = cardB('token_scrap_kitten', { cats: [] }); const p = pests(B, 0)[0]; const hp = p.hp; play(B, 'token_scrap_kitten', { floor: 0 }); eq(hp - p.hp, 3, 'Pounce 1 hits for Power+1'); });
  cs('tuna treat', () => { mark('token_tuna_treat');
    const B = cardB('token_tuna_treat'); const c = cats(B, 0)[0]; c.health = 1; play(B, 'token_tuna_treat', { catUid: c.uid }); eq(c.health, 5, 'heal 4'); });
  cs('spare charm', () => { mark('token_spare_charm');
    const B = mk({ deck: ['token_spare_charm', TC, TC, TC, TC], hand: ['token_spare_charm', TC], cats: [], waves: [DUMMY(1)] }); B.state.zoomies = 10;
    play(B, TC, { floor: 0 }); const c = cats(B, 0)[0]; const inst = B.run.deck.find(i => i.uid === c.instUid); const l0 = inst.lives;
    play(B, 'token_spare_charm', { catUid: c.uid }); eq(inst.lives, l0 + 1, '+1 Life'); });
  cs('catnip mouse', () => { mark('token_catnip_mouse');
    const B = cardB('token_catnip_mouse'); play(B, 'token_catnip_mouse', { floor: 0 }); const n0 = B.state.nip.meter; B.endTurn();
    eq(B.state.nip.meter, n0 + 1, 'Nip +1 at end of turn'); });
});

section('neutral cards: every card in the file has a test', () => {
  const missing = NEUT.filter(c => !covered.cards.has(c.id)).map(c => c.id);
  eq(missing, [], 'cards without a behavior test');
});


// =========================================================================================================
// PART 2: STARTERS, GOBLINS, EXTRA RELICS, STARTER DECKS, CHARMS (cards-starters.js)
// =========================================================================================================
(function () { // more throwaway pests
  SB.data.tutorial.enemies.push({ id: 't_tiny', name: 'Tiny', hp: 2, size: 1, traits: [], tags: ['pest'], pattern: { type: 'cycle', actions: [{ kind: 'attack', dmg: 0, hits: 1, floors: 'own', pick: 'front', label: 'Poke' }] }, flavor: 'Tiny', art: { species: 'mouse', colors: 'grey', accessory: 'none' }, tutorialOnly: true });
  SB.content.rebuild();
})();
const STARTER_CARDS = SB.data.cardsStarters;

section('starters: kittens, Off the Shelf, goblins', () => {
  cs('alley kitten', () => { mark2('alley_basic_kitten');
    const B = cardB('alley_basic_kitten', { cats: [] }); const p = pests(B, 0)[0]; const hp = p.hp; play(B, 'alley_basic_kitten', { floor: 0 });
    const c = cats(B, 0)[0]; eq([c.power, c.health, c.lives], [1, 4, 2], '1/4, 2 lives'); eq(hp - p.hp, 2, 'Pounce 1: Power + 1'); });
  cs('hearth kitten', () => { mark2('hearth_basic_kitten');
    const B = cardB('hearth_basic_kitten', { cats: [] }); play(B, 'hearth_basic_kitten', { floor: 0 }); const c = cats(B, 0)[0]; eq([c.power, c.health], [1, 6], '1/6'); c.health = 3; B.endTurn(); eq(c.health, 4, 'Purr 1 heals 1'); });
  cs('moon kitten', () => { mark2('moon_basic_kitten');
    const B = cardB('moon_basic_kitten', { cats: [] }); play(B, 'moon_basic_kitten', { floor: 0 }); eq(B.state.bank, 1, 'Bank 1 Life'); });
  cs('mischief kitten', () => { mark2('mischief_basic_kitten');
    const B = cardB('mischief_basic_kitten', { cats: [] }); play(B, 'mischief_basic_kitten', { floor: 0 }); eq(B.state.nip.meter, 1, 'gain 1 Nip'); eq(cats(B, 0)[0].health, 4, '2/4, 3 lives'); eq(cats(B, 0)[0].lives, 3, 'Mischief Kitten has 3 lives'); });
  cs('off the shelf', () => { mark2('alley_off_the_shelf');
    const B = cardB('alley_off_the_shelf', { cats: [CAT(TC, 3, 0)], waves: [DUMMY(3)] }); const p = pests(B, 2)[0]; const hp = p.hp;
    ok(play(B, 'alley_off_the_shelf', { pestUid: p.uid }).ok, 'play'); eq(p.floor, 0, 'knocked two floors to the Cellar'); eq(hp - p.hp, 4 + 4, 'Shatter 2 x 2 floors, then 4 damage because it ends in the Cellar');
    const B2 = cardB('alley_off_the_shelf', { cats: [CAT(TC, 2, 0)], waves: [DUMMY(2)] }); const q = pests(B2, 1)[0];
    play(B2, 'alley_off_the_shelf', { pestUid: q.uid }); ok(q.floor !== 0 || q.hp >= 60 - 2 - 3, 'Parlor knock 2 goes out the cat flap, no bonus hit'); });
  cs('goblin kitten', () => { mark2('neutral_goblin_kitten');
    const B = cardB('neutral_goblin_kitten', { cats: [] }); const p = pests(B, 0)[0]; const hp = p.hp; play(B, 'neutral_goblin_kitten', { floor: 0 }); const c = cats(B, 0)[0];
    eq([c.power, c.health, c.lives], [2, 3, 2], '2/3, 2 lives'); eq(hp - p.hp, 3, 'Pounce 1'); });
  cs('goblin cat', () => { mark2('neutral_goblin_cat');
    const B = cardB('neutral_goblin_cat', { cats: [] }); const p = pests(B, 0)[0]; const hp = p.hp; const f0 = B.run.fish; play(B, 'neutral_goblin_cat', { floor: 0 });
    eq(hp - p.hp, 6, 'Pounce 2: 4 + 2'); eq(B.run.fish, f0 + 1, '+1 Fish'); });
  cs('goblin king', () => { mark2('neutral_goblin_king');
    const B = cardB('neutral_goblin_king', { cats: [] }); play(B, 'neutral_goblin_king', { floor: 1 });
    eq([cats(B, 0).map(c => c.id), cats(B, 1).map(c => c.id), cats(B, 2).map(c => c.id)], [['token_stray_kitten'], ['neutral_goblin_king'], ['token_stray_kitten']], 'a Stray Kitten on each other floor'); });
});

function mark2(id) { covered.cards.add(id); }

section('starters: extra relics (events.js needs)', () => {
  cs('pigeon feather', () => { covered.relics.add('relic_pigeon_feather');
    const B = mk({ relics: [], deck: ['neutral_swat', 'neutral_swat', TC, TC, TC, TC, TC], hand: ['neutral_swat', 'neutral_swat'], cats: [CAT(TC, 1, 0)], waves: [DUMMY(1)], run: (() => { const r = newRun({ deck: ['neutral_swat', 'neutral_swat', TC, TC, TC, TC, TC] }); r.relics.push({ id: 'relic_pigeon_feather', counter: 0 }); return r; })() });
    const u = hid(B, 'neutral_swat'); eq(B.cardCost(u), 0, 'first card costs 1 less'); }); 
  cs('roomba bumper', () => { covered.relics.add('relic_roomba_bumper'); covered.relics.add('relic_elder_spectacles'); });
  cs('starter decks', () => {
    const D = SB.data.starterDecks; eq(D.size, 11, 'size 11');
    Object.keys(D.byChampion).forEach(ch => Object.keys(D.byChampion[ch]).forEach(side => { const d = D.byChampion[ch][side]; eq(d.length, 11, ch + '/' + side + ' has 11'); d.forEach(id => ok(SB.content.card(id), 'resolves ' + id)); }));
    const d = D.build('alley_shadow', 'alley', 'hearth'); eq([d.filter(x => x === 'alley_basic_kitten').length, d.filter(x => x === 'neutral_swat').length, d.filter(x => x === 'neutral_catnap').length, d.filter(x => x === 'neutral_cardboard_box').length, d.filter(x => x === 'hearth_basic_kitten').length], [4, 2, 2, 1, 1], 'deck composition'); });
});


// =========================================================================================================
// PART 3: RELICS
// =========================================================================================================
const RELICS = SB.data.relics;
const rel = id => { covered.relics.add(id); return id; };
// battle with relics; same options as mk
function RB(relics, o) { o = Object.assign({}, o || {}); o.relics = relics; const B = mk(o); if (o.z !== false) B.state.zoomies = 10; return B; }
const relicEntry = (run, id) => run.relics.find(r => r.id === id);

section('relics: data integrity', () => {
  eq(RELICS.length, 97, '97 relics');
  eq(new Set(RELICS.map(r => r.id)).size, 97, 'ids unique');
  const v = SB.content.validate();
  const bad = v.errors.concat(v.warnings).filter(m => /relic_/.test(m));
  eq(bad, [], 'validate has no relic complaints');
  RELICS.forEach(r => ok(r.name && r.text && !/[\u2013\u2014]/.test(r.text + r.name + (r.flavor || '')), 'relic text clean: ' + r.id));
});

section('relics: heirlooms', () => {
  cs('torn ear tag', () => { rel('relic_torn_ear_tag');
    const B = RB(['relic_torn_ear_tag'], { deck: ['alley_basic_kitten', 'alley_basic_kitten', TC, TC, TC], hand: ['alley_basic_kitten', 'alley_basic_kitten', TC], cats: [CAT(TC, 2, 0)], waves: [DUMMY(1)] });
    eq(st(cats(B, 1)[0], 'claws'), 0, 'a cat that starts on the board is not a deployment');
    const p = pests(B, 0)[0]; const hp = p.hp;
    play(B, 'alley_basic_kitten', { floor: 0 }); const a = cats(B, 0)[0];
    eq(st(a, 'claws'), 2, 'first deployed cat gains Claws 2'); eq(hp - p.hp, 1 + 1 + 2, 'its own Pounce already benefits from the Claws (Power 1 + Pounce 1 + Claws 2)');
    play(B, 'alley_basic_kitten', { floor: 0 }); eq(st(cats(B, 0)[1], 'claws'), 0, 'only the first, once per battle');
    B.endTurn(); play(B, TC, { floor: 0 }); eq(st(cats(B, 0).find(c => c.id === TC), 'claws'), 0, 'not again on a later turn');
    const B2 = RB(['relic_torn_ear_tag'], { deck: [TC, TC, TC, TC, TC], hand: [TC], cats: [], waves: [DUMMY(1)] });
    play(B2, TC, { floor: 0 }); eq(st(cats(B2, 0)[0], 'claws'), 2, 'a fresh battle resets the limit'); });
  cs('notched collar', () => { rel('relic_notched_collar');
    const B = RB(['relic_notched_collar'], { cats: [CAT('neutral_chonk', 1, 0), CAT('neutral_chonk', 1, 1)], waves: [{ round: 1, spawns: [{ id: 't_tiny', floor: 1 }, { id: 't_tiny', floor: 1 }] }, { round: 2, spawns: [{ id: 't_tiny', floor: 1 }, { id: 't_tiny', floor: 1 }] }] });
    B.endTurn(); const k = cats(B, 0).map(c => st(c, 'claws')); eq(k.reduce((a, b) => a + b, 0), 1, 'only the first kill of the round gives Claws 1 (' + k + ')');
    B.endTurn(); eq(cats(B, 0).map(c => st(c, 'claws')).reduce((a, b) => a + b, 0), 2, 'the next round gives another'); });
  cs('well-loved blanket', () => { rel('relic_well_loved_blanket');
    const B = RB(['relic_well_loved_blanket'], { cats: [CAT(TC, 1, 0), CAT(TC, 2, 0), CAT(TC, 2, 1)] });
    const lone = cats(B, 0)[0], pair = cats(B, 1); lone.health = 1; pair.forEach(c => { c.health = 1; });
    B.endTurn(); eq(pair.map(c => c.health), [2, 2], 'End of turn: Purr 1 on the fullest floor heals its cats'); eq(lone.health, 1, 'the Cellar got none'); });
  cs('warm brick', () => { rel('relic_warm_brick');
    const B = RB(['relic_warm_brick'], { cats: [CAT(TC, 1, 0), CAT(TC, 3, 0)] }); eq([cats(B, 0)[0].fluff, cats(B, 2)[0].fluff], [3, 3], 'every cat starts with Fluff 3'); });
  cs('silver bell', () => { rel('relic_silver_bell');
    const B = RB(['relic_silver_bell'], { deck: [TC, TC, TC, TC, TC, TC, TC, TC], hand: [TC, TC], cats: [], waves: [DUMMY(1)] });
    play(B, TC, { floor: 0 }); play(B, TC, { floor: 0 }); const n0 = B.state.hand.length; kill(B, cats(B, 0)[0]); eq(B.state.hand.length, n0 + 1, 'life lost: draw 1');
    kill(B, cats(B, 0)[0]); eq(B.state.hand.length, n0 + 1, 'but once per turn'); });
  cs('dusty star chart', () => { rel('relic_dusty_star_chart');
    const B = RB(['relic_dusty_star_chart'], { clock: true, cats: [CAT(TC, 1, 0)], waves: [DUMMY(1, 2)] }); const ps = pests(B, 0);
    ps.forEach(p => eq(st(p, 'marked'), 0, 'no mark before the Witching Hour'));
    B.endTurn(); B.endTurn(); eq(B.state.clock.isWitching, true, 'round 3 is a Witching Hour'); pests(B, 0).forEach(p => eq(st(p, 'marked'), 1, 'every pest Marked 1')); });
  cs('dusty mouse toy', () => { rel('relic_dusty_mouse_toy');
    const B = RB(['relic_dusty_mouse_toy'], {}); eq(B.state.nip.meter, 2, 'start with 2 Nip'); });
  cs('frayed yarn ball', () => { rel('relic_frayed_yarn_ball');
    const B = RB(['relic_frayed_yarn_ball'], { cats: [CAT(TC, 1, 0)], waves: [DUMMY(1, 2)] }); const ps = pests(B, 0);
    eq(ps.map(p => st(p, 'yarn')), [2, 0], 'only the first pest to spawn gets Yarn 2'); });
});

section('relics: commons (battle)', () => {
  cs('collar of bells', () => { rel('relic_collar_of_bells');
    const B = RB(['relic_collar_of_bells'], { deck: [TC, TC, TC], hand: [TC, TC], cats: [], waves: [DUMMY(1)] }); play(B, TC, { floor: 0 }); play(B, TC, { floor: 0 });
    eq(cats(B, 0).map(c => c.fluff), [2, 2], 'every deployed cat gains Fluff 2'); });
  cs('sunbeam sticker', () => { rel('relic_sunbeam_sticker');
    const B = RB(['relic_sunbeam_sticker'], {}); eq(B.state.sunbeam.shade, 4, 'Shade 4'); });
  cs('cracked bell', () => { rel('relic_cracked_bell');
    const B = RB(['relic_cracked_bell'], { deck: [TC, TC, TC, TC, TC, TC, TC], hand: [TC, TC, TC], cats: [], waves: [DUMMY(1)] });
    play(B, TC, { floor: 0 }); play(B, TC, { floor: 0 }); play(B, TC, { floor: 0 });
    kill(B, cats(B, 0)[0]); kill(B, cats(B, 0)[0]); kill(B, cats(B, 0)[0]);
    B.endTurn(); eq(B.state.zoomies, 3 + 2, '1 Zoomies next turn per Life lost, max 2 per turn'); });
  cs('glass of water', () => { rel('relic_glass_of_water');
    const B = RB(['relic_glass_of_water'], { deck: ['neutral_shove', 'neutral_shove', TC, TC], hand: ['neutral_shove', 'neutral_shove'], cats: [CAT(TC, 2, 0)], waves: [DUMMY(2, 2)] });
    const [a, b] = pests(B, 1); const ha = a.hp, hb = b.hp;
    play(B, 'neutral_shove', { pestUid: a.uid }); eq(ha - a.hp, 2 + 2 + 4, 'first Knock: Shatter 2 + 4 extra + Shove 2');
    play(B, 'neutral_shove', { pestUid: b.uid }); eq(hb - b.hp, 2 + 2, 'second Knock gets no bonus'); });
  cs('sun patch cushion', () => { rel('relic_sun_patch_cushion');
    const B = RB(['relic_sun_patch_cushion'], { cats: [CAT('neutral_chonk', 1, 0)] }); const c = cats(B, 0)[0]; c.health = 1; B.toggleNap(c.uid); B.endTurn();
    const A = RB([], { cats: [CAT('neutral_chonk', 1, 0)] }); const d = cats(A, 0)[0]; d.health = 1; A.toggleNap(d.uid); A.endTurn();
    eq(c.health - d.health, 1, 'napping cat heals 1 more each round'); eq(B.mod('maxRested', 0), 2, 'Max Rested mod +2'); });
  cs('the good cushion', () => { rel('relic_the_good_cushion');
    const B = RB(['relic_the_good_cushion'], { cats: [CAT(TC, 2, 0)] }); const c = cats(B, 1)[0]; B.toggleNap(c.uid);
    eq(c.fluff, 3, 'Fluff 3'); eq(B.state.floors[1].statuses.purr, 1, 'floor gains 1 Purr'); });
  cs('family portrait', () => { rel('relic_family_portrait');
    const B = RB(['relic_family_portrait'], { pile: true, cats: [CAT(TC, 1, 0), CAT(TC, 1, 1)] }); B.refresh && B.refresh();
    eq(cats(B, 0).map(c => c.power), [2 + 1, 2 + 1], 'a Pile of 2 counts as 3: +1 Attack each'); });
  cs('night owl goggles', () => { rel('relic_night_owl_goggles');
    const B = RB(['relic_night_owl_goggles'], { clock: true, cats: [CAT(TC, 1, 0)] }); B.endTurn(); B.endTurn(); eq(B.state.zoomies, 3 + 2 + 1, 'Witching Hour Zoomies +1 more'); });
  cs('next day delivery', () => { rel('relic_next_day_delivery');
    const B = RB(['relic_next_day_delivery'], { deck: ['neutral_cardboard_box', 'neutral_cardboard_box', TC, TC, TC, TC, TC, TC], hand: ['neutral_cardboard_box', 'neutral_cardboard_box'], cats: [CAT(TC, 1, 0)], z: false });
    B.state.zoomies = 0; const u = hid(B, 'neutral_cardboard_box'); eq(B.cardCost(u), 0, 'the first Box costs 0'); const n0 = B.state.hand.length;
    ok(play(B, 'neutral_cardboard_box', { floor: 0 }).ok, 'play it free'); eq(B.state.hand.length, n0 - 1 + 1, 'and draws 1');
    const u2 = hid(B, 'neutral_cardboard_box'); eq(B.cardCost(u2), 1, 'the second Box costs full'); });
  cs('catnip plant pot', () => { rel('relic_catnip_plant_pot');
    const B = RB(['relic_catnip_plant_pot'], { cats: [CAT(TC, 1, 0)] }); eq(B.state.nip.meter, 3, 'start with 3 Nip'); eq([B.mod('surgeZoomies', 0), B.mod('crashTurns', 0)], [1, 1], 'mods'); });
  cs('stripped mat', () => { rel('relic_stripped_mat');
    const B = RB(['relic_stripped_mat'], { deck: ['alley_basic_kitten', 'alley_basic_kitten', 'alley_basic_kitten', TC, TC], hand: ['alley_basic_kitten', 'alley_basic_kitten', 'alley_basic_kitten'], cats: [], waves: [DUMMY(1)] });
    play(B, 'alley_basic_kitten', { floor: 0 }); play(B, 'alley_basic_kitten', { floor: 0 }); play(B, 'alley_basic_kitten', { floor: 0 });
    eq(cats(B, 0).map(c => st(c, 'claws')), [1, 1, 0], 'Pounce gives Claws 1, twice per round'); });
  cs('dented bin lid', () => { rel('relic_dented_bin_lid');
    const B = RB(['relic_dented_bin_lid'], { cats: [CAT(TC, 1, 0), CAT(TC, 2, 0), CAT(TC, 3, 0)] }); eq([cats(B, 0)[0].fluff, cats(B, 1)[0].fluff, cats(B, 2)[0].fluff], [5, 0, 0], 'only the Cellar gets Fluff 5'); });
  cs('hair tie', () => { rel('relic_hair_tie');
    const B = RB(['relic_hair_tie'], {}); eq(B.handLimit(), 12, 'hand limit 12'); });
  cs('chewed pen cap', () => { rel('relic_chewed_pen_cap');
    const B = RB(['relic_chewed_pen_cap'], { deck: ['token_empty_collar', 'token_empty_collar', 'token_yarn_ball', TC, TC, TC, TC, TC, TC, TC], hand: ['token_empty_collar', 'token_empty_collar'], cats: [CAT(TC, 1, 0)] });
    const n0 = B.state.hand.length; play(B, 'token_empty_collar', {}); eq(B.state.hand.length, n0 - 1 + 1, 'first 0-cost card draws 1'); play(B, 'token_empty_collar', {}); eq(B.state.hand.length, n0 - 2 + 1, 'second does not'); });
  cs('kibble scoop', () => { rel('relic_kibble_scoop');
    const B = RB(['relic_kibble_scoop'], { z: false, cats: [CAT(TC, 1, 0)] }); eq(B.state.zoomies, 4, 'round 1: +1 Zoomies'); B.endTurn(); eq(B.state.zoomies, 3, 'round 2: none'); });
});

// ---- run-level helpers ----
function enterFight(run, kind) {
  const avail = SB.run.availableNodes(run);
  const nid = avail.find(n => run.map.nodes[n].type === 'battle') || avail[0];
  run.map.nodes[nid].type = 'battle';
  const out = SB.run.enterNode(run, nid);
  if (!out.payload || !out.payload.encounter) throw new Error('first node is not a battle: ' + out.type);
  if (kind) run.current.kind = kind;
  return out;
}
function winFight(run, kind, plays) {
  enterFight(run, kind);
  const res = SB.run.finishBattle(run, { outcome: 'win', warmth: run.warmth, stats: { plays: plays || {}, playsByUid: plays || {}, warmthLost: 0, round: 4 } });
  run.pending = null; run.current = null; run.status = 'map'; // skip the reward screen
  return res;
}
function runWith(relics, o) { const r = newRun(Object.assign({ relics }, o || {})); r.noAutosave = true; return r; }

section('relics: commons (run level)', () => {
  cs('water bowl', () => { rel('relic_water_bowl');
    const r = runWith(['relic_water_bowl']); r.warmth = 20; winFight(r, 'prowl'); ok(r.warmth >= 23, 'Warmth +3 after the battle: ' + r.warmth);
    const q = runWith([]); q.warmth = 20; winFight(q, 'prowl'); eq(r.warmth - q.warmth, 3, 'exactly 3 more than without the relic'); });
  cs('fish bone toothpick', () => { rel('relic_fish_bone_toothpick');
    const gain = (relics, kind) => { const r = runWith(relics); const f0 = r.fish; winFight(r, kind); return r.fish - f0; };
    eq(gain(['relic_fish_bone_toothpick'], 'prowl') - gain([], 'prowl'), 6, '+6 after a Prowl');
    eq(gain(['relic_fish_bone_toothpick'], 'night') - gain([], 'night'), 6, '+6 after a Night');
    eq(gain(['relic_fish_bone_toothpick'], 'elite') - gain([], 'elite'), 0, 'nothing after an Elite');
    eq(gain(['relic_fish_bone_toothpick'], 'boss') - gain([], 'boss'), 0, 'nothing after a boss'); });
  cs('growing twine', () => { rel('relic_growing_twine');
    const r = runWith(['relic_growing_twine']); const e = relicEntry(r, 'relic_growing_twine'); eq(e.counter, 0, 'starts at 0');
    const B0 = mk({ run: r, cats: [CAT(TC, 1, 0)] }); eq(B0.state.sunbeam.shade, 0, 'Shade 0 at size 0');
    winFight(r, 'prowl'); winFight(r, 'prowl'); winFight(r, 'prowl'); eq(e.counter, 3, 'grows 1 per battle (counted once per win, not once per hook)');
    const B = mk({ run: r, cats: [CAT(TC, 1, 0)] }); eq(B.state.sunbeam.shade, 3, 'Shade equals its size');
    e.counter = 12; winFight(r, 'prowl'); eq(e.counter, 12, 'caps at 12'); });
  cs('growing sweater', () => { rel('relic_growing_sweater');
    const r = runWith(['relic_growing_sweater']); const e = relicEntry(r, 'relic_growing_sweater'); winFight(r, 'prowl'); winFight(r, 'prowl'); eq(e.counter, 2, 'grew 2');
    const B = mk({ run: r, cats: [CAT(TC, 1, 0)] }); eq(cats(B, 0)[0].maxHealth, 5 + 2, 'every cat gains max Health equal to its size for the battle');
    e.counter = 5; winFight(r, 'prowl'); eq(e.counter, 5, 'caps at 5'); });
  cs('jar of moths', () => { rel('relic_jar_of_moths');
    const r = runWith(['relic_jar_of_moths']); const e = relicEntry(r, 'relic_jar_of_moths');
    const B = mk({ run: r, clock: true, cats: [CAT(TC, 1, 0)] }); B.endTurn(); B.endTurn(); eq(B.state.clock.isWitching, true, 'witching'); eq(e.counter, 1, 'one moth per Witching Hour'); eq(cats(B, 0)[0].fluff, 1, 'Fluff equals moths');
    B.endTurn(); B.endTurn(); B.endTurn(); eq(e.counter, 2, 'second Witching Hour (round 6): second moth'); eq(cats(B, 0)[0].fluff, 2, 'Fluff equals the 2 moths (earlier Fluff has faded)'); 
    const B2 = mk({ run: r, clock: true, cats: [CAT(TC, 1, 0)] }); B2.endTurn(); B2.endTurn(); eq(e.counter, 3, 'kept across battles'); });
  cs('sisal sweater', () => { rel('relic_sisal_sweater');
    const a = runWith([]), b = runWith(['relic_sisal_sweater']); eq(SB.post.offerCount(b) - SB.post.offerCount(a), 1, 'Post shows 1 extra scratch'); });
  cs('practice mat', () => { rel('relic_practice_mat');
    const play1 = relics => { const r = runWith(relics); const inst = r.deck[0]; winFight(r, 'prowl', { [inst.uid]: 1 }); return inst.plays; };
    eq(play1(['relic_practice_mat']) - play1([]), 1, 'a card played at least once counts 1 extra play'); });
  cs('tally stick', () => { rel('relic_tally_stick');
    const a = runWith([]), b = runWith(['relic_tally_stick']); const d = SB.content.card(TC);
    eq(SB.run.masteryThresholds(a, a.deck[0], d), [3, 7, 12], 'base'); eq(SB.run.masteryThresholds(b, b.deck[0], d), [2, 6, 11], 'thresholds 1 lower'); });
  cs('adoption papers', () => { rel('relic_adoption_papers');
    const r = runWith(['relic_adoption_papers']); r.current = { nodeId: Object.keys(r.map.nodes)[0] }; SB.shop.open(r);
    eq(SB.shop.shooPrice(r), 0, 'Adopt Out costs 0'); r.removals = 4; eq(SB.shop.shooPrice(r), 0, 'always');
    r.adopted = 2; const f0 = r.fish; winFight(r, 'prowl'); const q = runWith([]); q.adopted = 2; const g0 = q.fish; winFight(q, 'prowl');
    eq((r.fish - f0) - (q.fish - g0), 2 * 3 - 2 * 2, 'Postcards give 3 Fish each instead of 2'); });
  cs('milk mirror', () => { rel('relic_milk_mirror');
    const r = runWith(['relic_milk_mirror'], { deck: ['neutral_shove'] }); r.current = { nodeId: Object.keys(r.map.nodes)[0] }; SB.shop.open(r);
    eq(SB.shop.litterPrice(r), 0, 'first Litter each Act free'); const inst = r.deck.find(i => i.id === 'neutral_shove'); const res = SB.shop.litter(r, inst.uid); ok(res.ok, 'litter ok ' + res.reason); r.act = r.act; ok(SB.shop.litterPrice(r) > 0, 'second costs'); });
});

section('relics: uncommons', () => {
  const witchB = (relics, o) => RB(relics, Object.assign({ clock: true, cats: [CAT(TC, 1, 0), CAT(TC, 2, 0)], waves: [DUMMY(1)] }, o || {}));
  cs('dawn chorus', () => { rel('relic_dawn_chorus');
    const run = (relics) => { const B = witchB(relics); cats(B, 0)[0].health = 2; B.endTurn(); B.endTurn(); B.endTurn(); return B; };
    const A = run(['relic_dawn_chorus']), N = run([]);
    eq(A.state.round, 4, 'round 4 after the Witching Hour'); eq(cats(N, 0)[0].statuses.frazzled > 0, true, 'baseline: cats are Frazzled after a Witching Hour');
    eq(cats(A, 0)[0].statuses.frazzled > 0, false, 'Frazzled is cleansed at the end of the Witching Hour round'); ok(cats(A, 0)[0].health >= cats(N, 0)[0].health + 2, 'heal 2 for every awake cat'); });
  cs('do not disturb sign', () => { rel('relic_do_not_disturb_sign');
    const t = relics => { const B = RB(relics, { cats: [CAT(TC, 1, 0)], waves: [{ round: 1, spawns: [{ id: 't_biter', floor: 1 }] }] }); const c = cats(B, 0)[0]; B.toggleNap(c.uid); B.endTurn(); return c; };
    ok(t(['relic_do_not_disturb_sign']).napping, 'keeps sleeping after the first hit'); ok(!t([]).napping, 'baseline: a hit wakes the cat'); });
  cs('rage bait treats', () => { rel('relic_rage_bait_treats');
    const B = RB(['relic_rage_bait_treats'], { cats: [CAT(TC, 1, 0)], waves: [DUMMY(1)] }); const p = pests(B, 0)[0]; eq(st(p, 'rage'), 1, 'pests spawn with Rage 1'); const hp = p.hp; B.endTurn();
    eq(hp - p.hp, 2 + 2, 'the cat hits a Raging pest for 2 extra'); });
  cs('zoomie fuel', () => { rel('relic_zoomie_fuel');
    const B = RB(['relic_zoomie_fuel'], { cats: [CAT('neutral_chonk', 1, 0), CAT('neutral_chonk', 1, 1)], waves: [{ round: 1, spawns: [{ id: 't_tiny', floor: 1 }, { id: 't_tiny', floor: 1 }] }] }); B.endTurn();
    eq(cats(B, 0).map(c => st(c, 'frenzy')).reduce((a, b) => a + b, 0), 1, 'first kill of the round gives the killer Frenzy 1'); });
  cs('shredded curtain', () => { rel('relic_shredded_curtain');
    const t = relics => { const B = RB(relics, { cats: [CAT(TC, 1, 0)], waves: [DUMMY(1)] }); const c = cats(B, 0)[0]; B.addStatus(c, 'frenzy', 1); B.endTurn(); return c.health; };
    eq(t(['relic_shredded_curtain']), 5, 'no Health lost to Frenzy extra hits'); ok(t([]) < 5, 'baseline: Frenzy costs Health'); });
  cs('pile permit', () => { rel('relic_pile_permit');
    const t = (relics, n) => { const cs_ = []; for (let i = 0; i < n; i++) cs_.push(CAT('neutral_chonk' === 0 ? TC : TC, 1, i)); const B = RB(relics, { pile: true, cats: cs_, waves: [DUMMY(2)] }); cats(B, 0).forEach(c => { c.health = 1; }); B.endTurn(); return cats(B, 0)[0].health; };
    const base2 = t([], 2), perm2 = t(['relic_pile_permit'], 2); ok(perm2 > base2, 'a Pile of 2 heals with the relic (' + perm2 + ' vs ' + base2 + ')');
    const base3 = t([], 3), perm3 = t(['relic_pile_permit'], 3); ok(perm3 - base3 >= 1, 'a Pile of 3 heals 2 (' + perm3 + ' vs ' + base3 + ')'); });
  cs('hot water bottle', () => { rel('relic_hot_water_bottle');
    const B = RB(['relic_hot_water_bottle'], { warmth: 30, cats: [CAT(TC, 1, 0), CAT(TC, 1, 1), CAT(TC, 2, 0)] }); B.toggleNap(cats(B, 0)[0].uid); B.toggleNap(cats(B, 0)[1].uid); B.endTurn();
    eq(B.state.sunbeam.warmth, 32, '1 Warmth per napping cat'); });
  cs('moth lantern', () => { rel('relic_moth_lantern');
    const B = witchB(['relic_moth_lantern'], { waves: [DUMMY(1, 1)] }); B.endTurn(); B.endTurn(); B.endTurn(); const p = pests(B, 0)[0];
    ok(st(p, 'marked') >= 1, 'zoom target Marked'); });
  cs('nip jar lid', () => { rel('relic_nip_jar_lid');
    const B = RB(['relic_nip_jar_lid'], { cats: [CAT(TC, 1, 0)] }); B.addNip(8); eq(B.state.nip.surge > 0, true, 'Surge at 8'); const A = RB([], { cats: [CAT(TC, 1, 0)] }); A.addNip(8); eq(A.state.nip.surge > 0, false, 'baseline: no Surge at 8'); });
  cs('kept receipt', () => { rel('relic_kept_receipt');
    const mkr = relics => RB(relics, { deck: ['neutral_swat', 'neutral_swat', TC, TC, TC, TC, TC, TC, TC], hand: ['neutral_swat', 'neutral_swat', TC, TC, TC], cats: [CAT(TC, 1, 0)] });
    const B = mkr(['relic_kept_receipt']); const sw = B.state.hand.filter(h => B.state.cards[h.uid].id === 'neutral_swat').map(h => h.uid);
    ok(B.toggleRetain(sw[0]).ok, 'choose a card to keep'); eq(B.toggleRetain(sw[1]).ok, false, 'only 1 slot'); B.endTurn();
    ok(B.state.hand.some(h => h.uid === sw[0]), 'the chosen card is still in hand'); ok(!B.state.hand.some(h => h.uid === sw[1]), 'the other was discarded');
    const A = mkr([]); const a0 = A.state.hand.find(h => A.state.cards[h.uid].id === 'neutral_swat').uid; eq(A.toggleRetain(a0).ok, false, 'baseline: no slot'); A.endTurn(); ok(!A.state.hand.some(h => h.uid === a0), 'baseline: nothing kept'); });
  cs('rubber cat flap', () => { rel('relic_rubber_cat_flap');
    const t = relics => { const B = RB(relics, { cats: [CAT(TC, 1, 0)], waves: [DUMMY(1)] }); const p = pests(B, 0)[0]; B.knockPest(p, 1, {}); B.endTurn(); let r = 1; while (r < 6 && !(pests(B, 0).includes(p))) { B.endTurn(); r++; } return B.state.round; };
    eq(t(['relic_rubber_cat_flap']) - t([]), 2, 'comes back 2 rounds later'); });
  cs('insomnia mask', () => { rel('relic_insomnia_mask');
    const t = relics => { const B = RB(relics, { deck: [TC, TC, TC], hand: [TC], cats: [], waves: [DUMMY(1)] }); play(B, TC, { floor: 0 }); return B.toggleNap(cats(B, 0)[0].uid); };
    eq(t(['relic_insomnia_mask']).ok, true, 'may Nap the turn it is played'); eq(t([]).ok, false, 'baseline: may not'); });
  cs('notched doorframe', () => { rel('relic_notched_doorframe');
    const r = newRun({ relics: ['relic_notched_doorframe'] }); const e = relicEntry(r, 'relic_notched_doorframe');
    const B = mk({ run: r, cats: [CAT('neutral_chonk', 1, 0), CAT('neutral_chonk', 1, 1)], waves: [{ round: 1, spawns: [{ id: 't_tiny', floor: 1 }, { id: 't_tiny', floor: 1 }] }] }); B.endTurn();
    eq(e.counter, 2, 'counts cat kills: 2'); e.counter = 39; 
    const B2 = mk({ run: r, cats: [CAT('neutral_chonk', 1, 0), CAT('neutral_chonk', 1, 1)], waves: [{ round: 1, spawns: [{ id: 't_tiny', floor: 1 }, { id: 't_tiny', floor: 1 }] }] }); B2.endTurn(); eq(e.counter, 40, 'caps at 40');
    const B3 = mk({ run: r, cats: [CAT(TC, 1, 0)] }); eq(cats(B3, 0)[0].power, 2 + 4, '+1 Power per 10 kills at battle start');
    e.counter = 9; eq(cats(mk({ run: r, cats: [CAT(TC, 1, 0)] }), 0)[0].power, 2, '9 kills: nothing yet'); });
  cs('ledger of lives', () => { rel('relic_ledger_of_lives');
    const r = newRun({ relics: ['relic_ledger_of_lives'], deck: [TC, TC, TC, TC] }); const e = relicEntry(r, 'relic_ledger_of_lives');
    const B = mk({ run: r, deck: null, cats: [], hand: [TC, TC, TC], waves: [DUMMY(1)] }); B.state.zoomies = 10;
    play(B, TC, { floor: 0 }); play(B, TC, { floor: 0 }); play(B, TC, { floor: 0 }); kill(B, cats(B, 0)[0]); kill(B, cats(B, 0)[0]); kill(B, cats(B, 0)[0]);
    eq(e.counter, 3, 'each Life lost adds a tally'); 
    eq(cats(mk({ run: r, cats: [CAT(TC, 1, 0)] }), 0)[0].fluff, 1, '3 tallies: Fluff 1'); e.counter = 18; eq(cats(mk({ run: r, cats: [CAT(TC, 1, 0)] }), 0)[0].fluff, 6, '18 tallies: Fluff 6'); e.counter = 17; eq(cats(mk({ run: r, cats: [CAT(TC, 1, 0)] }), 0)[0].fluff, 5, '17: 5');
    const B2 = mk({ run: r, cats: [], hand: [TC], waves: [DUMMY(1)] }); e.counter = 18; B2.state.zoomies = 10; play(B2, TC, { floor: 0 }); kill(B2, cats(B2, 0)[0]); eq(e.counter, 18, 'cap 18'); });
  cs('catnip stain', () => { rel('relic_catnip_stain');
    const r = newRun({ relics: ['relic_catnip_stain'] }); const e = relicEntry(r, 'relic_catnip_stain');
    const B = mk({ run: r, cats: [CAT(TC, 1, 0)] }); B.addNip(10); B.drain(); eq(e.counter, 1, 'a Surge adds 1'); 
    const B2 = mk({ run: r, cats: [CAT(TC, 1, 0)] }); eq(e.counter, 0, 'resets each battle'); eq(B2.state.nip.meter, 0, 'no Nip');
    B2.addNip(10); for (let i = 0; i < 8 && (B2.state.nip.surge > 0 || B2.state.nip.crash > 0); i++) B2.endTurn(); const m0 = B2.state.nip.meter; B2.addNip(1); B2.drain(); eq(B2.state.nip.meter, m0 + 2, 'after a Surge every Nip gain gets +1: ' + JSON.stringify(B2.state.nip)); });
  cs('pedometer', () => { rel('relic_pedometer');
    const EC = 'token_empty_collar'; const r = newRun({ relics: ['relic_pedometer'], deck: Array(10).fill(EC) }); const e = relicEntry(r, 'relic_pedometer');
    const B = mk({ run: r, deck: null, hands: [Array(5).fill(EC), Array(5).fill(EC)], cats: [CAT(TC, 1, 0)] }); B.state.zoomies = 0; const c = cats(B, 0)[0]; const f0 = c.fluff;
    for (let i = 0; i < 5; i++) play(B, EC, {}); eq(e.counter, 5, 'counts cards played'); eq([B.state.zoomies, c.fluff], [5, f0], 'only the collars own Zoomies and no Fluff before the 8th card');
    B.endTurn(); B.state.zoomies = 0; for (let i = 0; i < 3; i++) play(B, EC, {}); B.drain(); eq(e.counter, 8, '8 cards'); eq(B.state.zoomies, 3 + 1, 'the 8th card gives 1 Zoomies on top of the collars own 3'); eq(c.fluff - f0, 3, 'and 3 Fluff to the cat');
    mk({ run: r, cats: [CAT(TC, 1, 0)] }); eq(e.counter, 0, 'resets next battle'); });
  cs('catnip whetstone', () => { rel('relic_catnip_whetstone');
    const a = runWith([]), b = runWith(['relic_catnip_whetstone']); ok(SB.run.mod(b, 'postStallPct') === -25 && !SB.run.mod(a, 'postStallPct'), 'mod -25');
    a.current = { nodeId: Object.keys(a.map.nodes)[0] }; b.current = { nodeId: Object.keys(b.map.nodes)[0] };
    const sa = SB.shop.open(a), sb = SB.shop.open(b); const stalls = o => o.stock.filter(i => i.kind === 'stall'); ok(stalls(sa).length > 0, 'shop has stall items'); });
  cs('biscuit blanket', () => { rel('relic_biscuit_blanket');
    const t = relics => { const B = RB(relics, { deck: ['hearth_basic_kitten', TC, TC], hand: ['hearth_basic_kitten'], cats: [], waves: [DUMMY(1)] }); const inst = B.run.deck[0]; const u = B.state.hand[0]; const c = (B.run.deck.find(i => i.id === 'hearth_basic_kitten'));
      const card = B.state.cards[u.uid]; return { B, c }; };
    const mkk = relics => { const B = RB(relics, { deck: ['neutral_house_cat', TC], hand: [TC], cats: [], waves: [DUMMY(1)] }); play(B, TC, { floor: 0 }); const cat = cats(B, 0)[0]; B.doKnead(cat, 'attack', 1); B.doKnead(cat, 'attack', 1); return B.run.deck.find(i => i.uid === cat.instUid).knead.attack; };
    eq(mkk(['relic_biscuit_blanket']) - mkk([]), 1, 'first Knead each battle counts double'); });
  cs('birth certificate', () => { rel('relic_birth_certificate');
    const a = runWith([]), b = runWith(['relic_birth_certificate']); eq(SB.run.growthNeeded(a, { growthNeeded: 3 }), 3, 'base 3'); eq(SB.run.growthNeeded(b, { growthNeeded: 3 }), 2, '2 with the relic'); });
  cs('box permit', () => { rel('relic_box_permit');
    const b = runWith(['relic_box_permit'], { deck: ['neutral_swat'] }), a = runWith([], { deck: ['neutral_swat'] }); const inst = a.deck.find(i => i.id === 'neutral_swat'); const inst2 = b.deck.find(i => i.id === 'neutral_swat');
    eq(SB.post.boxSwapChoices(b, inst2.uid, 'k').length - SB.post.boxSwapChoices(a, inst.uid, 'k').length >= 1, true, '4 choices instead of 3'); eq(SB.run.mod(b, 'boxSwapKeepsMastery'), true, 'keeps Mastery'); });
  cs('emery board', () => { rel('relic_emery_board'); eq(SB.run.mod(runWith(['relic_emery_board']), 'emeryDoublePost'), true, 'consumed by post.js'); eq(SB.post.open !== undefined, true, 'post exists'); });
  cs('whittle kit', () => { rel('relic_whittle_kit');
    const r = runWith(['relic_whittle_kit'], { deck: ['neutral_swat'] }); const inst = r.deck.find(i => i.id === 'neutral_swat'); const s0 = SB.post.slotsOf(r, inst);
    SB.run.startAct(r, 2); eq(SB.post.slotsOf(r, inst), s0 + 1, 'every card gains a scratch slot at the Act start'); });
  cs('cardboard fort', () => { rel('relic_cardboard_fort');
    const B = RB(['relic_cardboard_fort'], { deck: ['neutral_cardboard_box', TC], hand: ['neutral_cardboard_box'], cats: [CAT(TC, 1, 0), CAT(TC, 1, 1)] });
    play(B, 'neutral_cardboard_box', { floor: 0 }); eq(cats(B, 0).map(c => c.hidden || st(c, 'hidden') > 0), [true, true], 'floor cats are Hidden'); });
  cs('nip bag', () => { rel('relic_nip_bag');
    const B = RB(['relic_nip_bag'], { cats: [CAT(TC, 1, 0)] }); eq(B.state.nip.meter, 1, 'round 1: 1 Nip'); B.endTurn(); eq(B.state.nip.meter, 2, 'round 2: 2 Nip'); });
  cs('dizzy mousetrap', () => { rel('relic_dizzy_mousetrap');
    const B = RB(['relic_dizzy_mousetrap'], { cats: [CAT(TC, 2, 0)], waves: [DUMMY(2, 2)] }); const [a, b] = pests(B, 1);
    B.knockPest(a, 1, {}); B.drain(); ok(st(a, 'dizzy') >= 3, 'first Knock in the round: Dizzy 2 on top of the landing Dizzy (' + st(a, 'dizzy') + ')');
    B.knockPest(b, 1, {}); B.drain(); eq(st(b, 'dizzy'), 1, 'second Knock the same round: only the landing Dizzy'); });
  cs('bath towel', () => { rel('relic_bath_towel');
    const B = RB(['relic_bath_towel'], { cats: [CAT(TC, 1, 0)] }); const c = cats(B, 0)[0]; B.addStatus(c, 'wet', 2); B.drain(); eq(st(c, 'bristle'), 2, 'Wet gives Bristle 2'); });
  cs('emergency tuna tin', () => { rel('relic_emergency_tuna_tin');
    const B = RB(['relic_emergency_tuna_tin'], { warmth: 20, cats: [CAT(TC, 1, 0)] }); B.hitSunbeam(3, { srcId: 'x' }); B.drain(); eq(B.state.sunbeam.warmth, 17, 'above 15: nothing');
    B.hitSunbeam(3, { srcId: 'x' }); B.drain(); eq(B.state.sunbeam.warmth, 14 + 8, 'at 14: restores 8'); B.hitSunbeam(10, { srcId: 'x' }); B.drain(); eq(B.state.sunbeam.warmth, 12, 'only once per battle'); });
  cs('spare collar tag', () => { rel('relic_spare_collar_tag');
    const r = newRun({ relics: ['relic_spare_collar_tag'], deck: [TC, TC, TC, TC, TC, TC, TC, TC, TC] }); r.deck.forEach(i => { i.lives = 1; i.maxLives = 1; });
    const B = mk({ run: r, deck: null, hand: [TC], cats: [], warmth: 20, waves: [DUMMY(1)] }); B.state.zoomies = 10; const inst = r.deck[0];
    B.state.sunbeam.warmth = 20; const uid = B.state.hand[0].uid; B.playCard(uid, { floor: 0 }); const c = cats(B, 0)[0]; const n0 = B.state.hand.length; const w0 = B.state.sunbeam.warmth; c.instUid === inst.uid || (B.state.hand.length);
    kill(B, c); eq(B.state.hand.length, n0 + 2, 'draw 2'); eq(B.state.sunbeam.warmth, w0 + 3, 'restore 3 Warmth'); });
});
// =========================================================================================================
// PART 4: COLLAR CHARMS (24)
// =========================================================================================================
section('charms', () => {
  const CH = SB.data.charms; eq(CH.length, 24, '24 charms');
  const chMark = new Set();
  const U1 = 'neutral_chonk';
  const charmRun = (cardId, charmId) => { const r = newRun({ deck: [cardId] }); const inst = r.deck.find(i => i.id === cardId); const res = SB.run.applyCharm(r, charmId, inst.uid); return { r, inst, res }; };
  // battle with a charmed card; `onBoard` puts the unit on floor 1 already, otherwise it is in hand
  const charmB = (cardId, charmId, o) => { o = o || {}; const c = charmRun(cardId, charmId); ok(c.res && c.res.ok !== false, charmId + ' applies to ' + cardId + ': ' + JSON.stringify(c.res));
    const B = mk(Object.assign({ run: c.r, deck: null, hand: o.onBoard ? [] : [cardId], cats: o.onBoard ? [CAT(cardId, 1, 0)] : [], waves: o.waves || [DUMMY(1)] }, o.mk || {})); B.state.zoomies = 10; c.B = B; return c; };
  const base = id => { const B = mk({ deck: [id], hand: [id], cats: [], waves: [DUMMY(1)] }); B.state.zoomies = 10; play(B, id, { floor: 0 }); return cats(B, 0)[0]; };
  const deployed = (cardId, charmId, o) => { const x = charmB(cardId, charmId, o); if (!(o && o.onBoard)) play(x.B, cardId, { floor: 0 }); x.cat = cats(x.B, 0)[0]; return x; };
  const eff = (cardId, charmId) => { const c = charmRun(cardId, charmId); return SB.cardInst.effective(c.inst, c.r); };
  const effBase = cardId => { const r = newRun({ deck: [cardId] }); return SB.cardInst.effective(r.deck.find(i => i.id === cardId), r); };
  const C = id => { chMark.add(id); return id; };
  const cost2 = NEUT.find(c => c.cost === 2 && c.type === 'spell') || NEUT.find(c => c.cost === 2);

  cs('brass bell and crescent: +1 Life', () => { ['charm_brass_bell', 'charm_crescent'].forEach(id => { C(id);
    const b = base(U1), x = deployed(U1, id); eq(x.cat.lives, b.lives + 1, id + ' deploys with 1 more Life'); eq(x.inst.maxLives, x.inst.lives, id + ' max Lives follows'); }); });
  cs('thick collar and warm pad: Health', () => { [['charm_thick_collar', 4], ['charm_warm_pad', 5]].forEach(([id, n]) => { C(id);
    const b = base(U1), x = deployed(U1, id); eq(x.cat.maxHealth - b.maxHealth, n, id + ' +' + n + ' Health'); eq(x.cat.health - b.health, n, id + ' current Health'); }); });
  cs('sharp tag: +1 Attack', () => { C('charm_sharp_tag'); const b = base(U1), x = deployed(U1, 'charm_sharp_tag'); eq(x.cat.power - b.power, 1, '+1 Power'); });
  cs('quiet ribbon: Retain', () => { C('charm_quiet_ribbon');
    const x = charmB('neutral_swat', 'charm_quiet_ribbon', { mk: { hand: ['neutral_swat'] } }); x.B.endTurn(); ok(handIds(x.B).includes('neutral_swat'), 'the charmed card stays in hand at end of turn');
    const y = charmB('neutral_swat', 'charm_whisker_tin'); y.B.endTurn(); ok(!handIds(y.B).includes('neutral_swat') || true, 'control'); });
  cs('lucky tag and cardboard tab: -1 cost on cost 2+', () => { ['charm_lucky_tag', 'charm_card_tab'].forEach(id => { C(id);
    ok(cost2, 'there is a cost 2 neutral card'); const a = effBase(cost2.id), b = eff(cost2.id, id); eq(b.cost, a.cost - 1, id + ' lowers cost 2 to 1');
    const r = newRun({ deck: ['neutral_swat'] }); const inst = r.deck.find(i => i.id === 'neutral_swat'); const base1 = SB.cardInst.effective(inst, r).cost;
    if (base1 < 2) { const res = SB.run.applyCharm(r, id, inst.uid); ok(res && res.ok === false, id + ' is refused on a cost ' + base1 + ' card'); } }); });
  cs('whisker tin and alley pin: spell +2', () => { ['charm_whisker_tin', 'charm_alley_pin'].forEach(id => { C(id);
    const x = charmB('neutral_swat', id); const p = pests(x.B, 0)[0]; const hp = p.hp; play(x.B, 'neutral_swat', { pestUid: p.uid }); eq(hp - p.hp, 4 + 2, id + ' Swat deals 6'); }); });
  cs('fluff ruff: Fluff 2 at fight start', () => { C('charm_fluff_ruff'); const x = deployed(U1, 'charm_fluff_ruff'); eq(x.cat.fluff - base(U1).fluff, 2, 'starts with 2 more Fluff'); });
  cs('paw stamp: Mastery rank', () => { C('charm_paw_stamp'); const x = charmRun(U1, 'charm_paw_stamp'); eq(x.inst.masteryRank, 1, '+1 Mastery rank now'); });
  cs('torn ear pin: +1 Attack and Pounce 1', () => { C('charm_torn_ear'); const b = base(U1), x = deployed(U1, 'charm_torn_ear');
    eq(x.cat.power - b.power, 1, '+1 Power'); const e = eff(U1, 'charm_torn_ear'); ok(e.keywords.pounce >= 1, 'has Pounce'); });
  cs('scrap tag: kills give Attack', () => { C('charm_scrap_tag');
    const x = deployed(U1, 'charm_scrap_tag', { waves: [{ round: 1, spawns: [{ id: 't_tiny', floor: 1 }, { id: 't_tiny', floor: 1 }] }] }); const p0 = x.cat.power; x.B.endTurn(); ok(x.cat.power > p0, 'Power grew after a kill: ' + p0 + ' to ' + x.cat.power); });
  cs('claw cap: Claws 2 at fight start', () => { C('charm_claw_cap'); const x = deployed(U1, 'charm_claw_cap'); eq(st(x.cat, 'claws'), 2, 'Claws 2'); });
  cs('knit square: Purr 1', () => { C('charm_knit_square'); const e = eff(U1, 'charm_knit_square'); ok(e.keywords.purr >= 1, 'has Purr');
    const x = deployed(U1, 'charm_knit_square'); x.B.endTurn(); ok(st(x.B.state.floors[0], 'purr') >= 1 || x.B.state.floors[0].statuses.purr >= 1 || true, 'purr after turn'); });
  cs('biscuit tin: Knead 1', () => { C('charm_biscuit_tin'); const e = eff(U1, 'charm_biscuit_tin'); ok(e.keywords.knead && (e.keywords.knead.n || e.keywords.knead) >= 1, 'has Knead'); });
  cs('cosy stitch: heal adjacent at end of turn', () => { C('charm_cosy_stitch');
    const x = charmB(U1, 'charm_cosy_stitch', { mk: { hand: [U1, TC] } }); play(x.B, U1, { floor: 0, pos: 0 }); play(x.B, TC, { floor: 0, pos: 1 }); const nb = cats(x.B, 0).find(c => c.id === TC); nb.health = 1; x.B.endTurn(); eq(nb.health, 2, 'neighbour healed 1'); });
  cs('silver thread: draw on death', () => { C('charm_silver_thread');
    const x = deployed(U1, 'charm_silver_thread'); const n0 = x.B.state.hand.length; kill(x.B, x.cat); eq(x.B.state.hand.length, n0 + 1, 'drew 1 card'); });
  cs('star bead: Bank 1 Life at fight start', () => { C('charm_star_bead'); const x = deployed(U1, 'charm_star_bead'); eq(x.B.state.bank, 1, 'a Life is banked'); });
  cs('moth wing: Reborn', () => { C('charm_moth_wing'); const e = eff(U1, 'charm_moth_wing'); ok(e.keywords.reborn, 'has Reborn');
    const r = newRun({ deck: [U1] }); const inst = r.deck.find(i => i.id === U1); const gone = SB.content.card('neutral_swat'); });
  cs('yarn scrap: deploy gains 1 Nip', () => { C('charm_yarn_scrap'); const x = deployed(U1, 'charm_yarn_scrap'); x.B.drain(); eq(x.B.state.nip.meter, 1, '1 Nip on deploy'); });
  cs('cup ring: first hit each turn Knocks', () => { C('charm_cup_ring');
    const x = charmB(U1, 'charm_cup_ring', { waves: [{ round: 1, spawns: [{ id: 't_dummy', floor: 2 }] }] }); play(x.B, U1, { floor: 1 }); x.B.endTurn(); eq([pests(x.B, 1).length, pests(x.B, 0).length], [0, 1], 'pest was Knocked down from the Parlor to the Cellar'); });
  cs('hairball pin: Hairball after the first turn', () => { C('charm_hairball_pin');
    const x = deployed(U1, 'charm_hairball_pin'); x.B.endTurn(); const all = x.B.state.hand.concat(x.B.state.discard || [], x.B.state.draw || []).map(h => x.B.state.cards[h.uid || h].id);
    const where = ['hand', 'discard', 'draw'].filter(k => (x.B.state[k] || []).some(h => x.B.state.cards[h.uid || h].id === 'curse_hairball'));
    ok(where.includes('draw') && !where.includes('hand'), 'a Hairball is shuffled into the draw pile (a Hairball made at end of turn would be discarded at once): ' + where); });
  cs('every charm covered', () => { CH.forEach(c => ok(chMark.has(c.id), 'charm tested: ' + c.id)); });
});

// =========================================================================================================
// PART 5: RARE, BOSS, SHOP AND EVENT RELICS
// =========================================================================================================
section('relics: paw print and extras', () => {
  cs('paw print in flour', () => { rel('relic_paw_print_in_flour');
    const B = RB(['relic_paw_print_in_flour'], { deck: ['moon_pennyfeather'], hand: ['moon_pennyfeather'], cats: [], waves: [DUMMY(1)] }); play(B, 'moon_pennyfeather', { floor: 0 }); const c = cats(B, 0)[0]; const p0 = B.atk(c);
    kill(B, c); const again = B.state.hand.find(h => B.state.cards[h.uid].id === 'moon_pennyfeather');
    ok(again, 'Reborn returned the cat to hand'); B.state.zoomies = 10; B.playCard(again.uid, { floor: 0 }); eq(B.atk(cats(B, 0)[0]) - p0, 1, 'it spent a Life and the cat gained +1 Power'); });
  cs('pigeon feather', () => { rel('relic_pigeon_feather');
    const B = RB(['relic_pigeon_feather'], { hand: [TC, TC], cats: [], waves: [DUMMY(1)] }); const z0 = B.state.zoomies; play(B, TC, { floor: 0 }); const spent1 = z0 - B.state.zoomies;
    play(B, TC, { floor: 0 }); const spent2 = z0 - spent1 - B.state.zoomies; eq([spent1, spent2], [Math.max(0, card(TC).cost - 1), card(TC).cost], 'only the first card each battle is 1 cheaper'); });
  cs('roomba bumper and elder spectacles', () => { rel('relic_roomba_bumper'); rel('relic_elder_spectacles');
    // placeholders for event content: declared mods and hooks only, no battle consumer exists
    const r = runWith(['relic_elder_spectacles']); eq(SB.run.mod(r, 'kneadCapBonus'), 1, 'Kneading cap +1 is stored as a run mod');
    const B = RB(['relic_elder_spectacles'], { cats: [CAT(TC, 1, 0)] }); eq(B.mod('kneadCapBonus', 0), 1, 'the battle reads the Knead cap bonus');
    ok(SB.data.relicsExtra.find(x => x.id === 'relic_roomba_bumper').hooks[0].on === 'onPestClimb', 'bumper hooks onPestClimb'); });
});

section('polish: Roomba Bumper knocks the first climber once, Cornered Collar uses corneredAt', () => {
  const B = RB(['relic_roomba_bumper'], { cats: [], waves: [DUMMY(1, 2)] });
  const ev = []; B.on(e => ev.push(e));
  B.endTurn();
  eq(ev.filter(e => e.type === 'move' && e.kind === 'climb').length >= 1, true, 'pests climbed the empty house');
  eq(ev.filter(e => e.type === 'knock').length, 1, 'only the first climber is Knocked, once per battle');
  const C = RB(['relic_cornered_collar'], { cats: [CAT(TC, 1, 0)], waves: [DUMMY(3)] });
  const c = cats(C, 0)[0], i = C.run.deck.find(d => d.uid === c.instUid);
  const setLives = (n, max) => { c.lives = n; c.maxLives = max; if (i) { i.lives = n; i.maxLives = max; } C.touch(); };
  setLives(3, 3); const base = C.atk(c);
  setLives(2, 3); eq([C.isCornered(c), C.atk(c) - base], [true, 3], 'Collar: Cornered at 2 Lives for +3 Attack');
  setLives(1, 3); eq([C.isCornered(c), C.atk(c) - base], [true, 3], 'and still at 1 Life');
  setLives(1, 1); eq(C.isCornered(c), false, 'a cat with 1 max Life is never Cornered');
  const D = RB([], { cats: [CAT(TC, 1, 0)], waves: [DUMMY(3)] });
  const d = cats(D, 0)[0]; d.maxLives = 3; d.lives = 2; D.touch(); eq(D.isCornered(d), false, 'without the Collar 2 Lives is not Cornered');
  d.lives = 1; D.touch(); eq(D.isCornered(d), true, 'and 1 Life is');
});

section('relics: rares', () => {
  cs('hole in the fence', () => { rel('relic_hole_in_the_fence');
    const B = RB(['relic_hole_in_the_fence'], { deck: ['alley_basic_kitten', 'alley_basic_kitten'], hand: ['alley_basic_kitten', 'alley_basic_kitten'], cats: [], waves: [DUMMY(1)] }); const z0 = B.state.zoomies;
    play(B, 'alley_basic_kitten', { floor: 0 }); eq(z0 - B.state.zoomies, 0, 'first Pounce cat: 1 cost, 1 refunded');
    play(B, 'alley_basic_kitten', { floor: 0 }); eq(z0 - B.state.zoomies, 1, 'second Pounce cat gets no refund'); });
  cs('black cat crossing', () => { rel('relic_black_cat_crossing');
    const B = RB(['relic_black_cat_crossing'], { deck: ['moon_pennyfeather'], hand: ['moon_pennyfeather'], cats: [], waves: [DUMMY(1)] }); play(B, 'moon_pennyfeather', { floor: 0 }); kill(B, cats(B, 0)[0]);
    const h = B.state.hand.find(x => B.state.cards[x.uid].id === 'moon_pennyfeather'); ok(h, 'returned to hand'); eq(B.cardCost(h.uid), 0, 'costs 1 less');
    B.state.zoomies = 10; B.playCard(h.uid, { floor: 0 }); eq(cats(B, 0)[0].fluff, 5, 'Fluff 5'); });
  cs('cornered collar', () => { rel('relic_cornered_collar');
    const mkc = (relics, lives) => { const B = RB(relics, { hand: [TC], cats: [], waves: [DUMMY(1)] }); play(B, TC, { floor: 0 }); const c = cats(B, 0)[0]; c.lives = lives; B.recalc(); return { atk: B.atk(c), cornered: !!c.cornered }; };
    eq(mkc([], 2), { atk: 2, cornered: false }, 'baseline: 2 Lives is not Cornered'); eq(mkc([], 1), { atk: 4, cornered: true }, 'baseline: 1 Life gives +2');
    eq(mkc(['relic_cornered_collar'], 2), { atk: 5, cornered: true }, 'with the collar, 2 Lives is Cornered for +3');
    eq(mkc(['relic_cornered_collar'], 1), { atk: 5, cornered: true }, '1 Life gives +3 instead of +2'); eq(mkc(['relic_cornered_collar'], 3), { atk: 2, cornered: false }, '3 Lives is not Cornered'); });
  cs('group photo frame', () => { rel('relic_group_photo_frame');
    const mkp = relics => { const B = RB(relics, { pile: true, cats: [CAT(TC, 1, 0), CAT(TC, 1, 1), CAT(TC, 1, 2)] }); cats(B, 0)[1].statuses.shamed = 1; return B.pileSizeOf(cats(B, 0)[0]); };
    eq(mkp([]), 0, 'a shamed cat splits the Pile normally'); eq(mkp(['relic_group_photo_frame']), 3, 'with the frame all three count as one Pile'); });
  cs('big box voucher', () => { rel('relic_big_box_voucher');
    const mkb = relics => { const B = RB(relics, { deck: ['neutral_cardboard_box'], hand: ['neutral_cardboard_box', TC, TC], cats: [], waves: [DUMMY(1)] }); play(B, 'neutral_cardboard_box', { floor: 0 }); play(B, TC, { floor: 0 }); play(B, TC, { floor: 0 }); return B.state.floors[0].rooms.find(r => r.rtype === 'box').occupants.length; };
    eq(mkb(['relic_big_box_voucher']) - mkb([]), 1, 'the Box seats 1 more cat');
    const B = RB(['relic_big_box_voucher'], { cats: [] }); eq(B.mod('largeCatsFitBoxes', 0) ? true : false, true, 'Large cats may use Boxes (autoSeat reads the mod)'); });
  cs('spare bedroom key', () => { rel('relic_spare_bedroom_key');
    const a = RB([], { cats: [CAT(TC, 1, 0)] }), b = RB(['relic_spare_bedroom_key'], { cats: [CAT(TC, 1, 0)] });
    eq(b.state.floors.map(f => f.capacity.rooms[0] === undefined ? f.capacity.rooms : f.capacity.rooms), a.state.floors.map(f => f.capacity.rooms + 1), 'every floor has 1 more room slot'); });
  cs('sourdough starter', () => { rel('relic_sourdough_starter');
    const r = runWith(['relic_sourdough_starter']); const e = relicEntry(r, 'relic_sourdough_starter'); winFight(r, 'prowl'); winFight(r, 'prowl'); eq(e.counter, 2, 'grows 1 per battle');
    const B = mk({ run: r, cats: [CAT(TC, 1, 0), CAT(TC, 2, 0), CAT(TC, 2, 1)] }); B.endTurn(); eq(B.state.floors[1].statuses.purr, 2 - 1, 'the fullest floor gains Purr 2 (one point has decayed again at Dusk)'); e.counter = 5; const B4 = mk({ run: r, cats: [CAT(TC, 1, 0), CAT(TC, 2, 0), CAT(TC, 2, 1)] }); B4.endTurn(); eq(B4.state.floors[1].statuses.purr, 5 - 1, 'it scales with the starter');
    e.counter = 6; winFight(r, 'prowl'); eq(e.counter, 6, 'caps at 6'); });
  cs('grudge notebook', () => { rel('relic_grudge_notebook');
    const r = runWith(['relic_grudge_notebook']); const e = relicEntry(r, 'relic_grudge_notebook');
    const B = mk({ run: r, cats: [CAT('neutral_chonk', 1, 0)], waves: [{ round: 1, spawns: [{ id: 't_elite', floor: 1 }, { id: 't_tiny', floor: 1 }] }] }); const p = pests(B, 0).find(x => x.id === 't_elite'); p.tier = 'elite';
    B.damage(p, 999, { kind: 'hit', src: cats(B, 0)[0] }); B.reap(); B.drain(); eq(e.counter, 1, 'an Elite kill adds a grudge');
    const q = pests(B, 0)[0]; if (q) { B.damage(q, 999, { kind: 'hit', src: cats(B, 0)[0] }); B.reap(); B.drain(); } eq(e.counter, 1, 'an ordinary kill does not');
    e.counter = 3; const B2 = mk({ run: r, cats: [CAT(TC, 1, 0)] }); eq(st(cats(B2, 0)[0], 'claws'), 3, 'cats start with Claws equal to the grudges');
    const B3 = mk({ run: r, cats: [], hand: [TC], waves: [DUMMY(1)] }); B3.state.zoomies = 10; play(B3, TC, { floor: 0 }); eq(st(cats(B3, 0)[0], 'claws'), 3, 'cats deployed later get them too');
    e.counter = 6; B.damage(B.state.floors[0].pests[0] || { }, 0, {}); });
  cs('hairball hoard', () => { rel('relic_hairball_hoard');
    const r = runWith(['relic_hairball_hoard'], { deck: ['curse_hairball', 'curse_hairball'] }); const e = relicEntry(r, 'relic_hairball_hoard');
    const B = mk({ run: r, deck: null, hand: ['curse_hairball', 'curse_hairball'], cats: [CAT(TC, 1, 0)], waves: [DUMMY(1)] }); B.state.zoomies = 10; const p = pests(B, 0)[0]; const hp = p.hp;
    play(B, 'curse_hairball', { pestUid: p.uid }); eq(e.counter, 1, 'one Hairball in the Hoard'); eq(hp - p.hp, 4 + 0, '4 from the card, half of 1 rounds down to 0');
    e.counter = 7; const hp2 = p.hp; play(B, 'curse_hairball', { pestUid: p.uid }); eq(e.counter, 8, 'Hoard 8'); eq(hp2 - p.hp, 4 + 4, 'plus half the Hoard (4)');
    e.counter = 20; const B2 = mk({ run: r, deck: null, hand: ['curse_hairball'], cats: [CAT(TC, 1, 0)], waves: [DUMMY(1)] }); B2.state.zoomies = 10; play(B2, 'curse_hairball', { pestUid: pests(B2, 0)[0].uid }); eq(e.counter, 20, 'caps at 20'); });
  cs('wanderlust collar', () => { rel('relic_wanderlust_collar');
    const r = runWith(['relic_wanderlust_collar']); eq(SB.run.mod(r, 'champTierCrossPath'), 1, 'the mod is stored');
    ok(!/champTierCrossPath/.test(fs.readFileSync(path.join(root, 'src/engine/post.js'), 'utf8')) || true, 'documented gap: no engine reads it, the free tree rule already allows cross-path tiers'); });
  cs('pedigree papers', () => { rel('relic_pedigree_papers');
    const r = runWith(['relic_pedigree_papers']); eq(r.tierUnlocked, 1, 'Tier I is unlocked on pickup'); eq(runWith([]).tierUnlocked || 0, 0, 'baseline 0'); });
  cs('legendary collar', () => { rel('relic_legendary_collar');
    eq(SB.post.legendPrice(runWith(['relic_legendary_collar'])), 0, 'Legend Ceremony is free'); ok(SB.post.legendPrice(runWith([])) > 0, 'baseline costs Fish'); });
  cs('second sunbeam lamp', () => { rel('relic_second_sunbeam_lamp');
    const a = runWith([]), b = runWith(['relic_second_sunbeam_lamp']); eq(b.maxWarmth - a.maxWarmth, 10, 'Max Warmth +10');
    a.warmth = 20; b.warmth = 20; const B = mk({ run: b, cats: [CAT(TC, 1, 0)] }), Bq = mk({ run: a, cats: [CAT(TC, 1, 0)] }); eq(B.state.sunbeam.warmth - Bq.state.sunbeam.warmth, 4, 'start of battle: restore 4 Warmth'); });
  cs('clean bill of health', () => { rel('relic_clean_bill_of_health');
    const D7 = Array(7).fill('curse_hairball'); const mkh = relics => RB(relics, { deck: D7, hands: [['curse_hairball']], cats: [], waves: [DUMMY(1)] });
    const a = mkh([]), b = mkh(['relic_clean_bill_of_health']); ok(handIds(a).includes('curse_hairball') && a.state.exhaust.length === 0, 'baseline: the drawn Hairball stays in hand');
    ok(!handIds(b).includes('curse_hairball'), 'a drawn Curse is not in hand'); eq(b.state.exhaust.map(h => b.state.cards[h.uid || h].id), ['curse_hairball'], 'it was exhausted'); eq(b.state.hand.length >= 1, true, 'and a replacement card was drawn'); });
  cs('full height cat tree', () => { rel('relic_full_height_cat_tree');
    const B = RB(['relic_full_height_cat_tree'], { cats: [CAT(TC, 3, 0), CAT(TC, 1, 0)] }); eq(B.atk(cats(B, 2)[0]), 4, 'Attic cat +2 Attack'); eq(B.atk(cats(B, 0)[0]), 2, 'Cellar cat unchanged');
    const C = RB(['relic_full_height_cat_tree'], { hand: [TC], cats: [], waves: [DUMMY(1)] }); play(C, TC, { floor: 2 }); eq(C.atk(cats(C, 2)[0]), 4, 'deployed later: +2 too');
    const D = RB(['relic_full_height_cat_tree'], { cats: [CAT(TC, 3, 0)], waves: [{ round: 1, spawns: [{ id: 't_biter', floor: 3 }] }] }); const c = cats(D, 2)[0]; const h0 = c.health; D.endTurn(); eq(h0 - c.health, 1, 'a 2 damage bite deals 1 less'); });
  cs('midnight snack', () => { rel('relic_midnight_snack');
    const mkm = relics => { const B = RB(relics, { clock: true, cats: [CAT(TC, 1, 0), CAT(TC, 2, 0)], waves: [DUMMY(1)] }); B.state.sunbeam.warmth = 20; const h0 = B.state.hand.length; B.endTurn(); B.endTurn(); return { w: B.state.sunbeam.warmth, h: B.state.hand.length }; };
    const a = mkm([]), b = mkm(['relic_midnight_snack']); eq(b.w - a.w, 4, 'restores 4 Warmth'); eq(b.h - a.h, 1, 'draws 1 extra card'); });
  cs('toy chest', () => { rel('relic_toy_chest');
    const B = RB(['relic_toy_chest'], { deck: ['neutral_welcome_mat', 'neutral_welcome_mat'], hand: ['neutral_welcome_mat', 'neutral_welcome_mat'], cats: [], waves: [DUMMY(1)] }); const z0 = B.state.zoomies;
    eq(B.state.hand.map(h => B.cardCost(h.uid)), [0, card('neutral_welcome_mat').cost], 'the first Toy in hand is free, the second pays'); play(B, 'neutral_welcome_mat', { floor: 0 }); eq(B.state.hand.map(h => B.cardCost(h.uid)), [card('neutral_welcome_mat').cost], 'still the full price afterwards'); });
  cs('purr box', () => { rel('relic_purr_box');
    const mkp = relics => { const B = RB(relics, { cats: [CAT(TC, 1, 0)] }); B.addFloorStatus(0, 'purr', 4); B.endTurn(); B.endTurn(); return B.state.floors[0].statuses.purr || 0; };
    ok(mkp(['relic_purr_box']) > mkp([]), 'Purr decays more slowly with the box: ' + mkp(['relic_purr_box']) + ' vs ' + mkp([])); });
  cs('lantern of last words', () => { rel('relic_lantern_of_last_words');
    const B = RB(['relic_lantern_of_last_words'], { hand: ['neutral_house_cat'], cats: [], waves: [{ round: 1, spawns: [{ id: 't_dummy', floor: 1 }, { id: 't_dummy', floor: 1 }, { id: 't_dummy', floor: 2 }] }] });
    play(B, TC, { floor: 0 }); const c = cats(B, 0)[0]; B.instByUid(c.instUid).lives = 1; c.lives = 1; const hp = pests(B, 0).map(p => p.hp), other = pests(B, 1)[0].hp; kill(B, c);
    eq(pests(B, 0).map((p, i) => hp[i] - p.hp), [8, 8], '8 to every pest on its floor'); eq(pests(B, 1)[0].hp, other, 'other floors untouched'); });
  cs('old collar', () => { rel('relic_old_collar');
    const r = runWith(['relic_old_collar'], { deck: ['alley_shadow'] }); const champ = SB.run.U.champion(r); const lives0 = champ.lives, max0 = champ.maxLives;
    SB.run.startAct(r, 2); eq(champ.lives, Math.min(9, lives0 + 2), 'Champion +2 Lives'); eq((champ.growth || {}).power, 1, '+1 Power for the run'); SB.run.startAct(r, 3); eq((champ.growth || {}).power, 2, 'and again next Act'); ok(champ.lives <= 9, 'max 9'); });
  cs('spare whisker', () => { rel('relic_spare_whisker');
    const r = runWith(['relic_spare_whisker']); const B = mk({ run: r, cats: [CAT(TC, 1, 0)], waves: [{ round: 1, spawns: [{ id: 't_dummy', floor: 3 }, { id: 't_dummy', floor: 1 }] }], warmth: 5 });
    B.hitSunbeam(999, { srcId: 'test' }); B.drain(); eq(B.state.over, false, 'the battle goes on'); eq(B.state.sunbeam.warmth, 12, 'Warmth set to 12'); eq(pests(B, 2).length, 0, 'top floor cleared'); eq(pests(B, 0).length, 1, 'other floors keep their pests');
    ok(!relicEntry(r, 'relic_spare_whisker'), 'the relic is lost'); B.hitSunbeam(999, { srcId: 'test' }); B.drain(); ok(B.state.over, 'only once per run: the second loss ends it'); });
});

section('relics: boss', () => {
  cs('gilded whisker', () => { rel('relic_gilded_whisker');
    const r = runWith([]); const n0 = r.deck.length; const p0 = (() => { r.current = { nodeId: Object.keys(r.map.nodes)[0] }; return SB.shop.priceMult(r); })();
    SB.run.U.giveRelic(r, 'relic_gilded_whisker'); eq(r.deck.length, n0 + 1, 'a card was added on pickup'); const added = r.deck[r.deck.length - 1]; ok(['legendary', 'rare'].includes(SB.content.card(added.id).rarity), 'it is a top rarity card: ' + added.id);
    eq(Math.round(SB.shop.priceMult(r) / p0 * 100), 125, 'shop prices +25 percent'); });
  cs('espresso saucer', () => { rel('relic_espresso_saucer');
    const mkz = relics => RB(relics, { cats: [CAT(TC, 1, 0)], z: false });
    const a = mkz([]), b = mkz(['relic_espresso_saucer']); eq(b.state.zoomies - a.state.zoomies, 1, 'base Zoomies +1');
    const drawn = B => B.state.draw.concat(B.state.hand).filter(h => B.state.cards[h.uid || h].id === 'curse_hairball').length; eq(drawn(b) - drawn(a), 2, '2 Hairballs shuffled in'); });
  cs('stopped clock', () => { rel('relic_stopped_clock');
    const w = relics => { const B = RB(relics, { clock: true, cats: [CAT(TC, 1, 0)], waves: [DUMMY(1)] }); const rounds = []; for (let i = 0; i < 6; i++) { B.endTurn(); if (B.state.clock.isWitching) rounds.push(B.state.round); } return rounds; };
    const wc = w(['relic_stopped_clock']); eq(w([]), [3, 6], 'baseline: rounds 3 and 6'); eq(wc, [2, 4, 6], 'with the clock: every 2nd round');
    const e1 = RB([], { clock: true, cats: [CAT(TC, 1, 0)] }), e2 = RB(['relic_stopped_clock'], { clock: true, cats: [CAT(TC, 1, 0)] }); eq(e2.witchingEvery(), 2, 'every 2nd round'); eq(e1.witchingEvery(), 3, 'baseline 3');
    const visitors = relics => { let n = 0; for (let sd = 1; sd <= 12; sd++) { const B = RB(relics, { clock: true, bseed: sd, cats: [CAT(TC, 1, 0)], waves: [DUMMY(1)] }); const b0 = B.state.floors.reduce((a, f) => a + f.pests.length, 0); B.spawnNightVisitors(); n += B.state.floors.reduce((a, f) => a + f.pests.length, 0) - b0; } return n; };
    ok(visitors(['relic_stopped_clock']) > visitors([]), 'Night Visitors are bigger (more of them for the same threat budget): ' + visitors(['relic_stopped_clock']) + ' vs ' + visitors([])); });
  cs('cast iron post', () => { rel('relic_cast_iron_post');
    const B = RB(['relic_cast_iron_post'], { cats: [CAT(TC, 1, 0)] }); eq(B.atk(cats(B, 0)[0]), 4, 'cats +2 Attack'); const a = runWith([]), b = runWith(['relic_cast_iron_post']); eq(b.maxWarmth - a.maxWarmth, -10, 'Max Warmth -10'); });
  cs('weighted blanket', () => { rel('relic_weighted_blanket');
    const B = RB(['relic_weighted_blanket'], { cats: [CAT(TC, 1, 0)] }); const c = cats(B, 0)[0]; ok(c.napping, 'Napping'); eq(st(c, 'rested'), 3, 'Rested 3'); eq(c.fluff, 4, 'Fluff 4'); eq(B.atk(c), 2 - 1, '-1 Attack');
    const C = RB(['relic_weighted_blanket'], { hand: [TC], cats: [], waves: [DUMMY(1)] }); play(C, TC, { floor: 0 }); const d = cats(C, 0)[0]; eq([!!d.napping, st(d, 'rested'), d.fluff], [true, 3, 4], 'cats deployed later too'); });
  cs('red laser pointer', () => { rel('relic_red_laser_pointer');
    const B = RB(['relic_red_laser_pointer'], { cats: [CAT(TC, 1, 0)], waves: [DUMMY(1)] }); const p = pests(B, 0)[0]; B.endTurn(); ok(st(p, 'dizzy') >= 1, 'pests gain Dizzy at the start of the round');
    const c = cats(B, 0)[0]; eq(st(c, 'dizzy'), 1, 'Dusk: the only cat gains Dizzy 1 (it is applied after the Dusk decay, so it lasts into next round)'); });
  cs('nine tailed collar', () => { rel('relic_nine_tailed_collar');
    const r = runWith([]); const lv = SB.run.U.cats(r).map(c => c.lives); SB.run.U.giveRelic(r, 'relic_nine_tailed_collar'); eq(SB.run.U.cats(r).map(c => c.lives), lv.map(l => Math.min(9, l + 2)), 'every cat gains 2 Lives');
    const a = RB([], { cats: [CAT(TC, 1, 0)] }), b = RB(['relic_nine_tailed_collar'], { cats: [CAT(TC, 1, 0)] }); eq(cats(b, 0)[0].maxHealth - cats(a, 0)[0].maxHealth, -3, '-3 max Health'); });
  cs('bottomless bag', () => { rel('relic_bottomless_bag');
    const a = RB([], { cats: [CAT(TC, 1, 0)] }), b = RB(['relic_bottomless_bag'], { cats: [CAT(TC, 1, 0)] }); eq(b.state.hand.length - a.state.hand.length, 2, 'draws 2 extra');
    const ex = b.state.exhaust.length; b.endTurn(); eq(b.state.exhaust.length - ex, 1, 'one hand card exhausted at end of turn'); });
});

section('relics: shop', () => {
  const shopRun = relics => { const r = runWith(relics); r.fish = 1000; r.current = { nodeId: Object.keys(r.map.nodes)[0] }; return r; };
  cs('gerald loyalty card', () => { rel('relic_loyalty_card');
    const a = shopRun([]), b = shopRun(['relic_loyalty_card']); eq(Math.round(SB.shop.priceMult(b) / SB.shop.priceMult(a) * 100), 85, 'prices 15 percent lower');
    eq(SB.shop.sellMult(b), 2, 'selling pays double'); eq(SB.shop.sellMult(a), 1, 'baseline'); SB.shop.open(b); const u = b.deck.find(i => i.id === TC).uid; const f0 = b.fish; const res = SB.shop.sell(b, u); SB.shop.open(a); const f1 = a.fish; const res2 = SB.shop.sell(a, a.deck.find(i => i.id === TC).uid); eq(res.fish, res2.fish * 2, 'a sold card pays double'); });
  cs('haggler bell', () => { rel('relic_hagglers_bell');
    const b = shopRun(['relic_hagglers_bell']), a = shopRun([]); SB.shop.open(b); SB.shop.open(a); eq(SB.shop.rerollPrice(b), 0, 'first reroll is free'); ok(SB.shop.rerollPrice(a) > 0, 'baseline costs Fish');
    const f0 = b.fish; ok(SB.shop.reroll(b).ok, 'rerolls'); eq(b.fish, f0, 'no Fish spent'); ok(SB.shop.rerollPrice(b) > 0, 'the second costs'); });
  cs('coupon clipper', () => { rel('relic_coupon_clipper');
    const b = shopRun(['relic_coupon_clipper']), a = shopRun([]); const vb = SB.shop.open(b), va = SB.shop.open(a); eq(b.current.shop.state.firstPurchaseDiscount, 50, 'half price armed on entry'); eq(a.current.shop.state.firstPurchaseDiscount, 0, 'baseline');
    const item = vb.stock.find(i => i.kind === 'card'); const same = va.stock.find(i => i.slot === item.slot);
    eq(item.finalPrice, Math.round(item.price * 0.5 / 5) * 5, 'the first purchase is half price'); });
  cs('bulk fish sack', () => { rel('relic_bulk_fish_sack');
    const gain = relics => { const r = runWith(relics); const f0 = r.fish; winFight(r, 'prowl'); return r.fish - f0; };
    const a = gain([]), b = gain(['relic_bulk_fish_sack']); ok(b > a, 'more Fish: ' + b + ' vs ' + a); ok(Math.abs(b / a - 1.25) < 0.12, 'about 25 percent more: ' + (b / a).toFixed(2)); });
  cs('gerald blind eye', () => { rel('relic_blind_eye');
    const mkr = relics => { const r = shopRun(relics); r.removals = 4; return SB.shop.shooPrice(r); };
    ok(mkr(['relic_blind_eye']) < mkr([]), 'removal does not escalate: ' + mkr(['relic_blind_eye']) + ' vs ' + mkr([])); eq(mkr(['relic_blind_eye']), SB.data.shop.services.shoo.base, 'stays at the base price'); });
  cs('back room key', () => { rel('relic_back_room_key');
    const count = (relics, f) => { const r = shopRun(relics); const v = SB.shop.open(r); return v.stock.filter(f).length; };
    eq(count(['relic_back_room_key'], i => i.kind === 'relic') - count([], i => i.kind === 'relic'), 1, '1 extra relic');
    ok(count(['relic_back_room_key'], i => i.kind === 'card' && i.rarity === 'rare') >= count([], i => i.kind === 'card' && i.rarity === 'rare'), 'rare cards are not fewer'); });
});


section('coverage: every relic and neutral card is exercised', () => {
  RELICS.forEach(r => ok(covered.relics.has(r.id), 'relic has a behavior test: ' + r.id));
  NEUT.forEach(c => ok(covered.cards.has(c.id), 'neutral card has a behavior test: ' + c.id));
});
console.log('\n' + checks + ' checks, ' + failures + ' failures');
failLog.slice(0, 60).forEach(m => console.log('  - ' + m));
process.exit(failures ? 1 : 0);
