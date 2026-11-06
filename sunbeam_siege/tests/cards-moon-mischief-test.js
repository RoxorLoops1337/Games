// Per-card behavior tests for the moon and mischief clans (agent: card verification).
// node tests/cards-moon-mischief-test.js [--verbose]
// Loads data then engine in the same order as run-tests.js (plus src/engine/ops-*.js), builds a minimal battle per card,
// plays it and asserts that the card text is what the engine does.
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
  ctx.SB.util.quiet = true; (ctx.SB||SB).data.rules.pestsFirst = false; (ctx.SB||SB).data.rules.pestsAlwaysClimb = false; (ctx.SB||SB).data.rules.pestHpMult = 1;
  return ctx.SB;
}

let checks = 0, failures = 0;
const failLog = [];
function ok(c, msg) { checks++; if (!c) { failures++; failLog.push(msg); if (VERBOSE) console.log('  FAIL ' + msg); } return !!c; }
function eq(a, b, msg) { return ok(a === b || JSON.stringify(a) === JSON.stringify(b), msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
const sections = [];
function section(name, fn) { sections.push([name, fn]); }

// ---- fixtures -------------------------------------------------------------------------
const SB = makeSB();
(function addDummies() {
  const T = SB.data.tutorial;
  const wait = [{ kind: 'wait', label: 'Wait' }];
  const pest = (id, hp, actions, traits) => ({ id, name: id, hp, size: 1, traits: traits || [], tags: ['pest'], pattern: { type: 'cycle', actions }, flavor: id, art: { species: 'mouse', colors: 'grey', accessory: 'none' }, tutorialOnly: true });
  T.enemies.push(
    pest('x_dummy', 60, wait),
    pest('x_big', 400, wait),
    pest('x_hitter', 60, [{ kind: 'attack', dmg: 2, hits: 1, floors: 'own', pick: 'front', label: 'Poke' }]),
    pest('x_killer', 60, [{ kind: 'attack', dmg: 50, hits: 1, floors: 'own', pick: 'front', label: 'Smash' }])
  );
  SB.content.rebuild();
})();

function mkRun(seed, deckIds) {
  const run = SB.run.newRun({ seed, clan: 'moon', side: 'mischief', rank: 0 });
  run.relics = [];
  run.deck = deckIds.map(id => SB.cardInst.make(id));
  return run;
}
// o: deck (extra ids), hand (ids for round 1), cats (token cats {card,floor(1-based),pos}), pests [{id,floor(1-based)}],
// waves (extra waves), clock, bseed
function G(o) {
  o = o || {};
  const hand = o.hand || [];
  const fill = o.fill === undefined ? 8 : o.fill;
  const deck = hand.concat(o.deck || []);
  for (let i = 0; i < fill; i++) deck.push('neutral_swat');
  const run = mkRun(o.seed || 'T', deck);
  if (o.plus) run.deck.forEach(i => { if (SB.content.card(i.id).upgrade) i.scratches.push('plus'); });
  const spawns = (o.pests || [{ id: 'x_dummy', floor: 1 }]).map(p => ({ id: p.id, floor: p.floor, at: 'back' }));
  const enc = { id: 'test_enc', type: 'prowl', act: 1, rules: { nightClock: !!o.clock, impatience: false, noPile: o.noPile !== false }, waves: [{ round: 1, spawns }].concat(o.waves || []), setup: { cats: o.cats || [] } };
  if (o.visitors) enc.visitors = o.visitors;
  const hands = o.hands || [hand];
  const B = SB.battle.create(run, enc, { seed: o.bseed === undefined ? 1 : o.bseed, hands, noWitching: !o.clock });
  B.state.sunbeam.warmth = 40;
  B.state.zoomies = o.zoomies === undefined ? 10 : o.zoomies;
  return B;
}
const hid = (B, id) => { const h = B.state.hand.find(x => B.state.cards[x.uid].id === id); return h && h.uid; };
const inHand = (B, id) => B.state.hand.filter(h => B.state.cards[h.uid].id === id).length;
const play = (B, id, target) => { const u = hid(B, id); if (!u) return { ok: false, reason: 'not in hand: ' + id }; return B.playCard(u, target || {}); };
const cats = (B, f) => B.state.floors[f].cats;
const pests = (B, f) => B.state.floors[f].pests;
const allCats = B => B.state.floors.reduce((a, f) => a.concat(f.cats), []);
const allPests = B => B.state.floors.reduce((a, f) => a.concat(f.pests), []);
const cat = (B, id) => allCats(B).find(c => c.id === id);
const inst = (B, c) => B.run.deck.find(i => i.uid === c.instUid);
const handN = B => B.state.hand.length;
// kill a cat with lethal damage (real death path: loses a Life)
function kill(B, c) { B.damage(c, 999, { kind: 'direct', srcId: 'test' }); B.reap(); B.drain(); B.reap(); }
function endTurns(B, n) { for (let i = 0; i < n && !B.state.over; i++) B.endTurn(); }
function waitUntilPlayer(B) { return B.state.turn === 'player'; }

// ---- more helpers ---------------------------------------------------------------------------
function rec(B) { const ev = []; B.on(e => ev.push(e)); return ev; }
function setLives(B, c, n) { c.lives = n; const i = inst(B, c); if (i) { i.lives = n; if (i.maxLives < n) i.maxLives = n; } if (c.maxLives < n) c.maxLives = n; B.touch(); }
// scenario helper: set the starting Lives of a run card (after G, before it is played)
const lv = (B, id, n) => B.run.deck.forEach(i => { if (i.id === id) i.lives = n; });
const one1 = [{ id: 'x_dummy', floor: 1 }];
const two1 = [{ id: 'x_dummy', floor: 1 }, { id: 'x_big', floor: 1 }];
// advance (end turns) until the player turn of the given round
function toRound(B, r) { let g = 0; while (B.state.round < r && !B.state.over && g++ < 30) B.endTurn(); }
const inDiscard = (B, id) => B.state.discard.some(u => B.state.cards[u].id === id);
const inExhaust = (B, id) => B.state.exhaust.some(u => B.state.cards[u].id === id);
const statusEv = (ev, status, side) => ev.filter(e => e.type === 'status' && e.status === status && (!side || e.side === side) && e.kind === 'add');

// ============================================================================================
// MOON: units
// ============================================================================================
section('moon_candle_kitten: marks the front pest of its floor', () => {
  const B = G({ hand: ['moon_candle_kitten'], pests: two1 });
  ok(play(B, 'moon_candle_kitten', { floor: 0 }).ok, 'play');
  eq(pests(B, 0)[0].statuses.marked, 1, 'front pest Marked 1');
  ok(!pests(B, 0)[1].statuses.marked, 'second pest not marked');
});

section('moon_dusk_mouser: loses a Life, draws 1', () => {
  const B = G({ hand: ['moon_dusk_mouser'], pests: one1 });
  play(B, 'moon_dusk_mouser', { floor: 0 });
  const c = cat(B, 'moon_dusk_mouser'), h0 = handN(B);
  kill(B, c);
  eq(handN(B), h0 + 1, 'drew 1 card');
  eq(inst(B, { instUid: c.instUid }).lives, 3, 'life spent (4 -> 3)');
});

section('moon_graveyard_loafer: Fluff 5 at turn start only when Cornered', () => {
  const B = G({ hand: ['moon_graveyard_loafer'], pests: one1 });
  play(B, 'moon_graveyard_loafer', { floor: 0 });
  let c = cat(B, 'moon_graveyard_loafer');
  setLives(B, c, 1);
  B.endTurn();
  c = cat(B, 'moon_graveyard_loafer');
  eq(c.fluff, 5, 'Cornered: Fluff 5');
  const B2 = G({ hand: ['moon_graveyard_loafer'], pests: one1 });
  play(B2, 'moon_graveyard_loafer', { floor: 0 });
  B2.endTurn();
  eq(cat(B2, 'moon_graveyard_loafer').fluff, 0, 'not Cornered: no Fluff');
});

section('moon_pennyfeather: Reborn returns the card to hand', () => {
  const B = G({ hand: ['moon_pennyfeather'], pests: one1 });
  play(B, 'moon_pennyfeather', { floor: 0 });
  const c = cat(B, 'moon_pennyfeather');
  kill(B, c);
  eq(inHand(B, 'moon_pennyfeather'), 1, 'back in hand');
  ok(!inDiscard(B, 'moon_pennyfeather'), 'not in discard');
});

section('moon_borrowed_paws: spend a Life, +2 Attack, draw 1', () => {
  const B = G({ hand: ['moon_borrowed_paws'], pests: one1 });
  const h0 = handN(B);
  play(B, 'moon_borrowed_paws', { floor: 0 });
  const c = cat(B, 'moon_borrowed_paws');
  eq(c.lives, 3, 'spent one Life (4 -> 3)');
  eq(B.atk(c), 5, 'Attack 3 + 2');
  eq(handN(B), h0, 'played one, drew one');
  // a 1-life copy cannot pay, so it gets nothing
  const B2 = G({ hand: ['moon_borrowed_paws'], pests: one1 });
  B2.run.deck.find(i => i.id === 'moon_borrowed_paws').lives = 1;
  const h1 = handN(B2);
  play(B2, 'moon_borrowed_paws', { floor: 0 });
  const c2 = cat(B2, 'moon_borrowed_paws');
  eq(c2.lives, 1, 'cannot spend the last Life');
  eq(B2.atk(c2), 3 + 2, 'Cornered +2 only, no +2 from the card');
  eq(handN(B2), h1 - 1, 'no draw');
});

section('moon_lantern_tom: +2 Attack at each Witching Hour', () => {
  const B = G({ hand: ['moon_lantern_tom'], pests: one1, clock: true });
  play(B, 'moon_lantern_tom', { floor: 0 });
  const c = cat(B, 'moon_lantern_tom');
  eq(B.atk(c), 3, 'base');
  toRound(B, 2);
  eq(B.atk(cat(B, 'moon_lantern_tom')), 3, 'round 2 no change');
  toRound(B, 3);
  ok(B.state.clock.isWitching, 'round 3 is a Witching Hour');
  eq(B.atk(cat(B, 'moon_lantern_tom')), 5, 'round 3 +2');
});

section('moon_hollow_tabby: losing a Life marks a random pest twice', () => {
  const B = G({ hand: ['moon_hollow_tabby'], pests: one1 });
  play(B, 'moon_hollow_tabby', { floor: 0 });
  kill(B, cat(B, 'moon_hollow_tabby'));
  eq(pests(B, 0)[0].statuses.marked, 2, 'Marked 2 (1 each)');
});

section('moon_sleepwalker: never Frazzled after a Witching Hour', () => {
  const B = G({ hand: ['moon_sleepwalker', 'moon_candle_kitten'], pests: one1, clock: true });
  play(B, 'moon_sleepwalker', { floor: 0 }); play(B, 'moon_candle_kitten', { floor: 0 });
  toRound(B, 4);
  eq(cat(B, 'moon_candle_kitten').statuses.frazzled, 1, 'ordinary cat is Frazzled');
  ok(!cat(B, 'moon_sleepwalker').statuses.frazzled, 'Sleepwalker is not');
});

section('moon_stray_medium: bank 1', () => {
  const B = G({ hand: ['moon_stray_medium'], pests: one1 });
  play(B, 'moon_stray_medium', { floor: 0 });
  eq(B.state.bank, 1, 'bank 1');
});

section('moon_ninth_sibling: bank 1 per Life spent or lost, twice a turn', () => {
  const B = G({ hand: ['moon_ninth_sibling', 'moon_borrowed_paws', 'moon_borrowed_paws', 'moon_borrowed_paws'], pests: one1 });
  play(B, 'moon_ninth_sibling', { floor: 0 });
  eq(B.state.bank, 0, 'nothing yet');
  play(B, 'moon_borrowed_paws', { floor: 0 });
  eq(B.state.bank, 1, 'one spend banks exactly 1');
  play(B, 'moon_borrowed_paws', { floor: 0 });
  play(B, 'moon_borrowed_paws', { floor: 1 });
  eq(B.state.bank, 2, 'capped at 2 per turn');
  B.endTurn();
  const c = allCats(B).find(x => x.id === 'moon_borrowed_paws');
  kill(B, c);
  eq(B.state.bank, 3, 'a new turn banks again (a lost Life counts)');
});

section('moon_vigil_keeper: Cornered cats on its floor get Fluff 5 and Hidden', () => {
  const B = G({ hand: ['moon_vigil_keeper', 'moon_pennyfeather', 'moon_pennyfeather', 'moon_cornering_rite', 'moon_cornering_rite'], pests: one1 });
  lv(B, 'moon_pennyfeather', 3);
  play(B, 'moon_vigil_keeper', { floor: 0 });
  play(B, 'moon_pennyfeather', { floor: 0 }); play(B, 'moon_pennyfeather', { floor: 1 });
  const here = cats(B, 0).find(c => c.id === 'moon_pennyfeather'), away = cats(B, 1)[0];
  ok(play(B, 'moon_cornering_rite', { catUid: here.uid }).ok, 'rite on the cat here');
  eq(here.lives, 1, 'Cornered');
  eq(here.fluff, 5, 'Fluff 5');
  ok(here.hidden, 'Hidden');
  ok(play(B, 'moon_cornering_rite', { catUid: away.uid }).ok, 'rite on the cat elsewhere');
  eq(away.fluff, 0, 'no Fluff off floor');
  ok(!away.hidden, 'not Hidden off floor');
});

section('moon_lamplit_gambler: spend up to 2 Lives, draw 1 per Life', () => {
  const B = G({ hand: ['moon_lamplit_gambler'], pests: one1 });
  const h0 = handN(B);
  play(B, 'moon_lamplit_gambler', { floor: 0 });
  const c = cat(B, 'moon_lamplit_gambler');
  eq(c.lives, 2, '4 -> 2');
  eq(handN(B), h0 - 1 + 2, 'drew 2');
  const B2 = G({ hand: ['moon_lamplit_gambler'], pests: one1 });
  B2.run.deck.find(i => i.id === 'moon_lamplit_gambler').lives = 2;
  const h2 = handN(B2);
  play(B2, 'moon_lamplit_gambler', { floor: 0 });
  eq(cat(B2, 'moon_lamplit_gambler').lives, 1, 'a 2-life cat spends just 1');
  eq(handN(B2), h2 - 1 + 1, 'drew 1');
  const B3 = G({ hand: ['moon_lamplit_gambler'], pests: one1 });
  B3.run.deck.find(i => i.id === 'moon_lamplit_gambler').lives = 1;
  const h3 = handN(B3);
  play(B3, 'moon_lamplit_gambler', { floor: 0 });
  eq(handN(B3), h3 - 1, 'a 1-life cat spends nothing and draws nothing');
});

section('moon_wick_witch: Witching Hour marks every pest', () => {
  const B = G({ hand: ['moon_wick_witch'], pests: [{ id: 'x_dummy', floor: 1 }, { id: 'x_dummy', floor: 2 }, { id: 'x_big', floor: 3 }], clock: true });
  play(B, 'moon_wick_witch', { floor: 0 });
  ok(allPests(B).every(p => !p.statuses.marked), 'not before');
  toRound(B, 3);
  const ps = allPests(B).filter(p => p.id.indexOf('x_') === 0);
  ok(ps.length >= 3 && ps.every(p => p.statuses.marked >= 1), 'all pests Marked at the Witching Hour');
});

section('moon_pallbearer_tom: returns a cat from the discard pile to hand', () => {
  const B = G({ hand: ['moon_dusk_mouser', 'moon_pallbearer_tom'], pests: one1 });
  play(B, 'moon_dusk_mouser', { floor: 0 });
  kill(B, cat(B, 'moon_dusk_mouser'));
  ok(inDiscard(B, 'moon_dusk_mouser'), 'mouser in discard');
  const n0 = inHand(B, 'moon_dusk_mouser');
  play(B, 'moon_pallbearer_tom', { floor: 0 });
  eq(inHand(B, 'moon_dusk_mouser'), n0 + 1 - 0, 'mouser back in hand (drawn count plus 1)');
  ok(!inDiscard(B, 'moon_dusk_mouser'), 'out of discard');
});

section('moon_boomerang_bernard: Reborn and bank 1 when it loses a Life', () => {
  const B = G({ hand: ['moon_boomerang_bernard'], pests: one1 });
  play(B, 'moon_boomerang_bernard', { floor: 0 });
  kill(B, cat(B, 'moon_boomerang_bernard'));
  eq(B.state.bank, 1, 'bank 1');
  eq(inHand(B, 'moon_boomerang_bernard'), 1, 'Reborn into hand');
});

section('moon_siamese_seer: Marks whatever it attacks', () => {
  const B = G({ hand: ['moon_siamese_seer'], pests: one1 });
  play(B, 'moon_siamese_seer', { floor: 0 });
  const ev = rec(B);
  B.endTurn();
  ok(statusEv(ev, 'marked', 'pest').length >= 1, 'target was Marked');
});

section('moon_mrs_midnight: Witching Hour Zoomies, draw and Zoom happen twice', () => {
  const run = (card) => {
    const B = G({ hand: [card], pests: one1, clock: true });
    play(B, card, { floor: 0 });
    toRound(B, 3);
    const out = { zoomies: B.state.zoomies, hand: handN(B) };
    const ev = rec(B);
    B.endTurn();
    out.zooms = ev.filter(e => e.type === 'zoom').length;
    out.frazzled = cat(B, card).statuses.frazzled;
    return out;
  };
  const base = run('moon_candle_kitten'), echo = run('moon_mrs_midnight');
  eq(base.zoomies, 5, 'control Zoomies 5');
  eq(echo.zoomies, base.zoomies + 2, 'Zoomies +2 more');
  eq(echo.hand, base.hand + 1, 'one more card');
  eq(echo.zooms, base.zooms * 2, 'two free Zooms');
  eq(echo.frazzled, 1, 'Frazzled still once');
});

section('moon_pallid_empress: +1 Attack per Life spent or lost, Frenzy when Cornered', () => {
  const B = G({ hand: ['moon_pallid_empress', 'moon_borrowed_paws', 'moon_dusk_mouser'], pests: one1 });
  play(B, 'moon_pallid_empress', { floor: 0 });
  const e = cat(B, 'moon_pallid_empress');
  eq(e.size, 2, 'Large');
  const p0 = B.atk(e);
  play(B, 'moon_borrowed_paws', { floor: 1 });
  eq(B.atk(e), p0 + 1, 'one spend, +1');
  play(B, 'moon_dusk_mouser', { floor: 1 });
  kill(B, cat(B, 'moon_dusk_mouser'));
  eq(B.atk(e), p0 + 2, 'one loss, +1 more');
  setLives(B, e, 1);
  B.endTurn();
  eq(cat(B, 'moon_pallid_empress').statuses.frenzy, 1, 'Frenzy 1 when Cornered');
});

section('moon_probate_persian: bank 1, and banked Lives become Lives at battle end', () => {
  const B = G({ hand: ['moon_probate_persian', 'moon_pennyfeather'], pests: one1 });
  play(B, 'moon_probate_persian', { floor: 0 });
  eq(B.state.bank, 1, 'deploy banks 1');
  play(B, 'moon_pennyfeather', { floor: 0 });
  const pf = cat(B, 'moon_pennyfeather');
  setLives(B, pf, 1);
  B.state.bank = 4;
  pests(B, 0)[0].hp = 1;
  B.endTurn();
  eq(B.state.outcome, 'win', 'battle won');
  eq(inst(B, pf).lives, 2, 'most hurt cat gained a Life');
  eq(B.state.bank, 1, 'bank 4 -> 1');
});

section('moon_the_undertaker: spends 2 bank to keep a lost Life', () => {
  const B = G({ hand: ['moon_the_undertaker'], pests: one1 });
  play(B, 'moon_the_undertaker', { floor: 0 });
  const c = cat(B, 'moon_the_undertaker'), i = inst(B, c);
  B.state.bank = 2;
  kill(B, c);
  eq(i.lives, 4, 'Life kept');
  eq(B.state.bank, 0, 'bank spent');
  eq(inHand(B, 'moon_the_undertaker'), 1, 'Reborn into hand');
  play(B, 'moon_the_undertaker', { floor: 0 });
  kill(B, cat(B, 'moon_the_undertaker'));
  eq(i.lives, 3, 'with no bank the Life is lost');
  // on the very last Life the bank still saves him
  const B2 = G({ hand: ['moon_the_undertaker'], pests: one1 });
  B2.run.deck.find(x => x.id === 'moon_the_undertaker').lives = 1;
  play(B2, 'moon_the_undertaker', { floor: 0 });
  B2.state.bank = 3;
  kill(B2, cat(B2, 'moon_the_undertaker'));
  eq(B2.state.lost.length, 0, 'not lost for good');
  eq(B2.state.bank, 1, 'bank 3 -> 1');
});

// ============================================================================================
// MOON: spells
// ============================================================================================
section('moon_borrowed_time: spend a Life, draw 2, +1 Zoomies, exhaust', () => {
  const B = G({ hand: ['moon_pennyfeather', 'moon_borrowed_time'], pests: one1 });
  play(B, 'moon_pennyfeather', { floor: 0 });
  const c = cat(B, 'moon_pennyfeather');
  B.state.zoomies = 5;
  const h0 = handN(B);
  ok(play(B, 'moon_borrowed_time', { catUid: c.uid }).ok, 'play');
  eq(c.lives, 3, 'Life spent (4 -> 3)');
  eq(handN(B), h0 - 1 + 2, 'drew 2');
  eq(B.state.zoomies, 6, '+1 Zoomies (cost 0)');
  ok(inExhaust(B, 'moon_borrowed_time'), 'exhausted');
  // refuses on a last Life, and gives nothing
  const B2 = G({ hand: ['moon_pennyfeather', 'moon_borrowed_time'], pests: one1 });
  play(B2, 'moon_pennyfeather', { floor: 0 });
  const c2 = cat(B2, 'moon_pennyfeather'); setLives(B2, c2, 1);
  B2.state.zoomies = 5; const h2 = handN(B2);
  play(B2, 'moon_borrowed_time', { catUid: c2.uid });
  eq(c2.lives, 1, 'last Life stays');
  eq(handN(B2), h2 - 1, 'no draw');
  eq(B2.state.zoomies, 5, 'no Zoomies');
});

section('moon_land_on_feet: Reborn for the fight, draw 1', () => {
  const B = G({ hand: ['moon_dusk_mouser', 'moon_land_on_feet'], pests: one1 });
  play(B, 'moon_dusk_mouser', { floor: 0 });
  const c = cat(B, 'moon_dusk_mouser');
  const h0 = handN(B);
  play(B, 'moon_land_on_feet', { catUid: c.uid });
  eq(handN(B), h0 - 1 + 1, 'drew 1');
  kill(B, c);
  eq(inHand(B, 'moon_dusk_mouser'), 1, 'came back to hand');
  // and again after it is replayed (for the fight)
  play(B, 'moon_dusk_mouser', { floor: 0 });
  kill(B, cat(B, 'moon_dusk_mouser'));
  eq(inHand(B, 'moon_dusk_mouser'), 1, 'Reborn lasts the fight');
});

section('moon_mark_for_dusk: 3 damage, Marked twice', () => {
  const B = G({ hand: ['moon_mark_for_dusk'], pests: one1 });
  const p = pests(B, 0)[0], hp = p.hp;
  play(B, 'moon_mark_for_dusk', { pestUid: p.uid });
  eq(p.hp, hp - 3, '3 damage');
  eq(p.statuses.marked, 2, 'Marked 2');
});

section('moon_candlelit_hiss: Marked and Hiss on every pest of a floor', () => {
  const B = G({ hand: ['moon_candlelit_hiss'], pests: [{ id: 'x_dummy', floor: 1 }, { id: 'x_dummy', floor: 1 }, { id: 'x_big', floor: 2 }] });
  ok(play(B, 'moon_candlelit_hiss', { floor: 0 }).ok, 'play');
  ok(pests(B, 0).every(p => p.statuses.marked === 1 && p.statuses.hiss === 1), 'floor 1 pests Marked and Hissed');
  ok(!pests(B, 1)[0].statuses.marked, 'other floor untouched');
});

section('moon_tuna_dream: +1 Life, heal 4', () => {
  const B = G({ hand: ['moon_pennyfeather', 'moon_tuna_dream'], pests: one1 });
  play(B, 'moon_pennyfeather', { floor: 0 });
  const c = cat(B, 'moon_pennyfeather'); c.health = 1;
  play(B, 'moon_tuna_dream', { catUid: c.uid });
  eq(c.lives, 5, 'Life gained');
  eq(c.health, 5, 'healed up to max (5)');
  c.health = 1; c.maxHealth = 10; c.baseMax = 10;
  B.heal(c, 4);
  eq(c.health, 5, 'heal amount is 4 when room allows (engine heal)');
});

section('moon_pennies_from_heaven: bank 2, draw 1', () => {
  const B = G({ hand: ['moon_pennies_from_heaven'], pests: one1 });
  const h0 = handN(B);
  play(B, 'moon_pennies_from_heaven');
  eq(B.state.bank, 2, 'bank 2');
  eq(handN(B), h0, 'played one, drew one');
});

section('moon_chill_in_the_hall: 3 damage, 3 more if Marked', () => {
  const B = G({ hand: ['moon_chill_in_the_hall', 'moon_chill_in_the_hall'], pests: two1 });
  const [a, b] = pests(B, 0);
  const ha = a.hp, hb = b.hp;
  play(B, 'moon_chill_in_the_hall', { pestUid: a.uid });
  eq(a.hp, ha - 3, 'unmarked: 3');
  b.statuses.marked = 1;
  play(B, 'moon_chill_in_the_hall', { pestUid: b.uid });
  eq(b.hp, hb - 8, 'marked: two hits of floor(3 x 1.5) = 4');
});

section('moon_seance_saucer: spend 2 bank, a dead cat returns with +1 Life', () => {
  const B = G({ hand: ['moon_dusk_mouser', 'moon_seance_saucer', 'moon_seance_saucer'], pests: one1 });
  play(B, 'moon_dusk_mouser', { floor: 0 });
  const c = cat(B, 'moon_dusk_mouser'), i = inst(B, c);
  kill(B, c);
  eq(i.lives, 3, 'mouser down to 3');
  B.state.bank = 1;
  const h0 = inHand(B, 'moon_dusk_mouser');
  play(B, 'moon_seance_saucer');
  eq(inHand(B, 'moon_dusk_mouser'), h0, 'bank 1: nothing happens');
  eq(B.state.bank, 1, 'bank untouched');
  B.state.bank = 2;
  play(B, 'moon_seance_saucer');
  eq(inHand(B, 'moon_dusk_mouser'), h0 + 1, 'mouser in hand');
  eq(i.lives, 4, 'gained a Life');
  eq(B.state.bank, 0, 'bank spent');
  // no cat in the discard pile: the bank is not wasted
  const B2 = G({ hand: ['moon_seance_saucer'], pests: one1 });
  B2.state.bank = 5;
  B2.state.discard = B2.state.discard.filter(u => B2.state.cards[u].eff.type !== 'unit');
  play(B2, 'moon_seance_saucer');
  eq(B2.state.bank, 5, 'no target, no spend');
});

section('moon_cornering_rite: spend up to 2 Lives of a cat, draw per Life', () => {
  const B = G({ hand: ['moon_pennyfeather', 'moon_cornering_rite', 'moon_cornering_rite'], pests: one1 });
  lv(B, 'moon_pennyfeather', 3);
  play(B, 'moon_pennyfeather', { floor: 0 });
  const c = cat(B, 'moon_pennyfeather');
  const h0 = handN(B);
  play(B, 'moon_cornering_rite', { catUid: c.uid });
  eq(c.lives, 1, '3 -> 1');
  eq(handN(B), h0 - 1 + 2, 'drew 2');
  const h1 = handN(B);
  play(B, 'moon_cornering_rite', { catUid: c.uid });
  eq(c.lives, 1, 'cannot go below 1');
  eq(handN(B), h1 - 1, 'second rite draws nothing (not the fight total)');
});

section('moon_wind_the_clock: next round is a Witching Hour unless this one is', () => {
  const B = G({ hand: ['moon_wind_the_clock'], pests: one1, clock: true });
  play(B, 'moon_wind_the_clock');
  ok(inExhaust(B, 'moon_wind_the_clock'), 'exhausted');
  B.endTurn();
  eq(B.state.round, 2, 'round 2');
  ok(B.state.clock.isWitching, 'round 2 is a Witching Hour');
  eq(B.state.zoomies, 5, 'with its 5 Zoomies');
  // in a Witching Hour it does nothing
  const B2 = G({ hand: ['moon_wind_the_clock'], hands: [[], [], ['moon_wind_the_clock']], pests: one1, clock: true });
  toRound(B2, 3);
  ok(B2.state.clock.isWitching, 'round 3 Witching');
  B2.state.zoomies = 10;
  play(B2, 'moon_wind_the_clock');
  B2.endTurn();
  ok(!B2.state.clock.isWitching, 'round 4 is not a Witching Hour (never twice in a row)');
});

section('moon_haunting_rights: 1 damage per cat in the discard pile (max 8) to every pest on a floor', () => {
  const B = G({ hand: ['moon_haunting_rights', 'moon_haunting_rights'], pests: [{ id: 'x_dummy', floor: 1 }, { id: 'x_dummy', floor: 1 }, { id: 'x_big', floor: 2 }] });
  B.createCard('moon_pennyfeather', 3, 'discard');
  const [a, b] = pests(B, 0), far = pests(B, 1)[0];
  const ha = a.hp, hf = far.hp;
  play(B, 'moon_haunting_rights', { floor: 0 });
  eq(a.hp, ha - 3, 'first pest -3'); eq(b.hp, ha - 3, 'second pest -3'); eq(far.hp, hf, 'other floor untouched');
  B.createCard('moon_pennyfeather', 10, 'discard');
  const h2 = a.hp;
  play(B, 'moon_haunting_rights', { floor: 0 });
  eq(a.hp, h2 - 8, 'capped at 8');
});

section('moon_fade_out: Hidden and Fluff 6', () => {
  const B = G({ hand: ['moon_pennyfeather', 'moon_fade_out'], pests: one1 });
  play(B, 'moon_pennyfeather', { floor: 0 });
  const c = cat(B, 'moon_pennyfeather');
  play(B, 'moon_fade_out', { catUid: c.uid });
  ok(c.hidden, 'Hidden'); eq(c.fluff, 6, 'Fluff 6');
});

section('moon_thirteenth_chime: next round is a Witching Hour even straight after one, once a battle', () => {
  const B = G({ hand: ['moon_thirteenth_chime'], hands: [[], [], ['moon_thirteenth_chime', 'moon_thirteenth_chime']], deck: ['moon_thirteenth_chime', 'moon_thirteenth_chime'], pests: one1, clock: true });
  toRound(B, 3);
  ok(B.state.clock.isWitching, 'round 3 Witching');
  B.state.zoomies = 10;
  ok(play(B, 'moon_thirteenth_chime').ok, 'first chime');
  ok(play(B, 'moon_thirteenth_chime').ok, 'second chime is playable');
  B.endTurn();
  eq(B.state.round, 4, 'round 4');
  ok(B.state.clock.isWitching, 'round 4 is a Witching Hour too');
  B.endTurn();
  ok(!B.state.clock.isWitching, 'round 5 is not (the second chime did nothing)');
  ok(inExhaust(B, 'moon_thirteenth_chime'), 'exhausted');
});

section('moon_everything_must_go: every cat spends 1 Life, 4 damage and 1 bank per Life', () => {
  const B = G({ hand: ['moon_pennyfeather', 'moon_pennyfeather', 'moon_pennyfeather', 'moon_everything_must_go'], pests: one1 });
  lv(B, 'moon_pennyfeather', 3);
  play(B, 'moon_pennyfeather', { floor: 0 }); play(B, 'moon_pennyfeather', { floor: 0 }); play(B, 'moon_pennyfeather', { floor: 1 });
  const cs = allCats(B); setLives(B, cs[2], 1);
  const p = pests(B, 0)[0], hp = p.hp;
  play(B, 'moon_everything_must_go');
  eq(cs.map(c => c.lives).sort(), [1, 2, 2], 'two cats spent, the last-Life cat did not');
  eq(p.hp, hp - 8, '2 spent x 4 damage');
  eq(B.state.bank, 2, 'bank 2');
  ok(inExhaust(B, 'moon_everything_must_go'), 'exhausted');
});

// ============================================================================================
// MOON: toys
// ============================================================================================
section('moon_candle_stub: end of turn marks a random pest on its floor', () => {
  const B = G({ hand: ['moon_candle_stub'], pests: [{ id: 'x_dummy', floor: 1 }, { id: 'x_dummy', floor: 1 }, { id: 'x_big', floor: 2 }] });
  play(B, 'moon_candle_stub', { floor: 0 });
  const ev = rec(B);
  B.endTurn();
  const m = statusEv(ev, 'marked', 'pest');
  ok(m.length >= 1, 'a pest was Marked');
  ok(m.every(e => e.floor === 0), 'only on its floor');
});

section('moon_sock_shrine: a cat here spends or loses a Life, bank 1', () => {
  const B = G({ hand: ['moon_sock_shrine', 'moon_borrowed_paws', 'moon_borrowed_paws'], pests: one1 });
  play(B, 'moon_sock_shrine', { floor: 0 });
  play(B, 'moon_borrowed_paws', { floor: 0 });
  eq(B.state.bank, 1, 'cat here: exactly 1');
  play(B, 'moon_borrowed_paws', { floor: 1 });
  eq(B.state.bank, 1, 'cat on another floor: nothing');
  kill(B, cats(B, 0)[0]);
  eq(B.state.bank, 2, 'a loss counts too');
});

section('moon_ouija_rug: a cat here becomes Cornered, draw 1 and +1 Zoomies once a turn', () => {
  const B = G({ hand: ['moon_ouija_rug', 'moon_pennyfeather', 'moon_pennyfeather', 'moon_cornering_rite', 'moon_cornering_rite'], pests: one1 });
  lv(B, 'moon_pennyfeather', 3);
  play(B, 'moon_ouija_rug', { floor: 0 });
  play(B, 'moon_pennyfeather', { floor: 0 }); play(B, 'moon_pennyfeather', { floor: 0 });
  const [a, b] = cats(B, 0);
  B.state.zoomies = 5;
  const h0 = handN(B);
  play(B, 'moon_cornering_rite', { catUid: a.uid });
  // rite: -1 card played, +2 drawn (Lives spent), +1 draw from the rug; Zoomies 5 - 1 + 1
  eq(handN(B), h0 - 1 + 2 + 1, 'rite draws 2, rug draws 1');
  eq(B.state.zoomies, 5, 'Zoomies +1');
  const h1 = handN(B);
  play(B, 'moon_cornering_rite', { catUid: b.uid });
  eq(handN(B), h1 - 1 + 2, 'second Cornered cat this turn: rug does nothing');
  eq(B.state.zoomies, 4, 'no second Zoomies');
});

section('moon_stopped_clock: cats here are not Frazzled and gain +2 Attack at the Witching Hour', () => {
  const B = G({ hand: ['moon_stopped_clock', 'moon_candle_kitten', 'moon_candle_kitten'], pests: [{ id: 'x_dummy', floor: 1 }, { id: 'x_big', floor: 2 }], clock: true });
  play(B, 'moon_stopped_clock', { floor: 0 });
  play(B, 'moon_candle_kitten', { floor: 0 }); play(B, 'moon_candle_kitten', { floor: 1 });
  const here = cats(B, 0)[0], away = cats(B, 1)[0];
  toRound(B, 3);
  eq(B.atk(here), 5, '+2 Attack here (Power 3)');
  eq(B.atk(away), 3, 'no bonus elsewhere');
  toRound(B, 4);
  ok(!cats(B, 0)[0].statuses.frazzled, 'cat here: not Frazzled');
  eq(cats(B, 1)[0].statuses.frazzled, 1, 'cat elsewhere: Frazzled');
});

section('moon_haunted_mirror: a cat here Zooms, its target is Marked', () => {
  const B = G({ hand: ['moon_haunted_mirror', 'moon_candle_kitten', 'moon_candle_kitten'], pests: one1, clock: true });
  play(B, 'moon_haunted_mirror', { floor: 1 });
  play(B, 'moon_candle_kitten', { floor: 1 });
  toRound(B, 3);
  let ev = rec(B);
  B.endTurn();
  ok(ev.some(e => e.type === 'zoom'), 'the cat Zoomed');
  const mark = statusEv(ev, 'marked', 'pest');
  eq(mark.length >= 1, true, 'mirror on the cat floor Marks the Zoom target');
  const B2 = G({ hand: ['moon_haunted_mirror', 'moon_candle_kitten'], pests: one1, clock: true });
  play(B2, 'moon_haunted_mirror', { floor: 1 });
  play(B2, 'moon_candle_kitten', { floor: 0 });
  toRound(B2, 3);
  // Candle Kitten also marks on deploy, so only count marks made in the Zoom turn; the kitten's own mark was long ago
  ev = rec(B2);
  B2.endTurn();
  const z = ev.filter(e => e.type === 'zoom').length;
  ok(z >= 1, 'zoom happened');
  const fromZoom = statusEv(ev, 'marked', 'pest').length;
  eq(fromZoom, 0, 'a mirror on another floor does nothing');
});

section('moon_fishbowl_oracle: draw 1 per Cornered cat here at turn start (max 2)', () => {
  const run = (withOracle) => {
    const hand = ['moon_pennyfeather', 'moon_pennyfeather', 'moon_pennyfeather'].concat(withOracle ? ['moon_fishbowl_oracle'] : []);
    const B = G({ hand, pests: one1 });
    if (withOracle) play(B, 'moon_fishbowl_oracle', { floor: 0 });
    for (let i = 0; i < 3; i++) play(B, 'moon_pennyfeather', { floor: 0 });
    cats(B, 0).forEach(c => setLives(B, c, 1));
    B.endTurn();
    return handN(B);
  };
  eq(run(true) - run(false), 2, 'two extra cards (three Cornered cats, capped at 2)');
});

section('moon_cat_flap_beyond: cats here have Reborn and bank 1 when they lose a Life', () => {
  const B = G({ hand: ['moon_dusk_mouser', 'moon_dusk_mouser', 'moon_dusk_mouser', 'moon_cat_flap_beyond'], pests: one1 });
  play(B, 'moon_dusk_mouser', { floor: 0 });
  play(B, 'moon_cat_flap_beyond', { floor: 0 });
  play(B, 'moon_dusk_mouser', { floor: 0 });
  play(B, 'moon_dusk_mouser', { floor: 1 });
  const [early, late] = cats(B, 0), away = cats(B, 1)[0];
  const b0 = B.state.bank, hm = inHand(B, 'moon_dusk_mouser');
  kill(B, early);
  eq(inHand(B, 'moon_dusk_mouser'), hm + 1, 'a cat already here came back to hand (Reborn)');
  eq(B.state.bank, b0 + 1, 'bank +1');
  kill(B, late);
  eq(inHand(B, 'moon_dusk_mouser'), hm + 2, 'a cat deployed later has it too');
  kill(B, away);
  eq(inHand(B, 'moon_dusk_mouser'), hm + 2, 'a cat on another floor does not');
  ok(inDiscard(B, 'moon_dusk_mouser'), 'that one went to discard');
});

section('moon_moon_pool: Witching Hour, 2 damage and Mark per Banked Life (max 5), bank stays', () => {
  const run = bank => {
    const B = G({ hand: ['moon_moon_pool'], pests: one1, clock: true });
    play(B, 'moon_moon_pool', { floor: 0 });
    B.state.bank = bank;
    const p = pests(B, 0)[0], hp = p.hp;
    toRound(B, 3);
    return { lost: hp - p.hp, bank: B.state.bank, marked: p.statuses.marked || 0 };
  };
  const a = run(3), b = run(8);
  eq(a.lost, 6, 'bank 3: 3 x 2');
  eq(a.bank, 3, 'bank stays');
  ok(a.marked >= 1, 'pest Marked');
  eq(b.lost, 10, 'bank 8: capped at 5 x 2');
});

section('moon: no card hooks both onAnyLifeLost and onAnyLifeSpent (the engine fires both per event)', () => {
  SB.data.cardsMoon.forEach(c => {
    const fx = c.effects || {};
    ok(!(fx.onAnyLifeLost && fx.onAnyLifeSpent), c.id + ' double hooks Life events');
    const u = c.upgrade && c.upgrade.effects;
    ok(!(u && u.onAnyLifeLost && u.onAnyLifeSpent), c.id + ' upgrade double hooks Life events');
  });
});


// ============================================================================================
// MISCHIEF helpers
// ============================================================================================
const par2 = [{ id: 'x_dummy', floor: 2 }, { id: 'x_big', floor: 2 }];   // two pests in the Parlor
const hairballs = B => inHand(B, 'curse_hairball');
function surgeNow(B) { B.state.zoomies = 10; play(B, 'mischief_whole_jar'); }
// play a Box card on a floor
const boxOn = (B, f) => play(B, 'neutral_cardboard_box', { floor: f });

// ============================================================================================
// MISCHIEF: units
// ============================================================================================
section('mischief_shelf_gremlin: attacking Knocks its target 1 floor (after the hit)', () => {
  const B = G({ hand: ['mischief_shelf_gremlin'], pests: [{ id: 'x_dummy', floor: 2 }] });
  play(B, 'mischief_shelf_gremlin', { floor: 1 });
  const p = allPests(B)[0], hp = p.hp;
  const ev = rec(B);
  B.endTurn();
  eq(p.floor, 0, 'fell to the Cellar');
  const dm = ev.filter(e => e.type === 'damage' && e.uid === p.uid);
  eq([dm[0].dmgKind, dm[0].amount, dm[1].dmgKind, dm[1].amount], ['hit', 2, 'shatter', 2], 'the hit lands first, then the 2 Shatter for the fall');
  ok(ev.some(e => e.type === 'status' && e.status === 'dizzy' && e.kind === 'add'), 'landing Dizzy');
});

section('mischief_counter_kitten: free Fleeting cat, deploy Knocks the front pest', () => {
  const B = G({ hand: ['mischief_counter_kitten'], pests: par2 });
  const front = pests(B, 1)[0];
  const c = SB.content.card('mischief_counter_kitten');
  eq(c.cost, 0, 'costs 0');
  ok(c.keywords.fleeting, 'Fleeting');
  play(B, 'mischief_counter_kitten', { floor: 1 });
  eq(front.floor, 0, 'front pest Knocked down');
  eq(pests(B, 1).length, 1, 'the other stays');
});

section('mischief_box_inspector: places a free Box and sits in it', () => {
  const B = G({ hand: ['mischief_box_inspector', 'mischief_box_inspector'], pests: one1 });
  play(B, 'mischief_box_inspector', { floor: 0 });
  const c = cats(B, 0)[0];
  eq(B.state.floors[0].rooms.filter(r => r.rtype === 'box').length, 1, 'one Box');
  ok(c.boxed, 'sits in it');
  ok(c.hidden, 'Hidden');
  play(B, 'mischief_box_inspector', { floor: 0 });
  eq(B.state.floors[0].rooms.filter(r => r.rtype === 'box').length, 1, 'no second Box on a floor that has one');
});

section('mischief_peekaboo_kitten: draw 1, draw 1 more in a Box', () => {
  const B = G({ hand: ['mischief_peekaboo_kitten'], pests: one1 });
  const h0 = handN(B);
  play(B, 'mischief_peekaboo_kitten', { floor: 0 });
  eq(handN(B), h0 - 1 + 1, 'no Box: draw 1');
  const B2 = G({ hand: ['neutral_cardboard_box', 'mischief_peekaboo_kitten'], pests: one1 });
  boxOn(B2, 0);
  const h2 = handN(B2);
  play(B2, 'mischief_peekaboo_kitten', { floor: 0 });
  ok(cats(B2, 0)[0].boxed, 'in the Box');
  eq(handN(B2), h2 - 1 + 2, 'in a Box: draw 2');
});

section('mischief_skein_gremlin: Yarn 1 on the front pest', () => {
  const B = G({ hand: ['mischief_skein_gremlin'], pests: two1 });
  play(B, 'mischief_skein_gremlin', { floor: 0 });
  eq(pests(B, 0)[0].statuses.yarn, 1, 'front Yarned');
  ok(!pests(B, 0)[1].statuses.yarn, 'second not');
});

section('mischief_buzzed_burmese and nip_planter: +1 Nip at the start of your turn', () => {
  const B = G({ hand: ['mischief_buzzed_burmese', 'mischief_nip_planter'], pests: one1 });
  play(B, 'mischief_buzzed_burmese', { floor: 0 }); play(B, 'mischief_nip_planter', { floor: 0 });
  eq(B.state.nip.meter, 0, 'nothing on deploy');
  B.endTurn();
  eq(B.state.nip.meter, 2, 'two sources, +2');
});

section('mischief_sprig_courier: deploy +2 Nip', () => {
  const B = G({ hand: ['mischief_sprig_courier'], pests: one1 });
  play(B, 'mischief_sprig_courier', { floor: 0 });
  eq(B.state.nip.meter, 2, 'meter 2');
});

section('mischief_coughing_persian: deploy adds a Hairball to hand', () => {
  const B = G({ hand: ['mischief_coughing_persian'], pests: one1 });
  play(B, 'mischief_coughing_persian', { floor: 0 });
  eq(hairballs(B), 1, 'one Hairball');
});

section('mischief_sock_thief: +2 damage against a Yarned pest', () => {
  const run = yarn => {
    const B = G({ hand: ['mischief_sock_thief'], pests: [{ id: 'x_dummy', floor: 1 }] });
    play(B, 'mischief_sock_thief', { floor: 0 });
    const p = pests(B, 0)[0], hp = p.hp;
    if (yarn) p.statuses.yarn = 1;
    B.endTurn();
    return hp - p.hp;
  };
  eq(run(false), 2, 'plain hit 2');
  eq(run(true), 4, 'Yarned: 2 + 2');
});

section('mischief_table_surfer: Knocking a pest draws 1, once a turn', () => {
  const B = G({ hand: ['mischief_table_surfer', 'mischief_just_a_nudge', 'mischief_just_a_nudge'], pests: par2 });
  play(B, 'mischief_table_surfer', { floor: 0 });
  const [a, b] = pests(B, 1);
  const h0 = handN(B);
  play(B, 'mischief_just_a_nudge', { pestUid: a.uid });
  eq(handN(B), h0 - 1 + 1, 'first Knock draws 1');
  const h1 = handN(B);
  play(B, 'mischief_just_a_nudge', { pestUid: b.uid });
  eq(handN(B), h1 - 1, 'second Knock this turn draws nothing');
});

section('mischief_furniture_mover: Large, deploy Knocks every pest on the floor', () => {
  const B = G({ hand: ['mischief_furniture_mover'], pests: par2 });
  play(B, 'mischief_furniture_mover', { floor: 1 });
  eq(cat(B, 'mischief_furniture_mover').size, 2, 'Large');
  eq(pests(B, 1).length, 0, 'Parlor empty');
  eq(pests(B, 0).length, 2, 'both in the Cellar');
});

section('mischief_too_small_for_this: +3 Power in a Box, returns to hand after attacking from it', () => {
  const B = G({ hand: ['neutral_cardboard_box', 'mischief_too_small_for_this'], pests: [{ id: 'x_dummy', floor: 1 }] });
  boxOn(B, 0);
  play(B, 'mischief_too_small_for_this', { floor: 0 });
  const c = cat(B, 'mischief_too_small_for_this');
  ok(c.boxed, 'in the Box');
  eq(B.atk(c), 2 + 3 + 1, 'base 2, +3 card, +1 Box');
  const p = pests(B, 0)[0], hp = p.hp;
  B.endTurn();
  eq(hp - p.hp, 6, 'the hit still lands');
  eq(inHand(B, 'mischief_too_small_for_this'), 1, 'back in hand');
  ok(!cat(B, 'mischief_too_small_for_this'), 'off the board');
  // outside a Box: plain 2 Power, stays
  const B2 = G({ hand: ['mischief_too_small_for_this'], pests: [{ id: 'x_dummy', floor: 1 }] });
  play(B2, 'mischief_too_small_for_this', { floor: 0 });
  const c2 = cat(B2, 'mischief_too_small_for_this');
  eq(B2.atk(c2), 2, 'no bonus outside a Box');
  B2.endTurn();
  ok(cat(B2, 'mischief_too_small_for_this'), 'stays on the board');
});

section('mischief_spool_hoarder: +1 damage per Yarn on its target', () => {
  const B = G({ hand: ['mischief_spool_hoarder'], pests: [{ id: 'x_dummy', floor: 1 }] });
  play(B, 'mischief_spool_hoarder', { floor: 0 });
  const p = pests(B, 0)[0], hp = p.hp;
  p.statuses.yarn = 3;
  B.endTurn();
  eq(hp - p.hp, 2 + 3, 'hit 2 plus 3 for three Yarn');
});

section('mischief_wired_siamese: gains Frenzy 1 when Surge starts', () => {
  const B = G({ hand: ['mischief_wired_siamese', 'mischief_whole_jar'], pests: one1 });
  play(B, 'mischief_wired_siamese', { floor: 0 });
  ok(!cat(B, 'mischief_wired_siamese').statuses.frenzy, 'no Frenzy yet');
  surgeNow(B);
  eq(cat(B, 'mischief_wired_siamese').statuses.frenzy, 1, 'Frenzy 1');
});

section('mischief_crash_test_tom: Crash start gives 6 Fluff and heals 3', () => {
  const B = G({ hand: ['mischief_crash_test_tom', 'mischief_whole_jar'], pests: one1 });
  play(B, 'mischief_crash_test_tom', { floor: 0 });
  const c = cat(B, 'mischief_crash_test_tom');
  c.health = c.maxHealth - 4;
  surgeNow(B);
  toRound(B, 2);
  eq(c.fluff, 0, 'no Fluff during the Surge');
  const hp = c.health;
  toRound(B, 3);
  ok(B.state.nip.crash > 0, 'Crashing');
  eq(c.fluff, 6, 'Fluff 6');
  eq(c.health, hp + 3, 'healed 3');
});

section('mischief_hairball_appreciator: +1 Power per Hairball in hand', () => {
  const B = G({ hand: ['mischief_hairball_appreciator', 'mischief_cough_it_up'], pests: one1 });
  play(B, 'mischief_hairball_appreciator', { floor: 0 });
  const c = cat(B, 'mischief_hairball_appreciator');
  eq(B.atk(c), 1, 'base');
  play(B, 'mischief_cough_it_up');
  eq(hairballs(B), 2, 'two Hairballs');
  eq(B.atk(c), 3, '+2');
  play(B, 'curse_hairball', { pestUid: pests(B, 0)[0].uid });
  eq(B.atk(c), 2, 'playing one lowers it');
});

section('mischief_gag_reflex: 2 Shatter per Hairball created', () => {
  const B = G({ hand: ['mischief_gag_reflex', 'mischief_cough_it_up'], pests: one1 });
  play(B, 'mischief_gag_reflex', { floor: 0 });
  const p = pests(B, 0)[0], hp = p.hp;
  play(B, 'mischief_cough_it_up');
  eq(hp - p.hp, 4, 'two Hairballs, 2 Shatter each');
});

section('mischief_pop_up_pounce: leaves its Box when it attacks, 8 damage to the front pest', () => {
  const B = G({ hand: ['neutral_cardboard_box', 'mischief_pop_up_pounce'], pests: [{ id: 'x_dummy', floor: 1 }] });
  boxOn(B, 0);
  play(B, 'mischief_pop_up_pounce', { floor: 0 });
  const c = cat(B, 'mischief_pop_up_pounce');
  ok(c.boxed, 'boxed');
  const p = pests(B, 0)[0], hp = p.hp;
  B.endTurn();
  ok(!c.boxed, 'left the Box');
  eq(hp - p.hp, 8 + 3, '8 once, plus its normal 3');
  // flattened Box: the cat pops out and hits for 8 as well
  const B2 = G({ hand: ['neutral_cardboard_box', 'mischief_pop_up_pounce'], pests: [{ id: 'x_dummy', floor: 1 }] });
  boxOn(B2, 0);
  play(B2, 'mischief_pop_up_pounce', { floor: 0 });
  const p2 = pests(B2, 0)[0], hp2 = p2.hp;
  B2.flattenBox(B2.state.floors[0].rooms.find(r => r.rtype === 'box'), 'test');
  B2.drain();
  eq(hp2 - p2.hp, 8, 'flattened Box pops it out for 8');
});

section('mischief_gravity_tabby: pests Knocked onto its floor take 3 more Shatter, it gains +1 Power', () => {
  const B = G({ hand: ['mischief_gravity_tabby', 'mischief_just_a_nudge', 'mischief_just_a_nudge'], pests: par2 });
  play(B, 'mischief_gravity_tabby', { floor: 0 });
  const c = cat(B, 'mischief_gravity_tabby'), p0 = B.atk(c);
  const [a, b] = pests(B, 1);
  const ha = a.hp;
  play(B, 'mischief_just_a_nudge', { pestUid: a.uid });
  eq(a.floor, 0, 'landed in the Cellar');
  eq(ha - a.hp, 2 + 3, 'fall 2 plus 3');
  eq(B.atk(c), p0 + 1, '+1 Power');
  // a Knock that lands on another floor does nothing for it
  const B2 = G({ hand: ['mischief_gravity_tabby', 'mischief_just_a_nudge'], pests: [{ id: 'x_dummy', floor: 3 }, { id: 'x_big', floor: 3 }] });
  play(B2, 'mischief_gravity_tabby', { floor: 0 });
  const t = cat(B2, 'mischief_gravity_tabby'), pp = B2.atk(t);
  const q = pests(B2, 2)[0], hq = q.hp;
  play(B2, 'mischief_just_a_nudge', { pestUid: q.uid });
  eq(q.floor, 1, 'landed in the Parlor');
  eq(hq - q.hp, 2, 'plain fall damage');
  eq(B2.atk(t), pp, 'no Power gain');
});

section('mischief_comedown_colossus: deploy +2 Nip, Rested 3 on top of the Crash nap', () => {
  const B = G({ hand: ['mischief_comedown_colossus', 'mischief_whole_jar'], pests: one1 });
  play(B, 'mischief_comedown_colossus', { floor: 0 });
  eq(cat(B, 'mischief_comedown_colossus').size, 2, 'Large');
  eq(B.state.nip.meter, 2, 'Nip 2');
  surgeNow(B);
  toRound(B, 3);
  const c = cat(B, 'mischief_comedown_colossus');
  ok(c.napping, 'forced to nap by the Crash');
  eq(c.statuses.rested, 4, 'Rested 1 + 3');
});

// ============================================================================================
// MISCHIEF: spells
// ============================================================================================
section('mischief_paw_on_the_vase: Knock 1, then 2 Shatter', () => {
  const B = G({ hand: ['mischief_paw_on_the_vase'], pests: [{ id: 'x_dummy', floor: 2 }] });
  const p = allPests(B)[0], hp = p.hp;
  play(B, 'mischief_paw_on_the_vase', { pestUid: p.uid });
  eq(p.floor, 0, 'Knocked');
  eq(hp - p.hp, 2 + 2, 'fall 2 plus 2');
});

section('mischief_just_a_nudge: free Knock 1, exhausts', () => {
  const B = G({ hand: ['mischief_just_a_nudge'], pests: [{ id: 'x_dummy', floor: 3 }] });
  const p = allPests(B)[0];
  const z = B.state.zoomies;
  play(B, 'mischief_just_a_nudge', { pestUid: p.uid });
  eq(p.floor, 1, 'Attic to Parlor');
  eq(B.state.zoomies, z, 'free');
  ok(inExhaust(B, 'mischief_just_a_nudge'), 'exhausted');
});

section('mischief_tip_the_glass: Knock 1, 3 Shatter to every pest on the landing floor', () => {
  const B = G({ hand: ['mischief_tip_the_glass'], pests: [{ id: 'x_dummy', floor: 2 }, { id: 'x_big', floor: 2 }, { id: 'x_big', floor: 1 }] });
  const target = pests(B, 1)[0], same = pests(B, 1)[1], below = pests(B, 0)[0];
  const ht = target.hp, hs = same.hp, hb = below.hp;
  play(B, 'mischief_tip_the_glass', { pestUid: target.uid });
  eq(target.floor, 0, 'target landed');
  eq(ht - target.hp, 2 + 3, 'target: fall 2 + 3');
  eq(hb - below.hp, 2 + 3, 'pest already below: landing collision 2 + 3');
  eq(hs - same.hp, 0, 'pest left behind is untouched');
});

section('mischief_domino_shelf: Knock 1 every pest on a floor', () => {
  const B = G({ hand: ['mischief_domino_shelf'], pests: par2.concat([{ id: 'x_big', floor: 3 }]) });
  play(B, 'mischief_domino_shelf', { floor: 1 });
  eq(pests(B, 1).length, 0, 'Parlor empty');
  eq(pests(B, 0).length, 2, 'both fell');
  eq(pests(B, 2).length, 1, 'Attic untouched');
});

section('mischief_loose_thread: Yarn 2', () => {
  const B = G({ hand: ['mischief_loose_thread'], pests: one1 });
  play(B, 'mischief_loose_thread', { pestUid: pests(B, 0)[0].uid });
  eq(pests(B, 0)[0].statuses.yarn, 2, 'Yarn 2');
});

section("mischief_cats_cradle: draw 1, spells aimed at a Yarned pest cost 1 less this turn", () => {
  const B = G({ hand: ['mischief_cats_cradle', 'moon_mark_for_dusk', 'moon_mark_for_dusk', 'moon_mark_for_dusk'], pests: two1 });
  const [y, n] = pests(B, 0);
  y.statuses.yarn = 1;
  const h0 = handN(B);
  B.state.zoomies = 4;
  play(B, 'mischief_cats_cradle');
  eq(handN(B), h0 - 1 + 1, 'drew 1');
  eq(B.state.zoomies, 3, 'cost 1');
  play(B, 'moon_mark_for_dusk', { pestUid: y.uid });
  eq(B.state.zoomies, 3, 'Yarned target: free');
  play(B, 'moon_mark_for_dusk', { pestUid: n.uid });
  eq(B.state.zoomies, 2, 'plain target: full price');
  B.endTurn();
  B.state.zoomies = 4;
  y.statuses.yarn = 1;
  const before = B.state.zoomies;
  if (hid(B, 'moon_mark_for_dusk')) { play(B, 'moon_mark_for_dusk', { pestUid: y.uid }); eq(B.state.zoomies, before - 1, 'discount ended with the turn'); }
});

section('mischief_unravel: damage equal to all Yarn on the board, then Yarn 1 on every pest', () => {
  const B = G({ hand: ['mischief_unravel'], pests: [{ id: 'x_dummy', floor: 1 }, { id: 'x_big', floor: 1 }, { id: 'x_big', floor: 2 }] });
  const [a, b] = pests(B, 0), c = pests(B, 1)[0];
  a.statuses.yarn = 2; b.statuses.yarn = 3;
  const hc = c.hp;
  play(B, 'mischief_unravel', { pestUid: c.uid });
  eq(hc - c.hp, 5, '2 + 3 Yarn = 5 damage');
  eq([a.statuses.yarn, b.statuses.yarn, c.statuses.yarn], [3, 4, 1], 'Yarn 1 more on every pest');
});

section('mischief_a_sniff / mischief_fresh_sprig: Nip gain', () => {
  const B = G({ hand: ['mischief_a_sniff', 'mischief_fresh_sprig'], pests: one1 });
  const h0 = handN(B);
  play(B, 'mischief_a_sniff');
  eq(B.state.nip.meter, 3, '+3');
  ok(inExhaust(B, 'mischief_a_sniff'), 'exhausts');
  play(B, 'mischief_fresh_sprig');
  eq(B.state.nip.meter, 7, '+4');
  eq(handN(B), h0 - 2 + 1, 'drew 1');
});

section('mischief_whole_jar: Surge now (+2 Zoomies now and next turn, +2 Attack), then Crash', () => {
  const B = G({ hand: ['mischief_whole_jar', 'mischief_skein_gremlin'], pests: one1 });
  play(B, 'mischief_skein_gremlin', { floor: 0 });
  const c = cat(B, 'mischief_skein_gremlin');
  const a0 = B.atk(c);
  B.state.zoomies = 5;
  play(B, 'mischief_whole_jar');
  eq(B.state.zoomies, 5 - 2 + 2, 'cost 2, Surge gives 2');
  eq(B.state.nip.surge > 0, true, 'Surging');
  eq(B.atk(c), a0 + 2, '+2 Attack');
  ok(inExhaust(B, 'mischief_whole_jar'), 'exhausted');
  B.endTurn();
  eq(B.state.zoomies, 3 + 2, 'next turn +2 Zoomies');
  B.state.hand.length; // second Surge turn
  B.endTurn();
  eq(B.state.round, 3, 'round 3');
  ok(B.state.nip.crash > 0, 'Crash');
  eq(B.state.zoomies, 3 - 1, 'Crash: -1 Zoomies');
  ok(cat(B, 'mischief_skein_gremlin').napping, 'forced to nap');
  eq(cat(B, 'mischief_skein_gremlin').statuses.rested >= 1, true, 'and Rested');
  // Nip is lost while Surging or Crashing
  play(B, 'mischief_a_sniff');
  eq(B.state.nip.meter, 0, 'Nip during Crash is lost');
});

section('mischief_detox_tea: draw 1; while Crashing end it and every cat takes 2', () => {
  const B = G({ hand: ['mischief_detox_tea', 'mischief_detox_tea', 'mischief_skein_gremlin'], pests: one1 });
  play(B, 'mischief_skein_gremlin', { floor: 0 });
  const c = cat(B, 'mischief_skein_gremlin'), hp = c.health;
  const h0 = handN(B);
  play(B, 'mischief_detox_tea');
  eq(handN(B), h0 - 1 + 1, 'draw 1');
  eq(c.health, hp, 'not Crashing: no damage');
  B.state.nip.crash = 1;
  play(B, 'mischief_detox_tea');
  eq(B.state.nip.crash, 0, 'Crash ended');
  eq(c.health, hp - 2, 'every cat took 2');
});

section('mischief_soft_landing: 4 Fluff to every cat, draw 2 if Crashing', () => {
  const B = G({ hand: ['mischief_soft_landing', 'mischief_soft_landing', 'mischief_skein_gremlin', 'mischief_skein_gremlin'], pests: one1 });
  play(B, 'mischief_skein_gremlin', { floor: 0 }); play(B, 'mischief_skein_gremlin', { floor: 1 });
  const h0 = handN(B);
  play(B, 'mischief_soft_landing');
  ok(allCats(B).every(c => c.fluff === 4), 'Fluff 4 each');
  eq(handN(B), h0 - 1, 'no draw');
  B.state.nip.crash = 1;
  play(B, 'mischief_soft_landing');
  ok(allCats(B).every(c => c.fluff === 8), 'Fluff 8');
  eq(handN(B), h0 - 2 + 2, 'drew 2 while Crashing');
});

section('mischief_cough_it_up: 2 Hairballs, exhaust, and the hand holds at most 6', () => {
  const B = G({ hand: ['mischief_cough_it_up', 'mischief_cough_it_up'], pests: one1 });
  play(B, 'mischief_cough_it_up');
  eq(hairballs(B), 2, 'two Hairballs');
  ok(inExhaust(B, 'mischief_cough_it_up'), 'exhausted');
  B.createCard('curse_hairball', 3, 'hand');
  eq(hairballs(B), 5, 'five');
  play(B, 'mischief_cough_it_up');
  eq(hairballs(B), 6, 'a 6 Hairball cap in hand');
  ok(B.state.discard.some(u => B.state.cards[u].id === 'curse_hairball'), 'the 7th went to the discard pile');
});

section('mischief_spit_take: 3 damage per Hairball in hand, exhausting them', () => {
  const B = G({ hand: ['mischief_spit_take', 'mischief_cough_it_up'], pests: one1 });
  play(B, 'mischief_cough_it_up');
  B.createCard('curse_hairball', 1, 'hand');
  const p = pests(B, 0)[0], hp = p.hp;
  play(B, 'mischief_spit_take');
  eq(hp - p.hp, 9, '3 Hairballs, 9 damage');
  eq(hairballs(B), 0, 'none left in hand');
  eq(B.state.exhaust.filter(u => B.state.cards[u].id === 'curse_hairball').length, 3, 'all exhausted');
});

// ============================================================================================
// MISCHIEF: toys
// ============================================================================================
section('mischief_wobbly_vase: Fragile, a cat knocks it off for 3 Shatter and Knock 1 below', () => {
  const B = G({ hand: ['mischief_wobbly_vase', 'mischief_skein_gremlin'], pests: [{ id: 'x_dummy', floor: 2 }, { id: 'x_big', floor: 1 }] });
  play(B, 'mischief_skein_gremlin', { floor: 2 });
  ok(play(B, 'mischief_wobbly_vase', { floor: 2 }).ok, 'placed in the Attic');
  const room = B.state.floors[2].rooms.find(r => r.id === 'mischief_wobbly_vase');
  ok(room, 'on the floor');
  ok(typeof B.knockOffToy === 'function', 'there is a way to knock a Fragile toy off');
  const p = pests(B, 1)[0], hp = p.hp;
  const r = B.knockOffToy(room.uid, cat(B, 'mischief_skein_gremlin').uid);
  ok(r && r.ok, 'knock off allowed: ' + (r && r.reason));
  eq(hp - p.hp, 3 + 2, '3 Shatter plus the fall');
  eq(p.floor, 0, 'Knocked to the Cellar');
  ok(!B.state.floors[2].rooms.some(r => r.id === 'mischief_wobbly_vase'), 'the Vase is gone');
  // once per turn, and only with a cat on its floor
  const B2 = G({ hand: ['mischief_wobbly_vase'], pests: [{ id: 'x_dummy', floor: 2 }] });
  play(B2, 'mischief_wobbly_vase', { floor: 2 });
  const rm = B2.state.floors[2].rooms[0];
  ok(!B2.knockOffToy(rm.uid, null).ok, 'no cat, no knock');
});

section('mischief_tape_square: holds a Large cat, +1 Power, not Hidden', () => {
  const B = G({ hand: ['mischief_tape_square', 'mischief_furniture_mover', 'mischief_skein_gremlin'], pests: one1 });
  play(B, 'mischief_tape_square', { floor: 0 });
  const tape = B.state.floors[0].rooms.find(r => r.rtype === 'box');
  ok(tape && tape.tape, 'a Tape Square');
  play(B, 'mischief_furniture_mover', { floor: 0 });
  const big = cat(B, 'mischief_furniture_mover');
  ok(big.boxed, 'the Large cat sits in it');
  ok(!big.hidden, 'not Hidden');
  eq(B.atk(big), 4 + 1, 'Power 4 +1');
  ok(inExhaust(B, 'mischief_tape_square'), 'exhausts');
  // a plain Cardboard Box still refuses a Large cat
  const B2 = G({ hand: ['neutral_cardboard_box', 'mischief_furniture_mover'], pests: one1 });
  boxOn(B2, 0);
  play(B2, 'mischief_furniture_mover', { floor: 0 });
  ok(!cat(B2, 'mischief_furniture_mover').boxed, 'Cardboard Box does not fit a Large cat');
});

section('mischief_laundry_basket: holds 2 cats, +1 Power each, durability 4', () => {
  const B = G({ hand: ['mischief_laundry_basket', 'mischief_skein_gremlin', 'mischief_skein_gremlin', 'mischief_skein_gremlin'], pests: one1 });
  play(B, 'mischief_laundry_basket', { floor: 0 });
  const bk = B.state.floors[0].rooms.find(r => r.rtype === 'box');
  eq(bk.fits, 2, 'fits 2'); eq(bk.durability, 4, 'durability 4');
  play(B, 'mischief_skein_gremlin', { floor: 0 }); play(B, 'mischief_skein_gremlin', { floor: 0 }); play(B, 'mischief_skein_gremlin', { floor: 0 });
  const cs = cats(B, 0);
  eq(cs.filter(c => c.boxed).length, 2, 'two sit in the basket');
  ok(cs.filter(c => c.boxed).every(c => B.atk(c) === 2), 'Power 1 +1 each');
  eq(B.atk(cs.find(c => !c.boxed)), 1, 'the third cat gets nothing');
});

section('mischief_yarn_basket: Yarn the front pest each turn, Knocked pests landing here get Yarn 1', () => {
  const B = G({ hand: ['mischief_yarn_basket', 'mischief_just_a_nudge'], pests: [{ id: 'x_dummy', floor: 1 }, { id: 'x_big', floor: 2 }] });
  play(B, 'mischief_yarn_basket', { floor: 0 });
  const k = pests(B, 1)[0];
  play(B, 'mischief_just_a_nudge', { pestUid: k.uid });
  eq(k.floor, 0, 'landed on the Basket floor');
  ok(k.statuses.yarn >= 1, 'Knocked pest is Yarned');
  B.endTurn();
  ok(pests(B, 0)[0].statuses.yarn >= 1, 'front pest here Yarned at the start of the turn');
});

section('mischief_tall_shelf: a Knock adds a Wobbly Vase to hand, once a turn', () => {
  const B = G({ hand: ['mischief_tall_shelf', 'mischief_just_a_nudge', 'mischief_just_a_nudge'], pests: par2 });
  play(B, 'mischief_tall_shelf', { floor: 0 });
  const [a, b] = pests(B, 1);
  play(B, 'mischief_just_a_nudge', { pestUid: a.uid });
  eq(inHand(B, 'mischief_wobbly_vase'), 1, 'a Vase');
  play(B, 'mischief_just_a_nudge', { pestUid: b.uid });
  eq(inHand(B, 'mischief_wobbly_vase'), 1, 'still one this turn');
  B.endTurn();
});

section('mischief_cardboard_annex: start of turn, a free Box on each floor that has none', () => {
  const B = G({ hand: ['mischief_cardboard_annex', 'neutral_cardboard_box'], pests: one1 });
  play(B, 'mischief_cardboard_annex', { floor: 0 });
  boxOn(B, 0);
  const boxes = f => B.state.floors[f].rooms.filter(r => r.rtype === 'box').length;
  eq([boxes(0), boxes(1), boxes(2)], [1, 0, 0], 'only the Box that was played');
  B.endTurn();
  eq([boxes(0), boxes(1), boxes(2)], [1, 1, 1], 'a Box on every floor, none doubled');
});

section('mischief_fur_factory: a Hairball each turn, 1 Shatter per Hairball in hand at end of turn', () => {
  const B = G({ hand: ['mischief_fur_factory', 'mischief_skein_gremlin'], pests: one1 });
  play(B, 'mischief_fur_factory', { floor: 0 }); play(B, 'mischief_skein_gremlin', { floor: 0 });
  B.endTurn();
  eq(hairballs(B), 1, 'one Hairball at the start of round 2');
  const p = pests(B, 0)[0];
  B.createCard('curse_hairball', 2, 'hand');
  const ev = rec(B);
  B.endTurn();
  eq(ev.filter(e => e.type === 'damage' && e.dmgKind === 'shatter' && e.side === 'pest').reduce((a, e) => a + e.amount, 0), 3, '3 Hairballs in hand, 3 Shatter');
});


// ============================================================================================
// Upgraded ("+") forms of the cards whose numbers or effects were touched
// ============================================================================================
section('upgraded forms: the numbers on the plus side', () => {
  // Ninth Sibling+: three times a turn
  let B = G({ hand: ['moon_ninth_sibling', 'moon_borrowed_paws', 'moon_borrowed_paws', 'moon_borrowed_paws', 'moon_borrowed_paws'], pests: one1, plus: true });
  play(B, 'moon_ninth_sibling', { floor: 0 });
  for (let i = 0; i < 4; i++) play(B, 'moon_borrowed_paws', { floor: i % 2 });
  eq(B.state.bank, 3, 'Ninth Sibling+ banks 3 a turn');
  // Probate Persian+: bank 2 on deploy, a Life per 2 bank
  B = G({ hand: ['moon_probate_persian', 'moon_pennyfeather'], pests: one1, plus: true });
  play(B, 'moon_probate_persian', { floor: 0 });
  eq(B.state.bank, 2, 'Persian+ banks 2');
  play(B, 'moon_pennyfeather', { floor: 0 });
  const pf = cat(B, 'moon_pennyfeather'); setLives(B, pf, 1);
  B.state.bank = 5; pests(B, 0)[0].hp = 1;
  B.endTurn();
  eq(inst(B, pf).lives, 3, 'two Lives from 5 bank (per 2)');
  // Seance Saucer+: the returned cat costs 1 less
  B = G({ hand: ['moon_dusk_mouser', 'moon_seance_saucer'], pests: one1, plus: true });
  play(B, 'moon_dusk_mouser', { floor: 0 }); kill(B, cat(B, 'moon_dusk_mouser'));
  B.state.bank = 2; play(B, 'moon_seance_saucer');
  const mu = B.state.hand.find(h => B.state.cards[h.uid].id === 'moon_dusk_mouser').uid;
  eq(B.cardCost(mu), 0, 'Dusk Mouser (1) costs 0 after Seance+');
  // Stopped Clock+: +3
  B = G({ hand: ['moon_stopped_clock', 'moon_candle_kitten'], pests: one1, clock: true, plus: true });
  play(B, 'moon_stopped_clock', { floor: 0 }); play(B, 'moon_candle_kitten', { floor: 0 });
  toRound(B, 3);
  eq(B.atk(cats(B, 0)[0]), 3 + 3, 'Stopped Clock+ gives +3');
  // Lantern Tom+, Graveyard Loafer+, Candle Kitten+
  B = G({ hand: ['moon_lantern_tom'], pests: one1, clock: true, plus: true });
  play(B, 'moon_lantern_tom', { floor: 0 }); toRound(B, 3);
  eq(B.atk(cat(B, 'moon_lantern_tom')), 3 + 3, 'Lantern Tom+ gains 3');
  B = G({ hand: ['moon_candle_kitten'], pests: one1, plus: true });
  play(B, 'moon_candle_kitten', { floor: 0 });
  eq(pests(B, 0)[0].statuses.marked, 2, 'Candle Kitten+ marks twice');
  // Sock Thief+ and Spool Hoarder+
  B = G({ hand: ['mischief_sock_thief'], pests: [{ id: 'x_dummy', floor: 1 }], plus: true });
  play(B, 'mischief_sock_thief', { floor: 0 });
  let p = pests(B, 0)[0], hp = p.hp; p.statuses.yarn = 1; B.endTurn();
  eq(hp - p.hp, 2 + 4, 'Sock Thief+ deals 4 extra');
  B = G({ hand: ['mischief_spool_hoarder'], pests: [{ id: 'x_dummy', floor: 1 }], plus: true });
  play(B, 'mischief_spool_hoarder', { floor: 0 });
  p = pests(B, 0)[0]; hp = p.hp; p.statuses.yarn = 3; B.endTurn();
  eq(hp - p.hp, 2 + 6, 'Spool Hoarder+ deals 2 per Yarn');
  // Gravity Tabby+: 5 Shatter
  B = G({ hand: ['mischief_gravity_tabby', 'mischief_just_a_nudge'], pests: par2, plus: true });
  play(B, 'mischief_gravity_tabby', { floor: 0 });
  p = pests(B, 1)[0]; hp = p.hp;
  play(B, 'mischief_just_a_nudge', { pestUid: p.uid });
  eq(hp - p.hp, 2 + 5, 'Gravity Tabby+ 5 Shatter');
  // Pop-Up Pounce+: 12
  B = G({ hand: ['neutral_cardboard_box', 'mischief_pop_up_pounce'], pests: [{ id: 'x_dummy', floor: 1 }], plus: true });
  boxOn(B, 0); play(B, 'mischief_pop_up_pounce', { floor: 0 });
  p = pests(B, 0)[0]; hp = p.hp; B.endTurn();
  eq(hp - p.hp, 12 + 3, 'Pop-Up Pounce+ hits for 12 once');
  // Too Small For This+: +5 in a Box
  B = G({ hand: ['neutral_cardboard_box', 'mischief_too_small_for_this'], pests: one1, plus: true });
  boxOn(B, 0); play(B, 'mischief_too_small_for_this', { floor: 0 });
  eq(B.atk(cat(B, 'mischief_too_small_for_this')), 2 + 5 + 1, 'Too Small+ gets +5');
  // Detox Tea+: draw 2, 1 damage
  B = G({ hand: ['mischief_detox_tea', 'mischief_skein_gremlin'], pests: one1, plus: true });
  play(B, 'mischief_skein_gremlin', { floor: 0 });
  const g = cat(B, 'mischief_skein_gremlin'), gh = g.health;
  B.state.nip.crash = 1; const h0 = handN(B);
  play(B, 'mischief_detox_tea');
  eq(handN(B), h0 - 1 + 2, 'draws 2'); eq(g.health, gh - 1, 'cats take 1'); eq(B.state.nip.crash, 0, 'Crash ended');
  // Cat's Cradle+: draw 2
  B = G({ hand: ['mischief_cats_cradle'], pests: one1, plus: true });
  const h1 = handN(B); play(B, 'mischief_cats_cradle');
  eq(handN(B), h1 - 1 + 2, "Cat's Cradle+ draws 2");
});

const DASH = new RegExp('[' + String.fromCharCode(0x2013) + String.fromCharCode(0x2014) + ']');
section('data hygiene: no em or en dashes, ids unique, every card has text and flavor', () => {
  const all = SB.data.cardsMoon.concat(SB.data.cardsMischief);
  const ids = {};
  all.forEach(c => {
    ok(!ids[c.id], 'duplicate id ' + c.id); ids[c.id] = 1;
    ok(c.text && c.flavor, c.id + ' text and flavor');
    ok(!DASH.test(JSON.stringify(c)), c.id + ' has an em or en dash');
  });
  eq(SB.data.cardsMoon.length, 42, '42 moon cards'); eq(SB.data.cardsMischief.length, 42, '42 mischief cards');
  ['src/engine/ops-moon.js', 'src/engine/ops-mischief.js', 'src/data/cards-moon.js', 'src/data/cards-mischief.js', 'tests/cards-moon-mischief-test.js'].forEach(f => {
    ok(!DASH.test(fs.readFileSync(path.join(root, f), 'utf8')), f + ' has an em or en dash');
  });
  const v = SB.content.validate();
  eq(v.errors.length, 0, 'content validates: ' + v.errors.slice(0, 3).join('; '));
  eq(v.warnings.filter(w => /moon_|mischief_/.test(w)).length, 0, 'no warnings for these cards');
});


// ============================================================================================
// LOOPS: each loop of B03 and B04 assembled and run through a scripted combat
// ============================================================================================
const livesTotal = B => B.run.deck.reduce((a, i) => a + i.lives, 0);
const refill = B => { B.state.zoomies = 10; };
// play with full Zoomies and assert that it worked
const go = (B, id, target) => { refill(B); const r = play(B, id, target); ok(r.ok, 'play ' + id + ': ' + r.reason); return r; };
const catCardsInHand = B => B.state.hand.filter(h => B.state.cards[h.uid].eff.type === 'unit').length;
const catCardsInDiscard = B => B.state.discard.filter(u => B.state.cards[u].eff.type === 'unit').length;
const dmgTo = (ev, uid, kind) => ev.filter(e => e.type === 'damage' && e.uid === uid && (!kind || e.dmgKind === kind)).reduce((a, e) => a + e.amount, 0);
const dmgFrom = (ev, from) => ev.filter(e => e.type === 'damage' && e.from === from).reduce((a, e) => a + e.amount, 0);

section('LOOP moon 1, Lives Banking: Stray Medium, Pennies, Sock Shrine, Seance, Undertaker, Probate, Moon Pool', () => {
  const h1 = ['moon_sock_shrine', 'moon_stray_medium', 'moon_pennies_from_heaven', 'moon_probate_persian', 'moon_the_undertaker'];
  const h2 = ['moon_moon_pool', 'moon_dusk_mouser', 'moon_seance_saucer', 'moon_pennies_from_heaven'];
  const B = G({ hand: h1, hands: [h1, h2, []], deck: h2, pests: one1, clock: true });
  // round 1: build the bank
  go(B, 'moon_sock_shrine', { floor: 0 });
  go(B, 'moon_stray_medium', { floor: 0 });
  go(B, 'moon_pennies_from_heaven');
  go(B, 'moon_probate_persian', { floor: 1 });
  eq(B.state.bank, 1 + 2 + 1, 'Stray 1 + Pennies 2 + Persian 1');
  go(B, 'moon_the_undertaker', { floor: 0 });
  const ut = cat(B, 'moon_the_undertaker'), uti = inst(B, ut);
  kill(B, ut);
  eq(uti.lives, 4, 'Undertaker refuses to lose a Life');
  eq(B.state.bank, 2, 'at the price of 2 bank');
  eq(inHand(B, 'moon_the_undertaker'), 1, 'and walks back to hand');
  B.endTurn();
  // round 2: Moon Pool, a cat dies on the Shrine floor, Seance brings a cat back
  go(B, 'moon_moon_pool', { floor: 1 });
  go(B, 'moon_dusk_mouser', { floor: 0 });
  const mouser = cat(B, 'moon_dusk_mouser');
  kill(B, mouser);
  eq(B.state.bank, 3, 'Sock Shrine banked the loss');
  const lives0 = livesTotal(B), cats0 = catCardsInHand(B);
  go(B, 'moon_seance_saucer');
  eq(B.state.bank, 1, 'Seance spent 2');
  eq(livesTotal(B), lives0 + 1, 'the returned cat gained a Life');
  eq(catCardsInHand(B), cats0 + 1, 'a cat came back to hand');
  go(B, 'moon_pennies_from_heaven');
  eq(B.state.bank, 3, 'Pennies refills the bank');
  const p = pests(B, 0)[0], hp = p.hp;
  B.endTurn();
  // round 3 is a Witching Hour: Moon Pool hits for 2 per bank without spending it
  ok(B.state.clock.isWitching, 'round 3 Witching');
  ok(hp - p.hp >= 6, 'Moon Pool dealt at least 3 x 2: ' + (hp - p.hp));
  eq(B.state.bank, 3, 'the bank stays');
  // finish: Persian turns the bank into a Life
  const before = livesTotal(B);
  p.hp = 1;
  B.endTurn();
  eq(B.state.outcome, 'win', 'won');
  eq(livesTotal(B), before + 1, 'Probate Persian cashed 3 bank into 1 Life');
});

section('LOOP moon 2, Dying Is Good: Paws, Gambler, Rite, Vigil, Rug, Oracle, Loafer, Empress, Everything Must Go', () => {
  const h1 = ['moon_vigil_keeper', 'moon_ouija_rug', 'moon_fishbowl_oracle', 'moon_lamplit_gambler', 'moon_borrowed_paws', 'moon_pallid_empress', 'moon_graveyard_loafer', 'moon_cornering_rite'];
  const B = G({ hand: h1, hands: [h1, ['moon_everything_must_go']], deck: ['moon_everything_must_go'], pests: one1, fill: 12 });
  lv(B, 'moon_lamplit_gambler', 3); lv(B, 'moon_graveyard_loafer', 3);
  go(B, 'moon_pallid_empress', { floor: 1 });
  const emp = cat(B, 'moon_pallid_empress'), e0 = B.atk(emp);
  go(B, 'moon_vigil_keeper', { floor: 0 });
  go(B, 'moon_ouija_rug', { floor: 0 });
  go(B, 'moon_fishbowl_oracle', { floor: 0 });
  const handBefore = handN(B);
  go(B, 'moon_lamplit_gambler', { floor: 0 });          // spends 2 and becomes Cornered
  const g = cat(B, 'moon_lamplit_gambler');
  eq(g.lives, 1, 'Gambler Cornered');
  eq(B.atk(g), 4 + 2, 'Cornered +2 Attack (Power 4)');
  eq(g.fluff, 5, 'Vigil Keeper gives Fluff 5'); ok(g.hidden, 'and Hidden');
  eq(handN(B), handBefore - 1 + 2 + 1, 'Gambler draws 2, Ouija Rug draws 1');
  eq(B.atk(emp), e0 + 2, 'Empress +1 per Life spent');
  go(B, 'moon_graveyard_loafer', { floor: 0 });
  go(B, 'moon_borrowed_paws', { floor: 0 });
  const loaf = cat(B, 'moon_graveyard_loafer');
  go(B, 'moon_cornering_rite', { catUid: loaf.uid });
  eq(loaf.lives, 1, 'Loafer Cornered by the Rite');
  eq(loaf.fluff, 5, 'Vigil Fluff for the second Cornered cat');
  setLives(B, emp, 1);
  B.endTurn();
  // turn 2: the Oracle draws for the Cornered cats here, Loafer and Empress use their Cornered bonuses
  ok(cat(B, 'moon_graveyard_loafer').fluff >= 10, 'Loafer Fluff +5 at turn start');
  ok(cat(B, 'moon_pallid_empress').statuses.frenzy >= 1, 'Empress Frenzy');
  eq(handN(B), 1 + 2, 'Oracle drew 2 extra cards (3 Cornered cats here, max 2)');
  const pest = pests(B, 0)[0], hp = pest.hp, bank0 = B.state.bank, lives0 = livesTotal(B);
  const spenders = allCats(B).filter(c => c.lives > 1).length;
  ok(spenders >= 2, 'some cats still have Lives to burn: ' + spenders);
  go(B, 'moon_everything_must_go');
  eq(hp - pest.hp, 4 * spenders, 'Everything Must Go: 4 damage per Life spent');
  eq(B.state.bank, bank0 + spenders, 'and 1 bank per Life');
  eq(lives0 - livesTotal(B), spenders, 'every cat that could, spent one');
});

section('LOOP moon 3, Witching Double Turn: Wind the Clock, Chime, Mrs. Midnight, Stopped Clock, Sleepwalker, Lantern Tom, Mirror, Wick Witch', () => {
  const h1 = ['moon_mrs_midnight', 'moon_stopped_clock', 'moon_lantern_tom', 'moon_sleepwalker', 'moon_haunted_mirror', 'moon_wind_the_clock'];
  const h2 = ['moon_thirteenth_chime', 'moon_wick_witch', 'moon_candle_kitten'];
  const B = G({ hand: h1, hands: [h1, h2, []], deck: h2, pests: [{ id: 'x_dummy', floor: 1 }, { id: 'x_big', floor: 1 }], clock: true, fill: 10 });
  go(B, 'moon_mrs_midnight', { floor: 0 });
  go(B, 'moon_stopped_clock', { floor: 0 });
  go(B, 'moon_haunted_mirror', { floor: 0 });
  go(B, 'moon_lantern_tom', { floor: 0 });
  go(B, 'moon_sleepwalker', { floor: 1 });
  go(B, 'moon_wind_the_clock');
  const lantern0 = B.atk(cat(B, 'moon_lantern_tom'));
  B.endTurn();
  eq(B.state.round, 2, 'round 2'); ok(B.state.clock.isWitching, 'Wind the Clock: round 2 is a Witching Hour');
  eq(B.state.zoomies, 3 + 2 + 2, 'Mrs. Midnight: the Witching Zoomies twice');
  eq(handN(B), 3 + 1, 'Mrs. Midnight: one extra card on top of the 3 scripted');
  eq(B.atk(cat(B, 'moon_lantern_tom')), lantern0 + 2 + 2, 'Lantern Tom +2, and +2 from the Stopped Clock');
  go(B, 'moon_thirteenth_chime');                        // chain: round 3 is a Witching Hour too
  go(B, 'moon_wick_witch', { floor: 1 });
  const ev = rec(B);
  B.endTurn();
  eq(ev.filter(e => e.type === 'zoom').length, 2 * 4, 'four awake cats, two Zooms each');
  ok(statusEv(ev, 'marked', 'pest').length >= 1, 'the Mirror and the Witch Marked things');
  eq(B.state.round, 3, 'round 3'); ok(B.state.clock.isWitching, 'the Chime made round 3 a Witching Hour too');
  ok(!cat(B, 'moon_sleepwalker').statuses.frazzled, 'Sleepwalker never Frazzled');
  ok(!cat(B, 'moon_lantern_tom').statuses.frazzled && !cat(B, 'moon_mrs_midnight').statuses.frazzled, 'Stopped Clock floor not Frazzled');
  ok(cat(B, 'moon_wick_witch').statuses.frazzled >= 1, 'Wick Witch (another floor) is Frazzled');
  ok(allPests(B).filter(p => p.id.indexOf('x_') === 0).every(p => p.statuses.marked >= 1), 'Wick Witch Marked every pest');
  ok(B.atk(cat(B, 'moon_lantern_tom')) >= lantern0 + 4, 'Lantern Tom keeps +2 per Witching Hour');
});

section('LOOP moon 4, The Marked Hunt: Candle Kitten, Candle Stub, Seer, Mark for Dusk, Candlelit Hiss, Chill, Hollow Tabby', () => {
  const h1 = ['moon_candle_stub', 'moon_siamese_seer', 'moon_candle_kitten', 'moon_hollow_tabby', 'moon_candlelit_hiss', 'moon_chill_in_the_hall', 'moon_mark_for_dusk'];
  const B = G({ hand: h1, pests: [{ id: 'x_dummy', floor: 1 }, { id: 'x_big', floor: 1 }], fill: 10 });
  const [a, b] = pests(B, 0);
  go(B, 'moon_candle_stub', { floor: 0 });
  go(B, 'moon_siamese_seer', { floor: 0 });
  go(B, 'moon_hollow_tabby', { floor: 0 });
  go(B, 'moon_candle_kitten', { floor: 0 });
  eq(a.statuses.marked, 1, 'Candle Kitten marks the front pest');
  go(B, 'moon_candlelit_hiss', { floor: 0 });
  eq([a.statuses.marked, b.statuses.marked, a.statuses.hiss, b.statuses.hiss], [2, 1, 1, 1], 'Candlelit Hiss: Marked and Hiss on the floor');
  const ha = a.hp;
  go(B, 'moon_chill_in_the_hall', { pestUid: a.uid });
  eq(ha - a.hp, 2 * Math.floor(3 * 1.5), 'Chill on a Marked pest: two hits at +50 percent');
  const hb = b.hp;
  go(B, 'moon_mark_for_dusk', { pestUid: b.uid });
  eq(hb - b.hp, Math.floor(3 * 1.5), 'Mark for Dusk on a Marked pest: +50 percent');
  eq(b.statuses.marked, 3, 'and Marked two more');
  const marks0 = a.statuses.marked + b.statuses.marked;
  kill(B, cat(B, 'moon_hollow_tabby'));
  eq(a.statuses.marked + b.statuses.marked, marks0 + 2, 'Hollow Tabby: two Marks when it loses a Life');
  a.hp = 1; b.hp = 400;
  B.endTurn();
  ok(allCats(B).some(c => (c.statuses.claws || 0) >= 1), 'the cat that killed a Marked pest gained Claws');
});

section('LOOP moon (honorable), Revolving Door: Pennyfeather, Bernard, Land on Feet, Cat Flap, Pallbearer, Haunting Rights', () => {
  const h1 = ['moon_pennyfeather', 'moon_boomerang_bernard', 'moon_land_on_feet', 'moon_cat_flap_beyond', 'moon_dusk_mouser', 'moon_pallbearer_tom', 'moon_haunting_rights'];
  const B = G({ hand: h1, pests: [{ id: 'x_dummy', floor: 1 }, { id: 'x_dummy', floor: 1 }], fill: 10 });
  go(B, 'moon_pennyfeather', { floor: 0 });
  go(B, 'moon_boomerang_bernard', { floor: 0 });
  go(B, 'moon_dusk_mouser', { floor: 0 });
  go(B, 'moon_cat_flap_beyond', { floor: 0 });
  kill(B, cat(B, 'moon_pennyfeather')); kill(B, cat(B, 'moon_boomerang_bernard'));
  eq(inHand(B, 'moon_pennyfeather') + inHand(B, 'moon_boomerang_bernard'), 2, 'both walk back to hand');
  eq(B.state.bank, 3, 'Bernard 1 + the Flap 1 per loss');
  kill(B, cat(B, 'moon_dusk_mouser'));
  eq(inHand(B, 'moon_dusk_mouser'), 1, 'the Flap gave the mouser Reborn');
  B.createCard('moon_pennyfeather', 4, 'discard');
  const c0 = catCardsInHand(B), d0 = catCardsInDiscard(B);
  go(B, 'moon_pallbearer_tom', { floor: 1 });
  eq(catCardsInHand(B), c0 - 1 + 1, 'Pallbearer left the hand and returned a cat');
  eq(catCardsInDiscard(B), d0 - 1, 'out of the discard pile');
  const n = catCardsInDiscard(B), ps = pests(B, 0).map(p => p.hp);
  go(B, 'moon_haunting_rights', { floor: 0 });
  eq(pests(B, 0).map((p, i) => ps[i] - p.hp), [n, n], 'Haunting Rights: 1 per cat in the discard pile, to every pest');
});

section('LOOP mischief 1, Shelf Cascade: Tall Shelf, Table Surfer, Gravity Tabby, Vase, Nudge, Domino Shelf, Shelf Gremlin', () => {
  const h1 = ['mischief_tall_shelf', 'mischief_table_surfer', 'mischief_gravity_tabby', 'mischief_shelf_gremlin', 'mischief_just_a_nudge', 'mischief_domino_shelf'];
  const B = G({ hand: h1, deck: ['mischief_wobbly_vase'], fill: 10,
    pests: [{ id: 'x_dummy', floor: 1 }, { id: 'x_dummy', floor: 2 }, { id: 'x_dummy', floor: 2 }, { id: 'x_big', floor: 2 }] });
  const cellarPest = pests(B, 0)[0], [pa, pb, pc] = pests(B, 1);
  go(B, 'mischief_gravity_tabby', { floor: 0 });
  const tabby = cat(B, 'mischief_gravity_tabby'), t0 = B.atk(tabby);
  go(B, 'mischief_shelf_gremlin', { floor: 1 });
  go(B, 'mischief_table_surfer', { floor: 1 });
  go(B, 'mischief_tall_shelf', { floor: 1 });
  const h0 = handN(B), ev = rec(B);
  go(B, 'mischief_just_a_nudge', { pestUid: pa.uid });
  eq(dmgTo(ev, pa.uid), 2 + 3, 'Nudge: fall 2 + Gravity Tabby 3');
  eq(handN(B), h0 - 1 + 1 + 1, 'Table Surfer drew 1 and Tall Shelf added a Vase');
  eq(inHand(B, 'mischief_wobbly_vase'), 1, 'the Vase');
  eq(B.atk(tabby), t0 + 1, 'Gravity Tabby +1');
  go(B, 'mischief_wobbly_vase', { floor: 1 });
  const room = B.state.floors[1].rooms.find(r => r.id === 'mischief_wobbly_vase');
  ok(room, 'Vase on the Parlor');
  const gremlin = cat(B, 'mischief_shelf_gremlin');
  const r = B.knockOffToy(room.uid, gremlin.uid);
  ok(r.ok, 'knocked off: ' + r.reason);
  ok(!B.state.floors[0].pests.includes(cellarPest), 'the Cellar front pest was Knocked out the cat flap');
  ok(cellarPest.hp <= 60 - 3 - 3, 'with 3 Shatter and the 3 Shatter of the flap');
  eq(inHand(B, 'mischief_wobbly_vase'), 0, 'no second Vase this turn (once a turn)');
  go(B, 'mischief_domino_shelf', { floor: 1 });
  eq(pests(B, 1).length, 0, 'the Parlor is empty');
  eq(B.atk(tabby), t0 + 1 + 2, 'two more landings, Gravity Tabby +2');
  ok(pb.hp <= 60 - 2 - 3 && pc.hp < 400 - 2 - 3 + 1, 'both took the fall plus Gravity Tabby');
  eq(B.state.outcome, null, 'battle goes on');
});

section('LOOP mischief 2, Box Hotel: Annex, Too Small, Peekaboo, Pop-Up Pounce', () => {
  const h1 = ['mischief_cardboard_annex'];
  const h2 = ['mischief_too_small_for_this', 'mischief_peekaboo_kitten', 'mischief_pop_up_pounce'];
  const B = G({ hand: h1, hands: [h1, h2], deck: h2, fill: 10,
    pests: [{ id: 'x_big', floor: 1 }, { id: 'x_big', floor: 1 }, { id: 'x_big', floor: 2 }, { id: 'x_big', floor: 2 }, { id: 'x_big', floor: 3 }, { id: 'x_big', floor: 3 }] });
  go(B, 'mischief_cardboard_annex', { floor: 2 });
  const boxes = f => B.state.floors[f].rooms.filter(r => r.rtype === 'box').length;
  eq([boxes(0), boxes(1), boxes(2)], [0, 0, 0], 'no Boxes yet');
  B.endTurn();
  eq([boxes(0), boxes(1), boxes(2)], [1, 1, 1], 'Annex: a free Box on every floor');
  go(B, 'mischief_too_small_for_this', { floor: 1 });
  go(B, 'mischief_pop_up_pounce', { floor: 2 });
  const h = handN(B);
  go(B, 'mischief_peekaboo_kitten', { floor: 0 });
  ok(handN(B) >= h - 1 + 2 - 0, 'Peekaboo in a Box draws 2');
  const ts = cat(B, 'mischief_too_small_for_this'), pp = cat(B, 'mischief_pop_up_pounce');
  ok(ts.boxed && pp.boxed, 'all sitting in Boxes');
  eq(B.atk(ts), 2 + 3 + 1, 'Too Small: 6 Power in a Box');
  const cellar = pests(B, 1)[0], parlor = pests(B, 2)[0];
  const ev = rec(B);
  B.endTurn();
  ok(dmgTo(ev, cellar.uid) >= 6, 'Too Small hit for 6 from the Box: ' + dmgTo(ev, cellar.uid));
  ok(inHand(B, 'mischief_too_small_for_this') >= 1, 'and bounced back to hand');
  ok(dmgTo(ev, parlor.uid) >= 8 + 3, 'Pop-Up Pounce: 8 plus its attack: ' + dmgTo(ev, parlor.uid));
  ok(!pp.boxed, 'it left the Box');
  eq(boxes(1), 1, 'the Parlor Box is still there');
  go(B, 'mischief_too_small_for_this', { floor: 1 });
  ok(cat(B, 'mischief_too_small_for_this').boxed, 'Too Small re-sits');
});

section('LOOP mischief 2b, Tape Square holds a Large cat, Laundry Basket adds a Box', () => {
  const h = ['mischief_tape_square', 'mischief_furniture_mover', 'mischief_laundry_basket'];
  const B = G({ hand: h, fill: 10, pests: [{ id: 'x_big', floor: 1 }] });
  go(B, 'mischief_tape_square', { floor: 0 });
  go(B, 'mischief_furniture_mover', { floor: 0 });
  ok(cat(B, 'mischief_furniture_mover').boxed, 'a Large cat in the Tape Square');
  go(B, 'mischief_laundry_basket', { floor: 1 });
  eq(B.state.floors[1].rooms.filter(r => r.rtype === 'box').length, 1, 'a Basket makes a Box');
});

section('LOOP mischief 3, Hairball Engine: Fur Factory, Cough It Up, Coughing Persian, Gag Reflex, Appreciator, Spit Take', () => {
  const h1 = ['mischief_fur_factory', 'mischief_gag_reflex', 'mischief_hairball_appreciator', 'mischief_coughing_persian', 'mischief_cough_it_up', 'mischief_spit_take'];
  const B = G({ hand: h1, pests: [{ id: 'x_big', floor: 1 }], fill: 10 });
  const p = pests(B, 0)[0], ev = rec(B);
  go(B, 'mischief_fur_factory', { floor: 0 });
  go(B, 'mischief_gag_reflex', { floor: 0 });
  go(B, 'mischief_hairball_appreciator', { floor: 0 });
  const app = cat(B, 'mischief_hairball_appreciator');
  go(B, 'mischief_coughing_persian', { floor: 0 });
  eq(hairballs(B), 1, 'Persian: a Hairball');
  go(B, 'mischief_cough_it_up');
  eq(hairballs(B), 3, 'Cough It Up: two more');
  eq(dmgTo(ev, p.uid, 'shatter'), 3 * 2, 'Gag Reflex: 2 Shatter for each of the 3 Hairballs');
  eq(B.atk(app), 1 + 3, 'Appreciator +3');
  go(B, 'mischief_spit_take');
  eq(hairballs(B), 0, 'Spit Take used them up');
  eq(dmgTo(ev, p.uid, 'hit'), 9, 'Spit Take: 3 each');
  eq(B.atk(app), 1, 'Appreciator back to base');
  B.endTurn();
  eq(hairballs(B), 1, 'Fur Factory: a fresh Hairball at the start of the turn');
  B.createCard('curse_hairball', 1, 'hand');
  eq(B.atk(app), 1 + 2, 'Appreciator tracks the hand');
  const s0 = dmgTo(rec(B).length ? ev : ev, p.uid, 'shatter');
  B.endTurn();
  ok(dmgTo(ev, p.uid, 'shatter') - s0 >= 2, 'Fur Factory: 1 Shatter per Hairball in hand at end of turn');
});

section('LOOP mischief 4, Yarn Chain: Yarn Basket, Skein Gremlin, Loose Thread, Sock Thief, Spool Hoarder, Cat\'s Cradle, Unravel', () => {
  const h1 = ['mischief_yarn_basket', 'mischief_skein_gremlin', 'mischief_loose_thread', 'mischief_sock_thief', 'mischief_spool_hoarder', 'mischief_cats_cradle', 'mischief_unravel'];
  const B = G({ hand: h1, pests: [{ id: 'x_big', floor: 1 }, { id: 'x_big', floor: 1 }, { id: 'x_big', floor: 2 }], fill: 10 });
  const [a, b] = pests(B, 0), c = pests(B, 1)[0];
  go(B, 'mischief_yarn_basket', { floor: 0 });
  go(B, 'mischief_skein_gremlin', { floor: 0 });
  go(B, 'mischief_sock_thief', { floor: 0 });
  go(B, 'mischief_spool_hoarder', { floor: 0 });
  eq(a.statuses.yarn, 1, 'Skein Gremlin: Yarn 1 on the front pest');
  go(B, 'mischief_loose_thread', { pestUid: b.uid });
  eq(b.statuses.yarn, 2, 'Loose Thread: Yarn 2');
  go(B, 'mischief_cats_cradle');
  refill(B);
  const hc = c.hp;
  play(B, 'mischief_unravel', { pestUid: c.uid });
  eq(hc - c.hp, 3, 'Unravel: all the Yarn on the board (1 + 2)');
  eq([a.statuses.yarn, b.statuses.yarn, c.statuses.yarn], [2, 3, 1], 'then Yarn 1 on every pest');
  const ev = rec(B);
  B.endTurn();
  const sock = allCats(B).find(x => x.id === 'mischief_sock_thief'), spool = allCats(B).find(x => x.id === 'mischief_spool_hoarder');
  ok(dmgFrom(ev, sock.uid) >= 2 + 2, 'Sock Thief: 2 plus 2 against a Yarned pest: ' + dmgFrom(ev, sock.uid));
  ok(dmgFrom(ev, spool.uid) >= 2 + 2, 'Spool Hoarder: 2 plus 2 for the Yarn: ' + dmgFrom(ev, spool.uid));
  eq(b.statuses.yarn, 1, 'Yarn wears off one a round');
});

section('polish: Dusk Mouser draws on a lost Life, not on a voluntary Spend', () => {
  const B = G({ hand: ['moon_dusk_mouser'], pests: one1 });
  play(B, 'moon_dusk_mouser', { floor: 0 });
  const c = cat(B, 'moon_dusk_mouser'), h0 = handN(B);
  ok(B.spendLife(c, 1, { voluntary: true }), 'the voluntary spend goes through');
  eq(handN(B), h0, 'no card drawn for a Spend');
  eq(inst(B, c).lives, 3, 'the Life is spent (4 -> 3)');
});

section('polish: Cat\'s Cradle discount is granted before the cost check', () => {
  const B = G({ hand: ['mischief_cats_cradle', 'neutral_swat'], pests: one1, zoomies: 1 });
  pests(B, 0)[0].statuses.yarn = 2;
  ok(play(B, 'mischief_cats_cradle').ok, 'Cat\'s Cradle plays for the last Zoomies');
  eq(B.state.zoomies, 0, 'no Zoomies left');
  const r = play(B, 'neutral_swat', { pestUid: pests(B, 0)[0].uid });
  ok(r.ok, 'a 1 cost spell on a Yarned pest is still playable: ' + (r.reason || ''));
  eq(B.state.zoomies, 0, 'and it nets out to free');
  const B2 = G({ hand: ['neutral_swat'], pests: one1, zoomies: 0 });
  ok(!play(B2, 'neutral_swat', { pestUid: pests(B2, 0)[0].uid }).ok, 'without the discount a failed play does not mint Zoomies');
  eq(B2.state.zoomies, 0, 'Zoomies unchanged after the refused play');
});

section('polish: Laundry Basket cats count as adjacent for a Pile', () => {
  const B = G({ hand: ['moon_dusk_mouser', 'moon_dusk_mouser', 'moon_dusk_mouser'], noPile: false, pests: [{ id: 'x_dummy', floor: 3 }] });
  // three tokens: A, a shamed cat that breaks the run, B
  const ids = Object.keys(B.state.cards).filter(u => B.state.cards[u].eff.type === 'unit' || B.state.cards[u].eff.type === 'champion');
  ok(ids.length >= 3, 'three unit cards available');
  const a = B.placeCat(ids[0], 0, 0), s = B.placeCat(ids[1], 0, 1), b = B.placeCat(ids[2], 0, 2);
  s.statuses.shamed = 1; B.touch();
  eq(B.pileSizeOf(a), 0, 'a shamed cat between them breaks the run');
  const basket = B.placeBox(0, { kind: 'laundry' });
  B.seatCat(a, basket); B.seatCat(b, basket);
  B.touch(); B.ensure();
  eq([B.pileSizeOf(a), B.pileSizeOf(b)], [2, 2], 'two cats sharing a Laundry Basket form a Pile of 2');
  eq(B.pileSizeOf(s), 0, 'the shamed cat stays out');
});

section('LOOP mischief (honorable), the Surge combo: Nip sources, Whole Jar, Wired Siamese, Colossus, Crash Test Tom, Soft Landing, Detox Tea', () => {
  const h1 = ['mischief_nip_planter', 'mischief_wired_siamese', 'mischief_comedown_colossus', 'mischief_crash_test_tom', 'mischief_sprig_courier', 'mischief_a_sniff', 'mischief_fresh_sprig'];
  const h4 = ['mischief_soft_landing', 'mischief_detox_tea'];
  const B = G({ hand: h1, hands: [h1, [], [], h4], deck: h4, pests: [{ id: 'x_big', floor: 1 }], fill: 10 });
  go(B, 'mischief_wired_siamese', { floor: 0 });
  go(B, 'mischief_crash_test_tom', { floor: 0 });
  go(B, 'mischief_nip_planter', { floor: 0 });
  go(B, 'mischief_comedown_colossus', { floor: 1 });      // +2 Nip
  go(B, 'mischief_sprig_courier', { floor: 1 });          // +2 Nip
  go(B, 'mischief_a_sniff');                              // +3 Nip
  eq(B.state.nip.meter, 7, 'Nip 7');
  go(B, 'mischief_fresh_sprig');                          // +4 Nip: 11, Surge
  ok(B.state.nip.surge > 0, 'the meter overflowed into a Surge');
  eq(B.state.nip.excess, 1, 'with 1 excess Nip');
  const sia = cat(B, 'mischief_wired_siamese');
  eq(sia.statuses.frenzy, 1, 'Wired Siamese: Frenzy 1');
  eq(B.atk(sia), 3 + 2 + 1, 'Surge Attack +2 plus the excess');
  B.endTurn();
  ok(B.state.nip.surge > 0, 'second Surge turn');
  eq(B.state.zoomies, 3 + 2, '+2 Zoomies on the second Surge turn');
  const tom = cat(B, 'mischief_crash_test_tom'), colo = cat(B, 'mischief_comedown_colossus');
  tom.health = tom.maxHealth - 3;
  B.endTurn();
  // crash turn
  ok(B.state.nip.crash > 0, 'Crash');
  eq(B.state.zoomies, 3 - 1, 'Crash: -1 Zoomies');
  ok(tom.napping && colo.napping && sia.napping, 'every cat was put to sleep');
  eq(tom.fluff, 6, 'Crash Test Tom: 6 Fluff'); eq(tom.health, tom.maxHealth, 'and healed 3');
  eq(colo.statuses.rested, 4, 'Comedown Colossus: Rested 1 + 3');
  const hand0 = handN(B);
  refill(B);
  B.endTurn();
});

// ---- balance pass: printed Power / Health / Lives of every Moon and Mischief unit (deliberate stat changes, see tests/balance-sim.js) ----
section('balance pass: printed stats of every Moon and Mischief unit and kitten', () => {
  const want = {"mischief_shelf_gremlin":[2,4,4],
  "mischief_counter_kitten":[1,3,3],
  "mischief_box_inspector":[2,5,4],
  "mischief_peekaboo_kitten":[1,4,3],
  "mischief_skein_gremlin":[1,5,4],
  "mischief_buzzed_burmese":[2,4,4],
  "mischief_sprig_courier":[1,4,4],
  "mischief_coughing_persian":[1,5,4],
  "mischief_sock_thief":[2,4,4],
  "mischief_table_surfer":[2,6,4],
  "mischief_furniture_mover":[4,10,5],
  "mischief_too_small_for_this":[2,4,4],
  "mischief_spool_hoarder":[2,6,4],
  "mischief_wired_siamese":[3,4,4],
  "mischief_crash_test_tom":[2,7,4],
  "mischief_hairball_appreciator":[1,5,4],
  "mischief_gag_reflex":[2,5,4],
  "mischief_pop_up_pounce":[3,4,4],
  "mischief_gravity_tabby":[3,7,4],
  "mischief_comedown_colossus":[5,12,5],
  "moon_candle_kitten":[3,6,3],
  "moon_dusk_mouser":[3,5,4],
  "moon_graveyard_loafer":[3,9,4],
  "moon_pennyfeather":[2,5,4],
  "moon_borrowed_paws":[3,6,4],
  "moon_lantern_tom":[3,8,4],
  "moon_hollow_tabby":[4,7,4],
  "moon_sleepwalker":[3,5,4],
  "moon_stray_medium":[2,6,4],
  "moon_ninth_sibling":[3,7,4],
  "moon_vigil_keeper":[4,7,4],
  "moon_lamplit_gambler":[4,6,4],
  "moon_wick_witch":[3,7,4],
  "moon_pallbearer_tom":[5,8,4],
  "moon_boomerang_bernard":[4,6,4],
  "moon_siamese_seer":[3,7,4],
  "moon_mrs_midnight":[4,9,4],
  "moon_pallid_empress":[6,11,5],
  "moon_probate_persian":[3,10,4],
  "moon_the_undertaker":[5,8,4],
  "token_spirit_cat":[2,2,1],
  "moon_basic_kitten":[3,4,3],
  "mischief_basic_kitten":[2,4,3],
  "moon_wisp_kitten":[2,5,2],
  "moon_wisp_cat":[4,9,3],
  "moon_wisp_legend":[7,14,4],
  "mischief_gus_kitten":[2,5,2],
  "mischief_gus_cat":[4,9,3],
  "mischief_gus_legend":[7,18,4]};
  Object.keys(want).forEach(id => { const c = SB.content.card(id); eq([c.stats.power, c.stats.health, c.stats.lives], want[id], id + ' printed Power/Health/Lives'); });
  eq(Object.keys(want).length, SB.content.cards().filter(c => c.type === 'unit' && (c.clan === 'moon' || c.clan === 'mischief') && c.stats).length, 'table covers every Moon and Mischief unit');
});

// ---- runner -----------------------------------------------------------------------------------
sections.forEach(([name, fn]) => {
  const f0 = failures;
  try { fn(); } catch (e) { failures++; failLog.push(name + ' threw: ' + (e.stack || e).toString().split('\n').slice(0, 4).join(' | ')); }
  console.log((failures === f0 ? 'PASS ' : 'FAIL ') + name);
});
failLog.forEach(m => console.log('  - ' + m));
console.log('\n' + checks + ' checks, ' + failures + ' failures');
process.exit(failures ? 1 : 0);
