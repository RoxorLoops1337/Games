// Afflictions (design/ENEMY_DEPTH.md section 1): every new status lifecycle with exact numbers, caps, guards, interactions.
import assert from 'node:assert/strict';
import * as RUN from '../graftwork/engine/run.js';
import { newCombat, playCard, endTurn, usePotion, addStatus, addCard, specOf, effCost, startPlayerTurn, dealDamage, setStatus } from '../graftwork/engine/combat.js';
import { afflStartTurn } from '../graftwork/engine/afflictions.js';
import { cardSpec } from '../graftwork/engine/cards.js';
import { ENEMIES, STATUSES, GRAFTS, CARDS } from '../graftwork/data/index.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const P = (s, k) => ({ op: 'status', s, n: k, to: 'player' });
const def = (id, moves, extra = {}) => { ENEMIES[id] = { id, name: id, act: 1, kind: 'normal', hp: 400, pattern: Object.keys(moves), moves, art: { body: 'figure', color: '#888' }, ...extra }; return id; };
const DUMMY = def('t_dummy', { idle: { name: 'Idle', fx: [{ op: 'block', n: 0, to: 'self' }] } });
function mk(enemies = [DUMMY], seed = 'affl', weighted = 0) {
  const run = RUN.newRun({ hero: 'marrow', seed });
  run.relics = [];
  // weighted: sew that many weight-1 grafts onto distinct cards (the Budget is 6, so 6 sits exactly at the line)
  const w1 = Object.values(GRAFTS).find((g) => g.weight === 1);
  run.deck.filter((i) => CARDS[i.id].type !== 'junk').slice(0, weighted).forEach((i) => { i.grafts = [w1.id]; });
  const c = newCombat(run, enemies);
  return { run, c };
}
const give = (c, id, to = 'hand') => { addCard(c, id, 1, to); return c.hand[c.hand.length - 1]; };
const setHand = (c, ids) => { c.discard.push(...c.hand.splice(0)); return ids.map((id) => give(c, id)); };
const graftPool = (pred) => Object.values(GRAFTS).filter(pred);

t('every affliction resolves in STATUSES with a one-line tooltip and no em dash', () => {
  for (const id of ['poison', 'brittle', 'rejection', 'infection', 'numb', 'unpicked', 'cadencelock', 'stagefright', 'dread', 'leaden', 'weightofdebt', 'stitchedup']) {
    const d = STATUSES[id]; assert.ok(d, id);
    for (const k of [1, 2, 5]) { const s = d.desc(k); assert.ok(s && !/\n|—/.test(s), id + ' ' + s); }
  }
});

t('poison: loses N at turn start ignoring Block, then rises by 1, capped at 6', () => {
  const { c } = mk();
  c.player.block = 50; setStatus(c, c.player, 'poison', 2); 
  const hp = c.player.hp; endTurn(c);
  assert.equal(c.player.hp, hp - 2); assert.equal(c.player.st.poison, 3);
  endTurn(c); assert.equal(c.player.hp, hp - 5); assert.equal(c.player.st.poison, 4);
  addStatus(c, c.player, 'poison', 10); assert.equal(c.player.st.poison, 6, 'cap 6');
  endTurn(c); assert.equal(c.player.st.poison, 6, 'stays at the cap');
});
t('poison: cleanse removes it, Intangible caps each tick to 1', () => {
  const { c } = mk();
  addStatus(c, c.player, 'poison', 4); addStatus(c, c.player, 'intangible', 2);
  const hp = c.player.hp; endTurn(c);
  assert.equal(c.player.hp, hp - 1, 'intangible caps the tick'); assert.equal(c.player.st.poison, 5);
  const k = give(c, 'm_cauterize'); const hi = c.hand.indexOf(k);
  c.energy = 3; assert.ok(playCard(c, hi).ok);
  assert.equal(c.player.st.poison, undefined, 'cleansed');
});
t('poison cannot kill below 1 HP while an untriggered wouldDie relic stands', () => {
  const { c, run } = mk();
  run.relics = ['r_second_skin']; c.player.hp = 3; addStatus(c, c.player, 'poison', 5);
  endTurn(c); assert.equal(c.player.hp, 1); assert.equal(c.over, null);
  c.rx = { skin: true }; endTurn(c); assert.equal(c.over, 'lose', 'once the relic is spent poison kills');
});
t('poison halves (rounded up) when its applier dies', () => {
  const E = def('t_venom', { spit: { name: 'Spit', fx: [P('poison', 4)] } }, { hp: 30 });
  const { c } = mk([E, DUMMY]);
  endTurn(c); assert.equal(c.player.st.poison, 5, 'applied 4, ticked, rose to 5');
  endTurn(c); // +4 again = 9, capped
  assert.equal(c.player.st.poison, 6);
  const v = c.enemies[0]; dealDamage(c, c.player, v, 999, { noMods: true, pierce: true });
  assert.ok(v.dead); assert.equal(c.player.st.poison, 3);
});

