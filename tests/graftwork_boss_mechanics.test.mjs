// Boss and elite signature mechanics: each one triggers, its counter works, intent == damage where numeric, no throws with all 3 heroes.
//   Matron Claim, Broker Late Fee, Impresario Ensemble, Resident Mimic, Defibrillator Insulated, Pickled King Thirst,
//   Stagehands Hoist the Heavy, Gold Leaf Golem Leaf Armor, Diva Applause.
import assert from 'node:assert/strict';
import * as RUN from '../graftwork/engine/run.js';
import { newCombat, playCard, endTurn, canPlay, intentOf, specOf } from '../graftwork/engine/combat.js';
import { newInst, instWeight } from '../graftwork/engine/cards.js';
import { CARDS, GRAFTS, ENEMIES } from '../graftwork/data/index.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const SCH = ['ember', 'echo', 'hoard', 'blood', 'rust', 'static', 'gilded'];
for (const s of SCH) CARDS['t_' + s] = { id: 't_' + s, name: 'T ' + s, type: 'skill', cost: 0, rarity: 'common', school: s, target: 'none', fx: [], flavor: 'x', flags: {} };
CARDS.t_plain = { id: 't_plain', name: 'plain', type: 'skill', cost: 0, rarity: 'common', target: 'none', fx: [], flavor: 'x', flags: {} };
CARDS.t_big = { id: 't_big', name: 'big', type: 'attack', cost: 0, rarity: 'common', target: 'enemy', fx: [{ op: 'dmg', n: 40 }], flavor: 'x', flags: {} };
CARDS.t_multi = { id: 't_multi', name: 'multi', type: 'attack', cost: 0, rarity: 'common', target: 'enemy', fx: [{ op: 'dmg', n: 10, hits: 3 }], flavor: 'x', flags: {} };
const GOF = { ember: 'g_ember_pin', echo: 'g_held_breath', blood: 'g_sutured_seam' };
for (const g of Object.values(GOF)) assert.ok(GRAFTS[g], 'fixture graft ' + g);

let uidn = 0;
// A lone-enemy fight with a clean slate: huge HP on both sides, no hero passives, free energy, empty hand.
function fight(enemy, seed = 'bm') {
  uidn = 0;
  const run = RUN.newRun({ hero: 'marrow', seed: seed + enemy });
  const c = newCombat(run, [enemy]);
  c.run.hero = '';
  for (const e of c.enemies) { e.hp = e.maxHp = 99999; }
  c.player.hp = c.player.maxHp = 5000; c.player.block = 0;
  c.hand = []; c.energy = 99; c.maxEnergy = 99;
  return c;
}
function mk(c, id, zone = c.hand) {
  const inst = newInst(id, () => 'bm' + (uidn++));
  const card = { inst, uid: inst.uid, tithed: false, jam: false, costMod: 0, plays: 0, rolled: false, temp: true };
  zone.push(card);
  return card;
}
const play = (c, card, ti = 0) => { const hi = c.hand.indexOf(card); assert.ok(hi >= 0, 'card in hand'); const r = playCard(c, hi, ti); assert.ok(r.ok, JSON.stringify(r)); };
const P = (c, id) => play(c, mk(c, id));
const zones = (c) => [...c.hand, ...c.drawPile, ...c.discard, ...c.exhaust, ...c.powers];
// End the turn and return the HP the lone enemy took off the player (block must be 0 and nothing else may bleed).
function hitTaken(c) { const hp = c.player.hp; c.player.block = 0; endTurn(c); return hp - c.player.hp; }

