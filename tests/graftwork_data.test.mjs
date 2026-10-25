// GRAFTWORK data gate. Every content author runs this: `node tests/graftwork_data.test.mjs`
// Checks schema, references, text generation, and that every enemy/graft/relic survives a headless fight.
import assert from 'node:assert/strict';
import { CARDS, GRAFTS, ENEMIES, RELICS, POTIONS, STATUSES, HEROES, EVENTS, SCHOOLS } from '../graftwork/data/index.js';
import { cardSpec, newInst, canGraft, MAX_GRAFTS } from '../graftwork/engine/cards.js';
import { cardLines, priceLines } from '../graftwork/engine/text.js';
import { makeRng } from '../graftwork/engine/rng.js';
import { newCombat, playCard, endTurn, intentOf, canPlay, resolvePending, usePotion, finishCombat, needsTarget } from '../graftwork/engine/combat.js';

let n = 0;
const t = (name, fn) => { try { fn(); n++; console.log('ok', name); } catch (e) { console.error('FAIL', name, '\n', e.message); process.exitCode = 1; } };
const OPS = new Set(['dmg', 'block', 'status', 'setStatus', 'double', 'detonate', 'cleanse', 'draw', 'energy', 'heal', 'hp', 'maxhp', 'gold', 'addCard', 'summon', 'discard', 'exhaustHand', 'fetch', 'if', 'repeat', 'custom']);
const MODS = new Set(['cost', 'flag', 'unflag', 'repeat', 'addFx', 'pct', 'aoe', 'lifesteal', 'target', 'type', 'selfHurt', 'jam', 'junk', 'selfStatus', 'drawdown', 'goldCost', 'maxHp', 'custom']);
const TYPES = new Set(['attack', 'skill', 'power', 'junk']);
const ok = (c, m) => assert.ok(c, m);

function walk(ops, where, f) {
  ok(Array.isArray(ops), where + ' fx must be an array');
  for (const o of ops) {
    ok(OPS.has(o.op), `${where}: unknown op ${o.op}`);
    if (o.s) ok(STATUSES[o.s], `${where}: unknown status ${o.s}`);
    if (o.card) ok(CARDS[o.card], `${where}: unknown card ${o.card}`);
    if (o.op === 'custom') ok(typeof o.fn === 'function' && o.text, `${where}: custom op needs fn and text`);
    if (o.op === 'summon') ok(ENEMIES[o.id], `${where}: unknown summon ${o.id}`);
    if (o.op === 'if') { walk(o.then || [], where + '.then'); if (o.else) walk(o.else, where + '.else'); ok(o.ifText, where + ': if needs ifText'); }
    if (o.op === 'repeat') walk(o.fx, where + '.repeat');
    if (f) f(o);
  }
}
const noDash = (s, where) => ok(!/—/.test(String(s || '')), `${where}: em dash in text`);