t('brittle: block broken by an attack costs 25% of the broken amount (max 6), cap 3 turns', () => {
  const { c } = mk();
  addStatus(c, c.player, 'brittle', 9); assert.equal(c.player.st.brittle, 3);
  c.player.block = 8; const hp = c.player.hp;
  dealDamage(c, c.enemies[0], c.player, 20, { noMods: true });
  assert.equal(c.player.hp, hp - 12 - 2, '12 gets through, 25% of 8 = 2 more');
  c.player.block = 40; const hp2 = c.player.hp;
  dealDamage(c, c.enemies[0], c.player, 30, { noMods: true });
  assert.equal(c.player.block, 10); assert.equal(c.player.hp, hp2, 'block not emptied: no shatter');
  c.player.block = 40; dealDamage(c, c.enemies[0], c.player, 40, { noMods: true });
  assert.equal(c.player.hp, hp2 - 6, '25% of 40 is 10, capped at 6');
});
t('brittle ticks down one per player turn', () => {
  const { c } = mk();
  addStatus(c, c.player, 'brittle', 2); endTurn(c); assert.equal(c.player.st.brittle, 1); endTurn(c); assert.equal(c.player.st.brittle, undefined);
});

t('rejection: prices trigger twice, lasts exactly one player turn', () => {
  const E = def('t_reject', { stamp: { name: 'Stamp', fx: [P('rejection', 1)] } });
  const { c, run } = mk([E]);
  const card = c.hand.find((k) => CARDS[k.inst.id].type !== 'junk' && specOf(c, k).cost <= 1) || give(c, 'm_incision');
  const g = graftPool((x) => x.mods.some((m) => m.k === 'selfHurt'))[0];
  assert.ok(g, 'a selfHurt graft exists');
  card.inst.grafts.push(g.id);
  const one = specOf(c, card).price.selfHurt;
  endTurn(c); assert.equal(c.player.st.rejection, 1);
  const hi = c.hand.indexOf(give(c, card.inst.id)); // fresh copy, ungrafted: check the grafted one if drawn
  c.hand.push(card); c.energy = 9; c.player.hp = 60; c.player.maxHp = 60;
  const before = c.player.hp; const idx = c.hand.indexOf(card);
  assert.ok(playCard(c, idx, 0).ok);
  assert.equal(before - c.player.hp, one * 2, 'self damage doubled'); void hi; void run;
  endTurn(c); // the enemy re-applies it; but its own tick must have been consumed
  assert.equal(c.player.st.rejection, 1);
  const { c: d } = mk(); addStatus(d, d.player, 'rejection', 1); endTurn(d); assert.equal(d.player.st.rejection, undefined);
});

t('infection: Strain counts +N, caps at 3, Tithes Bare cards immediately, no card cleanse removes it', () => {
  const { c } = mk([DUMMY], 'affl', 6);
  const s0 = c.strain.strain; const tithed0 = c.strain.tithed.length;
  assert.equal(s0, 0);
  addStatus(c, c.player, 'infection', 2);
  assert.equal(c.strain.strain, 2); assert.equal(c.strain.tithed.length, tithed0 + 2, 'two Bare cards tithed, mid-combat');
  const tithedNow = [...c.hand, ...c.drawPile, ...c.discard].filter((k) => k.tithed).length; assert.equal(tithedNow, 2, 'the Tithe is marked on the live cards');
  addStatus(c, c.player, 'infection', 9); assert.equal(c.player.st.infection, 3);
  const k = give(c, 'm_cauterize'); c.energy = 3; assert.ok(playCard(c, c.hand.indexOf(k)).ok);
  assert.equal(c.player.st.infection, 3, 'cauterize does not cleanse it');
  assert.equal(c.strain.strain, 3);
});
t('infection: a potion clears it and the Tithe lifts', () => {
  const { c, run } = mk([DUMMY], 'affl', 6);
  addStatus(c, c.player, 'infection', 2); run.potions = ['p_bitter_draught'];
  assert.ok(usePotion(c, 0, 0).ok);
  assert.equal(c.player.st.infection, undefined); assert.equal(c.strain.strain, 0);
  assert.equal([...c.hand, ...c.drawPile, ...c.discard].filter((k) => k.tithed).length, 0);
});
t('infection with no Bare card left becomes Backfire, capped by the deck', () => {
  const { c, run } = mk([DUMMY], 'affl', 0);
  for (const inst of run.deck) if (CARDS[inst.id].type !== 'junk') inst.grafts = ['g_quick_hands'].filter((g) => GRAFTS[g]);
  const w1 = Object.values(GRAFTS).find((g) => g.weight === 1);
  for (const inst of run.deck) if (CARDS[inst.id].type !== 'junk') inst.grafts = [w1.id];
  c.player.st.infection = 0; delete c.player.st.infection;
  addStatus(c, c.player, 'infection', 3);
  assert.equal(c.strain.tithed.length, 0, 'nothing Bare to tithe'); assert.ok(c.strain.backfire >= 1);
  assert.equal(c.strain.overflow, c.strain.strain);
});

