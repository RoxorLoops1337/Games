// Hanae's card set (hocus_vocus/js/data_cards_hanae.js): quotas, rules, budget bands, and (when the engine exists) real plays.
//
// Layers of checking, cheapest first:
//   1. DATA.validate('cards', {hero:'hanae'}) has no errors and no warnings, and DATA.audit has no lines.
//   2. CONTENT_SPEC section 3 rules restated as assertions: counts and mix, X cost, row conds, ally cards, picks, keywords,
//      slot rules per rarity and per colour (red only with damage, blue only with Block/heal/hero status, gold on every power),
//      art pairs, hero pose share, flavor, locks, names (1 to 3 words, unique, no dashes), upgrades that really change something.
//   3. A LIGHT BUDGET CHECK. `evalCard` is a tiny expected-value interpreter for the effect DSL: it walks a card's ops in order
//      against a reference state, prices what the card produces in "points" (1 point = 1 damage or 1 Block) and subtracts the
//      resources it spends (Bloom, Block). It is a rough ruler, not the engine: it exists so a card cannot sneak far outside the
//      power guidance of CONTENT_SPEC section 3. Exchange rates (the PT table) and the reference state (REF) are documented below.
//      A card is scored in the front row (weight 0.7, Hanae's home) and the back row (weight 0.3), then compared with a band:
//        cost 0        net points in [2, 7.5]         (exhaust cards [2, 11], because they are one shot)
//        cost 1        net points in [4.5, 10.5]
//        cost 2, 3, X  net points per Energy in [4.5, 9.5]   (X is priced at X = 2)
//        power         net points per Energy in [3, 15] over a 4 turn horizon (powers pay back over a whole fight, so the top is generous)
//      Upgrades get +30 percent headroom on the top of the band and must never lower the surplus (net minus 7 points per Energy).
//      The numbers are deliberately loose: the Wave 3 bot does the real balancing. The bands only catch typos and outliers.
//   4. When hocus_vocus/js/data_text.js exists: every card, base and upgraded, produces non-empty rules text through
//      DATA.cardPlain with no undefined, NaN or [object] in it, and stays under 110 characters.
//   5. When combat.js exists too: every card plays in a synthetic fight in both rows without throwing, and a handful of
//      scenarios check the rules the cards lean on (Bloom spending, first card of the turn, temporary Might, onDamaged and
//      onSwap hooks). Set RB_STRICT=1 to make a missing or broken engine a failure instead of a skip.
// Set RB_TABLE=1 to print the budget table.
import fs from 'node:fs';
import path from 'node:path';
import { boot, harness, DIR } from './hocus_vocus_lib.mjs';

const t = harness('hocus_vocus cards hanae');
const STRICT = !!process.env.RB_STRICT;
const has = (file) => fs.existsSync(path.join(DIR, 'js', file));

// ---------------------------------------------------------------------------------------------- load
// data_text.js belongs to a teammate: use it when it loads, fall back to structure-only checks when it does not (RB_STRICT=1 refuses the fallback)
let g = null, textErr = null;
if (has('data_text.js')) { try { g = boot({ only: ['data_text', 'data_cards_hanae'] }); } catch (e) { textErr = e; } }
if (!g) g = boot({ only: ['data_cards_hanae'] });
if (textErr) console.log('  note: data_text.js did not load (' + (textErr.message || textErr) + '), text checks skipped');
const { DATA, U } = g;
t.ok(!g._errors || g._errors.length === 0, 'the card file loads without errors: ' + JSON.stringify(g._errors));
const L = DATA.LISTS;
const cards = Object.values(DATA.cards).filter((c) => c.hero === 'hanae');
const byId = (id) => DATA.cards[id];
const nonToken = cards.filter((c) => c.rarity !== 'token');
const ids = (f) => nonToken.filter(f).map((c) => c.id);
const flat = (fx) => { const out = []; DATA.walkOps(fx, (o) => out.push(o)); return out; };
const allOps = (c) => flat(c.fx);
const resolveDef = (c, up) => {
  if (!up) return { cost: c.cost, fx: c.fx, kw: c.kw || [] };
  const u = c.up || {};
  return { cost: u.cost !== undefined ? u.cost : c.cost, fx: u.fx || c.fx, kw: u.kw || c.kw || [] };
};
const words = (s) => s.trim().split(/\s+/).length;
const inst = (id, up) => ({ uid: U.uid(), id, up: up ? 1 : 0, gems: (byId(id).slots || []).map(() => null) });

// ---------------------------------------------------------------------------------------------- validator and audit
t.test('DATA.validate is clean for hanae: no errors, no warnings', () => {
  const v = DATA.validate('cards', { hero: 'hanae' });
  t.eq(v.errors.length, 0, 'validate errors: ' + v.errors.join(' | '));
  t.eq(v.warnings.length, 0, 'validate warnings: ' + v.warnings.join(' | '));
  t.eq(v.counts.cards, cards.length, 'only hanae cards are registered by this file');
});
t.test('DATA.audit has no lines for hanae', () => {
  const a = DATA.audit('cards', { hero: 'hanae' });
  t.eq(a.length, 0, 'audit lines: ' + a.join(' | '));
});

// ---------------------------------------------------------------------------------------------- counts and mix
t.test('counts: 3 starters, 14 commons, 12 uncommons, 8 rares, no tokens', () => {
  const n = (r) => nonToken.filter((c) => c.rarity === r).length;
  t.eq(n('starter'), 3, 'starters'); t.eq(n('common'), 14, 'commons'); t.eq(n('uncommon'), 12, 'uncommons'); t.eq(n('rare'), 8, 'rares');
  t.eq(cards.length, 37, 'total');
  t.eq(cards.filter((c) => c.rarity === 'token').length, 0, 'no card here adds a token, so none is defined');
  t.ok(!allTokenAdds(), 'no card uses the add op');
});
function allTokenAdds() { return cards.some((c) => allOps(c).concat(flat(c.up && c.up.fx)).some((o) => o.op === 'add')); }
t.test('starters match DATA.heroes.hanae.starter and the fixed ids', () => {
  const st = DATA.heroes.hanae.starter;
  t.deep([...new Set(st)].sort(), ['hanae_parry', 'hanae_petal_step', 'hanae_slash'], 'starter ids');
  st.forEach((id) => t.ok(byId(id) && byId(id).rarity === 'starter', id + ' is a starter'));
  t.deep(ids((c) => c.rarity === 'starter').sort(), ['hanae_parry', 'hanae_petal_step', 'hanae_slash'], 'only those are starters');
  t.eq(byId('hanae_slash').type, 'attack', 'slash is the strike'); t.eq(byId('hanae_parry').type, 'skill', 'parry is the defence');
});
t.test('mix: 30 percent attacks, 30 percent skills, 4 or more powers, an X card', () => {
  const n = (ty) => nonToken.filter((c) => c.type === ty).length;
  t.ok(n('attack') >= nonToken.length * 0.3, 'attacks ' + n('attack'));
  t.ok(n('skill') >= nonToken.length * 0.3, 'skills ' + n('skill'));
  t.ok(n('power') >= 4, 'powers ' + n('power'));
  t.ok(n('attack') + n('skill') + n('power') === 37, 'only attack, skill and power types');
  nonToken.filter((c) => c.type === 'power').forEach((c) => t.ok(c.rarity === 'uncommon' || c.rarity === 'rare', c.id + ': powers are uncommon or rare'));
  t.ok(nonToken.some((c) => c.cost === 'X'), 'an X cost card');
  t.ok(nonToken.filter((c) => c.cost === 'X').length >= 2, 'two X cards: a common and a rare bomb');
});
t.test('mechanic quotas: row conds, ally cards, picks, keywords', () => {
  const rowCond = ids((c) => allOps(c).some((o) => o.op === 'cond' && o.if && o.if.row));
  t.ok(rowCond.length >= 3, 'cards with cond on row: ' + rowCond.join(','));
  const ally = ids((c) => allOps(c).some((o) => o.tgt === 'ally' || o.tgt === 'both' || (o.n && typeof o.n === 'object' && o.n.who === 'ally')));
  t.ok(ally.length >= 4, 'cards touching the ally: ' + ally.join(','));
  const picks = ids((c) => allOps(c).some((o) => o.op === 'pick'));
  t.ok(picks.length >= 2, 'pick cards: ' + picks.join(','));
  const kw = ids((c) => (c.kw || []).length > 0);
  t.ok(kw.length >= 5, 'cards with keywords: ' + kw.join(','));
  t.ok(rowCond.length >= 4 && ally.length >= 5 && kw.length >= 6, 'a little margin over the quotas (' + rowCond.length + ' row conds, ' + ally.length + ' ally cards, ' + kw.length + ' keyword cards)');
});
t.test('every archetype has an engine and a finisher (the design promise)', () => {
  const has1 = (id) => t.ok(!!byId(id), id + ' exists');
  // Bloom burst: builders and sinks
  ['hanae_petal_step', 'hanae_petal_flick', 'hanae_spring_vow', 'hanae_folding_screen'].forEach(has1);
  ['hanae_blossom_burst', 'hanae_full_bloom', 'hanae_bloom_tide', 'hanae_thousand_petals', 'hanae_sakura_blizzard'].forEach((id) => {
    has1(id); t.ok(allOps(byId(id)).some((o) => o.consume === 'bloom' || (o.consume && o.consume.s === 'bloom') || o.op === 'removeStatus' && o.s === 'bloom'), id + ' spends Bloom');
  });
  // Flurry: hit count scaling, Might, Mark
  ['hanae_rising_gale', 'hanae_whirling_petals', 'hanae_cyclone_cut', 'hanae_hundred_cuts'].forEach((id) => t.ok(allOps(byId(id)).some((o) => o.op === 'dmg' && o.hits !== undefined), id + ' is a multi-hit card'));
  t.ok(allOps(byId('hanae_flurry_stance')).concat(allOps(byId('hanae_keen_edge')), allOps(byId('hanae_blade_dance'))).some((o) => o.s === 'might' || o.s === 'ritual'), 'Might sources exist');
  t.ok(allOps(byId('hanae_petal_mark')).some((o) => o.s === 'mark'), 'Mark exists');
  // Riposte: Block and Dodge into damage, damage when hit
  t.ok(allOps(byId('hanae_riposte')).some((o) => o.op === 'dmg' && o.n && o.n.per === 'block'), 'Riposte turns Block into damage');
  t.ok(allOps(byId('hanae_flowing_counter')).some((o) => o.op === 'dmg' && o.n && o.n.s === 'dodge'), 'Flowing Counter turns Dodge into damage');
  t.ok(allOps(byId('hanae_bending_willow')).some((o) => o.op === 'hook' && o.on === 'onDamaged'), 'Bending Willow fires when hit');
  t.ok(allOps(byId('hanae_mirror_edge')).some((o) => o.op === 'dmg' && o.consume === 'block'), 'Mirror Edge cashes in Block');
  t.ok(allOps(byId('hanae_waltz_of_steps')).some((o) => o.op === 'hook' && o.on === 'onSwap'), 'a swap payoff exists');
  t.ok(nonToken.filter((c) => allOps(c).some((o) => o.op === 'swap')).length >= 3, 'at least 3 cards move between rows');
  t.ok(nonToken.some((c) => allOps(c).some((o) => o.op === 'cond' && o.if && o.if.cardsPlayed)), 'a first-card-of-the-turn card (Iai Draw) exists');
});

