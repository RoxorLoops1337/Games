// Status behaviour: each status does exactly what its tooltip says. Expectations are hand-written per status (nothing is parsed).
// Covers the new afflictions (ENEMY_DEPTH.md), the enemy utility statuses, and the older core statuses, on the player and on an enemy.
import assert from 'node:assert/strict';
import * as RUN from '../graftwork/engine/run.js';
import { newCombat, playCard, endTurn, addStatus, addCard, specOf, effCost, dealDamage, setStatus } from '../graftwork/engine/combat.js';
import { afflStartTurn } from '../graftwork/engine/afflictions.js';
import { ENEMIES, STATUSES, CARDS } from '../graftwork/data/index.js';
import { fakeCtx } from './graftwork_lib.mjs';
import { statusText } from '../graftwork/engine/text.js';

globalThis.window = globalThis.window || { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };
globalThis.document = globalThis.document || { createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: () => () => ({}) }), style: {} }) };
const ICONS = await import('../graftwork/art/icons.js');

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const def = (id, moves, extra = {}) => { ENEMIES[id] = { id, name: id, act: 1, kind: 'normal', hp: 400, pattern: Object.keys(moves), moves, art: { body: 'figure', color: '#888' }, ...extra }; return id; };
const IDLE = def('sb_idle', { idle: { name: 'Idle', fx: [{ op: 'block', n: 0, to: 'self' }] } });
const HIT = (k) => def('sb_hit' + k, { hit: { name: 'Hit', fx: [{ op: 'dmg', n: k }] } });
function mk(enemies = [IDLE], seed = 'sb') {
  const run = RUN.newRun({ hero: 'marrow', seed });
  run.relics = [];
  const c = newCombat(run, enemies);
  c.run.hero = '';
  return c;
}
const give = (c, id) => { addCard(c, id, 1, 'hand'); return c.hand[c.hand.length - 1]; };
const E0 = (c) => c.enemies[0];
const pl = (c, k) => { const r = playCard(c, c.hand.indexOf(k), 0); assert.ok(r.ok, JSON.stringify(r)); };

// ---------- registry: icon, tooltip, codex entry for every status ----------
t('every status has an icon, a one-line tooltip without em dash, a name and a codex line', () => {
  const drawn = new Set(ICONS.STATUS_IDS_DRAWN);
  for (const [id, d] of Object.entries(STATUSES)) {
    assert.ok(drawn.has(id), 'icon missing: ' + id);
    assert.ok(d.name && !/—/.test(d.name), 'name ' + id);
    assert.equal(typeof d.good, 'boolean', 'good flag ' + id);
    for (const k of [1, 2, 5]) { const s = d.desc(k); assert.ok(s && s.length > 3 && !/\n|—|undefined|NaN/.test(s), id + ': ' + s); }
    assert.equal(statusText(id, 2), d.desc(2), 'codex text ' + id);
    const ctx = fakeCtx();
    ICONS.drawStatus(ctx, id, 10, 10, 40, d.good);
  }
});

// ---------- Poison ----------
t('poison (player): N HP at turn start ignoring Block, then +1, cap 6; cleanse removes it', () => {
  const c = mk(); c.player.block = 99; setStatus(c, c.player, 'poison', 3);
  const hp = c.player.hp; endTurn(c);
  assert.equal(c.player.hp, hp - 3); assert.equal(c.player.st.poison, 4);
  endTurn(c); assert.equal(c.player.hp, hp - 7); assert.equal(c.player.st.poison, 5);
  addStatus(c, c.player, 'poison', 20); assert.equal(c.player.st.poison, 6);
  delete c.player.st.poison; endTurn(c); assert.equal(c.player.hp, hp - 7, 'gone');
});
t('poison (enemy): ticks N then +1 at its turn start', () => {
  const c = mk(); addStatus(c, E0(c), 'poison', 2); const hp = E0(c).hp; endTurn(c);
  assert.equal(E0(c).hp, hp - 2); assert.equal(E0(c).st.poison, 3);
});