t('numb: the heaviest grafted card in hand loses its boons, its prices still bite, others are untouched', () => {
  const { c } = mk();
  const [a, b, bare] = setHand(c, ['m_incision', 'm_incision', 'm_incision']);
  const light = graftPool((g) => g.weight === 1 && g.mods.some((m) => m.k === 'pct' && m.pct > 0) && g.mods.some((m) => m.k === 'selfHurt'))[0];
  const heavy = graftPool((g) => g.weight >= 2 && g.mods.some((m) => m.k === 'selfHurt') && g.mods.some((m) => m.k === 'pct' && m.pct > 0))[0];
  assert.ok(light && heavy, 'fixture grafts');
  a.inst.grafts = [light.id]; b.inst.grafts = [heavy.id];
  const fullB = specOf(c, b), fullA = specOf(c, a);
  c.player.st.numb = 1; afflStartTurn(c);
  const nb = specOf(c, b), na = specOf(c, a);
  assert.equal(nb.pct, 0, 'boon muted: no more +% numbers'); assert.ok(fullB.pct > 0);
  assert.deepEqual(nb.price, fullB.price, 'prices still bite');
  assert.equal(na.pct, fullA.pct, 'the lighter card is untouched');
  assert.equal(specOf(c, bare).pct, 0);
  delete c.player.st.numb; assert.equal(specOf(c, b).pct, fullB.pct, 'back to normal when it expires');
});
t('numb: expires after one player turn through the real flow', () => {
  const E = def('t_numb', { dull: { name: 'Dull', fx: [P('numb', 1)] } });
  const { c } = mk([E]);
  endTurn(c); assert.equal(c.player.st.numb, 1); endTurn(c); assert.equal(c.player.st.numb, 1, 're-applied each enemy phase, never stacks past 1');
});

t('unpicked: one patch is gone for the turn; an Overload drops to 2 grafts (no x1.5, no Shatter roll)', () => {
  const { c } = mk();
  const ids = graftPool((g) => g.weight === 1).slice(0, 3).map((g) => g.id);
  const [card] = setHand(c, ['m_incision']); card.inst.grafts = ids.slice();
  assert.equal(specOf(c, card).overload, true);
  c.player.st.unpicked = 1; afflStartTurn(c);
  const sp = specOf(c, card);
  assert.equal(sp.grafts.length, 2); assert.equal(sp.overload, false); assert.equal(card.inst.grafts.length, 3, 'real inst untouched');
  c.energy = 9; assert.ok(playCard(c, 0, 0).ok);
  assert.ok(!card.rolled && !card.inst.shattered, 'no Shatter roll while Unpicked');
  delete c.player.st.unpicked; assert.equal(specOf(c, card).overload, true);
});
t('unpicked: never touches a card Stitch Rat already emptied; fused patches are safe', () => {
  const { c } = mk();
  const [a, b] = setHand(c, ['m_incision', 'm_cut']);
  const g = graftPool((x) => x.weight === 1)[0].id;
  a.inst.grafts = [g]; b.inst.grafts = [g];
  c.enemies[0].data.stolen = [{ inst: a.inst, grafts: [g] }];
  c.player.st.unpicked = 1; afflStartTurn(c);
  assert.equal(specOf(c, a).grafts.length, 1, 'rat-held card is skipped'); assert.equal(specOf(c, b).grafts.length, 0, 'the other card lost its patch');
  const f = give(c, 'm_dress'); f.inst.fused = [g]; f.inst.grafts = [];
  afflStartTurn(c); assert.equal(specOf(c, f).fused.length, 1);
});