t('statuses are well formed', () => {
  for (const s of Object.values(STATUSES)) { ok(s.name && typeof s.desc === 'function' && ['int', 'dur'].includes(s.stack), s.id); ok(s.desc(2).length > 3, s.id); noDash(s.desc(2), s.id); }
});
t('cards are well formed', () => {
  for (const c of Object.values(CARDS)) {
    ok(c.name && TYPES.has(c.type), c.id + ' name/type');
    ok(c.cost === 'X' || (Number.isInteger(c.cost) && c.cost >= 0 && c.cost <= 3), c.id + ' cost');
    ok(['starter', 'common', 'uncommon', 'rare', 'junk'].includes(c.rarity), c.id + ' rarity');
    ok(c.hero === 'any' || HEROES[c.hero], c.id + ' hero');
    ok(!c.school || SCHOOLS[c.school], c.id + ' school');
    walk(c.fx || [], c.id);
    if (c.type !== 'junk') { ok(c.up && c.up.fx, c.id + ' needs up.fx'); walk(c.up.fx, c.id + '.up'); ok(c.flavor, c.id + ' needs flavor'); }
    const spec = cardSpec(newInst(c.id, () => 1));
    const lines = cardLines(spec); noDash(lines.join(' ') + c.flavor + c.name, c.id);
    if (c.type === 'attack') ok(spec.fx.some((o) => ['dmg', 'status', 'detonate', 'custom'].includes(o.op)), c.id + ' attack does nothing');
    if (c.type !== 'junk' && !c.text && !(c.fx || []).length) ok(false, c.id + ' empty');
  }
});
t('hero decks are 15 real cards', () => {
  for (const h of Object.values(HEROES)) {
    ok(h.deck.length === 15, h.id + ' deck size ' + h.deck.length);
    for (const id of h.deck) { ok(CARDS[id], h.id + ' missing ' + id); ok(CARDS[id].hero === h.id, id + ' hero'); }
    const pool = Object.values(CARDS).filter((c) => c.hero === h.id && c.rarity !== 'starter');
    ok(pool.length >= 20, `${h.id} needs >=20 non-starter cards (has ${pool.length})`);
    ok(SCHOOLS[h.school] || h.school === 'gilded', h.id + ' school');
  }
});
t('grafts are well formed and apply to a card', () => {
  const all = Object.values(GRAFTS);
  ok(all.length >= 1, 'no grafts');
  for (const g of all) {
    ok(g.name && g.boon && g.price, g.id + ' needs name/boon/price');
    noDash(g.boon + g.price + g.name, g.id);
    ok(SCHOOLS[g.school], g.id + ' school');
    ok([1, 2, 3].includes(g.weight), g.id + ' weight');
    ok(['safe', 'greedy', 'weird'].includes(g.tier), g.id + ' tier');
    ok(['common', 'uncommon', 'rare'].includes(g.rarity), g.id + ' rarity');
    ok(g.mods && g.mods.length >= 2, g.id + ' needs a boon mod AND a price mod');
    for (const m of g.mods) { ok(MODS.has(m.k), g.id + ' bad mod ' + m.k); if (m.fx) walk(m.fx, g.id); if (m.card) ok(CARDS[m.card] && CARDS[m.card].type === 'junk', g.id + ' junk card'); if (m.s) ok(STATUSES[m.s], g.id + ' status'); }
    // must be graftable on at least one real card
    const cand = Object.values(CARDS).filter((c) => c.type !== 'junk').map((c) => newInst(c.id, () => 1)).filter((i) => canGraft(i, g.id));
    ok(cand.length >= 3, `${g.id} fits only ${cand.length} cards`);
    const spec = cardSpec({ ...cand[0], grafts: [g.id] });
    ok(cardLines(spec).length, g.id + ' text');
  }
});
t('graft pairs and triples never throw', () => {
  const ids = Object.keys(GRAFTS); const rng = makeRng(3);
  for (let i = 0; i < 300 && ids.length > 2; i++) {
    const base = rng.pick(Object.values(CARDS).filter((c) => c.type !== 'junk'));
    const inst = newInst(base.id, () => 1);
    for (let k = 0; k < MAX_GRAFTS; k++) { const g = rng.pick(ids); if (canGraft(inst, g)) inst.grafts.push(g); }
    cardSpec(inst); cardLines(cardSpec(inst)); priceLines(cardSpec(inst));
  }
});
t('relics and potions are well formed', () => {
  for (const r of Object.values(RELICS)) { ok(r.name && r.text && ['common', 'uncommon', 'rare', 'boss', 'shop', 'start'].includes(r.rarity), r.id); noDash(r.text + r.name, r.id); }
  for (const p of Object.values(POTIONS)) { ok(p.name && p.text && p.fx, p.id); walk(p.fx, p.id); noDash(p.text, p.id); }
});
t('enemies are well formed', () => {
  for (const e of Object.values(ENEMIES)) {
    ok(e.name && [1, 2, 3].includes(e.act) && ['normal', 'elite', 'boss'].includes(e.kind), e.id + ' header');
    ok(e.hp, e.id + ' hp'); ok(e.moves && Object.keys(e.moves).length, e.id + ' moves');
    ok(e.pattern || e.pick, e.id + ' needs pattern or pick');
    for (const id of [...(e.pattern || []), ...(e.opening || [])]) ok(e.moves[id], `${e.id}: pattern move ${id}`);
    for (const [id, mv] of Object.entries(e.moves)) { walk(mv.fx || [], `${e.id}.${id}`); if (mv.name) noDash(mv.name, e.id); }
    ok(e.art && e.art.body, e.id + ' needs art.body');
    for (const s of Object.keys(e.start || {})) ok(STATUSES[s], e.id + ' start status ' + s);
  }
});
t('events are well formed', () => {
  for (const ev of Object.values(EVENTS)) { ok(ev.name && ev.text && ev.choices && ev.choices.length >= 2, ev.id); noDash(ev.text, ev.id); for (const ch of ev.choices) { ok(ch.label && typeof ch.apply === 'function', ev.id + ' choice'); noDash(ch.label + (ch.text || ''), ev.id); } }
});