t('Matron Claim: claims the heaviest grafted card at the start, a second one when she rings', () => {
  const run = RUN.newRun({ hero: 'marrow', seed: 'matron-claim' });
  const d = run.deck;
  d[1].grafts = [GOF.ember]; d[2].grafts = [GOF.ember, GOF.blood];
  const c = newCombat(run, ['the_matron']);
  c.player.hp = c.player.maxHp = 999;
  const claimed = () => zones(c).filter((k) => k.claimed);
  assert.deepEqual(claimed().map((k) => k.uid), [d[2].uid], 'the heaviest grafted card');
  assert.equal(c.enemies[0].st.claim, 1);
  assert.equal(specOf(c, claimed()[0]).tithed, true, 'a Claimed card shows and scales as a Tithe');
  c.enemies[0].move = 'ring';
  endTurn(c);
  assert.equal(claimed().length, 2, 'the Bell Tolls claims a second card');
  assert.ok(claimed().some((k) => k.uid === d[1].uid));
});
t('Matron Claim: Tempered cards are immune', () => {
  const run = RUN.newRun({ hero: 'marrow', seed: 'matron-temper' });
  const d = run.deck;
  d[1].grafts = []; d[1].fused = [GOF.ember, GOF.blood];
  d[2].grafts = [GOF.echo]; d[2].fused = [GOF.ember]; // grafts AND fused: still immune
  const c = newCombat(run, ['the_matron']);
  assert.equal(zones(c).filter((k) => k.claimed).length, 0, 'nothing to claim');
  assert.ok(!c.enemies[0].st.claim);
});
t('Matron Claim: the claimed card really fights at -25%', () => {
  const run = RUN.newRun({ hero: 'marrow', seed: 'matron-dmg' });
  const s = run.deck.find((i) => i.id === 'm_strike');
  s.grafts = [GOF.ember];
  const c = newCombat(run, ['the_matron']);
  c.run.hero = ''; const e = c.enemies[0]; e.hp = e.maxHp = 9999; e.block = 0;
  const card = zones(c).find((k) => k.uid === s.uid);
  assert.ok(card.claimed);
  card.tithed = false; // isolate Claim from any Strain Tithe
  c.hand = [card]; c.energy = 9;
  const hp0 = e.hp; playCard(c, 0, 0);
  const claimedHit = hp0 - e.hp;
  card.claimed = false; card.tithed = false; c.hand = [card]; c.discard = c.discard.filter((k) => k !== card);
  const hp1 = e.hp; playCard(c, 0, 0);
  const plainHit = hp1 - e.hp;
  assert.ok(claimedHit < plainHit, `claimed ${claimedHit} should be below plain ${plainHit}`);
});

t('Broker Late Fee: a Line that reaches 3 frays and he plates 4; cutting every second card pays no fee', () => {
  const c = fight('the_broker'); const e = c.enemies[0];
  P(c, 't_ember'); P(c, 't_ember');
  assert.equal(c.seam.len, 2); assert.equal(e.block, 0);
  const m = c.ev.length; P(c, 't_ember');
  assert.equal(c.seam.len, 2, 'the third stitch frays back to 2');
  assert.equal(e.block, 4);
  assert.ok(c.ev.slice(m).some((x) => x.t === 'seamFray'));
  const c2 = fight('the_broker', 'bm2');
  for (const s of ['ember', 'rust', 'ember', 'rust']) P(c2, 't_' + s);
  assert.equal(c2.enemies[0].block, 0, 'alternating schools never fray');
});
t('Broker Late Fee: Tempered cards stay off the Line (no fray)', () => {
  const c = fight('the_broker', 'bm3'); const e = c.enemies[0];
  for (let i = 0; i < 4; i++) { const k = mk(c, 't_ember'); k.inst.fused = [GOF.ember]; play(c, k); }
  assert.equal(e.block, 0); assert.equal(c.seam.len, 0);
});

