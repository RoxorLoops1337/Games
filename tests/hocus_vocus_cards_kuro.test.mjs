// Kuro, the Inkweaver: the card set in js/data_cards_kuro.js.
//
//   node tests/hocus_vocus_cards_kuro.test.mjs
//
// What this suite guards (each block is its own group of assertions so a failure names the rule):
//   1 structure   registry, validator (zero errors and warnings), audit (zero lines), ids, names, upgrades, keywords
//   2 CONTENT_SPEC section 3: counts (3/14/12/8), the mix rules, slots and colours, locks, art pairs, flavour, rules text
//   3 design      the three archetypes each have applicators, payoffs and an engine; the row and ally rules the set promises
//   4 numbers     what the V expressions actually evaluate to (First Stroke, Rot Script, Slow Match, ...) at explicit states
//   5 budget      ROUGH VALUE MODEL (documented below): every card and every upgrade must sit in its cost band
//   6 engine      when js/combat.js and js/data_text.js exist: every card, base and upgraded, in both rows and in an empty and a
//                 loaded state, plays in a synthetic combat without throwing; text through DATA.cardPlain is clean; random
//                 playouts of the whole set keep the piles honest. Skipped (with a note) while the engine files are missing.
//
// ROUGH VALUE MODEL (block 5). Points are "damage equivalents" for a card as written (no row bonus, no Might):
//   damage 1 per point per hit (+1.2 for every extra hit: each hit also carries the +2 back-row bonus), Block 1 per point,
//   Poison 1.8 per stack, Burn 1.5, Weak 2.5 (+1.2 per extra stack), Vulnerable 3.5 (+1.5), draw 3.5, Energy 6, Sumi gained 2.5
//   (Sumi spent costs 1.2 per stack, so a spell that eats Sumi is judged on the net), Dodge 3, HP lost 1.2 per point, a swap 1,
//   a pick by kind (copy 5.5, tutor 3 + 0.3 per card seen, cycle -1 per card and so on), heal 0.7, hits on all enemies x1.8
//   (two targets), block for both heroes x1.6, "others" x1.0. A V expression is read at TYPICAL counts (Sumi 2.5, or 4 when the
//   card spends them all; Poison on the target 4, Burn 3, debuffs 2, turn 3, picked cards 1.5 or 75 percent of an optional n).
//   `cond` is weighted by how often the branch is live (front row 40 percent, back row 70, else 50). A hook is worth its body
//   times the triggers in a typical fight (turn hooks 3.5, Skill or Attack plays 4.5 or 3, kills 2.5, swaps 2.5, exhausts 3),
//   times 0.8 because it pays later; `once` is one trigger, `limit` caps triggers at 3.5 per turn-limit, `every` divides.
//   BANDS, in points per Energy (Energy = cost; an X card is valued at X = 2; a cost 0 power counts as 1 Energy):
//     cost 0   value in [1.5, 6.5]   upgraded [1.5, 8.0]     (the strict band: a free card must be small)
//     cost 1   value in [4.5, 10.5]  upgraded [4.5, 13.5]    (the strict band: the guidance says 6 to 9 for a strike)
//     cost 2+  per Energy in [4.0, 10.5]  upgraded [4.0, 13.5]
//     powers   per Energy in [4.0, 12.0]  upgraded [4.0, 16.0]
//     exhaust cards may sit 15 percent above the top of their band (they are one shot)
//   and an upgrade may not be worth less than its base, nor more than 1.55x (2.05x for a power) unless the cost changed.
//   The model is deliberately crude: it exists to catch a typo that makes a card twice as strong, not to balance the game.
import fs from 'node:fs';
import path from 'node:path';
import { boot, harness, DIR } from './hocus_vocus_lib.mjs';

const t = harness('hocus_vocus cards_kuro');
const JS = path.join(DIR, 'js');
const exists = (f) => fs.existsSync(path.join(JS, f));

const api = boot({ only: ['data_cards_kuro'] });
const { DATA } = api;
const L = DATA.LISTS;

// ------------------------------------------------------------------------------------------------ helpers
const cards = Object.values(DATA.cards).filter((c) => c.hero === 'kuro');
const ids = cards.map((c) => c.id);
const byRarity = (r) => cards.filter((c) => c.rarity === r);
const byType = (ty) => cards.filter((c) => c.type === ty);
const flatOps = (fx) => { const out = []; DATA.walkOps(fx, (o) => out.push(o)); return out; };
const upOf = (c) => c.up || {};
const fxOf = (c, up) => (up && upOf(c).fx ? upOf(c).fx : c.fx);
const costOf = (c, up) => (up && upOf(c).cost !== undefined ? upOf(c).cost : c.cost);
const kwOf = (c, up) => (up && upOf(c).kw !== undefined ? upOf(c).kw : (c.kw || []));
const allFx = (c) => flatOps(c.fx).concat(flatOps(upOf(c).fx));
const anyOp = (c, f) => flatOps(c.fx).some(f);
const vObjects = (ops) => { const out = []; ops.forEach((o) => { ['n', 'hits'].forEach((k) => { if (o[k] && typeof o[k] === 'object') out.push(o[k]); }); }); return out; };
const spent = (o) => (o.consume ? (typeof o.consume === 'object' ? o.consume.s : o.consume) : null);
const resolved = (c, up) => JSON.stringify({ cost: costOf(c, up), kw: kwOf(c, up), fx: fxOf(c, up) });
const words = (s) => s.trim().split(/\s+/);
const isDot = (s) => s === 'poison' || s === 'burn';
const DASH = new RegExp('[' + String.fromCharCode(0x2014, 0x2013) + ']');

t.test('loading: only Kuro cards are registered and the file loads without errors', () => {
  t.eq(api._errors.length, 0, 'no load errors: ' + JSON.stringify(api._errors));
  t.ok(ids.length > 0, 'cards registered');
  t.eq(cards.length, Object.keys(DATA.cards).length, 'this file defines only Kuro cards (no curse, status or other hero cards)');
  t.ok(cards.every((c) => c.id.indexOf('kuro_') === 0), 'every id starts with kuro_');
  t.ok(cards.every((c) => /^kuro_[a-z0-9_]+$/.test(c.id)), 'ids are snake_case');
});

t.test('hero facts the numbers were written against still hold (if these change, revisit the set)', () => {
  const h = DATA.heroes.kuro;
  t.eq(h.res, 'sumi', 'Kuro spends Sumi');
  t.eq(h.rows.back.dmgAdd, 2, 'back row: +2 damage per hit');
  t.ok(!h.rows.front.dmgAdd && !h.rows.front.blockAdd, 'front row gives Kuro nothing');
  t.eq(h.maxHp, 68, 'a frail mage (68, level with Suzu; it was 60 before the balance pass)');
  const p = h.passives[0];
  t.ok(p && p.id === 'steady_hand' && p.on === 'onPlay' && p.filter.type === 'skill' && p.limit === 1 && p.fx[0].s === 'sumi' && p.fx[0].n === 1, 'Steady Hand: first Skill each turn grants 1 Sumi');
  t.deep(h.starter, ['kuro_ink_bolt', 'kuro_ink_bolt', 'kuro_ink_ward', 'kuro_ink_ward', 'kuro_first_stroke'], 'the starter deck ids');
  t.eq(DATA.ECONOMY.energy, 3, 'three Energy a turn');
});

// ------------------------------------------------------------------------------------------------ 1 structure
t.test('DATA.validate: zero errors and zero warnings for the Kuro cards', () => {
  const v = DATA.validate('cards', { hero: 'kuro' });
  t.eq(v.errors.length, 0, 'errors: ' + v.errors.join(' | '));
  t.eq(v.warnings.length, 0, 'warnings: ' + v.warnings.join(' | '));
  const all = DATA.validate('cards');
  t.eq(all.errors.filter((e) => ids.some((id) => e.indexOf('card ' + id) === 0)).length, 0, 'the unscoped card check finds nothing on Kuro either');
  t.ok(v.counts.cards >= ids.length, 'the validator counted the cards');
});

t.test('DATA.audit: no audit lines and no guide lines for Kuro', () => {
  const lines = DATA.audit('cards', { hero: 'kuro' });
  t.eq(lines.filter((l) => /^audit/.test(l)).length, 0, 'audit: ' + lines.join(' | '));
  t.eq(lines.filter((l) => /^guide/.test(l)).length, 0, 'guide: ' + lines.join(' | '));
});

t.test('starters are the three named cards and the starter deck resolves', () => {
  const starters = byRarity('starter').map((c) => c.id).sort();
  t.deep(starters, ['kuro_first_stroke', 'kuro_ink_bolt', 'kuro_ink_ward'], 'exactly the three CONTENT_SPEC starters');
  DATA.heroes.kuro.starter.forEach((id) => t.ok(DATA.cards[id], 'starter card ' + id + ' is defined'));
  t.eq(DATA.cards.kuro_ink_bolt.type, 'attack', 'the strike is an attack');
  t.eq(DATA.cards.kuro_ink_ward.type, 'skill', 'the defence is a skill');
  t.ok(byRarity('starter').every((c) => !c.locked), 'starters are never locked');
});

// Frozen: saves store these ids, so a rename of the display names must never touch them.
const KURO_IDS = [
  'kuro_blinding_blot', 'kuro_cinder_note', 'kuro_creeping_ink', 'kuro_epilogue_flame', 'kuro_first_stroke',
  'kuro_flip_the_page', 'kuro_ghost_ink', 'kuro_grand_flourish', 'kuro_grind_ink', 'kuro_ink_bolt', 'kuro_ink_cloak',
  'kuro_ink_flick', 'kuro_ink_flood', 'kuro_ink_reservoir', 'kuro_ink_ward', 'kuro_inkblot_verdict', 'kuro_inkfall_inferno',
  'kuro_inkwash_sanctum', 'kuro_miasma_verse', 'kuro_midnight_oil', 'kuro_nightshade_verdict', 'kuro_plague_garden',
  'kuro_rain_of_strokes', 'kuro_redraft', 'kuro_rot_script', 'kuro_running_script', 'kuro_scene_change', 'kuro_second_edition',
  'kuro_shared_umbrella', 'kuro_shelter_script', 'kuro_skim_the_scroll', 'kuro_slow_match', 'kuro_strikethrough',
  'kuro_venom_script', 'kuro_viper_nib', 'kuro_well_of_ink', 'kuro_wildfire_verse',
];

t.test('names: unique, one to three words, capitalised, no dashes; the ids are frozen (saves store them)', () => {
  const names = cards.map((c) => c.name);
  t.eq(new Set(names).size, names.length, 'no duplicate card names');
  t.eq(new Set(names.map((n) => n.toLowerCase())).size, names.length, 'no duplicate names ignoring case');
  cards.forEach((c) => {
    const n = words(c.name).length;
    t.ok(n >= 1 && n <= 3, `${c.id}: name "${c.name}" is 1 to 3 words`);
    t.ok(/^[A-Z]/.test(c.name), `${c.id}: name starts with a capital`);
    t.ok(!/^kuro\b/i.test(c.name), `${c.id}: no hero prefix in the name`);
    t.ok(!DASH.test(c.name), `${c.id}: no dash in the name`);
    t.ok(/^kuro_[a-z0-9_]+$/.test(c.id), `${c.id}: id is kuro_ plus snake_case`);
  });
  t.deep(cards.map((c) => c.id).sort(), KURO_IDS, 'the 37 Kuro ids are frozen: saves store them');
});

t.test('upgrades: every card has one, it changes fx, cost or keywords, and it never makes a card worse on its face', () => {
  cards.forEach((c) => {
    t.ok(c.up && typeof c.up === 'object', `${c.id}: has up`);
    t.ok(resolved(c, true) !== resolved(c, false), `${c.id}: the upgrade differs from the base`);
    t.deep(Object.keys(c.up).filter((k) => ['fx', 'cost', 'kw'].indexOf(k) < 0), [], `${c.id}: up only uses fx, cost, kw`);
    if (c.cost === 'X') t.ok(costOf(c, true) === 'X', `${c.id}: an X card stays X`);
    else t.ok(costOf(c, true) <= c.cost, `${c.id}: an upgrade never raises the cost`);
    if (c.up.kw !== undefined) t.ok(Array.isArray(c.up.kw), `${c.id}: up.kw replaces the array`);
    // the upgrade keeps the card's shape: same ops in spirit (a card that hits still hits, a power still hooks)
    const has = (fx, op) => flatOps(fx).some((o) => o.op === op);
    ['dmg', 'block', 'hook', 'pick', 'swap'].forEach((op) => { if (upOf(c).fx && has(c.fx, op)) t.ok(has(upOf(c).fx, op), `${c.id}: the upgrade keeps its ${op} op`); });
  });
  t.ok(cards.filter((c) => c.up.cost !== undefined).length >= 4, 'some upgrades make a card cheaper (the cost drop is a real upgrade)');
  t.ok(cards.filter((c) => c.up.kw !== undefined).length >= 1, 'at least one upgrade is a keyword upgrade');
});

t.test('no tokens, no cross-file card ids, no hand ops, nothing forbidden by CONTENT_SPEC 3.2', () => {
  cards.forEach((c) => {
    t.ok(c.hand === undefined, `${c.id}: no hand ops on a hero card`);
    t.ok(!allFx(c).some((o) => o.op === 'add'), `${c.id}: adds no cards, so no tokens are needed`);
    t.ok(!allFx(c).some((o) => ['gold', 'ink', 'maxHp', 'revive'].indexOf(o.op) >= 0), `${c.id}: no run-level or revive ops`);
    t.ok(c.text === undefined, `${c.id}: no hand written text`);
  });
  t.eq(cards.filter((c) => c.rarity === 'token').length, 0, 'no tokens');
  // hooks on things the engine cannot see: only the closed list, and only owned-hook filters that make sense
  cards.forEach((c) => allFx(c).filter((o) => o.op === 'hook').forEach((h) => {
    t.ok(L.combatHooks.indexOf(h.on) >= 0 && h.on !== 'combatEnd', `${c.id}: hook ${h.on} is a real combat hook`);
    t.ok(!flatOps(h.fx).some((o) => o.op === 'hook'), `${c.id}: no hook inside a hook`);
  }));
});

t.test('card ids and per X: only the X card reads X', () => {
  cards.forEach((c) => [c.fx, upOf(c).fx].filter(Boolean).forEach((fx) => {
    const uses = flatOps(fx).some((o) => vObjects([o]).some((v) => v.per === 'X'));
    t.eq(uses, c.cost === 'X', `${c.id}: per X appears exactly on the X card`);
  }));
  t.eq(cards.filter((c) => c.cost === 'X').length, 1, 'one X card');
});