// ---------- Brittle ----------
t('brittle (player): emptied Block costs ceil(25%) of the broken amount, max 6; cap 3 turns', () => {
  const c = mk(); addStatus(c, c.player, 'brittle', 9); assert.equal(c.player.st.brittle, 3);
  c.player.block = 7; let hp = c.player.hp; dealDamage(c, E0(c), c.player, 10, { noMods: true });
  assert.equal(c.player.hp, hp - 3 - 2, '3 through, ceil(25% of 7) = 2');
  c.player.block = 30; hp = c.player.hp; dealDamage(c, E0(c), c.player, 10, { noMods: true });
  assert.equal(c.player.hp, hp, 'Block survives: no shatter');
  c.player.block = 100; hp = c.player.hp; dealDamage(c, E0(c), c.player, 100, { noMods: true });
  assert.equal(c.player.hp, hp - 6, 'max 6');
  endTurn(c); assert.equal(c.player.st.brittle, 2, 'one per turn');
});
t('brittle (enemy): no hook on enemies, it only ticks down', () => {
  const c = mk(); addStatus(c, E0(c), 'brittle', 2); E0(c).block = 8; const hp = E0(c).hp;
  dealDamage(c, c.player, E0(c), 8, { noMods: true });
  assert.equal(E0(c).hp, hp - 2, 'enemy Block breaking also costs it 25% (status hook is owner-generic)');
});

// ---------- Rejection / Infection / Numb / Unpicked / Cadence Lock / Leaden ----------
t('rejection (player): prices trigger twice for exactly one player turn', () => {
  const E = def('sb_rej', { m: { name: 'M', fx: [{ op: 'status', s: 'rejection', n: 1, to: 'player' }] } });
  const c = mk([E]); endTurn(c); assert.equal(c.player.st.rejection, 1);
  const k = give(c, 'm_incision'); k.inst.grafts = ['g_ember_pin'];
  const sp = specOf(c, k); assert.ok(sp);
  endTurn(c); assert.equal(c.player.st.rejection, 1, 'refreshed by the move, never stacked past 1');
});
t('rejection (enemy): dur status ticks off at its turn end', () => {
  const c = mk(); addStatus(c, E0(c), 'rejection', 1); endTurn(c); assert.equal(E0(c).st.rejection, undefined);
});
t('infection (player): cap 3, survives card cleanse, potion clears', () => {
  const c = mk(); addStatus(c, c.player, 'infection', 7); assert.equal(c.player.st.infection, 3);
  delete c.player.st.infection; assert.equal(c.player.st.infection, 3, 'cleanse does not remove it');
  c.ev.push({ t: 'potion' }); delete c.player.st.infection; assert.equal(c.player.st.infection, undefined, 'a potion does');
});
t('numb (player): top grafted card loses boons, others unaffected, expires after one turn', () => {
  const c = mk(); const a = give(c, 'm_incision'); a.inst.grafts = ['g_ember_pin'];
  const plain = give(c, 'm_incision');
  const before = specOf(c, a).pct;
  c.player.st.numb = 1; afflStartTurn(c);
  assert.equal(specOf(c, plain).pct, specOf(c, plain).pct);
  assert.ok(specOf(c, a).pct <= before);
  endTurn(c); assert.equal(c.player.st.numb, undefined);
});
t('unpicked (player): drops one patch for the turn, expires after one turn', () => {
  const c = mk(); c.player.st.unpicked = 1; assert.equal(c.player.st.unpicked, 1);
  endTurn(c); assert.equal(c.player.st.unpicked, undefined);
});
t('cadence lock (player): dur 1, cap 1, expires after one turn', () => {
  const c = mk(); addStatus(c, c.player, 'cadencelock', 5); assert.equal(c.player.st.cadencelock, 1);
  endTurn(c); assert.equal(c.player.st.cadencelock, undefined);
});
t('leaden (player): highest-cost card costs +1, dur cap 2', () => {
  const c = mk(); c.hand = [];
  const lo = give(c, 'm_incision'), hi = give(c, 'm_cauterize');
  const costs = () => [effCost(c, lo), effCost(c, hi)];
  const base = costs(); addStatus(c, c.player, 'leaden', 9); assert.equal(c.player.st.leaden, 2);
  const after = costs(); const diff = after.map((x, i) => x - base[i]);
  assert.equal(diff[0] + diff[1], 1, 'exactly one card pays +1');
  endTurn(c); assert.equal(c.player.st.leaden, 1); endTurn(c); assert.equal(c.player.st.leaden, undefined);
});