// ---------------------------------------------------------------------------------------------- names, text, art, flavor, locks
t.test('names: 1 to 3 words (one named exception), unique, no dashes, no digits', () => {
  const names = nonToken.map((c) => c.name);
  t.eq(new Set(names).size, names.length, 'duplicate names inside the file');
  t.eq(new Set(names.map((n) => n.toLowerCase())).size, names.length, 'names differ ignoring case');
  // The one named exception to the 1 to 3 words rule: hanae_blade_duet is the owners' song title "Calling of the Moon" (4 words,
  // binding in bible 2.9 and HV_HEROES 4.3). Every other name in this file keeps the rule.
  const FOUR_WORD = { hanae_blade_duet: 'Calling of the Moon' };
  t.deep(Object.keys(FOUR_WORD).filter((id) => byId(id).name !== FOUR_WORD[id]), [], 'the named exception carries the owners\' exact title');
  nonToken.forEach((c) => { const n = c.name; const max = FOUR_WORD[c.id] ? 4 : 3; t.ok(words(n) >= 1 && words(n) <= max, n + ' has 1 to ' + max + ' words'); t.ok(/^[A-Z][A-Za-z' ]+$/.test(n), n + ' is plain words'); });
  t.deep(nonToken.filter((c) => words(c.name) > 3).map((c) => c.id), ['hanae_blade_duet'], 'only the named exception goes over 3 words');
  nonToken.forEach((c) => t.ok(/^hanae_[a-z][a-z0-9_]*$/.test(c.id), c.id + ' is snake_case with the hero prefix'));
  const EM = String.fromCharCode(0x2014), EN = String.fromCharCode(0x2013);
  t.ok(!JSON.stringify(cards).includes(EM) && !JSON.stringify(cards).includes(EN), 'no em or en dashes in the data');
  t.ok(!nonToken.some((c) => c.text !== undefined), 'no hand typed text field (text is generated)');
});
t.test('art: every card has m and c, pairs are unique, hero poses on about half of the attacks', () => {
  nonToken.forEach((c) => { t.ok(L.motifs.includes(c.art.m), c.id + ' motif ' + c.art.m); t.ok(L.palettes.includes(c.art.c), c.id + ' palette ' + c.art.c); });
  const pairs = nonToken.map((c) => c.art.m + '/' + c.art.c);
  t.eq(new Set(pairs).size, pairs.length, 'duplicate art.m plus art.c pair');
  const atk = nonToken.filter((c) => c.type === 'attack'); const heroAtk = atk.filter((c) => c.art.hero);
  t.ok(heroAtk.length >= atk.length * 0.35 && heroAtk.length <= atk.length * 0.65, `hero pose on ${heroAtk.length} of ${atk.length} attacks (about half)`);
  t.ok(new Set(nonToken.map((c) => c.art.m)).size >= 24, 'a wide spread of motifs: ' + new Set(nonToken.map((c) => c.art.m)).size);
});
t.test('flavor: every rare, and at least a third of the rest', () => {
  nonToken.filter((c) => c.rarity === 'rare').forEach((c) => t.ok(typeof c.flavor === 'string' && c.flavor.length > 8, c.id + ' has a flavor line'));
  const rest = nonToken.filter((c) => c.rarity !== 'rare');
  t.ok(rest.filter((c) => c.flavor).length >= Math.ceil(rest.length / 3), 'flavor on a third of the non-rares: ' + rest.filter((c) => c.flavor).length + ' of ' + rest.length);
  nonToken.filter((c) => c.flavor).forEach((c) => { t.ok(c.flavor.length <= 90, c.id + ' flavor is one short line'); t.ok(!/\d/.test(c.flavor), c.id + ' flavor carries no numbers'); });
});
t.test('locks: never on starters or commons, at most 4 uncommons and 4 rares, every archetype keeps an unlocked finisher', () => {
  t.eq(nonToken.filter((c) => c.locked && (c.rarity === 'starter' || c.rarity === 'common')).length, 0, 'no locked starters or commons');
  t.ok(nonToken.filter((c) => c.locked && c.rarity === 'uncommon').length <= 4, 'locked uncommons');
  t.ok(nonToken.filter((c) => c.locked && c.rarity === 'rare').length <= 4, 'locked rares');
  ['hanae_thousand_petals', 'hanae_hundred_cuts', 'hanae_mirror_edge', 'hanae_blade_dance', 'hanae_full_bloom', 'hanae_cyclone_cut', 'hanae_flowing_counter'].forEach((id) => t.ok(!byId(id).locked, id + ' is never locked (it carries an archetype)'));
});

// ---------------------------------------------------------------------------------------------- slots
t.test('slots: counts per rarity, colours per card, gold on powers, prism limit, colour totals', () => {
  nonToken.forEach((c) => {
    const n = c.slots.length;
    if (c.rarity === 'uncommon') t.ok(n >= 1 && n <= 2, c.id + ' uncommon slots ' + n); else if (c.rarity === 'rare') t.eq(n, 2, c.id + ' rare slots'); else t.eq(n, 1, c.id + ' slots');
    const ops = allOps(c);
    const blueOk = ops.some((o) => o.op === 'block' || o.op === 'heal' || (o.op === 'status' && (L.heroTgt.includes(o.tgt) || (o.tgt === undefined && !DATA.isDebuff(o.s)))));
    if (c.slots.includes('red')) t.ok(ops.some((o) => o.op === 'dmg'), c.id + ': red slot needs a damage op');
    if (c.slots.includes('blue')) t.ok(blueOk, c.id + ': blue slot needs Block, heal or a hero status');
    if (c.type === 'power') t.ok(c.slots.includes('gold'), c.id + ': every power has a gold slot');
    t.ok(new Set(c.slots).size === c.slots.length, c.id + ' does not repeat a slot colour');
  });
  t.ok(nonToken.filter((c) => c.rarity === 'rare' && c.slots.includes('any')).length <= 4, 'at most 4 rares with a prism slot');
  const colour = (col) => nonToken.filter((c) => c.slots.includes(col)).length;
  t.ok(colour('red') >= 10, 'red ' + colour('red')); t.ok(colour('blue') >= 10, 'blue ' + colour('blue'));
  t.ok(colour('green') >= 8, 'green ' + colour('green')); t.ok(colour('gold') >= 8, 'gold ' + colour('gold'));
  t.ok(colour('green') >= 9 && colour('blue') >= 11 && colour('gold') >= 10, 'margin over the colour quotas: ' + ['red', 'blue', 'green', 'gold'].map((c) => c + ' ' + colour(c)).join(', '));
});

// ---------------------------------------------------------------------------------------------- upgrades
t.test('every playable card has an upgrade that changes something', () => {
  nonToken.forEach((c) => {
    t.ok(c.up && typeof c.up === 'object', c.id + ' has up');
    const a = resolveDef(c, false), b = resolveDef(c, true);
    t.ok(JSON.stringify(a) !== JSON.stringify(b), c.id + ': upgrade differs from the base');
    Object.keys(c.up).forEach((k) => t.ok(['fx', 'cost', 'kw'].includes(k), c.id + ' up.' + k));
    if (c.up.cost !== undefined) t.ok(c.up.cost !== c.cost, c.id + ': up.cost differs');
    if (c.cost === 'X') t.ok(b.cost === 'X', c.id + ': an X card stays X');
    t.ok(b.cost === 'X' || b.cost <= (c.cost === 'X' ? 99 : c.cost), c.id + ': an upgrade never costs more');
  });
});

// ---------------------------------------------------------------------------------------------- the budget ruler
const ENEMIES = 2, AOE = 1.8, TURNS = 4, FRONT_BONUS = 2, ENERGY = 7;
// points per stack for statuses, and per unit for other effects. 1 point = 1 damage or 1 Block. A stack of Dodge is a whole hit
// prevented (about 8 points at chapter 1 and 2 hit sizes, and it never expires), a Dodge that is taken back next turn is worth 5.5.
// Might for one turn is worth 1.6 a stack, not the 2.5 it was priced at first: the balance bot measured every temporary Might card (Blade Duet, Flurry
// Stance, Blessed Blade, Rousing Roar) at or below zero lift, because Might only pays on the two or three hits left in the turn once the card is paid for.
const PT = { bloom: 2, dodge: 8, dodgeTemp: 5.5, might: 6, mightTemp: 1.6, bulwark: 4, ritual: 20, plating: 4, thorns: 3, regen: 2, taunt: 2, vulnerable: 4, weak: 3, frail: 1.5, poison: 2.5, burn: 2, stun: 8, mark: 2.5, bind: 0, sumi: 2, ward: 2, charge: 2 };
const PRICE = { draw: 3.5, energy: 6.5, heal: 0.8, swap: 1.2, add: 3, revive: 12, pickDiscard: 1, pickExhaust: 1.5, pickUpgrade: 4, pickToHand: 3.5, pickRetain: 1, pickCopy: 5 };
// the reference state a card is priced in: mid fight, a partly built turn
const REF = { bloom: 3, block: 2, allyBlock: 5, handSize: 3, drawPile: 12, discardPile: 6, exhaustPile: 1, cardsPlayed: 2, attacksPlayed: 1, skillsPlayed: 1, energy: 1, hp: 50, missingHp: 15, allyMissingHp: 15, enemies: ENEMIES, kills: 0, turn: 3, gems: 0, damageTaken: 6, hitsTaken: 1, targetBlock: 0, picked: 1, X: 2, debuffs: 0 };
const clone = (S) => Object.assign({}, S, { st: Object.assign({}, S.st), allySt: Object.assign({}, S.allySt) });
// Payoff cards are priced in the state they are built for, not in the generic REF (a finisher is clunky without its setup, by design):
// Thousand Petals after banking 5 Bloom, Sakura Blizzard with 4, Mirror Edge behind 9 Block (Parry and Sway: at 1 Energy it leaves two Energy of Block cards).
const SETUP = { hanae_thousand_petals: { bloom: 5 }, hanae_sakura_blizzard: { bloom: 4 }, hanae_mirror_edge: { block: 9 } };
const fresh = (row, setup) => {
  const S = { row, block: REF.block, allyBlock: REF.allyBlock, st: { bloom: REF.bloom }, allySt: {}, X: REF.X, cardsPlayed: REF.cardsPlayed, attacksPlayed: REF.attacksPlayed };
  const u = setup || {};
  if (u.bloom !== undefined) S.st.bloom = u.bloom;
  if (u.might !== undefined) S.st.might = u.might;
  if (u.block !== undefined) S.block = u.block;
  return S;
};
const stOf = (S, who, s) => ((who === 'ally' ? S.allySt : S.st)[s] || 0);

function countOf(v, S) {
  switch (v.per) {
    case 'X': return S.X;
    case 'cardsPlayed': return S.cardsPlayed;
    case 'attacksPlayed': return S.attacksPlayed;
    case 'block': return v.who === 'ally' ? S.allyBlock : S.block;
    case 'status': return stOf(S, v.who, v.s);
    case 'missingHp': return v.who === 'ally' ? REF.allyMissingHp : REF.missingHp;
    case 'front': return S.row === 'front' ? 1 : 0;
    default: return REF[v.per] === undefined ? 0 : REF[v.per];
  }
}
function V(v, S) {
  if (typeof v === 'number') return v;
  let c = v.per ? countOf(v, S) : 0;
  if (v.upTo !== undefined) c = Math.min(c, v.upTo);
  let r = (v.base || 0) + (v.mul === undefined ? 1 : v.mul) * c;
  if (v.min !== undefined) r = Math.max(r, v.min);
  if (v.cap !== undefined) r = Math.min(r, v.cap);
  return Math.floor(r);
}
const heroMult = (tgt) => (tgt === 'both' ? 1.9 : tgt === 'ally' ? 0.9 : 1);
const isRevertHook = (o) => o.op === 'hook' && (o.on === 'turnEnd' || o.on === 'turnStart') && o.once && o.fx.every((x) => x.op === 'status' && x.n < 0);
function condProb(c, S) {
  let p = 1;
  Object.keys(c).forEach((k) => {
    const q = c[k]; let ok;
    if (k === 'row') ok = S.row === q ? 1 : 0;
    else if (k === 'status') { const n = stOf(S, q.who, q.s); ok = (q.gte === undefined || n >= q.gte) && (q.lte === undefined || n <= q.lte) ? 1 : 0; }
    else if (k === 'cardsPlayed' || k === 'attacksPlayed') { ok = q.lte === 0 ? 0.5 : ((q.gte === undefined || S[k] >= q.gte) && (q.lte === undefined || S[k] <= q.lte) ? 1 : 0); }
    else if (k === 'hpPct') ok = 0.3; else if (k === 'handEmpty') ok = 0.2; else if (k === 'lastKill') ok = 0.3; else if (k === 'targetStatus') ok = 0.5; else if (k === 'allyDown') ok = 0.05;
    else if (k === 'block') ok = (q.gte === undefined || S.block >= q.gte) && (q.lte === undefined || S.block <= q.lte) ? 1 : 0;
    else ok = 0.5;
    p *= ok;
  });
  return p;
}
function spend(o, S, A) {
  if (!o.consume) return;
  const id = typeof o.consume === 'object' ? o.consume.s : o.consume;
  const upTo = typeof o.consume === 'object' && o.consume.upTo !== undefined ? V(o.consume.upTo, S) : Infinity;
  if (id === 'block') { A.spent += S.block; S.block = 0; return; }
  const n = Math.min(S.st[id] || 0, upTo);
  A.spent += n * (PT[id] || 2); S.st[id] = (S.st[id] || 0) - n;
}
function hookRate(h) {
  if (h.once) return { total: 1 };
  let r = { combatStart: 0.25, turnStart: 1, turnEnd: 1, onPlay: 2, onDamaged: 1.6, onKill: 0.7, onSwap: 1.2, onHeroDown: 0.1, onShuffle: 0.35, onExhaust: 0.5 }[h.on];
  if (h.on === 'onPlay' && h.filter) {
    if (h.filter.type === 'attack') r = 1.6; else if (h.filter.type === 'skill') r = 1.5; else if (h.filter.type === 'power') r = 0.2;
    if (h.filter.cost && h.filter.cost.lte === 0) r = Math.min(r, 1);
    if (h.filter.hero === 'any') r *= 1.6;                        // either hero's cards count
  }
  if (h.every) r /= h.every;
  if (h.limit) r = Math.min(r, h.limit);
  return { total: r * TURNS };
}
function evalOps(ops, S, A, hookMode, revert) {
  (ops || []).forEach((o) => {
    switch (o.op) {
      case 'dmg': {
        const n = V(o.n, S), hits = o.hits === undefined ? 1 : Math.max(0, V(o.hits, S));
        const per = n + (hookMode ? 0 : (S.row === 'front' ? FRONT_BONUS : 0) + (S.st.might || 0));
        A.gross += Math.max(0, per) * hits * (o.tgt === 'all' ? AOE : o.tgt === 'others' ? 0.8 : 1) * (o.pierce ? 1.1 : 1);
        spend(o, S, A); break;
      }
      case 'block': {
        const n = Math.max(0, V(o.n, S) + (hookMode ? 0 : (S.row === 'back' ? 1 : 0)) + (S.st.bulwark || 0));
        const tgt = o.tgt || 'self';
        A.gross += n * heroMult(tgt);
        if (tgt !== 'ally') S.block += n; else S.allyBlock += n;
        spend(o, S, A); break;
      }
      case 'heal': A.gross += V(o.n, S) * PRICE.heal * heroMult(o.tgt || 'self'); spend(o, S, A); break;
      case 'status': {
        const n = V(o.n, S), tgt = o.tgt || (DATA.isDebuff(o.s) ? 'enemy' : 'self');
        const hero = L.heroTgt.includes(tgt);
        if (hero) {
          const temp = revert && revert[o.s] && n > 0;
          const unit = temp ? (PT[o.s + 'Temp'] || PT[o.s] * 0.4) : PT[o.s];
          const sign = DATA.isDebuff(o.s) ? -1 : 1;
          A.gross += sign * n * unit * heroMult(tgt);
          if (tgt !== 'ally') S.st[o.s] = (S.st[o.s] || 0) + n;
          if (tgt === 'ally' || tgt === 'both') S.allySt[o.s] = (S.allySt[o.s] || 0) + n;
        } else if (DATA.isDebuff(o.s)) A.gross += n * PT[o.s] * (tgt === 'all' ? AOE : 1);
        spend(o, S, A); break;
      }
      case 'removeStatus': {
        const have = stOf(S, undefined, o.s), n = Math.min(have, o.n === undefined ? have : V(o.n, S));
        if (DATA.statuses[o.s] && DATA.statuses[o.s].kind === 'resource') { A.spent += n * PT[o.s]; S.st[o.s] = have - n; }
        break;
      }
      case 'draw': A.gross += V(o.n, S) * PRICE.draw; spend(o, S, A); break;
      case 'energy': A.gross += V(o.n, S) * PRICE.energy; spend(o, S, A); break;
      case 'swap': A.gross += PRICE.swap; S.row = S.row === 'front' ? 'back' : 'front'; break;
      case 'pick': A.gross += Math.min(V(o.n, S), 2) * ({ discard: PRICE.pickDiscard, exhaust: PRICE.pickExhaust, upgrade: PRICE.pickUpgrade, toHand: PRICE.pickToHand, retain: PRICE.pickRetain, copy: PRICE.pickCopy, toDrawTop: 1 }[o.then] || 1); break;
      case 'add': A.gross += (o.n === undefined ? 1 : V(o.n, S)) * PRICE.add; break;
      case 'revive': A.gross += PRICE.revive; break;
      case 'hurt': A.spent += V(o.n, S) * 0.8; break;
      case 'repeat': { const k = Math.max(0, V(o.n, S)); for (let i = 0; i < k; i++) evalOps(o.do, S, A, hookMode, revert); break; }
      case 'cond': {
        const p = condProb(o.if, S);
        const a = clone(S), b = clone(S), A1 = { gross: 0, spent: 0 }, A2 = { gross: 0, spent: 0 };
        if (p > 0) evalOps(o.then, a, A1, hookMode, revert);
        if (p < 1) evalOps(o.else, b, A2, hookMode, revert);
        A.gross += p * A1.gross + (1 - p) * A2.gross; A.spent += p * A1.spent + (1 - p) * A2.spent;
        Object.assign(S, p >= 0.5 ? a : b); break;
      }
      case 'hook': {
        if (isRevertHook(o)) break;                                   // the give-back half of a "this turn" buff is already priced as temporary
        const r = hookRate(o), S2 = clone(S), A2 = { gross: 0, spent: 0 };
        evalOps(o.fx, S2, A2, true, null);
        A.gross += r.total * (A2.gross - A2.spent); break;
      }
      default: break;
    }
  });
}
function evalCard(def, row, setup) {
  const S = fresh(row, setup), A = { gross: 0, spent: 0 };
  const revert = {};
  (def.fx || []).forEach((o) => { if (isRevertHook(o)) o.fx.forEach((x) => { revert[x.s] = true; }); });
  evalOps(def.fx, S, A, false, revert);
  return { gross: A.gross, spent: A.spent, net: A.gross - A.spent };
}
function budget(c, up) {
  const d = resolveDef(c, up);
  const eq = d.cost === 'X' ? 2 : d.cost;
  const f = evalCard(d, 'front', SETUP[c.id]), b = evalCard(d, 'back', SETUP[c.id]);
  const net = 0.7 * f.net + 0.3 * b.net;
  const power = c.type === 'power';
  const exhaust = d.kw.includes('exhaust');
  const metric = eq === 0 ? net : net / eq;
  let lo, hi;
  if (power) { lo = 3; hi = 15; }
  else if (eq === 0) { lo = 2; hi = exhaust ? 11 : 7.5; }
  else if (eq === 1) { lo = 4.5; hi = 10.5; }
  else { lo = 4.5; hi = 9.5; }
  if (up) hi *= 1.3;
  const surplus = net - ENERGY * eq;
  return { net, front: f.net, back: b.net, eq, metric: power && eq === 0 ? net : metric, lo, hi, surplus, cost: d.cost };
}
t.test('budget: every card sits inside its value per Energy band (see the header for the ruler)', () => {
  const rows = [];
  nonToken.forEach((c) => {
    const base = budget(c, false), up = budget(c, true);
    rows.push({ id: c.id, r: c.rarity[0], cost: base.cost, front: base.front, back: base.back, metric: base.metric, band: [base.lo, base.hi], upMetric: up.metric, upBand: [up.lo, up.hi], dSurplus: up.surplus - base.surplus });
    t.ok(base.metric >= base.lo - 1e-9 && base.metric <= base.hi + 1e-9, `${c.id} base value ${base.metric.toFixed(2)} outside [${base.lo}, ${base.hi}]`);
    t.ok(up.metric >= up.lo - 1e-9 && up.metric <= up.hi + 1e-9, `${c.id} upgraded value ${up.metric.toFixed(2)} outside [${up.lo}, ${up.hi.toFixed(2)}]`);
    t.ok(up.surplus >= base.surplus - 1e-9, `${c.id}: the upgrade must not lower the surplus (${base.surplus.toFixed(1)} to ${up.surplus.toFixed(1)})`);
  });
  if (process.env.RB_TABLE) {
    console.log('id'.padEnd(26) + 'r cost  front  back   metric  band          up     upBand        dSurplus');
    rows.forEach((r) => console.log(r.id.padEnd(26) + r.r + ' ' + String(r.cost).padEnd(4) + ' ' + r.front.toFixed(1).padStart(6) + ' ' + r.back.toFixed(1).padStart(6) + ' ' + r.metric.toFixed(2).padStart(7) + '  [' + r.band[0] + ',' + r.band[1] + ']'.padEnd(6) + ' ' + r.upMetric.toFixed(2).padStart(6) + '  [' + r.upBand[0] + ',' + r.upBand[1].toFixed(1) + ']  ' + r.dSurplus.toFixed(1)));
  }
});
t.test('budget: the ruler prices a few known cases sensibly (guards the ruler itself)', () => {
  const near = (a, b, m) => t.ok(Math.abs(a - b) < 0.05, `${m}: ${a} vs ${b}`);
  const slash = evalCard(resolveDef(byId('hanae_slash'), false), 'front'); near(slash.net, 8, 'Petal Note in the lead is 6 + 2');
  near(evalCard(resolveDef(byId('hanae_slash'), false), 'back').net, 6, 'and 6 in the backing spot');
  near(evalCard(resolveDef(byId('hanae_parry'), false), 'back').net, 6, 'Soft Shield in the backing spot is 5 + 1');
  const tp = evalCard({ fx: [{ op: 'dmg', n: { per: 'status', s: 'bloom', mul: 4 }, consume: 'bloom' }] }, 'front'); near(tp.gross, 14, 'The High Note at 3 Bloom deals 4 x 3 + 2'); near(tp.spent, 6, 'and spends 3 Bloom at 2 points each');
  const twin = evalCard({ fx: [{ op: 'dmg', n: 2, hits: 2 }] }, 'front'); near(twin.gross, 8, 'two hits of 2 carry the lead bonus twice');
  const aoe = evalCard({ fx: [{ op: 'dmg', n: 5, tgt: 'all' }] }, 'back'); near(aoe.gross, 9, 'AoE is worth 1.8 targets');
  const might = evalCard({ fx: [{ op: 'status', s: 'might', n: 2, tgt: 'self' }, { op: 'hook', on: 'turnEnd', once: true, fx: [{ op: 'status', s: 'might', n: -2, tgt: 'self' }] }] }, 'front'); near(might.net, 3.2, 'temporary Volume is 1.6 per stack');
});

// ---------------------------------------------------------------------------------------------- text (needs data_text.js)
t.test('rules text: non-empty, clean and under 110 characters for every card, base and upgraded', () => {
  if (!DATA.cardPlain) { console.log('  note: data_text.js is not written yet, text checks skipped'); if (STRICT) t.ok(false, 'STRICT: data_text.js is required'); return; }
  nonToken.forEach((c) => [false, true].forEach((up) => {
    const txt = DATA.cardPlain(inst(c.id, up));
    t.ok(typeof txt === 'string' && txt.trim().length > 8, `${c.id}${up ? '+' : ''} has text`);
    t.ok(!/undefined|NaN|\[object|null/.test(txt), `${c.id}${up ? '+' : ''} text is clean: ${txt}`);
    t.ok(txt.length <= 110, `${c.id}${up ? '+' : ''} text is ${txt.length} characters: ${txt}`);
    const html = DATA.cardHtml ? DATA.cardHtml(inst(c.id, up)) : '';
    if (html) t.ok(!/undefined|NaN/.test(html), `${c.id}${up ? '+' : ''} html is clean`);
    t.ok(!new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']').test(txt), `${c.id}${up ? '+' : ''} text has no dashes`);
  }));
  nonToken.forEach((c) => {
    const a = resolveDef(c, false), b = resolveDef(c, true);
    const visible = DATA.cardPlain(inst(c.id, false)) !== DATA.cardPlain(inst(c.id, true)) || a.cost !== b.cost || JSON.stringify(a.kw) !== JSON.stringify(b.kw);
    t.ok(visible, c.id + ': the player can see what the upgrade changes (text, cost or keywords)');
  });
});

// ---------------------------------------------------------------------------------------------- the real engine
// Every expected number below is derived by hand from DESIGN.md 4.2 to 4.4 (Hanae in front: +2 damage per hit, in back: +1 Block
// on her cards; hook damage has no row or Might bonus; Blade Flow adds 1 Bloom after the first Attack of a turn).
const wantEngine = has('data_text.js') && has('combat.js');
let eng = null, engErr = null;
if (wantEngine) {
  try { eng = boot({ only: ['data_text', 'combat', 'data_cards_hanae'] }); if (!eng.COMBAT) throw new Error('COMBAT namespace missing'); } catch (e) { engErr = e; eng = null; }
}
if (!eng) {
  const why = !wantEngine ? 'combat.js or data_text.js is not written yet' : 'the engine did not boot: ' + (engErr && (engErr.message || engErr));
  console.log('  note: engine checks skipped (' + why + ')');
  t.test('engine: available (only required under RB_STRICT=1)', () => { if (STRICT) t.ok(false, 'STRICT: ' + why); });
} else {
  const { COMBAT, DATA: D, U: EU } = eng;
  const DUMMY = 'hanae_test_dummy';
  // a patient target that taps the front hero for 4 and has far more HP than any card here can remove
  D.enemies[DUMMY] = { id: DUMMY, name: 'Test Dummy', chapter: 1, tier: 'normal', size: 'm', hp: [900, 900], moves: { hit: { name: 'Tap', kind: 'attack', fx: [{ op: 'dmg', n: 4, tgt: 'front' }] } }, ai: { seq: ['hit'] }, art: { id: 'kappa' }, lore: 'A patient target.', tags: ['spirit'] };
  const mk = (id, up) => ({ uid: EU.uid(), id, up: up ? 1 : 0, gems: (D.cards[id].slots || []).map(() => null) });
  const fight = (deck, o) => {
    o = o || {};
    const C = COMBAT.create({ heroes: [{ id: 'hanae', hp: D.heroes.hanae.maxHp, maxHp: D.heroes.hanae.maxHp }, { id: o.partner || 'kuro', hp: D.heroes[o.partner || 'kuro'].maxHp, maxHp: D.heroes[o.partner || 'kuro'].maxHp }], frontIdx: o.back ? 1 : 0, deck: deck.map((d) => (typeof d === 'string' ? mk(d) : mk(d.id, d.up))), enemies: o.enemies || [DUMMY], tier: 'normal', chapter: 1, seed: o.seed || 11, mods: D.modsFor([], 0), relics: [], gold: 0 });
    C.start();
    return C;
  };
  const hanae = (C) => C.heroes.find((h) => h.id === 'hanae');
  const ally = (C) => C.heroes.find((h) => h.id !== 'hanae');
  const handOf = (C, id) => C.hand.find((c) => c.id === id);
  // answer a pending pick the way a player would: the first candidates offered
  const settle = (C) => { let guard = 0; while (C.pending && guard++ < 4) C.resolvePick(C.pending.uids.slice(0, C.pending.n)); };
  // put a card into the hand if the opening draw missed it (a test may rearrange plain piles; it keeps the suite independent of the shuffle)
  const ensureInHand = (C, id) => {
    if (handOf(C, id)) return handOf(C, id);
    for (const pile of [C.draw, C.discard]) { const i = pile.findIndex((c) => c.id === id); if (i >= 0) { C.hand.push(pile.splice(i, 1)[0]); break; } }
    return handOf(C, id);
  };
  const play = (C, id) => { const c = handOf(C, id); if (!c) throw new Error(id + ' is not in hand'); const ev = C.play(c.uid, C.needsTarget(c.uid) ? C.legalTargets(c.uid)[0] : undefined); settle(C); return ev; };
  const hpSum = (C) => C.enemies.reduce((s, e) => s + e.hp, 0);
  const st = (u, s) => u.st[s] || 0;
  const FILL = ['hanae_slash', 'hanae_slash', 'hanae_parry', 'hanae_parry'];
  // run one card and report how much damage the enemies lost
  const dealt = (C, id, setup) => { if (setup) setup(C); const b = hpSum(C); play(C, id); return b - hpSum(C); };

  t.test('engine: every card plays in both rows, base and upgraded, with each possible partner, without throwing', () => {
    nonToken.forEach((c) => [0, 1].forEach((up) => [false, true].forEach((back) => {
      const partner = ['kuro', 'suzu', 'raiga'][(c.id.length + up + (back ? 1 : 0)) % 3];
      const C = fight([{ id: c.id, up }].concat(FILL, ['hanae_slash', 'hanae_parry', 'hanae_slash']), { back, partner, enemies: [DUMMY, DUMMY] });
      hanae(C).st.bloom = 4; hanae(C).st.might = 1;
      const card = ensureInHand(C, c.id);
      if (!card) return t.ok(false, `${c.id} could not be put in hand`);
      const total = () => C.hand.length + C.draw.length + C.discard.length + C.exhaust.length + C.powers.length + (C.inPlay ? 1 : 0);
      const before = total();
      let threw = null;
      try { C.play(card.uid, C.needsTarget(card.uid) ? C.legalTargets(card.uid)[0] : undefined); settle(C); } catch (e) { threw = e; }
      t.ok(!threw, `${c.id}${up ? '+' : ''} ${back ? 'back' : 'front'} plays: ${threw && threw.message}`);
      t.ok(total() >= before, `${c.id}: conservation (${before} to ${total()})`);
    })));
  });
  t.test('engine: every card plays alone with no Bloom, no Block and one enemy, then the turn ends and the next begins', () => {
    nonToken.forEach((c) => [0, 1].forEach((up) => {
      const C = fight([{ id: c.id, up }], { enemies: [DUMMY] });
      const card = handOf(C, c.id);
      if (!card) return t.ok(false, c.id + ' reaches the hand');
      let threw = null;
      try { C.play(card.uid, C.needsTarget(card.uid) ? C.legalTargets(card.uid)[0] : undefined); settle(C); C.endTurn(); C.endTurn(); } catch (e) { threw = e; }
      t.ok(!threw, `${c.id}${up ? '+' : ''} plays then two turns pass: ${threw && threw.message}`);
    }));
  });
  t.test('engine: rules text with live numbers is clean for every card in both rows', () => {
    nonToken.forEach((c) => [false, true].forEach((back) => {
      const C = fight([c.id].concat(FILL), { back });
      hanae(C).st.might = 2;
      const html = D.cardHtml(mk(c.id, 0), { unit: hanae(C), C });
      const plain = D.cardPlain(mk(c.id, 0), { unit: hanae(C), C });
      t.ok(html.length > 0 && !/undefined|NaN/.test(html) && !/undefined|NaN/.test(plain), `${c.id} live text (${back ? 'back' : 'front'}) is clean: ${plain}`);
    }));
  });

  // ---- Bloom builders and sinks
  t.test('engine: Petal Step steps forward for free and gives Bloom and Block', () => {
    const C = fight(['hanae_petal_step'].concat(FILL));
    t.eq(hanae(C).row, 'front', 'Hanae leads'); play(C, 'hanae_petal_step');
    t.eq(hanae(C).row, 'front', 'from the front it does not push her out'); t.eq(ally(C).row, 'back', 'or her partner in'); t.eq(st(hanae(C), 'bloom'), 1, 'Bloom gained'); t.eq(hanae(C).block, 3, 'Block gained');
    t.eq(C.energy, C.maxEnergy, 'it costs nothing');
    const B = fight(['hanae_petal_step'].concat(FILL), { back: true }); play(B, 'hanae_petal_step'); t.eq(hanae(B).row, 'front', 'from the back it steps forward'); t.eq(hanae(B).block, 3, 'Block 3 (front row, no bonus)');
  });
  t.test('engine: Petal Flick and Twin Petals build Bloom, Blade Flow adds 1 after the first Attack', () => {
    const A = fight(['hanae_petal_flick'].concat(FILL)); t.eq(dealt(A, 'hanae_petal_flick'), 2 + 2, 'Flick: 2 + 2 in front'); t.eq(st(hanae(A), 'bloom'), 2, 'card 1 + Blade Flow 1');
    const B = fight(['hanae_twin_petals'].concat(FILL)); t.eq(dealt(B, 'hanae_twin_petals'), 2 * (2 + 2), 'Twin: two hits of 2 + 2'); t.eq(st(hanae(B), 'bloom'), 2, 'front rider 1 + Blade Flow 1');
    const K = fight(['hanae_twin_petals'].concat(FILL), { back: true }); t.eq(dealt(K, 'hanae_twin_petals'), 2 * 2, 'in the back: no row bonus'); t.eq(st(hanae(K), 'bloom'), 1, 'and no front rider, only Blade Flow');
  });
  t.test('engine: Blossom Burst spends up to 3 Bloom, Thousand Petals spends all', () => {
    const A = fight(['hanae_blossom_burst'].concat(FILL)); t.eq(dealt(A, 'hanae_blossom_burst', (C) => { hanae(C).st.bloom = 5; }), 3 + 3 * 3 + 2, '3 + 3 per Bloom spent (3 of 5) + 2'); t.eq(st(hanae(A), 'bloom'), 2 + 1, '2 left, then Blade Flow');
    const B = fight(['hanae_thousand_petals'].concat(FILL)); t.eq(dealt(B, 'hanae_thousand_petals', (C) => { hanae(C).st.bloom = 5; }), 5 * 5 + 2, '5 per Bloom + 2'); t.eq(st(hanae(B), 'bloom'), 1, 'all spent, then Blade Flow pays 1');
    const Z = fight(['hanae_thousand_petals'].concat(FILL)); t.eq(dealt(Z, 'hanae_thousand_petals'), 2, 'with no Bloom it is just the row bonus');
  });
  t.test('engine: Full Bloom shields both heroes, Bloom Tide turns 3 Bloom into 2 Energy', () => {
    const F = fight(['hanae_full_bloom'].concat(FILL)); hanae(F).st.bloom = 4; play(F, 'hanae_full_bloom');
    t.eq(st(hanae(F), 'bloom'), 0, 'all Bloom spent'); F.heroes.forEach((h) => t.ok(h.block >= 8, h.id + ' has Block ' + h.block));
    const C = fight(['hanae_bloom_tide'].concat(FILL)); hanae(C).st.bloom = 3; const e = C.energy; play(C, 'hanae_bloom_tide');
    t.eq(st(hanae(C), 'bloom'), 0, 'Bloom paid'); t.eq(C.energy, e + 2, 'two Energy back'); t.ok(C.exhaust.some((c) => c.id === 'hanae_bloom_tide'), 'and it exhausts');
    const N = fight(['hanae_bloom_tide'].concat(FILL, ['hanae_slash', 'hanae_slash', 'hanae_parry'])); ensureInHand(N, 'hanae_bloom_tide'); hanae(N).st.bloom = 2; const e2 = N.energy, h2 = N.hand.length; play(N, 'hanae_bloom_tide'); t.eq(N.energy, e2, 'with too little Bloom no Energy comes back'); t.eq(st(hanae(N), 'bloom'), 2, 'and no Bloom is spent'); t.eq(N.hand.length, h2 - 1 + 1, 'but it still draws a card: never a dead card');
  });
  t.test('engine: Sakura Blizzard hits every enemy once per Energy with damage equal to Bloom', () => {
    const C = fight(['hanae_sakura_blizzard'].concat(FILL), { enemies: [DUMMY, DUMMY] }); hanae(C).st.bloom = 4;
    const b = C.enemies.map((e) => e.hp); play(C, 'hanae_sakura_blizzard');
    C.enemies.forEach((e, i) => t.eq(b[i] - e.hp, 3 * (1 + 4 + 2), 'enemy ' + i + ': 3 volleys of 1 + 4 Bloom + 2'));
    t.eq(st(hanae(C), 'bloom'), 1, 'Bloom spent, then Blade Flow');
  });
  t.test('engine: Spring Vow is innate, Thousand Petals is retained', () => {
    const deck = ['hanae_spring_vow'].concat(Array(12).fill('hanae_slash'));
    for (let seed = 1; seed <= 6; seed++) t.ok(!!handOf(fight(deck, { seed }), 'hanae_spring_vow'), 'seed ' + seed + ': Spring Vow is in the opening hand');
    const R = fight(['hanae_thousand_petals'].concat(FILL)); R.endTurn(); t.ok(!!handOf(R, 'hanae_thousand_petals'), 'Thousand Petals stayed in hand through the end of turn');
  });
  t.test('engine: Spring Vow and Blossom Field work on the turn edges', () => {
    const S = fight(['hanae_spring_vow'].concat(FILL)); play(S, 'hanae_spring_vow'); t.eq(st(hanae(S), 'bloom'), 0, 'nothing yet'); S.endTurn(); t.eq(st(hanae(S), 'bloom'), 1, 'Bloom at the start of the next turn');
    const F = fight(['hanae_blossom_field'].concat(FILL)); hanae(F).st.bloom = 4; play(F, 'hanae_blossom_field'); t.eq(hanae(F).block, 5, 'the meadow shields her with 5 Block at once'); const b = hpSum(F); F.endTurn();
    t.eq(b - hpSum(F), 4, 'the field cuts for the Bloom it holds, without spending it'); t.eq(st(hanae(F), 'bloom'), 4, 'Bloom is kept');
  });

  // ---- Flurry
  t.test('engine: Rising Gale hits once per card played, Whirling Petals once per Energy', () => {
    const C = fight(['hanae_rising_gale'].concat(FILL)); play(C, 'hanae_parry'); play(C, 'hanae_parry'); const b = hpSum(C); play(C, 'hanae_rising_gale');
    t.eq(b - hpSum(C), 2 * (2 + 2), 'two hits of 2 + 2 after two cards');
    const F = fight(['hanae_rising_gale'].concat(FILL)); t.eq(dealt(F, 'hanae_rising_gale'), 0, 'as the first card it does nothing');
    const W = fight(['hanae_whirling_petals'].concat(FILL)); t.eq(dealt(W, 'hanae_whirling_petals'), 3 * (4 + 2), 'X = 3: three hits of 4 + 2'); t.eq(W.energy, 0, 'X spends everything');
    const Z = fight(['hanae_whirling_petals'].concat(FILL)); Z.energy = 0; t.eq(dealt(Z, 'hanae_whirling_petals'), 0, 'X = 0 is legal and does nothing');
  });
  t.test('engine: Flurry Stance gives temporary Might, Keen Edge gives permanent Might', () => {
    const C = fight(['hanae_flurry_stance'].concat(FILL)); play(C, 'hanae_flurry_stance');
    t.eq(st(hanae(C), 'might'), 2, 'Might 2 now'); C.endTurn(); t.eq(st(hanae(C), 'might'), 0, 'gone next turn');
    const K = fight(['hanae_keen_edge'].concat(FILL)); play(K, 'hanae_keen_edge'); K.endTurn(); t.eq(st(hanae(K), 'might'), 1, 'Keen Edge stays'); t.ok(K.exhaust.some((c) => c.id === 'hanae_keen_edge'), 'and exhausts');
  });
  t.test('engine: Petal Mark adds 3 damage to each of the next 3 hits', () => {
    const C = fight(['hanae_petal_mark'].concat(FILL)); play(C, 'hanae_petal_mark'); t.eq(st(C.enemies[0], 'mark'), 3, 'Mark 3 on the target');
    const b = hpSum(C); play(C, 'hanae_slash'); t.eq(b - hpSum(C), 6 + 2 + 3, 'Slash 6 + 2 + Mark 3'); t.eq(st(C.enemies[0], 'mark'), 2, 'one Mark stack spent');
  });
  t.test('engine: Cyclone Cut and Hundred Cuts count every hit', () => {
    const C = fight(['hanae_cyclone_cut'].concat(FILL), { enemies: [DUMMY, DUMMY] }); const b = C.enemies.map((e) => e.hp); play(C, 'hanae_cyclone_cut');
    C.enemies.forEach((e, i) => t.eq(b[i] - e.hp, 2 * (2 + 2), 'enemy ' + i + ' takes two hits of 2 + 2'));
    const H = fight(['hanae_hundred_cuts'].concat(FILL)); t.eq(dealt(H, 'hanae_hundred_cuts'), 9 * (1 + 2), 'nine hits of 1 + 2'); t.eq(H.energy, 0, 'a whole turn');
    const M = fight(['hanae_hundred_cuts'].concat(FILL)); t.eq(dealt(M, 'hanae_hundred_cuts', (X) => { hanae(X).st.might = 2; }), 9 * (1 + 2 + 2), 'every hit carries Might');
    const U = fight([{ id: 'hanae_hundred_cuts', up: 1 }].concat(FILL)); t.eq(dealt(U, 'hanae_hundred_cuts'), 9 * (1 + 2), 'the upgrade keeps the nine hits'); t.eq(U.energy, U.maxEnergy - 2, 'and costs 2 instead of 3');
  });
  t.test('engine: Blade Dance grows Might every turn, Blade Duet lends Might to both heroes for one turn', () => {
    const C = fight(['hanae_blade_dance'].concat(FILL)); play(C, 'hanae_blade_dance'); t.eq(st(hanae(C), 'ritual'), 1, 'Ritual 1'); C.endTurn(); t.eq(st(hanae(C), 'might'), 1, 'Might 1 at the start of next turn');
    const D2 = fight(['hanae_blade_duet'].concat(FILL, ['hanae_slash', 'hanae_slash', 'hanae_slash'])); ensureInHand(D2, 'hanae_blade_duet'); const dh = D2.hand.length; play(D2, 'hanae_blade_duet');
    D2.heroes.forEach((h) => t.eq(st(h, 'might'), 2, h.id + ' has Might 2')); t.eq(D2.hand.length, dh - 1 + 1, 'and one card was drawn'); t.eq(D2.energy, D2.maxEnergy - 1, 'for one Energy'); D2.endTurn(); D2.heroes.forEach((h) => t.eq(st(h, 'might'), 0, h.id + ' gave it back'));
  });

  // ---- Riposte
  t.test('engine: Riposte hits for its Block, Sway lends Dodge for one enemy phase, Flowing Counter hits per Dodge', () => {
    const R = fight(['hanae_riposte'].concat(FILL)); play(R, 'hanae_parry'); const b = hpSum(R); play(R, 'hanae_riposte');
    t.eq(b - hpSum(R), 5 + 3 + 2, 'Block 8 becomes 8 damage, +2 in front'); t.eq(hanae(R).block, 8, 'and the Block stays');
    const S = fight(['hanae_sway'].concat(FILL)); play(S, 'hanae_sway'); t.eq(hanae(S).block, 4, 'Block 4'); t.eq(st(hanae(S), 'dodge'), 1, 'Dodge 1');
    const B = fight(['hanae_sway'].concat(FILL), { back: true }); play(B, 'hanae_sway'); B.endTurn();
    t.eq(st(hanae(B), 'dodge'), 0, 'from the back, where nobody hits her, the Dodge is gone at the start of the next turn');
    const F = fight(['hanae_sway'].concat(FILL)); play(F, 'hanae_sway'); const hp0 = hanae(F).hp; F.endTurn(); t.eq(hanae(F).hp, hp0, 'in front the Dodge (and Block) took the dummy\'s tap: no HP lost');
    const A = fight(['hanae_flowing_counter'].concat(FILL)); t.eq(dealt(A, 'hanae_flowing_counter'), 3 * 1 + 2, 'one Dodge: 3 + 2'); t.eq(st(hanae(A), 'dodge'), 1, 'Dodge is kept for the enemy phase');
    const K = fight(['hanae_flowing_counter'].concat(FILL), { back: true }); play(K, 'hanae_flowing_counter'); K.endTurn(); t.eq(st(hanae(K), 'dodge'), 0, 'and taken back next turn');
    const C = fight(['hanae_flowing_counter'].concat(FILL)); t.eq(dealt(C, 'hanae_flowing_counter', (X) => { hanae(X).st.dodge = 2; }), 3 * 3 + 2, 'three Dodge: 9 + 2');
  });
  t.test('engine: Bending Willow answers the attacker when Hanae is hit, and Swallow Reversal pays for the damage she took', () => {
    const C = fight(['hanae_bending_willow'].concat(FILL)); play(C, 'hanae_bending_willow'); t.eq(hanae(C).block, 4, 'it braces her with 4 Block at once'); const b = hpSum(C); C.endTurn();
    t.eq(b - hpSum(C), 2, 'the dummy took 2 for hitting her'); t.eq(st(hanae(C), 'bloom'), 1, 'and she gained Bloom');
    const W = fight(['hanae_swallow_reversal'].concat(FILL)); W.endTurn(); const lost = D.heroes.hanae.maxHp - hanae(W).hp;
    t.eq(lost, 4, 'the dummy tapped her for 4'); const b2 = hpSum(W); play(W, 'hanae_swallow_reversal'); t.eq(b2 - hpSum(W), 2 + lost + 2, 'Swallow Reversal: 2 + damage taken + 2');
  });
  t.test('engine: Mirror Edge turns all her Block into damage for every enemy', () => {
    const C = fight(['hanae_mirror_edge'].concat(FILL), { enemies: [DUMMY, DUMMY] }); hanae(C).block = 12; const b = C.enemies.map((e) => e.hp); play(C, 'hanae_mirror_edge');
    C.enemies.forEach((e, i) => t.eq(b[i] - e.hp, 12 + 2, 'enemy ' + i + ' takes 12 + 2')); t.eq(hanae(C).block, 0, 'the Block is gone'); t.eq(C.energy, C.maxEnergy - 1, 'for one Energy');
    const K = fight(['hanae_mirror_edge'].concat(FILL), { enemies: [DUMMY] }); hanae(K).block = 40; t.eq(dealt(K, 'hanae_mirror_edge'), 20 + 2, 'a wall of Block is capped at 20 (+2 in front)');
    const U = fight([{ id: 'hanae_mirror_edge', up: 1 }].concat(FILL), { enemies: [DUMMY] }); hanae(U).block = 10; t.eq(dealt(U, 'hanae_mirror_edge'), 2 + 10 + 2, 'the upgrade adds a flat 2');
  });
  t.test('engine: Borrowed Shield reads the ally, Petal Veil shields both heroes', () => {
    const C = fight(['hanae_borrowed_shield'].concat(FILL)); ally(C).block = 5; play(C, 'hanae_borrowed_shield'); t.eq(hanae(C).block, 3 + 5, 'Block 3 plus the ally\'s 5');
    const V = fight(['hanae_petal_veil'].concat(FILL)); play(V, 'hanae_petal_veil'); V.heroes.forEach((h) => t.eq(h.block, 3, h.id + ' gains 3')); t.eq(st(hanae(V), 'bloom'), 1, 'and Hanae blooms');
  });

  // ---- rows, swaps and the first card of a turn
  t.test('engine: Iai Draw is huge only as the first card of the turn', () => {
    const A = fight(['hanae_iai_draw', 'hanae_flurry_stance'].concat(FILL)); t.eq(dealt(A, 'hanae_iai_draw'), 12 + 2, 'first card: 12 + 2'); t.ok(A.exhaust.some((c) => c.id === 'hanae_iai_draw'), 'it exhausts');
    const B = fight(['hanae_iai_draw', 'hanae_flurry_stance'].concat(FILL)); play(B, 'hanae_flurry_stance'); const b = hpSum(B); play(B, 'hanae_iai_draw');
    t.eq(b - hpSum(B), 4 + 2 + 2, 'second card: 4 + row 2 + Might 2');
    const R = fight(['hanae_iai_draw'].concat(FILL)); R.endTurn(); t.ok(!!handOf(R, 'hanae_iai_draw'), 'it is back in hand next turn');
    const K = fight(['hanae_iai_draw'].concat(FILL)); K.endTurn(); t.ok(K.discard.every((c) => c.id !== 'hanae_iai_draw') || !!handOf(K, 'hanae_iai_draw'), 'retain kept it');
  });
  t.test('engine: Folding Screen blooms only in the back row', () => {
    const B = fight(['hanae_folding_screen'].concat(FILL), { back: true }); play(B, 'hanae_folding_screen'); t.eq(hanae(B).block, 5 + 1, 'Block 5 + 1 in the back'); t.eq(st(hanae(B), 'bloom'), 2, '2 Bloom');
    const F = fight(['hanae_folding_screen'].concat(FILL)); play(F, 'hanae_folding_screen'); t.eq(hanae(F).block, 5, 'Block 5 in front'); t.eq(st(hanae(F), 'bloom'), 0, 'no Bloom');
  });
  t.test('engine: Crescent Step steps forward and cuts, Hit and Vanish cuts and steps back', () => {
    const A = fight(['hanae_crescent_step'].concat(FILL), { back: true }); t.eq(dealt(A, 'hanae_crescent_step'), 5 + 2, 'from the back: swaps first, then cuts with +2'); t.eq(hanae(A).row, 'front', 'now in front'); t.eq(st(hanae(A), 'bloom'), 2, 'front rider + Blade Flow');
    const B = fight(['hanae_crescent_step'].concat(FILL)); t.eq(dealt(B, 'hanae_crescent_step'), 5 + 2, 'from the front: no swap, same cut'); t.eq(hanae(B).row, 'front', 'still in front'); t.eq(st(hanae(B), 'bloom'), 2, 'same Bloom');
    const C = fight(['hanae_hit_and_vanish'].concat(FILL)); C.energy = 3; t.eq(dealt(C, 'hanae_hit_and_vanish'), 6 + 2, 'cuts from the front first: 6 + 2'); t.eq(hanae(C).row, 'back', 'then steps out'); t.eq(ally(C).row, 'front', 'and her partner takes the front');
    C.heroes.forEach((h) => t.ok(h.block >= 3, h.id + ' gained Block ' + h.block));
    const D2 = fight(['hanae_hit_and_vanish'].concat(FILL), { back: true }); play(D2, 'hanae_hit_and_vanish'); t.eq(hanae(D2).row, 'front', 'from the back she ends in front'); t.eq(D2.heroes.reduce((s, h) => s + h.block, 0), 0, 'and nobody gains the back row Block');
  });
  t.test('engine: Waltz of Steps pays for a swap from either row, once a turn', () => {
    const C = fight(['hanae_waltz_of_steps'].concat(FILL)); C.energy = 5; play(C, 'hanae_waltz_of_steps'); t.eq(hanae(C).block, 0, 'the base card does nothing until a swap'); const b0 = st(hanae(C), 'bloom'), k0 = hanae(C).block;
    C.swap(); t.eq(st(hanae(C), 'bloom') - b0, 1, 'front to back: 1 Bloom'); t.eq(hanae(C).block - k0, 4, 'and 4 Block');
    C.swap(); t.eq(st(hanae(C), 'bloom') - b0, 1, 'the second swap this turn pays nothing (limit 1)');
    C.endTurn(); const b1 = st(hanae(C), 'bloom'); C.swap();
    t.eq(st(hanae(C), 'bloom') - b1, 1, 'next turn it pays again'); t.eq(hanae(C).block, 4, 'Block again');
    const U = fight([{ id: 'hanae_waltz_of_steps', up: 1 }].concat(FILL)); U.energy = 5; play(U, 'hanae_waltz_of_steps'); t.eq(hanae(U).block, 6, 'upgraded: the dance gives 6 Block at once'); const ub = st(hanae(U), 'bloom'); U.swap(); t.eq(st(hanae(U), 'bloom') - ub, 2, 'and 2 Bloom a swap');
  });
  t.test('engine: Petal Trail sheds petals on every enemy for each Attack, up to twice a turn', () => {
    const C = fight(['hanae_petal_trail', 'hanae_slash', 'hanae_slash', 'hanae_slash', 'hanae_slash'], { enemies: [DUMMY, DUMMY] }); C.energy = 5; play(C, 'hanae_petal_trail'); const b = C.enemies.map((e) => e.hp);
    play(C, 'hanae_slash'); t.eq(b[0] - C.enemies[0].hp + (b[1] - C.enemies[1].hp), 8 + 2 + 2, 'Slash 8 on one enemy, 2 petals on both');
    play(C, 'hanae_slash'); play(C, 'hanae_slash'); const total = (b[0] - C.enemies[0].hp) + (b[1] - C.enemies[1].hp);
    t.eq(total, 3 * 8 + 2 * 2 * 2, 'three Slashes, but petals only twice: 2 x 2 enemies x 2 dmg');
  });
  // a partner's own attack, taken from the partner's starter deck when that file exists (any hero id works: the check is a difference between two fights)
  const partnerAttack = ['kuro', 'suzu', 'raiga'].map((h) => ({ h, id: D.heroes[h].starter[0] })).find((x) => D.cards[x.id] && D.cards[x.id].type === 'attack');
  t.test('engine: Petal Trail and Petal Mark reward the partner\'s attacks too', () => {
    if (!partnerAttack) { console.log('  note: no partner attack card exists yet, partner checks skipped'); return; }
    const run = (extra, before) => {
      const C = fight([partnerAttack.id].concat(extra, FILL.slice(0, 3)), { partner: partnerAttack.h, enemies: [DUMMY, DUMMY] }); C.energy = 5;
      if (before) before.forEach((id) => play(C, id));
      const b = C.enemies.map((e) => e.hp); const c = handOf(C, partnerAttack.id);
      C.play(c.uid, C.needsTarget(c.uid) ? C.enemies[0].id : undefined); settle(C);
      return C.enemies.map((e, i) => b[i] - e.hp);
    };
    const base = run(['hanae_petal_trail'], null), withTrail = run(['hanae_petal_trail'], ['hanae_petal_trail']);
    t.eq(withTrail[0] - base[0], 2, 'Petal Trail: the partner\'s attack sheds 2 on the target'); t.eq(withTrail[1] - base[1], 2, 'and 2 on the other enemy');
    const baseM = run(['hanae_petal_mark'], null), withMark = run(['hanae_petal_mark'], ['hanae_petal_mark']);
    t.eq(withMark[0] - baseM[0], 3, 'Petal Mark: the partner\'s first hit carries +3');
  });
  t.test('engine: Whetstone upgrades a card in hand, Sakura Sort cycles a card', () => {
    const W = fight(['hanae_whetstone'].concat(FILL)); play(W, 'hanae_whetstone');
    t.ok(W.hand.some((c) => c.up), 'a card in hand was upgraded'); t.eq(st(hanae(W), 'bloom'), 2, 'and Hanae gained 2 Bloom');
    const S = fight(['hanae_sakura_sort'].concat(FILL, ['hanae_slash', 'hanae_slash', 'hanae_parry'])); ensureInHand(S, 'hanae_sakura_sort'); t.ok(S.draw.length >= 2, 'there is something to draw'); const h0 = S.hand.length; play(S, 'hanae_sakura_sort');
    t.eq(S.hand.length, h0 - 1 + 1 - 1, 'played 1, drew 1, discarded 1'); t.eq(S.energy, S.maxEnergy, 'and it is free'); t.eq(st(hanae(S), 'bloom'), 1, 'and it blooms');
  });
}

t.done();
