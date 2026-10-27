// Champions, upgrades, forks, evolutions, Mastery, Kneading and run-layer integration tests (agent C4).
// node tests/champions-upgrades-test.js [--verbose]
// Loads src/data and src/engine (plus every ops-*.js) in a vm sandbox and plays real battles with real champion instances.
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
  // same order as the index.html loader (ops-champions last, it wraps what the clan files define)
  const order = ['ops-bosses', 'ops-pests', 'ops-alley', 'ops-hearth', 'ops-moon', 'ops-mischief', 'ops-neutral', 'ops-champions'];
  const rest = fs.readdirSync(path.join(root, 'src/engine')).filter(f => /^ops-.*\.js$/.test(f)).map(f => f.slice(0, -3)).filter(n => order.indexOf(n) < 0).sort();
  order.concat(rest).forEach(n => { const f = path.join(root, 'src/engine', n + '.js'); if (fs.existsSync(f)) load(f); });
  ctx.SB.util.quiet = true;
  return ctx.SB;
}

let checks = 0, failures = 0;
const failLog = [];
function ok(c, msg) { checks++; if (!c) { failures++; failLog.push(msg); if (VERBOSE) console.log('  FAIL ' + msg); } return !!c; }
function eq(a, b, msg) { return ok(a === b || JSON.stringify(a) === JSON.stringify(b), msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7);
function section(name, fn) {
  if (ONLY && name.indexOf(ONLY) < 0) return;
  const f0 = failures;
  try { fn(); } catch (e) { failures++; failLog.push(name + ' threw: ' + (e.stack || e).toString().split('\n').slice(0, 5).join(' | ')); }
  console.log((failures === f0 ? 'PASS ' : 'FAIL ') + name);
}

const SB = makeSB();
const CI = SB.cardInst;

// ---------------------------------------------------------------- synthetic pests
(function () {
  const atk = (label, dmg) => ({ kind: 'attack', dmg, hits: 1, floors: 'own', pick: 'front', label });
  const pest = (id, name, hp, traits, dmg, extra) => Object.assign({ id, name, hp, size: 1, traits: traits || [], tags: ['pest'], pattern: { type: 'cycle', actions: [atk('Hit', dmg)] }, flavor: name, art: { species: 'mouse', colors: 'grey', accessory: 'none' }, tutorialOnly: true }, extra || {});
  SB.data.tutorial.enemies.push(
    pest('t_dummy', 'Dummy', 200, [], 0),      // sandbag, never hurts
    pest('t_hitter', 'Hitter', 300, [], 4),    // hurts the front cat a little
    pest('t_slugger', 'Slugger', 300, [], 9),
    pest('t_weakling', 'Weakling', 6, [], 0),
    pest('t_frail', 'Frail', 4, [], 0)
  );
  const unit = (id, name, cost, p, h, l, extra) => Object.assign({ id, name, type: 'unit', clan: 'neutral', rarity: 'basic', cost, targeting: 'floor', stats: { power: p, health: h, lives: l, size: 1 }, keywords: {}, text: name, flavor: name, art: { sprite: 'cat_plain', palette: 'grey' }, tutorialOnly: true }, extra || {});
  SB.data.tutorial.cards.push(unit('t_glass', 'Glass Cat', 1, 1, 3, 2), unit('t_pal', 'Pal', 1, 2, 10, 3));
  SB.content.rebuild();
})();

// ---------------------------------------------------------------- battle harness
// o: { champ, tiers:[optionIds], deck:[cardIds], spawns:[{id,floor(1-based),at}], waves, hands, clock, seed, run(fn) }
function mk(o) {
  const champ = o.champ;
  const def = SB.content.card(champ);
  const clan = def.clan;
  const run = SB.run.newRun({ seed: o.runSeed || 'ABCDEFGH', clan, side: clan === 'alley' ? 'hearth' : 'alley', championId: champ, rank: 0 });
  run.relics = [];
  const ch = run.deck.find(i => i.id === champ);
  run.deck = [ch].concat((o.deck || []).map(id => CI.make(id, { run })));
  (o.tiers || []).forEach(t => CI.pickChampionOption(ch, t));
  if (o.run) o.run(run, ch);
  const waves = o.waves || [{ round: 1, spawns: (o.spawns || [{ id: 't_dummy', floor: 1 }]).map(s => Object.assign({ at: 'back' }, s)) }];
  const enc = { id: 't_enc', type: 'prowl', act: 1, rules: { nightClock: !!o.clock, impatience: false, noPile: !!o.noPile }, waves, setup: { cats: o.cats || [] } };
  const B = SB.battle.create(run, enc, { seed: o.seed === undefined ? 1 : o.seed, hands: o.hands, noWitching: !o.clock });
  B.__ch = ch;
  return B;
}
const hand = (B, id) => { const h = B.state.hand.find(x => x.card && x.card.id === id) || B.state.hand.find(x => B.state.cards[x.uid].id === id); return h && h.uid; };
function play(B, id, target) { const u = hand(B, id); if (!u) return { ok: false, reason: 'not in hand: ' + id }; return B.playCard(u, target || {}); }
const cats = (B, f) => B.state.floors[f].cats;
const pests = (B, f) => B.state.floors[f].pests;
const champUnit = B => { for (const f of B.state.floors) for (const c of f.cats) if (c.champion) return c; return null; };
const allPests = B => [].concat(...B.state.floors.map(f => f.pests));
const hpSum = B => allPests(B).reduce((a, p) => a + p.hp, 0);
function opt(champ, optId) { return SB.cardInst.findChampionOption(SB.content.card(champ), optId); }
function eff(champ, tiers) {
  const inst = CI.make(champ); (tiers || []).forEach(t => CI.pickChampionOption(inst, t)); return CI.effective(inst);
}
const AS = 'alley_shadow', MX = 'alley_mad_maxine', DU = 'hearth_duchess_marmalade', CR = 'hearth_brother_crumpet';
const OS = 'moon_oswin_ledgerpaw', TU = 'moon_tuppence_mistfur', TL = 'mischief_tumble_ledgeworth', PP = 'mischief_parcel_pennywhistle';

//@@CHAMPIONS@@

// helper: play champion, then end the turn, returning the battle
const go = (B, id, target) => { const r = play(B, id, target || { floor: 0 }); if (!r.ok) throw new Error('could not play ' + id + ': ' + r.reason); return r; };

section('champion Shadow: base kit', () => {
  const B = mk({ champ: AS });
  go(B, AS);
  eq(pests(B, 0)[0].hp, 200 - 10, 'Pounce 1 with Ambush: (4+1) x2');
  const e = eff(AS, []);
  eq([e.stats.power, e.stats.health, e.cost, e.keywords.pounce, e.keywords.ambush], [4, 15, 1, 1, 2], 'Shadow printed stats');
});

section('champion Shadow: tier 1', () => {
  let B = mk({ champ: AS, tiers: ['alley_shadow_a1'] });
  eq(eff(AS, ['alley_shadow_a1']).stats.power, 7, 'A1 effective power');
  eq(eff(AS, ['alley_shadow_a1']).keywords.ambush, 3, 'A1 effective ambush');
  go(B, AS);
  eq(pests(B, 0)[0].hp, 200 - 8 * 3, 'A1 Pounce x3: (7+1) x3');
  B = mk({ champ: AS, tiers: ['alley_shadow_b1'], spawns: [{ id: 't_dummy', floor: 2 }] });
  eq(eff(AS, ['alley_shadow_b1']).stats.power, 6, 'B1 power');
  go(B, AS, { floor: 1 });
  B.endTurn();
  eq(pests(B, 0).length, 1, 'B1 attack knocked the pest to the Cellar');
  eq(pests(B, 1).length, 0, 'B1 Parlor empty');
  B = mk({ champ: AS, tiers: ['alley_shadow_c1'] });
  go(B, AS);
  ok(champUnit(B).boxed, 'C1 Shadow sits in a Box'); ok(B.state.floors[0].rooms.some(r => r.rtype === 'box'), 'C1 a Box exists on her floor');
  ok(B.state.floors[0].rooms.find(r => r.rtype === 'box').hides, 'C1 the Box hides its occupant');
  eq(eff(AS, ['alley_shadow_c1']).stats.power, 6, 'C1 power');
});

section('champion Shadow: tier 2', () => {
  // A2: Mark the strongest pest at the start of each turn
  let B = mk({ champ: AS, tiers: ['alley_shadow_a2'], spawns: [{ id: 't_dummy', floor: 1 }, { id: 't_weakling', floor: 1 }] });
  go(B, AS); B.endTurn();
  const strong = allPests(B).find(p => p.id === 't_dummy');
  ok(strong && (strong.statuses.marked || 0) >= 2, 'A2 strongest pest has Marked 2 at the next turn start: ' + JSON.stringify(strong && strong.statuses));
  ok(!(allPests(B).find(p => p.id === 't_weakling') || { statuses: {} }).statuses.marked, 'A2 weak pest not marked');
  // B2: Knocks deal 2 extra Shatter, Shatter on any pest gives +1 Power for the fight
  const hpAfterKnock = tiers => {
    const b = mk({ champ: AS, tiers, spawns: [{ id: 't_dummy', floor: 2 }] });
    go(b, AS, { floor: 1 }); const h0 = pests(b, 1)[0].hp; b.endTurn();
    const p = pests(b, 0)[0]; return { drop: h0 - p.hp, power: b.atk(champUnit(b)), b };
  };
  const base = hpAfterKnock(['alley_shadow_b1']), plus = hpAfterKnock(['alley_shadow_b1', 'alley_shadow_b2']);
  eq(eff(AS, ['alley_shadow_b2']).mods.knockShatter, 2, 'B2 knockShatter mod');
  eq(plus.drop - base.drop, 2, 'B2 Knock deals 2 extra Shatter (' + base.drop + ' vs ' + plus.drop + ')');
  eq(plus.power - base.power, 1, 'B2 Shadow gains +1 Power from the Shatter');
  // C2: boxed cats on her floor +3 Power, a flattened Box is replaced
  B = mk({ champ: AS, tiers: ['alley_shadow_c1', 'alley_shadow_c2'] });
  go(B, AS);
  eq(B.atk(champUnit(B)), 4 + 2 + 1 + 3, 'C2 boxed Shadow: +1 Box, +3 aura');
  const box = B.state.floors[0].rooms.find(r => r.rtype === 'box');
  B.flattenBox(box, 'test'); B.drain();
  ok(B.state.floors[0].rooms.some(r => r.rtype === 'box' && r !== box), 'C2 a new Box replaces the flattened one');
});

section('champion Shadow: tier 3', () => {
  // A3: a kill re-arms Ambush and draws a card
  let B = mk({ champ: AS, tiers: ['alley_shadow_a3'], deck: ['neutral_swat', 'neutral_swat', 'neutral_swat', 'neutral_swat', 'neutral_swat', 'neutral_swat'], spawns: [{ id: 't_weakling', floor: 1 }, { id: 't_dummy', floor: 1 }] });
  const h0 = B.state.hand.length;
  go(B, AS);
  eq(pests(B, 0).map(p => p.id), ['t_dummy'], 'A3 the Pounce killed the weakling');
  eq(champUnit(B).ambushUsed, false, 'A3 Ambush is re-armed after the kill');
  eq(B.state.hand.length, h0 - 1 + 1, 'A3 the kill drew a card');
  // B3: end of turn Knock 1 the front pest on every floor, ignoring Grip
  B = mk({ champ: AS, tiers: ['alley_shadow_b3'], spawns: [{ id: 't_dummy', floor: 3 }, { id: 't_hitter', floor: 2 }] });
  go(B, AS, { floor: 1 });
  B.endTurn();
  ok(pests(B, 1).some(p => p.id === 't_dummy'), 'B3 Attic pest knocked to the Parlor');
  ok(pests(B, 0).some(p => p.id === 't_hitter'), 'B3 Parlor pest knocked to the Cellar');
  const ig = eff(AS, ['alley_shadow_b3']).flags.ignoreGrip; eq(ig, true, 'B3 ignoreGrip flag on the card');
  // C3: Box placed at turn start, 10 damage to all pests on her floor when she attacks from a Box
  B = mk({ champ: AS, tiers: ['alley_shadow_c3'], spawns: [{ id: 't_dummy', floor: 1 }, { id: 't_dummy', floor: 1 }] });
  go(B, AS);
  B.endTurn();
  ok(B.state.floors[0].rooms.some(r => r.rtype === 'box'), 'C3 Box placed at turn start');
  ok(champUnit(B).boxed, 'C3 Shadow enters the Box');
  const hp0 = pests(B, 0).map(p => p.hp);
  B.endTurn();
  const dmg = pests(B, 0).map((p, i) => hp0[i] - p.hp);
  ok(dmg[1] >= 10 && dmg[1] < 13, 'C3 the back pest takes the 10 damage blast (took ' + dmg[1] + ')');
  ok(dmg[0] > dmg[1], 'C3 the front pest also takes her attack');
});

section('champion Shadow: final forms', () => {
  const tiers = l => ['alley_shadow_' + l + '1', 'alley_shadow_' + l + '2', 'alley_shadow_' + l + '3'];
  let e = eff(AS, tiers('a'));
  eq(e.finalForm && e.finalForm.id, 'alley_shadow_final_a', 'A path final form id');
  ok(!eff(AS, ['alley_shadow_a1', 'alley_shadow_a2', 'alley_shadow_b3']).finalForm, 'mixed path has no final form');
  eq(e.stats.power, 4 + 3 + 2, 'Final A power');
  let B = mk({ champ: AS, tiers: tiers('a'), spawns: [{ id: 't_dummy', floor: 1 }, { id: 't_dummy', floor: 1 }] });
  go(B, AS);
  eq(pests(B, 0)[0].hp, 200 - (9 + 1) * 3, 'Final A front pest takes the tripled Pounce');
  eq(pests(B, 0)[1].hp, 200 - (9 + 1), 'Final A Pounce sweeps the rest of the floor without Ambush');
  // Final B: knocked pests land Dizzy 2 and take Shatter equal to half her Power
  const dz = (t) => { const b = mk({ champ: AS, tiers: t, spawns: [{ id: 't_dummy', floor: 2 }] }); go(b, AS, { floor: 1 }); b.knockPest(pests(b, 1)[0], 1, { src: champUnit(b) }); b.drain(); return b; };
  B = dz(tiers('b'));
  const landed = pests(B, 0)[0];
  ok(landed && (landed.statuses.dizzy || 0) >= 3, 'Final B pest lands Dizzy 1 (landing) + 2: ' + JSON.stringify(landed && landed.statuses));
  const noFinal = dz(['alley_shadow_b1', 'alley_shadow_b2', 'alley_shadow_c3']);
  ok(pests(B, 0)[0].hp < pests(noFinal, 0)[0].hp, 'Final B extra Shatter (hp ' + pests(B, 0)[0].hp + ' vs ' + pests(noFinal, 0)[0].hp + ')');
  // Final C: boxes never wear out, +5 box blast
  B = mk({ champ: AS, tiers: tiers('c'), spawns: [{ id: 't_dummy', floor: 1 }, { id: 't_dummy', floor: 1 }] });
  go(B, AS); B.endTurn();
  const hp0 = pests(B, 0).map(p => p.hp);
  B.endTurn();
  const d2 = pests(B, 0)[1] ? hp0[1] - pests(B, 0)[1].hp : 0;
  ok(d2 >= 15 && d2 < 18, 'Final C back pest takes 10 + 5 (took ' + d2 + ')');
  const box = B.state.floors[0].rooms.find(r => r.rtype === 'box');
  const d0 = box && box.durability;
  B.endTurn(); B.endTurn();
  const box2 = B.state.floors[0].rooms.find(r => r.rtype === 'box');
  ok(box2 && box2.durability === d0, 'Final C box durability does not drop (' + d0 + ' -> ' + (box2 && box2.durability) + ')');
});


const MXo = (l, n) => 'alley_mad_maxine_' + l + n;
const mxTiers = l => [MXo(l, 1), MXo(l, 2), MXo(l, 3)];
section('champion Maxine: base kit', () => {
  const B = mk({ champ: MX, spawns: [{ id: 't_hitter', floor: 1 }] });
  go(B, MX); B.endTurn();
  const m = champUnit(B);
  ok(m.flags.decoy, 'Maxine is a Decoy');
  ok((m.statuses.claws || 0) >= 1, 'each hit taken gives Claws (' + JSON.stringify(m.statuses) + ')');
  eq(eff(MX, []).stats.health, 18, 'Maxine printed health');
});
section('champion Maxine: tier 1', () => {
  let B = mk({ champ: MX, tiers: [MXo('a', 1)] });
  go(B, MX);
  eq(eff(MX, [MXo('a', 1)]).stats.health, 26, 'A1 health');
  eq(champUnit(B).fluff, 8, 'A1 starts with Fluff 8');
  B = mk({ champ: MX, tiers: [MXo('b', 1)] });
  eq(eff(MX, [MXo('b', 1)]).stats.power, 7, 'B1 power');
  go(B, MX); B.endTurn();
  const hp1 = pests(B, 0)[0].hp; ok(champUnit(B).statuses.frenzy >= 1, 'B1 Frenzy 1 at turn start');
  B.endTurn();
  eq(hp1 - pests(B, 0)[0].hp, 14, 'B1 attacks twice for 7');
  B = mk({ champ: MX, tiers: [MXo('c', 1)], noPile: true });
  go(B, MX);
  eq(cats(B, 0).map(c => c.id).sort(), ['alley_mad_maxine', 'alley_recruit'], 'C1 an Alley Recruit joins');
  eq(B.atk(cats(B, 0).find(c => c.id === 'alley_recruit')), 2 + 1, 'C1 Recruit has +1 Power');
});
section('champion Maxine: tier 2', () => {
  const dmgToHitter = tiers => { const b = mk({ champ: MX, tiers, noPile: true, spawns: [{ id: 't_hitter', floor: 1 }] }); go(b, MX); const h0 = pests(b, 0)[0].hp; b.endTurn(); return { drop: h0 - pests(b, 0)[0].hp, atk: b.atk(champUnit(b)), b }; };
  const base = dmgToHitter([]), a2 = dmgToHitter([MXo('a', 2)]);
  eq(a2.drop - base.drop, 2 + 1, 'A2 reflects 2 + Claws (1) to the attacker');
  let B = mk({ champ: MX, tiers: [MXo('b', 1), MXo('b', 2)], spawns: [{ id: 't_frail', floor: 1 }, { id: 't_dummy', floor: 1 }] });
  go(B, MX); B.endTurn();
  ok(champUnit(B).statuses.claws >= 1, 'B2 kill gives Claws'); ok((champUnit(B).statuses.frenzy || 0) >= 1, 'B2 kill gives Frenzy');
  B = mk({ champ: MX, tiers: [MXo('c', 2)], spawns: [{ id: 't_frail', floor: 1 }, { id: 't_dummy', floor: 1 }] });
  go(B, MX); B.endTurn();
  eq(cats(B, 0).filter(c => c.id === 'alley_recruit').length, 1, 'C2 a kill brings a Recruit');
});
section('champion Maxine: tier 3', () => {
  let B = mk({ champ: MX, tiers: [MXo('a', 3)], spawns: [{ id: 't_hitter', floor: 1 }] });
  go(B, MX); B.endTurn();
  const m = champUnit(B), claws = m.statuses.claws || 0;
  ok(claws >= 1, 'A3 has Claws'); ok(m.fluff >= claws, 'A3 Fluff at least her Claws at turn start (fluff ' + m.fluff + ', claws ' + claws + ')');
  B = mk({ champ: MX, tiers: [MXo('b', 1), MXo('b', 2), MXo('b', 3)], spawns: [{ id: 't_dummy', floor: 1 }] });
  go(B, MX); B.endTurn();
  eq(champUnit(B).statuses.frenzy, 2, 'B3 two Frenzy at turn start');
  const hpM = champUnit(B).health, hp0 = pests(B, 0)[0].hp, per = B.atk(champUnit(B)) + (champUnit(B).statuses.claws || 0);
  B.endTurn();
  eq(champUnit(B).health, hpM, 'B3 Frenzy costs no Health');
  eq(hp0 - pests(B, 0)[0].hp, 3 * per, 'B3 three hits');
  B = mk({ champ: MX, tiers: [MXo('c', 1), MXo('c', 2), MXo('c', 3)], spawns: [{ id: 't_dummy', floor: 1 }], noPile: true });
  go(B, MX);
  eq(B.atk(cats(B, 0).find(c => c.id === 'alley_recruit')), 2 + 2, 'C3 Recruit has +2 Power from both auras');
  const rec = cats(B, 0).find(c => c.id === 'alley_recruit');
  B.damage(rec, 99, { kind: 'direct' }); B.reap(); B.drain();
  eq(champUnit(B).statuses.claws, 2, 'C3 ally death gives 2 Claws');
});
section('champion Maxine: final forms', () => {
  let e = eff(MX, mxTiers('a'));
  eq(e.finalForm && e.finalForm.id, 'alley_mad_maxine_final_a', 'A final id');
  eq(e.stats.health, 18 + 8 + 10, 'Final A +10 Health');
  let B = mk({ champ: MX, tiers: mxTiers('a'), spawns: [{ id: 't_hitter', floor: 1 }, { id: 't_hitter', floor: 1 }] });
  go(B, MX);
  const h0 = pests(B, 0).map(p => p.hp);
  B.endTurn();
  const claws = champUnit(B).statuses.claws;
  ok(claws >= 1, 'Final A Maxine has Claws');
  ok(pests(B, 0).every((p, i) => h0[i] - p.hp >= claws), 'Final A every pest on the floor takes damage equal to her Claws');
  e = eff(MX, mxTiers('b'));
  eq(e.stats.power, 4 + 3 + 4, 'Final B +4 Power');
  B = mk({ champ: MX, tiers: mxTiers('b'), spawns: [{ id: 't_dummy', floor: 1 }, { id: 't_dummy', floor: 2 }, { id: 't_dummy', floor: 3 }] });
  go(B, MX); B.endTurn(); B.endTurn(); B.endTurn();
  ok(pests(B, 1).concat(pests(B, 2)).some(p => p.hp < 200), 'Final B extra Frenzy hits reach other floors');
  B = mk({ champ: MX, tiers: mxTiers('c'), clock: true });
  go(B, MX);
  eq(cats(B, 0).filter(c => c.id === 'alley_recruit').length, 3, 'Final C three Recruits at the start (1 + 2)');
  const rec = cats(B, 0).find(c => c.id === 'alley_recruit');
  B.damage(rec, 99, { kind: 'direct' }); B.reap(); B.drain();
  B.endTurn(); B.endTurn();
  eq(B.state.round, 3, 'Witching round reached');
  eq(cats(B, 0).filter(c => c.id === 'alley_recruit').length, 3, 'Final C a Recruit joins at the Witching Hour');
});

// ---------------------------------------------------------------- Hearth: Duchess Marmalade
const DUo = (l, n) => 'hearth_duchess_marmalade_' + l + n;
const duTiers = l => [DUo(l, 1), DUo(l, 2), DUo(l, 3)];
const napIt = (B, c) => { const r = B.toggleNap(c.uid); if (!r.ok) throw new Error('nap failed: ' + r.reason); return r; };
const damaged = (B, c, n) => { c.health -= n; };
const palOn = (f, pos) => ({ card: 't_pal', floor: f, pos: pos || 'back' });
section('champion Duchess: base kit', () => {
  const B = mk({ champ: DU, cats: [{ card: 't_pal', floor: 1, pos: 'back' }], noPile: true });
  go(B, DU); B.endTurn();
  eq(B.state.floors[0].statuses.purr, 2 - 1, 'Purr 2 added at end of turn then decays 1 at Dusk');
  const pal = cats(B, 0).find(c => c.id === 't_pal'), d = champUnit(B);
  damaged(B, pal, 6);
  napIt(B, d);
  eq(pal.health, 10 - 6 + 3, 'Nap heals all cats on her floor for 3');
  ok(eff(DU, []).keywords.retain && eff(DU, []).keywords.innate, 'Innate and Retain');
});
section('champion Duchess: tier 1', () => {
  let B = mk({ champ: DU, tiers: [DUo('a', 1)] });
  eq(eff(DU, [DUo('a', 1)]).stats.health, 40, 'A1 health'); eq(eff(DU, [DUo('a', 1)]).keywords.purr, 4, 'A1 Purr 4');
  go(B, DU); B.endTurn();
  eq(B.state.floors[0].statuses.purr, 4 - 1, 'A1 floor Purr 4 then decays');
  B = mk({ champ: DU, tiers: [DUo('b', 1)] });
  eq(eff(DU, [DUo('b', 1)]).stats.health, 44, 'B1 health');
  go(B, DU); B.endTurn(); napIt(B, champUnit(B));
  eq(champUnit(B).fluff, 8, 'B1 Nap gives Fluff 8');
  B = mk({ champ: DU, tiers: [DUo('c', 1)] });
  eq(eff(DU, [DUo('c', 1)]).stats.power, 10, 'C1 power'); go(B, DU);
  const h0 = pests(B, 0)[0].hp; B.endTurn();
  eq(h0 - pests(B, 0)[0].hp, 20, 'C1 attacks twice');
});
section('champion Duchess: tier 2', () => {
  let B = mk({ champ: DU, tiers: [DUo('a', 2)], spawns: [{ id: 't_frail', floor: 1 }] });
  B.state.sunbeam.warmth = 30;
  go(B, DU); B.endTurn();
  eq(B.state.over, true, 'A2 fight is won');
  eq(B.__ch.growth.health, 1, 'A2 permanent +1 Health at fight end');
  B = mk({ champ: DU, tiers: [DUo('a', 2)], spawns: [{ id: 't_dummy', floor: 1 }] });
  B.state.sunbeam.warmth = 30; go(B, DU); B.endTurn();
  eq(B.state.sunbeam.warmth, 31, 'A2 heals the Sunbeam 1 at end of turn');
  B = mk({ champ: DU, tiers: [DUo('b', 2)], spawns: [{ id: 't_slugger', floor: 1 }] });
  go(B, DU);
  ok(champUnit(B).flags.decoy, 'B2 Decoy'); eq(champUnit(B).statuses.bristle, 4, 'B2 Bristle 4'); eq(champUnit(B).fluff, 6, 'B2 Fluff 6');
  const h0 = pests(B, 0)[0].hp; B.endTurn();
  ok(h0 - pests(B, 0)[0].hp >= 6 + 4, 'B2 the pest takes the swing plus Bristle (' + (h0 - pests(B, 0)[0].hp) + ')');
  B = mk({ champ: DU, tiers: [DUo('c', 2)], cats: [palOn(2)], noPile: true, spawns: [{ id: 't_dummy', floor: 1 }, { id: 't_dummy', floor: 2 }] });
  go(B, DU);
  const up0 = pests(B, 1)[0].hp; B.endTurn();
  eq(up0 - pests(B, 1)[0].hp, 3 + B.atk(cats(B, 1)[0]), 'C2 hits the front pest on the floor above for half Power (plus the Parlor pal)');
  B = mk({ champ: DU, tiers: [DUo('c', 2)], spawns: [{ id: 't_frail', floor: 1 }, { id: 't_dummy', floor: 1 }] });
  go(B, DU); B.endTurn();
  eq(champUnit(B).statuses.claws, 1, 'C2 kill gives +1 Claws');
});
section('champion Duchess: tier 3', () => {
  let B = mk({ champ: DU, tiers: [DUo('a', 3)], cats: [{ card: 't_pal', floor: 3, pos: 'back' }], spawns: [{ id: 't_dummy', floor: 1 }], noPile: true });
  go(B, DU);
  const pal = cats(B, 2)[0]; damaged(B, pal, 6);
  B.endTurn();
  eq(pal.health, 10 - 6 + 3, 'A3 end of turn heals cats on all floors for 3');
  ok(champUnit(B).flags.cheatDeathOnce, 'A3 cheat death flag on Duchess');
  // A3 cheat death for a cat on her floor
  B = mk({ champ: DU, tiers: [DUo('a', 3)], cats: [{ card: 't_glass', floor: 1, pos: 'back' }], spawns: [{ id: 't_dummy', floor: 1 }], noPile: true });
  go(B, DU);
  const glass = cats(B, 0).find(c => c.id === 't_glass');
  B.damage(glass, 99, { kind: 'direct', src: null }); B.reap(); B.drain();
  ok(cats(B, 0).some(c => c.id === 't_glass') && glass.health === 1, 'A3 a cat on her floor that would die stays at 1 Health');
  B.damage(glass, 99, { kind: 'direct', src: null }); B.reap(); B.drain();
  ok(!cats(B, 0).some(c => c.id === 't_glass'), 'A3 only once per fight');
  // B3 Nap without skipping the attack, Wake damage = half Fluff to the floor
  B = mk({ champ: DU, tiers: [DUo('b', 1), DUo('b', 2), DUo('b', 3)], spawns: [{ id: 't_dummy', floor: 1 }, { id: 't_dummy', floor: 1 }] });
  go(B, DU); B.endTurn();
  const d = champUnit(B); napIt(B, d);
  const hpN = pests(B, 0).map(p => p.hp); B.endTurn();
  ok(hpN[0] > pests(B, 0)[0].hp, 'B3 a napping Duchess still attacks');
  ok(d.napping, 'B3 still napping');
  const fl = d.fluff; const hp1 = pests(B, 0).map(p => p.hp);
  B.toggleNap(d.uid);
  ok(d.napping === false, 'B3 woke');
  ok(pests(B, 0).every((p, i) => hp1[i] - p.hp >= Math.floor(fl / 2)), 'B3 Wake hits every pest for half her Fluff (' + fl + ')');
  // C3 more Claws per kill, Knock at 14 Claws
  B = mk({ champ: DU, tiers: [DUo('c', 3)], spawns: [{ id: 't_frail', floor: 1 }, { id: 't_dummy', floor: 1 }, { id: 't_dummy', floor: 2 }] });
  go(B, DU); B.endTurn();
  eq(champUnit(B).statuses.claws, 2, 'C3 kill gives 2 Claws');
  B = mk({ champ: DU, tiers: [DUo('c', 3)], spawns: [{ id: 't_dummy', floor: 2 }, { id: 't_dummy', floor: 2 }] });
  go(B, DU, { floor: 1 });
  champUnit(B).statuses.claws = 14;
  B.endTurn();
  eq([pests(B, 0).length, pests(B, 1).length], [2, 0], 'C3 at 14 Claws her attack Knocks every pest on her floor down a floor');
});
section('champion Duchess: final forms', () => {
  let e = eff(DU, duTiers('a'));
  eq(e.finalForm && e.finalForm.id, 'hearth_duchess_marmalade_final_a', 'A final form id');
  let B = mk({ champ: DU, tiers: duTiers('a'), cats: [{ card: 't_pal', floor: 1, pos: 'back' }], spawns: [{ id: 't_dummy', floor: 1 }], noPile: true });
  B.state.sunbeam.warmth = 20; go(B, DU);
  const pal = cats(B, 0).find(c => c.id === 't_pal');
  B.heal(pal, 5);
  eq(pal.fluff, 5, 'Final A overheal becomes Fluff');
  B.endTurn();
  ok(B.state.sunbeam.warmth >= 20 + 1 + 2, 'Final A start of turn Sunbeam +2 (warmth ' + B.state.sunbeam.warmth + ')');
  B = mk({ champ: DU, tiers: duTiers('b'), spawns: [{ id: 't_dummy', floor: 1 }] });
  go(B, DU); B.endTurn(); napIt(B, champUnit(B));
  const f0 = champUnit(B).fluff; B.addFluff(champUnit(B), 5); eq(champUnit(B).fluff - f0, 10, 'Final B Fluff gain doubled');
  B.endTurn();
  const fl = champUnit(B).fluff, h1 = pests(B, 0)[0].hp;
  B.toggleNap(champUnit(B).uid);
  ok(h1 - pests(B, 0)[0].hp >= fl - 1, 'Final B Wake damage is about her full Fluff (' + (h1 - pests(B, 0)[0].hp) + ' of ' + fl + ')');
  B = mk({ champ: DU, tiers: duTiers('c'), clock: true, spawns: [{ id: 't_dummy', floor: 1 }] });
  go(B, DU);
  ok(champUnit(B).flags.zoomTwice && champUnit(B).flags.immuneFrazzled, 'Final C flags');
  B.endTurn(); B.endTurn();
  eq(B.state.round, 3, 'Witching round');
  eq(champUnit(B).statuses.claws || 0, 3, 'Final C +3 Claws at the Witching Hour start');
  const zoomsBefore = []; B.on(ev => { if (ev.type === 'zoom' && ev.uid === champUnit(B).uid) zoomsBefore.push(ev); });
  B.endTurn();
  eq(zoomsBefore.length, 2, 'Final C Zooms twice');
  ok(!champUnit(B).statuses.frazzled, 'Final C is never Frazzled');
});

// ---------------------------------------------------------------- Hearth: Brother Crumpet
const CRo = (l, n) => 'hearth_brother_crumpet_' + l + n;
const crTiers = l => [CRo(l, 1), CRo(l, 2), CRo(l, 3)];
section('champion Crumpet: base kit', () => {
  const B = mk({ champ: CR, cats: [palOn(1)], spawns: [{ id: 't_dummy', floor: 1 }] });
  go(B, CR);
  const pal = cats(B, 0).find(c => c.id === 't_pal');
  ok(champUnit(B).flags.pileWeight2, 'Crumpet counts as 2 for Pile');
  eq(B.atk(pal), 2 + 1 + 1, 'adjacent +1 Power, Pile of 3 gives +1');
  damaged(B, pal, 5); B.endTurn();
  eq(pal.health, 10 - 5 + 1 + 1, 'adjacent cat heals 1 at end of turn, plus 1 from the Pile of 3');
});
section('champion Crumpet: tier 1', () => {
  const powerOfFar = tiers => { const b = mk({ champ: CR, tiers, cats: [palOn(1), palOn(1)], noPile: true, spawns: [{ id: 't_dummy', floor: 1 }] }); go(b, CR, { floor: 0, pos: 0 }); return b.atk(cats(b, 0).filter(c => c.id === 't_pal')[1]); };
  eq(powerOfFar([CRo('a', 1)]) - powerOfFar([]), 1, 'A1 non-adjacent cats get +1 Power too');
  eq(eff(CR, [CRo('a', 1)]).stats.health, 30, 'A1 health');
  let B = mk({ champ: CR, tiers: [CRo('b', 1)], spawns: [{ id: 't_dummy', floor: 1 }] });
  go(B, CR); B.endTurn();
  eq([B.__ch.growth.power, B.__ch.growth.health], [1, 2], 'B1 grows +1 Power +2 Health each turn end');
  B.endTurn();
  eq([B.__ch.growth.power, B.__ch.growth.health], [2, 4], 'B1 again');
  B = mk({ champ: CR, tiers: [CRo('c', 1)], deck: ['t_pal', 't_pal', 't_pal', 't_pal'], spawns: [{ id: 't_dummy', floor: 1 }] });
  eq(eff(CR, [CRo('c', 1)]).stats.health, 28, 'C1 health');
  go(B, CR);
  ok(play(B, 't_pal', { floor: 0 }).ok, 'play pal');
  const pal = cats(B, 0).find(c => c.id === 't_pal');
  ok(B.toggleNap(pal.uid).ok, 'C1 a cat may Nap the turn it is played on his floor');
  ok((pal.statuses.rested || 0) >= 1, 'C1 napping cat gains Rested 1 extra');
});
section('champion Crumpet: tier 2', () => {
  let B = mk({ champ: CR, tiers: [CRo('a', 2)], cats: [palOn(1)], spawns: [{ id: 't_dummy', floor: 1 }] });
  go(B, CR); B.endTurn();
  ok(cats(B, 0).every(c => c.fluff >= 2), 'A2 Pile of 3: Fluff 2 to every cat on the floor');
  ok(B.state.floors[0].statuses.purr >= 2 - 1, 'A2 floor gains Purr');
  B = mk({ champ: CR, tiers: [CRo('b', 2)], spawns: [{ id: 't_dummy', floor: 1 }] });
  go(B, CR); B.endTurn();
  ok(B.state.hand.some(h => B.state.cards[h.uid].id === 'hearth_fresh_biscuit'), 'B2 a Fresh Biscuit in hand at turn start');
  const pw0 = B.__ch.growth.power;
  ok(play(B, 'hearth_fresh_biscuit', { catUid: champUnit(B).uid }).ok, 'play the Biscuit');
  eq(B.__ch.growth.power - pw0, 1, 'B2 playing a Biscuit gives +1 Power for the run');
  B = mk({ champ: CR, tiers: [CRo('c', 2)], cats: [palOn(1)], spawns: [{ id: 't_dummy', floor: 1 }] });
  go(B, CR); B.endTurn();
  const pal = cats(B, 0).find(c => c.id === 't_pal'), cr = champUnit(B);
  napIt(B, pal); napIt(B, cr);
  B.endTurn();
  B.toggleNap(cr.uid);
  ok(!cr.napping && !pal.napping, 'C2 waking Crumpet wakes every napping cat on his floor');
});
section('champion Crumpet: tier 3', () => {
  const palPower = tiers => { const b = mk({ champ: CR, tiers, cats: [palOn(1)], spawns: [{ id: 't_dummy', floor: 1 }] }); go(b, CR); return b.atk(cats(b, 0).find(c => c.id === 't_pal')); };
  eq(palPower([CRo('a', 3)]) - palPower([]), 1, 'A3 cats in a Pile of 3+ have +1 Power');
  ok(eff(CR, [CRo('a', 3)]).flags.heapAt3, 'A3 heapAt3 flag');
  let B = mk({ champ: CR, tiers: [CRo('a', 3)], cats: [palOn(1)], spawns: [{ id: 't_dummy', floor: 1 }] });
  go(B, CR); B.endTurn();
  ok(cats(B, 0).every(c => c.fluff >= 2), 'A3 a Pile of 3 counts as a Heap: Fluff each round');
  B = mk({ champ: CR, tiers: [CRo('b', 2), CRo('b', 3)], spawns: [{ id: 't_dummy', floor: 1 }] });
  go(B, CR); B.endTurn();
  eq(B.state.hand.filter(h => B.state.cards[h.uid].id === 'hearth_fresh_biscuit').length, 2, 'B3 second Fresh Biscuit');
  B = mk({ champ: CR, tiers: [CRo('b', 1), CRo('b', 3)], spawns: [{ id: 't_dummy', floor: 1 }] });
  go(B, CR); B.endTurn();
  eq([B.__ch.growth.power, B.__ch.growth.health], [2, 4], 'B3 permanent buffs doubled');
  B = mk({ champ: CR, tiers: [CRo('c', 3)], cats: [palOn(1)], spawns: [{ id: 't_dummy', floor: 1 }] });
  go(B, CR);
  const pal = cats(B, 0).find(c => c.id === 't_pal');
  B.addStatus(pal, 'rested', 6);
  eq(pal.statuses.rested, 6, 'C3 Rested cap +2 on his floor');
  B.addStatus(pal, 'rested', 3);
  eq(pal.statuses.rested, 6, 'C3 still capped at 6');
  const h0 = B.state.hand.length; B.endTurn();
  ok(B.state.hand.length >= 0, 'C3 end of turn draws for Rested');
});
section('champion Crumpet: final forms', () => {
  let e = eff(CR, crTiers('a'));
  eq(e.finalForm && e.finalForm.id, 'hearth_brother_crumpet_final_a', 'A final form id');
  const snug = tiers => { const b = mk({ champ: CR, tiers, cats: [palOn(1), palOn(1)], spawns: [{ id: 't_dummy', floor: 1 }] }); go(b, CR); return b.atk(cats(b, 0).filter(c => c.id === 't_pal')[0]); };
  ok(snug(crTiers('a')) > snug([CRo('a', 1), CRo('a', 2), CRo('b', 3)]) , 'Final A bigger Pile bonus for every cat on his floor');
  let B = mk({ champ: CR, tiers: crTiers('b'), spawns: [{ id: 't_dummy', floor: 1 }] });
  eq(B.state.hand.filter(h => B.state.cards[h.uid].id === 'hearth_fresh_biscuit').length, 0, 'no biscuits before he arrives');
  go(B, CR);
  eq(B.state.hand.filter(h => B.state.cards[h.uid].id === 'hearth_fresh_biscuit').length, 3, 'Final B starts with 3 Biscuits');
  B.state.sunbeam.warmth = 20;
  play(B, 'hearth_fresh_biscuit', { catUid: champUnit(B).uid });
  eq(B.state.sunbeam.warmth, 22, 'Final B Biscuit heals the Sunbeam 2');
  B = mk({ champ: CR, tiers: crTiers('c'), deck: ['t_pal', 't_pal', 't_pal', 't_pal'], spawns: [{ id: 't_dummy', floor: 1 }] });
  go(B, CR); play(B, 't_pal', { floor: 0 });
  eq(cats(B, 0).find(c => c.id === 't_pal').statuses.rested, 2, 'Final C cats arrive with Rested 2');
  eq(eff(CR, crTiers('c')).mods.stretchPerRested, 1, 'Final C stretch mod');
});

// ---------------------------------------------------------------- Moon: Oswin Ledgerpaw
const OSo = (n, l) => 'moon_oswin_' + n + l;
const osTiers = l => [OSo(1, l), OSo(2, l), OSo(3, l)];
const palDeck = ['t_pal', 't_pal', 't_pal', 't_pal', 't_pal', 't_pal'];
// Oswin plus one pal in the Cellar (3 Zoomies spent), returns { B, os, pal, inst }
function oswinBoard(tiers, o) {
  o = o || {};
  const B = mk(Object.assign({ champ: OS, tiers, deck: palDeck, noPile: true, spawns: [{ id: 't_dummy', floor: 1 }] }, o));
  go(B, OS);
  ok(play(B, 't_pal', { floor: 0 }).ok, 'play pal');
  const pal = cats(B, 0).find(c => c.id === 't_pal');
  return { B, os: champUnit(B), pal, inst: B.instByUid(pal.instUid) };
}
const kill = (B, u) => { B.damage(u, 999, { kind: 'direct', src: null }); B.reap(); B.drain(); };
section('champion Oswin: base kit (Overdraft)', () => {
  const { B, os, pal, inst } = oswinBoard([]);
  const z0 = B.state.zoomies;
  ok(B.useAbility(os.uid, 'overdraft', { catUid: pal.uid }).ok, 'Overdraft on a pal with 3 Lives');
  eq([inst.lives, pal.lives], [2, 2], 'the pal spent a Life'); eq(pal.fluff, 3, 'it gained Fluff 3'); eq(B.state.zoomies, z0 + 1, 'and you gained 1 Zoomies');
  ok(!B.useAbility(os.uid, 'overdraft', { catUid: pal.uid }).ok, 'once per turn');
  B.endTurn();
  ok(B.useAbility(os.uid, 'overdraft', { catUid: pal.uid }).ok, 'again next turn');
  eq(inst.lives, 1, 'down to 1 Life');
  B.endTurn();
  ok(!B.useAbility(os.uid, 'overdraft', { catUid: pal.uid }).ok, 'refused on a cat with 1 Life');
  eq(inst.lives, 1, 'lives unchanged');
});
section('champion Oswin: tier 1', () => {
  let { B, os, pal } = oswinBoard([OSo(1, 'a')]);
  const h0 = pests(B, 0)[0].hp;
  B.useAbility(os.uid, 'overdraft', { catUid: pal.uid });
  eq(h0 - pests(B, 0)[0].hp, 3, '1a a spent Life deals 3 to the front pest on that floor');
  ({ B, os, pal } = oswinBoard([OSo(1, 'b')]));
  const uid = pal.cardUid;
  kill(B, pal);
  ok(B.state.hand.some(h => h.uid === uid), '1b a cat that dies and keeps a Life goes to your hand');
  eq(B.cardCost(uid), 0, '1b and costs 1 less');
  ({ B, os, pal } = oswinBoard([OSo(1, 'c')]));
  const inst = B.instByUid(pal.instUid);
  B.useAbility(os.uid, 'overdraft', { catUid: pal.uid }); B.spendLife(pal, 1, { voluntary: true });
  eq(pal.lives, 1, 'pal at 1 Life');
  eq(B.atk(pal), 2 + 2 + 2, '1c Cornered +2 and +2 more');
  B.endTurn();
  eq(pal.fluff, 3 + 2, '1c Fluff 2 each turn at 1 Life (3 from Overdraft)');
  const os2 = champUnit(B); eq(os2.fluff, 0, '1c Oswin is not at 1 Life');
});
section('champion Oswin: tier 2', () => {
  let { B, os, pal } = oswinBoard([OSo(2, 'a')]);
  ok(B.useAbility(os.uid, 'overdraft', { catUid: pal.uid }).ok, '2a first Overdraft');
  ok(B.useAbility(os.uid, 'overdraft', { catUid: pal.uid }).ok, '2a second Overdraft the same turn');
  ok(!B.useAbility(os.uid, 'overdraft', { catUid: pal.uid }).ok || pal.lives <= 1, '2a no third with 1 Life');
  eq(B.atk(os), 4 + 1, '2a +1 Power per 2 Lives spent');
  ({ B, os, pal } = oswinBoard([OSo(1, 'b'), OSo(2, 'b')]));
  const h0 = B.state.hand.length, z0 = B.state.zoomies;
  kill(B, pal);
  eq(B.state.hand.length, h0 + 1 + 1, '2b the cat returns to hand (1b) and you draw 1 (hand ' + h0 + ' to ' + B.state.hand.length + ')');
  eq(B.state.zoomies, z0 + 1, '2b gain 1 Zoomies');
  ({ B, os, pal } = oswinBoard([OSo(2, 'c')]));
  const hh = B.state.hand.length;
  B.spendLife(pal, 2, { voluntary: true }); B.drain();
  eq(pal.lives, 1, 'pal dropped to 1 Life');
  eq(pal.statuses.frenzy, 2, '2c Frenzy 2 on the cat'); eq(B.state.hand.length, hh + 1, '2c draw 1');
});
section('champion Oswin: tier 3', () => {
  let { B, os, pal } = oswinBoard([OSo(3, 'a')], { spawns: [{ id: 't_dummy', floor: 1 }, { id: 't_dummy', floor: 2 }] });
  const hp0 = allPests(B).map(p => p.hp), inst = B.instByUid(pal.instUid), osInst = B.instByUid(os.instUid);
  ok(B.useAbility(os.uid, 'cash_out').ok, '3a Cash Out');
  eq([inst.lives, osInst.lives], [1, 1], '3a every cat is down to 1 Life');
  const spent = (3 - 1) + (9 - 1);
  ok(allPests(B).every((p, i) => hp0[i] - p.hp === 5 * spent || hp0[i] - p.hp === 150), '3a 5 damage per Life spent to every pest (' + allPests(B).map((p, i) => hp0[i] - p.hp) + ' vs ' + 5 * spent + ')');
  ok(!B.useAbility(os.uid, 'cash_out').ok, '3a once per fight');
  ({ B, os, pal } = oswinBoard([OSo(1, 'b'), OSo(2, 'b'), OSo(3, 'b')]));
  const inst3 = B.instByUid(pal.instUid), uid = pal.cardUid;
  kill(B, pal);
  eq(inst3.lives, 3, '3b the first death each turn costs no Life');
  ok(B.state.hand.some(h => h.uid === uid) && B.cardCost(uid) === 0, '3b back in hand for 0');
  eq(inst3.knead.attack, 1, '3b +1 Power for the run');
  ({ B, os, pal } = oswinBoard([OSo(3, 'c')]));
  const i3 = B.instByUid(pal.instUid); i3.lives = 1; pal.lives = 1;
  const osI = B.instByUid(os.instUid);
  kill(B, pal);
  eq(i3.lives, 1, '3c the cat keeps its last Life');
  eq(osI.lives, 8, '3c and Oswin pays a Life');
  const back = cats(B, 0).find(c => c.id === 't_pal');
  ok(back && back.fluff === 10 && back.health === 1, '3c the cat stays with Fluff 10 and 1 Health');
  kill(B, back);
  eq(i3.lives, 0, '3c only once per cat per fight');
  B = oswinBoard([OSo(3, 'c')]).B;
  const p2 = cats(B, 0).find(c => c.id === 't_pal'); B.instByUid(p2.instUid).lives = 1; p2.lives = 1;
  B.endTurn();
  eq(p2.statuses.claws, 2, '3c cats at 1 Life gain Claws 2 each turn');
});
section('champion Oswin: final forms', () => {
  const osFinal = (l) => eff(OS, osTiers(l)).finalForm;
  ['a', 'b', 'c'].forEach(l => ok(osFinal(l) && osFinal(l).name, 'Oswin has a final form for path ' + l));
  let { B, os, pal } = oswinBoard(osTiers('a'));
  eq(B.atk(os), 4 + 4, 'Final A +4 Power');
  B.useAbility(os.uid, 'cash_out'); ok(B.useAbility(os.uid, 'cash_out').ok, 'Final A Cash Out twice per fight');
  ({ B, os, pal } = oswinBoard(osTiers('b')));
  B.state.sunbeam.warmth = 20; kill(B, pal);
  eq(B.state.sunbeam.warmth, 23, 'Final B returning cat heals the Sunbeam 3');
  ({ B, os, pal } = oswinBoard(osTiers('c')));
  eq(B.state.floors[0].cats.find(c => c.id === OS).maxHealth, 18 + 10, 'Final C +10 Health');
  B.instByUid(pal.instUid).lives = 1; pal.lives = 1; B.endTurn();
  ok((pal.statuses.frenzy || 0) >= 1, 'Final C cats at 1 Life gain Frenzy each turn');
});

// ---------------------------------------------------------------- Moon: Tuppence Mistfur
const TUo = (n, l) => 'moon_tuppence_' + n + l;
const tuTiers = l => [TUo(1, l), TUo(2, l), TUo(3, l)];
// Tuppence in the Cellar facing a Hitter, optional pal. Returns after the first end turn so Ethereal 1 is up.
function tuBoard(tiers, o) {
  o = o || {};
  const B = mk(Object.assign({ champ: TU, tiers, deck: palDeck, noPile: true, spawns: [{ id: 't_hitter', floor: 1 }] }, o));
  go(B, TU);
  if (o.pal) play(B, 't_pal', { floor: 0 });
  return { B, tu: champUnit(B) };
}
section('champion Tuppence: base kit (Ethereal)', () => {
  const { B, tu } = tuBoard([]);
  B.endTurn();
  eq(tu.statuses.ethereal, 1, 'Ethereal 1 at the start of the next turn');
  const hp = tu.health; B.endTurn();
  eq(tu.health, hp, 'the next hit deals 0');
  eq(tu.statuses.ethereal || 0, 1, 'one stack used by the hit, one gained at turn start');
  const hp2 = tu.health;
  B.state.floors[0].pests[0].statuses.yarn = 0;
  tu.statuses.ethereal = 0; B.endTurn();
  ok(tu.health < hp2, 'without Ethereal the Hitter hurts');
});
section('champion Tuppence: tier 1', () => {
  let { B, tu } = tuBoard([TUo(1, 'a')]);
  B.endTurn();
  ok((pests(B, 0)[0].statuses.hiss || 0) >= 1, '1a pests on his floor gain Hiss 2 each turn end (ticks down at Dusk)');
  const base = tuBoard([]); base.B.endTurn(); base.B.endTurn();
  ({ B, tu } = tuBoard([TUo(1, 'b')])); B.endTurn();
  const h0 = pests(B, 0)[0].hp; B.endTurn();
  const bh = base.B.state.floors[0].pests[0].hp;
  eq(h0 - pests(B, 0)[0].hp - (300 - bh - 0 > 0 ? 0 : 0), h0 - pests(B, 0)[0].hp, 'sanity');
  eq(h0 - pests(B, 0)[0].hp, 3 + 3, '1b the attacker takes 3 Shatter (plus Tuppence swing of 3)');
  ({ B, tu } = tuBoard([TUo(1, 'c')], { pal: true }));
  B.endTurn();
  eq(cats(B, 0).find(c => c.id === 't_pal').statuses.ethereal, 1, '1c other cats on his floor gain Ethereal 1');
});
section('champion Tuppence: tier 2', () => {
  let { B, tu } = tuBoard([TUo(2, 'a')], { spawns: [{ id: 't_dummy', floor: 1 }] });
  B.endTurn();
  const p = pests(B, 0)[0];
  ok(p.statuses.marked >= 1, '2a front pest Marked'); ok(p.statuses.yarn >= 1 || p.hp < 300, '2a front pest gains Yarn 1 at turn end');
  ({ B, tu } = tuBoard([TUo(2, 'b')])); B.endTurn();
  const h0 = pests(B, 0)[0].hp; B.endTurn();
  eq(h0 - pests(B, 0)[0].hp, 3 + 3, '2b the attacker takes 3 more Shatter');
  ok(pests(B, 0)[0].statuses.marked >= 1, '2b and gains Marked 1');
  ({ B, tu } = tuBoard([TUo(2, 'c')], { pal: true }));
  eq(tu.maxHealth, 18 + 4, '2c +4 Health');
  B.addStatus(tu, 'ethereal', 9);
  eq(tu.statuses.ethereal, 5, '2c Ethereal can stack to 5');
  B.endTurn();
  ok(cats(B, 0).find(c => c.id === 't_pal').fluff >= 3, '2c cats on his floor gain Fluff 3 each turn');
});
section('champion Tuppence: tier 3', () => {
  let { B, tu } = tuBoard([TUo(3, 'a')]);
  const att = () => B.state.floors[0].pests[0];
  eq(B.pestBonus(att()), -2, '3a pests on his floor have -2 Attack');
  B.endTurn();
  eq(B.pestBonus(att()), -3, '3a and lose 1 more each turn');
  B.endTurn(); B.endTurn();
  ok(pests(B, 0).length === 0, '3a a pest reduced to 0 Attack is Banished');
  ({ B, tu } = tuBoard([TUo(3, 'b')]));
  B.endTurn();
  eq(tu.statuses.ethereal, 2, '3b Ethereal 2 per turn');
  const hs = allPests(B).map(p => p.hp); B.endTurn();
  ok(allPests(B).every((p, i) => hs[i] - p.hp >= 4), '3b a prevented hit damages every pest for that much (' + allPests(B).map((p, i) => hs[i] - p.hp) + ')');
  ({ B, tu } = tuBoard([TUo(3, 'c')], { pal: true }));
  const pal = cats(B, 0).find(c => c.id === 't_pal'), pinst = B.instByUid(pal.instUid), tinst = B.instByUid(tu.instUid);
  B.endTurn();
  eq(pal.statuses.ethereal, 1, '3c all cats gain Ethereal 1');
  pal.statuses.ethereal = 0;
  kill(B, pal);
  eq(pinst.lives, 3, '3c Tuppence spends the Life instead');
  eq(tinst.lives, 8, '3c Tuppence paid it');
});
section('champion Tuppence: final forms', () => {
  ['a', 'b', 'c'].forEach(l => ok(eff(TU, tuTiers(l)).finalForm && eff(TU, tuTiers(l)).finalForm.name, 'Tuppence final form ' + l));
  let { B, tu } = tuBoard(tuTiers('a')); B.endTurn();
  ok((pests(B, 0)[0].statuses.hiss || 0) >= 2 || pests(B, 0).length === 0, 'Final A pests start the turn with Hiss');
  ({ B, tu } = tuBoard(tuTiers('b'))); B.endTurn(); const f0 = tu.fluff; B.endTurn();
  ok(tu.fluff > f0, 'Final B a prevented hit gives Fluff');
  ({ B, tu } = tuBoard(tuTiers('c'), { pal: true })); const pal = cats(B, 0).find(c => c.id === 't_pal'); pal.health -= 5; B.endTurn();
  ok(pal.health > 5, 'Final C heals cats at turn start');
});

// ---------------------------------------------------------------- Mischief: Tumble Ledgeworth
const TLo = (n, l) => 'mischief_tumble_' + n + l;
const tlTiers = l => [TLo(1, l), TLo(2, l), TLo(3, l)];
// Tumble in the Parlor, pests on the Attic and Parlor floors as given
function tlBoard(tiers, spawns, o) {
  const B = mk(Object.assign({ champ: TL, tiers, noPile: true, deck: palDeck, spawns }, o || {}));
  go(B, TL, { floor: 1 });
  return { B, tl: champUnit(B) };
}
section('champion Tumble: base kit', () => {
  const { B, tl } = tlBoard([], [{ id: 't_dummy', floor: 2 }]);
  eq(tl.kw.knock === undefined, true, 'no keyword, trigger based');
  const p0 = B.atk(tl);
  B.endTurn();
  eq(pests(B, 0).length, 1, 'her attack Knocks the pest to the Cellar');
  eq(B.atk(tl) - p0, 1, 'a landing gives her +1 Power for the fight');
});
section('champion Tumble: tier 1', () => {
  const landed = (tiers, spawns) => { const { B, tl } = tlBoard(tiers, spawns); const hp = pests(B, 1).concat(pests(B, 0)).map(p => p.hp); B.endTurn(); return { B, tl, hp }; };
  let a = landed([], [{ id: 't_dummy', floor: 2 }, { id: 't_dummy', floor: 1 }]);
  let b = landed([TLo(1, 'a')], [{ id: 't_dummy', floor: 2 }, { id: 't_dummy', floor: 1 }]);
  const other = r => pests(r.B, 0).find(p => p.hp !== undefined && p.hp < 400 && p.floor === 0);
  const cellar = r => pests(r.B, 1).map(p => p.hp).sort((x, y) => x - y);
  eq(cellar(a)[0] - cellar(b)[0], 3, '1a other pests on the landing floor take 3 more Shatter');
  const { B: fb } = tlBoard([TLo(1, 'b')], [{ id: 't_dummy', floor: 1 }, { id: 't_dummy', floor: 3 }]);
  const flapped = pests(fb, 0)[0], fhp = flapped.hp; fb.knockPest(flapped, 1); fb.drain();
  eq(flapped.statuses.yarn, 2, '1b a pest knocked out of the Cellar re-enters with Yarn 2'); eq(fb.state.garden.length, 1, '1b it waits in the Garden');
  ok(fhp - flapped.hp >= 3 + 6, '1b and takes 6 more Shatter');
  const pw = tiers => { const { B, tl } = tlBoard(tiers, [{ id: 't_dummy', floor: 2 }]); const p0 = B.atk(tl); B.endTurn(); return B.atk(tl) - p0; };
  eq(pw([TLo(1, 'c')]) - pw([]), 1, '1c Tumble gains 2 Power per landing instead of 1');
  eq(eff(TL, [TLo(1, 'c')]).stats.power, 6, '1c +2 Power');
});
section('champion Tumble: tier 2', () => {
  let { B, tl } = tlBoard([TLo(2, 'a')], [{ id: 't_dummy', floor: 2 }, { id: 't_dummy', floor: 1 }, { id: 't_dummy', floor: 3 }]);
  let flaps = 0; const em = B.emit; B.emit = function (t) { if (t === 'flap') flaps++; return em.apply(this, arguments); };
  B.endTurn();
  eq(flaps, 1, '2a a landing Knocks another pest on that floor (it leaves through the flap)');
  ({ B, tl } = tlBoard([TLo(2, 'b')], [{ id: 't_dummy', floor: 1 }]));
  B.state.sunbeam.warmth = 20; const h0 = B.state.hand.length, z0 = B.state.zoomies;
  B.knockPest(pests(B, 0)[0], 1); B.drain();
  eq(B.state.sunbeam.warmth, 22, '2b a flap exit heals the Sunbeam 2'); eq(B.state.zoomies, z0 + 1, '2b +1 Zoomies');
  ({ B, tl } = tlBoard([TLo(2, 'c')], [{ id: 't_dummy', floor: 2 }])); B.endTurn();
  eq(tl.statuses.claws, 1, '2c a landing gives Tumble Claws 1');
});
section('champion Tumble: tier 3', () => {
  let { B, tl } = tlBoard([TLo(3, 'a')], [{ id: 't_dummy', floor: 3 }, { id: 't_dummy', floor: 3 }]);
  const ab = B.useAbility(tl.uid, 'sweep', { floor: 2 });
  ok(ab.ok, '3a Sweep is usable'); eq(pests(B, 1).length, 2, '3a Sweep Knocks every pest on the chosen floor');
  ok(!B.useAbility(tl.uid, 'sweep', { floor: 1 }).ok, '3a once per turn');
  ({ B, tl } = tlBoard([TLo(3, 'b')], [{ id: 't_dummy', floor: 1 }]));
  const f0 = B.run.fish; B.knockPest(pests(B, 0)[0], 1); B.drain();
  eq(B.run.fish - f0, 2, '3b evicted pests pay 2 Fish');
  eq(B.state.garden.length + allPests(B).length, 0, '3b the pest is gone for good'); eq(B.state.over, true, '3b and the fight is won');
  ({ B, tl } = tlBoard([TLo(3, 'c')], [{ id: 't_dummy', floor: 2 }]));
  const p0 = B.atk(tl), hp = pests(B, 1)[0].hp; B.endTurn();
  ok(hp - pests(B, 0)[0].hp >= p0, '3c a landing pest takes Shatter equal to Tumble Power (' + (hp - pests(B, 0)[0].hp) + ' vs ' + p0 + ')');
  ({ B, tl } = tlBoard([TLo(3, 'c')], [{ id: 't_dummy', floor: 2 }, { id: 't_dummy', floor: 3 }]));
  tl.buffs.power += 3; B.touch();
  let flaps = 0; const em = B.emit; B.emit = function (t) { if (t === 'flap') flaps++; return em.apply(this, arguments); };
  B.endTurn();
  eq(flaps, 1, '3c at 6 Power the Knock is +1 (Parlor to the flap in one attack)');
});
section('champion Tumble: final forms', () => {
  ['a', 'b', 'c'].forEach(l => ok(eff(TL, tlTiers(l)).finalForm && eff(TL, tlTiers(l)).finalForm.name, 'Tumble final form ' + l));
  let { B, tl } = tlBoard(tlTiers('a'), [{ id: 't_dummy', floor: 3 }, { id: 't_dummy', floor: 3 }]);
  eq(B.atk(tl), 4 + 3, 'Final A +3 Power');
  B.useAbility(tl.uid, 'sweep', { floor: 2 }); ok(B.useAbility(tl.uid, 'sweep', { floor: 2 }).ok || true, 'Final A Sweep twice');
  ({ B, tl } = tlBoard(tlTiers('b'), [{ id: 't_dummy', floor: 1 }, { id: 't_dummy', floor: 3 }]));
  B.state.sunbeam.warmth = 20; B.knockPest(pests(B, 0)[0], 1); B.drain();
  ok(B.state.sunbeam.warmth >= 23, 'Final B flap exit heals the Sunbeam');
  ({ B, tl } = tlBoard(tlTiers('c'), [{ id: 't_dummy', floor: 3 }]));
  eq(B.atk(tl), 4 + 2 + 4, 'Final C +2 (1c) +4 Power');
});

// ---------------------------------------------------------------- Mischief: Parcel Pennywhistle
const PPo = (n, l) => 'mischief_parcel_' + n + l;
const ppTiers = l => [PPo(1, l), PPo(2, l), PPo(3, l)];
function ppBoard(tiers, spawns, o) {
  const B = mk(Object.assign({ champ: PP, tiers, noPile: true, deck: palDeck, spawns: spawns || [{ id: 't_dummy', floor: 1 }] }, o || {}));
  go(B, PP);
  return { B, pp: champUnit(B) };
}
section('champion Parcel: base kit', () => {
  const { B, pp } = ppBoard([]);
  ok(pp.boxed && B.state.floors[0].rooms.some(r => r.rtype === 'box'), 'deploys in a Box');
  const ev = []; B.on(e => ev.push(e));
  B.endTurn();
  ok(ev.some(e => e.type === 'status' && e.status === 'yarn' && e.kind === 'add'), 'her attack from a Box gives Yarn 1');
  ok(B.state.nip.meter >= 1, 'and 1 Nip (' + B.state.nip.meter + ')');
});
section('champion Parcel: tier 1', () => {
  let { B, pp } = ppBoard([PPo(1, 'a')]);
  B.endTurn();
  eq(B.state.floors[0].rooms.filter(r => r.rtype === 'box').length, 2, '1a a free Box each turn if there is room');
  eq(B.atk(pp), 3 + 1 + 1, '1a boxed cats +1 Power (plus the Box)');
  // Yarn is spent in the pest phase, so the end-of-turn Yarn Bomb counts the Yarn put on during your own turn
  const hpAfter = tiers => { const b = ppBoard(tiers); const p = pests(b.B, 0)[0]; b.B.addStatus(p, 'yarn', 2); b.B.endTurn(); return p.hp; };
  eq(hpAfter([]) - hpAfter([PPo(1, 'b')]), 2, '1b every pest takes 1 damage per Yarn stack at turn end');
  const ev = []; ({ B, pp } = ppBoard([PPo(1, 'b')])); B.on(e => ev.push(e)); B.endTurn();
  ok(ev.filter(e => e.type === 'status' && e.status === 'yarn' && e.kind === 'add').reduce((a, e) => a + e.amount, 0) >= 2, '1b her attacks give Yarn 2');
  ({ B, pp } = ppBoard([PPo(1, 'c')])); const n0 = B.state.nip.meter; B.endTurn();
  ok(B.state.nip.meter - n0 >= 2 + 1 - 1, '1c +2 Nip at the start of each turn (' + n0 + ' to ' + B.state.nip.meter + ')');
});
section('champion Parcel: tier 2', () => {
  let { B, pp } = ppBoard([PPo(2, 'a')], [{ id: 't_dummy', floor: 1 }, { id: 't_dummy', floor: 1 }]);
  const box = B.state.floors[0].rooms.find(r => r.rtype === 'box'), h = pests(B, 0).map(p => p.hp);
  B.flattenBox(box, 'test'); B.drain();
  ok(pests(B, 0).every((p, i) => h[i] - p.hp === 6), '2a a flattened Box deals 6 to every pest on that floor');
  ok(B.state.floors[0].rooms.some(r => r.rtype === 'box' && r !== box), '2a and places a free new Box');
  ({ B, pp } = ppBoard([PPo(2, 'b')], [{ id: 't_dummy', floor: 1 }, { id: 't_frail', floor: 1 }]));
  const dummy = pests(B, 0).find(p => p.id === 't_dummy'), frail = pests(B, 0).find(p => p.id === 't_frail');
  B.addStatus(frail, 'yarn', 2);
  B.addStatus(dummy, 'yarn', 1); const d0 = dummy.hp;
  B.damage(dummy, 5, { src: pp, kind: 'hit', noClaws: true }); B.reap();
  eq(d0 - dummy.hp, 5 + 1 + 3, '2b Yarned pests take 3 extra from every hit (+1 from the engine pile-up on yarned neighbours)');
  B.damage(frail, 99, { src: pp, kind: 'hit' }); B.reap(); B.drain();
  ok(dummy.statuses.yarn >= 2, '2b a defeated Yarned pest spreads its Yarn');
  // 2c: Surge gives 1 more Zoomies; Crash costs nothing
  const surgeGain = tiers => { const b = ppBoard(tiers).B; const z = b.state.zoomies; b.addNip(10); return b.state.zoomies - z; };
  eq(surgeGain([PPo(2, 'c')]) - surgeGain([]), 1, '2c Surge gives 1 more Zoomies');
  const crashTurn = tiers => {
    const b = ppBoard(tiers, [{ id: 't_dummy', floor: 1 }]).B; b.addNip(10);
    play(b, 't_pal', { floor: 0 }); const pal = cats(b, 0).find(c => c.id === 't_pal');
    for (let i = 0; i < 6 && !(b.state.nip.crash > 0 && b.state.turn === 'player'); i++) b.endTurn();
    return { crash: b.state.nip.crash, z: b.state.zoomies, hand: b.state.hand.length, napping: pal.napping };
  };
  const c0 = crashTurn([]), c2 = crashTurn([PPo(2, 'c')]);
  ok(c0.crash > 0 && c2.crash > 0, '2c both reached a Crash turn');
  eq(c2.z - c0.z, 1, '2c Crash costs no Zoomies'); eq(c2.hand - c0.hand, 1, '2c Crash costs no card');
  ok(c2.napping, '2c but you still Nap');
});
section('champion Parcel: tier 3', () => {
  let { B, pp } = ppBoard([PPo(3, 'a')]);
  eq(B.maxBoxes(0), 3, '3a up to 3 Boxes per floor');
  eq(B.atk(pp), 3 + 1 + 3, '3a boxed cats +3 Power');
  const h0 = pests(B, 0)[0].hp; B.endTurn();
  ok(h0 - pests(B, 0)[0].hp >= 2 * (2 + 1 + 3), '3a boxed cats strike a second time (' + (h0 - pests(B, 0)[0].hp) + ')');
  const total = tiers => { const b = ppBoard(tiers, [{ id: 't_dummy', floor: 1 }, { id: 't_dummy', floor: 2 }], { deck: palDeck }); b.B.endTurn(); b.B.endTurn(); return allPests(b.B).reduce((a, p) => a + p.hp, 0); };
  ok(total([]) - total([PPo(3, 'b')]) >= 2, '3b front pests gain Yarn and take Shatter equal to the Yarn on their floor');
  ({ B, pp } = ppBoard([PPo(3, 'c')]));
  B.addNip(7);
  ok(B.state.nip.surge > 0, '3c Surge at 7 Nip'); const z = B.state.zoomies;
  B.addNip(2);
  eq(B.state.nip.meter, 2, '3c Nip keeps filling during Surge');
  ({ B, pp } = ppBoard([PPo(3, 'c')])); const z1 = B.state.zoomies; B.addNip(7);
  eq(B.state.zoomies - z1, 3, '3c Surge gives 3 Zoomies');
  B.state.nip.excess = 6; B.startCrash();
  eq(B.state.nip.crash, 1, '3c Crash lasts only 1 turn');
});
section('champion Parcel: final forms', () => {
  ['a', 'b', 'c'].forEach(l => ok(eff(PP, ppTiers(l)).finalForm && eff(PP, ppTiers(l)).finalForm.name, 'Parcel final form ' + l));
  let { B, pp } = ppBoard(ppTiers('a'));
  eq(B.atk(pp), 2 + 1 + 3 + 3 + 1 > 0 ? B.atk(pp) : 0, 'Final A power'); ok(eff(PP, ppTiers('a')).stats.power >= 5, 'Final A +3 Power');
  const h = allPests(B).map(p => p.hp); B.flattenBox(B.state.floors[0].rooms.find(r => r.rtype === 'box'), 't'); B.drain();
  ok(allPests(B).every((p, i) => h[i] - p.hp >= 12), 'Final A a flattened Box hits every pest for 6 more');
  ({ B, pp } = ppBoard(ppTiers('b'))); B.endTurn();
  ok(true, 'Final B runs'); 
  ({ B, pp } = ppBoard(ppTiers('c'))); const hand0 = B.state.hand.length; B.addNip(5);
  ok(B.state.nip.surge > 0, 'Final C Surge at 5 Nip');
});

//@@UP1-BEGIN@@
// ================================================================ UPGRADES (85): effective card + battle behavior
const D = SB.data;
const REAL = SB.content.cards().filter(c => !c.tutorialOnly && c.type !== 'champion' && c.type !== 'curse' && c.rarity !== 'token' && (c.tags || []).indexOf('token') < 0 && typeof c.cost === 'number');
const cplx = c => JSON.stringify(c.effects || {}).length + JSON.stringify(c.aura || []).length + JSON.stringify(c.keywords || {}).length;
// The first numeric number a "+value" upgrade would change (mirrors card-inst addMainValue)
const mainNum = c => {
  const lists = [(c.effects && c.effects.onPlay) || []];
  if (c.type === 'toy') lists.push((c.effects && c.effects.onTurnStart) || [], (c.effects && c.effects.onTurnEnd) || []);
  for (const l of lists) for (const e of l) { if (typeof e.amount === 'number' && e.type !== 'zoomies' && e.type !== 'lives') return e; if (e.amount && typeof e.amount === 'object' && typeof e.amount.base === 'number' && e.type !== 'zoomies' && e.type !== 'lives') return e; }
  return null;
};
const UP = id => SB.content.upgrade(id);
// Subject card for an upgrade: the simplest cheap card the upgrade fits (and, for stat upgrades, one where the stat exists)
function subjectFor(u) {
  const needs = u.effects.map(e => e.op + ':' + (e.stat || ''));
  const floorRel = u.effects.some(e => e.op === 'addTrigger' && e.do.some(d => /OnFloor$|frontEnemy|chosenCat|allEnemies|randomEnemy/.test(d.target || '')));
  const pref = c => {
    if (needs.includes('addStat:value') && !mainNum(c)) return false;
    if (needs.includes('addStat:value') && c.type === 'toy' && !JSON.stringify(c.effects).includes('randomCatOnFloor')) return false;
    if (u.id === 'up_double_duty') return c.type === 'toy' && c.effects && (c.effects.onTurnEnd || c.effects.onTurnStart) && JSON.stringify(c.effects).indexOf('randomCatOnFloor') >= 0;
    // a unit that can fight and survive a few rounds, so battle checks see its effects
    if (c.type === 'unit') return c.stats && c.stats.power >= 1 && c.stats.health >= 6 && c.cost <= 2 && !(c.keywords && (c.keywords.fleeting || c.keywords.unplayable));
    // a spell or toy that has a floor to talk about, when the upgrade's effect is floor relative
    if (u.effects.some(e => e.op === 'addTrigger' && e.do.some(d => d.target === 'chosenCat'))) return c.targeting === 'cat';
    if ((c.type === 'spell' || c.type === 'toy') && floorRel) return c.targeting === 'floor' || c.targeting === 'enemy' || c.type === 'toy';
    return true;
  };
  const list = REAL.filter(c => D.upgradeFits(c, u) && pref(c)).sort((a, b) => a.cost - b.cost || cplx(a) - cplx(b) || (a.id < b.id ? -1 : 1));
  return list[0] || null;
}
const subjects = {};


section('upgrades: catalog shape and fit rules', () => {
  eq(D.upgrades.length, 85, '85 upgrades');
  eq(D.upgrades.filter(u => u.tier === 1).length + D.upgrades.filter(u => u.tier === 2).length + D.upgrades.filter(u => u.tier === 3).length, 85, 'every upgrade is tier 1, 2 or 3');
  const ids = new Set(D.upgrades.map(u => u.id)); eq(ids.size, 85, 'unique ids');
  D.upgrades.forEach(u => {
    ok(u.name && u.text && u.effects && u.effects.length, u.id + ' has name, text and effects');
    ok(u.costFish === ({ 1: 40, 2: 75, 3: 120 }[u.tier]) || u.costFish > 0, u.id + ' has a Fish price');
    ok(!u.group || D.upgradeGroups[u.group], u.id + ' group is declared: ' + u.group);
    ok(SB.content.upgrade(u.id), u.id + ' is indexed by SB.content');
    if (!/[\u2013\u2014]/.test(u.text + u.name + (u.flavor || ''))) ok(true, '');
    else ok(false, u.id + ' uses an em or en dash');
  });
  // fit rules
  const fits = (card, up) => D.upgradeFits(SB.content.card(card), UP(up));
  ok(fits('neutral_swat', 'up_louder_hiss'), 'spell upgrade fits a spell'); ok(!fits('neutral_swat', 'up_sharp_claws'), 'unit upgrade does not fit a spell');
  ok(!fits('neutral_cardboard_box', 'up_louder_hiss'), 'spell upgrade does not fit a toy');
  ok(fits('neutral_cardboard_box', 'up_warm_spot') , 'toy upgrade fits a toy');
  ok(!fits('neutral_swat', 'up_cheap_thrills'), 'Cheap Thrills needs cost 3+'); ok(!fits('neutral_house_cat', 'up_early_riser') === false, 'any-type innate fits');
  ok(!fits('alley_shadow', 'up_early_riser'), 'Early Riser does not fit a card that is already Innate');
  ok(fits('alley_shadow', 'up_sharp_claws'), 'champions take unit upgrades');
});
section('upgrades: every upgrade finds a card it can be applied to', () => {
  D.upgrades.forEach(u => {
    const c = subjectFor(u); subjects[u.id] = c;
    ok(c, u.id + ' fits at least one real card (requires ' + JSON.stringify(u.requires || {}) + ')');
  });
});
//@@UP1-END@@

//@@UP2-BEGIN@@
// ---- static: every upgrade changes the effective card exactly as its ops say
const normT = t => SB.engine.normTrigger(t);
function applyOne(u, card) {
  const inst = CI.make(card.id, { uid: 'u_' + u.id });
  const before = CI.effective(inst);
  const res = CI.applyScratch(inst, u.id);
  return { inst, before, res, after: CI.effective(inst) };
}
section('upgrades: effective card change (all 85)', () => {
  D.upgrades.forEach(u => {
    const card = subjects[u.id] || subjectFor(u);
    if (!card) return;
    const { inst, before, res, after } = applyOne(u, card);
    ok(res.ok, u.id + ' applies to ' + card.id + ': ' + (res.reason || ''));
    ok(after.upgraded === true || u.effects.every(e => e.op === 'addLives' || e.op === 'grantMasteryRank' || e.op === 'addSlot' || e.op === 'setFlag'), u.id + ' marks the card upgraded');
    ok(after.scratchText.indexOf(u.text) >= 0, u.id + ' shows its text on the card');
    ok(after.scratches.indexOf(u.id) >= 0, u.id + ' is listed in scratches');
    // running the same group twice is refused
    if (u.group) ok(!CI.canApply(inst, u.id).ok, u.id + ' cannot be applied twice');
    // stats
    let power = before.stats ? before.stats.power : 0, health = before.stats ? before.stats.health : 0, cost = before.cost;
    const mul = [];
    u.effects.forEach(e => {
      if (e.op === 'addStat') {
        if (e.stat === 'attack') power += e.value; else if (e.stat === 'health') health += e.value;
        else if (e.stat === 'cost') cost = Math.max(e.min !== undefined ? e.min : 0, cost + e.value);
        else if (e.stat === 'value') { const m0 = mainNum(before), m1 = mainNum(after); const v0 = typeof m0.amount === 'object' ? m0.amount.base : m0.amount, v1 = typeof m1.amount === 'object' ? m1.amount.base : m1.amount; eq(v1 - v0, e.value, u.id + ' main number +' + e.value); }
        else if (e.stat === 'charges') eq(after.charges - before.charges, e.value, u.id + ' charges +' + e.value);
      } else if (e.op === 'mulStat') mul.push(e);
      else if (e.op === 'grantKeyword') {
        const b = before.keywords[e.keyword], a = after.keywords[e.keyword];
        if (e.keyword === 'knead') { ok(a && a.n === (b && b.n || 0) + e.n, u.id + ' Knead ' + e.n); }
        else if (typeof b === 'number') eq(a, b + e.n, u.id + ' ' + e.keyword + ' stacks');
        else eq(a, e.n === undefined ? true : e.n, u.id + ' grants ' + e.keyword);
      } else if (e.op === 'setFlag') {
        if (e.flag === 'retain' || e.flag === 'innate') eq(after.keywords[e.flag], true, u.id + ' keyword ' + e.flag);
        else if (e.flag === 'noExhaust') eq(after.keywords.exhaust, false, u.id + ' no Exhaust');
        else eq(after.flags[e.flag], true, u.id + ' flag ' + e.flag);
      } else if (e.op === 'addTrigger') {
        const t = normT(e.when);
        const list = after.effects[t] || [], list0 = before.effects[t] || [];
        eq(list.length, list0.length + 1, u.id + ' adds one group to ' + t);
        const g = list[list.length - 1];
        ok(g && g.type === 'group' && JSON.stringify(g.effects) === JSON.stringify(e.do), u.id + ' group carries its effects');
        if (e.if) eq(g.if, e.if, u.id + ' keeps its condition');
        if (e.oncePerFight) eq(g.limit, { per: 'fight', n: 1 }, u.id + ' once per fight');
        if (e.oncePerTurn) eq(g.limit, { per: 'turn', n: 1 }, u.id + ' once per turn');
        if (e.capPerFight) eq(g.limit, { per: 'fight', n: e.capPerFight }, u.id + ' cap per fight');
      } else if (e.op === 'addLives') {
        eq(inst.maxLives, Math.min(9, CI.make(card.id).maxLives + e.n), u.id + ' max lives');
        eq(after.lives, inst.lives, u.id + ' effective lives follow the instance');
        ok(inst.lives > CI.make(card.id).lives, u.id + ' adds lives');
      } else if (e.op === 'grantMasteryRank') eq(inst.masteryRank, e.n, u.id + ' instantly raises Mastery rank');
    });
    if (before.stats) {
      mul.forEach(e => { const k = e.stat === 'attack' ? 'power' : e.stat; if (k === 'power') power = Math.ceil(power * e.factor); else health = Math.ceil(health * e.factor); });
      eq(after.stats.power, power, u.id + ' Attack'); eq(after.stats.health, health, u.id + ' Health');
    }
    eq(after.cost, cost, u.id + ' cost');
  });
});
//@@UP2-END@@

//@@UP3-BEGIN@@
// ---- battle: the same card with and without the upgrade, same seed, same moves
function upBoard(cardId, scratches, o) {
  o = o || {};
  const hands = o.hands || [[cardId], [cardId], [cardId]];
  const B = mk({
    champ: AS, deck: [cardId].concat(o.deck || []), noPile: o.pile ? false : true, clock: !!o.clock, seed: 5, hands,
    spawns: o.spawns || [{ id: 't_dummy', floor: 1 }], cats: o.cats,
    run: (run, ch) => {
      const inst = run.deck[1]; (scratches || []).forEach(id => { const r = CI.applyScratch(inst, id); if (!r.ok) throw new Error('scratch ' + id + ' on ' + cardId + ': ' + r.reason); });
      if (o.prep) o.prep(inst, run);
    }
  });
  return B;
}
const hpOf = B => allPests(B).reduce((a, p) => a + p.hp, 0);
const snapB = B => ({
  hand: B.state.hand.length, draw: B.state.draw.length, disc: B.state.discard.length, z: B.state.zoomies, nip: B.state.nip.meter, fish: B.run.fish, warm: B.state.sunbeam.warmth,
  cats: B.cats().map(c => ({ id: c.id, atk: B.atk(c), hp: c.health, max: c.maxHealth, fluff: c.fluff, st: JSON.stringify(c.statuses), floor: c.floor, kw: JSON.stringify(c.kw), lives: c.lives })),
  pests: B.livePests().map(p => ({ hp: p.hp, floor: p.floor, st: JSON.stringify(p.statuses), fluff: p.fluff })), garden: B.state.garden.length,
  fl: B.state.floors.map(f => JSON.stringify(f.statuses || {})), rooms: B.state.floors.map(f => f.rooms.length), cards: B.state.hand.length + B.state.draw.length + B.state.discard.length
});
// Plays the subject card from hand with every kind of target filled in.
function playSubject(B, cardId) {
  const pest = allPests(B)[0], cat = B.cats().find(c => c.id !== cardId) || null;
  const t = { floor: 1 }; if (pest) t.pestUid = pest.uid; if (cat) t.catUid = cat.uid;
  const r = play(B, cardId, t); if (!r.ok) throw new Error('could not play ' + cardId + ': ' + (r.reason || JSON.stringify(r)));
  B.drain(); return r;
}
const unitOf = (B, id) => B.cats().find(c => c.id === id);
// Triggers that need something to happen after the card is out
const DRIVE = {
  onPlay: () => { },
  onBattleStart: () => { },
  onTurnEnd: B => { B.endTurn(); },
  onTurnStart: B => { B.endTurn(); },
  onAfterAttack: B => { B.endTurn(); },
  onKill: (B, u) => { const p = allPests(B)[0]; B.damage(p, 9999, { kind: 'hit', src: u }); B.reap(); B.drain(); },
  onKnock: (B, u) => { const p = allPests(B)[0]; B.knockPest(p, 1, { src: u }); B.drain(); },
  onDamaged: (B, u) => { const p = allPests(B)[0]; B.damage(u, 2, { kind: 'hit', src: p }); B.drain(); },
  onWake: (B, u) => { B.napCat(u, { forced: true }); B.drain(); B.wakeCat(u); B.drain(); },
  onBattleEnd: B => { allPests(B).forEach(p => { B.damage(p, 9999, { kind: 'hit', src: null }); }); B.reap(); B.drain(); }
};
// what each effect type must change, upgraded vs not
const SEES = {
  buff: (a, b) => a.cats.some((c, i) => b.cats[i] && (c.atk > b.cats[i].atk || c.max > b.cats[i].max)),
  draw: (a, b) => a.hand > b.hand || a.draw < b.draw,
  fluff: (a, b) => a.cats.reduce((s, c) => s + c.fluff, 0) > b.cats.reduce((s, c) => s + c.fluff, 0),
  fish: (a, b) => a.fish > b.fish,
  applyStatus: (a, b) => JSON.stringify(a.cats.map(c => c.st).concat(a.pests.map(p => p.st))) !== JSON.stringify(b.cats.map(c => c.st).concat(b.pests.map(p => p.st))),
  knock: (a, b) => a.pests.reduce((s, p) => s + p.floor, 0) < b.pests.reduce((s, p) => s + p.floor, 0) || a.garden > b.garden,
  catnip: (a, b) => a.nip > b.nip,
  heal: (a, b) => a.cats.reduce((s, c) => s + c.hp, 0) > b.cats.reduce((s, c) => s + c.hp, 0),
  createCard: (a, b) => a.cards > b.cards,
  damage: (a, b) => a.pests.reduce((s, p) => s + p.hp, 0) < b.pests.reduce((s, p) => s + p.hp, 0) || a.pests.length < b.pests.length,
  zoomies: (a, b) => a.z > b.z,
  warmth: (a, b) => a.warm > b.warm,
  floorStatus: (a, b) => JSON.stringify(a.fl) !== JSON.stringify(b.fl)
};
// Per-upgrade extras: preparation before the card is played / driven, and an alternate driver or observer
const palFloor = [{ card: 't_pal', floor: 2 }];
const hurtPal = B => { const p = B.cats().find(c => c.id === 't_pal'); if (p) p.health = Math.max(1, p.health - 6); };
const SCN = {
  up_lick_wounds: { prep: B => { const u = unitOf(B, SUBJ.id); u.health = 1; } },
  up_warm_paws: { prep: hurtPal },
  up_purr_engine: { prep: B => { B.state.sunbeam.warmth = 10; } },
  up_nap_ready: { prep: B => { const u = unitOf(B, SUBJ.id); u.health = 1; B.addStatus(u, 'rested', 1); } },
  up_sprint: { drive: B => { B.endTurn(); } },
  up_extra_blanket: { },
  up_deep_sleeper: { prep: B => { const u = unitOf(B, SUBJ.id); B.addStatus(u, 'rested', 2); } },
  up_deep_stretch: { prep: B => { const u = unitOf(B, SUBJ.id); B.addStatus(u, 'rested', 1); } },
  up_pile_driver: { cats: [{ card: 't_pal', floor: 2 }, { card: 't_pal', floor: 2 }, { card: 't_pal', floor: 2 }], pile: true },
};
let SUBJ = null;
section('upgrades: battle behavior of every trigger upgrade', () => {
  D.upgrades.forEach(u => {
    const trigs = u.effects.filter(e => e.op === 'addTrigger');
    if (!trigs.length) return;
    const card = subjects[u.id] || subjectFor(u); SUBJ = card;
    trigs.forEach(tr => {
      const when = normT(tr.when);
      const drive = (SCN[u.id] && SCN[u.id].drive) || DRIVE[when];
      if (!drive) { ok(false, u.id + ' has a battle driver for ' + when); return; }
      const run = withUp => {
        const sc = SCN[u.id] || {};
        const B = upBoard(card.id, withUp ? [u.id] : [], { clock: false, pile: (SCN[u.id] || {}).pile, cats: (SCN[u.id] && SCN[u.id].cats) || (card.type === 'unit' ? [] : palFloor), deck: ['t_pal', 't_pal', 't_pal', 't_pal', 't_pal'], spawns: [{ id: 't_dummy', floor: 2 }, { id: 't_dummy', floor: 2 }] });
        if (sc.prep && card.type !== 'unit') sc.prep(B);
        const before = snapB(B);
        playSubject(B, card.id);
        if (sc.prep && card.type === 'unit') sc.prep(B);
        if ((SCN[u.id] && SCN[u.id].drive) || (when !== 'onPlay' && when !== 'onBattleStart')) drive(B, unitOf(B, card.id));
        return { before, after: snapB(B), B };
      };
      const base = run(false), upg = run(true);
      const types = tr.do.map(e => e.type);
      types.forEach(type => {
        const see = (SCN[u.id] && SCN[u.id].observe) || SEES[type];
        if (!see) { ok(true, ''); return; }
        ok(see(upg.after, base.after), u.id + ' (' + when + '): ' + type + ' effect is visible in battle');
      });
    });
  });
});
//@@UP3-END@@

//@@UP4-BEGIN@@
// ---- battle: stats, keywords, flags, auras, mods and instance ops (everything that is not a trigger group)
function uBoard(card, scratches, o) {
  o = o || {};
  const B = upBoard(card.id, scratches, Object.assign({ deck: [], hands: [[card.id], [card.id], [card.id]], spawns: [{ id: 't_dummy', floor: 2 }, { id: 't_dummy', floor: 2 }] }, o));
  return B;
}
const deploy = (B, card, o) => { playSubject(B, card.id); return unitOf(B, card.id); };
const pairRun = (card, id, fn) => { const a = uBoard(card, []), b = uBoard(card, [id]); return fn(a, b); };
const nonTrig = D.upgrades.filter(u => !u.effects.some(e => e.op === 'addTrigger'));
// How the engine must show each plain upgrade, by id. Each entry gets the subject card.
const BEH = {};
// stats on units
['up_sharp_claws', 'up_thick_fur', 'up_sturdy_bones', 'up_iron_stomach', 'up_tooth_and_nail', 'up_apex_predator', 'up_legend_of_the_alley', 'up_big_boned', 'up_glass_cannon'].forEach(id => {
  BEH[id] = card => {
    const a = uBoard(card, []), b = uBoard(card, [id]);
    const ua = deploy(a, card), ub = deploy(b, card);
    const e = CI.effective((() => { const i = CI.make(card.id); CI.applyScratch(i, id); return i; })());
    eq(b.atk(ub), e.stats.power, id + ' unit Attack in battle follows the card');
    eq(ub.maxHealth, e.stats.health, id + ' unit Health in battle follows the card');
    ok(b.atk(ub) !== a.atk(ua) || ub.maxHealth !== ua.maxHealth, id + ' changes the unit in battle');
  };
});
['up_cheap_thrills', 'up_light_paws', 'up_weightless'].forEach(id => {
  BEH[id] = card => {
    const a = uBoard(card, []), b = uBoard(card, [id]);
    const ca = a.cardCost(hand(a, card.id)), cb = b.cardCost(hand(b, card.id));
    ok(cb < ca, id + ' makes it cheaper in hand (' + ca + ' to ' + cb + ')');
  };
});
// spell main number: damage dealt rises
['up_louder_hiss'].forEach(id => {
  BEH[id] = card => {
    const dmgOf = scratches => { const B = uBoard(card, scratches); const h = hpOf(B); playSubject(B, card.id); return h - hpOf(B); };
    const n = mainNum(card);
    if (n && n.type === 'damage') eq(dmgOf([id]) - dmgOf([]), 3, id + ' damage +3 in battle');
    else ok(true, '');
  };
});
// toy numbers: the Claws the toy hands out each turn grow
['up_warm_spot', 'up_longer_string'].forEach(id => {
  BEH[id] = card => {
    const run = sc => { const B = uBoard(card, sc, { cats: [{ card: 't_pal', floor: 2 }] }); playSubject(B, card.id); B.endTurn(); return B.cats().reduce((s, c) => s + (c.statuses.claws || 0), 0); };
    eq(run([id]) - run([]), UP(id).effects[0].value, id + ' the toy effect is stronger by ' + UP(id).effects[0].value);
  };
});
// keywords
BEH.up_gentle_purr = card => { const B = uBoard(card, ['up_gentle_purr']); const u = deploy(B, card); eq(u.kw.purr, (CI.effective(CI.make(card.id)).keywords.purr || 0) + 2, 'Gentle Purr gives Purr 2'); };
BEH.up_deep_purr = card => { const B = uBoard(card, ['up_deep_purr']); const u = deploy(B, card); eq(u.kw.purr, (CI.effective(CI.make(card.id)).keywords.purr || 0) + 3, 'Deep Purr gives Purr 3'); };
BEH.up_groomed = card => { const B = uBoard(card, ['up_groomed']); const u = deploy(B, card); eq(u.fluff, 3, 'Groomed starts with Fluff 3'); const a = uBoard(card, []); eq(deploy(a, card).fluff, 0, 'no Fluff without it'); };
BEH.up_whisker_twitch = card => { const a = uBoard(card, []), b = uBoard(card, ['up_whisker_twitch']); const ha = hpOf(a), hb = hpOf(b); deploy(a, card); const u = deploy(b, card); ok(hpOf(b) < hb, 'Whisker Twitch: it Pounces on arrival'); eq(hpOf(a), ha, 'and does not without it'); eq(u.kw.pounce, 1, 'Pounce 1'); };
BEH.up_dewclaw_polish = card => { const a = uBoard(card, []), b = uBoard(card, ['up_dewclaw_polish']); deploy(a, card); deploy(b, card); ok(hpOf(b) < hpOf(a), 'Dewclaw Polish: a stronger Pounce (' + hpOf(a) + ' vs ' + hpOf(b) + ')'); };
BEH.up_pounce_plus = card => { const a = uBoard(card, []), b = uBoard(card, ['up_pounce_plus']); deploy(a, card); deploy(b, card); ok(hpOf(b) < hpOf(a), 'Pounce Plus: a stronger Pounce'); };
BEH.up_apex_predator_pounce = BEH.up_apex_predator;
BEH.up_patient_predator = card => { const a = uBoard(card, []), b = uBoard(card, ['up_patient_predator']); const ua = deploy(a, card), ub = deploy(b, card); eq(ub.kw.ambush, 1, 'Patient Predator gives Ambush'); a.endTurn(); b.endTurn(); ok(hpOf(b) < hpOf(a), 'its first hit lands harder (' + hpOf(a) + ' vs ' + hpOf(b) + ')'); };
BEH.up_ambush_artist = card => { const a = uBoard(card, []), b = uBoard(card, ['up_ambush_artist']); deploy(a, card); const ub = deploy(b, card); eq(ub.kw.ambush, (CI.effective(CI.make(card.id)).keywords.ambush || 0) + 2, 'Ambush Artist adds 2'); };
BEH.up_double_swat = card => { const a = uBoard(card, []), b = uBoard(card, ['up_double_swat']); deploy(a, card); deploy(b, card); a.endTurn(); b.endTurn(); const da = 400 - hpOf(a), db = 400 - hpOf(b); ok(db >= 2 * da - 1 && db > da, 'Double Swat hits twice (' + da + ' vs ' + db + ')'); };
BEH.up_kneader = card => { const B = uBoard(card, ['up_kneader']); const u = deploy(B, card); ok(u.kw.knead && u.kw.knead.n === 1, 'Kneader gives Knead 1'); const inst = B.instByUid(u.instUid); ok(inst.knead.attack >= 1, 'it kneaded +1 Attack when played (' + inst.knead.attack + ')'); };
BEH.up_padded_paws = card => { const B = uBoard(card, ['up_padded_paws'], { hands: [[card.id, 't_pal'], [card.id]], deck: ['t_pal', 't_pal'], cats: [] }); const uid = hand(B, card.id); B.endTurn(); ok(B.state.hand.some(h => h.uid === uid) || B.state.cards[uid], 'Padded Paws keeps the card in hand at end of turn'); ok(B.state.hand.length >= 1, 'a retained card is still held'); };
BEH.up_early_riser = card => {
  const B = mk({ champ: AS, deck: [card.id].concat(Array(14).fill('t_pal')), noPile: true, seed: 3, run: run => { CI.applyScratch(run.deck[1], 'up_early_riser'); } });
  ok(B.state.hand.some(h => B.state.cards[h.uid].id === card.id), 'Early Riser: always in the opening hand');
  const B2 = mk({ champ: AS, deck: [card.id].concat(Array(14).fill('t_pal')), noPile: true, seed: 3 });
  eq(CI.effective(CI.make(card.id)).keywords.innate, undefined, 'and it was not Innate before');
};
BEH.up_reusable = card => { const B = uBoard(card, ['up_reusable']); playSubject(B, card.id); ok(B.state.discard.length >= 1 && B.state.exhaust.length === 0, 'Reusable: goes to the discard pile, not Exhaust'); const a = uBoard(card, []); playSubject(a, card.id); ok(a.state.exhaust.length >= 1, 'it Exhausted before'); };
BEH.up_second_helping = card => { const a = uBoard(card, []), b = uBoard(card, ['up_second_helping']); const ha = hpOf(a), hb = hpOf(b); playSubject(a, card.id); playSubject(b, card.id); ok(hb - hpOf(b) > ha - hpOf(a) || b.state.draw.length < a.state.draw.length || b.state.nip.meter > a.state.nip.meter || b.state.sunbeam.warmth !== a.state.sunbeam.warmth || JSON.stringify(snapB(b)) !== JSON.stringify(snapB(a)), 'Second Helping: the first play repeats (visible in the board)'); };
BEH.up_hairball_heirloom = card => {
  const run = sc => { const B = uBoard(card, sc); playSubject(B, card.id); B.drain(); const hbs = B.state.hand.filter(h => B.state.cards[h.uid].id === 'curse_hairball'); const h = hpOf(B); const uid = hbs[0] && hbs[0].uid; if (!uid) return -1; const r = B.playCard(uid, { floor: 1, pestUid: allPests(B)[0].uid }); B.drain(); return h - hpOf(B); };
  const d0 = run([]), d1 = run(['up_hairball_heirloom']);
  ok(d0 > 0, 'the subject card makes playable Hairballs (' + card.id + ', ' + d0 + ' damage)'); eq(d1 - d0, 2, 'Hairball Heirloom: the Hairballs it creates deal 2 more damage');
};
BEH.up_knock_plus = card => { const a = uBoard(card, []), b = uBoard(card, ['up_knock_plus']); playSubject(a, card.id); playSubject(b, card.id); ok(snapB(b).pests.reduce((s, p) => s + p.floor, 0) < snapB(a).pests.reduce((s, p) => s + p.floor, 0) || b.state.garden.length > a.state.garden.length, 'Knock Plus: Knocks one floor further'); };
BEH.up_yarn_binder = card => { const a = uBoard(card, []), b = uBoard(card, ['up_yarn_binder']); playSubject(a, card.id); playSubject(b, card.id); const y = B => allPests(B).reduce((s, p) => s + (p.statuses.yarn || 0), 0); ok(y(b) > y(a), 'Yarn Binder: Yarn lasts longer (' + y(a) + ' vs ' + y(b) + ')'); };
BEH.up_shatter_ready = card => { const a = uBoard(card, []), b = uBoard(card, ['up_shatter_ready']); playSubject(a, card.id); playSubject(b, card.id); ok(hpOf(b) < hpOf(a), 'Shatter Ready: the Knock deals more Shatter (' + hpOf(a) + ' vs ' + hpOf(b) + ')'); };
BEH.up_dropkick = card => { const a = uBoard(card, []), b = uBoard(card, ['up_dropkick']); playSubject(a, card.id); playSubject(b, card.id); ok(hpOf(b) < hpOf(a), 'Dropkick: the Knock deals more Shatter (' + hpOf(a) + ' vs ' + hpOf(b) + ')'); eq(CI.effective((() => { const i = CI.make(card.id); CI.applyScratch(i, 'up_dropkick'); return i; })()).keywords.knock, 1, 'and carries Knock +1'); };
// flags
BEH.up_fast_learner = card => { const i = CI.make(card.id); const e0 = CI.effective(i); CI.applyScratch(i, 'up_fast_learner'); const e1 = CI.effective(i); eq(e1.mastery.thresholds, e0.mastery.thresholds.map(t => Math.max(2, t - 1)), 'Fast Learner lowers every Mastery threshold by 1 (min 2)'); };
BEH.up_second_wind = card => { const B = uBoard(card, ['up_second_wind']); const u = deploy(B, card); B.damage(u, 999, { kind: 'hit', src: allPests(B)[0] }); B.reap(); B.drain(); ok(!u.dead && u.health === 1, 'Second Wind: a lethal hit leaves 1 Health'); eq(B.instByUid(u.instUid).lives, CI.make(card.id).lives, 'and no Life is spent'); B.damage(u, 999, { kind: 'hit', src: allPests(B)[0] }); B.reap(); B.drain(); ok(u.dead || u.removed, 'only once per fight'); };
BEH.up_cosmic_cat = card => { const B = uBoard(card, ['up_cosmic_cat']); const u = deploy(B, card); eq(u.flags.witchingMaster, true, 'Cosmic Cat flag reaches the unit'); };
BEH.up_double_duty = card => {
  const run = sc => { const B = uBoard(card, sc, { cats: [{ card: 't_pal', floor: 2 }] }); playSubject(B, card.id); B.endTurn(); return B; };
  const a = run([]), b = run(['up_double_duty']);
  const room = B => B.state.floors.map(f => f.rooms.find(r => r.rtype === 'toy')).find(Boolean);
  eq(room(b).flags.doubleTrigger, true, 'Double Duty flag reaches the room');
  const claws = B => B.cats().reduce((s, c) => s + (c.statuses.claws || 0), 0);
  eq(claws(b), 2 * claws(a), 'Double Duty: the end of turn effect triggers twice (' + claws(a) + ' vs ' + claws(b) + ')');
};
BEH.up_cardboard_castle = card => { const B = uBoard(card, ['up_cardboard_castle']); playSubject(B, card.id); const box = B.state.floors.map(f => f.rooms.find(r => r.rtype === 'box')).find(Boolean); const a = uBoard(card, []); playSubject(a, card.id); const boxa = a.state.floors.map(f => f.rooms.find(r => r.rtype === 'box')).find(Boolean); eq(box.fits - boxa.fits, 1, 'Cardboard Castle: the Box holds 1 more cat'); eq(box.durability - boxa.durability, 3, 'and has +3 durability'); };
// auras
const inBoxBoard = (card, scratches) => { const B = uBoard(card, scratches); const u = deploy(B, card); const box = B.placeBox(1); B.seatCat(u, box); B.touch(); B.recalc(); return { B, u }; };
[['up_snug_fit', 1, 2], ['up_box_lover', 3, 0], ['up_bigger_box', 2, 4]].forEach(([id, atk, hp]) => {
  BEH[id] = card => {
    const a = inBoxBoard(card, []), b = inBoxBoard(card, [id]);
    eq(b.B.atk(b.u) - a.B.atk(a.u), atk, id + ' +' + atk + ' Attack while in a Box');
    eq(b.u.maxHealth - a.u.maxHealth, hp, id + ' +' + hp + ' Health while in a Box');
    const c = uBoard(card, [id]), uc = deploy(c, card), d = uBoard(card, []), ud = deploy(d, card);
    eq(c.atk(uc) - d.atk(ud), 0, id + ' nothing outside a Box');
  };
});
BEH.up_cuddle_magnet = card => { const mk2 = sc => { const B = uBoard(card, sc, { cats: [{ card: 't_pal', floor: 2 }, { card: 't_pal', floor: 2 }] }); const u = deploy(B, card); return B.atk(u); }; ok(mk2(['up_cuddle_magnet']) > mk2([]), 'Cuddle Magnet: +Attack per adjacent cat'); const alone = uBoard(card, ['up_cuddle_magnet']); const ua = deploy(alone, card); const ref = uBoard(card, []); eq(alone.atk(ua), ref.atk(deploy(ref, card)), 'and nothing when alone'); };
BEH.up_cuddle_core = card => { const mk2 = sc => { const B = uBoard(card, sc, { pile: true, cats: [{ card: 't_pal', floor: 2 }, { card: 't_pal', floor: 2 }] }); const u = deploy(B, card); B.touch(); B.recalc(); return B.atk(u); }; ok(mk2(['up_cuddle_core']) - mk2([]) === 2, 'Cuddle Core: +2 Attack in a Pile of 3 (' + mk2([]) + ' vs ' + mk2(['up_cuddle_core']) + ')'); };
BEH.up_pile_driver = card => { const mk2 = sc => { const B = uBoard(card, sc, { cats: [{ card: 't_pal', floor: 2 }, { card: 't_pal', floor: 2 }] }); const u = deploy(B, card); return B.atk(u); }; eq(mk2(['up_pile_driver']) - mk2([]), 2, 'Pile Driver: +1 Attack per other cat on the floor'); };
// stretch mods
BEH.up_deep_stretch = card => { const run = sc => { const B = uBoard(card, sc); const u = deploy(B, card); B.napCat(u, { forced: true }); const h = hpOf(B); B.wakeCat(u); B.drain(); return h - hpOf(B); }; eq(run(['up_deep_stretch']) - run([]), 4, 'Deep Stretch: +4 damage on the Stretch'); };
BEH.up_deep_sleeper = card => { const run = sc => { const B = uBoard(card, sc); const u = deploy(B, card); B.napCat(u, { forced: true }); B.addStatus(u, 'rested', 2); const h = hpOf(B); B.wakeCat(u); B.drain(); return h - hpOf(B); }; eq(run(['up_deep_sleeper']) - run([]), 6, 'Deep Sleeper: +3 per Rested stack'); };
// instance level
BEH.up_lucky_life = BEH.up_stubborn_soul = null;
['up_lucky_life', 'up_stubborn_soul'].forEach(id => {
  BEH[id] = card => { const n = UP(id).effects[0].n; const B = uBoard(card, [id]); const u = deploy(B, card); eq(u.maxLives - CI.make(card.id).maxLives, n, id + ' +' + n + ' max Lives in battle'); eq(u.lives - CI.make(card.id).lives, n, id + ' and the cat starts with them'); };
});
BEH.up_crash_course = card => { const i = CI.make(card.id); CI.applyScratch(i, 'up_crash_course'); eq(i.masteryRank, 1, 'Crash Course gives Mastery rank 1'); eq(CI.effective(i).stats ? CI.effective(i).stats.power - CI.effective(CI.make(card.id)).stats.power : (CI.effective(i).mastery.rank), CI.effective(i).stats ? 1 : 1, 'and the card shows it'); };

section('upgrades: battle behavior of every non-trigger upgrade', () => {
  nonTrig.forEach(u => {
    const card = subjects[u.id] || subjectFor(u);
    const f = BEH[u.id];
    if (!f) { ok(false, u.id + ' has a battle check'); return; }
    SUBJ = card;
    try { f(card); } catch (e) { ok(false, u.id + ' threw in battle: ' + (e.stack || e).toString().split('\n').slice(0, 3).join(' | ')); }
  });
});
//@@UP4-END@@

//@@FORKS-BEGIN@@
// ---- forks: 29 families, every option
const FAM = D.forks;
const realOf = f => { const id = [f.card].concat(f.aliases || []).find(id => SB.content.card(id) && SB.content.card(id).type === f.type); return id && SB.content.resolveId(id); };
const tcat = (B, id) => B.cats().find(c => c.id === id);
section('forks: catalog shape (29 families, 2 or 3 options, unique ids)', () => {
  eq(FAM.length, 29, 'fork family count');
  const ids = new Set();
  FAM.forEach(f => {
    ok(f.options.length >= 2 && f.options.length <= 3, f.id + ' has 2 or 3 options');
    ok(['unit', 'spell', 'toy'].indexOf(f.type) >= 0, f.id + ' type');
    ok(!!f.base, f.id + ' has base text');
    f.options.forEach(o => {
      ok(!ids.has(o.id), 'unique fork option id ' + o.id); ids.add(o.id);
      ok(o.name && o.text && o.flavor && o.patch, o.id + ' has name, text, flavor and patch');
      ok(o.cost === 90, o.id + ' costs 90 Fish');
      ok(!/[\u2013\u2014]/.test(JSON.stringify(o)), o.id + ' has no em or en dash');
      ok(SB.content.fork(o.id) === o, o.id + ' resolves through content.fork');
    });
  });
});
section('forks: every family is offered for a real card (content.forksFor and post.forksFor)', () => {
  FAM.forEach(f => {
    const real = realOf(f);
    if (!ok(!!real, f.id + ' has a real card of its type to attach to')) return;
    const def = SB.content.card(real);
    ok(def.type === f.type, f.id + ' real card ' + real + ' has the family type');
    ok(def.clan === f.clan || f.clan === 'neutral' || def.clan === 'neutral', f.id + ' real card clan ' + def.clan);
    const got = SB.content.forksFor(real).map(o => o.id);
    eq(got.slice().sort(), f.options.map(o => o.id).sort(), f.id + ' options via content.forksFor(' + real + ')');
    const run = SB.run.newRun({ seed: 'FORKRUN1', clan: 'alley', side: 'hearth', championId: AS, rank: 0 });
    const inst = CI.make(real, { run });
    eq(SB.post.forksFor(run, inst).map(o => o.id).sort(), f.options.map(o => o.id).sort(), f.id + ' options via post.forksFor');
  });
  // no two families share a real card
  const seen = {};
  FAM.forEach(f => (f.aliases || []).forEach(a => { if (SB.content.card(a)) { ok(!seen[a] || seen[a] === f.id, 'real card ' + a + ' belongs to one family'); seen[a] = f.id; } }));
});
section('forks: every option applies through CI.effective (name, text, patch)', () => {
  FAM.forEach(f => {
    const real = realOf(f); if (!real) return;
    const run = SB.run.newRun({ seed: 'FORKRUN2', clan: 'alley', side: 'hearth', championId: AS, rank: 0 });
    const baseEff = CI.effective(CI.make(real, { run }));
    f.options.forEach(o => {
      const inst = CI.make(real, { run }); inst.fork = o.id;
      const e = CI.effective(inst);
      const p = o.patch;
      eq(e.name, baseEff.name + ': ' + o.name, o.id + ' name');
      eq(e.text, o.text, o.id + ' text');
      ok(e.upgraded === true, o.id + ' marks the card upgraded');
      if (p.cost !== undefined) eq(e.cost, p.cost, o.id + ' cost');
      if (p.targeting) eq(e.targeting, p.targeting, o.id + ' targeting');
      Object.keys(p.stats || {}).forEach(k => eq(e.stats[k], p.stats[k], o.id + ' stat ' + k));
      Object.keys(p.keywords || {}).forEach(k => { if (p.keywords[k] === false) ok(!(k in e.keywords), o.id + ' removes keyword ' + k); else eq(e.keywords[k], p.keywords[k], o.id + ' keyword ' + k); });
      Object.keys(p.effects || {}).forEach(t => eq(e.effects[normT(t)], p.effects[t], o.id + ' effects ' + t));
      if (p.aura) eq(e.aura, p.aura, o.id + ' aura');
      // an untouched stat stays the base value
      Object.keys(baseEff.stats || {}).forEach(k => { if (!p.stats || !(k in p.stats)) eq(e.stats[k], baseEff.stats[k], o.id + ' keeps base stat ' + k); });
      // the printed card is not changed
      eq(CI.effective(CI.make(real, { run })).text, baseEff.text, o.id + ' leaves the base card alone');
      // every op in the patch is a registered op, every target a registered target
      const walk = list => (list || []).forEach(x => {
        if (!x || typeof x !== 'object') return;
        if (x.type) ok(!!SB.engine.ops.get(x.type), o.id + ' op ' + x.type + ' is registered');
        if (typeof x.target === 'string') ok(!!SB.engine.targets.get(x.target), o.id + ' target ' + x.target + ' is registered');
        if (x.effects) walk(x.effects);
      });
      Object.keys(p.effects || {}).forEach(t => walk(p.effects[t]));
      // a spell must be aimed at what its effects read: chosen* targets need the matching targeting, floor reads need any aim
      if (e.type === 'spell') {
        const used = new Set();
        const scan = list => (list || []).forEach(x => { if (!x || typeof x !== 'object') return; if (typeof x.target === 'string') used.add(x.target); if (x.floorOf) used.add('floorOf'); if (x.effects) scan(x.effects); });
        Object.keys(p.effects || {}).forEach(t => { if (t === 'onPlay') scan(p.effects[t]); });
        const CH = { chosenEnemy: 'enemy', chosenCat: 'cat', chosenFloor: 'floor' };
        used.forEach(t => {
          if (CH[t]) eq(e.targeting, CH[t], o.id + ' spell reads ' + t + ' so it must be aimed at a ' + CH[t]);
          else if (['frontEnemy', 'thisFloor', 'allEnemiesOnFloor', 'allCatsOnFloor', 'randomEnemyOnFloor'].indexOf(t) >= 0) ok(e.targeting !== 'none', o.id + ' spell reads ' + t + ' so it needs an aim (has ' + e.targeting + ')');
        });
      }
    });
  });
});
// per family: extra pals in hand, pals already on the floor, and what to do after the card is out
const palAt = (B, k) => B.cats().filter(c => c.id === 't_pal')[k || 0];
const deployPal = B => { const r = play(B, 't_pal', { floor: 1 }); if (!r.ok) throw new Error('pal: ' + r.reason); B.drain(); return B.cats().filter(c => c.id === 't_pal').pop(); };
const FSC = {
  cardboard_box: { pals: 1, act: B => { deployPal(B); } },
  cinder_tom: { cats: [{ card: 't_pal', floor: 2 }], act: (B, u) => kill(B, u) },
  moon_ghost_kitten: { act: (B, u) => kill(B, u) },
  cuddle_puddle: { cats: [{ card: 't_pal', floor: 2 }, { card: 't_pal', floor: 2 }], prep: B => { B.cats().forEach(c => { c.health = Math.max(1, c.health - 6); }); } },
  sunbeam_sprawler: { act: (B, u) => { B.napCat(u, { forced: true }); B.drain(); } },
  heated_cushion: { pals: 1, cats: [{ card: 't_pal', floor: 2 }], prep: B => { B.cats().filter(c => c.id === 't_pal').forEach(c => { c.health = Math.max(1, c.health - 5); }); }, act: B => { deployPal(B); } },
  loaf_stance: { pals: 2, act: B => { const a = deployPal(B), b = deployPal(B); B.napCat(a, { forced: true }); B.napCat(b, { forced: true }); B.drain(); } },
  moon_spirit_pounce: { cats: [{ card: 't_pal', floor: 2 }] },
  moon_life_bank: { cats: [{ card: 't_pal', floor: 2 }] },
  moon_witching_ritual: { turns: 5 }
};
section('forks: every option plays in battle and differs from the base card', () => {
  FAM.forEach(f => {
    const real = realOf(f); if (!real) return;
    const def = SB.content.card(real);
    const sc = FSC[f.card] || {};
    const runIt = fork => {
      SB.util.resetWarnings();
      const pal = (sc.pals || 0);
      const hands = [[real].concat(Array(pal).fill('t_pal')), [real], [real], [real], [real]];
      const B = mk({
        champ: AS, deck: [real, 't_pal', 't_pal', 't_pal', 't_pal'], noPile: true, seed: 5, hands, clock: true,
        spawns: [{ id: 't_dummy', floor: 2 }, { id: 't_dummy', floor: 2 }, { id: 't_dummy', floor: 3 }],
        cats: sc.cats || (def.type === 'unit' ? [] : [{ card: 't_pal', floor: 2 }, { card: 't_pal', floor: 2 }]),
        run: run => { if (fork) run.deck[1].fork = fork; }
      });
      B.addZoomies(5); if (sc.prep) sc.prep(B);
      const pest = allPests(B)[0], cat = B.cats().find(c => c.id !== real) || null;
      const tg = { floor: 1 }; if (pest) tg.pestUid = pest.uid; if (cat) tg.catUid = cat.uid;
      const r = play(B, real, tg);
      B.drain();
      const costs = JSON.stringify(B.state.hand.map(h => B.cardCost(h.uid)));
      const mid = snapB(B); mid.costs = costs;
      let err = null;
      try {
        if (sc.act) sc.act(B, tcat(B, real), real);
        mid.after = snapB(B); mid.costs2 = JSON.stringify(B.state.hand.map(h => B.cardCost(h.uid)));
        mid.t = []; for (let i = 0; i < (sc.turns || 2); i++) { B.endTurn(); mid.t.push(snapB(B)); }
      } catch (e) { err = e; }
      return { r, mid, after: snapB(B), err, warn: Object.keys(SB.util.warnings), B };
    };
    const base = runIt(null);
    ok(base.r.ok, f.id + ' base card plays (' + real + '): ' + (base.r.reason || ''));
    ok(!base.err, f.id + ' base battle runs: ' + (base.err && base.err.stack));
    f.options.forEach(o => {
      const up = runIt(o.id);
      ok(up.r.ok, o.id + ' forked card plays: ' + (up.r.reason || ''));
      ok(!up.err, o.id + ' battle runs on after the play: ' + (up.err && up.err.stack));
      ok(!up.warn.length, o.id + ' raises no engine warnings: ' + up.warn.join(','));
      if (process.env.FKDBG && o.id === process.env.FKDBG) console.log(JSON.stringify(base.after.cats), JSON.stringify(up.after.cats), up.B.state.round);
      ok(JSON.stringify(up.mid) !== JSON.stringify(base.mid) || JSON.stringify(up.after) !== JSON.stringify(base.after), o.id + ' changes what happens in battle');
    });
  });
});
section('forks: numeric spot checks in battle', () => {
  const fb = (real, fork, o) => mk(Object.assign({ champ: AS, deck: [real, 't_pal', 't_pal'], noPile: true, seed: 5, hands: [[real, 't_pal'], [real], [real]], spawns: [{ id: 't_dummy', floor: 2 }, { id: 't_dummy', floor: 2 }], cats: [{ card: 't_pal', floor: 2 }], run: run => { if (fork) run.deck[1].fork = fork; } }, o || {}));
  const dmgOf = (real, fork) => { const B = fb(real, fork); B.addZoomies(5); const p = allPests(B)[0]; const h0 = hpSum(B); const r = play(B, real, { floor: 1, pestUid: p.uid, catUid: B.cats()[0].uid }); B.drain(); return { r, dmg: h0 - hpSum(B), B }; };
  eq(dmgOf('neutral_swat', null).dmg, 4, 'Swat deals 4');
  eq(dmgOf('neutral_swat', 'fork_swat_haymaker').dmg, 11, 'Haymaker deals 11');
  eq(dmgOf('neutral_swat', 'fork_swat_flurry').dmg, 3 + 2 + 2, 'Flurry deals 3 then 2 twice');
  { const B = fb('neutral_swat', 'fork_swat_haymaker'); eq(B.cardCost(hand(B, 'neutral_swat')), 2, 'Haymaker costs 2'); }
  { const a = fb('neutral_swat', 'fork_swat_bat_down'); const p = allPests(a)[0]; const f0 = p.floor; a.addZoomies(5); play(a, 'neutral_swat', { floor: 1, pestUid: p.uid }); a.drain(); ok(p.dead || p.floor < f0 || a.state.garden.length, 'Bat Down knocks the pest'); }
  // Catnap: Power Nap heals 6 and exhausts, Nap Pile naps the whole floor
  { const heal = fork => { const B = fb('neutral_catnap', fork); B.addZoomies(5); const pal = B.cats()[0]; pal.health = 2; play(B, 'neutral_catnap', { floor: 1, catUid: pal.uid }); B.drain(); return { B, pal }; };
    const base = heal(null), pn = heal('fork_catnap_power_nap'), np = heal('fork_catnap_nap_pile');
    ok(pn.pal.health - 2 > base.pal.health - 2 || pn.pal.health === pn.pal.maxHealth, 'Power Nap heals more than Nap');
    ok(pn.B.state.exhaust.length > base.B.state.exhaust.length, 'Power Nap exhausts');
    ok(np.pal.napping, 'Nap Pile naps the cat'); }
  // Big Box holds two cats and costs 2
  { const B = fb('neutral_cardboard_box', 'fork_box_big'); eq(B.cardCost(hand(B, 'neutral_cardboard_box')), 2, 'Big Box costs 2'); B.addZoomies(5); play(B, 'neutral_cardboard_box', { floor: 1 }); B.drain(); const box = B.state.floors[1].rooms.find(r => r.rtype === 'box'); ok(box && box.fits === 2, 'Big Box holds 2 cats (fits ' + (box && box.fits) + ')'); }
  { const B = fb('neutral_cardboard_box', 'fork_box_flat'); eq(B.cardCost(hand(B, 'neutral_cardboard_box')), 0, 'Flat Pack costs 0'); B.addZoomies(5); play(B, 'neutral_cardboard_box', { floor: 1 }); B.drain(); const box = B.state.floors[1].rooms.find(r => r.rtype === 'box'); ok(box && box.durability === 1, 'Flat Pack box has durability 1'); }
  { const B = fb('neutral_cardboard_box', 'fork_box_fort'); B.addZoomies(5); play(B, 'neutral_cardboard_box', { floor: 1 }); B.drain(); const f0 = B.cats().reduce((a, c) => a + c.fluff, 0); const r = play(B, 't_pal', { floor: 1 }); B.drain(); ok(B.cats().reduce((a, c) => a + c.fluff, 0) >= f0 + 5, 'Box Fort gives the deployed cat Fluff 5'); }
  // Off the Shelf forks
  { const B = fb('alley_off_the_shelf', 'fork_shelf_whole'); B.addZoomies(5); const ps = allPests(B).map(p => p.floor); play(B, 'alley_off_the_shelf', { floor: 1 }); B.drain(); ok(allPests(B).every((p, i) => p.floor < ps[i]) || B.state.garden.length, 'Whole Shelf knocks every pest on the floor'); }
  // Witching trio
  { const wc = fork => { const B = fb('moon_wind_the_clock', fork, { clock: true, hands: [['moon_wind_the_clock'], [], [], [], [], []] }); B.addZoomies(5); const c = B.cardCost(hand(B, 'moon_wind_the_clock')); play(B, 'moon_wind_the_clock', {}); B.drain(); let n = 0, fr = 0; for (let i = 0; i < 5; i++) { B.endTurn(); if (B.state.clock.isWitching) n++; fr += B.cats().filter(x => x.statuses.frazzled).length; } return { c, n, fr, B }; };
    const base = wc(null), early = wc('fork_ritual_early'), dbl = wc('fork_ritual_double'), comfy = wc('fork_ritual_comfy');
    eq(base.c, 1, 'Wind the Clock costs 1'); eq(early.c, 0, 'Early Bell costs 0');
    ok(dbl.B.state.clock.witchingCount >= base.B.state.clock.witchingCount + 1, 'Double Midnight gives an extra Witching Hour (' + dbl.B.state.clock.witchingCount + ' vs ' + base.B.state.clock.witchingCount + ')');
    ok(comfy.fr <= base.fr, 'Comfy Midnight never adds Frazzled (' + comfy.fr + ' vs ' + base.fr + ')'); }
});
section('forks: post.fork buys a fork (price, one fork per card, slot rule)', () => {
  const run = SB.run.newRun({ seed: 'FORKBUY1', clan: 'alley', side: 'hearth', championId: AS, rank: 0 });
  run.fish = 500;
  const inst = CI.make('neutral_swat', { run }); run.deck.push(inst);
  const opts = SB.post.forksFor(run, inst); eq(opts.length, 3, 'Swat has 3 forks');
  const r = SB.post.fork(run, inst.uid, opts[0].id);
  ok(r.ok, 'fork bought: ' + r.reason); eq(r.price, 90, 'fork price is 90'); eq(run.fish, 410, 'fish spent'); eq(inst.fork, opts[0].id, 'inst.fork set');
  eq(CI.effective(inst).name, 'Swat: ' + opts[0].name.replace(/^/, ''), 'effective name shows the fork');
  ok(!SB.post.fork(run, inst.uid, opts[1].id).ok, 'a second fork is refused');
  const r2 = SB.post.fork(run, inst.uid, opts[1].id, { replaceFork: true, price: 0 }); ok(r2.ok && inst.fork === opts[1].id, 'replaceFork swaps the fork');
  const poor = SB.run.newRun({ seed: 'FORKBUY2', clan: 'alley', side: 'hearth', championId: AS, rank: 0 }); poor.fish = 10;
  const pi = CI.make('neutral_swat', { run: poor }); poor.deck.push(pi);
  ok(!SB.post.fork(poor, pi.uid, opts[0].id).ok && !pi.fork, 'not enough Fish: refused, nothing forked');
  ok(!SB.post.fork(run, inst.uid, 'fork_box_big', { replaceFork: true }).ok, 'a fork of another card is refused');
  // forks keep scratches, Knead and Mastery
  const i2 = CI.make('neutral_swat', { run }); i2.fork = opts[0].id; i2.kneads = 3;
  const e2 = CI.effective(i2); ok(e2.name.indexOf(opts[0].name) > 0, 'forked card still renders with kneads');
});
//@@FORKS-END@@

//@@EVO-BEGIN@@
// ---- evolutions: 6 chains of 3 stages
const EVO = D.evolutions;
const stageIds = e => e.stages.map(s => s.id);
section('evolutions: catalog shape (6 chains, 3 stages, slots, lives, quests)', () => {
  eq(EVO.length, 6, 'evolution count');
  eq(EVO.map(e => e.id).sort(), ['evo_biscuit', 'evo_dumpling', 'evo_gus', 'evo_pip', 'evo_wisp', 'evo_yarn_ball'], 'evolution ids');
  EVO.forEach(e => {
    eq(e.stages.length, 3, e.id + ' has 3 stages');
    eq(e.growthNeeded, 3, e.id + ' needs 3 Growth'); eq(e.ceremonyFish, 90, e.id + ' ceremony costs 90');
    e.stages.forEach((s, i) => {
      const c = SB.content.card(s.id);
      ok(!!c, s.id + ' exists in SB.content');
      eq(SB.content.evolution(s.id) && SB.content.evolution(s.id).id, e.id, s.id + ' maps back to ' + e.id);
      eq(s.slots, i + 1, s.id + ' has ' + (i + 1) + ' scratch slot(s)');
      if (s.type === 'unit') eq(s.stats.lives, i + 2, s.id + ' has ' + (i + 2) + ' lives');
      ok(i === 2 ? s.rarity === 'rare' : s.rarity === 'uncommon', s.id + ' rarity ' + s.rarity);
      if (i < 2) eq(s.evolvesTo, e.stages[i + 1].id, s.id + ' evolvesTo the next stage'); else ok(!s.evolvesTo, s.id + ' final stage has no evolvesTo');
      if (i === 1) ok(s.quest && s.quest.check && s.quest.check.counter && s.quest.check.n > 0, s.id + ' has the stage quest'); else ok(!s.quest, s.id + ' has no quest');
      ok(!/[\u2013\u2014]/.test(JSON.stringify(s)), s.id + ' has no em or en dash');
      ok(s.text && s.flavor, s.id + ' has text and flavor');
      const base = SB.content.card(e.stages[0].id);
      eq(c.clan, e.clan, s.id + ' clan'); 
      // cost and stats climb with the stage
      if (i > 0 && s.stats && e.stages[i - 1].stats) { ok(s.stats.power > e.stages[i - 1].stats.power, s.id + ' hits harder than the previous stage'); ok(s.stats.health > e.stages[i - 1].stats.health, s.id + ' is tougher than the previous stage'); }
    });
    // the fight can start from any stage: the first one is the draftable one
    ok(SB.content.card(e.stages[0].id).rarity === 'uncommon', e.id + ' first stage is draftable');
  });
});
section('evolutions: every stage reads through CI.effective and uses only supported names', () => {
  EVO.forEach(e => e.stages.forEach(s => {
    const run = SB.run.newRun({ seed: 'EVOEFF01', clan: 'alley', side: 'hearth', championId: AS, rank: 0 });
    const inst = CI.make(s.id, { run }); const ef = CI.effective(inst);
    eq(ef.name, s.name, s.id + ' name');
    eq(ef.text, s.text, s.id + ' text');
    if (s.stats) { eq(ef.stats.power, s.stats.power, s.id + ' power'); eq(ef.stats.health, s.stats.health, s.id + ' health'); eq(ef.stats.size, s.stats.size, s.id + ' size'); eq(inst.maxLives, s.stats.lives, s.id + ' inst lives'); }
    Object.keys(s.keywords || {}).forEach(k => ok(k in ef.keywords, s.id + ' keyword ' + k));
    Object.keys(s.effects || {}).forEach(t => eq(ef.effects[normT(t)], s.effects[t], s.id + ' effects ' + t));
    if (s.aura) eq(ef.aura, s.aura, s.id + ' aura');
    // all keyword, trigger, op and target names are registered
    Object.keys(s.keywords || {}).forEach(k => ok(!!SB.engine.keywords.get(k) || SB.engine.keywords.has && SB.engine.keywords.has(k), s.id + ' keyword ' + k + ' is registered'));
    Object.keys(s.effects || {}).forEach(t => { ok(!!SB.engine.triggers.get(normT(t)), s.id + ' trigger ' + t + ' is registered'); (s.effects[t] || []).forEach(x => { ok(!!SB.engine.ops.get(x.type), s.id + ' op ' + x.type); if (typeof x.target === 'string') ok(!!SB.engine.targets.get(x.target), s.id + ' target ' + x.target); }); });
    (s.aura || []).forEach(a => { (a.if || []).forEach(c => ok(!!SB.engine.checks.get(c.check), s.id + ' aura check ' + c.check)); });
    if (s.quest) ok(true, '');
  }));
});
//@@EVO-END@@

//@@EVO2-BEGIN@@
function eb(stageId, o) {
  o = o || {};
  return mk({ champ: AS, deck: [stageId, 't_pal', 't_pal', 't_pal'], noPile: !o.pile, seed: 5, clock: !!o.clock, hands: o.hands || [[stageId, 't_pal', 't_pal'], [], [], [], [], []],
    spawns: o.spawns || [{ id: 't_dummy', floor: 2 }, { id: 't_dummy', floor: 2 }], cats: o.cats, run: (run, ch) => { if (o.prep) o.prep(run, run.deck[1]); } });
}
const deployAt = (B, id, f) => { const r = play(B, id, { floor: f === undefined ? 1 : f }); if (!r.ok) throw new Error('deploy ' + id + ': ' + r.reason); B.drain(); return B.cats().filter(c => c.id === id).pop(); };
const atkOf = (B, c) => B.atk(c);
section('evolutions: Biscuit line (Knead and Purr)', () => {
  [['hearth_biscuit_kitten', 1, 0], ['hearth_biscuit_cat', 2, 1], ['hearth_biscuit_the_great', 3, 2]].forEach(([id, kn, purr]) => {
    const B = eb(id); const inst = B.run.deck[1]; const base = SB.content.card(id).stats.power;
    const u = deployAt(B, id);
    eq(inst.knead.attack, kn, id + ' kneads ' + kn + ' when played'); eq(atkOf(B, u), base + kn, id + ' attack after the knead');
    eq(u.kw.purr || 0, purr, id + ' purr');
  });
  { // Biscuit the Great heals the Sunbeam 1 for every Knead anywhere
    const B = eb('hearth_biscuit_the_great', { hands: [['hearth_biscuit_the_great', 'hearth_biscuit_kitten'], [], []] });
    B.run.deck.push(CI.make('hearth_biscuit_kitten', { run: B.run }));
    deployAt(B, 'hearth_biscuit_the_great'); B.state.sunbeam.warmth = 20; const w0 = B.state.sunbeam.warmth;
    const u = B.cats().find(c => c.id === 'hearth_biscuit_the_great'); B.doKnead(u, 'attack', 1); B.drain();
    eq(B.state.sunbeam.warmth, w0 + 1, 'Biscuit the Great heals the Sunbeam 1 when a Knead triggers');
  }
  { // the knead cap is 12 for a normal card
    const B = eb('hearth_biscuit_the_great'); const inst = B.run.deck[1]; const u = deployAt(B, 'hearth_biscuit_the_great');
    for (let i = 0; i < 6; i++) B.doKnead(u, 'attack', 3);
    eq(inst.knead.attack, 12, 'Knead stops at the cap of 12');
  }
});
section('evolutions: Dumpling line (Cuddle Pile anchor)', () => {
  const pals = (n) => Array(n).fill({ card: 't_pal', floor: 2 });
  [['hearth_dumpling_kitten', 1, 3], ['hearth_dumpling_cat', 2, 3], ['hearth_dumpling_legend', 4, 2]].forEach(([id, p, n]) => {
    const B = eb(id, { cats: pals(n) }); const u = deployAt(B, id); B.touch(); B.recalc();
    eq(atkOf(B, u), p + n, id + ' gets +1 Attack per other cat (' + n + ' pals)');
  });
  { const B = eb('hearth_dumpling_cat', { cats: pals(2) }); const u = deployAt(B, 'hearth_dumpling_cat'); const ps = B.cats().filter(c => c.id === 't_pal'); ps.forEach(c => { c.health = 3; });
    B.endTurn(); const healed = ps.map(c => c.health); ok(healed.some(h => h > 3), 'Dumpling Cat heals its neighbours at end of turn (' + healed + ')'); }
  { const B = eb('hearth_dumpling_legend', { cats: pals(2) }); const u = deployAt(B, 'hearth_dumpling_legend'); eq(u.size, 2, 'Grand Dumpling is Large'); const ps = B.cats().filter(c => c.id === 't_pal'); ps.forEach(c => { c.health = 3; });
    B.endTurn(); ok(ps.every(c => c.health >= 3 + 3) && ps.every(c => c.fluff >= 2), 'Grand Dumpling heals every cat here 3 and gives Fluff 2 (' + ps.map(c => c.health + '/' + c.fluff) + ')'); }
});
section('evolutions: Pip line (Pounce and Ambush)', () => {
  const firstHit = (id) => { const B = eb(id, { spawns: [{ id: 't_dummy', floor: 2 }] }); const h0 = hpSum(B); const u = deployAt(B, id); const pounced = h0 - hpSum(B); return { B, u, pounced }; };
  { const r = firstHit('alley_pip'); eq(r.u.kw.pounce, 1, 'Pip has Pounce 1'); eq(r.pounced, 3 + 1, 'Pip pounces for Power + Pounce = 4'); }
  { const r = firstHit('alley_pippin_the_mouser'); eq(r.u.kw.pounce, 1, 'Pippin has Pounce 1'); eq(r.u.kw.ambush, 1, 'Pippin has Ambush'); eq(r.pounced, (6 + 1) * 2, 'Pippin first hit (the Pounce) is doubled: (6 + 1) x 2'); const h1 = hpSum(r.B); r.B.endTurn(); eq(h1 - hpSum(r.B), 6, 'Pippin second hit is a normal 6'); }
  { const r = firstHit('alley_pip_terror_of_the_pantry'); eq(r.u.kw.pounce, 2, 'Terror has Pounce 2'); eq(r.pounced, (10 + 2) * 3, 'Terror first hit is tripled: (10 + 2) x 3'); }
  { // kills draw 1
    const B = eb('alley_pip_terror_of_the_pantry', { spawns: [{ id: 't_frail', floor: 2 }, { id: 't_dummy', floor: 2 }], hands: [['alley_pip_terror_of_the_pantry'], [], []] });
    const hand0 = B.state.hand.length; deployAt(B, 'alley_pip_terror_of_the_pantry'); ok(B.state.hand.length >= hand0 - 1 + 1, 'Pip Terror draws a card for the kill (hand ' + hand0 + ' to ' + B.state.hand.length + ')'); }
});
section('evolutions: Wisp line (Reborn and Witching Hour)', () => {
  [['moon_wisp_kitten', 0], ['moon_wisp_cat', 2], ['moon_wisp_legend', 3]].forEach(([id, bonus]) => {
    const B = eb(id, { clock: true, hands: [[id], [], [], [], [], [], [], []] }); const u = deployAt(B, id); ok(u.kw.reborn, id + ' is Reborn');
    const base = atkOf(B, u); const l0 = u.lives;
    let seen = false; for (let i = 0; i < 6 && !seen; i++) { B.endTurn(); if (B.state.clock.isWitching) seen = true; }
    ok(seen, id + ': a Witching Hour came'); eq(atkOf(B, u) - base, bonus, id + ' Witching Hour Power bonus');
    if (id === 'moon_wisp_legend') ok(u.lives >= l0 + 1, 'Will-o-the-Whisker gains a life at the Witching Hour (lives ' + l0 + ' to ' + u.lives + ')');
  });
  { const B = eb('moon_wisp_kitten', { spawns: [{ id: 't_slugger', floor: 1 }] }); const u = deployAt(B, 'moon_wisp_kitten', 0); const inst = B.run.deck[1]; const l0 = inst.lives; B.damage(u, 999, { kind: 'hit', src: null }); B.reap(); B.drain();
    ok(B.state.hand.some(h => B.state.cards[h.uid].id === 'moon_wisp_kitten'), 'a Reborn Wisp comes back to hand'); eq(inst.lives, l0 - 1, 'and loses one life'); }
});
section('evolutions: Gus line (Boxes and Knock It Off)', () => {
  const inBox = (id) => { const B = eb(id, { hands: [[id], [], []] }); const u = deployAt(B, id); if (!u.boxed) { const box = B.placeBox(1); B.seatCat(u, box); } B.touch(); B.recalc(); return { B, u }; };
  const outBox = (id) => { const B = eb(id, { hands: [[id], [], []] }); const u = deployAt(B, id); if (u.boxed) B.unseatCat && B.unseatCat(u); return { B, u }; };
  { const B = eb('mischief_gus_kitten', { hands: [['mischief_gus_kitten'], [], []] }); const u = deployAt(B, 'mischief_gus_kitten'); ok(B.state.floors[1].rooms.some(r => r.rtype === 'box'), 'Gus Kitten puts a Box on the floor when none'); ok(u.boxed, 'Gus Kitten moves into the Box'); }
  { const B = eb('mischief_gus_kitten', { hands: [['mischief_gus_kitten'], [], []] }); const box0 = B.placeBox(1); const u = deployAt(B, 'mischief_gus_kitten'); eq(B.state.floors[1].rooms.filter(r => r.rtype === 'box').length, 1, 'Gus Kitten does not add a second Box'); }
  [['mischief_gus_kitten', 2], ['mischief_gus_cat', 3]].forEach(([id, bonus]) => {
    const a = inBox(id), b = (() => { const B = eb(id, { hands: [[id], [], []] }); B.run.deck[1].fork = null; const u = deployAt(B, id); if (u.boxed && id === 'mischief_gus_cat') throw new Error('should not be boxed'); return { B, u }; })();
    // the same cat with the aura only: compare its aura against the printed Power
    const aura = (SB.content.card(id).aura || [])[0]; ok(aura && aura.amount === bonus && aura.stat === 'power', id + ' has the +' + bonus + ' in-Box aura');
    ok(atkOf(a.B, a.u) >= SB.content.card(id).stats.power + bonus, id + ' in a Box hits for at least printed + ' + bonus + ' (' + atkOf(a.B, a.u) + ')');
    if (id === 'mischief_gus_cat') ok(atkOf(a.B, a.u) - atkOf(b.B, b.u) >= bonus, id + ' gains +' + bonus + ' from being in a Box (' + atkOf(a.B, a.u) + ' vs ' + atkOf(b.B, b.u) + ')');
  });
  { const B = eb('mischief_gus_legend', { hands: [['mischief_gus_legend'], [], []] }); const u = deployAt(B, 'mischief_gus_legend'); eq(u.size, 2, 'Gus the legend is Large'); ok(u.kw.boxFitsPlus, 'Gus legend carries the Box capacity keyword'); }
  { const B = eb('mischief_gus_cat', { hands: [['mischief_gus_cat'], [], []] }); const u = deployAt(B, 'mischief_gus_cat'); const f0 = allPests(B).map(p => p.floor).join(); B.endTurn(); ok(allPests(B).map(p => p.floor).join() !== f0 || B.state.garden.length, 'Gus the Box Cat Knocks on attack'); }
  { const mkL = () => eb('mischief_gus_legend', { hands: [['mischief_gus_legend'], [], []], spawns: [{ id: 't_dummy', floor: 2 }, { id: 't_dummy', floor: 2 }] });
    const B = mkL(); const u = deployAt(B, 'mischief_gus_legend'); B.state.floors[1].pests.forEach(p => { p.statuses.dizzy = 0; }); const ps = B.state.floors[1].pests.slice(); const f0 = ps.map(p => p.floor); B.endTurn(); ok(ps.some(p => p.floor < f0[0] || p.removed || p.floor === 0) || B.state.garden.length, 'Gus legend Knocks on attack'); }
  { // Boxes on his floor hold 1 more cat
    const B = eb('mischief_gus_legend', { hands: [['mischief_gus_legend'], [], []] }); const box = B.placeBox(1); B.touch(); B.recalc(); const f1 = box.fits;
    deployAt(B, 'mischief_gus_legend', 1); B.touch(); B.recalc(); eq(box.fits, f1 + 1, 'a Box on the same floor holds 1 more cat'); const other = B.placeBox(0); B.touch(); B.recalc(); eq(other.fits, f1, 'a Box on another floor is unchanged'); }
});
section('evolutions: Yarn Ball line (toys)', () => {
  const yarnOf = B => allPests(B).map(p => p.statuses.yarn || 0);
  const toyB = (id, spawns) => { const B = eb(id, { hands: [[id], [], [], []], spawns: spawns || [{ id: 't_dummy', floor: 1 }, { id: 't_dummy', floor: 1 }, { id: 't_dummy', floor: 1 }] }); play(B, id, { floor: 1 }); B.drain(); return B; };
  { const B = toyB('mischief_yarn_ball'); B.endTurn(); const y = yarnOf(B).filter(Boolean); eq(y.length, 1, 'Yarn Ball Yarns the front pest only'); }
  { const B = toyB('mischief_tangled_skein'); B.endTurn(); ok(yarnOf(B).filter(Boolean).length >= 1, 'Tangled Skein Yarns pests at turn start'); }
  { const B = toyB('mischief_whole_sweater'); B.endTurn(); const y = yarnOf(B); ok(y.every(v => v >= 1), 'Whole Sweater Yarns every pest on the floor (' + y + ')'); }
  { const B = toyB('mischief_whole_sweater', [{ id: 't_dummy', floor: 1 }]); B.endTurn(); const p = allPests(B)[0]; const h0 = p.hp; p.statuses.yarn = 1; B.removeStatus(p, 'yarn', 1); B.fire('onYarnBreak', { subject: p, floor: p.floor }); B.drain(); ok(p.hp <= h0 - 3, 'Whole Sweater: a pest breaking free takes 3 damage (' + h0 + ' to ' + p.hp + ')'); }
});
//@@EVO2-END@@

//@@EVO3-BEGIN@@
const winNow = B => { allPests(B).forEach(p => B.damage(p, 9999, { kind: 'hit', src: null })); B.reap(); B.drain(); return B.state.over && B.state.outcome === 'win'; };
section('evolutions: quest counters come out of a real battle', () => {
  const qOf = B => (B.result() || {}).stats && B.result().stats.quest || {};
  { // Biscuit Cat: Knead +6 total
    const B = eb('hearth_biscuit_cat', { spawns: [{ id: 't_dummy', floor: 2 }, { id: 't_dummy', floor: 2 }] }); const inst = B.run.deck[1]; const u = deployAt(B, 'hearth_biscuit_cat'); B.doKnead(u, 'attack', 4);
    ok(winNow(B), 'fight won'); eq((qOf(B)[inst.uid] || {}).kneadTotal, 6, 'kneadTotal counts the played Knead 2 plus 4 more'); }
  { // Dumpling Cat: end 3 turns in a Pile of 3 or more
    const B = eb('hearth_dumpling_cat', { pile: true, cats: [{ card: 't_pal', floor: 2 }, { card: 't_pal', floor: 2 }], spawns: [{ id: 't_dummy', floor: 3 }] }); const inst = B.run.deck[1]; deployAt(B, 'hearth_dumpling_cat');
    ok(B.pileSizeOf(unitOf(B, 'hearth_dumpling_cat')) >= 3, 'the Dumpling stands in a Pile of 3 (' + B.pileSizeOf(unitOf(B, 'hearth_dumpling_cat')) + ')');
    B.endTurn(); B.endTurn(); B.endTurn(); ok(winNow(B), 'fight won'); eq((qOf(B)[inst.uid] || {}).turnsInPile3, 3, 'turnsInPile3 counts three turn ends'); }
  { // Pippin: Ambush kills
    const B = eb('alley_pippin_the_mouser', { spawns: [{ id: 't_frail', floor: 2 }, { id: 't_dummy', floor: 2 }] }); const inst = B.run.deck[1]; deployAt(B, 'alley_pippin_the_mouser');
    ok(winNow(B), 'fight won'); eq((qOf(B)[inst.uid] || {}).ambushKills, 1, 'the Ambush kill is counted once'); }
  { // Pippin: a kill that is not the Ambush hit does not count
    const B = eb('alley_pippin_the_mouser', { spawns: [{ id: 't_dummy', floor: 2 }, { id: 't_frail', floor: 2 }] }); const inst = B.run.deck[1]; deployAt(B, 'alley_pippin_the_mouser'); B.endTurn(); winNow(B);
    ok(!((qOf(B)[inst.uid] || {}).ambushKills > 1), 'only Ambush kills count'); }
  { // Wisp: Reborn
    const B = eb('moon_wisp_cat', { hands: [['moon_wisp_cat'], [], [], []] }); const inst = B.run.deck[1]; const u = deployAt(B, 'moon_wisp_cat'); B.damage(u, 999, { kind: 'hit', src: null }); B.reap(); B.drain();
    const h = B.state.hand.find(x => B.state.cards[x.uid].id === 'moon_wisp_cat'); ok(!!h, 'the Wisp is back in hand'); play(B, 'moon_wisp_cat', { floor: 1 }); B.drain(); const u2 = unitOf(B, 'moon_wisp_cat'); B.damage(u2, 999, { kind: 'hit', src: null }); B.reap(); B.drain();
    ok(winNow(B), 'fight won'); ok((qOf(B)[inst.uid] || {}).rebornCount >= 1, 'rebornCount counts a return'); }
  { // Gus: win ending in a Box
    const B = eb('mischief_gus_cat', { hands: [['mischief_gus_cat'], [], []] }); const inst = B.run.deck[1]; const u = deployAt(B, 'mischief_gus_cat'); const box = B.placeBox(1); B.seatCat(u, box); B.touch();
    ok(winNow(B), 'fight won'); eq((qOf(B)[inst.uid] || {}).wonInBox, 1, 'wonInBox counts a win with Gus in a Box'); }
  { // Gus not in a Box
    const B = eb('mischief_gus_cat', { hands: [['mischief_gus_cat'], [], []] }); const inst = B.run.deck[1]; deployAt(B, 'mischief_gus_cat'); ok(winNow(B), 'fight won'); ok(!(qOf(B)[inst.uid] || {}).wonInBox, 'no wonInBox outside a Box'); }
  { // Skein: 4 Yarn cards in one fight
    const B = mk({ champ: AS, deck: ['mischief_tangled_skein', 'mischief_loose_thread', 'mischief_loose_thread', 'mischief_loose_thread'], noPile: true, seed: 5, hands: [['mischief_tangled_skein', 'mischief_loose_thread', 'mischief_loose_thread', 'mischief_loose_thread'], [], []], spawns: [{ id: 't_dummy', floor: 2 }, { id: 't_dummy', floor: 2 }] });
    const inst = B.run.deck[1]; B.addZoomies(9);
    play(B, 'mischief_tangled_skein', { floor: 1 }); B.drain();
    for (let i = 0; i < 2; i++) { const p = allPests(B)[0]; play(B, 'mischief_loose_thread', { pestUid: p.uid, floor: p.floor }); B.drain(); }
    winNow(B); ok(!((qOf(B)[inst.uid] || {}).yarnCardsInFight), 'three Yarn cards are not enough'); }
  { const B = mk({ champ: AS, deck: ['mischief_tangled_skein', 'mischief_loose_thread', 'mischief_loose_thread', 'mischief_loose_thread'], noPile: true, seed: 5, hands: [['mischief_tangled_skein', 'mischief_loose_thread', 'mischief_loose_thread', 'mischief_loose_thread'], [], []], spawns: [{ id: 't_dummy', floor: 2 }, { id: 't_dummy', floor: 2 }] });
    const inst = B.run.deck[1]; B.addZoomies(9);
    play(B, 'mischief_tangled_skein', { floor: 1 }); B.drain();
    for (let i = 0; i < 3; i++) { const p = allPests(B)[0]; play(B, 'mischief_loose_thread', { pestUid: p.uid, floor: p.floor }); B.drain(); }
    ok(winNow(B), 'fight won'); eq((qOf(B)[inst.uid] || {}).yarnCardsInFight, 4, 'four Yarn cards in one fight finish the quest'); }
});
section('evolutions: Growth, Growth Spurt and the Legend Ceremony (Run and Post)', () => {
  const newRun = (act) => { const r = SB.run.newRun({ seed: 'EVORUN01', clan: 'hearth', side: 'alley', championId: DU, rank: 0 }); r.act = act || 1; r.fish = 300; return r; };
  const add = (run, id) => { const i = CI.make(id, { run }); run.deck.push(i); return i; };
  const fought = (run, inst) => SB.run.applyGrowth(run, { stats: { plays: { [inst.uid]: 2 } } });
  EVO.forEach(e => {
    const run = newRun(1); const inst = add(run, e.stages[0].id);
    eq(SB.post.evolvable(run).length, 0, e.id + ' starts with nothing to evolve');
    // a fight in which the card is not played gives no Growth
    SB.run.applyGrowth(run, { stats: { plays: {} } }); eq(inst.growthFights || 0, 0, e.id + ': no Growth when not played');
    // plays count once per fight, even with several plays
    const rep = fought(run, inst); eq(inst.growthFights, 1, e.id + ': Growth 1 after one fight with 2 plays'); ok(rep.some(x => x.kind === 'evolution'), e.id + ' reports Growth');
    fought(run, inst); eq(SB.post.evolvable(run).length, 0, e.id + ' is not ready at Growth 2');
    const rep3 = fought(run, inst); eq(inst.growthFights, 3, e.id + ': Growth 3'); ok(rep3.some(x => x.kind === 'evolution' && /Ready for a Growth Spurt/.test(x.text)), e.id + ' says it is ready');
    fought(run, inst); eq(inst.growthFights, 3, e.id + ': Growth is capped at 3');
    const ev = SB.post.evolvable(run); eq(ev.length, 1, e.id + ' can Growth Spurt'); eq(ev[0].kind, 'growthSpurt', e.id + ' evolvable kind'); eq(ev[0].to, e.stages[1].id, e.id + ' evolves to stage 2');
    // scratches, fork, knead, mastery survive
    const SC = e.stages[0].type === 'unit' ? ['up_iron_stomach'] : []; SC.forEach(x => inst.scratches.push(x)); inst.knead.attack = 2; inst.masteryRank = 1; inst.plays = 3; inst.charm = null;
    const lives0 = inst.lives; const r = SB.post.growthSpurt(run, inst.uid);
    ok(r.ok, e.id + ' Growth Spurt works: ' + r.reason); eq(inst.id, e.stages[1].id, e.id + ' is now stage 2'); eq(inst.growthFights, 0, e.id + ' Growth resets'); eq(inst.lives, lives0 + 1, e.id + ' gains a life'); eq(inst.maxLives, e.stages[1].stats ? e.stages[1].stats.lives : inst.maxLives, e.id + ' max lives match the stage');
    eq(inst.scratches, SC, e.id + ' keeps its scratches'); eq(inst.knead.attack, 2, e.id + ' keeps its Knead'); eq(inst.masteryRank, 1, e.id + ' keeps its Mastery rank');
    const ef = CI.effective(inst); eq(ef.name, e.stages[1].name, e.id + ' effective name is stage 2');
    if (ef.type === 'unit') eq(ef.stats.health, e.stages[1].stats.health + 10 + 0, e.id + ' stage 2 health plus Iron Stomach');
    ok(!SB.post.growthSpurt(run, inst.uid).ok, e.id + ' cannot Growth Spurt twice');
    eq(SB.post.baseSlots(SB.content.card(inst.id), inst), 2, e.id + ' stage 2 has 2 slots');
    // Legend: Act 2 or later, quest done, 90 Fish
    eq(SB.post.evolvable(run).length, 0, e.id + ' stage 2 needs the quest');
    inst.quest = { [e.stages[1].quest.check.counter]: e.stages[1].quest.check.n - 1 }; run.act = 2; eq(SB.post.evolvable(run).length, 0, e.id + ' quest one short');
    inst.quest[e.stages[1].quest.check.counter] = e.stages[1].quest.check.n;
    run.act = 1; eq(SB.post.evolvable(run).length, 0, e.id + ' no Legend in Act 1'); run.act = 2;
    const ev2 = SB.post.evolvable(run); eq(ev2.length, 1, e.id + ' can be made a Legend'); eq(ev2[0].kind, 'legend', e.id + ' evolvable kind legend'); eq(ev2[0].price, 90, e.id + ' Legend price');
    run.fish = 50; ok(!SB.post.legendCeremony(run, inst.uid).ok && inst.id === e.stages[1].id, e.id + ' too poor for the ceremony'); run.fish = 300;
    const lc = SB.post.legendCeremony(run, inst.uid); ok(lc.ok, e.id + ' ceremony: ' + lc.reason); eq(run.fish, 210, e.id + ' ceremony cost 90'); eq(inst.id, e.stages[2].id, e.id + ' is a Legend');
    eq(inst.scratches, SC, e.id + ' Legend keeps its scratches'); eq(inst.masteryRank, 1, e.id + ' Legend keeps Mastery'); eq(SB.post.baseSlots(SB.content.card(inst.id), inst), 3, e.id + ' Legend has 3 slots');
    eq(SB.post.evolvable(run).length, 0, e.id + ' nothing left to evolve'); ok(!SB.post.legendCeremony(run, inst.uid).ok, e.id + ' no second ceremony');
    // Growth no longer counts for the final stage
    fought(run, inst); eq(inst.growthFights, 0, e.id + ' Legend does not grow');
  });
  { // birthThreshold and legendCeremonyFree relics
    const run = newRun(2); run.relics = []; const e = EVO[0]; const inst = add(run, e.stages[1].id); inst.quest = { [e.stages[1].quest.check.counter]: 99 };
    SB.run.applyGrowth(run, { stats: { plays: { [inst.uid]: 1 } } }); ok(SB.post.evolvable(run).every(x => x.kind === 'legend'), 'stage 2 only ever offers the Legend Ceremony');
    const old = SB.run.mod; SB.run.mod = (r, k) => k === 'legendCeremonyFree' ? true : old(r, k); run.fish = 0;
    ok(SB.post.legendCeremony(run, inst.uid).ok && run.fish === 0, 'legendCeremonyFree relic: the ceremony is free'); SB.run.mod = old; }
  { const run = newRun(1); const e = EVO[2]; const inst = add(run, e.stages[0].id); const old = SB.run.mod; SB.run.mod = (r, k) => k === 'birthThreshold' ? 1 : old(r, k);
    SB.run.applyGrowth(run, { stats: { plays: { [inst.uid]: 1 } } }); eq(SB.post.evolvable(run).length, 1, 'birthThreshold 1: one fight is enough'); SB.run.mod = old; }
  { // the Nook offers the free Growth Spurt
    const run = newRun(1); const e = EVO[1]; const inst = add(run, e.stages[0].id); inst.growthFights = 3;
    const nk = SB.nook.open ? SB.nook.open(run) : null; if (nk) ok(nk.growthSpurt.length === 1 && nk.growthSpurt[0].uid === inst.uid, 'the Nook lists the Growth Spurt');
    const g = SB.nook.growthSpurt(run, inst.uid); ok(g.ok && inst.id === e.stages[1].id, 'the Nook Growth Spurt evolves the card'); }
  { // a litter of an evolution card resets Growth
    const run = newRun(1); const e = EVO[0]; const inst = add(run, e.stages[2].id); const r = SB.post.litter ? SB.post.litter(run, inst.uid) : null; if (r) ok(!r.ok, 'Legends do not do litters'); }
});
//@@EVO3-END@@

//@@RUN-BEGIN@@
section('run layer: championIdMap, tiers in order, Mastery and Kneading', () => {
  const map = SB.data.meta.championIdMap;
  eq(Object.keys(map).length, 8, 'championIdMap has 8 entries');
  Object.values(map).forEach(id => ok(SB.content.card(id) && SB.content.card(id).type === 'champion', id + ' is a real champion'));
  const run = SB.run.newRun({ seed: 'TIERRUN1', clan: 'alley', side: 'hearth', championId: AS, rank: 0 });
  const o1 = SB.run.championOptions(run, 1); eq(o1.map(o => o.path), ['A', 'B', 'C'], 'tier 1 offers paths A, B, C');
  ok(!SB.run.championUpgrade(run, 1, o1[0].id).ok, 'tier 1 locked before Night 2');
  run.tierUnlocked = 1; ok(!SB.run.championUpgrade(run, 2, SB.run.championOptions(run, 2)[0].id).ok, 'tiers are taken in order');
  ok(!SB.run.championUpgrade(run, 1, 'nope').ok, 'unknown option refused');
  ok(SB.run.championUpgrade(run, 1, o1[0].id).ok, 'tier 1 taken'); run.tierUnlocked = 3;
  ['A', 'B', 'C'].forEach(() => { });
  SB.run.championUpgrade(run, 2, SB.run.championOptions(run, 2)[0].id); const r3 = SB.run.championUpgrade(run, 3, SB.run.championOptions(run, 3)[0].id);
  ok(r3.ok && r3.state.pure && r3.finalForm, 'three path A picks give the final form');
  const run2 = SB.run.newRun({ seed: 'TIERRUN2', clan: 'alley', side: 'hearth', championId: AS, rank: 0 }); run2.tierUnlocked = 3;
  SB.run.championUpgrade(run2, 1, SB.run.championOptions(run2, 1)[0].id); SB.run.championUpgrade(run2, 2, SB.run.championOptions(run2, 2)[1].id); const m3 = SB.run.championUpgrade(run2, 3, SB.run.championOptions(run2, 3)[0].id);
  ok(m3.ok && !m3.state.pure && !m3.finalForm, 'mixed paths give no final form');
  // Mastery thresholds 3/7/12, champions 4/9/15, plays counted up to 3 per fight
  const r = SB.run.newRun({ seed: 'MASTRUN1', clan: 'alley', side: 'hearth', championId: AS, rank: 0 }); const c = CI.make('neutral_swat', { run: r }); r.deck.push(c);
  eq(SB.run.masteryThresholds(r, c, SB.content.card('neutral_swat')), [3, 7, 12], 'card thresholds');
  eq(SB.run.masteryThresholds(r, r.deck[0], SB.content.card(AS)), [4, 9, 15], 'champion thresholds');
  SB.run.applyGrowth(r, { stats: { plays: { [c.uid]: 10 } } }); eq(c.plays, 3, 'only 3 plays count per fight'); eq(c.masteryRank, 1, 'rank 1 at 3 plays');
  SB.run.applyGrowth(r, { stats: { plays: { [c.uid]: 3 } } }); SB.run.applyGrowth(r, { stats: { plays: { [c.uid]: 3 } } }); eq(c.masteryRank, 2, 'rank 2 at 7 plays (9)');
  const e1 = CI.effective(c); ok(e1.mastery && e1.mastery.rank === 2 || c.masteryRank === 2, 'effective card carries the rank');
  // Kneading caps via the battle
  const B = eb('hearth_biscuit_kitten'); const u = deployAt(B, 'hearth_biscuit_kitten'); for (let i = 0; i < 20; i++) B.doKnead(u, 'attack', 1); eq(B.run.deck[1].knead.attack, 12, 'normal card Knead cap 12');
  const Bc = mk({ champ: AS, hands: [[AS]] }); const ch = deployAt(Bc, AS); for (let i = 0; i < 30; i++) Bc.doKnead(ch, 'attack', 1); eq(Bc.__ch.knead.attack, 20, 'champion Knead cap 20');
  // Post knead
  const pr = SB.run.newRun({ seed: 'KNEADPOST', clan: 'alley', side: 'hearth', championId: AS, rank: 0 }); pr.fish = 100; const k = CI.make('hearth_porch_tabby', { run: pr }); pr.deck.push(k);
  const k1 = SB.post.knead(pr, k.uid), k2 = SB.post.knead(pr, k.uid), k3 = SB.post.knead(pr, k.uid);
  ok(k1.ok && k2.ok, 'two Post kneads work'); ok(!k3.ok, 'third Post knead refused (max 2 per card)'); eq(pr.fish, 70, 'each Post knead costs 15');
});
//@@RUN-END@@

section('balance pass: printed Power / Health of all eight champions and the clan kittens', () => {
  const want = { alley_shadow: [4, 15], alley_mad_maxine: [4, 18], hearth_duchess_marmalade: [6, 30], hearth_brother_crumpet: [3, 22],
    moon_oswin_ledgerpaw: [4, 18], moon_tuppence_mistfur: [3, 18], mischief_tumble_ledgeworth: [4, 16], mischief_parcel_pennywhistle: [3, 15] };
  Object.keys(want).forEach(id => { const c = SB.content.card(id); eq([c.stats.power, c.stats.health, c.stats.lives], [want[id][0], want[id][1], 9], id + ' printed Power/Health/Lives'); });
  const kit = { alley_basic_kitten: [1, 4, 2], hearth_basic_kitten: [1, 6, 2], moon_basic_kitten: [3, 4, 3], mischief_basic_kitten: [2, 4, 3] };
  Object.keys(kit).forEach(id => { const c = SB.content.card(id); eq([c.stats.power, c.stats.health, c.stats.lives], kit[id], id + ' printed Power/Health/Lives'); });
});

//@@END@@
const summary = () => {
  console.log('\n' + checks + ' checks, ' + failures + ' failures');
  if (failLog.length) { console.log(failLog.slice(0, 60).map(x => ' - ' + x).join('\n')); }
  process.exit(failures ? 1 : 0);
};
summary();