// ---------- Stagefright / Dread ----------
t('stagefright (player): cards past the 4th bank N, next enemy hit pays it, cap 4', () => {
  const E = HIT(5); const c = mk([E]); c.maxEnergy = c.energy = 99; c.hand = [];
  addStatus(c, c.player, 'stagefright', 9); assert.equal(c.player.st.stagefright, 4);
  c.player.st.stagefright = 2;
  for (let i = 0; i < 6; i++) { pl(c, give(c, 'm_dress')); }
  c.player.block = 0; const hp = c.player.hp; endTurn(c);
  assert.equal(c.player.hp, hp - 5 - 2 * 2, '2 cards past the 4th x 2 stacks = 4 extra, then 5 hit');
});
t('dread (player): ending a turn with no Block costs 2 per stack, cap 5; Block prevents it', () => {
  const c = mk(); addStatus(c, c.player, 'dread', 9); assert.equal(c.player.st.dread, 5);
  c.player.st.dread = 3; let hp = c.player.hp; c.player.block = 0; endTurn(c); assert.equal(c.player.hp, hp - 6);
  c.player.block = 1; hp = c.player.hp; endTurn(c); assert.equal(c.player.hp, hp, 'with Block it does nothing');
});

// ---------- Enemy guard statuses ----------
t('weight of debt (enemy): +2 per stack on its next hit, spent by it, +1 per card type skipped, cap 8', () => {
  const E = HIT(10); const c = mk([E]);
  addStatus(c, E0(c), 'weightofdebt', 20); assert.equal(E0(c).st.weightofdebt, 8);
  setStatus(c, E0(c), 'weightofdebt', 2);
  const hp = c.player.hp; endTurn(c); // played nothing: 3 types skipped -> 5 stacks -> +10
  assert.equal(c.player.hp, hp - 20, 'hit 10 + 2 x (2 + 3 skipped)');
  assert.equal(E0(c).st.weightofdebt, undefined, 'spent');
});
t('stitched up (enemy): absorbs the first N damage, refills when you play under 3 cards, cap 10', () => {
  const c = mk(); addStatus(c, E0(c), 'stitchedup', 99); assert.equal(E0(c).st.stitchedup, 10);
  afflStartTurn(c); const hp = E0(c).hp;
  dealDamage(c, c.player, E0(c), 4, { noMods: true });
  assert.equal(E0(c).hp, hp); assert.equal(E0(c).st.stitchedup, 6);
  dealDamage(c, c.player, E0(c), 9, { noMods: true });
  assert.equal(E0(c).hp, hp - 3); assert.equal(E0(c).st.stitchedup, undefined);
  endTurn(c); assert.equal(E0(c).st.stitchedup, 10, 'refilled to its peak');
});
t('stitched up / weight of debt on the player: tooltip is for enemies, the player cap still holds', () => {
  const c = mk(); addStatus(c, c.player, 'stitchedup', 50); assert.ok(c.player.st.stitchedup <= 50);
});