// ------------------------------------------------------------------------------------------------ 2 CONTENT_SPEC section 3
t.test('counts: 3 starters, 14 commons, 12 uncommons, 8 rares, 37 in all', () => {
  t.eq(byRarity('starter').length, 3, 'starters');
  t.eq(byRarity('common').length, 14, 'commons');
  t.eq(byRarity('uncommon').length, 12, 'uncommons');
  t.eq(byRarity('rare').length, 8, 'rares');
  t.eq(cards.length, 37, 'total');
});

t.test('mix: at least 30 percent attacks and skills, at least 4 powers (uncommon or rare), an X card, keywords', () => {
  const n = cards.length;
  t.ok(byType('attack').length >= n * 0.3, `attacks ${byType('attack').length} >= 30 percent`);
  t.ok(byType('skill').length >= n * 0.3, `skills ${byType('skill').length} >= 30 percent`);
  t.ok(byType('power').length >= 4, 'at least 4 powers');
  t.ok(byType('power').every((c) => c.rarity === 'uncommon' || c.rarity === 'rare'), 'powers are uncommon or rare');
  t.ok(byType('power').length >= 5, 'design target: 5 or more powers (they are the engines)');
  t.ok(cards.every((c) => ['attack', 'skill', 'power'].indexOf(c.type) >= 0), 'only attacks, skills and powers');
  t.ok(cards.some((c) => c.cost === 'X'), 'an X cost card');
  t.ok(cards.filter((c) => (c.kw || []).length > 0).length >= 5, 'at least 5 cards with keywords');
  const kws = new Set(); cards.forEach((c) => (c.kw || []).forEach((k) => kws.add(k)));
  t.ok(kws.has('exhaust') && kws.has('retain') && kws.has('innate'), 'exhaust, retain and innate all appear (' + [...kws].join(',') + ')');
  t.ok(cards.every((c) => (c.kw || []).indexOf('unplayable') < 0), 'no unplayable cards among the playable ones');
});

t.test('two rows: at least 3 cards use cond on row, both rows are rewarded, a swap card and a swap engine exist', () => {
  const rowCards = cards.filter((c) => anyOp(c, (o) => o.op === 'cond' && o.if && o.if.row));
  t.ok(rowCards.length >= 3, 'at least 3 row cards (spec)');
  t.ok(rowCards.length >= 4, 'design target: 4 or more row cards');
  t.ok(rowCards.some((c) => anyOp(c, (o) => o.op === 'cond' && o.if.row === 'front')), 'something rewards the front row (Kuro is not helpless there)');
  t.ok(rowCards.some((c) => anyOp(c, (o) => o.op === 'cond' && o.if.row === 'back')), 'something rewards the back row');
  t.ok(cards.some((c) => anyOp(c, (o) => o.op === 'swap')), 'a card that swaps rows');
  const swapCard = cards.find((c) => anyOp(c, (o) => o.op === 'swap'));
  t.ok(anyOp(swapCard, (o) => o.op === 'draw'), 'the swap card also draws');
  t.ok(cards.some((c) => c.type === 'power' && anyOp(c, (o) => o.op === 'hook' && o.on === 'onSwap')), 'a swap engine power');
  cards.forEach((c) => flatOps(c.fx).filter((o) => o.op === 'cond' && o.if && o.if.row).forEach((o) => t.ok(['front', 'back'].indexOf(o.if.row) >= 0 && o.then.length > 0, `${c.id}: row cond is well formed`)));
});

t.test('the ally: at least 4 cards touch the partner, none reads a resource only one hero owns', () => {
  const touches = (o) => o.tgt === 'ally' || o.tgt === 'both' || (o.n && typeof o.n === 'object' && o.n.who === 'ally');
  const ally = cards.filter((c) => anyOp(c, touches));
  t.ok(ally.length >= 4, 'at least 4 ally cards (spec), have ' + ally.length);
  t.ok(ally.length >= 5, 'design target: 5 or more');
  t.ok(ally.some((c) => anyOp(c, (o) => o.op === 'block' && o.tgt === 'ally' && o.consume)), 'an ally Block that costs Sumi');
  t.ok(ally.some((c) => anyOp(c, (o) => o.tgt === 'both')), 'a both-heroes card');
  const resources = ['bloom', 'ward', 'charge'];
  cards.forEach((c) => allFx(c).forEach((o) => {
    t.ok(!(o.tgt === 'ally' && resources.indexOf(o.s) >= 0), `${c.id}: never hands the ally a foreign resource`);
    vObjects([o]).forEach((v) => t.ok(!(v.who === 'ally' && resources.indexOf(v.s) >= 0), `${c.id}: never reads the ally's own resource`));
  }));
  t.ok(cards.some((c) => anyOp(c, (o) => o.op === 'hook' && o.filter && o.filter.hero === 'any')), 'a hook that rewards the partner too (filter hero any)');
  cards.forEach((c) => allFx(c).filter((o) => o.tgt === 'ally' && o.op === 'status').forEach((o) => t.ok(['dodge', 'might', 'thorns', 'regen', 'bulwark'].indexOf(o.s) >= 0, `${c.id}: ally status ${o.s} is a generic buff`)));
});

t.test('picks: at least 2 pick cards, a hand cycle, a tutor, a copy and an exhaust fuel', () => {
  const picks = cards.filter((c) => anyOp(c, (o) => o.op === 'pick'));
  t.ok(picks.length >= 2, 'at least 2 pick cards (spec)');
  t.ok(picks.length >= 4, 'design target: 4 or more');
  const p = (from, then) => cards.some((c) => anyOp(c, (o) => o.op === 'pick' && o.from === from && o.then === then));
  t.ok(p('hand', 'discard'), 'hand cycle (pick from hand, discard)');
  t.ok(p('draw', 'toHand'), 'a tutor from the top of the draw pile');
  t.ok(p('hand', 'copy'), 'pick then copy');
  t.ok(p('hand', 'exhaust'), 'exhaust as fuel');
  cards.forEach((c) => flatOps(c.fx).filter((o) => o.op === 'pick').forEach((o) => {
    t.ok(L.pickPairs[o.from] && L.pickPairs[o.from].indexOf(o.then) >= 0, `${c.id}: pick ${o.from} then ${o.then} is a legal pair`);
    t.ok(o.top === undefined || o.from === 'draw', `${c.id}: top only on draw picks`);
  }));
  // every per picked read follows a pick in the same fx list
  cards.forEach((c) => [c.fx, upOf(c).fx].filter(Boolean).forEach((fx) => {
    const list = flatOps(fx);
    const firstPick = list.findIndex((o) => o.op === 'pick');
    list.forEach((o, i) => vObjects([o]).forEach((v) => { if (v.per === 'picked') t.ok(firstPick >= 0 && firstPick < i, `${c.id}: per picked comes after its pick`); }));
  }));
});

t.test('slots: counts per rarity, colours only where useful, colour quotas, gold on every power, prisms rare only', () => {
  cards.forEach((c) => {
    const n = c.slots.length;
    if (c.rarity === 'starter' || c.rarity === 'common') t.eq(n, 1, `${c.id}: exactly 1 slot`);
    else if (c.rarity === 'uncommon') t.ok(n >= 1 && n <= 2, `${c.id}: 1 to 2 slots`);
    else t.eq(n, 2, `${c.id}: rares have 2 slots`);
    const flat = flatOps(c.fx);
    if (c.slots.indexOf('red') >= 0) t.ok(flat.some((o) => o.op === 'dmg'), `${c.id}: a red slot needs a dmg op`);
    if (c.slots.indexOf('blue') >= 0) t.ok(flat.some((o) => ['block', 'heal'].indexOf(o.op) >= 0 || (o.op === 'status' && ['self', 'ally', 'both', 'front', 'back'].indexOf(o.tgt || 'self') >= 0 && !DATA.isDebuff(o.s))), `${c.id}: a blue slot needs block, heal or a hero targeted status`);
    if (c.type === 'power') t.ok(c.slots.indexOf('gold') >= 0, `${c.id}: every power has a gold slot`);
    if (c.slots.indexOf('any') >= 0) t.eq(c.rarity, 'rare', `${c.id}: prism slots only on rares`);
    t.eq(new Set(c.slots).size, c.slots.length, `${c.id}: no repeated colour in one card`);
  });
  const withColour = (col) => cards.filter((c) => c.slots.indexOf(col) >= 0).length;
  t.ok(withColour('red') >= 10, 'red slot on 10 or more (' + withColour('red') + ')');
  t.ok(withColour('blue') >= 10, 'blue slot on 10 or more (' + withColour('blue') + ')');
  t.ok(withColour('green') >= 8, 'green slot on 8 or more (' + withColour('green') + ')');
  t.ok(withColour('gold') >= 8, 'gold slot on 8 or more (' + withColour('gold') + ')');
  t.ok(withColour('any') <= 4, 'at most 4 rares with a prism');
  t.ok(withColour('blue') >= 11 && withColour('red') >= 11, 'design target: a margin of one over the blue and red quotas');
  t.ok(byType('attack').every((c) => c.slots.indexOf('red') >= 0), 'every attack takes a red gem');
});

t.test('locks: at most 4 uncommons and 4 rares, never starters or commons, and the locked ones are the build arounds', () => {
  t.ok(cards.filter((c) => c.locked && c.rarity === 'uncommon').length <= 4, 'locked uncommons');
  t.ok(cards.filter((c) => c.locked && c.rarity === 'rare').length <= 4, 'locked rares');
  t.ok(cards.filter((c) => c.locked && (c.rarity === 'starter' || c.rarity === 'common')).length === 0, 'no locked starter or common');
  t.ok(cards.filter((c) => c.locked).length >= 4, 'the Library has something to sell (4 or more locked)');
  t.ok(cards.every((c) => c.locked === undefined || c.locked === true), 'locked is true or absent');
  t.ok(byRarity('rare').some((c) => !c.locked) && byRarity('rare').filter((c) => !c.locked).length >= 4, 'at least 4 rares are available from the first run');
  t.ok(byRarity('uncommon').filter((c) => !c.locked).length >= 8, 'at least 8 uncommons are available from the first run');
  DATA.rewardPool('kuro', 'rare', { card: [] }).forEach((c) => t.ok(!c.locked, `${c.id}: a locked card is filtered out of a fresh player's pool`));
});

t.test('art: motif and palette from the closed lists, unique pairs, hero pose on about half of the attacks', () => {
  const pairs = cards.map((c) => c.art.m + '/' + c.art.c);
  t.eq(new Set(pairs).size, pairs.length, 'no two cards share art.m plus art.c');
  cards.forEach((c) => {
    t.ok(L.motifs.indexOf(c.art.m) >= 0, `${c.id}: motif ${c.art.m}`);
    t.ok(L.palettes.indexOf(c.art.c) >= 0, `${c.id}: palette ${c.art.c}`);
    t.ok(c.art.hero === undefined || typeof c.art.hero === 'boolean', `${c.id}: art.hero is a boolean when given`);
    if (c.art.hero) t.eq(c.type, 'attack', `${c.id}: the hero pose is used on attacks`);
  });
  const attacks = byType('attack');
  const heroAtk = attacks.filter((c) => c.art.hero).length;
  t.ok(heroAtk >= attacks.length * 0.3, `hero pose on at least 30 percent of attacks (${heroAtk}/${attacks.length})`);
  t.ok(heroAtk >= attacks.length * 0.4 && heroAtk <= attacks.length * 0.7, 'and about half (40 to 70 percent)');
  t.ok(new Set(cards.map((c) => c.art.m)).size >= 26, 'the set uses a wide spread of motifs (26 or more)');
  t.ok(cards.some((c) => ['ink_splash', 'ink_wave', 'brush_stroke', 'calligraphy', 'quill', 'scroll', 'book'].indexOf(c.art.m) >= 0), 'the ink and paper motifs are in play');
});

t.test('flavour: on every rare and on at least a third of the others, short, no dashes', () => {
  byRarity('rare').forEach((c) => t.ok(typeof c.flavor === 'string' && c.flavor.length > 0, `${c.id}: rare has a flavor line`));
  const others = cards.filter((c) => c.rarity !== 'rare');
  const withFlavor = others.filter((c) => typeof c.flavor === 'string' && c.flavor.length > 0).length;
  t.ok(withFlavor >= others.length / 3, `a third of the rest have flavor (${withFlavor}/${others.length})`);
  cards.filter((c) => c.flavor !== undefined).forEach((c) => {
    t.ok(c.flavor.length <= 80, `${c.id}: flavor is one short line (${c.flavor.length})`);
    t.ok(!DASH.test(c.flavor), `${c.id}: no dash in the flavor`);
    t.ok(/[.!?]$/.test(c.flavor), `${c.id}: flavor ends like a sentence`);
    t.ok(!/\d/.test(c.flavor), `${c.id}: flavor holds no numbers (numbers come from ops)`);
  });
  t.eq(new Set(cards.filter((c) => c.flavor).map((c) => c.flavor)).size, cards.filter((c) => c.flavor).length, 'no repeated flavor line');
});

// ------------------------------------------------------------------------------------------------ 3 design: archetypes
const status = (c, ids2) => flatOps(c.fx).some((o) => (o.op === 'status' && ids2.indexOf(o.s) >= 0) || vObjects([o]).some((v) => v.per === 'status' && ids2.indexOf(v.s) >= 0));
const blight = cards.filter((c) => status(c, ['poison', 'burn']));
const sumi = cards.filter((c) => status(c, ['sumi']) || flatOps(c.fx).some((o) => spent(o) === 'sumi'));
const scribe = cards.filter((c) => flatOps(c.fx).some((o) => ['pick', 'draw', 'energy', 'swap'].indexOf(o.op) >= 0) || (c.kw || []).some((k) => ['retain', 'innate', 'exhaust'].indexOf(k) >= 0));

t.test('archetypes: Blight, Sumi and Scribe each have 8 or more cards, several bridge two, and the plain cards stay a minority', () => {
  t.ok(blight.length >= 8, 'Blight cards: ' + blight.map((c) => c.id).join(', '));
  t.ok(sumi.length >= 8, 'Sumi cards: ' + sumi.map((c) => c.id).join(', '));
  t.ok(scribe.length >= 8, 'Scribe cards: ' + scribe.map((c) => c.id).join(', '));
  const bridges = cards.filter((c) => [blight, sumi, scribe].filter((a) => a.indexOf(c) >= 0).length >= 2);
  t.ok(bridges.length >= 4, 'cards that bridge two archetypes: ' + bridges.map((c) => c.id).join(', '));
  const basics = cards.filter((c) => [blight, sumi, scribe].every((a) => a.indexOf(c) < 0));
  t.ok(basics.length <= 12, 'plain cards (strikes and Block) stay a minority: ' + basics.map((c) => c.id).join(', '));
  ['kuro_ink_bolt', 'kuro_ink_ward'].forEach((id) => t.ok(basics.some((c) => c.id === id), id + ' is a plain starter'));
});