t('Impresario Ensemble: +1 per school past the first (max 3), intent equals the damage that lands', () => {
  const c = fight('the_impresario'); const e = c.enemies[0];
  assert.equal(e.move, 'downbeat');
  P(c, 't_ember'); assert.ok(!e.st.ensemble, 'one school adds nothing');
  P(c, 't_rust'); P(c, 't_static');
  assert.equal(e.st.ensemble, 2);
  const shown = intentOf(c, e).dmg;
  P(c, 't_blood'); P(c, 't_echo'); assert.equal(e.st.ensemble, 3, 'capped at 3');
  const shown3 = intentOf(c, e).dmg;
  assert.equal(shown3 - shown, 1, 'intent follows the status');
  assert.equal(hitTaken(c), shown3, 'intent == damage');
  assert.ok(!e.st.ensemble, 'resets for the next turn');
});
t('Impresario Ensemble: a two-school turn costs only +1', () => {
  const c = fight('the_impresario', 'bm4'); const e = c.enemies[0];
  const base = intentOf(c, e).dmg;
  for (const s of ['ember', 'rust', 'ember', 'rust', 'ember']) P(c, 't_' + s);
  assert.equal(intentOf(c, e).dmg, base + 1);
});

t('Resident Mimic: +3 per card of your last school; intent == damage; ending on another school cools it', () => {
  const c = fight('the_resident'); const e = c.enemies[0];
  e.move = 'mimic';
  const base = intentOf(c, e).dmg;
  P(c, 't_ember'); P(c, 't_ember'); P(c, 't_ember');
  assert.equal(e.st.mimicry, 3);
  assert.equal(intentOf(c, e).dmg, base + 9);
  P(c, 't_rust');
  assert.equal(e.st.mimicry, 1, 'the last school is rust, one card');
  assert.equal(intentOf(c, e).dmg, base + 3);
  for (let i = 0; i < 3; i++) { P(c, 't_ember'); P(c, 't_rust'); } // alternate so no Line is left to pay Block at turn end
  assert.equal(e.st.mimicry, 4, 'four rust cards played, last school rust');
  assert.equal(hitTaken(c), base + 12, 'intent == damage');
  assert.ok(!e.st.mimicry);
});

t('Defibrillator Insulated: Burn put on it returns half (rounded up, max 4) to you', () => {
  const c = fight('defibrillator'); const e = c.enemies[0];
  c.A.status(e, 'burn', 5);
  assert.equal(c.player.st.burn, 3);
  c.A.status(e, 'burn', 40);
  assert.equal(c.player.st.burn, 7, 'capped at 4 per application');
  const hp = e.hp; c.A.dmg(c.player, e, 7);
  assert.equal(hp - e.hp, 7, 'plain damage is not reflected');
  assert.equal(c.player.st.burn, 7);
});

t('Pickled King Thirst: heals 1 per 3 Block you gain, 9 a turn, resets each turn', () => {
  const c = fight('pickled_king'); const e = c.enemies[0];
  e.hp = 1000;
  c.A.block(c.player, 9); assert.equal(e.hp, 1003);
  c.A.block(c.player, 60); assert.equal(e.hp, 1009, 'capped at 9 a turn');
  endTurn(c);
  e.hp = 1000; c.player.block = 0;
  c.A.block(c.player, 3); assert.equal(e.hp, 1001, 'a new turn drinks again');
});

t('Stagehands Hoist the Heavy: jams the most expensive card in the next hand', () => {
  const c = fight('stagehands');
  const real = Object.values(CARDS).filter((d) => d.type !== 'junk' && typeof d.cost === 'number' && /^[mwox]_/.test(d.id));
  const heavy = real.reduce((a, b) => (b.cost > a.cost ? b : a));
  const cheap = real.reduce((a, b) => (b.cost < a.cost ? b : a));
  assert.ok(heavy.cost > cheap.cost);
  c.drawPile = []; c.discard = [];
  const cards = [heavy.id, cheap.id, cheap.id, cheap.id, cheap.id].map((id) => mk(c, id, c.drawPile));
  c.enemies[0].move = 'winch';
  endTurn(c);
  assert.equal(cards[0].jam, true, 'the heavy card is jammed');
  assert.ok(cards.slice(1).every((k) => !k.jam), 'cheap cards are not');
});