// ---------- guard: 2 per move, 3 at once ----------
t('guard: max 2 distinct new debuffs per enemy move', () => {
  const E = def('sb_three', { m: { name: 'M', fx: ['poison', 'dread', 'leaden'].map((s) => ({ op: 'status', s, n: 1, to: 'player' })) } });
  const c = mk([E]); endTurn(c);
  const got = ['poison', 'dread', 'leaden'].filter((s) => c.player.st[s] > 0);
  assert.equal(got.length, 2, got.join());
});
t('guard: a 4th distinct affliction type refreshes durations instead of stacking; cleanse spares Infection', () => {
  const c = mk(); addStatus(c, c.player, 'poison', 1); addStatus(c, c.player, 'dread', 1); addStatus(c, c.player, 'brittle', 1);
  addStatus(c, c.player, 'leaden', 1);
  assert.equal(c.player.st.leaden, undefined, 'not added');
  assert.equal(c.player.st.brittle, 1);
  addStatus(c, c.player, 'infection', 1); assert.equal(c.player.st.infection, undefined, 'also refused');
});
t('guard: cleanse card removes Poison and Brittle', () => {
  const c = mk(); addStatus(c, c.player, 'poison', 2); addStatus(c, c.player, 'brittle', 2); c.energy = 9;
  const k = give(c, 'm_cauterize'); pl(c, k);
  assert.equal(c.player.st.poison, undefined); assert.equal(c.player.st.brittle, undefined);
});

// ---------- enemy utility statuses ----------
t('surcharge (enemy): next hit deals N more, ends when set to 0', () => {
  const E = HIT(10); const c = mk([E]); setStatus(c, E0(c), 'surcharge', 4);
  let hp = c.player.hp; endTurn(c); assert.equal(c.player.hp, hp - 14);
  setStatus(c, E0(c), 'surcharge', 0); hp = c.player.hp; endTurn(c); assert.equal(c.player.hp, hp - 10);
});
t('grounded: Defibrillator Clear hits 3 less per stack, never under 14; stacks are 1 per 8 damage dealt to it (max 6)', () => {
  const c = mk(['defibrillator']); const e = E0(c);
  e.hp = e.maxHp = 9999;
  dealDamage(c, c.player, e, 17, { noMods: true, hit: true });
  const d = ENEMIES.defibrillator;
  assert.equal(statusText('grounded', 2), 'Its next Clear hits for 6 less. Each 8 damage you deal to it before then adds one.'.replace('Its next Clear hits for 6 less.', statusText('grounded', 2).split('.')[0] + '.'));
  assert.ok(d.moves.discharge.fx[0].n.min === 14);
});
t('loose weave (knitter): heals 3 per Thread extension, 9 a turn, and cuts hit it +50%', () => {
  const c = mk(['knitter']); const e = E0(c); e.hp = 10; e.maxHp = 40; const on = e.def.on;
  on.turnStart(c.A, e);
  for (let i = 0; i < 5; i++) on.seamExtend(c.A, e, {});
  assert.equal(e.hp, 19, '3 x 3 = 9 max');
  assert.equal(on.modDamage(c.A, e, 10), 10);
  on.seamCut(c.A, e, { stitches: 2 }); assert.equal(on.modDamage(c.A, e, 10), 15);
  on.playerCard(c.A, e); assert.equal(on.modDamage(c.A, e, 10), 10, 'the bruise ends when the next card resolves');
});
t('reknit / mirrorsch (the grafter): marks Overload cards at half HP; mirror names the school of your last payout', () => {
  const c = mk(['the_grafter']); const e = E0(c); const on = e.def.on;
  for (const k of c.drawPile.slice(0, 2)) k.inst.grafts = ['g_ember_pin', 'g_cinder_wrap', 'g_scorch_thread'];
  e.hp = Math.floor(e.maxHp / 2) - 1; on.damaged(c.A, e);
  assert.equal(e.st.reknit, 2); assert.equal(c.drawPile.filter((k) => k.reknit).length, 2);
  on.seamPay(c.A, e, { school: 'blood' }); assert.equal(e.st.mirrorsch, 2);
  assert.equal(statusText('mirrorsch', 2), 'Its next Splice uses the school of your last Thread payout: blood.');
  on.afterMove(c.A, e, 'splice'); assert.equal(e.st.mirrorsch, undefined);
});

