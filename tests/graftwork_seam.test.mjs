// The Thread engine (design/THREAD.md): extend / cut / slack, payouts, caps, Tied, Frayed, preview parity, determinism.
import assert from 'node:assert/strict';
import * as RUN from '../graftwork/engine/run.js';
import { newCombat, playCard, endTurn, specOf } from '../graftwork/engine/combat.js';
import { newInst, schoolsOf, cardSpec } from '../graftwork/engine/cards.js';
import { seamPreview } from '../graftwork/engine/seam.js';
import { CARDS, GRAFTS, RELICS, ENEMIES } from '../graftwork/data/index.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const SCH = ['ember', 'echo', 'hoard', 'blood', 'rust', 'static', 'gilded'];
// fixture cards: one per school, free, no effects. Types: 'skill' (extends/cuts) and 'power' (never eats Echo)
for (const s of SCH) {
  CARDS['t_' + s] = { id: 't_' + s, name: 'T ' + s, type: 'skill', cost: 0, rarity: 'common', school: s, target: 'none', fx: [], flavor: 'x', flags: {} };
  CARDS['tp_' + s] = { id: 'tp_' + s, name: 'TP ' + s, type: 'power', cost: 0, rarity: 'common', school: s, target: 'none', fx: [], flavor: 'x', flags: {} };
}
CARDS.t_plain = { id: 't_plain', name: 'plain', type: 'skill', cost: 0, rarity: 'common', target: 'none', fx: [], flavor: 'x', flags: {} };
const GOF = { ember: 'g_ember_pin', echo: 'g_held_breath', hoard: 'g_quick_hands', blood: 'g_sutured_seam', rust: 'g_oxide_patch', static: 'g_ground_wire', gilded: 'g_leaf_gilt' };
for (const s of SCH) assert.equal(GRAFTS[GOF[s]].school, s, 'fixture graft ' + s);
const GOF2 = { ember: ['g_ember_pin', 'g_cinder_wrap', 'g_scorch_thread'] };

let uidn = 0;
function fight(seed = 'seam', enemies = ['bedpan_slime']) {
  uidn = 0;
  const run = RUN.newRun({ hero: 'marrow', seed });
  const c = newCombat(run, enemies);
  c.run.hero = ''; // no hero passives: exact numbers
  for (const e of c.enemies) { e.hp = e.maxHp = 99999; }
  c.hand = []; c.energy = 99; c.maxEnergy = 99;
  return c;
}
function mk(c, id, o = {}) {
  const inst = newInst(id, () => 'tt' + (uidn++));
  inst.grafts = (o.grafts || []).slice(); inst.fused = (o.fused || []).slice();
  const card = { inst, uid: inst.uid, tithed: false, jam: !!o.jam, costMod: 0, plays: 0, rolled: false, temp: true };
  c.hand.push(card);
  return card;
}
const play = (c, card) => { const hi = c.hand.indexOf(card); assert.ok(hi >= 0); const r = playCard(c, hi, 0); assert.ok(r.ok, JSON.stringify(r)); return r; };
const P = (c, sch, o) => play(c, mk(c, 't_' + sch, o));
const evs = (c, tt) => c.ev.filter((e) => e.t === tt);
const mark = (c) => c.ev.length;
const since = (c, m, tt) => c.ev.slice(m).filter((e) => e.t === tt);
// build a len-3 line of `a`, then cut it with a power of school `b`
function line3(c, a, b = a === 'rust' ? 'ember' : 'rust') { for (let i = 0; i < 3; i++) P(c, a); const m = mark(c); play(c, mk(c, 'tp_' + b)); return m; }