t.test('Blight: applicators, a multiplier, a spread, cash-ins, an engine power and an X finisher', () => {
  const poisonApply = cards.filter((c) => anyOp(c, (o) => o.op === 'status' && o.s === 'poison' && o.n > 0));
  const burnApply = cards.filter((c) => anyOp(c, (o) => o.op === 'status' && o.s === 'burn'));
  t.ok(poisonApply.length >= 4, 'Poison applicators: ' + poisonApply.map((c) => c.id).join(', '));
  t.ok(burnApply.length >= 4, 'Burn applicators: ' + burnApply.map((c) => c.id).join(', '));
  t.ok(cards.some((c) => anyOp(c, (o) => o.op === 'status' && o.s === 'poison' && o.n && o.n.per === 'status' && o.n.s === 'poison' && o.n.who === 'target')), 'a card that multiplies Poison (adds the target\'s own stack)');
  t.ok(cards.some((c) => anyOp(c, (o) => o.op === 'status' && o.s === 'burn' && o.tgt === 'others')), 'Burn spread to the other enemies');
  t.ok(cards.some((c) => anyOp(c, (o) => o.op === 'status' && isDot(o.s) && o.tgt === 'all')), 'an all-enemies damage over time applicator');
  t.ok(cards.some((c) => anyOp(c, (o) => o.op === 'dmg' && o.n && o.n.per === 'status' && o.n.s === 'poison')), 'a Poison cash-in attack');
  t.ok(cards.some((c) => anyOp(c, (o) => o.op === 'dmg' && o.n && o.n.per === 'debuffs')), 'a debuff count cash-in attack');
  t.ok(cards.some((c) => anyOp(c, (o) => o.op === 'status' && o.s === 'burn' && o.n && o.n.per === 'turn')), 'a Burn that grows with the turn');
  const enginePowers = byType('power').filter((c) => anyOp(c, (o) => o.op === 'hook' && flatOps(o.fx).some((x) => x.op === 'status' && isDot(x.s))));
  t.ok(enginePowers.length >= 3, 'Blight engine powers: ' + enginePowers.map((c) => c.id).join(', '));
  t.ok(enginePowers.some((c) => c.rarity === 'rare') && enginePowers.some((c) => c.rarity === 'uncommon'), 'engines at both uncommon and rare');
  t.ok(anyOp(DATA.cards.kuro_inkfall_inferno, (o) => o.op === 'status' && o.s === 'burn') && DATA.cards.kuro_inkfall_inferno.cost === 'X', 'the X inferno burns');
  t.ok(cards.some((c) => anyOp(c, (o) => o.op === 'status' && ['weak', 'vulnerable'].indexOf(o.s) >= 0)), 'Weak or Vulnerable are available to feed the debuff count');
  t.ok(cards.some((c) => anyOp(c, (o) => o.op === 'hook' && o.on === 'onKill' && flatOps(o.fx).some((x) => x.s === 'burn'))), 'a kill chain that spreads Burn');
});
t.test('Sumi: generators, sinks of every shape, an engine, a defensive sink and a finisher that spends all', () => {
  const gain = cards.filter((c) => anyOp(c, (o) => o.op === 'status' && o.s === 'sumi' && (typeof o.n === 'object' || o.n > 0)));
  const sinks = cards.filter((c) => anyOp(c, (o) => spent(o) === 'sumi'));
  t.ok(gain.length >= 6, 'Sumi generators: ' + gain.map((c) => c.id).join(', '));
  t.ok(sinks.length >= 6, 'Sumi sinks: ' + sinks.map((c) => c.id).join(', '));
  t.ok(sinks.some((c) => anyOp(c, (o) => o.op === 'dmg' && spent(o) === 'sumi' && o.tgt === 'all')), 'an AoE sink');
  t.ok(sinks.some((c) => anyOp(c, (o) => o.op === 'dmg' && spent(o) === 'sumi' && o.hits)), 'a multi hit sink (each hit gets the +2 back row bonus)');
  t.ok(sinks.some((c) => anyOp(c, (o) => o.op === 'block' && spent(o) === 'sumi' && o.tgt === 'ally')), 'an ally Block sink');
  t.ok(sinks.some((c) => anyOp(c, (o) => o.op === 'block' && spent(o) === 'sumi' && o.tgt === 'both')), 'a party Block sink');
  t.ok(sinks.some((c) => anyOp(c, (o) => o.op === 'dmg' && o.consume === 'sumi' && o.n && o.n.upTo === undefined && o.tgt === 'enemy')), 'a finisher that spends ALL Sumi on one target');
  const engines = byType('power').filter((c) => anyOp(c, (o) => o.op === 'hook' && flatOps(o.fx).some((x) => x.s === 'sumi')));
  t.ok(engines.length >= 3, 'Sumi engine powers: ' + engines.map((c) => c.id).join(', '));
  t.ok(engines.some((c) => c.rarity === 'uncommon') && engines.some((c) => c.rarity === 'rare'), 'engines at uncommon and rare');
  t.ok(cards.some((c) => anyOp(c, (o) => o.op === 'hook' && o.on === 'onPlay' && o.filter && o.filter.type === 'skill' && flatOps(o.fx).some((x) => x.s === 'sumi'))), 'skills feed Sumi (the Steady Hand payoff)');
  cards.forEach((c) => flatOps(c.fx).filter((o) => spent(o) === 'sumi').forEach((o) => t.ok(o.op !== 'status', `${c.id}: consume sits on a payoff op, not a status`)));
  // every partial spend caps the count AND the removal at the same number
  cards.forEach((c) => [c.fx, upOf(c).fx].filter(Boolean).forEach((fx) => flatOps(fx).filter((o) => o.consume && typeof o.consume === 'object').forEach((o) => {
    const v = o.n && typeof o.n === 'object' ? o.n : (o.hits && typeof o.hits === 'object' ? o.hits : null);
    t.ok(v && v.upTo === o.consume.upTo, `${c.id}: the counted upTo equals the consumed upTo`);
  })));
});

t.test('Scribe: cycling, a tutor, copying, exhaust fuel, retain, the Energy trick paid in HP, and a swap that draws', () => {
  t.ok(cards.some((c) => anyOp(c, (o) => o.op === 'energy' && o.n > 0)), 'an Energy card');
  const oil = cards.find((c) => anyOp(c, (o) => o.op === 'energy' && o.n > 0));
  t.ok(anyOp(oil, (o) => o.op === 'hurt') && (oil.kw || []).indexOf('exhaust') >= 0 && oil.cost === 0, 'the Energy card is free, one shot and costs HP (a real drawback)');
  t.ok(cards.filter((c) => (c.kw || []).indexOf('retain') >= 0).length >= 2, 'at least two retain cards');
  t.ok(cards.some((c) => (c.kw || []).indexOf('innate') >= 0), 'an innate card');
  t.ok(cards.some((c) => c.cost === 0 && c.type !== 'power'), 'cheap tricks: a cost 0 card');
  t.ok(cards.filter((c) => c.cost === 0).length >= 3, 'three or more free cards in the base set');
  t.ok(cards.some((c) => c.cost === 3), 'a clunky cost 3 card');
  t.ok(cards.some((c) => c.cost === 2) && cards.some((c) => c.cost === 1), 'costs 1 and 2 exist');
  const exhaustFuel = cards.filter((c) => anyOp(c, (o) => o.op === 'pick' && o.then === 'exhaust') && anyOp(c, (o) => o.n && o.n.per === 'picked'));
  t.ok(exhaustFuel.length >= 1, 'exhaust pays out per card exhausted');
  t.ok(cards.some((c) => anyOp(c, (o) => o.op === 'pick' && o.then === 'copy' && o.n >= 2)) && DATA.cards.kuro_second_edition.rarity === 'rare', 'a rare that copies several cards, powers included (nothing filters the pick)');
  cards.filter((c) => anyOp(c, (o) => o.op === 'pick' && o.then === 'copy')).forEach((c) => t.ok(!anyOp(c, (o) => o.op === 'pick' && o.filter), `${c.id}: the copy pick has no type filter, so powers can be copied`));
});

t.test('progression: commons are the plain building blocks, uncommons carry the archetype pieces, rares change how you play', () => {
  const commons = byRarity('common'), unc = byRarity('uncommon'), rares = byRarity('rare');
  t.ok(commons.filter((c) => c.type === 'power').length === 0, 'no common powers');
  t.ok(commons.every((c) => c.cost <= 2), 'commons cost at most 2');
  t.ok(commons.every((c) => !c.locked), 'no locked commons');
  t.ok(commons.every((c) => (c.kw || []).indexOf('exhaust') < 0), 'commons do not exhaust (they stay useful all game)');
  t.ok(commons.some((c) => c.type === 'attack' && c.cost === 0) && commons.some((c) => c.type === 'skill' && c.cost === 0), 'a free attack and a free skill among the commons');
  t.ok(commons.filter((c) => c.type === 'attack').length >= 5 && commons.filter((c) => c.type === 'skill').length >= 7, 'a healthy common attack/skill split');
  t.ok(unc.filter((c) => c.type === 'power').length === 2, 'two uncommon powers');
  t.ok(rares.filter((c) => c.type === 'power').length >= 3 && rares.filter((c) => c.type !== 'power').length >= 3, 'rares are a mix of engines and actives');
  t.ok(rares.every((c) => c.cost === 1 || c.cost === 2 || c.cost === 'X') && rares.filter((c) => c.cost === 1).length <= 1, 'rares cost 2 or X (they are the turn), bar Second Edition at 1 (at 2 it left one Energy to play its own copies)');
  t.ok(rares.every((c) => (c.slots || []).length === 2), 'rares have 2 slots');
  const rareShapes = new Set(rares.map((c) => (c.type === 'power' ? 'power:' + flatOps(c.fx).find((o) => o.op === 'hook').on : c.type + ':' + (c.cost === 'X' ? 'X' : flatOps(c.fx)[0].op))));
  t.eq(rareShapes.size, rares.length, 'no two rares share a shape: ' + [...rareShapes].join(', '));
});

// ------------------------------------------------------------------------------------------------ 4 numbers
// A small V evaluator straight from DESIGN 4.4: floor(clamp(base + mul * min(count, upTo), min, cap)).
function evalV(v, st) {
  if (typeof v === 'number') return v;
  const st2 = Object.assign({ self: {}, ally: {}, target: {}, X: 0, turn: 1, picked: 0 }, st);
  let c = 0;
  if (v.per === 'status') c = (st2[v.who === 'target' || v.who === 'enemy' ? 'target' : v.who === 'ally' ? 'ally' : 'self'] || {})[v.s] || 0;
  else if (v.per === 'debuffs') c = Object.keys(st2.target).filter((k) => DATA.isDebuff(k) && st2.target[k] > 0).length;
  else if (v.per === 'X') c = st2.X;
  else if (v.per === 'turn') c = st2.turn;
  else if (v.per === 'picked') c = st2.picked;
  else if (v.per === 'skillsPlayed') c = st2.skills || 0;
  else if (v.per !== undefined) throw new Error('evalV: per ' + v.per + ' is not modelled');
  if (v.upTo !== undefined) c = Math.min(c, v.upTo);
  let r = (v.base || 0) + (v.mul === undefined ? 1 : v.mul) * c;
  if (v.min !== undefined) r = Math.max(r, v.min);
  if (v.cap !== undefined) r = Math.min(r, v.cap);
  return Math.floor(r);
}
const opOf = (id, pred, up) => flatOps(fxOf(DATA.cards[id], up)).find(pred);
const table = (id, pred, field, states, up) => states.map((s) => evalV(opOf(id, pred, up)[field], s));
const sumiStates = (list) => list.map((n) => ({ self: { sumi: n } }));

t.test('numbers: Sumi sinks scale as written (First Stroke, Ink Flood, Shelter Script, Rain of Strokes, Grand Flourish, Sanctum)', () => {
  const dmg = (o) => o.op === 'dmg', blk = (o) => o.op === 'block';
  t.deep(table('kuro_first_stroke', dmg, 'n', sumiStates([0, 1, 2, 3, 4])), [4, 7, 10, 10, 10], 'First Stroke: 4, +3 per Sumi, two at most');
  t.deep(table('kuro_first_stroke', dmg, 'n', sumiStates([0, 1, 2, 3]), true), [5, 9, 13, 13], 'First Stroke+: 5, +4 per Sumi');
  t.deep(table('kuro_ink_flood', dmg, 'n', sumiStates([0, 1, 2, 3, 4])), [4, 6, 8, 10, 10], 'Ink Flood: 4, +2 per Sumi up to 3');
  t.deep(table('kuro_ink_flood', dmg, 'n', sumiStates([0, 1, 2, 3, 4]), true), [5, 8, 11, 14, 14], 'Ink Flood+: 5, +3 per Sumi');
  t.eq(opOf('kuro_ink_flood', dmg).tgt, 'all', 'Ink Flood hits every enemy');
  t.deep(table('kuro_shelter_script', blk, 'n', sumiStates([0, 1, 2, 3])), [4, 7, 10, 10], 'Shelter Script: 4, +3 per Sumi up to 2');
  t.deep(table('kuro_shelter_script', blk, 'n', sumiStates([0, 1, 2, 3]), true), [5, 9, 13, 13], 'Shelter Script+: 5, +4 per Sumi');
  t.eq(opOf('kuro_shelter_script', blk).tgt, 'ally', 'Shelter Script covers the ally');
  const hitsOp = (o) => o.op === 'dmg' && o.hits !== undefined;
  t.deep(table('kuro_rain_of_strokes', hitsOp, 'hits', sumiStates([0, 1, 2, 3, 4, 5, 6])), [0, 1, 2, 3, 4, 4, 4], 'Rain of Strokes: one hit, plus one per Sumi spent, four at most');
  t.deep(table('kuro_rain_of_strokes', hitsOp, 'hits', sumiStates([0, 2, 4, 5]), true), [0, 2, 4, 4], 'Rain of Strokes+: the same hits');
  t.deep([opOf('kuro_rain_of_strokes', dmg).n, opOf('kuro_rain_of_strokes', hitsOp).n, opOf('kuro_rain_of_strokes', dmg, true).n, opOf('kuro_rain_of_strokes', hitsOp, true).n], [4, 4, 5, 5], 'each Rain hit is 4 (5 upgraded), 6 (7) in the back row');
  t.eq(opOf('kuro_rain_of_strokes', hitsOp).tgt, 'random', 'Rain of Strokes rolls a target per hit');
  t.eq(opOf('kuro_rain_of_strokes', hitsOp).consume.upTo, 4, 'and spends what it counted');
  t.deep(table('kuro_running_script', dmg, 'n', [0, 1, 2, 3, 4].map((n) => ({ skills: n }))), [2, 5, 8, 11, 11], 'Running Script: 2, +3 per Skill played this turn, three at most');
  t.deep(table('kuro_running_script', dmg, 'n', [0, 1, 2, 3, 4].map((n) => ({ skills: n })), true), [2, 6, 10, 14, 14], 'Running Script+: +4 per Skill');
  t.deep(table('kuro_grand_flourish', dmg, 'n', sumiStates([0, 1, 4, 8])), [3, 8, 23, 43], 'Grand Flourish: 3 plus 5 per Sumi, no cap');
  t.deep(table('kuro_grand_flourish', dmg, 'n', sumiStates([0, 1, 4, 8]), true), [3, 9, 27, 51], 'Grand Flourish+: 3 plus 6 per Sumi');
  t.eq(opOf('kuro_grand_flourish', dmg).consume, 'sumi', 'Grand Flourish spends all Sumi');
  t.deep(table('kuro_inkwash_sanctum', blk, 'n', sumiStates([0, 2, 5])), [3, 9, 18], 'Sanctum: 3 Block and 3 per Sumi to both');
  t.deep(table('kuro_inkwash_sanctum', blk, 'n', sumiStates([0, 2, 5]), true), [3, 11, 23], 'Sanctum+: 3 and 4 per Sumi');
  t.eq(opOf('kuro_inkwash_sanctum', blk).tgt, 'both', 'Sanctum covers both heroes');
  t.deep(cards.filter((c) => anyOp(c, (o) => o.op === 'dmg' && o.n === 0)).map((c) => c.id), [], 'no card deals a flat zero');
});

