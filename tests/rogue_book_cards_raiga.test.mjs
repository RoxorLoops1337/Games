// Raiga's card set (rogue_book/js/data_cards_raiga.js): quotas, rules, budget bands, and real plays in the real engine.
//
// Layers of checking, cheapest first:
//   1. DATA.validate('cards', {hero:'raiga'}) has no errors and no warnings, and DATA.audit has no lines.
//   2. CONTENT_SPEC section 3 rules restated as assertions: counts and mix, X cost, row conds, ally cards, picks, keywords, slot rules per
//      rarity and per colour (red only with damage, blue only with Block/heal/hero status, gold on every power), art pairs, hero pose
//      share, flavor, locks, names (1 to 3 words, unique, no dashes), upgrades that really change something.
//   3. THE BUDGET CHECK. `evalCard` is a tiny expected-value interpreter for the effect DSL: it walks a card's ops in order against a
//      reference state and prices what the card produces in "points" (1 point = 1 damage or 1 Block), then subtracts what it spends
//      (Charge, Block, HP). It is a rough ruler, not the engine: it exists so a card cannot sneak far outside the power guidance of
//      CONTENT_SPEC section 3. The exchange rates (PT and PRICE) and the reference state (REF) are documented in the constants below.
//      A card is scored in the front row (weight 0.7, Raiga's home) and the back row (weight 0.3), then compared with a band:
//        cost 0        net points in [2, 7.5]         (exhaust cards [2, 11], one shot)
//        cost 1        net points in [4.5, 10.5]
//        cost 2, 3, X  net points per Energy in [4.5, 9.5]   (X is priced at X = 2)
//        power         net points per Energy in [3, 15] over a 4 turn horizon (powers pay back over a whole fight, so the top is generous)
//      An upgrade gets +30 percent headroom on the top of its band and must never lower the surplus (net minus 7 points per Energy).
//      Cards that are priced in the state they are built for (a sink with a bank, a finisher after a setup) list that state in SETUP.
//      The numbers are deliberately loose: the Wave 3 bot does the real balancing. The bands only catch typos and outliers.
//   4. Every card, base and upgraded, produces non-empty rules text through DATA.cardPlain with no undefined, NaN or [object] in it, and
//      stays under 110 characters.
//   5. With combat.js: every card plays in a synthetic fight in both rows with every possible partner without throwing, and a scenario per
//      card checks the numbers by hand (Raiga in front: Thorns 2 and 3 starting Block, no damage bonus; in back: +1 damage on every hit).
// Set RB_TABLE=1 to print the budget table. RB_STRICT=1 turns a missing or broken engine into a failure instead of a skip.
import fs from 'node:fs';
import path from 'node:path';
import { boot, harness, DIR } from './rogue_book_lib.mjs';

const t = harness('rogue_book cards raiga');
const STRICT = !!process.env.RB_STRICT;
const has = (file) => fs.existsSync(path.join(DIR, 'js', file));

// ---------------------------------------------------------------------------------------------- load
// data_text.js and combat.js belong to teammates: use them when they load, fall back to structure-only checks when they do not
let g = null, loadErr = null;
if (has('data_text.js') && has('combat.js')) { try { g = boot({ only: ['data_text', 'combat', 'data_cards_raiga'] }); if (!g.COMBAT) throw new Error('COMBAT namespace missing'); } catch (e) { loadErr = e; g = null; } }
if (!g && has('data_text.js')) { try { g = boot({ only: ['data_text', 'data_cards_raiga'] }); } catch (e) { loadErr = loadErr || e; g = null; } }
if (!g) g = boot({ only: ['data_cards_raiga'] });
if (loadErr) console.log('  note: an engine layer did not load (' + (loadErr.message || loadErr) + '), some checks are skipped');
const { DATA, U, COMBAT } = g;
t.ok(!g._errors || g._errors.length === 0, 'the card file loads without errors: ' + JSON.stringify(g._errors));
const L = DATA.LISTS;
const cards = Object.values(DATA.cards).filter((c) => c.hero === 'raiga');
const byId = (id) => DATA.cards[id];
const nonToken = cards.filter((c) => c.rarity !== 'token');
const ids = (f) => nonToken.filter(f).map((c) => c.id);
const flat = (fx) => { const out = []; DATA.walkOps(fx, (o) => out.push(o)); return out; };
const allOps = (c) => flat(c.fx);
const bothOps = (c) => flat(c.fx).concat(flat(c.up && c.up.fx));
const resolveDef = (c, up) => {
  if (!up) return { cost: c.cost, fx: c.fx, kw: c.kw || [] };
  const u = c.up || {};
  return { cost: u.cost !== undefined ? u.cost : c.cost, fx: u.fx || c.fx, kw: u.kw || c.kw || [] };
};
const words = (s) => s.trim().split(/\s+/).length;
const inst = (id, up) => ({ uid: U.uid(), id, up: up ? 1 : 0, gems: (byId(id).slots || []).map(() => null) });

// ---------------------------------------------------------------------------------------------- validator and audit
t.test('DATA.validate is clean for raiga: no errors, no warnings', () => {
  const v = DATA.validate('cards', { hero: 'raiga' });
  t.eq(v.errors.length, 0, 'validate errors: ' + v.errors.join(' | '));
  t.eq(v.warnings.length, 0, 'validate warnings: ' + v.warnings.join(' | '));
  t.eq(cards.length, 37, 'only raiga cards are registered by this file, all 37 of them');
});
t.test('DATA.audit has no lines for raiga', () => {
  const a = DATA.audit('cards', { hero: 'raiga' });
  t.eq(a.length, 0, 'audit lines: ' + a.join(' | '));
});

// ---------------------------------------------------------------------------------------------- counts and mix
t.test('counts: 3 starters, 14 commons, 12 uncommons, 8 rares, no tokens', () => {
  const n = (r) => nonToken.filter((c) => c.rarity === r).length;
  t.eq(n('starter'), 3, 'starters'); t.eq(n('common'), 14, 'commons'); t.eq(n('uncommon'), 12, 'uncommons'); t.eq(n('rare'), 8, 'rares');
  t.eq(cards.length, 37, 'total');
  t.eq(cards.filter((c) => c.rarity === 'token').length, 0, 'no card here adds a token, so none is defined');
  t.ok(!cards.some((c) => bothOps(c).some((o) => o.op === 'add')), 'no card uses the add op');
});
t.test('starters match DATA.heroes.raiga.starter and the fixed ids', () => {
  const st = DATA.heroes.raiga.starter;
  t.deep([...new Set(st)].sort(), ['raiga_brace', 'raiga_jab', 'raiga_static_fist'], 'starter ids');
  st.forEach((id) => t.ok(byId(id) && byId(id).rarity === 'starter', id + ' is a starter'));
  t.deep(ids((c) => c.rarity === 'starter').sort(), ['raiga_brace', 'raiga_jab', 'raiga_static_fist'], 'only those are starters');
  t.eq(byId('raiga_jab').type, 'attack', 'jab is the strike'); t.eq(byId('raiga_brace').type, 'skill', 'brace is the defence');
  t.eq(byId('raiga_static_fist').type, 'attack', 'the signature is an attack that builds and reads Charge');
  t.ok(allOps(byId('raiga_static_fist')).some((o) => o.s === 'charge') && allOps(byId('raiga_static_fist')).some((o) => o.op === 'dmg' && o.n.s === 'charge'), 'the signature both reads and gives Charge');
});
t.test('mix: 30 percent attacks, 30 percent skills, 4 or more powers, an X card', () => {
  const n = (ty) => nonToken.filter((c) => c.type === ty).length;
  t.ok(n('attack') >= nonToken.length * 0.3, 'attacks ' + n('attack'));
  t.ok(n('skill') >= nonToken.length * 0.3, 'skills ' + n('skill'));
  t.ok(n('power') >= 4, 'powers ' + n('power'));
  t.eq(n('attack') + n('skill') + n('power'), 37, 'only attack, skill and power types');
  nonToken.filter((c) => c.type === 'power').forEach((c) => t.ok(c.rarity === 'uncommon' || c.rarity === 'rare', c.id + ': powers are uncommon or rare'));
  t.ok(nonToken.some((c) => c.cost === 'X'), 'an X cost card');
  nonToken.filter((c) => c.type === 'power').forEach((c) => t.ok(flat(c.fx).some((o) => o.op === 'hook' || o.op === 'status'), c.id + ': a power is built from hook and status ops'));
});
t.test('mechanic quotas: row conds, ally cards, picks, keywords, with margin', () => {
  const rowCond = ids((c) => allOps(c).some((o) => o.op === 'cond' && o.if && o.if.row));
  const ally = ids((c) => allOps(c).some((o) => o.tgt === 'ally' || o.tgt === 'both' || (o.n && typeof o.n === 'object' && o.n.who === 'ally')));
  const picks = ids((c) => allOps(c).some((o) => o.op === 'pick'));
  const kw = ids((c) => (c.kw || []).length > 0);
  t.ok(rowCond.length >= 3, 'cards with cond on row: ' + rowCond.join(','));
  t.ok(ally.length >= 4, 'cards touching the ally: ' + ally.join(','));
  t.ok(picks.length >= 2, 'pick cards: ' + picks.join(','));
  t.ok(kw.length >= 5, 'cards with keywords: ' + kw.join(','));
  t.ok(rowCond.length >= 5 && ally.length >= 6 && kw.length >= 6, 'a little margin over the quotas (' + rowCond.length + ' row conds, ' + ally.length + ' ally cards, ' + kw.length + ' keyword cards)');
  t.ok(nonToken.some((c) => allOps(c).some((o) => o.op === 'swap')), 'a card that swaps rows exists');
  t.ok(nonToken.some((c) => allOps(c).some((o) => o.op === 'hook' && o.filter && o.filter.hero === 'any')), 'a card that rewards either hero exists (the partner is unknown)');
});
t.test('every archetype has an engine and a finisher (the design promise)', () => {
  const ops = (id) => { t.ok(!!byId(id), id + ' exists'); return allOps(byId(id)); };
  const spends = (o) => o.consume === 'charge' || (o.consume && o.consume.s === 'charge') || (o.op === 'removeStatus' && o.s === 'charge');
  // STORM: builders and sinks
  ['raiga_static_fist', 'raiga_hard_knock', 'raiga_draw_lightning', 'raiga_bring_it_on', 'raiga_temple_gong'].forEach((id) => t.ok(ops(id).some((o) => o.op === 'status' && o.s === 'charge') || id === 'raiga_temple_gong', id + ' builds Charge'));
  ['raiga_living_conduit', 'raiga_storm_taiko', 'raiga_storms_eye', 'raiga_unshaken_mind', 'raiga_tiger_and_crane'].forEach((id) => t.ok(ops(id).some((o) => o.op === 'status' && o.s === 'charge'), id + ' feeds Charge'));
  ['raiga_chain_lightning', 'raiga_thousand_thunders'].forEach((id) => t.ok(ops(id).some(spends), id + ' spends Charge'));
  ['raiga_rolling_thunder', 'raiga_static_fist'].forEach((id) => t.ok(ops(id).some((o) => o.op === 'dmg' && o.n && o.n.s === 'charge'), id + ' scales damage with Charge'));
  t.ok(ops('raiga_chain_lightning').some((o) => o.op === 'dmg' && o.tgt === 'random' && o.hits && o.hits.s === 'charge'), 'Chain Lightning hits a random enemy once per Charge');
  t.ok(ops('raiga_thousand_thunders').some((o) => o.op === 'dmg' && o.tgt === 'all'), 'Thousand Thunders is an area finisher');
  t.ok(ops('raiga_raijin_hammer').some((o) => o.op === 'energy') && byId('raiga_raijin_hammer').cost === 3, 'the 3 cost hammer refunds Energy for Charge');
  // RETALIATION: Thorns, damage and status when hit, hurting himself, and pain payoffs
  ['raiga_bramble_stance', 'raiga_lightning_rod', 'raiga_thornstorm'].forEach((id) => t.ok(ops(id).some((o) => o.op === 'status' && o.s === 'thorns'), id + ' deals in Thorns'));
  t.ok(ops('raiga_thornstorm').some((o) => o.op === 'hook' && o.on === 'turnStart') && ops('raiga_thornstorm').some((o) => o.op === 'dmg' && o.n.s === 'thorns' && o.tgt === 'all'), 'Thornstorm turns Thorns into damage at turn start');
  t.ok(ops('raiga_waiting_storm').some((o) => o.op === 'hook' && o.on === 'onDamaged' && o.once), 'Waiting Storm is a one shot trap on being hit');
  t.ok(ops('raiga_long_memory').some((o) => o.op === 'hook' && o.on === 'onDamaged'), 'Long Memory answers being hit');
  ['raiga_hard_knock', 'raiga_draw_lightning', 'raiga_blood_and_thunder', 'raiga_bring_it_on'].forEach((id) => t.ok(ops(id).some((o) => o.op === 'hurt'), id + ' hurts him for power'));
  t.ok(ops('raiga_heavens_answer').some((o) => o.op === 'dmg' && o.n.per === 'damageTaken'), 'Heaven\'s Answer pays for damage taken');
  t.ok(ops('raiga_repay_in_kind').some((o) => o.op === 'dmg' && o.n.per === 'hitsTaken'), 'Repay in Kind pays for hits taken');
  t.ok(ops('raiga_mountain_vow').some((o) => o.op === 'block' && o.n.per === 'missingHp') && ops('raiga_shared_burden').some((o) => o.op === 'block' && o.n.per === 'missingHp' && o.tgt === 'ally'), 'missing HP becomes Block, for him and for the ally');
  t.ok(ops('raiga_cornered_tiger').some((o) => o.op === 'cond' && o.if.hpPct), 'Cornered Tiger reads low HP');
  // BRAWLER: Stun, Burn, Mark, and the combo
  ['raiga_stilling_palm', 'raiga_deafening_thunderclap', 'raiga_waiting_storm'].forEach((id) => t.ok(ops(id).some((o) => o.op === 'status' && o.s === 'stun'), id + ' applies Stun'));
  ['raiga_ember_fist', 'raiga_flashpoint'].forEach((id) => t.ok(ops(id).some((o) => o.op === 'status' && o.s === 'burn'), id + ' works with Burn'));
  t.ok(ops('raiga_flashpoint').some((o) => o.n && o.n.per === 'status' && o.n.s === 'burn' && o.n.who === 'target'), 'Flashpoint doubles the target\'s Burn');
  t.ok(ops('raiga_static_field').some((o) => o.s === 'mark' && o.tgt === 'all') && ops('raiga_long_memory').some((o) => o.s === 'mark'), 'Mark on the line and on the attacker');
  t.ok(ops('raiga_sundering_blow').some((o) => o.op === 'cond' && o.if.targetStatus && o.if.targetStatus.s === 'stun'), 'Sundering Blow is the Stun payoff');
  t.ok(byId('raiga_sundering_blow').kw.includes('retain'), 'and it waits in hand for the Stun');
  t.ok(ops('raiga_drumroll').some((o) => o.op === 'repeat') && byId('raiga_drumroll').cost === 'X', 'Drumroll is a flurry that scales with Energy');
});