t('schoolsOf: base + live + fused schools, deduped; junk and plain are empty', () => {
  const s = cardSpec({ uid: 'u', id: 't_ember', grafts: [GOF.ember, GOF.blood], fused: [GOF.static], up: 0 });
  assert.deepEqual(schoolsOf(s).sort(), ['blood', 'ember', 'static']);
  assert.deepEqual(schoolsOf(cardSpec({ uid: 'u', id: 'j_flake', grafts: [GOF.ember], fused: [], up: 0 })), []);
  assert.deepEqual(schoolsOf(cardSpec({ uid: 'u', id: 't_plain', grafts: [], fused: [], up: 0 })), []);
  assert.deepEqual(schoolsOf(cardSpec({ uid: 'u', id: 't_plain', grafts: [GOF.rust], fused: [], up: 0 })), ['rust']);
});
t('extend, slack and cut', () => {
  const c = fight();
  P(c, 'ember'); assert.equal(c.seam.len, 1);
  P(c, 'ember'); assert.equal(c.seam.len, 2);
  play(c, mk(c, 't_plain')); assert.equal(c.seam.len, 2, 'slack changes nothing');
  assert.equal(evs(c, 'seamSlack').length, 1);
  const m = mark(c);
  P(c, 'blood');
  assert.equal(c.seam.len, 1, 'cut starts a new line');
  assert.equal(since(c, m, 'seamCut')[0].paid, 1, 'len 2 pays S=1');
  assert.equal(c.seam.cuts, 1);
});
t('bridge cards pivot the line', () => {
  const c = fight();
  P(c, 'ember'); P(c, 'ember');
  P(c, 'ember', { grafts: [GOF.blood] }); assert.equal(c.seam.len, 3);
  P(c, 'blood'); assert.equal(c.seam.len, 4, 'blood overlaps the bridge');
  P(c, 'blood'); assert.equal(c.seam.len, 5);
  const m = mark(c); P(c, 'blood');
  assert.equal(c.seam.len, 5, 'len cap 5');
  assert.equal(since(c, m, 'seamCut').length, 0);
});
t('payout: top school S stitches plus floor(S/2) in a second school with count >= 2', () => {
  const c = fight();
  P(c, 'ember'); P(c, 'ember'); P(c, 'ember', { grafts: [GOF.blood] }); P(c, 'blood'); P(c, 'blood');
  const m = mark(c); play(c, mk(c, 'tp_rust'));
  const pays = since(c, m, 'seamPay');
  assert.equal(pays.length, 2);
  assert.deepEqual([pays[0].school, pays[0].stitches], ['blood', 4], 'tie goes to the school of the last card');
  assert.deepEqual([pays[1].school, pays[1].stitches], ['ember', 2]);
});
t('a second school with count 1 pays nothing', () => {
  const c = fight();
  P(c, 'ember'); P(c, 'ember', { grafts: [GOF.blood] }); P(c, 'ember');
  const m = mark(c); play(c, mk(c, 'tp_rust'));
  assert.equal(since(c, m, 'seamPay').length, 1);
});
t('Ember pays 2 Burn per stitch to all enemies', () => {
  const c = fight('s', ['bedpan_slime', 'slime_bit']);
  const m = line3(c, 'ember'); void m;
  for (const e of c.enemies) assert.equal(e.st.burn, 4);
});
t('Echo pays 1 Echo per 2 stitches rounded up', () => {
  const c = fight(); line3(c, 'echo'); assert.equal(c.player.st.echo, 1);
  const d = fight(); for (let i = 0; i < 4; i++) P(d, 'echo'); play(d, mk(d, 'tp_rust')); assert.equal(d.player.st.echo, 2, 'S=3 gives 2');
});
t('Hoard draws 1 per 2 stitches (cap 3 per turn) and queues a retain', () => {
  const c = fight(); const h = c.hand.length; const m = line3(c, 'hoard');
  assert.equal(since(c, m, 'seamPay')[0].amount, 1);
  assert.equal(c.seam.retain, 1);
  const d = fight(); d.seam.paidTurn.draw = 3; const m2 = line3(d, 'hoard'); void h;
  assert.equal(since(d, m2, 'seamPay')[0].amount, 0, 'draw cap');
  const e = fight(); e.seam.paidTurn.draw = 2; const m3 = line3(e, 'hoard');
  assert.equal(since(e, m3, 'seamPay')[0].amount, 1, 'only the remaining draw');
});
t('Hoard retain marks a card at turn end', () => {
  const c = fight(); line3(c, 'hoard'); const keep = mk(c, 't_plain');
  endTurn(c); void keep;
  assert.equal(c.seam.retain, 0, 'retain consumed');
});
t('Blood heals 2 per stitch', () => {
  const c = fight(); c.player.hp = c.player.maxHp - 20; const hp = c.player.hp; line3(c, 'blood');
  assert.equal(c.player.hp, hp + 4);
});
t('Rust pays 3 Block per stitch and 2 pierce per junk in hand per stitch', () => {
  const c = fight(); mk(c, 'j_flake'); mk(c, 'j_flake'); const e = c.enemies[0]; e.block = 50; const hp = e.hp;
  line3(c, 'rust', 'ember');
  assert.equal(c.player.block, 6);
  assert.equal(hp - e.hp, 8, '2 stitches x 2 junk x 2');
});
t('Static pays 1 Charge per stitch, cap 4 per turn', () => {
  const c = fight(); line3(c, 'static'); assert.equal(c.player.st.charge, 2);
  const d = fight(); d.seam.paidTurn.charge = 3; line3(d, 'static'); assert.equal(d.player.st.charge, 1);
  const e = fight(); e.seam.paidTurn.charge = 4; line3(e, 'static'); assert.equal(e.player.st.charge || 0, 0);
});
t('Gilded pays 2 gold per stitch, cap 20 per combat', () => {
  const c = fight(); const g = c.run.gold; line3(c, 'gilded'); assert.equal(c.run.gold, g + 4);
  const d = fight(); d.seam.gold = 19; const g2 = d.run.gold; line3(d, 'gilded'); assert.equal(d.run.gold, g2 + 1); assert.equal(d.seam.gold, 20);
  const e = fight(); e.seam.gold = 20; const g3 = e.run.gold; line3(e, 'gilded'); assert.equal(e.run.gold, g3);
});
t('at most 3 cuts per turn pay', () => {
  const c = fight(); const m = mark(c);
  for (let r = 0; r < 5; r++) { const a = SCH[r % 2 ? 0 : 3]; for (let i = 0; i < 3; i++) P(c, a); }
  const cuts = since(c, m, 'seamCut').filter((e) => e.paid > 0);
  assert.equal(cuts.length, 3, 'three paid cuts');
  assert.equal(c.seam.cuts, 3);
});
t('Tied cards (fused graft) act as slack and never cut', () => {
  const c = fight();
  P(c, 'ember'); P(c, 'ember');
  const m = mark(c); P(c, 'blood', { fused: [GOF.blood] });
  assert.equal(c.seam.len, 2); assert.equal(since(c, m, 'seamCut').length, 0);
  P(c, 'ember', { fused: [GOF.ember] }); assert.equal(c.seam.len, 2, 'tied does not extend either');
  P(c, 'ember'); assert.equal(c.seam.len, 3);
  assert.equal(seamPreview(c, mk(c, 't_blood', { fused: [GOF.rust] })).kind, 'tied');
});
t('a jammed card is Frayed and acts as slack', () => {
  const c = fight(); P(c, 'ember'); const m = mark(c);
  P(c, 'blood', { jam: true });
  assert.equal(since(c, m, 'seamFray').length, 1); assert.equal(since(c, m, 'seamSlack').length, 1);
  assert.equal(c.seam.len, 1); assert.equal(c.seam.cuts, 0);
});
t('Overload counts 2 knots; replays and Echo count once', () => {
  const c = fight(); P(c, 'ember');
  P(c, 'ember', { grafts: GOF2.ember }); assert.equal(c.seam.len, 3); assert.equal(c.seam.counts.ember, 3);
  const d = fight(); d.player.st.echo = 3; P(d, 'ember'); P(d, 'ember'); assert.equal(d.seam.len, 2, 'echo replay did not add knots');
  const e = fight(); P(e, 'ember', { grafts: GOF2.ember }); assert.equal(e.seam.len, 2);
});
t('Spool raises the len cap to 6', () => {
  RELICS.r_test_spool = { id: 'r_test_spool', name: 'x', rarity: 'common', text: 'x', mod: { seamCap: 6 } };
  const c = fight(); c.run.relics.push('r_test_spool');
  for (let i = 0; i < 8; i++) P(c, 'ember'); assert.equal(c.seam.len, 6);
  const m = mark(c); P(c, 'blood'); assert.equal(since(c, m, 'seamCut')[0].paid, 5);
  delete RELICS.r_test_spool;
});
t('Cadence Lock breaks the Line the first time a school repeats', () => {
  const c = fight(); c.player.st.cadencelock = 1;
  P(c, 'ember'); const m = mark(c); P(c, 'ember');
  assert.equal(c.seam.len, 1); assert.equal(since(c, m, 'seamPay').length, 0); assert.ok(c.seam.lockBroke);
  P(c, 'ember'); assert.equal(c.seam.len, 2, 'only the first repeat breaks');
});
t('Resonance: tier 3 adds a stitch, tier 6 pays the cut twice', () => {
  const c = fight(); c.res = { ember: 3 }; const m = line3(c, 'ember'); assert.equal(since(c, m, 'seamPay')[0].stitches, 3);
  const d = fight(); d.res = { ember: 6 }; const m2 = line3(d, 'ember'); assert.equal(since(d, m2, 'seamPay')[0].stitches, 6);
  const e = fight(); e.res = { ember: 6 }; for (let i = 0; i < 3; i++) P(e, 'ember'); const m3 = mark(e); endTurn(e);
  assert.equal(since(e, m3, 'seamPay')[0].stitches, 2, 'turn-end cash is not a cut: (S-1)+1 tier, once');
});
t('turn end cashes an unfinished Line at S-1; turn start resets unless Tied', () => {
  const c = fight(); for (let i = 0; i < 4; i++) P(c, 'blood'); const m = mark(c); endTurn(c);
  assert.equal(since(c, m, 'seamPay')[0].stitches, 2);
  assert.equal(c.seam.len, 0, 'reset');
  const d = fight(); for (let i = 0; i < 4; i++) P(d, 'blood'); d.seam.tied = true; const m2 = mark(d); endTurn(d);
  assert.equal(since(d, m2, 'seamPay').length, 0, 'tied line is not cashed');
  assert.equal(d.seam.len, 4, 'carried at full value'); assert.equal(d.seam.tied, false);
  assert.equal(d.seam.cuts, 0);
});
t('a len 1 line pays nothing and does not use a cut', () => {
  const c = fight(); P(c, 'ember'); P(c, 'blood'); assert.equal(c.seam.cuts, 0); assert.equal(evs(c, 'seamPay').length, 0);
});
t('relic and enemy hooks fire; an enemy can cancel a payout', () => {
  const seen = [];
  RELICS.r_test_hook = { id: 'r_test_hook', name: 'x', rarity: 'common', text: 'x', on: { seamExtend: (A, i) => seen.push('x' + i.len), seamCut: (A, i) => seen.push('c' + i.len), seamPay: (A, i) => seen.push('p' + i.school) } };
  const c = fight(); c.run.relics.push('r_test_hook');
  const def = ENEMIES.bedpan_slime; const old = def.on; const eseen = [];
  def.on = { ...(old || {}), seamExtend: (A, e, i) => eseen.push('x' + i.len), seamCut: (A, e, i) => { eseen.push('c'); if (i.len >= 3) i.cancel = true; }, seamPay: () => eseen.push('p') };
  try {
    c.enemies[0].def = def;
    P(c, 'ember'); P(c, 'ember'); P(c, 'ember'); line3(c, 'blood', 'rust');
    assert.ok(seen.includes('x2') && seen.includes('x3'));
    assert.deepEqual(eseen.filter((x) => x[0] === 'x'), ['x2', 'x3', 'x2', 'x3']);
    assert.ok(eseen.includes('c'));
    assert.equal(eseen.includes('p'), false, 'cancelled cuts pay nothing');
    assert.ok(!seen.includes('pember'));
  } finally { def.on = old; delete RELICS.r_test_hook; }
});
t('seamPreview is pure and matches the real outcome', () => {
  const c = fight('prev');
  const rng = (() => { let a = 12345; return () => (a = (a * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
  for (let step = 0; step < 120; step++) {
    if (step % 17 === 16) endTurn(c);
    const sch = SCH[Math.floor(rng() * 4)];
    const o = {}; if (rng() < 0.25) o.grafts = [GOF[SCH[Math.floor(rng() * 7)]]]; if (rng() < 0.1) o.fused = [GOF.ember]; if (rng() < 0.1) o.jam = true;
    const id = rng() < 0.15 ? 't_plain' : 't_' + sch;
    const card = mk(c, id, o);
    const snap = JSON.stringify(c.seam);
    const pv = seamPreview(c, card);
    assert.equal(JSON.stringify(c.seam), snap, 'preview did not mutate');
    const m = mark(c), lenBefore = c.seam.len;
    play(c, card);
    const cutEv = since(c, m, 'seamCut').find((e) => e.kind === 'cut');
    if (pv.kind === 'cut') {
      const pays = since(c, m, 'seamPay');
      assert.deepEqual(pays.map((p) => [p.school, p.stitches]), pv.payout.map((p) => [p.school, p.stitches]), 'payout parity at step ' + step);
      assert.equal(c.seam.len, pv.len);
    } else if (pv.kind === 'extend') {
      assert.equal(c.seam.len, pv.len, 'len parity');
      assert.equal(since(c, m, 'seamPay').length, 0);
    } else { assert.equal(c.seam.len, lenBefore); assert.equal(pv.payout.length, 0); }
    void cutEv;
    if (c.over) break;
  }
});
t('determinism: same seed, same script, same events', () => {
  const run1 = () => { const c = fight('det'); for (let i = 0; i < 30; i++) { P(c, SCH[i * 7 % 5]); if (i % 9 === 8) endTurn(c); } return JSON.stringify(c.ev); };
  assert.equal(run1(), run1());
});
t('smoke: random grafted decks never throw and never exceed caps', () => {
  const gids = Object.keys(GRAFTS);
  let fights = 0;
  for (let k = 0; k < 36; k++) {
    const hero = ['marrow', 'wick', 'odile'][k % 3];
    const run = RUN.newRun({ hero, seed: 'smoke' + k });
    const rg = run.rng;
    for (const inst of run.deck) {
      const want = rg.int(4);
      for (let i = 0; i < want; i++) RUN.applyGraft(run, inst.uid, rg.pick(gids), { keepPhase: true, free: true });
      if (rg.chance(0.15) && !inst.fused) inst.fused = [rg.pick(gids)];
    }
    const c = newCombat(run, ['bedpan_slime', 'slime_bit']);
    let turnCuts = 0, turnDraw = 0, turnCharge = 0, spans = 0;
    for (let turn = 0; turn < 8 && !c.over; turn++) {
      c.ev.length = 0;
      for (let g = 0; g < 30 && !c.over; g++) {
        const idx = c.hand.map((_, i) => i).filter((i) => { try { return playableQuiet(c, i); } catch { return false; } });
        if (!idx.length) break;
        const hi = idx[rg.int(idx.length)];
        const r = playCard(c, hi, 0);
        if (!r.ok) break;
        assert.ok(c.seam.len <= 5 && c.seam.len >= 0);
      }
      if (c.over) break;
      endTurn(c);
      turnCuts = 0; turnDraw = 0; turnCharge = 0;
      // events of the turn (play phase + the end cash)
      let cuts = 0, draw = 0, charge = 0;
      for (const e of c.ev) {
        if (e.t === 'seamCut' && e.kind === 'cut' && e.paid > 0) cuts++;
        if (e.t === 'seamPay' && e.school === 'hoard') draw += e.amount;
        if (e.t === 'seamPay' && e.school === 'static') charge += e.amount;
        if (e.t === 'turnStart') { cuts = 0; draw = 0; charge = 0; }
      }
      assert.ok(cuts <= 3, 'cuts ' + cuts); assert.ok(draw <= 3, 'draw ' + draw); assert.ok(charge <= 4, 'charge ' + charge); spans++;
    }
    assert.ok(c.seam.gold <= 20, 'gold cap');
    fights++;
  }
  assert.ok(fights === 36);
  function playableQuiet(c, i) { const card = c.hand[i]; const sp = specOf(c, card); return !sp.unplayable && !sp.flags.unplayable && c.energy >= (typeof sp.cost === 'number' ? sp.cost : 0); }
});

console.log(`graftwork_seam: ${n} tests passed`);