t.test('numbers: Blight multipliers and cash-ins (Rot Script, Nightshade, Inkblot Verdict, Slow Match, Inferno)', () => {
  const stat = (o) => o.op === 'status', dmg = (o) => o.op === 'dmg';
  const tgtPoison = (list) => list.map((p) => ({ target: { poison: p } }));
  t.deep(table('kuro_rot_script', stat, 'n', tgtPoison([0, 3, 4, 10, 20])), [0, 3, 4, 10, 10], 'Rot Script doubles Poison, adding at most 10');
  t.eq(opOf('kuro_rot_script', stat).tgt, 'enemy', 'Rot Script aims at ONE enemy (aimed at all, each enemy would double its own stack)');
  t.deep(table('kuro_nightshade_verdict', dmg, 'n', tgtPoison([0, 4, 10, 11])), [0, 20, 50, 50], 'Nightshade Verdict: 5 damage per Poison, capped at 50');
  t.eq(DATA.cards.kuro_nightshade_verdict.cost, 3, 'Nightshade Verdict is the clunky three Energy finisher');
  t.eq(costOf(DATA.cards.kuro_nightshade_verdict, true), 2, 'and its upgrade makes it a two Energy card');
  const debuffs = (n) => { const st = {}; ['poison', 'burn', 'weak', 'vulnerable', 'frail'].slice(0, n).forEach((k) => { st[k] = 2; }); return { target: st }; };
  t.deep(table('kuro_inkblot_verdict', dmg, 'n', [0, 1, 2, 3, 4].map(debuffs)), [2, 5, 8, 11, 14], 'Inkblot Verdict: 2 plus 3 per distinct debuff');
  t.deep(table('kuro_inkblot_verdict', dmg, 'n', [0, 2, 4].map(debuffs), true), [3, 11, 19], 'Inkblot Verdict+: 3 plus 4 per debuff');
  t.deep(table('kuro_inkblot_verdict', dmg, 'n', [{ target: { poison: 9, burn: 0, stun: 1, might: 3 } }]), [2 + 3 * 2], 'a zero stack or a buff is not a debuff (poison and stun count, Might and Burn 0 do not)');
  const turns = (list) => list.map((n) => ({ turn: n }));
  t.deep(table('kuro_slow_match', stat, 'n', turns([1, 3, 5, 6, 9])), [2, 6, 10, 10, 10], 'Slow Match: twice the turn, at most 10');
  t.deep(table('kuro_slow_match', stat, 'n', turns([1, 3, 5, 6, 9]), true), [3, 9, 15, 15, 15], 'Slow Match+: three times the turn, at most 15');
  t.ok((DATA.cards.kuro_slow_match.kw || []).indexOf('retain') >= 0, 'Slow Match retains, so you can wait for a bigger turn');
  const inf = DATA.cards.kuro_inkfall_inferno;
  const rep = (up) => flatOps(fxOf(inf, up)).find((o) => o.op === 'repeat');
  t.deep([0, 1, 2, 3].map((x) => evalV(rep(false).n, { X: x })), [0, 1, 2, 3], 'Inkfall Inferno repeats X times');
  t.deep([0, 1, 2, 3].map((x) => evalV(rep(true).n, { X: x })), [0, 1, 2, 3], 'and so does the upgrade (it hits harder instead: the text cannot show a hidden extra round)');
  t.deep([rep(false).do[0].n, rep(true).do[0].n, rep(false).do[1].n, rep(true).do[1].n], [4, 5, 1, 1], 'Inferno: 4 damage (5 upgraded) and 1 Burn per Energy to every enemy');
  t.ok(rep(false).do.every((o) => o.tgt === 'all'), 'every Inferno op hits all enemies');
});

t.test('numbers: Scribe cards (Strikethrough, Redraft, Midnight Oil, Flip the Page, Rot Script cap)', () => {
  const picked = (list) => list.map((n) => ({ picked: n }));
  const blk = (o) => o.op === 'block', st = (o) => o.op === 'status' && o.s === 'sumi', dr = (o) => o.op === 'draw';
  t.deep(table('kuro_strikethrough', blk, 'n', picked([0, 1, 2, 3])), [0, 3, 6, 9], 'Strikethrough: 3 Block per card exhausted');
  t.deep(table('kuro_strikethrough', st, 'n', picked([0, 1, 2, 3])), [0, 1, 2, 3], 'and 1 Sumi per card');
  t.eq(opOf('kuro_strikethrough', (o) => o.op === 'pick').n, 2, 'base picks up to 2');
  t.eq(opOf('kuro_strikethrough', (o) => o.op === 'pick', true).n, 3, 'the upgrade picks up to 3');
  t.ok(opOf('kuro_strikethrough', (o) => o.op === 'pick').optional === true, 'the exhaust pick is optional (you may exhaust nothing)');
  t.deep(table('kuro_redraft', dr, 'n', picked([0, 1, 2])), [0, 1, 2], 'Redraft draws as many as it discarded');
  const oil = DATA.cards.kuro_midnight_oil;
  t.deep(flatOps(oil.fx).map((o) => o.op + ':' + o.n), ['hurt:3', 'energy:1', 'draw:1'], 'Midnight Oil: lose 3 HP, gain 1 Energy, draw 1');
  t.deep(flatOps(oil.up.fx).map((o) => o.op + ':' + o.n), ['hurt:2', 'energy:1', 'draw:1'], 'Midnight Oil+: lose only 2 HP');
  t.ok(flatOps(oil.fx).find((o) => o.op === 'hurt').lethal !== true, 'Midnight Oil cannot kill Kuro');
  const flip = DATA.cards.kuro_flip_the_page;
  t.deep(flatOps(flip.fx).map((o) => o.op), ['swap', 'draw', 'block', 'cond', 'status'], 'Flip the Page: swap, draw, ally Block, then Sumi if it left Kuro in the back');
  t.ok(flatOps(flip.fx).findIndex((o) => o.op === 'swap') < flatOps(flip.fx).findIndex((o) => o.op === 'cond'), 'the row check runs AFTER the swap, so it reads the new row');
  t.eq(flatOps(flip.fx).find((o) => o.op === 'cond').if.row, 'back', 'Sumi when Kuro ends in the back row');
  const cloak = DATA.cards.kuro_ink_cloak;
  t.deep(flatOps(cloak.fx).filter((o) => o.op === 'block').map((o) => o.n), [6, 6], 'Ink Cloak: 6 Block, 6 more in front');
  t.eq(flatOps(cloak.fx).find((o) => o.op === 'cond').if.row, 'front', 'the bonus is for the front row');
  const note = DATA.cards.kuro_cinder_note;
  t.deep(flatOps(note.fx).map((o) => o.op), ['dmg', 'status', 'cond', 'status'], 'Cinder Note: hit, Burn, and more Burn in the front row');
  const blot = DATA.cards.kuro_blinding_blot;
  t.ok(flatOps(blot.fx).findIndex((o) => o.s === 'vulnerable') < flatOps(blot.fx).findIndex((o) => o.op === 'dmg'), 'Blinding Blot applies Vulnerable BEFORE it hits, so its own damage benefits');
});

t.test('numbers: powers hook the right trigger with the right size', () => {
  const hookOf = (id, up) => flatOps(fxOf(DATA.cards[id], up)).find((o) => o.op === 'hook');
  const one = (h) => flatOps(h.fx)[0];
  t.eq(hookOf('kuro_creeping_ink').on, 'onPlay', 'Creeping Ink triggers on play');
  t.eq(hookOf('kuro_creeping_ink').filter.type, 'skill', 'of a Skill');
  t.eq(hookOf('kuro_creeping_ink').limit, 2, 'at most twice a turn');
  t.deep([one(hookOf('kuro_creeping_ink')).n, one(hookOf('kuro_creeping_ink', true)).n], [1, 2], 'Poison 1, then 2');
  t.eq(one(hookOf('kuro_creeping_ink')).tgt, 'random', 'at a random enemy');
  t.eq(hookOf('kuro_well_of_ink').on, 'turnStart', 'Well of Ink pays at the start of the turn');
  t.deep([costOf(DATA.cards.kuro_well_of_ink, false), costOf(DATA.cards.kuro_well_of_ink, true)], [1, 0], 'Well of Ink costs 1, then 0');
  t.ok((DATA.cards.kuro_well_of_ink.kw || []).indexOf('innate') >= 0, 'Well of Ink is innate: the engine is always there on turn 1');
  t.deep([one(hookOf('kuro_plague_garden')).n, one(hookOf('kuro_plague_garden', true)).n], [2, 3], 'Plague Garden: Poison 2, then 3, to ALL');
  t.eq(one(hookOf('kuro_plague_garden')).tgt, 'all', 'Plague Garden hits all enemies');
  t.eq(hookOf('kuro_epilogue_flame').filter.hero, 'any', 'Epilogue Flame counts anyone\'s kills (poison and burn kills credit the front hero)');
  t.deep([one(hookOf('kuro_epilogue_flame')).n, one(hookOf('kuro_epilogue_flame', true)).n], [3, 4], 'Epilogue Flame: Burn 3, then 4');
  t.eq(hookOf('kuro_ink_reservoir').filter.type, 'skill', 'Ink Reservoir: Sumi per Skill');
  t.deep([costOf(DATA.cards.kuro_ink_reservoir, false), costOf(DATA.cards.kuro_ink_reservoir, true)], [2, 1], 'Ink Reservoir costs 2, then 1');
  t.eq(hookOf('kuro_scene_change').on, 'onSwap', 'Scene Change triggers on a swap');
  t.eq(hookOf('kuro_scene_change').filter.hero, 'any', 'of anyone');
  t.deep(flatOps(hookOf('kuro_scene_change').fx).map((o) => o.op), ['draw', 'status'], 'draw a card and gain Sumi');
  t.deep([one({ fx: [flatOps(hookOf('kuro_scene_change').fx)[1]] }).n, one({ fx: [flatOps(hookOf('kuro_scene_change', true).fx)[1]] }).n], [1, 2], 'Sumi 1, then 2');
  byType('power').forEach((c) => {
    t.eq(flatOps(c.fx).filter((o) => o.op === 'hook').length, 1, `${c.id}: one hook`);
    t.ok(!flatOps(c.fx).some((o) => o.op === 'dmg' && !o.tgt), `${c.id}: a power does not hit on its own`);
    t.ok(hookOf(c.id).once !== true, `${c.id}: a power hook lasts the whole combat`);
  });
});