// ---------------------------------------------------------------------------------------------- names, text, art, flavor, locks
t.test('names: 1 to 3 words, unique, no dashes, no digits', () => {
  const names = nonToken.map((c) => c.name);
  t.eq(new Set(names).size, names.length, 'duplicate names inside the file');
  t.eq(new Set(names.map((n) => n.toLowerCase())).size, names.length, 'names differ ignoring case');
  names.forEach((n) => { t.ok(words(n) >= 1 && words(n) <= 3, n + ' has 1 to 3 words'); t.ok(/^[A-Z][A-Za-z' ]+$/.test(n), n + ' is plain words'); });
  nonToken.forEach((c) => t.ok(/^raiga_[a-z][a-z0-9_]*$/.test(c.id), c.id + ' is snake_case with the hero prefix'));
  const EM = String.fromCharCode(0x2014), EN = String.fromCharCode(0x2013);
  t.ok(!JSON.stringify(cards).includes(EM) && !JSON.stringify(cards).includes(EN), 'no em or en dashes in the data');
  t.ok(!nonToken.some((c) => c.text !== undefined), 'no hand typed text field (text is generated)');
  // names must also be unique across the heroes that already exist (the integration pass re-checks the whole game)
  const others = Object.values(DATA.cards).filter((c) => c.hero !== 'raiga').map((c) => c.name.toLowerCase());
  nonToken.forEach((c) => t.ok(!others.includes(c.name.toLowerCase()), c.name + ' is not used by another hero'));
});
t.test('art: every card has m and c, pairs are unique, hero poses on about half of the attacks', () => {
  nonToken.forEach((c) => { t.ok(L.motifs.includes(c.art.m), c.id + ' motif ' + c.art.m); t.ok(L.palettes.includes(c.art.c), c.id + ' palette ' + c.art.c); });
  const pairs = nonToken.map((c) => c.art.m + '/' + c.art.c);
  t.eq(new Set(pairs).size, pairs.length, 'duplicate art.m plus art.c pair');
  const atk = nonToken.filter((c) => c.type === 'attack'); const heroAtk = atk.filter((c) => c.art.hero);
  t.ok(heroAtk.length >= atk.length * 0.35 && heroAtk.length <= atk.length * 0.65, `hero pose on ${heroAtk.length} of ${atk.length} attacks (about half)`);
  t.ok(new Set(nonToken.map((c) => c.art.m)).size >= 24, 'a wide spread of motifs: ' + new Set(nonToken.map((c) => c.art.m)).size);
  t.ok(nonToken.filter((c) => c.type !== 'attack' && c.art.hero).length === 0, 'the hero pose is for attacks');
});
t.test('flavor: every rare, and at least a third of the rest', () => {
  nonToken.filter((c) => c.rarity === 'rare').forEach((c) => t.ok(typeof c.flavor === 'string' && c.flavor.length > 8, c.id + ' has a flavor line'));
  const rest = nonToken.filter((c) => c.rarity !== 'rare');
  t.ok(rest.filter((c) => c.flavor).length >= Math.ceil(rest.length / 3), 'flavor on a third of the non-rares: ' + rest.filter((c) => c.flavor).length + ' of ' + rest.length);
  nonToken.filter((c) => c.flavor).forEach((c) => { t.ok(c.flavor.length <= 90, c.id + ' flavor is one short line'); t.ok(!/\d/.test(c.flavor), c.id + ' flavor carries no numbers'); });
});
t.test('locks: never on starters or commons, at most 4 uncommons and 4 rares, every archetype keeps unlocked engines and finishers', () => {
  t.eq(nonToken.filter((c) => c.locked && (c.rarity === 'starter' || c.rarity === 'common')).length, 0, 'no locked starters or commons');
  t.ok(nonToken.filter((c) => c.locked && c.rarity === 'uncommon').length <= 4, 'locked uncommons');
  t.ok(nonToken.filter((c) => c.locked && c.rarity === 'rare').length <= 4, 'locked rares');
  ['raiga_thousand_thunders', 'raiga_raijin_hammer', 'raiga_storms_eye', 'raiga_living_conduit', 'raiga_thornstorm', 'raiga_heavens_answer', 'raiga_mountain_vow',
    'raiga_lightning_rod', 'raiga_blood_and_thunder', 'raiga_long_memory', 'raiga_sundering_blow', 'raiga_cornered_tiger', 'raiga_drumroll', 'raiga_tiger_and_crane'].forEach((id) => t.ok(!byId(id).locked, id + ' is never locked (it carries an archetype)'));
});

// ---------------------------------------------------------------------------------------------- slots
t.test('slots: counts per rarity, colours per card, gold on powers, prism limit, colour totals', () => {
  nonToken.forEach((c) => {
    const n = c.slots.length;
    if (c.rarity === 'uncommon') t.ok(n >= 1 && n <= 2, c.id + ' uncommon slots ' + n); else if (c.rarity === 'rare') t.eq(n, 2, c.id + ' rare slots'); else t.eq(n, 1, c.id + ' slots');
    const top = c.fx.concat([]);   // gem flat mods only reach ops outside hook fx: a colour is only useful when its op is reachable
    const reach = []; const walk = (ops) => (ops || []).forEach((o) => { reach.push(o); if (o.op === 'cond') { walk(o.then); walk(o.else); } if (o.op === 'repeat') walk(o.do); }); walk(top);
    const blueOk = reach.some((o) => o.op === 'block' || o.op === 'heal' || (o.op === 'status' && (L.heroTgt.includes(o.tgt) || (o.tgt === undefined && !DATA.isDebuff(o.s)))));
    if (c.slots.includes('red')) t.ok(reach.some((o) => o.op === 'dmg'), c.id + ': red slot needs a damage op that gems can reach (not only in a hook)');
    if (c.slots.includes('blue')) t.ok(blueOk, c.id + ': blue slot needs Block, heal or a hero status outside a hook');
    if (c.type === 'power') t.ok(c.slots.includes('gold'), c.id + ': every power has a gold slot');
    t.ok(new Set(c.slots).size === c.slots.length, c.id + ' does not repeat a slot colour');
  });
  t.ok(nonToken.filter((c) => c.rarity === 'rare' && c.slots.includes('any')).length <= 4, 'at most 4 rares with a prism slot');
  const colour = (col) => nonToken.filter((c) => c.slots.includes(col)).length;
  t.ok(colour('red') >= 10, 'red ' + colour('red')); t.ok(colour('blue') >= 10, 'blue ' + colour('blue'));
  t.ok(colour('green') >= 8, 'green ' + colour('green')); t.ok(colour('gold') >= 8, 'gold ' + colour('gold'));
  t.ok(colour('red') >= 11 && colour('blue') >= 11 && colour('green') >= 9 && colour('gold') >= 9, 'margin over the colour quotas: ' + ['red', 'blue', 'green', 'gold'].map((c) => c + ' ' + colour(c)).join(', '));
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
const ENEMIES = 2, AOE = 1.8, TURNS = 4, BACK_BONUS = 1, ENERGY = 7, PLAYS = 3.5;
// Points per stack for statuses, per unit for other effects. 1 point = 1 damage or 1 Block.
//  charge   2   Storm sinks pay 3 to 4 damage per Charge, and Storm Born makes it cheap to get, so it is priced under what it can cash in for
//  thorns   3   about three enemy hits over a fight; a stack given to the ally is worth half (only the front hero is hit)
//  might    6   permanent: every hit for the rest of the fight. mightTemp 2.5: this turn only
//  mark     2.5 one stack is +3 on one hit, and it may never be spent. burn 1.5: a stack deals about 1.5 over the next rounds
//  stun     6   a skipped action is worth about 8 points, discounted because bosses are immune and elites become immune after one
//  taunt    1.5 per round: it only redirects some attacks
const PT = { charge: 2, thorns: 3, might: 6, mightTemp: 2.5, mark: 2.5, burn: 1.5, stun: 6, vulnerable: 4, weak: 3, frail: 1.5, bulwark: 4, taunt: 1.5, dodge: 8, regen: 2, ritual: 20, plating: 4 };
const ALLY_MUL = { thorns: 0.5 };
const PRICE = { draw: 3.5, energy: 6.5, heal: 0.8, swap: 1.2, hurt: 1.0, pickDiscard: 1, pickExhaust: 1.5, pickUpgrade: 4, pickToHand: 3.5, pickRetain: 1.5, pickCopy: 5, revive: 12 };
// The reference state a card is priced in: mid fight, a partly built turn. Front row Raiga holds Thorns 2 and 3 starting Block and is being hit;
// back row Raiga is not hit, has no starting Block and no Thorns.
const REF = {
  front: { charge: 2, block: 3, thorns: 2, damageTaken: 8, hitsTaken: 2 },
  back: { charge: 2, block: 0, thorns: 0, damageTaken: 0, hitsTaken: 0 },
  allyBlock: 5, handSize: 3, drawPile: 12, discardPile: 6, exhaustPile: 1, cardsPlayed: 2, attacksPlayed: 1, skillsPlayed: 1, energy: 1,
  hp: 60, missingHp: 28, allyMissingHp: 15, enemies: ENEMIES, kills: 0, turn: 3, gems: 0, targetBlock: 0, picked: 1, X: 2, debuffs: 0, targetBurn: 4,
};
// Payoff cards are priced in the state they are built for (a finisher is clunky without its setup, by design)
const SETUP = { raiga_chain_lightning: { charge: 4 }, raiga_thousand_thunders: { charge: 4 }, raiga_raijin_hammer: { charge: 4 } };
const clone = (S) => Object.assign({}, S, { st: Object.assign({}, S.st), allySt: Object.assign({}, S.allySt), targetSt: Object.assign({}, S.targetSt) });
const fresh = (row, setup) => {
  const R0 = REF[row];
  const S = { row, block: R0.block, allyBlock: REF.allyBlock, st: { charge: R0.charge, thorns: R0.thorns }, allySt: {}, targetSt: { burn: REF.targetBurn }, X: REF.X, cardsPlayed: REF.cardsPlayed, attacksPlayed: REF.attacksPlayed, damageTaken: R0.damageTaken, hitsTaken: R0.hitsTaken };
  const u = setup || {};
  if (u.charge !== undefined) S.st.charge = u.charge;
  if (u.block !== undefined) S.block = u.block;
  return S;
};
const stOf = (S, who, s) => ((who === 'ally' ? S.allySt : (who === 'target' || who === 'enemy') ? S.targetSt : S.st)[s] || 0);
function countOf(v, S) {
  switch (v.per) {
    case 'X': return S.X;
    case 'cardsPlayed': return S.cardsPlayed;
    case 'attacksPlayed': return S.attacksPlayed;
    case 'block': return v.who === 'ally' ? S.allyBlock : S.block;
    case 'status': return stOf(S, v.who, v.s);
    case 'missingHp': return v.who === 'ally' ? REF.allyMissingHp : REF.missingHp;
    case 'front': return S.row === 'front' ? 1 : 0;
    case 'damageTaken': return S.damageTaken;
    case 'hitsTaken': return S.hitsTaken;
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
const heroMult = (tgt, s) => (tgt === 'both' ? 1 + (ALLY_MUL[s] !== undefined ? ALLY_MUL[s] : 0.9) : tgt === 'ally' ? (ALLY_MUL[s] !== undefined ? ALLY_MUL[s] : 0.9) : 1);
const isRevertHook = (o) => o.op === 'hook' && (o.on === 'turnEnd' || o.on === 'turnStart') && o.once && o.fx.every((x) => x.op === 'status' && x.n < 0);
function condProb(c, S, hookMode) {
  let p = 1;
  Object.keys(c).forEach((k) => {
    const q = c[k]; let ok;
    if (k === 'row') ok = S.row === q ? 1 : 0;
    else if (k === 'status') { const n = stOf(S, q.who, q.s); ok = (q.gte === undefined || n >= q.gte) && (q.lte === undefined || n <= q.lte) ? 1 : 0; if (q.gte === undefined && q.lte === undefined) ok = n >= 1 ? 1 : 0; }
    else if (k === 'cardsPlayed' || k === 'attacksPlayed') { ok = q.lte === 0 ? 0.5 : ((q.gte === undefined || S[k] >= q.gte) && (q.lte === undefined || S[k] <= q.lte) ? 1 : 0); }
    else if (k === 'hpPct') ok = 0.3; else if (k === 'handEmpty') ok = 0.2; else if (k === 'lastKill') ok = 0.3; else if (k === 'targetStatus') ok = 0.5; else if (k === 'allyDown') ok = 0.05;
    else if (k === 'block') ok = hookMode ? 0.5 : ((q.gte === undefined || S.block >= q.gte) && (q.lte === undefined || S.block <= q.lte) ? 1 : 0);
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
  if (h.once) return { total: h.on === 'onDamaged' ? 0.8 : 1 };
  let r = { combatStart: 0.25, turnStart: 1, turnEnd: 1, onPlay: PLAYS, onDamaged: 1.6, onKill: 0.7, onSwap: 1.2, onHeroDown: 0.1, onShuffle: 0.35, onExhaust: 0.5 }[h.on];
  if (h.on === 'onPlay' && h.filter) {
    if (h.filter.type === 'attack') r = 1.6; else if (h.filter.type === 'skill') r = 1.5; else if (h.filter.type === 'power') r = 0.2;
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
        const per = n + (hookMode ? 0 : (S.row === 'back' ? BACK_BONUS : 0) + (S.st.might || 0));
        A.gross += Math.max(0, per) * hits * (o.tgt === 'all' ? AOE : o.tgt === 'others' ? 0.8 : 1) * (o.pierce ? 1.1 : 1);
        spend(o, S, A); break;
      }
      case 'block': {
        const n = Math.max(0, V(o.n, S) + (S.st.bulwark || 0));
        const tgt = o.tgt || 'self';
        A.gross += n * heroMult(tgt);
        if (tgt !== 'ally') S.block += n; else S.allyBlock += n;
        spend(o, S, A); break;
      }
      case 'heal': A.gross += V(o.n, S) * PRICE.heal * heroMult(o.tgt || 'self'); spend(o, S, A); break;
      case 'hurt': A.spent += V(o.n, S) * PRICE.hurt; break;
      case 'status': {
        const n = V(o.n, S), tgt = o.tgt || (DATA.isDebuff(o.s) ? 'enemy' : 'self');
        const hero = L.heroTgt.includes(tgt);
        if (hero) {
          const temp = revert && revert[o.s] && n > 0;
          const unit = temp ? (PT[o.s + 'Temp'] || PT[o.s] * 0.4) : PT[o.s];
          const sign = DATA.isDebuff(o.s) ? -1 : 1;
          A.gross += sign * n * unit * heroMult(tgt, o.s);
          if (tgt !== 'ally') S.st[o.s] = (S.st[o.s] || 0) + n;
          if (tgt === 'ally' || tgt === 'both') S.allySt[o.s] = (S.allySt[o.s] || 0) + n;
        } else if (DATA.isDebuff(o.s)) { A.gross += n * PT[o.s] * (tgt === 'all' ? AOE : 1); S.targetSt[o.s] = (S.targetSt[o.s] || 0) + n; }
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
      case 'pick': A.gross += Math.min(V(o.n, S), 2) * ({ discard: PRICE.pickDiscard, exhaust: PRICE.pickExhaust, upgrade: PRICE.pickUpgrade, toHand: PRICE.pickToHand, retain: PRICE.pickRetain, copy: PRICE.pickCopy, toDrawTop: 1 }[o.then] || 1) * (o.optional ? 0.5 : 1); break;
      case 'repeat': { const k = Math.max(0, V(o.n, S)); for (let i = 0; i < k; i++) evalOps(o.do, S, A, hookMode, revert); break; }
      case 'cond': {
        const p = condProb(o.if, S, hookMode);
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
  return { net, front: f.net, back: b.net, eq, metric, lo, hi, surplus, cost: d.cost };
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
    console.log('id'.padEnd(30) + 'r cost  front   back  metric  band          up     upBand        dSurplus');
    rows.forEach((r) => console.log(r.id.padEnd(30) + r.r + ' ' + String(r.cost).padEnd(4) + ' ' + r.front.toFixed(1).padStart(6) + ' ' + r.back.toFixed(1).padStart(6) + ' ' + r.metric.toFixed(2).padStart(7) + '  [' + r.band[0] + ',' + r.band[1] + ']'.padEnd(6) + ' ' + r.upMetric.toFixed(2).padStart(6) + '  [' + r.upBand[0] + ',' + r.upBand[1].toFixed(1) + ']  ' + r.dSurplus.toFixed(1)));
  }
});
t.test('budget: the ruler prices a few known cases sensibly (guards the ruler itself)', () => {
  const near = (a, b, m) => t.ok(Math.abs(a - b) < 0.05, `${m}: ${a} vs ${b}`);
  near(evalCard(resolveDef(byId('raiga_jab'), false), 'front').net, 6, 'Thunder Jab in front is 6 (Raiga has no front damage bonus)');
  near(evalCard(resolveDef(byId('raiga_jab'), false), 'back').net, 7, 'and 7 in the back');
  near(evalCard(resolveDef(byId('raiga_brace'), false), 'back').net, 5, 'Stone Brace is 5 in either row');
  const hk = evalCard(resolveDef(byId('raiga_hard_knock'), false), 'front'); near(hk.gross, 4 + 2, 'Hard Knock: 4 damage plus a Charge worth 2'); near(hk.spent, 2, 'and 2 HP paid');
  const cl = evalCard({ fx: [{ op: 'dmg', n: 3, hits: { per: 'status', s: 'charge' }, tgt: 'random' }, { op: 'removeStatus', s: 'charge', tgt: 'self' }] }, 'front', { charge: 4 }); near(cl.gross, 12, 'Chain Lightning with 4 Charge is 4 hits of 3'); near(cl.spent, 8, 'and spends 4 Charge at 2 each');
  const aoe = evalCard({ fx: [{ op: 'dmg', n: 5, tgt: 'all' }] }, 'back'); near(aoe.gross, 10.8, 'AoE is worth 1.8 targets (and +1 per hit in the back)');
  const might = evalCard({ fx: [{ op: 'status', s: 'might', n: 2, tgt: 'self' }, { op: 'hook', on: 'turnEnd', once: true, fx: [{ op: 'status', s: 'might', n: -2, tgt: 'self' }] }] }, 'front'); near(might.net, 5, 'temporary Might is 2.5 per stack');
  const rod = evalCard({ fx: [{ op: 'status', s: 'thorns', n: 2, tgt: 'both' }] }, 'front'); near(rod.net, 9, 'Thorns for both heroes is 3 per stack for him and half of that for the ally');
});

// ---------------------------------------------------------------------------------------------- text (needs data_text.js)
t.test('rules text: non-empty, clean and under 110 characters for every card, base and upgraded', () => {
  if (!DATA.cardPlain) { console.log('  note: data_text.js is not available, text checks skipped'); if (STRICT) t.ok(false, 'STRICT: data_text.js is required'); return; }
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
// Every expected number below is derived by hand from DESIGN.md 4.2 to 4.4. Raiga in FRONT: Thorns 2 and 3 starting Block at every turn start, no
// damage bonus. In the BACK: +1 damage on every hit, no starting Block, no Thorns. Storm Born gives 1 Charge for each of the first two enemy hits
// per round. Hook damage has no row or Might bonus. Enemy Block and hero Block only clear at the start of their owner's phase.
if (!COMBAT || !DATA.cardPlain) {
  const why = 'combat.js or data_text.js did not load';
  console.log('  note: engine checks skipped (' + why + ')');
  t.test('engine: available (only required under RB_STRICT=1)', () => { if (STRICT) t.ok(false, 'STRICT: ' + why); });
} else {
  const D = DATA, EU = U;
  const mkEnemy = (id, over) => { D.enemies[id] = Object.assign({ id, name: id, chapter: 1, tier: 'normal', size: 'm', hp: [900, 900], moves: { wait: { name: 'Wait', kind: 'none', fx: [] } }, ai: { seq: ['wait'] }, art: { id: 'kappa' }, lore: 'A patient target.', tags: ['spirit'] }, over || {}); return id; };
  const hitter = (fx) => ({ moves: { hit: { name: 'Hit', kind: 'attack', fx } }, ai: { seq: ['hit'] } });
  const IDLE = mkEnemy('rt_idle');                                                        // never acts: clean damage numbers
  const TAP = mkEnemy('rt_tap', hitter([{ op: 'dmg', n: 4, tgt: 'front' }]));              // one hit of 4 on the front hero
  const HEAVY = mkEnemy('rt_heavy', hitter([{ op: 'dmg', n: 9, tgt: 'front' }]));         // one hit of 9
  const TRIPLE = mkEnemy('rt_triple', hitter([{ op: 'dmg', n: 5, hits: 3, tgt: 'front' }])); // three hits of 5
  const BACKER = mkEnemy('rt_backer', hitter([{ op: 'dmg', n: 5, tgt: 'back' }]));         // dives on the back row (Taunt redirects it)
  const ELITE = mkEnemy('rt_elite', { tier: 'elite' });
  const BOSS = mkEnemy('rt_boss', { tier: 'boss', size: 'xl' });
  D.cards.hanae_rt_strike = { id: 'hanae_rt_strike', name: 'Test Strike', hero: 'hanae', type: 'attack', rarity: 'common', cost: 1, fx: [{ op: 'dmg', n: 5 }], up: { fx: [{ op: 'dmg', n: 7 }] }, kw: [], slots: ['red'], art: { m: 'slash', c: 'rose' } };
  const mk = (id, up) => ({ uid: EU.uid(), id, up: up ? 1 : 0, gems: (D.cards[id].slots || []).map(() => null) });
  const fight = (deck, o) => {
    o = o || {};
    const C = COMBAT.create({ heroes: [{ id: 'raiga', hp: o.hp === undefined ? 88 : o.hp, maxHp: 88 }, { id: o.partner || 'kuro', hp: o.allyHp === undefined ? 60 : o.allyHp, maxHp: 60 }], frontIdx: o.back ? 1 : 0,
      deck: deck.map((d) => (typeof d === 'string' ? mk(d) : mk(d.id, d.up))), enemies: o.enemies || [IDLE], tier: 'normal', chapter: 1, seed: o.seed || 11, mods: D.modsFor([], 0), relics: [], gold: 0 });
    C.start();
    return C;
  };
  const raiga = (C) => C.heroes.find((h) => h.id === 'raiga');
  const ally = (C) => C.heroes.find((h) => h.id !== 'raiga');
  const handOf = (C, id) => C.hand.find((c) => c.id === id);
  // answer a pending pick the way a player would: the first candidates offered
  const settle = (C) => { let guard = 0; while (C.pending && guard++ < 4) C.resolvePick(C.pending.uids.slice(0, C.pending.n)); };
  // put a card into the hand if the opening draw missed it (it keeps a test independent of the shuffle)
  const ensureInHand = (C, id) => {
    if (handOf(C, id)) return handOf(C, id);
    for (const pile of [C.draw, C.discard]) { const i = pile.findIndex((c) => c.id === id); if (i >= 0) { C.hand.push(pile.splice(i, 1)[0]); break; } }
    return handOf(C, id);
  };
  const play = (C, id, target) => { const c = ensureInHand(C, id); if (!c) throw new Error(id + ' is not in hand'); const ev = C.play(c.uid, target !== undefined ? target : (C.needsTarget(c.uid) ? C.legalTargets(c.uid)[0] : undefined)); settle(C); return ev; };
  const hpSum = (C) => C.enemies.reduce((sum, e) => sum + e.hp, 0);
  const st = (u, s) => u.st[s] || 0;
  const FILL = ['raiga_jab', 'raiga_jab', 'raiga_brace', 'raiga_brace'];
  const dealt = (C, id, setup) => { if (setup) setup(C); const b = hpSum(C); play(C, id); return b - hpSum(C); };
  const total = (C) => C.hand.length + C.draw.length + C.discard.length + C.exhaust.length + C.powers.length + (C.inPlay ? 1 : 0);

  // ---- generic safety
  t.test('engine: every card plays in both rows, base and upgraded, with each possible partner, without throwing', () => {
    nonToken.forEach((c) => [0, 1].forEach((up) => [false, true].forEach((back) => {
      const partner = ['hanae', 'kuro', 'suzu'][(c.id.length + up + (back ? 1 : 0)) % 3];
      const C = fight([{ id: c.id, up }].concat(FILL, ['raiga_jab', 'raiga_brace', 'raiga_jab']), { back, partner, enemies: [IDLE, TAP] });
      raiga(C).st.charge = 4; raiga(C).st.might = 1;
      const card = ensureInHand(C, c.id);
      if (!card) return t.ok(false, `${c.id} could not be put in hand`);
      const before = total(C);
      let threw = null;
      try { C.play(card.uid, C.needsTarget(card.uid) ? C.legalTargets(card.uid)[0] : undefined); settle(C); } catch (e) { threw = e; }
      t.ok(!threw, `${c.id}${up ? '+' : ''} ${back ? 'back' : 'front'} plays: ${threw && threw.message}`);
      t.ok(total(C) >= before, `${c.id}: conservation (${before} to ${total(C)})`);
    })));
  });
  t.test('engine: every card plays alone with no Charge, no Block and one enemy, then two whole rounds pass', () => {
    nonToken.forEach((c) => [0, 1].forEach((up) => {
      const C = fight([{ id: c.id, up }], { enemies: [TAP] });
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
      raiga(C).st.might = 2; raiga(C).st.charge = 3;
      const html = D.cardHtml(mk(c.id, 0), { unit: raiga(C), C });
      const plain = D.cardPlain(mk(c.id, 0), { unit: raiga(C), C });
      t.ok(html.length > 0 && !/undefined|NaN/.test(html) && !/undefined|NaN/.test(plain), `${c.id} live text (${back ? 'back' : 'front'}) is clean: ${plain}`);
    }));
  });
  t.test('engine: a fuzz of random decks and random legal actions never throws and keeps every pile whole', () => {
    const pool = nonToken.map((c) => c.id);
    for (let seed = 1; seed <= 40; seed++) {
      const r = EU.rng(seed * 7919);
      const deck = FILL.concat(r.sample(pool, 12)).map((id) => ({ id, up: r.chance(0.4) ? 1 : 0 }));
      const C = fight(deck, { seed, back: r.chance(0.3), partner: r.pick(['hanae', 'kuro', 'suzu']), enemies: r.pick([[TAP, TRIPLE], [BACKER, HEAVY, IDLE], [TRIPLE], [ELITE, TAP], [BOSS]]) });
      let threw = null, steps = 0;
      try {
        while (C.phase !== 'over' && steps++ < 400) {
          if (C.pending) { C.resolvePick(C.pending.optional ? [] : C.pending.uids.slice(0, C.pending.n)); continue; }
          const playable = C.hand.filter((c) => C.canPlay(c.uid, C.legalTargets(c.uid)[0]).ok);
          const roll = r();
          if (roll < 0.08 && C.canSwap().ok) C.swap();
          else if (playable.length && roll < 0.85) { const c = r.pick(playable); C.play(c.uid, C.legalTargets(c.uid)[0]); }
          else C.endTurn();
          const n = total(C);
          if (n !== C.deckSize + C.added) throw new Error('conservation broke: ' + n + ' vs ' + (C.deckSize + C.added));
          C.heroes.forEach((h) => { if (h.hp < 0 || h.hp > h.maxHp || h.block < 0) throw new Error('bad hero numbers ' + JSON.stringify([h.id, h.hp, h.block])); });
        }
      } catch (e) { threw = e; }
      t.ok(!threw, `fuzz seed ${seed}: ${threw && (threw.stack || threw.message)}`);
    }
  });

  // ---- the passive and the rows
  t.test('engine: Storm Born gives 1 Charge per enemy hit, twice per round, and Thorns 2 and 3 Block come with the front row', () => {
    const C = fight(['raiga_jab'].concat(FILL), { enemies: [TRIPLE] });
    t.eq(raiga(C).block, 3, 'front row starting Block'); t.eq(st(raiga(C), 'thorns'), 2, 'front row Thorns');
    const e = C.enemies[0].hp; C.endTurn();
    t.eq(st(raiga(C), 'charge'), 2, 'three hits, Storm Born pays for the first two'); t.eq(raiga(C).hp, 88 - (2 + 5 + 5), 'the first hit of 5 met 3 Block');
    t.eq(e - C.enemies[0].hp, 3 * 2, 'and three hits on Thorns 2 cost the attacker 6');
    const B = fight(['raiga_jab'].concat(FILL), { back: true, enemies: [TRIPLE] }); B.endTurn();
    t.eq(st(raiga(B), 'charge'), 0, 'in the back nothing hits him, so nothing charges'); t.eq(raiga(B).block, 0, 'no starting Block in the back'); t.eq(st(raiga(B), 'thorns'), 0, 'and no Thorns');
    t.eq(dealt(fight(['raiga_jab'].concat(FILL), { back: true }), 'raiga_jab'), 7, 'Thunder Jab hits for 6 + 1 in the back');
  });

  // ---- starters
  t.test('engine: Thunder Jab, Stone Brace and their upgrades', () => {
    t.eq(dealt(fight(['raiga_jab'].concat(FILL)), 'raiga_jab'), 6, 'Jab 6 in front');
    t.eq(dealt(fight([{ id: 'raiga_jab', up: 1 }].concat(FILL)), 'raiga_jab'), 8, 'Jab+ 8');
    const A = fight(['raiga_brace'].concat(FILL)); play(A, 'raiga_brace'); t.eq(raiga(A).block, 3 + 5, 'Brace: 3 starting Block + 5');
    const B = fight(['raiga_brace'].concat(FILL), { back: true }); play(B, 'raiga_brace'); t.eq(raiga(B).block, 5, 'Brace in the back: 5');
    const U = fight([{ id: 'raiga_brace', up: 1 }].concat(FILL)); play(U, 'raiga_brace'); t.eq(raiga(U).block, 3 + 8, 'Brace+ 8');
  });
  t.test('engine: Static Fist scales with Charge (up to 3), keeps it, adds one, and adds two in the back', () => {
    const Z = fight(['raiga_static_fist'].concat(FILL)); t.eq(dealt(Z, 'raiga_static_fist'), 3, 'no Charge: 3'); t.eq(st(raiga(Z), 'charge'), 1, 'and it charges');
    const A = fight(['raiga_static_fist'].concat(FILL)); t.eq(dealt(A, 'raiga_static_fist', (C) => { raiga(C).st.charge = 2; }), 3 + 2 * 2, 'two Charge: 7'); t.eq(st(raiga(A), 'charge'), 3, 'Charge is kept and grows');
    const M = fight(['raiga_static_fist'].concat(FILL)); t.eq(dealt(M, 'raiga_static_fist', (C) => { raiga(C).st.charge = 9; }), 3 + 2 * 3, 'the bonus stops at 3 Charge: 9'); t.eq(st(raiga(M), 'charge'), 10, 'the bank still grows');
    const K = fight(['raiga_static_fist'].concat(FILL), { back: true }); t.eq(dealt(K, 'raiga_static_fist'), 3 + 1, 'back row: +1 per hit'); t.eq(st(raiga(K), 'charge'), 2, 'and 2 Charge, because Storm Born is silent there');
    const P = fight([{ id: 'raiga_static_fist', up: 1 }].concat(FILL)); t.eq(dealt(P, 'raiga_static_fist', (C) => { raiga(C).st.charge = 4; }), 4 + 2 * 4, 'upgraded: 4 + 2 per Charge up to 4 = 12');
  });

  // ---- commons: attacks
  t.test('engine: Hard Knock is free damage and Charge for 2 HP (hurt never fires Storm Born and never kills)', () => {
    const C = fight(['raiga_hard_knock'].concat(FILL)); t.eq(dealt(C, 'raiga_hard_knock'), 4, 'deals 4'); t.eq(raiga(C).hp, 86, 'costs 2 HP'); t.eq(st(raiga(C), 'charge'), 1, 'gains exactly 1 Charge (Storm Born did not fire)'); t.eq(C.energy, 3, 'and costs no Energy');
    const L1 = fight(['raiga_hard_knock'].concat(FILL), { hp: 1 }); play(L1, 'raiga_hard_knock'); t.eq(raiga(L1).hp, 1, 'at 1 HP it cannot kill him'); t.ok(!raiga(L1).down, 'still standing');
    t.eq(dealt(fight([{ id: 'raiga_hard_knock', up: 1 }].concat(FILL)), 'raiga_hard_knock'), 6, 'upgraded: 6');
  });
  t.test('engine: Chain Lightning hits a random enemy once per Charge and empties the bank', () => {
    const C = fight(['raiga_chain_lightning'].concat(FILL), { enemies: [IDLE, IDLE] });
    t.eq(dealt(C, 'raiga_chain_lightning', (X) => { raiga(X).st.charge = 3; }), 3 * 3, 'three hits of 3, on either enemy'); t.eq(st(raiga(C), 'charge'), 0, 'the bank is spent');
    const E = fight(['raiga_chain_lightning'].concat(FILL)); t.eq(dealt(E, 'raiga_chain_lightning'), 0, 'with no Charge it does nothing'); t.eq(E.energy, 2, 'but still costs its Energy');
    const B = fight(['raiga_chain_lightning'].concat(FILL), { back: true }); t.eq(dealt(B, 'raiga_chain_lightning', (X) => { raiga(X).st.charge = 3; }), 3 * 4, 'back row: each hit gets +1');
    const U = fight([{ id: 'raiga_chain_lightning', up: 1 }].concat(FILL)); t.eq(dealt(U, 'raiga_chain_lightning', (X) => { raiga(X).st.charge = 4; }), 4 * 4, 'upgraded: 4 per hit');
    const both = fight(['raiga_chain_lightning'].concat(FILL), { enemies: [IDLE, IDLE] }); raiga(both).st.charge = 12; const b = both.enemies.map((e) => e.hp); play(both, 'raiga_chain_lightning');
    t.ok(b.every((h, i) => h > both.enemies[i].hp), 'twelve random hits reach both enemies');
  });
  t.test('engine: Rolling Thunder hits every enemy for 5 plus Charge (up to 3) and keeps the bank; the back row adds 2 and the +1 per hit', () => {
    const C = fight(['raiga_rolling_thunder'].concat(FILL), { enemies: [IDLE, IDLE] }); raiga(C).st.charge = 2; const b = C.enemies.map((e) => e.hp); play(C, 'raiga_rolling_thunder');
    C.enemies.forEach((e, i) => t.eq(b[i] - e.hp, 7, 'enemy ' + i + ' takes 5 + 2')); t.eq(st(raiga(C), 'charge'), 2, 'Charge is kept'); t.eq(C.energy, 1, 'it costs 2');
    const M = fight(['raiga_rolling_thunder'].concat(FILL)); t.eq(dealt(M, 'raiga_rolling_thunder', (X) => { raiga(X).st.charge = 8; }), 8, 'capped at 3 Charge: 8');
    const K = fight(['raiga_rolling_thunder'].concat(FILL), { back: true }); t.eq(dealt(K, 'raiga_rolling_thunder', (X) => { raiga(X).st.charge = 2; }), (7 + 1) + (2 + 1), 'back row: (5 + 2 + 1) + (2 + 1) = 11');
    t.eq(dealt(fight([{ id: 'raiga_rolling_thunder', up: 1 }].concat(FILL)), 'raiga_rolling_thunder'), 7, 'upgraded with no Charge: 7');
  });
  t.test('engine: Iron Palm hits and guards, guarding more in the front row', () => {
    const F = fight(['raiga_iron_palm'].concat(FILL)); t.eq(dealt(F, 'raiga_iron_palm'), 6, 'front: 6 damage'); t.eq(raiga(F).block, 3 + 2 + 2, 'front: 3 starting Block + 2 + 2');
    const B = fight(['raiga_iron_palm'].concat(FILL), { back: true }); t.eq(dealt(B, 'raiga_iron_palm'), 7, 'back: 6 + 1'); t.eq(raiga(B).block, 2, 'back: only 2 Block');
  });
  t.test('engine: Stilling Palm Stuns, a boss shrugs it off, and the Stun survives until the enemy tries to act', () => {
    const C = fight(['raiga_stilling_palm'].concat(FILL)); t.eq(dealt(C, 'raiga_stilling_palm'), 7, '7 damage'); t.eq(st(C.enemies[0], 'stun'), 1, 'Stunned'); t.eq(C.energy, 1, 'costs 2');
    const K = fight(['raiga_stilling_palm'].concat(FILL), { enemies: [TAP] }); play(K, 'raiga_stilling_palm'); const hp = raiga(K).hp; K.endTurn(); t.eq(raiga(K).hp, hp, 'a Stunned enemy skips its hit'); t.eq(st(K.enemies[0], 'stun'), 0, 'and the Stun is used up');
    const B = fight(['raiga_stilling_palm'].concat(FILL), { enemies: [BOSS] }); play(B, 'raiga_stilling_palm'); t.eq(st(B.enemies[0], 'stun'), 0, 'a boss is immune'); t.ok(B.events.some((e) => e.type === 'immune'), 'and says so');
    t.eq(dealt(fight([{ id: 'raiga_stilling_palm', up: 1 }].concat(FILL)), 'raiga_stilling_palm'), 10, 'upgraded: 10');
  });
  t.test('engine: Repay in Kind pays 3 per hit that got through (max 11), and Block that swallows a hit pays nothing', () => {
    const C = fight(['raiga_repay_in_kind'].concat(FILL), { enemies: [TRIPLE] }); C.endTurn();
    t.eq(dealt(C, 'raiga_repay_in_kind'), 11, 'three hits took HP: 2 + 9 = 11, the cap');
    const T2 = fight(['raiga_repay_in_kind'].concat(FILL), { enemies: [HEAVY] }); T2.endTurn(); t.eq(dealt(T2, 'raiga_repay_in_kind'), 2 + 3, 'one hit: 5');
    const G = fight(['raiga_repay_in_kind', 'raiga_brace'].concat(FILL), { enemies: [TAP] }); play(G, 'raiga_brace'); G.endTurn(); t.eq(st(raiga(G), 'charge'), 1, 'Storm Born still fired for the blocked hit'); t.eq(dealt(G, 'raiga_repay_in_kind'), 2, 'but a hit of 4 into 8 Block removed no HP, so it pays nothing');
    t.eq(dealt(fight(['raiga_repay_in_kind'].concat(FILL)), 'raiga_repay_in_kind'), 2, 'as the first card of the fight: 2');
    const U = fight([{ id: 'raiga_repay_in_kind', up: 1 }].concat(FILL), { enemies: [TRIPLE] }); U.endTurn(); t.eq(dealt(U, 'raiga_repay_in_kind'), 3 + 4 * 3, 'upgraded: 3 + 4 per hit = 15');
  });
  t.test('engine: Ember Fist hits and burns, and the Burn ticks and halves at the end of the round', () => {
    const C = fight(['raiga_ember_fist'].concat(FILL)); t.eq(dealt(C, 'raiga_ember_fist'), 3, '3 damage'); t.eq(st(C.enemies[0], 'burn'), 4, 'Burn 4');
    const b = C.enemies[0].hp; C.endTurn(); t.eq(b - C.enemies[0].hp, 4, 'the Burn cut for 4'); t.eq(st(C.enemies[0], 'burn'), 2, 'and halved');
    const U = fight([{ id: 'raiga_ember_fist', up: 1 }].concat(FILL)); play(U, 'raiga_ember_fist'); t.eq(st(U.enemies[0], 'burn'), 6, 'upgraded: Burn 6');
  });

  // ---- commons: skills
  t.test('engine: Bramble Stance guards and adds permanent Thorns that bite the attacker', () => {
    const C = fight(['raiga_bramble_stance'].concat(FILL), { enemies: [TAP] }); play(C, 'raiga_bramble_stance'); t.eq(raiga(C).block, 3 + 5, 'Block'); t.eq(st(raiga(C), 'thorns'), 3, 'Thorns 2 from the row + 1');
    const e = C.enemies[0].hp; C.endTurn(); t.eq(e - C.enemies[0].hp, 3, 'the attacker took 3'); t.eq(st(raiga(C), 'thorns'), 3, 'Thorns are permanent');
    const U = fight([{ id: 'raiga_bramble_stance', up: 1 }].concat(FILL)); play(U, 'raiga_bramble_stance'); t.eq(st(raiga(U), 'thorns'), 4, 'upgraded: +2'); t.eq(raiga(U).block, 3 + 6, 'and 6 Block');
    U.swap(); t.eq(st(raiga(U), 'thorns'), 2, 'stepping to the back takes the row Thorns away and keeps the card Thorns');
  });
  t.test('engine: Draw Lightning trades 2 HP for 2 Charge, and gives 3 in the back where nothing charges him', () => {
    const F = fight(['raiga_draw_lightning'].concat(FILL)); play(F, 'raiga_draw_lightning'); t.eq(raiga(F).hp, 86, 'costs 2 HP'); t.eq(st(raiga(F), 'charge'), 2, '2 Charge'); t.eq(F.energy, 3, 'for free');
    const B = fight(['raiga_draw_lightning'].concat(FILL), { back: true }); play(B, 'raiga_draw_lightning'); t.eq(st(raiga(B), 'charge'), 3, 'back row: 3');
    const U = fight([{ id: 'raiga_draw_lightning', up: 1 }].concat(FILL)); play(U, 'raiga_draw_lightning'); t.eq(st(raiga(U), 'charge'), 3, 'upgraded: 3 in front');
  });
  t.test('engine: Temple Gong shields both heroes and retains a card of your choice', () => {
    const C = fight(['raiga_temple_gong'].concat(FILL, ['raiga_jab'])); play(C, 'raiga_temple_gong');
    t.eq(raiga(C).block, 3 + 4, 'Raiga: 3 starting Block + 4'); t.eq(ally(C).block, 4, 'the ally: 4');
    const C2 = fight(['raiga_temple_gong', 'raiga_jab', 'raiga_jab', 'raiga_brace', 'raiga_brace']); const g0 = ensureInHand(C2, 'raiga_temple_gong');
    C2.play(g0.uid); t.ok(!!C2.pending && C2.pending.then === 'retain', 'a pick to retain a card is offered'); const keep = C2.pending.uids[0]; C2.resolvePick([keep]); C2.endTurn();
    t.ok(C2.hand.some((c) => c.uid === keep), 'the chosen card is still in hand next turn');
  });
  t.test('engine: Static Field Marks every enemy and every hit spends a stack for +3', () => {
    const C = fight(['raiga_static_field'].concat(FILL), { enemies: [IDLE, IDLE] }); play(C, 'raiga_static_field'); C.enemies.forEach((e) => t.eq(st(e, 'mark'), 2, 'Mark 2'));
    const b = C.enemies[0].hp; play(C, 'raiga_jab', C.enemies[0].id); t.eq(b - C.enemies[0].hp, 6 + 3, 'Jab + Mark 3'); t.eq(st(C.enemies[0], 'mark'), 1, 'one stack spent');
    const V1 = fight([{ id: 'raiga_static_field', up: 1 }].concat(FILL)); play(V1, 'raiga_static_field'); t.eq(st(V1.enemies[0], 'mark'), 3, 'upgraded: Mark 3');
  });
  t.test('engine: Static Field then Chain Lightning: every hit spends a Mark for +3', () => {
    const C = fight(['raiga_static_field', 'raiga_chain_lightning'].concat(FILL), { enemies: [IDLE] }); raiga(C).st.charge = 4; C.energy = 3;
    play(C, 'raiga_static_field'); const b = hpSum(C); play(C, 'raiga_chain_lightning');
    t.eq(b - hpSum(C), 4 * 3 + 2 * 3, 'four hits of 3, the first two carry +3'); t.eq(st(C.enemies[0], 'mark'), 0, 'both Marks spent');
  });
  t.test('engine: Still Water discards what you choose and draws as many back', () => {
    const deck = ['raiga_still_water', 'raiga_jab', 'raiga_jab', 'raiga_brace', 'raiga_brace', 'raiga_jab', 'raiga_jab', 'raiga_brace'];
    const C = fight(deck); ensureInHand(C, 'raiga_still_water'); const c = handOf(C, 'raiga_still_water'); const h0 = C.hand.length;
    C.play(c.uid); t.ok(!!C.pending && C.pending.optional && C.pending.n === 2, 'an optional pick of up to 2');
    C.resolvePick(C.pending.uids.slice(0, 2)); t.eq(C.hand.length, h0 - 1, 'the card left, 2 were discarded and 2 drawn: the hand is one smaller');
    const N = fight(deck); const c2 = ensureInHand(N, 'raiga_still_water'); const h1 = N.hand.length; N.play(c2.uid); N.resolvePick([]); t.eq(N.hand.length, h1 - 1, 'choosing nothing draws nothing'); t.eq(N.energy, 3, 'and it is always free');
  });
  t.test('engine: Rousing Roar gives both heroes Might for exactly one turn', () => {
    const C = fight(['raiga_rousing_roar'].concat(FILL)); play(C, 'raiga_rousing_roar'); C.heroes.forEach((h) => t.eq(st(h, 'might'), 2, h.id + ' has Might 2'));
    t.eq(dealt(C, 'raiga_jab'), 6 + 2, 'Jab hits for 8'); C.endTurn(); C.heroes.forEach((h) => t.eq(st(h, 'might'), 0, h.id + ' gave it back'));
    const S = fight(['raiga_rousing_roar'].concat(FILL)); play(S, 'raiga_rousing_roar'); S.hand = S.hand.filter((x) => x.id !== 'raiga_rousing_roar'); S.endTurn(); S.heroes.forEach((h) => t.eq(st(h, 'might'), 0, 'no Might left over on ' + h.id));
    t.eq(resolveDef(byId('raiga_rousing_roar'), true).cost, 0, 'upgraded it is free');
  });
  t.test('engine: Shared Burden turns Raiga\'s missing HP into the ally\'s Block (max 8)', () => {
    const A = fight(['raiga_shared_burden'].concat(FILL), { hp: 70 }); play(A, 'raiga_shared_burden'); t.eq(ally(A).block, 8, '18 missing, capped at 8'); t.eq(raiga(A).block, 3, 'Raiga gains nothing himself');
    const B = fight(['raiga_shared_burden'].concat(FILL), { hp: 85 }); play(B, 'raiga_shared_burden'); t.eq(ally(B).block, 3, '3 missing: 3');
    const Z = fight(['raiga_shared_burden'].concat(FILL)); play(Z, 'raiga_shared_burden'); t.eq(ally(Z).block, 0, 'at full HP nothing');
    const U = fight([{ id: 'raiga_shared_burden', up: 1 }].concat(FILL), { hp: 40 }); play(U, 'raiga_shared_burden'); t.eq(ally(U).block, 12, 'upgraded: capped at 12');
  });

  // ---- uncommons
  t.test('engine: Sundering Blow is 8 damage, or 26 against a Stunned target, and it waits in hand', () => {
    const A = fight(['raiga_sundering_blow'].concat(FILL)); t.eq(dealt(A, 'raiga_sundering_blow'), 8, 'unstunned: 8');
    const B = fight(['raiga_sundering_blow'].concat(FILL)); t.eq(dealt(B, 'raiga_sundering_blow', (C) => { C.enemies[0].st.stun = 1; }), 26, 'Stunned: 26');
    const R = fight(['raiga_sundering_blow'].concat(FILL)); R.endTurn(); t.ok(!!handOf(R, 'raiga_sundering_blow') || R.discard.every((c) => c.id !== 'raiga_sundering_blow'), 'retained through the end of the turn');
    const U = fight([{ id: 'raiga_sundering_blow', up: 1 }].concat(FILL)); t.eq(dealt(U, 'raiga_sundering_blow', (C) => { C.enemies[0].st.stun = 1; }), 32, 'upgraded: 32');
  });
  t.test('engine: Stun then smash: Stilling Palm then Sundering Blow costs 4 Energy, so it needs a spare Energy or a cheaper Stun (Waiting Storm)', () => {
    const C = fight(['raiga_stilling_palm', 'raiga_sundering_blow'].concat(FILL)); play(C, 'raiga_stilling_palm'); t.eq(C.energy, 1, '1 Energy left: the smash costs 2');
    C.energy = 4; const b = hpSum(C); play(C, 'raiga_sundering_blow'); t.eq(b - hpSum(C), 26, 'with the Energy for it, the Stunned target takes 26');
  });
  t.test('engine: Cornered Tiger doubles below half HP', () => {
    t.eq(dealt(fight(['raiga_cornered_tiger'].concat(FILL)), 'raiga_cornered_tiger'), 7, 'healthy: 7');
    t.eq(dealt(fight(['raiga_cornered_tiger'].concat(FILL), { hp: 44 }), 'raiga_cornered_tiger'), 7, 'exactly half HP is not below half: 7');
    t.eq(dealt(fight(['raiga_cornered_tiger'].concat(FILL), { hp: 43 }), 'raiga_cornered_tiger'), 15, 'below half: 7 + 8');
    t.eq(dealt(fight([{ id: 'raiga_cornered_tiger', up: 1 }].concat(FILL), { hp: 20 }), 'raiga_cornered_tiger'), 18, 'upgraded: 9 + 9');
    const H = fight(['raiga_hard_knock', 'raiga_hard_knock', 'raiga_cornered_tiger'].concat(FILL), { hp: 46 }); play(H, 'raiga_hard_knock'); t.eq(raiga(H).hp, 44, 'a Hard Knock takes him to exactly half'); play(H, 'raiga_hard_knock'); const b = hpSum(H); play(H, 'raiga_cornered_tiger'); t.eq(b - hpSum(H), 15, 'the second one tips him under half: Tiger hits for 15');
  });
  t.test('engine: Drumroll strikes and shields once per Energy', () => {
    const C = fight(['raiga_drumroll'].concat(FILL)); t.eq(dealt(C, 'raiga_drumroll'), 3 * 4, 'X = 3: three hits of 4'); t.eq(raiga(C).block, 3 + 3 * 2, 'and three walls of 2'); t.eq(C.energy, 0, 'X spends everything');
    const Z = fight(['raiga_drumroll'].concat(FILL)); Z.energy = 0; t.eq(dealt(Z, 'raiga_drumroll'), 0, 'X = 0 is legal and does nothing');
    const M = fight(['raiga_drumroll'].concat(FILL)); raiga(M).st.might = 2; t.eq(dealt(M, 'raiga_drumroll'), 3 * (4 + 2), 'every hit carries Might');
    const U = fight([{ id: 'raiga_drumroll', up: 1 }].concat(FILL)); t.eq(dealt(U, 'raiga_drumroll'), 3 * 5, 'upgraded: 5 per hit'); t.eq(raiga(U).block, 3 + 3 * 3, 'and 3 Block per hit');
  });
  t.test('engine: Lightning Rod gives both heroes permanent Thorns', () => {
    const C = fight(['raiga_lightning_rod'].concat(FILL)); play(C, 'raiga_lightning_rod'); t.eq(st(raiga(C), 'thorns'), 4, 'Raiga: 2 from the row + 2'); t.eq(st(ally(C), 'thorns'), 2, 'the ally: 2');
    C.endTurn(); t.eq(st(ally(C), 'thorns'), 2, 'and it lasts'); const U = fight([{ id: 'raiga_lightning_rod', up: 1 }].concat(FILL)); play(U, 'raiga_lightning_rod'); t.eq(st(ally(U), 'thorns'), 3, 'upgraded: 3');
  });
  t.test('engine: Blood and Thunder pays 6 HP for permanent Might 2 and a Charge, once per fight', () => {
    const C = fight(['raiga_blood_and_thunder'].concat(FILL)); play(C, 'raiga_blood_and_thunder'); t.eq(raiga(C).hp, 82, '6 HP'); t.eq(st(raiga(C), 'might'), 2, 'Might 2'); t.eq(st(raiga(C), 'charge'), 1, '1 Charge');
    t.ok(C.exhaust.some((c) => c.id === 'raiga_blood_and_thunder'), 'it exhausts'); C.endTurn(); t.eq(st(raiga(C), 'might'), 2, 'the Might is permanent');
    const U = fight([{ id: 'raiga_blood_and_thunder', up: 1 }].concat(FILL)); play(U, 'raiga_blood_and_thunder'); t.eq(raiga(U).hp, 84, 'upgraded: 4 HP'); t.eq(st(raiga(U), 'charge'), 2, 'and 2 Charge');
  });
  t.test('engine: Waiting Storm Stuns whoever hits him next, even into Block, and the Stun is still there on his turn', () => {
    const C = fight(['raiga_waiting_storm', 'raiga_sundering_blow'].concat(FILL), { enemies: [TAP] }); play(C, 'raiga_waiting_storm'); t.eq(raiga(C).block, 3 + 4, 'Block 4');
    t.eq(st(C.enemies[0], 'stun'), 0, 'nothing yet'); C.endTurn(); t.eq(raiga(C).hp, 88, 'the hit of 4 met 7 Block'); t.eq(st(C.enemies[0], 'stun'), 1, 'but the attacker is Stunned anyway');
    t.eq(C.enemies[0].intent.stunned, true, 'its intent says Stunned'); C.energy = 3; ensureInHand(C, 'raiga_sundering_blow'); const b = hpSum(C); play(C, 'raiga_sundering_blow'); t.eq(b - hpSum(C), 26, 'so Sundering Blow lands for 26 on his own turn');
    const T3 = fight(['raiga_waiting_storm'].concat(FILL), { enemies: [TRIPLE] }); play(T3, 'raiga_waiting_storm'); T3.endTurn(); t.eq(st(T3.enemies[0], 'stun'), 1, 'three hits, but the trap is one shot: still Stun 1');
    const E = fight(['raiga_waiting_storm'].concat(FILL), { enemies: [ELITE] }); play(E, 'raiga_waiting_storm'); t.eq(st(E.enemies[0], 'stun'), 0, 'no hit, no Stun');
  });
  t.test('engine: Flashpoint doubles the target\'s Burn, adds at most 12, and does nothing without Burn', () => {
    const A = fight(['raiga_flashpoint'].concat(FILL)); A.enemies[0].st.burn = 4; play(A, 'raiga_flashpoint'); t.eq(st(A.enemies[0], 'burn'), 8, '4 becomes 8');
    const B = fight(['raiga_flashpoint'].concat(FILL)); B.enemies[0].st.burn = 20; play(B, 'raiga_flashpoint'); t.eq(st(B.enemies[0], 'burn'), 32, 'at most +12 at once');
    const Z = fight(['raiga_flashpoint'].concat(FILL)); play(Z, 'raiga_flashpoint'); t.eq(st(Z.enemies[0], 'burn'), 0, 'nothing to double');
    const F = fight(['raiga_ember_fist', 'raiga_flashpoint', 'raiga_flashpoint'].concat(FILL)); F.energy = 3; play(F, 'raiga_ember_fist'); play(F, 'raiga_flashpoint'); play(F, 'raiga_flashpoint'); t.eq(st(F.enemies[0], 'burn'), 16, 'Ember Fist, Flashpoint, Flashpoint: Burn 4, 8, 16');
    t.eq(resolveDef(byId('raiga_flashpoint'), true).cost, 0, 'upgraded it is free');
  });
  t.test('engine: Tiger and Crane swaps, pays by the row he lands in, and the free swap brings him home for no Energy', () => {
    const C = fight(['raiga_tiger_and_crane'].concat(FILL, ['raiga_jab', 'raiga_jab'])); const h0 = C.hand.length; play(C, 'raiga_tiger_and_crane');
    t.eq(raiga(C).row, 'back', 'front to back'); t.eq(ally(C).row, 'front', 'the partner steps up'); t.eq(st(raiga(C), 'charge'), 1, 'the Crane charges'); t.eq(C.hand.length, h0 - 1 + 1, 'and draws a card'); t.eq(C.energy, 3, 'for free');
    t.eq(dealt(C, 'raiga_jab'), 7, 'the Jab in between gets the back-row +1'); t.eq(st(raiga(C), 'thorns'), 0, 'and no row Thorns while he is away');
    t.ok(C.canSwap().ok && C.canSwap().cost === 0, 'the free swap is still unused'); C.swap(); t.eq(raiga(C).row, 'front', 'home again'); t.eq(st(raiga(C), 'thorns'), 2, 'with his Thorns back'); t.eq(C.energy, 2, 'only the Jab cost Energy');
    const B = fight(['raiga_tiger_and_crane'].concat(FILL), { back: true }); play(B, 'raiga_tiger_and_crane'); t.eq(raiga(B).row, 'front', 'back to front'); t.eq(raiga(B).block, 5, 'the Tiger braces: 5 Block (the swap re-applies row statuses, not the starting Block)');
    const U = fight([{ id: 'raiga_tiger_and_crane', up: 1 }].concat(FILL)); play(U, 'raiga_tiger_and_crane'); t.eq(st(raiga(U), 'charge'), 2, 'upgraded: the Crane charges 2');
    const bound = fight(['raiga_tiger_and_crane'].concat(FILL)); bound.heroes.forEach((h) => { h.st.bind = 1; }); const row0 = raiga(bound).row; play(bound, 'raiga_tiger_and_crane'); t.eq(raiga(bound).row, row0, 'Bind stops the swap');
  });
  t.test('engine: Bring It On pays HP for Charge, draws the ally\'s hits onto Raiga, and shields the ally', () => {
    const C = fight(['raiga_bring_it_on'].concat(FILL), { enemies: [BACKER] }); play(C, 'raiga_bring_it_on');
    t.eq(raiga(C).hp, 85, '3 HP'); t.eq(st(raiga(C), 'charge'), 3, '3 Charge'); t.eq(st(raiga(C), 'taunt'), 2, 'Taunt 2'); t.eq(ally(C).block, 3, 'the ally gets 3 Block');
    C.endTurn(); t.eq(ally(C).hp, 60, 'the dive on the back row found Raiga instead'); t.eq(raiga(C).hp, 85 - 2, 'and Raiga took it: 5 damage into 3 starting Block'); t.eq(st(raiga(C), 'charge'), 4, 'which is one more Storm Born Charge');
    const N = fight(['raiga_jab'].concat(FILL), { enemies: [BACKER] }); N.endTurn(); t.eq(ally(N).hp, 60 - 5, 'without Taunt the ally eats it');
  });
  t.test('engine: Living Conduit pays a Charge for either hero\'s Attack, once per turn (twice upgraded), and is innate', () => {
    const C = fight(['raiga_living_conduit'].concat(FILL)); play(C, 'raiga_living_conduit'); t.eq(st(raiga(C), 'charge'), 0, 'nothing on its own play');
    play(C, 'raiga_jab'); t.eq(st(raiga(C), 'charge'), 1, 'his Attack: +1'); play(C, 'raiga_jab'); t.eq(st(raiga(C), 'charge'), 1, 'once per turn');
    const P = fight(['raiga_living_conduit', 'hanae_rt_strike'].concat(FILL), { partner: 'hanae' }); play(P, 'raiga_living_conduit'); play(P, 'hanae_rt_strike'); t.eq(st(raiga(P), 'charge'), 1, 'the PARTNER\'s Attack pays Raiga');
    const S = fight(['raiga_living_conduit', 'raiga_brace'].concat(FILL)); play(S, 'raiga_living_conduit'); play(S, 'raiga_brace'); t.eq(st(raiga(S), 'charge'), 0, 'a Skill does not');
    const U = fight([{ id: 'raiga_living_conduit', up: 1 }].concat(FILL)); play(U, 'raiga_living_conduit'); play(U, 'raiga_jab'); play(U, 'raiga_jab'); t.eq(st(raiga(U), 'charge'), 2, 'upgraded: twice per turn');
    for (let seed = 1; seed <= 5; seed++) t.ok(!!handOf(fight(['raiga_living_conduit'].concat(Array(12).fill('raiga_jab')), { seed }), 'raiga_living_conduit'), 'seed ' + seed + ': innate, in the opening hand');
  });
  t.test('engine: Long Memory Marks whoever hits him (up to twice per turn) and the Marks make his next hits land +3', () => {
    const C = fight(['raiga_long_memory'].concat(FILL), { enemies: [TRIPLE] }); play(C, 'raiga_long_memory'); C.endTurn();
    t.eq(st(C.enemies[0], 'mark'), 2, 'three hits, two Marks (the limit)'); t.eq(dealt(C, 'raiga_jab'), 6 + 3, 'Jab + Mark 3'); t.eq(st(C.enemies[0], 'mark'), 1, 'one stack spent');
    t.eq(resolveDef(byId('raiga_long_memory'), true).cost, 1, 'upgraded it costs 1');
    const Q = fight(['raiga_long_memory'].concat(FILL), { enemies: [TRIPLE] }); play(Q, 'raiga_long_memory'); Q.endTurn(); Q.endTurn(); t.ok(st(Q.enemies[0], 'mark') >= 2, 'it keeps working every round, not just once');
  });
  t.test('engine: Unshaken Mind turns a wall of Block into Charge and gives the ally a little Block', () => {
    const C = fight(['raiga_unshaken_mind', { id: 'raiga_brace', up: 1 }].concat(FILL)); play(C, 'raiga_unshaken_mind'); play(C, 'raiga_brace'); t.eq(raiga(C).block, 3 + 8, 'a wall of 11'); C.endTurn();
    t.eq(st(raiga(C), 'charge'), 2, '+2 Charge at the end of the turn'); t.ok(C.events.some((e) => e.type === 'block' && e.dst.id === ally(C).id && e.amount === 3), 'and the ally was given 3 Block (seen in the event log, before its own Block cleared)');
    const N = fight(['raiga_unshaken_mind', 'raiga_brace'].concat(FILL)); play(N, 'raiga_unshaken_mind'); play(N, 'raiga_brace'); N.endTurn(); t.eq(st(raiga(N), 'charge'), 0, '8 Block is not enough');
    const U = fight([{ id: 'raiga_unshaken_mind', up: 1 }, 'raiga_brace'].concat(FILL)); play(U, 'raiga_unshaken_mind'); play(U, 'raiga_brace'); U.endTurn(); t.eq(st(raiga(U), 'charge'), 2, 'upgraded: 8 Block is enough');
  });

  // ---- rares
  t.test('engine: Raijin\'s Hammer hits for 20 and, with 4 Charge, spends them for 2 Energy back', () => {
    const A = fight(['raiga_raijin_hammer'].concat(FILL)); t.eq(dealt(A, 'raiga_raijin_hammer', (C) => { raiga(C).st.charge = 4; }), 20, '20 damage'); t.eq(st(raiga(A), 'charge'), 0, 'Charge spent'); t.eq(A.energy, 2, '3 Energy paid, 2 refunded');
    const B = fight(['raiga_raijin_hammer'].concat(FILL)); raiga(B).st.charge = 3; play(B, 'raiga_raijin_hammer'); t.eq(A.energy - B.energy, 2, 'with 3 Charge there is no refund'); t.eq(st(raiga(B), 'charge'), 3, 'and the Charge stays');
    const R = fight(['raiga_raijin_hammer'].concat(FILL)); R.endTurn(); t.ok(!!handOf(R, 'raiga_raijin_hammer') || R.discard.every((c) => c.id !== 'raiga_raijin_hammer'), 'retained');
    const U = fight([{ id: 'raiga_raijin_hammer', up: 1 }].concat(FILL)); t.eq(dealt(U, 'raiga_raijin_hammer', (C) => { raiga(C).st.charge = 3; }), 24, 'upgraded: 24'); t.eq(U.energy, 2, 'and 3 Charge is enough');
    const K = fight(['raiga_raijin_hammer', 'raiga_draw_lightning', 'raiga_draw_lightning', 'raiga_jab'].concat(FILL)); play(K, 'raiga_draw_lightning'); play(K, 'raiga_draw_lightning'); play(K, 'raiga_raijin_hammer'); t.eq(K.energy, 2, 'two Draw Lightnings pay for it: 4 Charge, then the hammer costs 1 net'); t.eq(raiga(K).hp, 84, 'for 4 HP');
  });
  t.test('engine: Thousand Thunders spends up to 6 Charge for 4 damage each to EVERY enemy', () => {
    const C = fight(['raiga_thousand_thunders'].concat(FILL), { enemies: [IDLE, IDLE] }); raiga(C).st.charge = 5; const b = C.enemies.map((e) => e.hp); play(C, 'raiga_thousand_thunders');
    C.enemies.forEach((e, i) => t.eq(b[i] - e.hp, 20, 'enemy ' + i + ' takes 4 x 5')); t.eq(st(raiga(C), 'charge'), 0, 'the bank is spent'); t.eq(C.energy, 0, 'a whole turn');
    const M = fight(['raiga_thousand_thunders'].concat(FILL)); t.eq(dealt(M, 'raiga_thousand_thunders', (X) => { raiga(X).st.charge = 8; }), 24, 'capped at 6 Charge: 24'); t.eq(st(raiga(M), 'charge'), 2, 'the rest of the bank stays');
    const Z = fight(['raiga_thousand_thunders'].concat(FILL)); t.eq(dealt(Z, 'raiga_thousand_thunders'), 0, 'no Charge, no thunder');
    const U = fight([{ id: 'raiga_thousand_thunders', up: 1 }].concat(FILL)); raiga(U).st.charge = 6; play(U, 'raiga_thousand_thunders'); t.eq(U.energy, 1, 'upgraded it costs 2');
    const R = fight(['raiga_thousand_thunders'].concat(FILL)); R.endTurn(); t.ok(!!handOf(R, 'raiga_thousand_thunders') || R.discard.every((c) => c.id !== 'raiga_thousand_thunders'), 'retained');
  });
  t.test('engine: Heaven\'s Answer pays 6 plus the damage taken last enemy turn (max 24), and HP he spends himself counts', () => {
    const A = fight(['raiga_heavens_answer'].concat(FILL), { enemies: [TRIPLE] }); A.endTurn(); t.eq(raiga(A).hp, 76, 'he took 12'); t.eq(dealt(A, 'raiga_heavens_answer'), 6 + 12, '6 + 12 = 18');
    const B = fight(['raiga_heavens_answer'].concat(FILL)); t.eq(dealt(B, 'raiga_heavens_answer'), 6, 'nothing taken: 6');
    const H = fight(['raiga_heavens_answer', 'raiga_blood_and_thunder', 'raiga_hard_knock'].concat(FILL)); H.energy = 3; play(H, 'raiga_blood_and_thunder'); play(H, 'raiga_hard_knock'); t.eq(dealt(H, 'raiga_heavens_answer'), 6 + (6 + 2) + 2, 'Blood and Thunder (6 HP) and Hard Knock (2 HP) feed it, and its Might 2 lifts the hit: 16');
    const M = fight(['raiga_heavens_answer'].concat(FILL)); raiga(M)._dmgTaken = 50; t.eq(dealt(M, 'raiga_heavens_answer'), 24, 'capped at 24');
    t.eq(dealt(fight([{ id: 'raiga_heavens_answer', up: 1 }].concat(FILL), { enemies: [TRIPLE] }), 'raiga_heavens_answer'), 8, 'upgraded with nothing taken: 8');
  });
  t.test('engine: Mountain Vow gives 4 plus the missing HP as Block (max 18)', () => {
    const A = fight(['raiga_mountain_vow'].concat(FILL), { hp: 70 }); play(A, 'raiga_mountain_vow'); t.eq(raiga(A).block, 3 + 18, '18 missing plus 4 is 22, capped at 18, on top of the 3 starting Block');
    const Z = fight(['raiga_mountain_vow'].concat(FILL)); play(Z, 'raiga_mountain_vow'); t.eq(raiga(Z).block, 3 + 4, 'at full HP: 4');
    const S = fight(['raiga_mountain_vow'].concat(FILL), { hp: 80 }); play(S, 'raiga_mountain_vow'); t.eq(raiga(S).block, 3 + 4 + 8, '8 missing: 12');
    const U = fight([{ id: 'raiga_mountain_vow', up: 1 }].concat(FILL), { hp: 10 }); play(U, 'raiga_mountain_vow'); t.eq(raiga(U).block, 3 + 22, 'upgraded: capped at 22');
  });
  t.test('engine: Deafening Thunderclap Stuns everything that can be Stunned, once per fight', () => {
    const C = fight(['raiga_deafening_thunderclap'].concat(FILL), { enemies: [TAP, TAP, TAP] }); play(C, 'raiga_deafening_thunderclap'); C.enemies.forEach((e) => { t.eq(st(e, 'stun'), 1, 'Stunned'); t.eq(900 - e.hp, 5, '5 damage'); });
    const hp = raiga(C).hp; C.endTurn(); t.eq(raiga(C).hp, hp, 'the whole line skipped its turn'); t.ok(C.exhaust.some((c) => c.id === 'raiga_deafening_thunderclap'), 'exhausted');
    const B = fight(['raiga_deafening_thunderclap'].concat(FILL), { enemies: [BOSS, ELITE, IDLE] }); play(B, 'raiga_deafening_thunderclap'); t.eq(st(B.enemies[0], 'stun'), 0, 'the boss is immune'); t.eq(st(B.enemies[1], 'stun'), 1, 'the elite is stunned once'); t.eq(st(B.enemies[2], 'stun'), 1, 'the normal enemy too');
    t.eq(resolveDef(byId('raiga_deafening_thunderclap'), true).cost, 2, 'upgraded it costs 2');
  });
  t.test('engine: Storm\'s Eye gives 3 Charge now and doubles what every blow he takes pays (twice a round)', () => {
    const C = fight(['raiga_storms_eye'].concat(FILL), { enemies: [TRIPLE] }); play(C, 'raiga_storms_eye'); t.eq(st(raiga(C), 'charge'), 3, '3 now'); C.endTurn();
    t.eq(st(raiga(C), 'charge'), 3 + 2 + 2, 'three hits: Storm Born 2 and the Eye 2'); t.eq(resolveDef(byId('raiga_storms_eye'), true).cost, 1, 'upgraded it costs 1');
    const B = fight(['raiga_storms_eye'].concat(FILL), { back: true, enemies: [TRIPLE] }); play(B, 'raiga_storms_eye'); B.endTurn(); t.eq(st(raiga(B), 'charge'), 3, 'in the back row nobody hits him, so only the 3 up front arrive');
  });
  t.test('engine: Thornstorm adds Thorns and fires them at every enemy at the start of each turn (max 8)', () => {
    const C = fight(['raiga_thornstorm'].concat(FILL), { enemies: [IDLE, IDLE] }); play(C, 'raiga_thornstorm'); t.eq(st(raiga(C), 'thorns'), 3, 'Thorns 2 + 1'); const b = C.enemies.map((e) => e.hp);
    C.endTurn(); C.enemies.forEach((e, i) => t.eq(b[i] - e.hp, 3, 'enemy ' + i + ' takes 3 at the start of the turn'));
    const M = fight(['raiga_thornstorm'].concat(FILL)); play(M, 'raiga_thornstorm'); raiga(M).st.thorns = 20; const h = M.enemies[0].hp; M.endTurn(); t.eq(h - M.enemies[0].hp, 8, 'capped at 8');
    const K = fight(['raiga_thornstorm'].concat(FILL), { back: true }); play(K, 'raiga_thornstorm'); const kh = K.enemies[0].hp; K.endTurn(); t.eq(kh - K.enemies[0].hp, 1, 'in the back the card\'s own Thorns still fire: 1');
    const U = fight([{ id: 'raiga_thornstorm', up: 1 }].concat(FILL)); play(U, 'raiga_thornstorm'); t.eq(st(raiga(U), 'thorns'), 4, 'upgraded: Thorns 2 + 2');
  });
  t.test('engine: Storm Taiko fires on every third card he plays, of any kind, and never on its own play', () => {
    const C = fight(['raiga_storm_taiko'].concat(FILL, ['raiga_draw_lightning', 'raiga_draw_lightning'])); play(C, 'raiga_storm_taiko'); const b = hpSum(C);
    play(C, 'raiga_draw_lightning'); play(C, 'raiga_draw_lightning'); t.eq(b - hpSum(C), 0, 'two cards: not yet'); const c0 = st(raiga(C), 'charge'); play(C, 'raiga_jab');
    t.eq(b - hpSum(C), 6 + 2, 'the third card: the Jab and 2 thunder'); t.eq(st(raiga(C), 'charge') - c0, 1, 'and a Charge');
    const U = fight([{ id: 'raiga_storm_taiko', up: 1 }].concat(FILL, ['raiga_draw_lightning', 'raiga_draw_lightning'])); play(U, 'raiga_storm_taiko'); play(U, 'raiga_draw_lightning'); play(U, 'raiga_draw_lightning'); const ub = hpSum(U); play(U, 'raiga_jab'); t.eq(ub - hpSum(U), 6 + 3, 'upgraded: 3 thunder');
  });

  // ---- partner reading: every partner works
  t.test('engine: every ally effect works with every possible partner', () => {
    ['hanae', 'kuro', 'suzu'].forEach((partner) => {
      const C = fight(['raiga_temple_gong', 'raiga_lightning_rod', 'raiga_rousing_roar', 'raiga_shared_burden', 'raiga_bring_it_on'].concat(FILL), { partner, hp: 60 }); C.energy = 5;
      ['raiga_temple_gong', 'raiga_lightning_rod', 'raiga_rousing_roar', 'raiga_shared_burden', 'raiga_bring_it_on'].forEach((id) => play(C, id));
      t.ok(ally(C).block >= 4 + 3 && st(ally(C), 'thorns') >= 2 && st(ally(C), 'might') === 2, `${partner}: Block, Thorns and Might arrive`);
    });
  });
}
await t.done();