t('leaden: the highest-cost card in hand costs +1, only while it lasts', () => {
  const { c } = mk();
  const [cheap, dear] = setHand(c, ['m_cut', 'm_bonesaw']);
  const base = [effCost(c, cheap), effCost(c, dear)];
  addStatus(c, c.player, 'leaden', 5); assert.equal(c.player.st.leaden, 2, 'cap 2 turns');
  assert.equal(effCost(c, dear), base[1] + (base[1] >= base[0] ? 1 : 0)); assert.equal(effCost(c, cheap), base[0] + (base[0] > base[1] ? 1 : 0));
  endTurn(c); endTurn(c); assert.equal(c.player.st.leaden, undefined);
});

t('cadence lock: status lifecycle only (dur 1, cap 1)', () => {
  const E = def('t_usher', { pick: { name: 'Pick', fx: [P('cadencelock', 1)] } });
  const { c } = mk([E]); addStatus(c, c.player, 'cadencelock', 4); assert.equal(c.player.st.cadencelock, 1);
  endTurn(c); assert.equal(c.player.st.cadencelock, 1, 're-applied by the enemy phase'); 
  const { c: d } = mk(); addStatus(d, d.player, 'cadencelock', 1); endTurn(d); assert.equal(d.player.st.cadencelock, undefined);
});

t('stagefright: cards past the 4th bank N, the next enemy hit pays it, and it resets at turn start', () => {
  const E = def('t_stage', { hit: { name: 'Hit', fx: [{ op: 'dmg', n: 5 }] } });
  const { c } = mk([E]);
  addStatus(c, c.player, 'stagefright', 9); assert.equal(c.player.st.stagefright, 4);
  c.player.st.stagefright = 2; c.energy = 99;
  for (let i = 0; i < 6; i++) { const k = give(c, 'm_dress'); assert.ok(playCard(c, c.hand.indexOf(k)).ok); }
  assert.equal(c.affl.stage, 4, '5th and 6th card each bank 2');
  c.player.block = 0; const hp = c.player.hp; endTurn(c);
  assert.equal(hp - c.player.hp, 5 + 4, 'hit of 5 plus the bank of 4');
  assert.equal(c.affl.stage, 0);
  const hp2 = c.player.hp; endTurn(c); assert.equal(hp2 - c.player.hp, 5, 'bank spent');
});
t('stagefright: no bank with four or fewer cards', () => {
  const { c } = mk(); c.player.st.stagefright = 3; c.energy = 99;
  for (let i = 0; i < 4; i++) playCard(c, c.hand.indexOf(give(c, 'm_dress')));
  assert.equal(c.affl.stage || 0, 0);
});

t('dread: ending a turn with no Block costs 2 per stack (cap 5)', () => {
  const { c } = mk(); addStatus(c, c.player, 'dread', 9); assert.equal(c.player.st.dread, 5);
  c.player.block = 0; const hp = c.player.hp; endTurn(c); assert.equal(hp - c.player.hp, 10);
  c.player.block = 1; const hp2 = c.player.hp; endTurn(c); assert.equal(hp2 - c.player.hp, 0, 'any Block at all is safe');
});

t('weight of debt: next hit +2 per stack, +1 per card type skipped, spent by the hit, cap 8', () => {
  const E = def('t_debt', { hit: { name: 'Hit', fx: [{ op: 'dmg', n: 6 }] } }, { start: { weightofdebt: 2 } });
  const { c } = mk([E]);
  c.energy = 99; playCard(c, c.hand.indexOf(give(c, 'm_dress')));
  c.player.block = 0; const hp = c.player.hp;
  const e = c.enemies[0]; endTurn(c);
  // played only a skill: skipped attack + power = +2 -> 4 stacks -> +8 on the hit
  assert.equal(hp - c.player.hp, 6 + 8); assert.equal(e.st.weightofdebt, undefined, 'spent');
  addStatus(c, e, 'weightofdebt', 20); assert.equal(e.st.weightofdebt, 8);
});
t('weight of debt: a stunned or non-attacking turn keeps the stacks', () => {
  const E = def('t_debt2', { buff: { name: 'Buff', fx: [{ op: 'block', n: 3, to: 'self' }] } }, { start: { weightofdebt: 3 } });
  const { c } = mk([E]); endTurn(c); assert.ok(c.enemies[0].st.weightofdebt >= 3);
});