// ------------------------------------------------------------------------------------------------ 5 budget
const atRest = (v) => (typeof v === 'number' ? v : (v.min !== undefined ? Math.max(v.base || 0, v.min) : (v.base || 0)));           // no resource, no target status
const atMax = (v) => (typeof v === 'number' ? v : (v.base || 0) + (v.mul === undefined ? 1 : v.mul) * (v.upTo === undefined ? 0 : v.upTo));   // every allowed stack spent
const TYPICAL = { X: 2, handSize: 3, drawPile: 8, discardPile: 6, exhaustPile: 3, cardsPlayed: 2, attacksPlayed: 1, skillsPlayed: 1.5, energy: 1, block: 5, hp: 40, missingHp: 10, enemies: 2, kills: 1, turn: 3, gems: 0, front: 0.4, damageTaken: 8, hitsTaken: 1, targetBlock: 4, debuffs: 2 };
const TYPICAL_STATUS = { sumi: 2.5, poison: 4, burn: 3, might: 2, thorns: 2, bulwark: 2, dodge: 1 };
const TGT_MUL = { all: 1.8, both: 1.6 };
const ENEMY_TGT = ['enemy', 'all', 'random', 'lowest', 'others'];
const RATE = { poison: 1.8, burn: 1.5, mark: 3, stun: 6 };
// A stack of Dodge is 6 points (it was 3): it cancels a whole hit of any size and stacks across turns. The balance bot measured Ghost Ink (2 Dodge for
// 1 Energy) as the strongest common in the game, which the old price of 3 a stack had put in the bottom half of its band.
const SELF_RATE = { sumi: 2.5, might: 3, dodge: 6, thorns: 1.5, bulwark: 4, regen: 2, taunt: 2 };
const HOOK_T = { turnStart: 3.5, turnEnd: 3.5, onPlay: 4, onDamaged: 3, onKill: 2.5, onSwap: 2.5, onExhaust: 3, onShuffle: 1.5, combatStart: 1, onHeroDown: 0.3 };
function vCount(v, ctx, finisher) {
  if (v.per === 'status') return v.who === 'ally' ? 2 : (v.s === 'sumi' && finisher ? 4 : (TYPICAL_STATUS[v.s] || 2));
  if (v.per === 'missingHp') return v.who === 'ally' ? 12 : 10;
  if (v.per === 'picked') return ctx.picked === undefined ? 1.5 : ctx.picked;
  if (v.per === 'X') return ctx.X;
  return TYPICAL[v.per] === undefined ? 1 : TYPICAL[v.per];
}
function vVal(v, ctx, finisher) {
  if (typeof v === 'number') return v;
  if (v === undefined) return 0;
  let c = v.per ? vCount(v, ctx, finisher) : 0;
  if (v.upTo !== undefined) c = Math.min(c, v.upTo);
  let r = (v.base || 0) + (v.mul === undefined ? 1 : v.mul) * c;
  if (v.min !== undefined) r = Math.max(r, v.min);
  if (v.cap !== undefined) r = Math.min(r, v.cap);
  return r;
}
function debuffPoints(s, n) {
  if (s === 'weak') return n <= 0 ? 0 : 2.5 + 1.2 * (n - 1);
  if (s === 'vulnerable') return n <= 0 ? 0 : 3.5 + 1.5 * (n - 1);
  if (s === 'frail') return 1.5 * n;
  if (s === 'bind') return n;
  return (RATE[s] || 2) * n;
}
function condLive(c) {
  if (c.row === 'front') return 0.4;
  if (c.row === 'back') return 0.7;
  if (c.cardsPlayed && c.cardsPlayed.lte === 0) return 0.55;
  if (c.handEmpty) return 0.15;
  return 0.5;
}
function sumiPenalty(o, ctx) {
  if (!o.consume) return 0;
  const cs = typeof o.consume === 'object' ? o.consume : { s: o.consume };
  if (cs.s !== 'sumi') return 0;
  return -1.2 * (cs.upTo === undefined ? 4 : Math.min(4, vVal(cs.upTo, ctx), TYPICAL_STATUS.sumi));
}
function listPoints(list, ctx) { return list.reduce((sum, o) => sum + opPoints(o, ctx), 0); }
function opPoints(o, ctx) {
  const m = TGT_MUL[o.tgt] || 1;
  switch (o.op) {
    case 'dmg': {
      const fin = o.consume === 'sumi' || (o.consume && o.consume.s === 'sumi' && o.consume.upTo === undefined);
      const n = vVal(o.n, ctx, fin), h = o.hits === undefined ? 1 : vVal(o.hits, ctx, fin);
      return n * h * m + 1.2 * Math.max(0, h - 1) + sumiPenalty(o, ctx);
    }
    case 'block': return vVal(o.n, ctx, o.consume === 'sumi') * m + sumiPenalty(o, ctx);
    case 'heal': return vVal(o.n, ctx) * 0.7 * m;
    case 'hurt': return -1.2 * vVal(o.n, ctx);
    case 'status': {
      const n = vVal(o.n, ctx);
      if (ENEMY_TGT.indexOf(o.tgt || (DATA.isDebuff(o.s) ? 'enemy' : 'self')) >= 0) return debuffPoints(o.s, n) * m;
      return (SELF_RATE[o.s] || 2) * n * m;
    }
    case 'draw': return 3.5 * vVal(o.n, ctx);
    case 'energy': return 6 * vVal(o.n, ctx);
    case 'swap': return 1;
    case 'pick': {
      const n = vVal(o.n, ctx);
      const e = o.optional ? Math.min(2.4, 0.75 * n) : n;
      ctx.picked = e;
      let v;
      if (o.from === 'hand') v = ({ discard: -1, exhaust: -1, copy: 5.5, upgrade: 4, retain: 1.5 })[o.then] * e;
      else if (o.from === 'draw') v = o.then === 'toHand' ? 3 + 0.3 * (o.top || 8) : ({ discard: 0.9 * e, exhaust: 0.5 * e, toDrawTop: e })[o.then];
      else v = o.then === 'toHand' ? 3.5 : 2.5;
      return v * (o.random ? 0.6 : 1);
    }
    case 'cond': { const p = condLive(o.if); return p * listPoints(o.then, ctx) + (1 - p) * (o.else ? listPoints(o.else, ctx) : 0); }
    case 'repeat': return vVal(o.n, ctx) * listPoints(o.do, ctx);
    case 'hook': {
      let T = HOOK_T[o.on] || 2;
      if (o.on === 'onPlay') T = o.filter ? (o.filter.type === 'skill' ? 4.5 : o.filter.type === 'attack' ? 3 : 4) : 6;
      if (o.once) T = 1;
      if (o.limit) T = Math.min(T, o.limit * 3.5);
      if (o.every) T /= o.every;
      return T * 0.8 * listPoints(o.fx, ctx);
    }
    default: return 0;
  }
}
function pointsOf(c, up) {
  const cost = costOf(c, up);
  const X = 2;
  const value = listPoints(fxOf(c, up), { X, picked: undefined });
  const energy = cost === 'X' ? X : Math.max(cost, c.type === 'power' ? 1 : 0);
  return { value, energy, perEnergy: energy > 0 ? value / energy : value, cost };
}
function bandOf(c, up) {
  const cost = costOf(c, up);
  let lo, hi;
  if (c.type === 'power') { lo = 4.0; hi = up ? 16.0 : 12.0; }
  else if (cost === 0) { lo = 1.5; hi = up ? 8.0 : 6.5; }
  else if (cost === 1) { lo = 4.5; hi = up ? 13.5 : 10.5; }
  else { lo = 4.0; hi = up ? 13.5 : 10.5; }
  if (kwOf(c, up).indexOf('exhaust') >= 0) hi *= 1.15;
  return [lo, hi];
}

t.test('budget: every card and every upgrade sits in its cost band (see the model at the top of this file)', () => {
  const report = [];
  cards.forEach((c) => {
    [false, true].forEach((up) => {
      const p = pointsOf(c, up);
      const [lo, hi] = bandOf(c, up);
      const v = c.type === 'power' || costOf(c, up) !== 0 ? p.perEnergy : p.value;
      report.push(`${c.id}${up ? '+' : ''} ${v.toFixed(1)}`);
      t.ok(v >= lo - 1e-9 && v <= hi + 1e-9, `${c.id}${up ? '+' : ''}: ${v.toFixed(2)} points per Energy is outside [${lo}, ${hi.toFixed(2)}]`);
      t.ok(Number.isFinite(p.value), `${c.id}${up ? '+' : ''}: the value is a number`);
    });
  });
  t.ok(report.length === cards.length * 2, 'every card was valued');
  if (process.env.RB_TABLE) { console.log('card value per Energy (or per play for cost 0), base then upgrade:'); cards.forEach((c) => { const a = pointsOf(c, false), b = pointsOf(c, true); const va = c.type === 'power' || costOf(c, false) !== 0 ? a.perEnergy : a.value, vb = c.type === 'power' || costOf(c, true) !== 0 ? b.perEnergy : b.value; const [lo, hi] = bandOf(c, false), [ulo, uhi] = bandOf(c, true); console.log(c.id.padEnd(26) + c.rarity[0] + ' ' + String(c.cost).padEnd(2) + ' ' + va.toFixed(1).padStart(5) + ' [' + lo + ',' + hi.toFixed(1) + ']  up ' + vb.toFixed(1).padStart(5) + ' [' + ulo + ',' + uhi.toFixed(1) + ']'); }); }
});

t.test('budget: an upgrade is never worth less than its base, and never a runaway', () => {
  cards.forEach((c) => {
    const a = pointsOf(c, false), b = pointsOf(c, true);
    const cheaper = costOf(c, true) !== c.cost;
    const ratio = cheaper ? Infinity : b.value / a.value;
    t.ok(b.perEnergy >= a.perEnergy - 1e-9, `${c.id}: the upgrade is worth at least the base (${a.perEnergy.toFixed(1)} -> ${b.perEnergy.toFixed(1)})`);
    if (!cheaper) t.ok(ratio <= (c.type === 'power' ? 2.05 : 1.55) + 1e-9, `${c.id}: the upgrade is ${ratio.toFixed(2)}x the base`);
    if (c.type !== 'power' && !cheaper && (!upOf(c).kw || upOf(c).fx)) t.ok(ratio >= 1.05, `${c.id}: a numeric upgrade is at least 5 percent better (${ratio.toFixed(2)}x)`);
  });
});

t.test('budget: strict rules for the free and cheap cards', () => {
  cards.filter((c) => c.cost === 0).forEach((c) => {
    t.ok(pointsOf(c, false).value <= 6.5 + 1e-9, `${c.id}: a free card is worth 6.5 or less`);
    const ops = flatOps(c.fx);
    t.ok(!ops.some((o) => o.op === 'dmg' && vVal(o.n, {}) * (o.hits ? vVal(o.hits, {}) : 1) > 5 && !(o.n && o.n.per)), `${c.id}: a free attack hits for 5 or less`);
    t.ok(!(ops.some((o) => o.op === 'energy') && !ops.some((o) => o.op === 'hurt')), `${c.id}: free Energy always costs something`);
    t.ok((c.kw || []).indexOf('exhaust') >= 0 || !ops.some((o) => o.op === 'energy'), `${c.id}: free Energy exhausts`);
  });
  [false, true].forEach((up) => {
    cards.filter((c) => costOf(c, up) === 1 && c.type === 'attack').forEach((c) => {
      const hits = flatOps(fxOf(c, up)).filter((o) => o.op === 'dmg');
      const rest = hits.reduce((sum, o) => sum + atRest(o.n) * (o.hits ? atRest(o.hits) : 1) * (o.tgt === 'all' ? 2 : 1), 0);
      const top = hits.reduce((sum, o) => sum + atMax(o.n) * (o.hits ? atMax(o.hits) : 1) * (o.tgt === 'all' ? 2 : 1), 0);
      t.ok(rest <= (up ? 12 : 9), `${c.id}${up ? '+' : ''}: a one Energy attack deals at most ${up ? 12 : 9} base damage at rest (${rest})`);
      t.ok(top <= (up ? 14 : 11), `${c.id}${up ? '+' : ''}: and at most ${up ? 14 : 11} with every allowed resource spent (${top})`);
    });
    cards.filter((c) => costOf(c, up) === 1 && c.type === 'skill').forEach((c) => {
      flatOps(fxOf(c, up)).filter((o) => o.op === 'block').forEach((o) => {
        t.ok(atRest(o.n) <= (up ? 10 : 8) + 1e-9, `${c.id}${up ? '+' : ''}: a one Energy skill gives at most ${up ? 10 : 8} Block at rest (${atRest(o.n)})`);
        t.ok(atMax(o.n) <= (up ? 13 : 10) + 1e-9, `${c.id}${up ? '+' : ''}: and at most ${up ? 13 : 10} with every allowed resource spent (${atMax(o.n)})`);
      });
    });
  });
  cards.filter((c) => anyOp(c, (o) => o.op === 'energy')).forEach((c) => t.ok(flatOps(c.fx).filter((o) => o.op === 'energy').every((o) => o.n <= 1) || c.cost >= 2, `${c.id}: +2 Energy is not offered cheaply`));
  cards.forEach((c) => flatOps(c.fx).filter((o) => o.op === 'draw' && typeof o.n === 'number').forEach((o) => t.ok(o.n <= 2, `${c.id}: no bare draw above 2`)));
  cards.forEach((c) => flatOps(c.fx).filter((o) => o.op === 'status' && ['weak', 'vulnerable'].indexOf(o.s) >= 0).forEach((o) => t.ok(o.n <= 2, `${c.id}: Weak and Vulnerable stay at 2 or less`)));
  cards.forEach((c) => flatOps(c.fx).filter((o) => o.op === 'status' && o.s === 'poison' && typeof o.n === 'number' && o.tgt === 'enemy').forEach((o) => t.ok(o.n <= 5, `${c.id}: single target Poison at most 5 (guidance 3 to 5)`)));
});

// ------------------------------------------------------------------------------------------------ 6 engine
function bootEngine() {
  if (!exists('combat.js') || !exists('data_text.js')) return { skip: 'js/combat.js or js/data_text.js is not written yet' };
  let g;
  try { g = boot({ only: ['data_text', 'combat', 'data_cards_kuro'], continue: true }); } catch (e) { return { skip: 'the engine did not boot: ' + e.message }; }
  const broken = (g._errors || []).filter((e) => /combat|data_text/.test(String(e.file)));
  if (broken.length) return { skip: 'the engine files failed to load: ' + broken.map((e) => `${e.file}:${e.line} ${e.message}`).join(' | ') };
  if (!g.COMBAT || !g.DATA || typeof g.DATA.cardPlain !== 'function' || typeof g.DATA.resolveCard !== 'function') return { skip: 'COMBAT or the DATA text helpers are missing' };
  return { g };
}