t('Gold Leaf Golem Leaf Armor: one card hit deals at most 14, many small hits go through', () => {
  const c = fight('gold_leaf_golem'); const e = c.enemies[0];
  e.hp = e.maxHp = 1000; e.block = 0;
  P(c, 't_big'); assert.equal(1000 - e.hp, 14);
  const hp = e.hp; P(c, 't_multi'); assert.equal(hp - e.hp, 30, 'three hits of 10 are not capped');
  const hp2 = e.hp; c.A.dmg(null, e, 50, { status: true, noMods: true }); assert.equal(hp2 - e.hp, 50, 'status damage ignores the armor');
});

t('Diva Applause: Aria gets +3 per card past the 5th (max +12); intent == damage', () => {
  const c = fight('the_diva'); const e = c.enemies[0];
  e.move = 'aria';
  const base = intentOf(c, e).dmg;
  for (let i = 0; i < 5; i++) P(c, 't_plain');
  assert.ok(!e.st.applause, 'five cards add nothing');
  for (let i = 0; i < 3; i++) P(c, 't_plain');
  assert.equal(e.st.applause, 3);
  assert.equal(intentOf(c, e).dmg, base + 9);
  for (let i = 0; i < 6; i++) P(c, 't_plain');
  assert.equal(e.st.applause, 4);
  assert.equal(hitTaken(c), base + 12, 'intent == damage');
});

// ---- every signature enemy against all three heroes: plays real decks for several turns, nothing throws, state stays sane ----
const SIGNATURE = ['the_matron', 'the_resident', 'defibrillator', 'the_broker', 'pickled_king', 'stagehands', 'gold_leaf_golem', 'the_diva', 'the_impresario'];
t('no throws: every signature enemy vs marrow, wick and odile (8 turns each)', () => {
  for (const hero of ['marrow', 'wick', 'odile']) for (const id of SIGNATURE) {
    assert.ok(ENEMIES[id], id);
    const run = RUN.newRun({ hero, seed: `bm-${hero}-${id}`, ascension: 0 });
    run.deck.forEach((inst, i) => { if (i % 2 === 0 && inst.grafts.length === 0) inst.grafts.push(i % 4 === 0 ? GOF.ember : GOF.blood); });
    run.hp = run.maxHp = 400;
    const c = newCombat(run, [id], { kind: ENEMIES[id].kind });
    for (let turn = 0; turn < 8 && !c.over; turn++) {
      for (let g = 0; g < 12 && !c.over; g++) {
        if (c.pending) break;
        const hi = c.hand.findIndex((_, i) => canPlay(c, i).ok);
        if (hi < 0) break;
        playCard(c, hi, 0);
      }
      if (c.over || c.pending) break;
      for (const e of c.enemies) if (!e.dead) assert.ok(Number.isFinite(intentOf(c, e).dmg), `${id} intent finite`);
      endTurn(c);
    }
    for (const e of c.enemies) for (const [k, v] of Object.entries(e.st)) assert.ok(Number.isFinite(v), `${id} status ${k}`);
  }
});
t('every signature move with a number has a short name and the new ones carry a tip', () => {
  const tips = { the_matron: ['scar', 'ring'], the_resident: ['mimic'], defibrillator: ['paddle'], the_broker: ['sweet'], pickled_king: ['sour'], stagehands: ['winch'], gold_leaf_golem: ['slam'], the_diva: ['aria'], the_impresario: ['downbeat'] };
  for (const [id, moves] of Object.entries(tips)) for (const m of moves) {
    const mv = ENEMIES[id].moves[m];
    assert.ok(mv.tip && mv.tip.length > 10, `${id}/${m} tip`);
    assert.ok(mv.name.length <= 16, `${id}/${m} name "${mv.name}" under 17 characters`);
    assert.ok(!/—/.test(mv.tip + mv.name), 'no em dash');
  }
});

console.log(`graftwork boss mechanics: ${n} passed`);