t('stitched up: absorbs damage past Block, depletes, refills to its peak if you play fewer than 3 cards', () => {
  const E = def('t_stitch', { idle: { name: 'Idle', fx: [{ op: 'block', n: 0, to: 'self' }] } }, { start: { stitchedup: 10 } });
  const { c } = mk([E]);
  const e = c.enemies[0]; const hp = e.hp;
  dealDamage(c, c.player, e, 6, { noMods: true });
  assert.equal(e.hp, hp, 'all absorbed'); assert.equal(e.st.stitchedup, 4);
  dealDamage(c, c.player, e, 9, { noMods: true });
  assert.equal(e.hp, hp - 5); assert.equal(e.st.stitchedup, undefined);
  endTurn(c); assert.equal(e.st.stitchedup, 10, 'played 0 cards: refilled');
  dealDamage(c, c.player, e, 10, { noMods: true });
  c.energy = 99; for (let i = 0; i < 3; i++) playCard(c, c.hand.indexOf(give(c, 'm_dress')));
  endTurn(c); assert.equal(e.st.stitchedup, undefined, '3 cards played: stays depleted');
  addStatus(c, e, 'stitchedup', 99); assert.equal(e.st.stitchedup, 10, 'cap 10');
});
t('stitched up: Block goes first, and pierce damage still gets absorbed', () => {
  const E = def('t_stitch2', { idle: { name: 'Idle', fx: [{ op: 'block', n: 0, to: 'self' }] } }, { start: { stitchedup: 5 } });
  const { c } = mk([E]); const e = c.enemies[0]; e.block = 4; const hp = e.hp;
  dealDamage(c, c.player, e, 7, { noMods: true });
  assert.equal(e.block, 0); assert.equal(e.st.stitchedup, 2); assert.equal(e.hp, hp);
});

t('guard: at most 2 distinct new debuffs per enemy move, at most 3 distinct afflictions at once', () => {
  const E = def('t_many', { all: { name: 'Everything', fx: [P('poison', 1), P('brittle', 1), P('dread', 1), P('leaden', 1)] } });
  const { c } = mk([E]); endTurn(c);
  const got = Object.keys(c.player.st).filter((k) => ['poison', 'brittle', 'dread', 'leaden'].includes(k));
  assert.equal(got.length, 2, 'only the first two of one move land');
  const { c: d } = mk();
  for (const s of ['poison', 'brittle', 'dread']) addStatus(d, d.player, s, 1);
  addStatus(d, d.player, 'leaden', 1); assert.equal(d.player.st.leaden, undefined, 'a 4th type is refused');
  assert.equal(d.player.st.brittle, 1);
  addStatus(d, d.player, 'poison', 1); assert.equal(d.player.st.poison, 2, 'existing types still stack');
});
t('guard: cleanse removes Poison and Brittle but never Infection', () => {
  const { c } = mk(); for (const s of ['poison', 'brittle', 'infection']) addStatus(c, c.player, s, 1);
  const k = give(c, 'm_cauterize'); c.energy = 3; playCard(c, c.hand.indexOf(k));
  assert.deepEqual(Object.keys(c.player.st).filter((s) => s !== '__affl'), ['infection']);
});

t('bot fight: an enemy applying every affliction in turn never throws', () => {
  const kinds = ['poison', 'brittle', 'rejection', 'infection', 'numb', 'unpicked', 'cadencelock', 'stagefright', 'dread', 'leaden'];
  const moves = {}; kinds.forEach((s, i) => { moves['m' + i] = { name: s, fx: [{ op: 'dmg', n: 12 }, P(s, 2), P(kinds[(i + 3) % kinds.length], 1)] }; });
  const E = def('t_bot', moves, { hp: 300, start: { weightofdebt: 3, stitchedup: 6 } });
  for (const seed of ['b1', 'b2', 'b3']) {
    const { c } = mk([E], seed); c.player.maxHp = c.player.hp = 400;
    let guard = 0;
    while (!c.over && c.turn < 14 && guard++ < 40) {
      for (let i = 0; i < 12 && !c.over && !c.pending; i++) {
        const hi = c.hand.findIndex((_, k) => { try { return playCard(c, k, 0).ok; } catch (e) { throw e; } });
        if (hi < 0) break;
      }
      if (c.pending) break;
      endTurn(c);
      assert.ok(Object.keys(c.player.st).filter((s) => ['poison', 'brittle', 'rejection', 'infection', 'numb', 'unpicked', 'cadencelock', 'stagefright', 'dread', 'leaden'].includes(s)).length <= 3);
      c.ev.splice(0);
    }
  }
});
console.log(n + ' afflictions checks passed');