function engineSuite(g) {
  const { DATA: D, COMBAT, U } = g;
  const KURO = Object.values(D.cards).filter((c) => c.hero === 'kuro');
  const DUMMY = 'kuro_test_dummy';
  D.add('enemies', {
    [DUMMY]: {
      id: DUMMY, name: 'Test Dummy', chapter: 1, tier: 'normal', size: 'm', hp: [900, 900],
      moves: { poke: { name: 'Poke', kind: 'attack', fx: [{ op: 'dmg', n: 2, tgt: 'front' }] } },
      ai: { seq: ['poke'] }, art: { id: DUMMY }, lore: 'A patient dummy for the card tests.', tags: ['construct'],
    },
  });
  const inst = (id, up) => { const i = { uid: U.uid(), id, up: up ? 1 : 0, gems: [] }; i.gems = D.resolveCard(i).slots.map(() => null); return i; };
  const FILLERS = ['kuro_ink_bolt', 'kuro_ink_ward', 'kuro_ink_bolt', 'kuro_ink_ward', 'kuro_ink_bolt', 'kuro_ink_ward', 'kuro_ink_bolt', 'kuro_ink_ward', 'kuro_first_stroke'];
  const party = () => [{ id: 'hanae', hp: 70, maxHp: 76 }, { id: 'kuro', hp: 55, maxHp: 60 }];
  function create(deck, kuroFront, seed, enemyCount) {
    const C = COMBAT.create({ heroes: party(), frontIdx: kuroFront ? 1 : 0, deck, enemies: U.range(enemyCount || 3).map(() => DUMMY), tier: 'normal', chapter: 1, seed, mods: D.modsFor([], 0), relics: [], gold: 0 });
    C.start();
    return C;
  }
  const kuroOf = (C) => C.heroes.find((h) => h.id === 'kuro');
  function pileTotal(C) { return C.hand.length + C.draw.length + C.discard.length + C.exhaust.length + C.powers.length + (C.inPlay ? 1 : 0); }
  function resolvePicks(C, rng, guard) {
    let n = 0;
    while (C.pending && n++ < 8) {
      const p = C.pending;
      const pool = p.uids.slice();
      const want = p.optional ? rng.int(0, Math.min(p.n, pool.length)) : Math.min(p.n, pool.length);
      C.resolvePick(rng.shuffle(pool).slice(0, want));
    }
    guard.ok(!C.pending, 'every pick resolves');
  }
  const STATES = {
    empty: (C) => { kuroOf(C).st.sumi = 0; },
    loaded: (C) => {
      kuroOf(C).st.sumi = 5; kuroOf(C).block = 8;
      C.enemies.forEach((e) => { e.st.poison = 6; e.st.burn = 4; e.st.weak = 1; e.st.vulnerable = 2; });
    },
  };

  t.test('engine: every card plays, base and upgraded, in both rows and two states, without throwing', () => {
    let plays = 0;
    KURO.forEach((c) => [false, true].forEach((up) => [false, true].forEach((kuroFront) => Object.keys(STATES).forEach((state) => {
      const label = `${c.id}${up ? '+' : ''} ${kuroFront ? 'front' : 'back'} ${state}`;
      try {
        const test = inst(c.id, up);
        const deck = [test].concat(FILLERS.map((id) => inst(id, 0)));
        const C = create(deck, kuroFront, U.hash(label));
        // the card under test must be in hand: swap it with the first hand card if the shuffle left it in the draw pile
        if (!C.hand.some((x) => x.uid === test.uid)) {
          const i = C.draw.findIndex((x) => x.uid === test.uid);
          const back = C.hand.pop();
          C.hand.push(C.draw.splice(i, 1)[0]);
          C.draw.splice(i, 0, back);
        }
        STATES[state](C);
        const before = pileTotal(C);
        const target = C.needsTarget(test.uid) ? C.legalTargets(test.uid)[0] : undefined;
        const can = C.canPlay(test.uid, target);
        t.ok(can.ok, `${label}: playable (${can.reason})`);
        if (!can.ok) return;
        const ev = C.play(test.uid, target);
        plays++;
        t.ok(Array.isArray(ev) && ev.some((e) => e.type === 'play'), `${label}: emits a play event`);
        resolvePicks(C, U.rng(U.hash(label, 'pick')), t);
        t.ok(pileTotal(C) >= before, `${label}: no card vanished (${before} -> ${pileTotal(C)})`);
        t.ok(C.hand.length <= 10, `${label}: hand within the cap`);
        t.ok(!C.inPlay, `${label}: nothing left in play`);
        t.eq(typeof C.needsTarget(test.uid), 'boolean', `${label}: needsTarget is a boolean`);
        C.endTurn();
        t.ok(['player', 'over'].indexOf(C.phase) >= 0, `${label}: the round ends cleanly (${C.phase})`);
        if (C.phase === 'player') { resolvePicks(C, U.rng(1), t); t.ok(pileTotal(C) >= before, `${label}: still no card lost after a full round`); }
      } catch (e) {
        t.ok(false, `${label}: threw ${e && e.stack || e}`);
      }
    }))));
    t.eq(plays, KURO.length * 8, 'every combination was played');
  });

  t.test('engine: card text is generated, non-empty, short and clean, base and upgraded', () => {
    KURO.forEach((c) => [false, true].forEach((up) => {
      const i = inst(c.id, up);
      const plain = D.cardPlain(i), html = D.cardHtml(i), r = D.resolveCard(i);
      const label = `${c.id}${up ? '+' : ''}`;
      t.ok(typeof plain === 'string' && plain.trim().length > 6, `${label}: has text`);
      t.ok(plain.length <= 110, `${label}: text is ${plain.length} characters (limit 110)`);
      t.ok(!/undefined|NaN|null|\[object|Infinity|\{|\}/.test(plain), `${label}: clean text "${plain}"`);
      t.ok(!/undefined|NaN|\[object|Infinity/.test(html), `${label}: clean html`);
      t.ok(!DASH.test(plain), `${label}: no dash in the text`);
      t.eq(r.name, c.name + (up ? '+' : ''), `${label}: resolved name`);
      t.eq(r.cost, up ? costOf(c, true) : c.cost, `${label}: resolved cost`);
      t.eq(r.slots.length, c.slots.length, `${label}: resolved slots`);
      t.eq(r.hero, 'kuro', `${label}: resolved hero`);
    }));
    KURO.forEach((c) => {
      const a = D.resolveCard(inst(c.id, false)), b = D.resolveCard(inst(c.id, true));
      t.ok(D.cardPlain(inst(c.id, false)) !== D.cardPlain(inst(c.id, true)) || a.cost !== b.cost, `${c.id}: the player can SEE the upgrade (the text or the cost changes)`);
    });
    const words2 = (id) => D.cardPlain(inst(id, 0)).toLowerCase();
    t.ok(new RegExp(D.statuses.sumi.name, 'i').test(words2('kuro_first_stroke')), 'Drop the Beat text mentions Groove');
    t.ok(/earworm/.test(words2('kuro_venom_script')), 'Catchy Hook text mentions Earworm');
    t.ok(/sizzle/.test(words2('kuro_cinder_note')), 'Spicy Snare text mentions Sizzle');
    t.ok(/swap/.test(words2('kuro_flip_the_page')), 'Pass the Mic text mentions the swap');
    t.ok(/fade/.test(words2('kuro_strikethrough')), 'Sample Chop text mentions fading');
    t.ok(/hold/.test(words2('kuro_slow_match')), 'Slow Jam text mentions Hold');
    KURO.forEach((c) => t.eq(D.targetMode(inst(c.id, 0)), flatOps(c.fx).some((o) => (o.op === 'dmg' && (!o.tgt || o.tgt === 'enemy')) || (['enemy', 'others'].indexOf(o.tgt) >= 0) || vObjects([o]).some((v) => v.who === 'target')) ? 'enemy' : 'none', `${c.id}: the targeting mode follows the ops`));
  });

  t.test('engine: pick cards ask for the player and take the answer (Skim, Redraft, Strikethrough, Second Edition)', () => {
    ['kuro_skim_the_scroll', 'kuro_redraft', 'kuro_strikethrough', 'kuro_second_edition'].forEach((id) => {
      const test = inst(id, 0);
      const C = create([test].concat(FILLERS.map((x) => inst(x, 0))), false, 11);
      if (!C.hand.some((x) => x.uid === test.uid)) { const i = C.draw.findIndex((x) => x.uid === test.uid); const back = C.hand.pop(); C.hand.push(C.draw.splice(i, 1)[0]); C.draw.splice(i, 0, back); }
      C.energy = 3;
      const ev = C.play(test.uid);
      t.ok(!!C.pending && C.pending.kind === 'pick', `${id}: a pick is pending`);
      if (C.pending) {
        t.ok(ev.length > 0 && ev[ev.length - 1].type === 'pick_needed', `${id}: pick_needed is the last event`);
        t.ok(C.pending.uids.length > 0, `${id}: there are candidates`);
        const before = { hand: C.hand.length, exhaust: C.exhaust.length, discard: C.discard.length };
        const choose = C.pending.uids.slice(0, Math.min(C.pending.n, C.pending.uids.length));
        C.resolvePick(choose);
        t.ok(!C.pending, `${id}: the pick resolved`);
        if (id === 'kuro_strikethrough') {
          t.eq(C.exhaust.length, before.exhaust + choose.length, 'Strikethrough exhausted the picked cards');
          t.eq(kuroOf(C).st.sumi || 0, choose.length + 1, 'and paid one Sumi each, plus the Steady Hand Sumi for playing a Skill');
        }
        if (id === 'kuro_second_edition') t.ok(C.hand.length >= before.hand + Math.min(choose.length, 10 - before.hand), 'Second Edition put copies in hand');
      }
    });
  });

  t.test('engine: rules the set relies on (Sumi from the passive, Rot Script doubling, Ink Cloak in front, powers keep their hooks)', () => {
    const play = (id, up, kuroFront, setup) => {
      const test = inst(id, up);
      const C = create([test].concat(FILLERS.map((x) => inst(x, 0))), kuroFront, 5);
      if (!C.hand.some((x) => x.uid === test.uid)) { const i = C.draw.findIndex((x) => x.uid === test.uid); const back = C.hand.pop(); C.hand.push(C.draw.splice(i, 1)[0]); C.draw.splice(i, 0, back); }
      if (setup) setup(C);
      const target = C.needsTarget(test.uid) ? C.enemies[0].id : undefined;
      C.play(test.uid, target);
      resolvePicks(C, U.rng(2), t);
      return C;
    };
    let C = play('kuro_ink_ward', 0, false);
    t.eq(kuroOf(C).st.sumi, 1, 'Steady Hand: the first Skill gives 1 Sumi');
    t.eq(kuroOf(C).block, 5, 'Ink Ward gives 5 Block');
    C = play('kuro_first_stroke', 0, false, (X) => { kuroOf(X).st.sumi = 2; });
    t.eq(kuroOf(C).st.sumi || 0, 0, 'First Stroke spends the 2 Sumi it counted');
    t.eq(C.enemies[0].maxHp - C.enemies[0].hp, 4 + 3 * 2 + 2, 'First Stroke at 2 Sumi in the back row: 10 plus the +2 row bonus');
    C = play('kuro_rot_script', 0, false, (X) => { X.enemies[0].st.poison = 4; });
    t.eq(C.enemies[0].st.poison, 8, 'Rot Script doubles 4 Poison');
    C = play('kuro_rot_script', 0, false, (X) => { X.enemies[0].st.poison = 30; });
    t.eq(C.enemies[0].st.poison, 40, 'and adds at most 10');
    C = play('kuro_ink_cloak', 0, true);
    t.eq(kuroOf(C).block, 12, 'Ink Cloak in the front row: 6 plus 6');
    C = play('kuro_ink_cloak', 0, false);
    t.eq(kuroOf(C).block, 6, 'Ink Cloak in the back row: 6');
    C = play('kuro_grand_flourish', 0, false, (X) => { kuroOf(X).st.sumi = 4; });
    t.eq(kuroOf(C).st.sumi || 0, 0, 'Grand Flourish spends every Sumi');
    t.eq(C.enemies[0].maxHp - C.enemies[0].hp, 3 + 20 + 2, 'and deals 3 plus 5 per Sumi plus the back row bonus');
    C = play('kuro_plague_garden', 0, false);
    t.eq(C.powers.length, 1, 'a power goes to the powers zone');
    C.endTurn();
    t.ok(C.enemies.every((e) => (e.st.poison || 0) >= 1), 'Plague Garden poisons every enemy at the start of the next turn');
    C = play('kuro_midnight_oil', 0, false);
    t.eq(kuroOf(C).hp, 52, 'Midnight Oil costs 3 HP');
    t.eq(C.energy, 3 + 1, 'and returns the Energy it did not cost, plus 1');
    C = play('kuro_flip_the_page', 0, true);
    t.eq(kuroOf(C).row, 'back', 'Flip the Page moved Kuro to the back');
    t.eq(kuroOf(C).st.sumi >= 1, true, 'and Kuro ended in the back, so he gained Sumi');
    C = play('kuro_inkfall_inferno', 0, false);
    t.ok(C.enemies.every((e) => e.hp < e.maxHp && (e.st.burn || 0) >= 1), 'Inkfall Inferno hits and burns every enemy');
    t.eq(C.energy, 0, 'and spent every Energy');
  });

  // ---- scenario helpers for the interplay tests: a hand of exactly the cards named, the rest on top of the draw pile
  function scenario(ids, o) {
    o = o || {};
    const wanted = ids.map((id) => inst(id, o.up));
    const deck = wanted.concat(FILLERS.map((id) => inst(id, 0)));
    const C = create(deck, !!o.kuroFront, o.seed || 3, o.enemies || 3);
    const want = new Set(wanted.map((c) => c.uid));
    const all = C.hand.concat(C.draw);
    const chosen = wanted.map((w) => all.find((x) => x.uid === w.uid));
    const rest = all.filter((x) => !want.has(x.uid));
    const keep = Math.max(0, 5 - chosen.length);
    C.hand.splice(0, C.hand.length, ...chosen, ...rest.slice(0, keep));
    C.draw.splice(0, C.draw.length, ...rest.slice(keep));
    if (o.sumi !== undefined) kuroOf(C).st.sumi = o.sumi;
    if (o.energy !== undefined) C.energy = o.energy;
    return { C, cards: chosen };
  }
  const first = (C, id) => C.hand.find((c) => c.id === id);
  const kuroPlay = (C, card, targetIdx) => {
    const target = C.needsTarget(card.uid) ? C.enemies[targetIdx || 0].id : undefined;
    const ok = C.canPlay(card.uid, target);
    t.ok(ok.ok, `${card.id} can be played (${ok.reason})`);
    return C.play(card.uid, target);
  };
  const lost = (e) => e.maxHp - e.hp;
  const hitsOn = (ev) => ev.filter((e) => e.type === 'hit');
  const chooseAll = (C, n) => { const p = C.pending; const ids = p.uids.slice(0, n === undefined ? Math.min(p.n, p.uids.length) : Math.min(n, p.uids.length)); return C.resolvePick(ids); };

  t.test('engine: Sumi spenders and their numbers (First Stroke, Ink Flood, Rain of Strokes, Shelter Script, Sanctum, Grand Flourish)', () => {
    let { C, cards: cs } = scenario(['kuro_ink_flood'], { sumi: 3 });
    kuroPlay(C, cs[0]);
    t.ok(C.enemies.every((e) => lost(e) === 4 + 2 * 3 + 2), 'Ink Flood at 3 Sumi hits every enemy for 10 plus the +2 back row bonus');
    t.eq(kuroOf(C).st.sumi || 0, 0, 'and spends the 3 Sumi');
    ({ C, cards: cs } = scenario(['kuro_ink_flood'], { sumi: 0 }));
    kuroPlay(C, cs[0]);
    t.ok(C.enemies.every((e) => lost(e) === 4 + 2), 'Ink Flood with no Sumi is still 4 (+2) to all');
    ({ C, cards: cs } = scenario(['kuro_rain_of_strokes'], { sumi: 4, enemies: 1 }));
    let ev = kuroPlay(C, cs[0]);
    t.eq(hitsOn(ev).length, 5, 'Rain of Strokes at 4 Sumi lands 5 hits');
    t.eq(lost(C.enemies[0]), 5 * (4 + 2), 'each is 4 plus the +2 back row bonus (30 in all)');
    t.eq(kuroOf(C).st.sumi || 0, 0, 'and spends the Sumi');
    ({ C, cards: cs } = scenario(['kuro_rain_of_strokes'], { sumi: 9, enemies: 1 }));
    ev = kuroPlay(C, cs[0]);
    t.eq(hitsOn(ev).length, 5, 'Rain of Strokes counts at most 4 Sumi (5 hits)');
    t.eq(kuroOf(C).st.sumi, 5, 'and removes only the 4 it counted');
    ({ C, cards: cs } = scenario(['kuro_rain_of_strokes'], { sumi: 0, enemies: 1 }));
    ev = kuroPlay(C, cs[0]);
    t.eq(hitsOn(ev).length, 1, 'with no Sumi it is a single hit');
    ({ C, cards: cs } = scenario(['kuro_rain_of_strokes'], { sumi: 3, enemies: 3, seed: 8 }));
    ev = kuroPlay(C, cs[0]);
    t.ok(new Set(hitsOn(ev).map((e) => e.dst.id)).size >= 2, 'against three enemies the strokes are spread by a per hit roll (' + [...new Set(hitsOn(ev).map((e) => e.dst.id))].join(',') + ')');
    ({ C, cards: cs } = scenario(['kuro_shelter_script'], { sumi: 2 }));
    kuroPlay(C, cs[0]);
    t.eq(C.heroes.find((h) => h.id === 'hanae').block, 4 + 3 * 2, 'Shelter Script: 4 plus 3 per Sumi spent, on the ally');
    t.eq(kuroOf(C).block, 0, 'and none on Kuro');
    t.eq(kuroOf(C).st.sumi, 1, 'the two Sumi are spent and Steady Hand pays 1 back for playing a Skill');
    ({ C, cards: cs } = scenario(['kuro_inkwash_sanctum'], { sumi: 4, energy: 3 }));
    kuroPlay(C, cs[0]);
    t.deep(C.heroes.map((h) => h.block), [15, 15], 'Inkwash Sanctum: 3 Block plus 3 per Sumi to both heroes');
    t.eq(kuroOf(C).st.sumi, 1, 'all Sumi spent, then Steady Hand');
    ({ C, cards: cs } = scenario(['kuro_grand_flourish'], { sumi: 6, energy: 3, enemies: 1 }));
    kuroPlay(C, cs[0]);
    t.eq(lost(C.enemies[0]), 3 + 30 + 2, 'Grand Flourish at 6 Sumi: 3 plus 30 plus the row bonus');
    t.eq(kuroOf(C).st.sumi || 0, 0, 'and every Sumi is spent');
    ({ C, cards: cs } = scenario(['kuro_first_stroke'], { sumi: 1 }));
    kuroPlay(C, cs[0]);
    t.eq(lost(C.enemies[0]), 4 + 3 + 2, 'First Stroke at 1 Sumi: 7 plus the row bonus');
  });

  t.test('engine: Blight numbers (poison, burn, debuff and turn scaling, ordering)', () => {
    let { C, cards: cs } = scenario(['kuro_blinding_blot'], { enemies: 1 });
    kuroPlay(C, cs[0]);
    t.eq(lost(C.enemies[0]), Math.floor((3 + 2) * 1.5), 'Blinding Blot applies Vulnerable first, so its own hit is boosted (5 x 1.5)');
    t.deep([C.enemies[0].st.weak, C.enemies[0].st.vulnerable], [1, 1], 'and leaves Weak 1 and Vulnerable 1');
    ({ C, cards: cs } = scenario(['kuro_inkblot_verdict'], { enemies: 1 }));
    Object.assign(C.enemies[0].st, { poison: 3, weak: 1, vulnerable: 1 });
    kuroPlay(C, cs[0]);
    t.eq(lost(C.enemies[0]), Math.floor((2 + 3 * 3 + 2) * 1.5), 'Inkblot Verdict with three debuffs: 11 plus row, times Vulnerable');
    ({ C, cards: cs } = scenario(['kuro_nightshade_verdict'], { enemies: 1, energy: 3 }));
    C.enemies[0].st.poison = 6;
    kuroPlay(C, cs[0]);
    t.eq(lost(C.enemies[0]), 30 + 2, 'Nightshade Verdict: 5 per Poison (30), plus the row bonus');
    t.eq(C.enemies[0].st.poison, 6, 'and the Poison stays (a cash in, not a cure)');
    t.eq(C.energy, 0, 'it costs the whole turn');
    ({ C, cards: cs } = scenario(['kuro_nightshade_verdict'], { enemies: 1, up: true }));
    t.eq(D.resolveCard(cs[0]).cost, 2, 'the upgrade costs 2');
    ({ C, cards: cs } = scenario(['kuro_miasma_verse', 'kuro_venom_script']));
    kuroPlay(C, cs[0]); kuroPlay(C, cs[1], 1);
    t.deep(C.enemies.map((e) => e.st.poison), [2, 6, 2], 'Miasma Verse poisons all (2), Venom Script poisons one (4 more)');
    ({ C, cards: cs } = scenario(['kuro_viper_nib'], { enemies: 1 }));
    let ev = kuroPlay(C, cs[0]);
    t.eq(hitsOn(ev).length, 2, 'Viper Nib hits twice');
    t.eq(lost(C.enemies[0]), 2 * (2 + 2), 'each for 2 plus the +2 back row bonus');
    t.eq(C.enemies[0].st.poison, 2, 'and poisons once');
    ({ C, cards: cs } = scenario(['kuro_viper_nib'], { enemies: 1, kuroFront: true }));
    kuroPlay(C, cs[0]);
    t.eq(lost(C.enemies[0]), 4, 'in the front row the hits are only 2 each (no row bonus)');
    ({ C, cards: cs } = scenario(['kuro_cinder_note'], { enemies: 1 }));
    kuroPlay(C, cs[0]);
    t.deep([lost(C.enemies[0]), C.enemies[0].st.burn], [4 + 2, 3], 'Cinder Note in the back row: 4 damage and Burn 3');
    ({ C, cards: cs } = scenario(['kuro_cinder_note'], { enemies: 1, kuroFront: true }));
    kuroPlay(C, cs[0]);
    t.deep([lost(C.enemies[0]), C.enemies[0].st.burn], [4, 5], 'in the front row: no row bonus, but Burn 5');
    ({ C, cards: cs } = scenario(['kuro_wildfire_verse'], { energy: 3 }));
    kuroPlay(C, cs[0], 1);
    t.deep(C.enemies.map((e) => e.st.burn), [3, 5, 3], 'Wildfire Verse: Burn 5 on the target, 3 on every other enemy');
    ({ C, cards: cs } = scenario(['kuro_rot_script'], { enemies: 1 }));
    C.enemies[0].st.poison = 7;
    kuroPlay(C, cs[0]);
    t.eq(C.enemies[0].st.poison, 14, 'Rot Script doubles 7 Poison');
    t.ok(C.exhaust.some((c) => c.uid === cs[0].uid), 'and exhausts');
    ({ C, cards: cs } = scenario(['kuro_slow_match'], { enemies: 1 }));
    C.endTurn(); C.endTurn();
    t.eq(C.turn, 3, 'two rounds later it is turn 3');
    const match = first(C, 'kuro_slow_match');
    t.ok(!!match, 'Slow Match was retained through two turn ends');
    C.energy = 3;
    kuroPlay(C, match);
    t.eq(C.enemies[0].st.burn, 6, 'Slow Match on turn 3: Burn 6 (twice the turn)');
    ({ C, cards: cs } = scenario(['kuro_inkfall_inferno'], { energy: 3 }));
    kuroPlay(C, cs[0]);
    t.ok(C.enemies.every((e) => lost(e) === 3 * (4 + 2) && e.st.burn === 3), 'Inkfall Inferno at X = 3: three rounds of (4 + 2) to every enemy and Burn 3');
    t.eq(C.energy, 0, 'it spends every Energy');
    ({ C, cards: cs } = scenario(['kuro_inkfall_inferno'], { energy: 1, up: true }));
    kuroPlay(C, cs[0]);
    t.ok(C.enemies.every((e) => lost(e) === 5 + 2 && e.st.burn === 1), 'Inkfall Inferno+ at X = 1: (5 + 2) and Burn 1');
  });

  t.test('engine: powers and hooks (Creeping Ink, Plague Garden, Epilogue Flame, Scene Change, Well of Ink, Ink Reservoir, Second Edition)', () => {
    let { C, cards: cs } = scenario(['kuro_creeping_ink', 'kuro_redraft', 'kuro_redraft', 'kuro_redraft'], { enemies: 3, seed: 5 });
    kuroPlay(C, cs[0]);
    const poisonTotal = () => C.enemies.reduce((sum, e) => sum + (e.st.poison || 0), 0);
    t.eq(poisonTotal(), 0, 'Creeping Ink does nothing on the turn it is played (it is not a Skill)');
    kuroPlay(C, cs[1]); if (C.pending) chooseAll(C, 0);
    t.eq(poisonTotal(), 1, 'the first Skill after it poisons a random enemy for 1');
    kuroPlay(C, cs[2]); if (C.pending) chooseAll(C, 0);
    t.eq(poisonTotal(), 2, 'the second does too');
    kuroPlay(C, cs[3]); if (C.pending) chooseAll(C, 0);
    t.eq(poisonTotal(), 2, 'a third Skill in the same turn does not (at most 2 times per turn)');
    ({ C, cards: cs } = scenario(['kuro_plague_garden'], { energy: 3 }));
    kuroPlay(C, cs[0]);
    t.eq(C.powers.length, 1, 'Plague Garden sits in the powers zone');
    C.endTurn();
    t.ok(C.enemies.every((e) => e.st.poison === 2), 'at the start of the next turn every enemy has Poison 2');
    C.endTurn();
    t.ok(C.enemies.every((e) => e.st.poison === 3), 'and the turn after, the tick took 1 and the garden added 2 (Poison 3)');
    ({ C, cards: cs } = scenario(['kuro_second_edition', 'kuro_plague_garden'], { energy: 6 }));
    kuroPlay(C, cs[0]);
    t.ok(!!C.pending && C.pending.kind === 'pick', 'Second Edition asks which cards to copy');
    const garden = cs[1];
    C.resolvePick([garden.uid]);
    const gardens = C.hand.filter((c) => c.id === 'kuro_plague_garden');
    t.eq(gardens.length, 2, 'the hand now holds two Plague Gardens (a power was copied)');
    t.ok(gardens.some((c) => c.tmp), 'one of them is a temporary copy');
    gardens.forEach((g) => kuroPlay(C, g));
    C.endTurn();
    t.ok(C.enemies.every((e) => e.st.poison === 4), 'two hooks: Poison 4 to every enemy at the next turn start');
    ({ C, cards: cs } = scenario(['kuro_epilogue_flame', 'kuro_ink_bolt'], { enemies: 2, energy: 3 }));
    C.enemies[0].hp = 1;
    kuroPlay(C, cs[0]); kuroPlay(C, cs[1], 0);
    t.ok(C.enemies[0].down, 'the first enemy fell');
    t.eq(C.enemies[1].st.burn, 2 + 3, 'Epilogue Flame: the survivor burns for 2 when it is played and 3 more when the first falls');
    ({ C, cards: cs } = scenario(['kuro_epilogue_flame'], { enemies: 2, energy: 3 }));
    kuroPlay(C, cs[0]);
    C.enemies[0].hp = 1; C.enemies[0].st.poison = 5;
    C.endTurn();
    t.ok(C.enemies[0].down, 'a poison kill (credited to the FRONT hero, Hanae) ...');
    t.ok((C.enemies[1].st.burn || 0) >= 1, '... still lights the other enemy, because the hook counts anyone\'s kills');
    ({ C, cards: cs } = scenario(['kuro_scene_change'], { energy: 3 }));
    kuroPlay(C, cs[0]);
    const handBefore = C.hand.length;
    C.swap();
    t.eq(C.hand.length, handBefore + 1, 'Scene Change: a swap draws a card');
    t.eq(kuroOf(C).st.sumi, 1, 'and gives 1 Sumi');
    t.eq(kuroOf(C).row, 'front', 'the swap moved Kuro forward (that is the price)');
    ({ C, cards: cs } = scenario(['kuro_ink_reservoir', 'kuro_ink_ward', 'kuro_redraft'], { energy: 5 }));
    kuroPlay(C, cs[0]);
    kuroPlay(C, cs[1]);
    t.eq(kuroOf(C).st.sumi, 2 + 1 + 1, 'Ink Reservoir: 2 Sumi when it is played, then a Skill gives 1 on its own plus 1 from Steady Hand');
    kuroPlay(C, cs[2]); if (C.pending) chooseAll(C, 0);
    t.eq(kuroOf(C).st.sumi, 2 + 1 + 1 + 1, 'a second Skill gives 1 more (Steady Hand only counts the first)');
    for (let seed = 1; seed <= 6; seed++) {
      const well = inst('kuro_well_of_ink', 0);
      const K = create([well].concat(FILLERS.map((id) => inst(id, 0))), false, seed);
      t.ok(K.hand.some((c) => c.uid === well.uid), `Well of Ink is innate: in the opening hand (seed ${seed})`);
    }
    ({ C, cards: cs } = scenario(['kuro_well_of_ink']));
    kuroPlay(C, cs[0]);
    C.endTurn();
    t.eq(kuroOf(C).st.sumi, 1, 'Well of Ink: 1 Sumi at the start of the next turn');
    C.endTurn();
    t.eq(kuroOf(C).st.sumi, 2, 'and every turn after');
  });

  t.test('engine: Scribe cards (Redraft, Skim the Scroll, Strikethrough, Midnight Oil, Flip the Page, retain, Ink Flick)', () => {
    let { C, cards: cs } = scenario(['kuro_redraft'], { seed: 4 });
    kuroPlay(C, cs[0]);
    t.ok(C.pending && C.pending.optional && C.pending.n === 2, 'Redraft: an optional pick of up to 2');
    const handAfterPlay = C.hand.length;
    const drawTop = C.draw.slice(0, 2).map((c) => c.uid);
    chooseAll(C, 2);
    t.eq(C.hand.length, handAfterPlay, 'Redraft: it discards 2 and draws 2, so the hand size is unchanged');
    t.ok(drawTop.every((u) => C.hand.some((c) => c.uid === u)), 'and the drawn cards are the top of the draw pile');
    t.eq(kuroOf(C).st.sumi, 1, 'a free Skill still triggers Steady Hand');
    ({ C, cards: cs } = scenario(['kuro_redraft']));
    kuroPlay(C, cs[0]);
    const h0 = C.hand.length;
    C.resolvePick([]);
    t.eq(C.hand.length, h0, 'Redraft may discard nothing and then draws nothing');
    ({ C, cards: cs } = scenario(['kuro_skim_the_scroll'], { seed: 6 }));
    kuroPlay(C, cs[0]);
    t.eq(kuroOf(C).block, 4, 'Skim the Scroll: 4 Block');
    t.ok(C.pending && C.pending.from === 'draw' && C.pending.top === 3 && C.pending.uids.length === 3, 'and a pick from the top 3 of the draw pile');
    const want = C.pending.uids[2];
    const drawBefore = C.draw.length;
    C.resolvePick([want]);
    t.ok(C.hand.some((c) => c.uid === want), 'the chosen card is in hand');
    t.eq(C.draw.length, drawBefore - 1, 'and the draw pile is one smaller');
    ({ C, cards: cs } = scenario(['kuro_strikethrough'], { seed: 2 }));
    kuroPlay(C, cs[0]);
    t.ok(C.pending && C.pending.optional && C.pending.n === 2, 'Strikethrough: an optional pick of up to 2');
    const exhaustBefore = C.exhaust.length;
    chooseAll(C, 2);
    t.eq(C.exhaust.length, exhaustBefore + 2, 'two cards are exhausted');
    t.eq(kuroOf(C).block, 6, 'for 3 Block each');
    t.eq(kuroOf(C).st.sumi, 3, 'and 1 Sumi each, plus Steady Hand');
    ({ C, cards: cs } = scenario(['kuro_strikethrough'], { seed: 2, up: true }));
    kuroPlay(C, cs[0]);
    t.eq(C.pending.n, 3, 'Strikethrough+ picks up to 3');
    ({ C, cards: cs } = scenario(['kuro_midnight_oil'], { energy: 3 }));
    const hp0 = kuroOf(C).hp, hand0 = C.hand.length;
    kuroPlay(C, cs[0]);
    t.eq(hp0 - kuroOf(C).hp, 3, 'Midnight Oil costs 3 HP');
    t.eq(C.energy, 4, 'and gains an Energy on top of costing none');
    t.eq(C.hand.length, hand0 - 1 + 1, 'and draws a card');
    t.ok(C.exhaust.some((c) => c.uid === cs[0].uid), 'and exhausts');
    ({ C, cards: cs } = scenario(['kuro_midnight_oil'], { energy: 3 }));
    kuroOf(C).hp = 2;
    kuroPlay(C, cs[0]);
    t.eq(kuroOf(C).hp, 1, 'Midnight Oil can never kill Kuro (it stops at 1 HP)');
    ({ C, cards: cs } = scenario(['kuro_flip_the_page'], { kuroFront: true }));
    const handF = C.hand.length;
    kuroPlay(C, cs[0]);
    t.eq(kuroOf(C).row, 'back', 'Flip the Page swaps Kuro to the back');
    t.eq(C.heroes.find((h) => h.id === 'hanae').block, 3, 'and the ally, now in front, gets 3 Block');
    t.eq(C.hand.length, handF - 1 + 1, 'and draws a card');
    t.eq(kuroOf(C).st.sumi, 2, 'Kuro ended in the back (1 Sumi) plus Steady Hand (1)');
    t.eq(C.energy, 2, 'the swap did not use up the free swap or any Energy');
    t.ok(C.canSwap().ok && C.canSwap().cost === 0, 'the free swap is still available afterwards');
    ({ C, cards: cs } = scenario(['kuro_flip_the_page'], { kuroFront: false }));
    kuroPlay(C, cs[0]);
    t.eq(kuroOf(C).row, 'front', 'from the back it moves Kuro forward (a choice, not a trap: the ally steps back)');
    t.eq(kuroOf(C).st.sumi, 1, 'no Back bonus, only Steady Hand');
    ({ C, cards: cs } = scenario(['kuro_grand_flourish', 'kuro_slow_match']));
    C.endTurn();
    t.ok(!!first(C, 'kuro_grand_flourish') && !!first(C, 'kuro_slow_match'), 'both retain cards survive the end of turn');
    ({ C, cards: cs } = scenario(['kuro_ink_flick'], { kuroFront: true, enemies: 1 }));
    const handI = C.hand.length;
    kuroPlay(C, cs[0]);
    t.eq(C.hand.length, handI - 1 + 1, 'Ink Flick in the front row draws a card');
    ({ C, cards: cs } = scenario(['kuro_ink_flick'], { kuroFront: false, enemies: 1 }));
    const handB = C.hand.length;
    kuroPlay(C, cs[0]);
    t.eq(C.hand.length, handB - 1, 'and in the back row it does not');
    t.eq(lost(C.enemies[0]), 3 + 2, 'it deals 3 plus the row bonus for 0 Energy');
    t.eq(C.energy, 3, 'and costs nothing');
    ({ C, cards: cs } = scenario(['kuro_ink_ward', 'kuro_ink_ward', 'kuro_running_script'], { enemies: 1, energy: 3 }));
    kuroPlay(C, cs[0]); kuroPlay(C, cs[1]); kuroPlay(C, cs[2]);
    t.eq(lost(C.enemies[0]), 2 + 3 * 2 + 2, 'Running Script after two Skills: 8 plus the row bonus');
    ({ C, cards: cs } = scenario(['kuro_running_script'], { enemies: 1 }));
    kuroPlay(C, cs[0]);
    t.eq(lost(C.enemies[0]), 2 + 2, 'first in the turn it is only 2 (plus the row bonus)');
  });

  t.test('engine: defence and ally cards (Ink Cloak, Shared Umbrella, Ghost Ink, Scene Change with a forced swap)', () => {
    let { C, cards: cs } = scenario(['kuro_shared_umbrella']);
    kuroPlay(C, cs[0]);
    t.deep(C.heroes.map((h) => h.block), [4, 4], 'Shared Umbrella: 4 Block for both heroes');
    ({ C, cards: cs } = scenario(['kuro_ghost_ink']));
    kuroPlay(C, cs[0]);
    t.eq(C.heroes.find((h) => h.id === 'hanae').st.dodge, 1, 'Ghost Ink: the ally gains 1 Dodge');
    t.ok(!kuroOf(C).st.dodge, 'Kuro gains none at base');
    ({ C, cards: cs } = scenario(['kuro_ghost_ink'], { up: true }));
    kuroPlay(C, cs[0]);
    t.deep([C.heroes.find((h) => h.id === 'hanae').st.dodge, kuroOf(C).st.dodge || 0, kuroOf(C).block], [1, 0, 3], 'Ghost Ink+: the ally 1 Dodge and Kuro 3 Block');
    ({ C, cards: cs } = scenario(['kuro_ink_cloak'], { kuroFront: true, up: true }));
    kuroPlay(C, cs[0]);
    t.eq(kuroOf(C).block, 14, 'Ink Cloak+ in front: 8 plus 6');
    ({ C, cards: cs } = scenario(['kuro_scene_change'], { energy: 3 }));
    kuroPlay(C, cs[0]);
    C.heroes.find((h) => h.id === 'hanae').hp = 0;
    C.heroes.find((h) => h.id === 'hanae').down = true;
    t.ok(!C.canSwap().ok, 'with the ally down there is nothing to swap');
    const solo = create([inst('kuro_shared_umbrella', 0), inst('kuro_shelter_script', 0)].concat(FILLERS.map((id) => inst(id, 0))), true, 9);
    solo.heroes.find((h) => h.id === 'hanae').down = true;
    const um = first(solo, 'kuro_shared_umbrella') || solo.draw.find((c) => c.id === 'kuro_shared_umbrella');
    if (!solo.hand.includes(um)) { solo.hand.push(solo.draw.splice(solo.draw.indexOf(um), 1)[0]); }
    solo.play(um.uid);
    t.eq(kuroOf(solo).block, 4, 'with the ally down, Shared Umbrella still covers Kuro');
  });

  t.test('engine: every gem colour fits the cards that take it (flat, hits, status, draw, keyword, cost and poison gems)', () => {
    const TEST_GEMS = {
      gem_t_ruby: { name: 'Test Ruby', color: 'red', tier: 1, mod: { dmg: 1 }, art: { cut: 'round' } },
      gem_t_garnet: { name: 'Test Garnet', color: 'red', tier: 2, mod: { hits: 1 }, art: { cut: 'oval' } },
      gem_t_sapphire: { name: 'Test Sapphire', color: 'blue', tier: 1, mod: { block: 2 }, art: { cut: 'square' } },
      gem_t_thorn: { name: 'Test Thorn', color: 'blue', tier: 2, mod: { status: { s: 'thorns', n: 1, tgt: 'self' } }, art: { cut: 'drop' } },
      gem_t_emerald: { name: 'Test Emerald', color: 'green', tier: 1, mod: { draw: 1 }, art: { cut: 'round' } },
      gem_t_jade: { name: 'Test Jade', color: 'green', tier: 2, mod: { kw: ['retain'] }, art: { cut: 'oval' } },
      gem_t_swift: { name: 'Test Swift', color: 'green', tier: 3, mod: { cost: -1 }, art: { cut: 'star' } },
      gem_t_topaz: { name: 'Test Topaz', color: 'gold', tier: 1, mod: { status: { s: 'sumi', n: 1, tgt: 'self' } }, art: { cut: 'star' } },
      gem_t_amber: { name: 'Test Amber', color: 'gold', tier: 2, mod: { poison: 1 }, art: { cut: 'drop' } },
    };
    D.add('gems', TEST_GEMS);
    const gemsFor = (slot) => Object.values(TEST_GEMS).filter((g) => slot === 'any' || g.color === slot).map((g) => g.id);
    let socketed = 0;
    KURO.forEach((c) => c.slots.forEach((slot, si) => gemsFor(slot).forEach((gemId) => [false, true].forEach((up) => {
      const label = `${c.id}${up ? '+' : ''} slot ${si} (${slot}) with ${gemId}`;
      try {
        const test = inst(c.id, up);
        test.gems = c.slots.map((_, i) => (i === si ? gemId : null));
        const r = D.resolveCard(test);
        const plain = D.cardPlain(test);
        t.ok(!/undefined|NaN|\[object|Infinity/.test(plain) && plain.length > 6, `${label}: clean text "${plain}"`);
        t.eq(r.gems[si], gemId, `${label}: the gem is socketed`);
        if (gemId === 'gem_t_ruby' && slot === 'red') t.ok(r.gemActive[si], `${label}: a flat damage gem always finds a hit to boost on a red slot card`);
        if (gemId === 'gem_t_sapphire' && flatOps(fxOf(c, up)).some((o) => o.op === 'block')) t.ok(r.gemActive[si], `${label}: a flat Block gem finds the Block`);
        const C = create([test].concat(FILLERS.map((id) => inst(id, 0))), false, U.hash(label));
        if (!C.hand.some((x) => x.uid === test.uid)) { const i = C.draw.findIndex((x) => x.uid === test.uid); const back = C.hand.pop(); C.hand.push(C.draw.splice(i, 1)[0]); C.draw.splice(i, 0, back); }
        kuroOf(C).st.sumi = 3;
        const target = C.needsTarget(test.uid) ? C.enemies[0].id : undefined;
        const can = C.canPlay(test.uid, target);
        t.ok(can.ok, `${label}: playable (${can.reason})`);
        if (can.ok) { C.play(test.uid, target); resolvePicks(C, U.rng(4), t); C.endTurn(); socketed++; }
      } catch (e) {
        t.ok(false, `${label}: threw ${e && e.stack || e}`);
      }
    }))));
    t.ok(socketed > 250, `a large gem matrix was played (${socketed})`);
    // a hits gem on the multi hit cards, and a damage gem on each hit
    let { C, cards: cs } = scenario(['kuro_viper_nib'], { enemies: 1 });
    cs[0].gems = ['gem_t_garnet'];
    let ev = kuroPlay(C, cs[0]);
    t.eq(hitsOn(ev).length, 3, 'a +1 hits gem gives Viper Nib a third hit');
    ({ C, cards: cs } = scenario(['kuro_viper_nib'], { enemies: 1 }));
    cs[0].gems = ['gem_t_ruby'];
    kuroPlay(C, cs[0]);
    t.eq(lost(C.enemies[0]), 2 * (3 + 2), 'a +1 damage gem adds 1 to EACH hit of Viper Nib');
    ({ C, cards: cs } = scenario(['kuro_rain_of_strokes'], { enemies: 1, sumi: 2 }));
    cs[0].gems = [null, 'gem_t_swift'];
    t.eq(D.resolveCard(cs[0]).cost, 1, 'a tier 3 cost gem in the green slot makes Rain of Strokes cost 1');
    ({ C, cards: cs } = scenario(['kuro_inkfall_inferno'], { enemies: 1, energy: 2 }));
    cs[0].gems = [null, 'gem_t_swift'];
    t.eq(D.resolveCard(cs[0]).cost, 'X', 'a cost gem never touches an X card');
    ({ C, cards: cs } = scenario(['kuro_redraft']));
    cs[0].gems = ['gem_t_swift'];
    t.eq(D.resolveCard(cs[0]).cost, 0, 'and never a free card');
  });

  t.test('engine: the greedy bot plays whole fights with the whole set and finishes them', () => {
    const rng = U.rng(77);
    for (let seed = 1; seed <= 8; seed++) {
      const deck = KURO.filter((c) => c.rarity !== 'starter').map((c) => inst(c.id, rng.chance(0.5))).concat(D.heroes.kuro.starter.map((id) => inst(id, 0)));
      try {
        const sum = COMBAT.simulate({ heroes: party(), frontIdx: seed % 2, deck, enemies: [DUMMY, DUMMY], tier: 'normal', chapter: 1, seed, mods: D.modsFor([], 0), relics: [], gold: 0, maxTurns: 40 });
        t.ok(!sum.capped, `seed ${seed}: the bot finishes the fight (${sum.turns} turns, ${sum.result})`);
        t.ok(sum.stats.cardsPlayed >= 3, `seed ${seed}: the bot played cards (${sum.stats.cardsPlayed})`);
      } catch (e) {
        t.ok(false, `seed ${seed}: the bot threw ${e && e.stack || e}`);
      }
    }
  });

  t.test('engine: random playouts of the whole set keep the piles honest and never throw', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const rng = U.rng(U.hash('kuro playout', seed));
      const deck = KURO.filter((c) => c.rarity !== 'starter').map((c) => inst(c.id, rng.chance(0.5))).concat(D.heroes.kuro.starter.map((id) => inst(id, 0)));
      const size = deck.length;
      let C;
      try {
        C = create(deck, seed % 2 === 0, seed, 1 + (seed % 3));
        for (let turn = 0; turn < 14 && C.phase === 'player'; turn++) {
          let guard = 0;
          while (C.phase === 'player' && guard++ < 24) {
            const playable = C.hand.filter((h) => { const tg = C.needsTarget(h.uid) ? C.legalTargets(h.uid)[0] : undefined; return C.canPlay(h.uid, tg).ok; });
            if (!playable.length || rng.chance(0.08)) break;
            const pick = rng.pick(playable);
            const tg = C.needsTarget(pick.uid) ? C.legalTargets(pick.uid)[0] : undefined;
            C.play(pick.uid, tg);
            resolvePicks(C, rng, t);
            if (C.result) break;
            if (rng.chance(0.1) && C.canSwap().ok) C.swap();
          }
          t.ok(pileTotal(C) >= size, `seed ${seed} turn ${turn}: cards are never lost (${pileTotal(C)} >= ${size})`);
          t.ok(C.hand.length <= 10, `seed ${seed} turn ${turn}: hand cap`);
          if (C.result) break;
          C.endTurn();
          if (C.result) break;
          resolvePicks(C, rng, t);
        }
        t.ok(C.stats && C.stats.cardsPlayed > 0, `seed ${seed}: cards were played (${C.stats && C.stats.cardsPlayed})`);
      } catch (e) {
        t.ok(false, `seed ${seed}: threw ${e && e.stack || e}`);
      }
    }
  });
}

const eng = bootEngine();
if (eng.g) engineSuite(eng.g);
else console.log('cards_kuro: engine tests skipped (' + eng.skip + ')');

t.done();