// ---- headless fights: a simple bot plays every enemy, every card, and every graft ----
let uidc = 1000;
function mkRun(hero, seed, extra = {}) {
  const rng = makeRng(seed);
  const h = HEROES[hero];
  return { rng, hero, hp: (h.perks && h.perks.hp) || 70, maxHp: (h.perks && h.perks.hp) || 70, gold: 99, relics: [], potions: [], deck: h.deck.map((id) => newInst(id, () => uidc++)), budgetBonus: 0, ascension: 0, ...extra };
}
function botFight(run, enemyIds, maxTurns = 30) {
  const c = newCombat(run, enemyIds);
  let guard = 0;
  while (!c.over && c.turn <= maxTurns && guard++ < 4000) {
    let played = true, inner = 0;
    while (played && !c.over && inner++ < 40) {
      played = false;
      if (c.pending) { const p = c.pending; const pool = p.kind === 'fetch' ? (p.zone === 'exhaust' ? c.exhaust : c.discard) : c.hand; resolvePending(c, pool.slice(0, p.n).map((k) => k.uid)); played = true; continue; }
      const order = c.hand.map((k, i) => i).filter((i) => canPlay(c, i).ok);
      if (!order.length) break;
      const i = order[0];
      const ti = c.enemies.findIndex((e) => !e.dead);
      playCard(c, i, ti); played = true;
      c.ev.length = 0;
    }
    if (c.over) break;
    endTurn(c); c.ev.length = 0;
  }
  return c;
}
for (const hero of Object.keys(HEROES)) {
  t(`${hero}: starter deck survives every enemy without errors`, () => {
    for (const e of Object.values(ENEMIES)) {
      const c = botFight(mkRun(hero, 11), [e.id], 40);
      ok(c.over || c.turn > 0, e.id);
      for (const en of c.enemies) { const i = intentOf(c, en); ok(i && i.kinds.length, e.id + ' intent'); }
    }
  });
}
t('every graft survives a fight on the starter deck', () => {
  for (const g of Object.values(GRAFTS)) {
    const run = mkRun('marrow', 5);
    for (const inst of run.deck) if (canGraft(inst, g.id)) { inst.grafts.push(g.id); break; }
    const first = Object.values(ENEMIES).find((e) => e.act === 1 && e.kind === 'normal') || Object.values(ENEMIES)[0];
    botFight(run, [first.id], 12);
  }
});
t('every relic and potion survives a fight', () => {
  for (const r of Object.values(RELICS)) { const run = mkRun('wick', 9, { relics: [r.id] }); botFight(run, [Object.values(ENEMIES)[0].id], 8); }
  for (const p of Object.values(POTIONS)) {
    const run = mkRun('odile', 9, { potions: [p.id] }); const c = newCombat(run, [Object.values(ENEMIES)[0].id]);
    usePotion(c, 0, 0); if (c.pending) resolvePending(c, c.hand.slice(0, c.pending.n).map((k) => k.uid));
  }
});
console.log(`${n} checks done`);
