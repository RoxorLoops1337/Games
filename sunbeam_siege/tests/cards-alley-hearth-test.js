// Per-card BEHAVIOR tests for the Alley Tabbies and Hearthpaws clans (src/data/cards-alley.js, cards-hearth.js).
// node tests/cards-alley-hearth-test.js [--verbose]
// For every card: build a minimal battle, play it, and assert the printed text happens (damage, buffs, stacks,
// keywords), for the base card and for its "+" upgrade. Then script each clan's 4 loops in a real combat.
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
let curCard = '';
function ok(c, msg) { checks++; if (!c) { failures++; failLog.push('[' + curCard + '] ' + msg); if (VERBOSE) console.log('  FAIL [' + curCard + '] ' + msg); } return !!c; }
function eq(a, b, msg) { return ok(a === b || JSON.stringify(a) === JSON.stringify(b), msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }

const SB = makeSB();

// ---- synthetic scaffolding: inert cats, a filler spell, and pests that wait or bite ----------------
(function addScaffold() {
  const T = SB.data.tutorial;
  const unit = (id, name, p, h, l) => ({ id, name, type: 'unit', clan: 'neutral', rarity: 'basic', cost: 0, targeting: 'floor', stats: { power: p, health: h, lives: l, size: 1 }, keywords: {}, text: name, flavor: name, art: { sprite: 'cat_plain', palette: 'grey' }, tutorialOnly: true });
  T.cards.push(
    unit('t_pow', 'Test Cat', 2, 30, 6),
    unit('t_tank', 'Test Tank', 0, 40, 6),
    { id: 't_fill', name: 'Filler', type: 'spell', clan: 'neutral', rarity: 'basic', cost: 0, targeting: 'none', keywords: {}, text: 'Nothing.', flavor: 'Nothing.', effects: { onPlay: [] }, tutorialOnly: true }
  );
  const pest = (id, name, hp, actions) => ({ id, name, hp, size: 1, traits: [], tags: ['pest'], pattern: actions ? { type: 'cycle', actions } : undefined, flavor: name, art: { species: 'mouse', colors: 'grey', accessory: 'none' }, tutorialOnly: true });
  const bite = n => ({ kind: 'attack', dmg: n, hits: 1, floors: 'own', pick: 'front', label: 'Bite' });
  T.enemies.push(pest('t_dummy', 'Dummy', 40), pest('t_biter', 'Biter', 40, [bite(2)]), pest('t_biter4', 'Big Biter', 40, [bite(4)]), pest('t_nibble', 'Nibbler', 40, [bite(1)]));
  SB.content.rebuild();
})();

const DASH = new RegExp('[' + String.fromCharCode(0x2013) + String.fromCharCode(0x2014) + ']');
let seedN = 0;
// G: build a battle. o: deck (card ids; also the round 1 hand unless o.hand), up (card ids to upgrade), pests [{id,floor,hp}], fill (filler count),
//    noPile, hands (extra rounds)
function G(o) {
  o = o || {};
  const run = SB.run.newRun({ seed: 'AH' + (seedN++), clan: 'alley', side: 'hearth', rank: 0 });
  run.relics = [];
  const expand = list => list.reduce((a, id) => a.concat(id === 't_pow' ? Array(6).fill(id) : (id === 't_tank' ? Array(3).fill(id) : [id])), []);
  const ids = expand(o.deck || []);
  const hand = expand(o.hand || o.deck || []);
  for (let i = 0; i < (o.fill === undefined ? 12 : o.fill); i++) ids.push('t_fill');
  run.deck = ids.map(id => { const inst = SB.cardInst.make(id); if ((o.up || []).indexOf(id) >= 0) inst.scratches.push('plus'); return inst; });
  const pests = o.pests || [{ id: 't_dummy', floor: 0 }];
  const enc = { id: 'ah_enc', type: 'prowl', act: 1, rules: { nightClock: false, impatience: false, noPile: !!o.noPile }, waves: [{ round: 1, spawns: pests.map(p => ({ id: p.id, floor: p.floor + 1, at: 'back' })) }], setup: { cats: [] } };
  const B = SB.battle.create(run, enc, { seed: o.bseed || 1, hands: [hand].concat(o.hands || []), noWitching: true });
  pests.forEach((p, i) => { if (p.hp) { const u = B.pests().filter(x => x.id === p.id && x.floor === p.floor && !x.__set)[0]; if (u) { u.hp = u.maxHp = p.hp; u.__set = 1; } } });
  const g = { B, run, ev: [] };
  B.on(e => g.ev.push(e));
  g.S = B.state;
  g.uidOf = id => { const h = B.state.hand.filter(x => B.state.cards[x.uid].id === id)[0]; return h && h.uid; };
  g.inHand = id => B.state.hand.filter(x => B.state.cards[x.uid].id === id).length;
  g.top = () => { if (B.state.zoomies < 10) B.state.zoomies = 10; };
  g.play = (id, target, keepZ) => { const u = g.uidOf(id); if (!u) return { ok: false, reason: 'not in hand: ' + id }; if (!keepZ) g.top(); return B.playCard(u, target || {}); };
  g.cat = (f, p) => B.state.floors[f].cats[p || 0];
  g.cats = f => B.state.floors[f].cats;
  g.pest = (f, p) => B.state.floors[f].pests[p || 0];
  g.pests = f => B.state.floors[f].pests;
  g.floor = f => B.state.floors[f];
  g.purr = f => B.state.floors[f].statuses.purr || 0;
  g.end = () => B.endTurn();
  g.pestUid = (f, p) => ({ pestUid: g.pest(f, p).uid });
  g.catT = c => ({ catUid: c.uid });
  g.setLives = (c, n, max) => { const inst = B.instByUid(c.instUid); inst.lives = n; if (max) inst.maxLives = max; c.lives = n; c.maxLives = inst.maxLives; B.touch(); };
  g.inExhaust = id => B.state.exhaust.filter(u => B.state.cards[u].id === id).length;
  g.inDiscard = id => B.state.discard.filter(u => B.state.cards[u].id === id).length;
  g.atk = c => B.atk(c);
  g.dmgAll = (f, n) => g.cats(f).forEach(c => { c.health -= n; });
  g.deploy = (id, f, pos) => g.play(id, { floor: f, pos });
  return g;
}
const U = (up, id) => (up ? [id] : []);
const v = (up, a, b) => (up ? b : a);

// ---- registry of card tests -------------------------------------------------------------------------
const tests = {};
function T(id, fn) { tests[id] = fn; }
function both(id, fn) { T(id, () => { fn(false); fn(true); }); }

/* ============================= ALLEY: CAT UNITS ============================= */
both('alley_bin_diver', up => {
  const id = 'alley_bin_diver', g = G({ deck: [id], up: U(up, id), pests: [{ id: 't_dummy', floor: 0, hp: 40 }] });
  ok(g.deploy(id, 0).ok, 'deploys');
  const c = g.cat(0, 0), cl = v(up, 1, 2);
  eq(c.statuses.claws, cl, 'Deploy: gain Claws');
  eq(c.kw.pounce, 1, 'has Pounce 1');
  eq(g.pest(0, 0).hp, 40 - (1 + 1 + cl), 'Pounce hits for Power + 1 + Claws gained on deploy');
});

both('alley_gutter_kitten', up => {
  const id = 'alley_gutter_kitten', pw = v(up, 2, 3);
  const g2 = G({ deck: [id], up: U(up, id), pests: [{ id: 't_dummy', floor: 0, hp: 1 + pw }, { id: 't_dummy', floor: 0, hp: 40 }] });
  g2.S.zoomies = 3;
  ok(g2.play(id, { floor: 0 }, true).ok, 'plays for 0');
  eq(g2.S.zoomies, 4, 'Pounce kill refunds 1 Zoomies (Power 1 + Pounce)');
  eq(g2.pests(0).length, 1, 'the target died');
  // not a kill: no refund
  const g3 = G({ deck: [id], up: U(up, id), pests: [{ id: 't_dummy', floor: 0, hp: 40 }] });
  g3.S.zoomies = 3; g3.play(id, { floor: 0 }, true);
  eq(g3.S.zoomies, 3, 'no kill, no refund');
  // Fleeting: exhausted at end of turn when unplayed
  const g4 = G({ deck: [id], up: U(up, id) });
  g4.end();
  eq(g4.inExhaust(id), 1, 'Fleeting exhausts the unplayed card');
  eq(g4.inDiscard(id), 0, 'and it does not go to the discard');
  const inst = SB.cardInst.make(id); if (up) inst.scratches.push('plus');
  const eff = SB.cardInst.effective(inst);
  eq([eff.stats.health, eff.keywords.pounce], [v(up, 2, 3), v(up, 2, 3)], 'upgrade stats');
});

both('alley_fence_walker', up => {
  const id = 'alley_fence_walker', fr = v(up, 1, 2);
  const g = G({ deck: [id], up: U(up, id), pests: [{ id: 't_dummy', floor: 0, hp: 40 }] });
  g.deploy(id, 0);
  eq(g.cat(0, 0).statuses.frenzy, fr, 'Deploy: gain Frenzy');
  g.end();
  eq(g.pest(0, 0).hp, 40 - 1 * (fr + 1), 'attacks Frenzy+1 times');
  eq(g.cat(0, 0).health, 3 - fr, 'takes 1 damage per extra hit (health 3)');
});

both('alley_tin_can_tom', up => {
  const id = 'alley_tin_can_tom', n = v(up, 1, 2);
  const g = G({ deck: [id, 't_tank'], up: U(up, id), pests: [{ id: 't_biter', floor: 0 }] });
  g.deploy('t_tank', 0); g.deploy(id, 0);
  eq(g.cats(0).map(c => c.id), ['t_tank', id], 'Tom stands behind the tank');
  g.end();
  const tom = g.cats(0)[1], tank = g.cats(0)[0];
  eq(tank.health, 40, 'the front cat was not hit');
  eq(tom.health, v(up, 6, 8) - 2, 'Rage-bait: pests must hit Tom');
  eq(tom.statuses.claws, n, 'each hit taken gives Claws');
});

both('alley_back_door_bandit', up => {
  const id = 'alley_back_door_bandit', n = v(up, 1, 2);
  const g = G({ deck: [id], up: U(up, id), pests: [{ id: 't_dummy', floor: 0, hp: 2 }, { id: 't_dummy', floor: 0, hp: 40 }] });
  g.deploy(id, 0); g.end();
  eq(g.cats(0)[0].statuses.claws, n, 'a kill gives Claws');
});

both('alley_sidewalk_sprinter', up => {
  const id = 'alley_sidewalk_sprinter', g = G({ deck: [id], up: U(up, id), pests: [{ id: 't_dummy', floor: 0, hp: 40 }] });
  g.deploy(id, 0);
  eq(g.pest(0, 0).hp, 40 - 3, 'Pounce 1 on Power 2');
  eq(g.cat(0, 0).maxHealth, v(up, 2, 4), 'health');
});

both('alley_scrap_heap_sal', up => {
  const id = 'alley_scrap_heap_sal', g = G({ deck: [id], up: U(up, id) });
  g.deploy(id, 0);
  const c = g.cat(0, 0);
  eq(c.lives, 2, 'Deploy: Spend a Life (3 to 2)');
  eq(g.B.instByUid(c.instUid).lives, 2, 'the life is spent on the run card');
  eq(c.statuses.claws, v(up, 3, 4), 'gain Claws');
});

both('alley_ledge_lurker', up => {
  const id = 'alley_ledge_lurker', g = G({ deck: [id], up: U(up, id), pests: [{ id: 't_dummy', floor: 0, hp: 40 }] });
  g.deploy(id, 0);
  eq(g.pest(0, 0).hp, 40 - v(up, 2 + 2, 3 + 3), 'Pounce N on Power');
});

both('alley_whetstone_whiskers', up => {
  const id = 'alley_whetstone_whiskers', g = G({ deck: [id], up: U(up, id), pests: [{ id: 't_dummy', floor: 0, hp: 1 }, { id: 't_dummy', floor: 0, hp: 40 }] });
  g.deploy(id, 0); g.end();
  eq(g.cats(0)[0].statuses.claws, v(up, 2, 3), 'a kill gives Claws');
});

both('alley_ragebait_ronnie', up => {
  const id = 'alley_ragebait_ronnie', n = v(up, 1, 2);
  const g = G({ deck: [id, 't_pow'], up: U(up, id), pests: [{ id: 't_biter', floor: 0 }] });
  g.deploy('t_pow', 0); g.deploy(id, 0);
  g.end();
  const ron = g.cats(0)[1], other = g.cats(0)[0];
  eq(other.health, 30, 'Ronnie draws the hit');
  eq(ron.health, v(up, 7, 9) - 2, 'Ronnie takes the hit');
  eq(ron.statuses.claws, 1, 'Rage-bait 1 gives Ronnie 1 Claws');
  eq(other.statuses.claws, n, 'other Cats gain Claws when Ronnie takes damage');
});

both('alley_ambush_artie', up => {
  const id = 'alley_ambush_artie', g = G({ deck: [id, 't_pow'], up: U(up, id), pests: [{ id: 't_dummy', floor: 0, hp: 40 }] });
  g.deploy(id, 1);
  eq(g.pest(0, 0).hp, 40, 'no pests on the Parlor, Artie pounces on nothing');
  g.deploy('t_pow', 0);
  eq(g.cat(0, 0).kw.pounce, 1, 'another Cat deployed (any floor) gains Pounce 1');
  eq(g.pest(0, 0).hp, 40 - 3, 'and uses it on deploy');
  eq(g.cats(1)[0].kw.pounce, 1, 'Artie keeps his own Pounce 1');
  eq(g.cats(1)[0].basePower, v(up, 2, 3), 'power');
});

both('alley_frenzy_fred', up => {
  const id = 'alley_frenzy_fred', n = v(up, 2, 3);
  const g = G({ deck: [id], up: U(up, id), pests: [{ id: 't_dummy', floor: 0, hp: 40 }] });
  g.deploy(id, 0);
  eq(g.cat(0, 0).statuses.frenzy || 0, 0, 'nothing on deploy');
  g.end();
  eq(g.cat(0, 0).statuses.frenzy, n, 'Start of your turn: gain Frenzy');
});

both('alley_cornered_connie', up => {
  const id = 'alley_cornered_connie', m = v(up, 2, 3);
  const g = G({ deck: [id], up: U(up, id) });
  g.deploy(id, 0);
  const c = g.cat(0, 0);
  eq(c.lives, 2, 'Deploy: Spend a Life');
  eq(g.atk(c), 1 + m * 1, 'Attack per Life missing (1 missing)');
  g.B.spendLife(c, 1, { voluntary: true });
  eq(c.lives, 1, 'down to the last life');
  eq(g.atk(c), 1 + m * 2 + 2, 'two missing plus the Cornered bonus');
});

both('alley_last_gasp_gus', up => {
  const id = 'alley_last_gasp_gus', base = v(up, 2, 4);
  const g = G({ deck: [id], up: U(up, id), pests: [{ id: 't_dummy', floor: 0, hp: 60 }, { id: 't_biter', floor: 0, hp: 60 }] });
  g.deploy(id, 0);
  const gus = g.cat(0, 0);
  g.B.addStatus(gus, 'claws', 3); gus.health = 1;
  g.end();
  eq(g.cats(0).length, 0, 'Gus died');
  // front dummy: his attack (1 + 3 claws) then the blast (base + 3 claws); the biter takes the blast only
  const dummy = g.B.pests().filter(p => p.id === 't_dummy')[0], biter = g.B.pests().filter(p => p.id === 't_biter')[0];
  eq(dummy.hp, 60 - 4 - (base + 3), 'death blast hits for base plus Claws (front pest)');
  eq(biter.hp, 60 - (base + 3), 'death blast hits every enemy on the floor');
  eq(g.inHand(id), 1, 'Reborn: back in hand');
  eq(g.B.instByUid(g.run.deck[0].uid).lives, 2, 'a Life was spent');
});

T('alley_last_gasp_gus (Reborn halves the Claws)', () => {
  const id = 'alley_last_gasp_gus';
  const g = G({ deck: [id], pests: [{ id: 't_biter', floor: 0, hp: 60 }] });
  g.deploy(id, 0);
  const gus = g.cat(0, 0);
  g.B.addStatus(gus, 'claws', 5); gus.health = 1;
  g.end();
  eq(g.inHand(id), 1, 'Gus is back in hand');
  g.deploy(id, 0);
  eq(g.cat(0, 0).statuses.claws || 0, 2, 'the Reborn Gus keeps half his Claws, rounded down');
});

both('alley_smash_and_grab_gladys', up => {
  const id = 'alley_smash_and_grab_gladys';
  const g = G({ deck: [id], up: U(up, id), pests: [{ id: 't_dummy', floor: 0, hp: 2 }, { id: 't_dummy', floor: 0, hp: 40 }] });
  const h0 = g.S.hand.length;
  g.deploy(id, 0);
  eq(g.S.hand.length, h0 - 1 + 1, 'Pounce kill draws 1');
  const g2 = G({ deck: [id], up: U(up, id), pests: [{ id: 't_dummy', floor: 0, hp: 40 }] });
  const h1 = g2.S.hand.length; g2.deploy(id, 0);
  eq(g2.S.hand.length, h1 - 1, 'no kill, no draw');
});

both('alley_sharpening_sally', up => {
  const id = 'alley_sharpening_sally', g = G({ deck: [id], up: U(up, id), pests: [{ id: 't_dummy', floor: 0, hp: 40 }] });
  g.deploy(id, 0); g.end();
  eq(g.cats(0)[0].statuses.claws, 1, 'attacking gains 1 Claws');
  eq(g.pest(0, 0).hp, 40 - (v(up, 2, 3) + 1), 'the new Claws count on the same hit');
  g.end();
  eq(g.cats(0)[0].statuses.claws, 2, 'again next attack');
});

both('alley_old_scratch', up => {
  const id = 'alley_old_scratch', c0 = v(up, 2, 3);
  const g = G({ deck: [id], up: U(up, id), pests: [{ id: 't_dummy', floor: 0, hp: 200 }] });
  g.deploy(id, 0);
  const c = g.cat(0, 0);
  eq(c.size, 2, 'Large');
  eq(c.statuses.claws, c0, 'Deploy: gain Claws');
  g.end();
  eq(c.statuses.claws, c0 * 2, 'attacking doubles its Claws');
  eq(g.pest(0, 0).hp, 200 - (3 + c0 * 2), 'the doubled Claws hit this turn');
  g.end();
  eq(c.statuses.claws, c0 * 4, 'doubles again');
});

both('alley_hurricane_hank', up => {
  const id = 'alley_hurricane_hank', n = v(up, 1, 2);
  const g = G({ deck: [id, 't_pow'], up: U(up, id) });
  g.deploy('t_pow', 0); g.deploy(id, 0); g.deploy('t_pow', 1);
  g.end();
  eq(g.cats(0).map(c => c.statuses.frenzy || 0), [n, n], 'every Cat on the floor gains Frenzy (Hank included)');
  eq(g.cats(1).map(c => c.statuses.frenzy || 0), [0], 'other floors do not');
});

both('alley_queen_of_the_zoomies', up => {
  const id = 'alley_queen_of_the_zoomies', sp = 'alley_sidewalk_sprinter';
  const g = G({ deck: [id, sp], up: U(up, id), pests: [{ id: 't_dummy', floor: 0, hp: 5 }, { id: 't_dummy', floor: 0, hp: 4 }, { id: 't_dummy', floor: 0, hp: 40 }] });
  g.S.zoomies = 5;
  const h0 = g.S.hand.length;
  ok(g.play(id, { floor: 0 }, true).ok, 'play Queen');
  eq(g.S.zoomies, 5 - 2 + 1, 'her own Pounce kill refunds 1 Zoomies');
  eq(g.S.hand.length, h0 - 1 + 1, 'and draws 1');
  ok(g.play(sp, { floor: 0 }, true).ok, 'play Sprinter');
  eq(g.pests(0).length, 1, 'the Sprinter also killed with Pounce');
  eq(g.S.zoomies, 5 - 2 + 1 - 1, 'only once per turn');
  eq(g.S.hand.length, h0 - 2 + 1, 'no second draw');
  eq(g.cats(0)[0].kw.pounce, 2, 'Pounce 2');
});

both('alley_barnaby_bad_idea', up => {
  const id = 'alley_barnaby_bad_idea', n = v(up, 3, 4);
  const g = G({ deck: [id], up: U(up, id), pests: [{ id: 't_dummy', floor: 0, hp: 200 }] });
  g.deploy(id, 0);
  const b = g.cat(0, 0);
  eq(b.size, 2, 'Large');
  eq(b.lives, 4, 'starts on 4 lives');
  g.end();
  eq([b.lives, b.statuses.claws], [3, n], 'end of turn: Spend a Life and gain Claws');
  g.end();
  eq([b.lives, b.statuses.claws], [2, 2 * n], 'again');
  g.end();
  eq([b.lives, b.statuses.claws], [1, 3 * n], 'at 2 Lives he still spends one and gains the Claws');
  g.end();
  eq([b.lives, b.statuses.claws], [1, 3 * n], 'at 1 Life nothing happens');
});

/* ============================= ALLEY: SPELLS ============================= */
both('alley_sharpen', up => {
  const id = 'alley_sharpen', g = G({ deck: [id, 't_pow'], up: U(up, id) });
  g.deploy('t_pow', 0);
  ok(g.play(id, g.catT(g.cat(0, 0))).ok, 'plays');
  eq(g.cat(0, 0).statuses.claws, v(up, 2, 3), 'a Cat gains Claws');
});

both('alley_cheap_shot', up => {
  const id = 'alley_cheap_shot', n = v(up, 2, 3);
  const g = G({ deck: [id], up: U(up, id), pests: [{ id: 't_dummy', floor: 0, hp: 40 }] });
  const h0 = g.S.hand.length;
  g.S.zoomies = 0;
  ok(g.play(id, g.pestUid(0, 0), true).ok, 'plays for 0');
  eq(g.pest(0, 0).hp, 40 - n, 'deals damage');
  eq(g.S.hand.length, h0 - 1, 'no kill, no draw');
  const g2 = G({ deck: [id], up: U(up, id), pests: [{ id: 't_dummy', floor: 0, hp: n }, { id: 't_dummy', floor: 0, hp: 40 }] });
  const h1 = g2.S.hand.length;
  g2.play(id, g2.pestUid(0, 0), true);
  eq(g2.pests(0).length, 1, 'killed');
  eq(g2.S.hand.length, h1 - 1 + 1, 'If it kills, draw 1 card');
});

both('alley_bin_raid', up => {
  const id = 'alley_bin_raid', g = G({ deck: [id], up: U(up, id) });
  const h0 = g.S.hand.length, d0 = g.S.discard.length;
  g.play(id);
  eq(g.S.hand.length, h0 - 1 + v(up, 2, 3) - 1, 'draw N then discard 1');
  eq(g.S.discard.length, d0 + 2, 'the played card and the discarded one');
});

both('alley_tail_yank', up => {
  const id = 'alley_tail_yank', n = v(up, 3, 5);
  const g = G({ deck: [id], up: U(up, id), pests: [{ id: 't_dummy', floor: 1, hp: 40 }] });
  g.play(id, g.pestUid(1, 0));
  eq(g.pests(1).length, 0, 'Knock 1 pushed it off the Parlor');
  eq(g.pests(0).length, 1, 'and down to the Cellar');
  eq(g.pest(0, 0).hp, 40 - n - 2, 'damage plus 2 Shatter for the floor fallen');
});

both('alley_hiss_fit', up => {
  const id = 'alley_hiss_fit', g = G({ deck: [id], up: U(up, id), pests: [{ id: 't_dummy', floor: 0, hp: 40 }, { id: 't_dummy', floor: 0, hp: 40 }, { id: 't_dummy', floor: 1, hp: 40 }] });
  g.play(id, { floor: 0 });
  eq(g.pests(0).map(p => p.hp), [40 - v(up, 2, 3), 40 - v(up, 2, 3)], 'damage to all enemies on the floor');
  eq(g.pests(0).map(p => p.statuses.hiss), [v(up, 1, 2), v(up, 1, 2)], 'and Hiss');
  eq(g.pest(1, 0).hp, 40, 'other floors untouched');
});

both('alley_spite_spurt', up => {
  const id = 'alley_spite_spurt', g = G({ deck: [id, 't_pow'], up: U(up, id) });
  g.deploy('t_pow', 0);
  const c = g.cat(0, 0);
  g.S.zoomies = 0;
  ok(g.play(id, g.catT(c), true).ok, 'plays for 0');
  eq(c.lives, 5, 'Spend a Life');
  eq(c.statuses.claws, v(up, 3, 4), 'gains Claws');
  eq(g.inExhaust(id), 1, 'Exhaust');
  const k = G({ deck: [id, 'alley_basic_kitten'], up: U(up, id) });
  k.deploy('alley_basic_kitten', 0);
  const kit = k.cat(0, 0);
  k.play(id, k.catT(kit)); // 2 -> 1
  const r = k.B.instByUid(kit.instUid).lives;
  eq(r, 1, 'kitten spends down to 1');
});

both('alley_pounce_again', up => {
  const id = 'alley_pounce_again', g = G({ deck: [id, 't_pow'], up: U(up, id), pests: [{ id: 't_dummy', floor: 0, hp: 40 }] });
  g.deploy('t_pow', 0);
  g.B.addStatus(g.cat(0, 0), 'claws', 1);
  g.S.zoomies = 1;
  const r = g.play(id, g.catT(g.cat(0, 0)), true);
  ok(r.ok, 'plays with ' + v(up, 1, 0) + ' Zoomies available');
  eq(g.pest(0, 0).hp, 40 - (2 + 2 + 1), 'Attack + 2 (+ Claws) on the front enemy');
  eq(g.S.zoomies, v(up, 0, 1), 'cost: 1, upgraded 0');
});

both('alley_midnight_sprint', up => {
  const id = 'alley_midnight_sprint', g = G({ deck: [id, 't_pow'], up: U(up, id) });
  g.deploy('t_pow', 0);
  g.play(id, g.catT(g.cat(0, 0)));
  eq(g.cat(0, 0).statuses.frenzy, v(up, 3, 4), 'Frenzy');
});

both('alley_dirty_fighting', up => {
  const id = 'alley_dirty_fighting', g = G({ deck: [id, 't_pow'], up: U(up, id), pests: [{ id: 't_dummy', floor: 0, hp: 40 }] });
  g.deploy('t_pow', 0); g.deploy('t_pow', 1);
  g.B.addStatus(g.cat(0, 0), 'claws', 2); g.B.addStatus(g.cat(1, 0), 'claws', 5);
  g.play(id, g.pestUid(0, 0));
  eq(g.pest(0, 0).hp, 40 - (v(up, 3, 5) + 5), 'base plus the highest Claws among your Cats');
});

both('alley_brawl', up => {
  const id = 'alley_brawl', g = G({ deck: [id, 't_pow', 't_tank'] , up: U(up, id) });
  g.deploy('t_pow', 0); g.deploy('t_tank', 0); g.deploy('t_pow', 1);
  g.play(id, { floor: 0 });
  eq(g.cats(0).map(c => [c.health, c.statuses.claws]), [[28, v(up, 2, 3)], [38, v(up, 2, 3)]], 'every Cat on the floor takes 2 and gains Claws');
  eq(g.cat(1, 0).health, 30, 'other floor untouched');
});

both('alley_collective_bad_idea', up => {
  const id = 'alley_collective_bad_idea', g = G({ deck: [id, 't_pow'], up: U(up, id) });
  g.deploy('t_pow', 0); g.deploy('t_pow', 1); g.deploy('t_pow', 2);
  g.play(id);
  eq(g.cats(0).concat(g.cats(1), g.cats(2)).map(c => [c.lives, c.statuses.claws, c.statuses.frenzy]), [[5, v(up, 2, 3), v(up, 1, 2)], [5, v(up, 2, 3), v(up, 1, 2)], [5, v(up, 2, 3), v(up, 1, 2)]], 'every Cat spends a Life and gains Claws and Frenzy');
  eq(g.inExhaust(id), 1, 'Exhaust');
});

both('alley_bin_night_riot', up => {
  const id = 'alley_bin_night_riot', g = G({ deck: [id, 't_pow'], up: U(up, id) });
  g.deploy('t_pow', 0); g.deploy('t_pow', 2);
  const h0 = g.S.hand.length;
  g.S.zoomies = v(up, 3, 2);
  ok(g.play(id, {}, true).ok, 'plays for ' + v(up, 3, 2));
  eq(g.S.zoomies, 0, 'cost');
  eq(g.cats(0).concat(g.cats(2)).map(c => [c.statuses.frenzy, c.statuses.claws]), [[2, 2], [2, 2]], 'every Cat gains Frenzy 2 and 2 Claws');
  eq(g.S.hand.length, h0 - 1 + 2, 'Draw 2');
  eq(g.inExhaust(id), 1, 'Exhaust');
});

both('alley_domino_hit', up => {
  const id = 'alley_domino_hit', n = v(up, 6, 9);
  const g = G({ deck: [id], up: U(up, id), pests: [{ id: 't_dummy', floor: 0, hp: n }, { id: 't_dummy', floor: 0, hp: 40 }] });
  g.S.zoomies = 3;
  ok(g.play(id, g.pestUid(0, 0), true).ok, 'plays');
  eq(g.pests(0).length, 1, 'killed');
  eq(g.S.zoomies, 3 - 1 + 2, 'gain 2 Zoomies');
  eq(g.inHand(id), 1, 'a new Domino Hit is in hand');
  eq(g.inExhaust(id), 1, 'the played one exhausts');
  ok(g.play(id, g.pestUid(0, 0), true).ok, 'and the copy can be played');
  eq(g.pest(0, 0).hp, 40 - n, 'no kill: damage only, and the created copy is in the same upgraded state (' + n + ' damage)');
  eq(g.inHand(id), 0, 'no further copy without a kill');
});

both('alley_void_the_warranty', up => {
  const id = 'alley_void_the_warranty', dmg = v(up, 4, 5), cl = v(up, 1, 2);
  const g = G({ deck: [id, 't_pow'], up: U(up, id), pests: [{ id: 't_dummy', floor: 0, hp: 100 }] });
  g.deploy('t_pow', 0);
  const c = g.cat(0, 0);
  g.setLives(c, 4, 6);
  ok(g.play(id, g.catT(c)).ok, 'plays');
  eq(c.lives, 1, 'Spend all but 1 Life');
  eq(g.pest(0, 0).hp, 100 - 3 * dmg, 'damage per Life spent');
  eq(c.statuses.claws, 3 * cl, 'Claws per Life spent');
  eq(g.inExhaust(id), 1, 'Exhaust');
  // on a 1 Life cat: nothing is spent and nothing is dealt
  const g2 = G({ deck: [id, 't_pow'], up: U(up, id), pests: [{ id: 't_dummy', floor: 0, hp: 100 }] });
  g2.deploy('t_pow', 0); g2.setLives(g2.cat(0, 0), 1, 6);
  g2.play(id, g2.catT(g2.cat(0, 0)));
  eq([g2.pest(0, 0).hp, g2.cat(0, 0).statuses.claws || 0], [100, 0], 'a 1 Life cat spends nothing and yields nothing');
});

/* ============================= ALLEY: TOYS ============================= */
both('alley_shredded_armchair', up => {
  const id = 'alley_shredded_armchair', g = G({ deck: [id, 't_pow'], up: U(up, id) });
  g.deploy('t_pow', 0); g.deploy('t_pow', 1);
  ok(g.play(id, { floor: 0 }).ok, 'placed on the Cellar');
  eq(g.floor(0).rooms.length, 1, 'occupies a room slot');
  g.end();
  eq([g.cat(0, 0).statuses.claws, g.cat(1, 0).statuses.claws || 0], [v(up, 1, 2), 0], 'End of your turn: a random Cat here gains Claws');
});

both('alley_dented_bin_lid', up => {
  const id = 'alley_dented_bin_lid', g = G({ deck: [id, 't_pow'], up: U(up, id), pests: [{ id: 't_dummy', floor: 0, hp: 40 }, { id: 't_dummy', floor: 1, hp: 40 }] });
  g.S.zoomies = 1;
  ok(g.play(id, { floor: 0 }, true).ok, 'cost ' + v(up, 1, 0));
  eq(g.S.zoomies, v(up, 0, 1), 'upgrade costs 0');
  g.deploy('t_pow', 0);
  eq(g.cat(0, 0).kw.pounce, 1, 'Cats deployed here gain Pounce 1');
  eq(g.pest(0, 0).hp, 40 - 3, 'and Pounce on deploy');
  g.deploy('t_pow', 1);
  eq(g.cat(1, 0).kw.pounce || 0, 0, 'other floors do not');
});

both('alley_welcome_mat', up => {
  const id = 'alley_welcome_mat', n = v(up, 2, 4);
  const g = G({ deck: [id, 't_pow'], up: U(up, id), pests: [{ id: 't_dummy', floor: 0, hp: 40 }] });
  g.play(id, { floor: 1 });
  g.end();
  eq(g.pests(1).length, 1, 'the pest climbed to the Parlor');
  eq(g.pest(1, 0).hp, 40 - n, 'Whenever an enemy enters this floor, it takes damage');
});

both('alley_gutter_gym', up => {
  const id = 'alley_gutter_gym', g = G({ deck: [id, 't_pow'], up: U(up, id) });
  g.deploy('t_pow', 0);
  eq(g.atk(g.cat(0, 0)), 2, 'baseline');
  g.play(id, { floor: 0 });
  eq(g.atk(g.cat(0, 0)), 3, 'Cats here have +1 Attack');
  g.deploy('t_pow', 0);
  eq(g.cats(0).map(c => c.statuses.claws || 0), [0, v(up, 1, 2)], 'Cats deployed here gain Claws (the old cat does not)');
  g.deploy('t_pow', 1);
  eq(g.atk(g.cat(1, 0)), 2, 'other floors get nothing');
});

both('alley_grindstone', up => {
  const id = 'alley_grindstone', g = G({ deck: [id, 't_pow'], up: U(up, id), pests: [{ id: 't_dummy', floor: 0, hp: 80 }] });
  g.deploy('t_pow', 0); g.deploy('t_pow', 0); g.deploy('t_pow', 1);
  g.S.zoomies = 2;
  ok(g.play(id, { floor: 0 }, true).ok, 'cost');
  eq(g.S.zoomies, v(up, 0, 1), 'upgrade costs 1');
  g.end();
  eq(g.cats(0).map(c => c.statuses.claws || 0), [1, 1], 'each Cat here that attacks gains 1 Claws (once per Cat)');
  eq(g.cat(1, 0).statuses.claws || 0, 0, 'other floors do not');
});

both('alley_back_alley_ring', up => {
  const id = 'alley_back_alley_ring', n = v(up, 1, 2), g = G({ deck: [id, 't_pow'], up: U(up, id) });
  g.deploy('t_pow', 0); g.deploy('t_pow', 0); g.deploy('t_pow', 1);
  g.play(id, { floor: 0 });
  g.end();
  eq(g.cats(0).map(c => c.statuses.frenzy || 0).concat(g.cats(1).map(c => c.statuses.frenzy || 0)), [n, n, 0], 'Start of your turn: every Cat here gains Frenzy');
});

both('alley_springy_sofa', up => {
  const id = 'alley_springy_sofa', g = G({ deck: [id, 't_pow'], up: U(up, id), pests: [{ id: 't_dummy', floor: 0, hp: 40 }] });
  g.play(id, { floor: 0 });
  g.deploy('t_pow', 0);
  eq(g.cat(0, 0).kw.pounce, v(up, 2, 3), 'Cats deployed here gain Pounce');
  eq(g.pest(0, 0).hp, 40 - (2 + v(up, 2, 3)), 'and use it');
});

both('alley_gutter_throne', up => {
  const id = 'alley_gutter_throne', n = v(up, 2, 3), g = G({ deck: [id, 't_pow'], up: U(up, id) });
  g.deploy('t_pow', 0); g.deploy('t_pow', 0); g.deploy('t_pow', 1);
  g.play(id, { floor: 0 });
  eq(g.cats(0).map(c => g.atk(c)), [5, 5], 'Cats here have +2 Attack (plus 1 Snug from the Pile of 2)');
  eq(g.atk(g.cat(1, 0)), 2, 'other floors do not');
  g.end();
  eq(g.cats(0).map(c => c.statuses.claws), [n, n], 'all Cats here gain Claws');
  eq(g.cats(0).map(c => c.lives).sort(), [5, 6], 'one random Cat here spent a Life');
  eq(g.cat(1, 0).lives, 6, 'not on other floors');
});

/* ============================= HEARTH: CAT UNITS ============================= */
both('hearth_sleepy_calico', up => {
  const id = 'hearth_sleepy_calico', g = G({ deck: [id], up: U(up, id) });
  g.deploy(id, 0);
  const c = g.cat(0, 0);
  eq([c.napping, c.statuses.rested], [true, v(up, 1, 2)], 'Deploy: Naps and gains Rested');
  eq(c.maxHealth, v(up, 5, 7), 'health');
});

both('hearth_biscuit_baker', up => {
  const id = 'hearth_biscuit_baker', n = v(up, 1, 2), g = G({ deck: [id, 't_pow'], up: U(up, id) });
  g.deploy('t_pow', 0); g.deploy(id, 0); g.deploy('t_pow', 0);
  g.end();
  eq(g.cats(0).map(c => c.maxHealth), [30 + n, 5, 30 + n], 'adjacent Cats gain Health for the fight, Baker does not');
  eq(g.cats(0).map(c => c.health), [30 + n, 5, 30 + n], 'and the current health rises too');
});

both('hearth_porch_tabby', up => {
  const id = 'hearth_porch_tabby', g = G({ deck: [id] , up: U(up, id) });
  g.deploy(id, 0);
  g.end();
  const purrEv = g.ev.filter(e => e.type === 'purr' && e.floor === 0).map(e => e.total);
  eq(purrEv[0], v(up, 1, 2), 'Purr N: adds Purr to the floor each turn end');
});

both('hearth_lap_squatter', up => {
  const id = 'hearth_lap_squatter', g = G({ deck: [id, 't_pow'], up: U(up, id), noPile: true });
  g.deploy(id, 0);
  eq(g.atk(g.cat(0, 0)), 3, 'alone');
  g.deploy('t_pow', 0, 0);
  eq(g.atk(g.cat(0, 1)), 4, '+1 Power per adjacent Cat (one neighbor)');
  g.deploy('t_pow', 0);
  eq(g.atk(g.cat(0, 1)), 5, 'two neighbors');
  eq(g.cat(0, 1).maxHealth, v(up, 6, 8), 'health');
});

both('hearth_fluff_ball', up => {
  const id = 'hearth_fluff_ball', g = G({ deck: [id], up: U(up, id) });
  g.deploy(id, 0);
  eq(g.cat(0, 0).fluff, v(up, 4, 6), 'Deploy: gain Fluff');
});

both('hearth_sleepy_kitten', up => {
  const id = 'hearth_sleepy_kitten', n = v(up, 3, 5), g = G({ deck: [id, 't_pow'], up: U(up, id) });
  g.deploy('t_pow', 0); g.deploy('t_pow', 0); g.deploy('t_pow', 0);
  g.dmgAll(0, 10);
  g.S.zoomies = 0;
  ok(g.play(id, { floor: 0, pos: 1 }, true).ok, 'costs 0');
  eq(g.cats(0).map(c => c.health), [20 + n, 3, 20 + n, 20], 'adjacent Cats are healed, the far one is not');
  eq(g.cat(0, 1).id, id, 'the kitten itself sits in the middle');
});

both('hearth_granny_whiskers', up => {
  const id = 'hearth_granny_whiskers', n = v(up, 2, 3), g = G({ deck: [id, 't_pow'], up: U(up, id), noPile: true });
  g.deploy('t_pow', 0); g.deploy(id, 0); g.deploy('t_pow', 1);
  g.cats(0).forEach(c => { c.health = c.maxHealth - 5; }); g.cat(1, 0).health = 20;
  g.end();
  eq(g.cat(0, 0).health, 25 + n, 'End of your turn: heal other Cats on this floor');
  eq(g.cat(0, 1).health, g.cat(0, 1).maxHealth - 5, 'not herself');
  eq(g.cat(1, 0).health, 20, 'not other floors');
});

both('hearth_pillow_bruiser', up => {
  const id = 'hearth_pillow_bruiser', n = v(up, 4, 6);
  const g = G({ deck: [id, 'hearth_lullaby'], up: U(up, id), hands: [[]], pests: [{ id: 't_dummy', floor: 0, hp: 40 }], noPile: true });
  g.deploy(id, 0);
  g.play('hearth_lullaby', g.catT(g.cat(0, 0)));
  g.end();
  const c = g.cat(0, 0);
  ok(c.napping, 'asleep');
  const rested = c.statuses.rested;
  eq(c.fluff, 0, 'no Fluff yet');
  ok(g.B.toggleNap(c.uid).ok, 'wake it');
  eq(c.fluff, n, 'Stretch: gain Fluff');
  eq(g.pest(0, 0).hp, 40 - (3 + 3 * rested), 'the Stretch hit for Power + 3 per Rested');
});

both('hearth_dozing_tom', up => {
  const id = 'hearth_dozing_tom', g = G({ deck: [id, 'hearth_lullaby'], up: U(up, id) });
  g.deploy(id, 0);
  g.play('hearth_lullaby', g.catT(g.cat(0, 0)));
  eq(g.cat(0, 0).fluff, v(up, 2, 3), 'Whenever this Naps, gain Fluff');
});

both('hearth_warm_belly', up => {
  const id = 'hearth_warm_belly', g = G({ deck: [id], up: U(up, id) });
  g.deploy(id, 0);
  eq(g.purr(0), 3, 'Deploy: add 3 Purr to this floor');
  eq(g.cat(0, 0).kw.purr, v(up, 2, 3), 'Purr N keyword');
  g.end();
  eq(g.ev.filter(e => e.type === 'purr' && e.floor === 0)[0].total, 3 + v(up, 2, 3), 'Purr N adds each turn end');
});

both('hearth_cuddle_captain', up => {
  const id = 'hearth_cuddle_captain', n = v(up, 1, 2), g = G({ deck: [id, 't_pow'], up: U(up, id) });
  g.deploy(id, 0); g.deploy('t_pow', 0);
  eq(g.atk(g.cat(0, 1)), 2 + 1, 'pile of 2: only Snug');
  g.deploy('t_pow', 0);
  eq(g.cat(0, 0).id, id, 'order check');
  eq(g.cats(0).map(c => g.atk(c)), [2 + 1, 2 + 1 + n, 2 + 1 + n], 'pile of 3: other Cats get +Power from the Captain (Captain only Snug)');
});

both('hearth_sleep_talker', up => {
  const id = 'hearth_sleep_talker', g = G({ deck: [id, 'hearth_lullaby'], up: U(up, id), noPile: true, fill: 20 });
  g.deploy(id, 0);
  g.S.zoomies = 4;
  ok(g.play('hearth_lullaby', g.catT(g.cat(0, 0)), true).ok, 'put it to sleep');
  g.end();
  eq(g.S.hand.length, 6, 'Start of your turn: if Napping, draw 1 card (5 + 1)');
  const g2 = G({ deck: [id], up: U(up, id), noPile: true, fill: 20 });
  g2.deploy(id, 0); g2.end();
  eq(g2.S.hand.length, 5, 'awake: no extra draw');
  const inst = SB.cardInst.make(id); if (up) inst.scratches.push('plus');
  eq(SB.cardInst.effective(inst).cost, v(up, 2, 1), 'cost');
});

both('hearth_snooze_tabby', up => {
  const id = 'hearth_snooze_tabby', n = v(up, 1, 2);
  const g = G({ deck: [id, 'hearth_lullaby'], up: U(up, id), pests: [{ id: 't_dummy', floor: 0, hp: 60 }], noPile: true });
  g.deploy(id, 0);
  g.play('hearth_lullaby', g.catT(g.cat(0, 0)));
  g.end();
  const c = g.cat(0, 0);
  const rested = c.statuses.rested;
  ok(c.napping && rested >= 2, 'asleep with Rested ' + rested);
  ok(g.B.toggleNap(c.uid).ok, 'wake');
  eq(g.pest(0, 0).hp, 60 - (2 + 3 * rested), 'Stretch hit');
  eq([c.napping, c.statuses.rested], [true, n], 'Stretch: Naps again with Rested');
});

T('hearth_rude_wake_stretch_only', () => {
  [false, true].forEach(up => {
    ['hearth_snooze_tabby', 'hearth_pillow_bruiser'].forEach(id => {
      const g = G({ deck: [id, 'hearth_lullaby'], up: U(up, id), noPile: true, pests: [{ id: 't_biter', floor: 0 }] });
      g.deploy(id, 0);
      g.play('hearth_lullaby', g.catT(g.cat(0, 0)));
      g.end();
      const c = g.cat(0, 0);
      eq([c.napping, c.fluff], [false, 0], id + ': a Rude Awakening is not a Stretch (no Fluff, no new Nap)');
    });
  });
});

both('hearth_cushion_matron', up => {
  const id = 'hearth_cushion_matron', n = v(up, 2, 3), g = G({ deck: [id, 't_pow'], up: U(up, id), hands: [['t_pow']] });
  g.deploy(id, 0); g.deploy('t_pow', 0);
  g.end();
  eq(g.cats(0).map(c => c.fluff), [0, 0], 'pile of 2: nothing');
  g.deploy('t_pow', 0);
  g.end();
  eq(g.cats(0).map(c => c.fluff), [n, n, n], 'In a Pile of 3 or more, all Cats here gain Fluff');
});

both('hearth_idle_engine', up => {
  const id = 'hearth_idle_engine', g = G({ deck: [id, 't_pow'], up: U(up, id), noPile: true });
  g.deploy(id, 0); g.deploy('t_pow', 0); g.deploy('t_pow', 0);
  g.end();
  eq(g.ev.filter(e => e.type === 'purr' && e.floor === 0)[0].total, 3 + v(up, 0, 1), 'Purr equal to the Cats on the floor (plus 1 upgraded)');
});

both('hearth_dough_paws', up => {
  const id = 'hearth_dough_paws', g = G({ deck: [id, 'hearth_lullaby'], up: U(up, id) });
  g.deploy(id, 0);
  const c = g.cat(0, 0);
  g.play('hearth_lullaby', g.catT(c));
  eq([c.buffs.power, c.maxHealth], [1, 5 + v(up, 2, 3)], 'Whenever this Naps, gain Power and Health for the fight');
  eq(g.atk(c), 2, 'Power shows in Attack');
});

both('hearth_big_mama', up => {
  const id = 'hearth_big_mama', n = v(up, 2, 3), g = G({ deck: [id, 't_pow'], up: U(up, id) });
  g.deploy(id, 0);
  eq(g.cat(0, 0).size, 2, 'Large');
  g.deploy('t_pow', 0);
  eq(g.B.pileSizeOf(g.cat(0, 1)), 3, 'Counts as 2 Cats for Pile size (2 cats = pile of 3)');
  g.deploy('t_pow', 0);
  eq(g.B.pileSizeOf(g.cat(0, 0)), 4, 'Mama + 2 Cats is a Heap');
  g.cats(0).forEach(c => { c.health = c.maxHealth - 10; });
  g.end();
  // Dusk: pile heal 1 (pile >= 3) + Mama heals others
  eq(g.cat(0, 1).health, 20 + 1 + n, 'Dusk: heal other Cats here (plus the Pile heal)');
  eq(g.cat(0, 0).health, v(up, 13, 16) - 10 + 1, 'Mama gets only the Pile heal');
  eq(g.cat(0, 1).fluff, 2, 'a Heap gives +2 Fluff');
});

both('hearth_sir_floofington', up => {
  const id = 'hearth_sir_floofington', d = v(up, 3, 2), g = G({ deck: [id], up: U(up, id), noPile: true, pests: [{ id: 't_dummy', floor: 0, hp: 100 }] });
  g.deploy(id, 0);
  const c = g.cat(0, 0);
  eq(c.fluff, 6, 'Deploy: Fluff 6');
  eq(g.atk(c), 1 + Math.floor(6 / d), '+1 Power per 3 Fluff (2 upgraded)');
  g.end();
  eq(c.fluff, 8, 'End of your turn: Fluff 2');
  eq(g.atk(c), 1 + Math.floor(8 / d), 'grows');
});

both('hearth_old_mortimer', up => {
  const id = 'hearth_old_mortimer', m = v(up, 1, 2);
  const g = G({ deck: [id], up: U(up, id), noPile: true, pests: [{ id: 't_biter', floor: 0 }] });
  g.deploy(id, 0);
  const c = g.cat(0, 0);
  ok(c.napping, 'Deploy: Naps');
  eq(c.maxHealth, v(up, 11, 14), 'health');
  g.end();
  ok(c.napping, 'Deep Sleeper: a pest hit does not wake it');
  eq(c.statuses.rested, 2, 'Rested +2 per round with Deep Sleep');
  eq(g.purr(0), m * 2, 'Dusk: add Purr equal to Rested (or twice, upgraded)');
  g.end(); g.end();
  eq(c.statuses.rested, 6, 'Rested max 6');
  g.end();
  eq(c.statuses.rested, 6, 'and no more');
  ok(c.napping, 'still asleep');
});

both('hearth_mother_rumble', up => {
  const id = 'hearth_mother_rumble', div = v(up, 5, 4), g = G({ deck: [id, 't_pow'], up: U(up, id), noPile: true });
  g.deploy(id, 0); g.deploy('t_pow', 0);
  eq(g.cat(0, 1).kw.purr || 0, 0, 'control');
  eq(g.atk(g.cat(0, 1)), 2, 'no Purr yet');
  g.B.addFloorStatus(0, 'purr', 10);
  eq(g.atk(g.cat(0, 1)), 2 + Math.floor(10 / div), 'Cats here have +1 Power per 5 Purr');
  eq(g.atk(g.cat(0, 0)), 2 + Math.floor(10 / div), 'Rumble herself too');
  eq(g.cat(0, 0).kw.purr, v(up, 2, 3), 'Purr N');
});

/* ============================= HEARTH: SPELLS ============================= */
both('hearth_lullaby', up => {
  const id = 'hearth_lullaby', g = G({ deck: [id, 't_pow'], up: U(up, id) });
  g.deploy('t_pow', 0);
  const c = g.cat(0, 0); c.health = 10;
  ok(g.play(id, g.catT(c)).ok, 'plays on a Cat deployed this turn');
  eq([c.napping, c.statuses.rested, c.health], [true, v(up, 2, 3), 10 + v(up, 2, 4)], 'Naps, Rested, heals');
});

both('hearth_tuck_in', up => {
  const id = 'hearth_tuck_in', g = G({ deck: [id, 't_pow'], up: U(up, id) });
  g.deploy('t_pow', 0);
  const c = g.cat(0, 0); c.health = 10;
  g.play(id, g.catT(c));
  eq([c.health, c.fluff], [10 + v(up, 4, 6), v(up, 4, 6)], 'Heal and Fluff');
});

both('hearth_stoke_radiator', up => {
  const id = 'hearth_stoke_radiator', g = G({ deck: [id] , up: U(up, id) });
  g.play(id, { floor: 1 });
  eq([g.purr(0), g.purr(1), g.purr(2)], [0, v(up, 4, 6), 0], 'Add Purr to a floor');
});

both('hearth_fluff_up', up => {
  const id = 'hearth_fluff_up', g = G({ deck: [id, 't_pow'], up: U(up, id) });
  g.deploy('t_pow', 0); g.deploy('t_pow', 0); g.deploy('t_pow', 1);
  g.play(id, { floor: 0 });
  eq([g.cat(0, 0).fluff, g.cat(0, 1).fluff, g.cat(1, 0).fluff], [v(up, 3, 5), v(up, 3, 5), 0], 'Cats on a floor gain Fluff');
});

both('hearth_cozy_swat', up => {
  const id = 'hearth_cozy_swat', g = G({ deck: [id, 't_pow'], up: U(up, id), pests: [{ id: 't_dummy', floor: 0, hp: 40 }] });
  g.deploy('t_pow', 0); g.deploy('t_pow', 2);
  g.cat(0, 0).health = 10; g.cat(2, 0).health = 10;
  g.play(id, g.pestUid(0, 0));
  eq(g.pest(0, 0).hp, 40 - v(up, 3, 5), 'Deal damage');
  eq([g.cat(0, 0).health, g.cat(2, 0).health], [10 + v(up, 1, 2), 10 + v(up, 1, 2)], 'Heal all Cats');
});

both('hearth_second_breakfast', up => {
  const id = 'hearth_second_breakfast', g = G({ deck: [id, 't_pow'], up: U(up, id) });
  g.deploy('t_pow', 0);
  const c = g.cat(0, 0); c.health = 10;
  const h0 = g.S.hand.length;
  g.S.zoomies = 0;
  ok(g.play(id, g.catT(c), true).ok, 'costs 0');
  eq(c.health, 10 + v(up, 3, 5), 'Heal');
  eq(g.S.hand.length, h0 - 1 + 1, 'Draw 1');
  eq(g.inExhaust(id), 1, 'Exhaust');
});

both('hearth_alarm_clock', up => {
  const id = 'hearth_alarm_clock', g = G({ deck: [id, 't_pow', 'hearth_lullaby', 'hearth_lullaby', 'hearth_lullaby'], up: U(up, id), noPile: true, pests: [{ id: 't_dummy', floor: 0, hp: 100 }] });
  g.deploy('t_pow', 0); g.deploy('t_pow', 0); g.deploy('t_pow', 1);
  g.play('hearth_lullaby', g.catT(g.cat(0, 0)));
  g.play('hearth_lullaby', g.catT(g.cat(0, 1)));
  g.play('hearth_lullaby', g.catT(g.cat(1, 0)));
  g.S.zoomies = 1;
  ok(g.play(id, { floor: 0 }, true).ok, 'cost');
  eq(g.S.zoomies, v(up, 0, 1), 'upgrade costs 0');
  eq(g.cats(0).map(c => c.napping), [false, false], 'wakes every Napping Cat on the floor');
  eq(g.cat(1, 0).napping, true, 'other floors keep sleeping');
  eq(g.pest(0, 0).hp, 100 - 2 * (2 + 3 * 2), 'both Stretch now: Power + 3 per Rested');
  eq(g.cat(0, 0).buffs.power, 1, 'the wake grants +1 Attack per 2 Rested');
});

both('hearth_naptime', up => {
  const id = 'hearth_naptime', g = G({ deck: [id, 't_pow'], up: U(up, id) });
  g.deploy('t_pow', 0); g.deploy('t_pow', 0); g.deploy('t_pow', 1);
  g.play(id, { floor: 0 });
  eq(g.cats(0).map(c => [c.napping, c.statuses.rested]), [[true, v(up, 1, 2)], [true, v(up, 1, 2)]], 'All Cats on a floor Nap and gain Rested');
  eq(g.cat(1, 0).napping, false, 'other floors do not');
});

both('hearth_warm_lap', up => {
  const id = 'hearth_warm_lap', g = G({ deck: [id, 't_pow', 'hearth_naptime'], up: U(up, id), noPile: true });
  g.deploy('t_pow', 0); g.deploy('t_pow', 0);
  g.play('hearth_naptime', { floor: 0 });
  g.B.addStatus(g.cat(0, 0), 'rested', 2);
  g.play(id, { floor: 0 });
  eq(g.purr(0), v(up, 1, 2) * 4, 'Purr equal to the Rested on the floor (3 + 1)');
  eq(g.cats(0).map(c => c.statuses.rested), [3, 1], 'Rested stays');
});

both('hearth_group_hug', up => {
  const id = 'hearth_group_hug', k = v(up, 2, 3), g = G({ deck: [id, id, 't_pow', 'hearth_family_portrait'], up: U(up, id) });
  g.deploy('t_pow', 0); g.deploy('t_pow', 0); g.deploy('t_pow', 0); g.deploy('t_pow', 1);
  g.play(id, { floor: 0 });
  eq(g.cats(0).map(c => c.fluff), [3 * k, 3 * k, 3 * k], 'Fluff equal to Pile size times N');
  eq(g.cat(1, 0).fluff, 0, 'other floors do not');
  g.play('hearth_family_portrait', { floor: 0 });
  g.play(id, { floor: 0 });
  eq(g.cats(0).map(c => c.fluff), [3 * k + 4 * k, 3 * k + 4 * k, 3 * k + 4 * k], 'with the Portrait a Pile of 3 acts as 4');
});

both('hearth_purr_crescendo', up => {
  const id = 'hearth_purr_crescendo', g = G({ deck: [id], up: U(up, id) });
  g.B.addFloorStatus(0, 'purr', 6);
  g.play(id, { floor: 0 });
  eq(g.purr(0), 12, 'Double the Purr');
});

T('hearth_purr_crescendo_cap', () => {
  [false, true].forEach(up => {
    const id = 'hearth_purr_crescendo', cap = v(up, 10, 16);
    const g = G({ deck: [id], up: U(up, id) });
    g.B.addFloorStatus(0, 'purr', 20);
    g.play(id, { floor: 0 });
    eq(g.purr(0), 20 + cap, 'adds at most ' + cap);
  });
});

both('hearth_sunny_spot', up => {
  const id = 'hearth_sunny_spot', g = G({ deck: [id, 't_pow', 'hearth_naptime', 'hearth_naptime'], up: U(up, id) });
  g.deploy('t_pow', 0); g.deploy('t_pow', 1); g.deploy('t_pow', 2);
  g.play('hearth_naptime', { floor: 0 }); g.play('hearth_naptime', { floor: 1 }) ;
  g.S.sunbeam.warmth = 20;
  g.play(id);
  eq(g.S.sunbeam.warmth, 20 + v(up, 2, 3) + 2, 'Heal the Sunbeam N plus 1 per Napping Cat');
});

both('hearth_nap_economy', up => {
  const id = 'hearth_nap_economy', g = G({ deck: [id, 't_pow', 'hearth_lullaby', 'hearth_lullaby'], up: U(up, id) });
  g.deploy('t_pow', 0); g.deploy('t_pow', 1);
  g.S.sunbeam.warmth = 20;
  g.S.zoomies = 2;
  ok(g.play(id, {}, true).ok, 'cost');
  eq(g.S.zoomies, v(up, 0, 1), 'upgrade costs 1');
  eq(g.inExhaust(id), 1, 'Exhaust');
  g.play('hearth_lullaby', g.catT(g.cat(1, 0)));
  eq([g.purr(1), g.purr(0), g.S.sunbeam.warmth], [2, 0, 21], 'whenever a Cat Naps: 2 Purr to its floor, heal the Sunbeam 1');
  g.play('hearth_lullaby', g.catT(g.cat(0, 0)));
  eq([g.purr(1), g.purr(0), g.S.sunbeam.warmth], [2, 2, 22], 'and again for another floor');
});

both('hearth_hibernation', up => {
  const id = 'hearth_hibernation', g = G({ deck: [id, 't_pow'], up: U(up, id) });
  g.deploy('t_pow', 0); g.deploy('t_pow', 1); g.deploy('t_pow', 2);
  g.S.sunbeam.warmth = 20; g.S.zoomies = 3;
  ok(g.play(id, {}, true).ok, 'cost');
  eq(g.S.zoomies, v(up, 0, 1), 'upgrade costs 2');
  eq([g.cat(0, 0), g.cat(1, 0), g.cat(2, 0)].map(c => [c.napping, c.statuses.rested]), [[true, 2], [true, 2], [true, 2]], 'All Cats Nap and gain Rested 2');
  eq(g.S.sunbeam.warmth, 26, 'Heal the Sunbeam 2 per Napping Cat');
  eq(g.inExhaust(id), 1, 'Exhaust');
});

/* ============================= HEARTH: TOYS ============================= */
both('hearth_sunny_cushion', up => {
  const id = 'hearth_sunny_cushion', g = G({ deck: [id], up: U(up, id) });
  g.play(id, { floor: 2 });
  g.end();
  eq(g.ev.filter(e => e.type === 'status' && e.side === 'floor' && e.status === 'purr' && e.amount > 0).map(e => [e.floor, e.amount]), [[2, v(up, 3, 4)]], 'End of your turn: add Purr to this floor');
});

both('hearth_treat_bowl', up => {
  const id = 'hearth_treat_bowl', g = G({ deck: [id, 't_pow'], up: U(up, id) });
  g.play(id, { floor: 0 });
  g.deploy('t_pow', 0); g.deploy('t_pow', 1);
  eq([g.cat(0, 0).fluff, g.cat(1, 0).fluff], [v(up, 2, 3), 0], 'Cats deployed here gain Fluff');
  // a freshly deployed Cat is at full health, so exercise the heal by firing the trigger on a hurt Cat
  const hurt = g.cat(0, 0); hurt.health = 10;
  g.B.fire('onCatDeployed', { subject: hurt, floor: 0 }); g.B.drain();
  eq(hurt.health, 10 + v(up, 3, 4), 'Cats deployed here heal');
});

both('hearth_treat_bowl (heal reaches a hurt cat when the deployed one is at full health)', up => {
  const id = 'hearth_treat_bowl', g = G({ deck: [id, 't_pow'], up: U(up, id) });
  g.deploy('t_pow', 0);
  const hurt = g.cat(0, 0); hurt.health = 10;
  g.play(id, { floor: 0 });
  g.deploy('t_pow', 0);
  eq(hurt.health, 10 + v(up, 3, 4), 'the Treat Bowl heal goes to the most hurt cat on the floor');
  eq(g.cats(0).length, 2, 'both cats stand on the floor');
});

both('hearth_wool_blanket', up => {
  const id = 'hearth_wool_blanket', g = G({ deck: [id, 't_pow'], up: U(up, id), noPile: true });
  g.deploy('t_pow', 0); g.deploy('t_pow', 0); g.deploy('t_pow', 1);
  g.play(id, { floor: 0 });
  g.end();
  eq([g.cat(0, 0).fluff, g.cat(0, 1).fluff, g.cat(1, 0).fluff], [v(up, 1, 2), v(up, 1, 2), 0], 'End of your turn: Cats here gain Fluff');
});

both('hearth_heated_blanket', up => {
  const id = 'hearth_heated_blanket', n = v(up, 2, 3), g = G({ deck: [id, 't_pow'], up: U(up, id), hands: [['t_pow']] });
  g.deploy('t_pow', 0); g.deploy('t_pow', 0);
  g.play(id, { floor: 0 });
  g.cats(0).forEach(c => { c.health = 10; });
  g.end();
  eq(g.cats(0).map(c => c.health), [10, 10], 'a Pile of 2 gets nothing');
  g.deploy('t_pow', 0);
  g.cats(0).forEach(c => { c.health = 10; });
  g.end();
  eq(g.cats(0).map(c => c.health), [10 + 1 + n, 10 + 1 + n, 10 + 1 + n], 'Dusk: Cats in a Pile of 3 or more heal (on top of the Pile heal)');
});

both('hearth_hammock', up => {
  const id = 'hearth_hammock', n = v(up, 1, 2), g = G({ deck: [id, 't_pow', 'hearth_lullaby'], up: U(up, id), noPile: true, pests: [{ id: 't_biter', floor: 0 }] });
  g.deploy('t_pow', 0);
  g.play(id, { floor: 0 });
  const c = g.cat(0, 0);
  g.play('hearth_lullaby', g.catT(c));
  eq([c.napping, c.statuses.rested], [true, 2 + n], 'whenever a Cat here Naps it gains Rested extra');
  g.end();
  ok(c.napping, 'Cats here are never Rudely Awakened');
  ok(g.ev.some(e => e.type === 'damage' && e.uid === c.uid && e.amount > 0), 'although the Biter did hit it');
});

both('hearth_family_portrait', up => {
  const id = 'hearth_family_portrait', g = G({ deck: [id, 't_pow'], up: U(up, id) });
  g.deploy('t_pow', 0); g.deploy('t_pow', 0);
  eq(g.B.pileSizeOf(g.cat(0, 0)), 2, 'pile of 2');
  g.S.zoomies = 2;
  ok(g.play(id, { floor: 0 }, true).ok, 'cost');
  eq(g.S.zoomies, v(up, 0, 1), 'upgrade costs 1');
  eq(g.B.pileSizeOf(g.cat(0, 0)), 3, 'Piles on this floor count as 1 Cat larger');
  g.deploy('t_pow', 1); g.deploy('t_pow', 1);
  eq(g.B.pileSizeOf(g.cat(1, 0)), 2, 'other floors do not');
});

both('hearth_hearth_rug', up => {
  const id = 'hearth_hearth_rug', n = v(up, 2, 3), g = G({ deck: [id, 't_pow'], up: U(up, id), hands: [['t_pow']] });
  for (let i = 0; i < 3; i++) g.deploy('t_pow', 0);
  g.play(id, { floor: 0 });
  g.cats(0).forEach(c => { c.health = 10; });
  g.end();
  eq(g.cats(0).map(c => [c.health, c.fluff]), [[11, 0], [11, 0], [11, 0]], 'no Heap of 4: only the Pile heal');
  g.deploy('t_pow', 0);
  g.cats(0).forEach(c => { c.health = 10; });
  g.end();
  eq(g.cats(0).map(c => [c.health, c.fluff]), [0, 1, 2, 3].map(() => [10 + 1 + n, 2 + n]), 'Dusk: with a Heap each Cat gains Fluff and heals more');
});

both('hearth_fireplace', up => {
  const id = 'hearth_fireplace', n = v(up, 3, 4), g = G({ deck: [id] , up: U(up, id) });
  g.play(id, { floor: 2 });
  g.S.sunbeam.warmth = 20;
  g.end();
  eq(g.ev.filter(e => e.type === 'status' && e.side === 'floor' && e.status === 'purr' && e.amount > 0).map(e => [e.floor, e.amount]), [[2, n]], 'End of your turn: add Purr here');
  eq(g.S.sunbeam.warmth, 20, 'under 10 Purr: no Sunbeam heal');
  const g2 = G({ deck: [id], up: U(up, id) });
  g2.play(id, { floor: 2 });
  g2.B.addFloorStatus(2, 'purr', 14); g2.S.sunbeam.warmth = 20;
  g2.end();
  ok(g2.S.sunbeam.warmth >= 20 + v(up, 1, 2), 'Dusk: with 10+ Purr, heal the Sunbeam (got ' + g2.S.sunbeam.warmth + ')');
});


/* ============================= the 4 loops of each clan, scripted in real combat ============================= */
// A round: every play must succeed with the real Zoomies budget (3 per turn, no top-ups), then the turn ends.
function playRound(g, plays, label) {
  eq(g.S.zoomies, 3, label + ': starts with 3 Zoomies');
  plays.forEach(pl => {
    const r = g.play(pl[0], pl[1] === undefined ? {} : (typeof pl[1] === 'function' ? pl[1]() : pl[1]), true);
    ok(r.ok, label + ': play ' + pl[0] + ' (' + (r.reason || 'ok') + ')');
  });
}
const loopTests = {};
function L(name, fn) { loopTests[name] = fn; }

L('alley loop 1: Claws Snowball', () => {
  const g = G({
    deck: ['alley_old_scratch', 'alley_grindstone', 'alley_sharpen', 'alley_dirty_fighting', 'alley_last_gasp_gus'],
    hand: ['alley_old_scratch'], hands: [['alley_grindstone', 'alley_sharpen'], ['alley_dirty_fighting', 'alley_last_gasp_gus']],
    pests: [{ id: 't_dummy', floor: 0, hp: 400 }, { id: 't_biter', floor: 0, hp: 400 }]
  });
  const dummy = g.pest(0, 0);
  playRound(g, [['alley_old_scratch', { floor: 0 }]], 'R1');
  const scratch = g.cat(0, 0);
  eq(scratch.statuses.claws, 2, 'R1: Deploy gives 2 Claws');
  g.end();
  eq(scratch.statuses.claws, 4, 'R1 end: the attack doubled Claws');
  eq(dummy.hp, 400 - (3 + 4), 'R1: the doubled Claws hit');
  playRound(g, [['alley_grindstone', { floor: 0 }], ['alley_sharpen', () => g.catT(scratch)]], 'R2');
  eq(scratch.statuses.claws, 6, 'R2: Sharpen adds 2');
  g.end();
  eq(scratch.statuses.claws, 13, 'R2 end: double (12) then Grindstone +1');
  eq(dummy.hp, 400 - 7 - (3 + 13), 'R2: hit for 3 + 13');
  playRound(g, [['alley_dirty_fighting', () => g.pestUid(0, 0)], ['alley_last_gasp_gus', { floor: 0 }]], 'R3');
  eq(dummy.hp, 400 - 7 - 16 - (3 + 13), 'R3: Dirty Fighting is 3 + highest Claws');
  g.end();
  ok(scratch.statuses.claws >= 27, 'R3 end: Claws keep snowballing (' + scratch.statuses.claws + ')');
  ok(!g.S.over, 'the fight is still on and the Cellar held');
});

L('alley loop 2: Pounce Chain', () => {
  const g = G({
    deck: ['alley_queen_of_the_zoomies', 'alley_gutter_kitten', 'alley_gutter_kitten', 'alley_smash_and_grab_gladys', 'alley_domino_hit', 'alley_cheap_shot'],
    pests: [{ id: 't_dummy', floor: 0, hp: 5 }, { id: 't_dummy', floor: 0, hp: 3 }, { id: 't_dummy', floor: 0, hp: 3 }, { id: 't_dummy', floor: 0, hp: 3 }, { id: 't_dummy', floor: 0, hp: 6 },
      { id: 't_dummy', floor: 1, hp: 6 }, { id: 't_dummy', floor: 1, hp: 2 }, { id: 't_dummy', floor: 2, hp: 400 }]
  });
  eq(g.S.zoomies, 3, 'start with 3 Zoomies');
  const trace = [g.S.zoomies];
  const step = (id, tgt) => { const r = g.play(id, tgt, true); ok(r.ok, 'play ' + id + ' (' + (r.reason || 'ok') + ')'); trace.push(g.S.zoomies); };
  step('alley_queen_of_the_zoomies', { floor: 0 });
  step('alley_gutter_kitten', { floor: 0 });
  step('alley_gutter_kitten', { floor: 0 });
  step('alley_smash_and_grab_gladys', { floor: 0 });
  eq(g.pests(0).length, 1, 'four Pounce kills in the Cellar');
  step('alley_domino_hit', g.pestUid(0, 0));
  eq(g.inHand('alley_domino_hit'), 1, 'Domino Hit came back');
  step('alley_domino_hit', g.pestUid(1, 0));
  step('alley_cheap_shot', g.pestUid(1, 0));
  eq(g.S.cardsPlayedThisTurn, 7, 'seven plays in one turn on 3 Zoomies');
  ok(Math.min.apply(null, trace) >= 0 && g.S.zoomies >= 3, 'Zoomies never ran dry and end at ' + g.S.zoomies + ' (trace ' + trace.join(',') + ')');
  eq(g.pests(0).length + g.pests(1).length, 0, 'both lower floors are clear');
  ok(g.S.hand.length >= 1, 'the draws refilled the hand');
});

L('alley loop 3: Cornered Cannon', () => {
  const g = G({
    deck: ['alley_barnaby_bad_idea', 'alley_cornered_connie', 'alley_spite_spurt', 'alley_collective_bad_idea', 'alley_dirty_fighting'],
    hand: ['alley_barnaby_bad_idea'], hands: [['alley_cornered_connie', 'alley_spite_spurt'], ['alley_collective_bad_idea', 'alley_dirty_fighting']],
    pests: [{ id: 't_dummy', floor: 0, hp: 600 }]
  });
  playRound(g, [['alley_barnaby_bad_idea', { floor: 0 }]], 'R1');
  const barn = g.cat(0, 0);
  g.end();
  eq([barn.lives, barn.statuses.claws], [3, 3], 'R1 end: a Life spent, 3 Claws');
  playRound(g, [['alley_cornered_connie', { floor: 0 }], ['alley_spite_spurt', () => g.catT(barn)]], 'R2');
  const connie = g.cat(0, 1);
  eq(connie.lives, 2, 'Connie spent a Life on deploy');
  eq([barn.lives, barn.statuses.claws], [2, 6], 'Spite Spurt: a Life for 3 Claws');
  g.end();
  eq([barn.lives, barn.statuses.claws], [1, 9], 'R2 end: Barnaby spends down to his last Life');
  ok(barn.lives === 1 && g.atk(barn) >= 3 + 2, 'Cornered gives him +2 Attack');
  const dummy = g.pest(0, 0), hp0 = dummy.hp;
  playRound(g, [['alley_collective_bad_idea'], ['alley_dirty_fighting', () => g.pestUid(0, 0)]], 'R3');
  eq([barn.lives, barn.statuses.claws, barn.statuses.frenzy], [1, 11, 1], 'Collective Bad Idea cannot take his last Life but still pays out');
  eq(connie.lives, 1, 'Connie goes to her last Life');
  eq(hp0 - dummy.hp, 3 + 11, 'Dirty Fighting cashes the Claws');
  g.end();
  ok(hp0 - dummy.hp > 3 + 11 + 40, 'the Claws cannon fires on the attack phase too (' + (hp0 - dummy.hp) + ')');
  ok(g.run.deck.filter(i => /^alley_/.test(i.id) && i.id !== 'alley_spite_spurt' && i.id !== 'alley_collective_bad_idea' && i.id !== 'alley_dirty_fighting').every(i => i.lives >= 1), 'nobody lost a Cat for good');
});

L('alley loop 4: Bait and Frenzy', () => {
  const g = G({
    deck: ['alley_tin_can_tom', 'alley_fence_walker', 'alley_back_alley_ring', 'alley_ragebait_ronnie', 'alley_brawl', 'alley_hurricane_hank', 't_tank'],
    hand: ['t_tank', 'alley_tin_can_tom', 'alley_fence_walker'],
    hands: [['alley_ragebait_ronnie'], ['alley_back_alley_ring', 'alley_brawl'], ['alley_hurricane_hank']],
    pests: [{ id: 't_dummy', floor: 0, hp: 900 }, { id: 't_nibble', floor: 0, hp: 900 }], noPile: true
  });
  g.play('t_tank', { floor: 0 }, true);
  playRound(g, [['alley_tin_can_tom', { floor: 0 }], ['alley_fence_walker', { floor: 0 }]], 'R1');
  eq(g.cats(0).map(c => c.id), ['t_tank', 'alley_tin_can_tom', 'alley_fence_walker'], 'tank up front, bait behind');
  g.end();
  const tank = g.cats(0)[0], tom = g.cats(0)[1], walker = g.cats(0)[2];
  eq(tank.health, 40, 'R1: the tank in front was ignored');
  eq([tom.health, tom.statuses.claws], [6 - 1, 1], 'R1: Rage-bait pulled the nibble onto Tom and paid 1 Claws');
  const swingsOf = u => g.ev.filter(e => e.type === 'attack' && e.uid === u.uid).length;
  const swings = () => swingsOf(walker);
  const s1 = swings();
  ok(s1 >= 2, 'R1: Fence Walker (Frenzy 1) swung twice (' + s1 + ')');
  playRound(g, [['alley_ragebait_ronnie', { floor: 0 }]], 'R2');
  const ron = g.cats(0)[3];
  eq(ron.id, 'alley_ragebait_ronnie', 'Ronnie joined, the floor is full');
  g.end();
  const tomClaws = tom.statuses.claws, tankClaws = tank.statuses.claws || 0;
  playRound(g, [['alley_back_alley_ring', { floor: 0 }], ['alley_brawl', { floor: 0 }]], 'R3');
  eq([tank.statuses.claws, ron.statuses.claws], [tankClaws + 2 + 1, 2], 'Brawl: 2 Claws each, and Ronnie taking damage gives the others 1 more');
  eq(tom.statuses.claws, tomClaws + 2 + 1, 'Tom too');
  g.end();
  const s2 = swingsOf(tank);
  ok(g.cats(0).every(c => (c.statuses.frenzy || 0) >= 1 || c.dead), 'Ring: every Cat starts the turn with Frenzy');
  playRound(g, [['alley_hurricane_hank', { floor: 1 }]], 'R4');
  g.end();
  ok(g.cat(1, 0).statuses.frenzy >= 1, 'Hank hands out Frenzy on his own floor');
  ok(swingsOf(tank) - s2 >= 2, 'Ring Frenzy: a Cat swings more than once per round (' + (swingsOf(tank) - s2) + ')');
  ok(!g.S.over, 'the floor held');
  eq(g.B.instByUid(tom.instUid).lives, 2, 'Tom paid one Life for the bait job');
});

/* ---------------------------------------- Hearth ---------------------------------------- */
const napPurrSum = g => g.floor(0).statuses.purr || 0;

L('hearth loop 1: Eternal Nap', () => {
  const g = G({
    deck: ['hearth_old_mortimer', 'hearth_sleepy_calico', 'hearth_hammock', 'hearth_sunny_spot', 'hearth_nap_economy', 'hearth_warm_lap', 'hearth_sleep_talker', 'hearth_lullaby', 'hearth_hibernation'],
    hand: ['hearth_old_mortimer', 'hearth_sleepy_calico'],
    hands: [['hearth_hammock', 'hearth_sunny_spot'], ['hearth_nap_economy', 'hearth_warm_lap'], ['hearth_sleep_talker', 'hearth_lullaby'], ['hearth_hibernation']],
    pests: [{ id: 't_biter', floor: 0, hp: 400 }], fill: 20
  });
  g.S.sunbeam.warmth = 30;
  playRound(g, [['hearth_old_mortimer', { floor: 0 }], ['hearth_sleepy_calico', { floor: 0 }]], 'R1');
  const mort = g.cat(0, 0), cal = g.cat(0, 1);
  g.end();
  ok(mort.napping, 'R1: Mortimer sleeps through the Biter');
  ok(g.ev.some(e => e.type === 'damage' && e.uid === mort.uid && e.amount > 0), 'and was actually hit');
  playRound(g, [['hearth_hammock', { floor: 0 }], ['hearth_sunny_spot']], 'R2');
  ok(g.S.sunbeam.warmth >= 30 + 2 + 2 || g.S.sunbeam.warmth === g.S.sunbeam.max, 'Sunny Spot healed the Sunbeam by 2 + 2 sleepers');
  g.end();
  const purrAfter2 = napPurrSum(g);
  playRound(g, [['hearth_nap_economy'], ['hearth_warm_lap', { floor: 0 }]], 'R3');
  const lapPurr = g.purr(0);
  ok(lapPurr > purrAfter2, 'Warm Lap turned Rested into Purr (' + purrAfter2 + ' to ' + lapPurr + ')');
  g.end();
  const w3 = g.S.sunbeam.warmth;
  playRound(g, [['hearth_sleep_talker', { floor: 0 }], ['hearth_lullaby', () => g.catT(g.cats(0).filter(c => c.id === 'hearth_sleep_talker')[0])]], 'R4');
  ok(g.S.sunbeam.warmth > w3 - 1, 'Nap Economy: the Lullaby nap healed the Sunbeam');
  g.end();
  eq(g.S.hand.length, 1 + 1, 'R5 start: the scripted card plus the extra draw from the sleeping Sleep Talker');
  playRound(g, [['hearth_hibernation']], 'R5');
  eq(g.cats(0).every(c => c.napping), true, 'Hibernation: the whole house is asleep');
  g.end();
  ok(mort.napping && !g.S.over, 'Mortimer still asleep, the Cellar and the Sunbeam hold');
  ok(g.S.sunbeam.warmth >= 30, 'the Sunbeam never lost ground: ' + g.S.sunbeam.warmth);
  ok(mort.statuses.rested >= 4, 'Mortimer banked Rested: ' + mort.statuses.rested);
});

L('hearth loop 2: Heap Fortress', () => {
  const g = G({
    deck: ['hearth_big_mama', 'hearth_sir_floofington', 'hearth_wool_blanket', 'hearth_cuddle_captain', 'hearth_fluff_up', 'hearth_hearth_rug', 'hearth_group_hug'],
    hand: ['hearth_big_mama'], hands: [['hearth_sir_floofington', 'hearth_wool_blanket'], ['hearth_cuddle_captain', 'hearth_fluff_up'], ['hearth_hearth_rug'], ['hearth_group_hug']],
    pests: [{ id: 't_nibble', floor: 0, hp: 900 }, { id: 't_nibble', floor: 0, hp: 900 }], fill: 20
  });
  playRound(g, [['hearth_big_mama', { floor: 0 }]], 'R1');
  g.end();
  playRound(g, [['hearth_sir_floofington', { floor: 0 }], ['hearth_wool_blanket', { floor: 0 }]], 'R2');
  const floof = g.cats(0).filter(c => c.id === 'hearth_sir_floofington')[0];
  eq(g.B.pileSizeOf(floof), 3, 'Mama + Floofington is a Pile of 3 (Mama counts as 2)');
  g.end();
  playRound(g, [['hearth_cuddle_captain', { floor: 0 }], ['hearth_fluff_up', { floor: 0 }]], 'R3');
  eq(g.B.pileSizeOf(floof), 4, 'with the Captain it is a Heap of 4');
  const fl3 = floof.fluff, atk3 = g.atk(floof);
  ok(atk3 >= 1 + Math.floor(fl3 / 3), 'Floofington hits for +1 per 3 Fluff: ' + atk3);
  g.end();
  const fluffBeforeRug = g.cats(0).map(c => c.fluff);
  playRound(g, [['hearth_hearth_rug', { floor: 0 }]], 'R4');
  g.end();
  const gain = g.cats(0).map((c, i) => c.fluff - fluffBeforeRug[i]);
  ok(gain.every(x => x >= 2 + 2 + 1 - 99), 'fluff grew');
  playRound(g, [['hearth_group_hug', { floor: 0 }]], 'R5');
  ok(g.cats(0).every(c => c.fluff >= 8), 'Group Hug dumped 8 Fluff on each member of the Heap');
  ok(g.atk(floof) >= 1 + Math.floor(floof.fluff / 3) && g.atk(floof) >= 6, 'Floofington is now the hardest hitter in the house: ' + g.atk(floof));
  g.end();
  ok(g.cats(0).length === 3 && g.cats(0).every(c => c.health > 0) && !g.S.over, 'the fortress took 2 nibbles a round and stands');
});

L('hearth loop 3: Purr Furnace', () => {
  const g = G({
    deck: ['hearth_sunny_cushion', 'hearth_warm_belly', 'hearth_mother_rumble', 'hearth_idle_engine', 'hearth_stoke_radiator', 'hearth_fireplace', 'hearth_purr_crescendo'],
    hand: ['hearth_sunny_cushion', 'hearth_warm_belly'], hands: [['hearth_mother_rumble'], ['hearth_idle_engine', 'hearth_stoke_radiator'], ['hearth_fireplace'], ['hearth_purr_crescendo', 'hearth_stoke_radiator']],
    pests: [{ id: 't_nibble', floor: 0, hp: 900 }], fill: 20, noPile: true
  });
  g.S.sunbeam.warmth = 30;
  playRound(g, [['hearth_sunny_cushion', { floor: 0 }], ['hearth_warm_belly', { floor: 0 }]], 'R1');
  eq(g.purr(0), 3, 'Warm Belly deploy Purr 3');
  g.end();
  const p1 = g.purr(0);
  ok(p1 >= 3 + 3 + 2 - 1 - 1, 'Cushion 3 + Belly 2 at end of turn, minus Dusk decay: ' + p1);
  playRound(g, [['hearth_mother_rumble', { floor: 0 }]], 'R2');
  g.end();
  playRound(g, [['hearth_idle_engine', { floor: 0 }], ['hearth_stoke_radiator', { floor: 0 }]], 'R3');
  g.end();
  playRound(g, [['hearth_fireplace', { floor: 0 }]], 'R4');
  g.end();
  const pBefore = g.purr(0);
  ok(pBefore >= 15, 'Purr piled up to ' + pBefore);
  playRound(g, [['hearth_purr_crescendo', { floor: 0 }], ['hearth_stoke_radiator', { floor: 0 }]], 'R5');
  const rumble = g.cats(0).filter(c => c.id === 'hearth_mother_rumble')[0];
  ok(g.purr(0) === 40 || g.purr(0) >= pBefore + 10, 'Crescendo + Stoke on the burst turn: ' + pBefore + ' to ' + g.purr(0) + ' (cap 40)');
  eq(g.atk(rumble), 2 + Math.floor(g.purr(0) / 5), 'Mother Rumble: +1 Power per 5 Purr');
  const w = g.S.sunbeam.warmth;
  g.end();
  ok(g.S.sunbeam.warmth > w, 'Fireplace at 10+ Purr heals the Sunbeam (' + w + ' to ' + g.S.sunbeam.warmth + ')');
  ok(g.cats(0).every(c => c.health >= c.maxHealth - 1), 'Purr healing kept the cats topped up');
});

L('hearth loop 4: Alarm Chain', () => {
  const g = G({
    deck: ['hearth_snooze_tabby', 'hearth_lullaby', 'hearth_lullaby', 'hearth_dough_paws', 'hearth_alarm_clock', 'hearth_pillow_bruiser', 'hearth_naptime', 't_tank'],
    hand: ['t_tank', 'hearth_snooze_tabby', 'hearth_lullaby'],
    hands: [['hearth_dough_paws', 'hearth_lullaby'], ['hearth_alarm_clock', 'hearth_pillow_bruiser'], ['hearth_naptime']],
    pests: [{ id: 't_dummy', floor: 0, hp: 500 }, { id: 't_biter', floor: 0, hp: 500 }], fill: 20, noPile: true
  });
  g.play('t_tank', { floor: 0 }, true);
  const dummy = g.pest(0, 0);
  playRound(g, [['hearth_snooze_tabby', { floor: 0 }], ['hearth_lullaby', () => g.catT(g.cats(0).filter(c => c.id === 'hearth_snooze_tabby')[0])]], 'R1');
  const snooze = g.cats(0).filter(c => c.id === 'hearth_snooze_tabby')[0];
  g.end();
  ok(snooze.napping && snooze.statuses.rested >= 3, 'R1: Snooze Tabby sleeps with Rested ' + snooze.statuses.rested);
  playRound(g, [['hearth_dough_paws', { floor: 0 }], ['hearth_lullaby', () => g.catT(g.cats(0).filter(c => c.id === 'hearth_dough_paws')[0])]], 'R2');
  const dough = g.cats(0).filter(c => c.id === 'hearth_dough_paws')[0];
  eq([dough.buffs.power, dough.maxHealth], [1, 7], 'Dough Paws grew when it Napped');
  g.end();
  const rS = snooze.statuses.rested, rD = dough.statuses.rested;
  ok(rS >= 4 && rD >= 3, 'Rested stacked: ' + rS + ' and ' + rD);
  const hp0 = dummy.hp, dmgFloorBefore = g.ev.length;
  playRound(g, [['hearth_alarm_clock', { floor: 0 }], ['hearth_pillow_bruiser', { floor: 0 }]], 'R3');
  const expectS = 2 + 3 * Math.min(6, rS), expectD = (1 + 1) + 3 * rD;
  eq(hp0 - dummy.hp, expectS + expectD, 'Alarm Clock: both Stretch at once for Power + 3 per Rested');
  eq([snooze.napping, snooze.statuses.rested], [true, 1], 'Snooze Tabby falls asleep again with Rested 1');
  eq(dough.napping, false, 'Dough Paws stays up');
  g.end();
  playRound(g, [['hearth_naptime', { floor: 0 }]], 'R4');
  ok(g.cats(0).every(c => c.napping), 'Naptime puts the whole floor to bed for the next alarm');
  g.end();
  ok(!g.S.over && g.cats(0).length === 4, 'the chain ran with the Cellar intact');
});


/* ============================= cross-cutting checks ============================= */
T('cost_gating_and_targets', () => {
  const ids = SB.data.cardsAlley.concat(SB.data.cardsHearth).map(c => c.id);
  [false, true].forEach(up => {
    ids.forEach(id => {
      curCard = id + (up ? '+' : '');
      const inst = SB.cardInst.make(id); if (up) inst.scratches.push('plus');
      const eff = SB.cardInst.effective(inst);
      const cost = eff.cost;
      const mkg = () => {
        const g = G({ deck: [id, 't_pow'], up: U(up, id), pests: [{ id: 't_dummy', floor: 0, hp: 90 }, { id: 't_dummy', floor: 1, hp: 90 }, { id: 't_dummy', floor: 2, hp: 90 }] });
        g.deploy('t_pow', 0); g.deploy('t_pow', 1); g.deploy('t_pow', 2);
        g.cats(0)[0].health = 10;
        return g;
      };
      const targetFor = g => {
        const t = eff.type === 'unit' ? 'floor' : (eff.type === 'toy' ? 'floor' : eff.targeting);
        if (t === 'enemy') return g.pestUid(1, 0);
        if (t === 'cat') return g.catT(g.cat(1, 0));
        if (t === 'floor') return { floor: 1 };
        return {};
      };
      if (cost > 0) {
        const g = mkg(); g.S.zoomies = cost - 1;
        eq(g.play(id, targetFor(g), true).ok, false, 'costs ' + cost + ': refused with ' + (cost - 1));
      }
      const g2 = mkg(); g2.S.zoomies = cost;
      const r = g2.play(id, targetFor(g2), true);
      ok(r.ok, 'plays with exactly ' + cost + ' Zoomies (' + (r.reason || 'ok') + ')');
      eq(g2.S.zoomies >= 0, true, 'Zoomies never negative');
      ok(eff.text && eff.text.length > 5, 'has text');
      ok(!DASH.test(JSON.stringify(SB.content.card(id))), 'no em or en dashes in the card data');
    });
  });
});

T('no_dashes_in_new_files', () => {
  ['src/engine/ops-alley.js', 'src/engine/ops-hearth.js', 'src/data/cards-alley.js', 'src/data/cards-hearth.js', 'tests/cards-alley-hearth-test.js'].forEach(f => {
    const txt = fs.readFileSync(path.join(root, f), 'utf8');
    ok(!DASH.test(txt), f + ' has no em or en dashes');
  });
});

T('validate_clean', () => {
  const val = SB.content.validate();
  const mine = val.errors.concat(val.warnings).filter(m => /alley_|hearth_/.test(m));
  eq(mine, [], 'validate reports nothing for alley or hearth cards');
  eq(val.errors.length, 0, 'validate has no errors');
});

T('determinism_same_seed', () => {
  const run = () => { const g = G({ deck: ['alley_queen_of_the_zoomies', 'alley_hiss_fit'], pests: [{ id: 't_dummy', floor: 0, hp: 20 }, { id: 't_dummy', floor: 0, hp: 20 }] }); g.deploy('alley_queen_of_the_zoomies', 0); g.play('alley_hiss_fit', { floor: 0 }); g.end(); return JSON.stringify(g.ev.map(e => [e.type, e.amount, e.floor, e.pos, e.id && String(e.id)])); };
  eq(run() === run(), true, 'same seed, same events');
});

/* ============================= coverage + run ============================= */
function runAll() {
  const ids = SB.data.cardsAlley.concat(SB.data.cardsHearth).map(c => c.id);
  ids.forEach(id => {
    curCard = id;
    if (!tests[id]) { ok(false, 'no behavior test for ' + id); return; }
    try { tests[id](); } catch (e) { failures++; checks++; failLog.push('[' + id + '] threw: ' + (e.stack || e).toString().split('\n').slice(0, 4).join(' | ')); }
  });
  curCard = 'extra';
  Object.keys(tests).filter(k => ids.indexOf(k) < 0).forEach(k => { try { tests[k](); } catch (e) { failures++; checks++; failLog.push('[' + k + '] threw: ' + (e.stack || e).toString().split('\n').slice(0, 4).join(' | ')); } });
  eq(ids.length, 84, 'both clans have 42 cards each');
  Object.keys(loopTests).forEach(name => {
    curCard = name;
    try { loopTests[name](); } catch (e) { failures++; checks++; failLog.push('[' + name + '] threw: ' + (e.stack || e).toString().split('\n').slice(0, 4).join(' | ')); }
  });
}

// ---- balance pass: printed Power / Health / Lives of every Alley and Hearth unit (deliberate stat changes, see tests/balance-sim.js) ----
(function balancePassStats() {
  curCard = 'balance pass';
  const want = {"alley_bin_diver":[1,3,3],
  "alley_gutter_kitten":[1,2,2],
  "alley_fence_walker":[1,3,3],
  "alley_tin_can_tom":[2,6,3],
  "alley_back_door_bandit":[2,5,3],
  "alley_sidewalk_sprinter":[2,2,2],
  "alley_scrap_heap_sal":[1,4,3],
  "alley_ledge_lurker":[2,4,3],
  "alley_whetstone_whiskers":[1,6,3],
  "alley_ragebait_ronnie":[1,7,3],
  "alley_ambush_artie":[2,5,3],
  "alley_frenzy_fred":[1,5,3],
  "alley_cornered_connie":[1,6,3],
  "alley_last_gasp_gus":[1,5,3],
  "alley_smash_and_grab_gladys":[1,4,3],
  "alley_sharpening_sally":[2,5,3],
  "alley_old_scratch":[3,9,4],
  "alley_hurricane_hank":[3,8,3],
  "alley_queen_of_the_zoomies":[3,4,3],
  "alley_barnaby_bad_idea":[3,10,4],
  "hearth_sleepy_calico":[2,5,3],
  "hearth_biscuit_baker":[2,5,3],
  "hearth_porch_tabby":[2,6,3],
  "hearth_lap_squatter":[3,6,3],
  "hearth_fluff_ball":[2,5,3],
  "hearth_sleepy_kitten":[1,3,2],
  "hearth_granny_whiskers":[2,6,3],
  "hearth_pillow_bruiser":[3,7,3],
  "hearth_dozing_tom":[3,5,3],
  "hearth_warm_belly":[1,7,3],
  "hearth_cuddle_captain":[2,6,3],
  "hearth_sleep_talker":[1,5,3],
  "hearth_snooze_tabby":[2,6,3],
  "hearth_cushion_matron":[2,9,3],
  "hearth_idle_engine":[1,6,3],
  "hearth_dough_paws":[1,5,3],
  "hearth_big_mama":[3,13,4],
  "hearth_sir_floofington":[1,8,3],
  "hearth_old_mortimer":[1,11,3],
  "hearth_mother_rumble":[2,8,3],
  "token_lap_kitten":[1,3,1],
  "token_scrap_kitten":[2,1,1],
  "alley_basic_kitten":[1,4,2],
  "hearth_basic_kitten":[1,6,2],
  "alley_recruit":[2,4,2],
  "hearth_biscuit_kitten":[2,6,2],
  "hearth_biscuit_cat":[4,12,3],
  "hearth_biscuit_the_great":[7,20,4],
  "hearth_dumpling_kitten":[1,7,2],
  "hearth_dumpling_cat":[2,14,3],
  "hearth_dumpling_legend":[4,26,4],
  "alley_pip":[3,4,2],
  "alley_pippin_the_mouser":[6,8,3],
  "alley_pip_terror_of_the_pantry":[10,12,4]};
  Object.keys(want).forEach(id => { const c = SB.content.card(id); eq([c.stats.power, c.stats.health, c.stats.lives], want[id], id + ' printed Power/Health/Lives'); });
  eq(Object.keys(want).length, SB.content.cards().filter(c => c.type === 'unit' && (c.clan === 'alley' || c.clan === 'hearth') && c.stats).length, 'table covers every Alley and Hearth unit');
})();

runAll();
console.log(checks + ' checks, ' + failures + ' failures');
failLog.slice(0, 200).forEach(l => console.log('  FAIL ' + l));
process.exit(failures ? 1 : 0);