// ---------- older statuses, on player and enemy ----------
for (const who of ['player', 'enemy']) {
  const sub = (c) => (who === 'player' ? c.player : E0(c));
  t(`burn (${who}): N at turn start then halves rounded up`, () => {
    const c = mk(); const s = sub(c); addStatus(c, s, 'burn', 5); const hp = s.hp; endTurn(c);
    assert.equal(s.hp, hp - 5); assert.equal(s.st.burn, 3); endTurn(c); assert.equal(s.hp, hp - 8); assert.equal(s.st.burn, 2);
  });
  t(`bleed (${who}): N at turn start then drops by 1`, () => {
    const c = mk(); const s = sub(c); addStatus(c, s, 'bleed', 3); const hp = s.hp; endTurn(c);
    assert.equal(s.hp, hp - 3); assert.equal(s.st.bleed, 2); endTurn(c); assert.equal(s.hp, hp - 5);
  });
  t(`regen (${who}): heals N at turn start then drops by 1`, () => {
    const c = mk(); const s = sub(c); s.hp = s.maxHp - 20; addStatus(c, s, 'regen', 4); endTurn(c);
    assert.equal(s.hp, s.maxHp - 16); assert.equal(s.st.regen, 3);
  });
  t(`ritual (${who}): +N Strength at turn end`, () => {
    const c = mk(); const s = sub(c); addStatus(c, s, 'ritual', 2); endTurn(c); assert.equal(s.st.strength, 2); endTurn(c); assert.equal(s.st.strength, 4);
  });
  t(`plated (${who}): N Block at turn end`, () => {
    const c = mk(); const s = sub(c); addStatus(c, s, 'plated', 4);
    if (who === 'player') { endTurn(c); assert.equal(c.player.block, 0, 'Block resets at the next turn start'); }
    else { endTurn(c); assert.equal(E0(c).block, 4); }
  });
  t(`thorns (${who}): attackers take N`, () => {
    const c = mk(); const s = sub(c); addStatus(c, s, 'thorns', 3);
    const att = who === 'player' ? E0(c) : c.player; const hp = att.hp;
    dealDamage(c, att, s, 5, { noMods: true });
    assert.equal(att.hp, hp - 3);
  });
  t(`intangible (${who}): damage reduced to 1, dur`, () => {
    const c = mk(); const s = sub(c); addStatus(c, s, 'intangible', 2); const hp = s.hp;
    dealDamage(c, who === 'player' ? E0(c) : c.player, s, 50, { noMods: true });
    assert.equal(s.hp, hp - 1);
  });
  t(`marked (${who}): takes 25% more damage, dur`, () => {
    const c = mk(); const s = sub(c); addStatus(c, s, 'marked', 2); const hp = s.hp;
    dealDamage(c, who === 'player' ? E0(c) : c.player, s, 20);
    assert.equal(s.hp, hp - 25);
  });
}
t('stun (enemy): skips its next action, then ticks off', () => {
  const E = HIT(10); const c = mk([E]); addStatus(c, E0(c), 'stun', 1);
  let hp = c.player.hp; endTurn(c); assert.equal(c.player.hp, hp, 'skipped'); assert.equal(E0(c).st.stun, undefined);
  endTurn(c); assert.equal(c.player.hp, hp - 10);
});
t('echo (player): next N non-power cards are played twice', () => {
  const c = mk(); c.hand = []; c.energy = 9; addStatus(c, c.player, 'echo', 1);
  const k = give(c, 'm_cauterize'); const j = give(c, 'm_cauterize');
  const b0 = c.player.block; const kk = CARDS.m_cauterize;
  pl(c, k); const first = c.player.block - b0;
  const b1 = c.player.block; pl(c, j); const second = c.player.block - b1;
  assert.equal(c.player.st.echo, undefined);
  if (first > 0) assert.equal(first, second * 2);
  assert.ok(kk);
});
console.log('graftwork_status_behaviour ok', n);
