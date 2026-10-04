// RawClaw's card set (hocus_vocus/js/data_cards_suzu.js): quotas, rules, budget bands, and (when the engine exists) real plays.
//
// Layers of checking, cheapest first:
//   1. DATA.validate('cards', {hero:'suzu'}) has no errors and no warnings, and DATA.audit has no lines.
//   2. CONTENT_SPEC section 3 restated as assertions: counts and mix, X cost, row conds, ally cards, picks, keywords, slot rules
//      per rarity and per colour (red only with damage, blue only with Block, heal or a hero status, gold on every power),
//      art pairs, hero pose share, flavor, locks, names (1 to 3 words, unique, no dashes), upgrades that really change something.
//   3. A LIGHT BUDGET CHECK. `evalCard` is a tiny expected-value interpreter for the effect DSL: it walks a card's ops in order
//      against a reference state, prices what the card produces in "points" (1 point = 1 damage or 1 Block on one target) and
//      subtracts the resources it spends (Reverb, Block). It is a rough ruler, not the engine: it exists so a card cannot sneak
//      far outside the power guidance of CONTENT_SPEC section 3. The exchange rates (PT and PRICE) and the reference state
//      (REF) are documented below. A card is scored in the backing spot (weight 0.6, RawClaw's home) and the lead spot (weight 0.4),
//      then compared with a band on the NET points (produced minus spent):
//        cost 0        net in [2, 7.5]                 (exhaust cards [2, 11], one shot)
//        cost 1        net in [4.5, 10.5]
//        cost 2, 3, X  net per Breath in [4.5, 9.5]    (X is priced at X = 2)
//        power         net per Breath in [3, 15] over a 4 turn horizon (powers pay back over a whole fight)
//      Upgrades get +30 percent headroom on the top of the band and may never lower the net per Breath.
//      Payoff cards are priced in the state they are built for (SETUP): a finisher is clunky without its engine, by design.
//      The numbers are deliberately loose: the Wave 3 bot does the real balancing. The bands only catch typos and outliers.
//   4. When hocus_vocus/js/data_text.js exists: every card, base and upgraded, produces non-empty rules text through
//      DATA.cardPlain with no undefined, NaN or [object] in it, and stays under 110 characters.
//   5. When combat.js exists too: every card, base and upgraded, plays in a synthetic fight in both rows and with three
//      partners without throwing, keeps the card conservation invariant through three rounds, and a set of scenarios checks the
//      rules the cards lean on (Reverb spending, Spotlight, Feedback, Volume that ends with the turn, voice-back, long-mix phases, picks).
//      Set RB_STRICT=1 to make a missing or broken engine a failure instead of a skip.
// Set RB_TABLE=1 to print the budget table.
import fs from 'node:fs';
import path from 'node:path';
import { boot, harness, DIR } from './hocus_vocus_lib.mjs';

const t = harness('hocus_vocus cards suzu');
const STRICT = !!process.env.RB_STRICT;
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const has = (file) => fs.existsSync(path.join(DIR, 'js', file));

// ---------------------------------------------------------------------------------------------- load
// data_text.js and combat.js belong to a teammate: use them when they load, fall back to fewer layers when they do not
// (RB_STRICT=1 refuses the fallback)
let g = null, layerErr = null;
if (has('data_text.js') && has('combat.js')) { try { g = boot({ only: ['data_text', 'combat', 'data_cards_suzu'] }); } catch (e) { layerErr = e; } }
if (!g && has('data_text.js')) { try { g = boot({ only: ['data_text', 'data_cards_suzu'] }); } catch (e) { layerErr = layerErr || e; } }
if (!g) g = boot({ only: ['data_cards_suzu'] });
if (layerErr) console.log('  note: an engine layer did not load (' + (layerErr.message || layerErr).toString().split('\n')[0] + '), those checks are skipped');
const { DATA, U } = g;
const COMBAT = g.COMBAT || null;
const TEXT = typeof DATA.cardPlain === 'function';
const ENGINE = !!COMBAT && TEXT;
t.ok(!g._errors || g._errors.length === 0, 'the card file loads without errors: ' + JSON.stringify(g._errors));
if (STRICT) t.ok(ENGINE, 'RB_STRICT: data_text.js and combat.js must load' + (layerErr ? ' (' + layerErr.message + ')' : ''));
const L = DATA.LISTS;
const cards = Object.values(DATA.cards).filter((c) => c.hero === 'suzu');
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
// the ops a gem's flat mods can reach: through cond and repeat, never into a hook's fx
const topOps = (fx, out = []) => { (fx || []).forEach((o) => { out.push(o); if (o.op === 'cond') { topOps(o.then, out); topOps(o.else, out); } if (o.op === 'repeat') topOps(o.do, out); }); return out; };

// ---------------------------------------------------------------------------------------------- validator and audit
t.test('DATA.validate is clean for suzu: no errors, no warnings', () => {
  const v = DATA.validate('cards', { hero: 'suzu' });
  t.eq(v.errors.length, 0, 'validate errors: ' + v.errors.join(' | '));
  t.eq(v.warnings.length, 0, 'validate warnings: ' + v.warnings.join(' | '));
  t.eq(cards.length, 37, 'this file registers exactly 37 cards');
});
t.test('DATA.audit has no lines for suzu', () => {
  const a = DATA.audit('cards', { hero: 'suzu' });
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
t.test('starters match DATA.heroes.suzu.starter and the fixed ids', () => {
  const st = DATA.heroes.suzu.starter;
  t.deep([...new Set(st)].sort(), ['suzu_barrier', 'suzu_moon_prayer', 'suzu_ofuda'], 'starter ids');
  st.forEach((id) => t.ok(byId(id) && byId(id).rarity === 'starter', id + ' is a starter'));
  t.deep(ids((c) => c.rarity === 'starter').sort(), ['suzu_barrier', 'suzu_moon_prayer', 'suzu_ofuda'], 'only those are starters');
  t.eq(byId('suzu_ofuda').type, 'attack', 'the ofuda is the strike'); t.eq(byId('suzu_barrier').type, 'skill', 'the barrier is the defence');
  t.eq(byId('suzu_moon_prayer').type, 'skill', 'the signature is a Reverb prayer');
  t.ok(allOps(byId('suzu_moon_prayer')).some((o) => o.op === 'status' && o.s === 'ward'), 'the signature makes Reverb');
});
t.test('mix: 30 percent attacks, 30 percent skills, 4 or more powers, an X card', () => {
  const n = (ty) => nonToken.filter((c) => c.type === ty).length;
  t.ok(n('attack') >= nonToken.length * 0.3, 'attacks ' + n('attack'));
  t.ok(n('skill') >= nonToken.length * 0.3, 'skills ' + n('skill'));
  t.ok(n('power') >= 4, 'powers ' + n('power'));
  t.eq(n('attack') + n('skill') + n('power'), 37, 'only attack, skill and power types');
  nonToken.filter((c) => c.type === 'power').forEach((c) => t.ok(c.rarity === 'uncommon' || c.rarity === 'rare', c.id + ': powers are uncommon or rare'));
  t.ok(nonToken.some((c) => c.cost === 'X'), 'an X cost card');
  nonToken.filter((c) => c.type === 'power').forEach((c) => t.ok(allOps(c).some((o) => o.op === 'hook'), c.id + ': a power is built from a hook'));
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
  t.ok(rowCond.length >= 4 && ally.length >= 8 && kw.length >= 6, `margin over the quotas (${rowCond.length} row conds, ${ally.length} ally cards, ${kw.length} keyword cards)`);
  t.ok(ids((c) => allOps(c).some((o) => o.op === 'revive')).length >= 1, 'a revive card exists (The Room net)');
  t.ok(ids((c) => allOps(c).some((o) => o.op === 'swap')).length >= 1, 'a card moves between rows');
});
t.test('every archetype has an engine and a finisher (the design promise)', () => {
  const ex = (id) => { t.ok(!!byId(id), id + ' exists'); return byId(id); };
  const ops = (id) => bothOps(ex(id));
  const spendsWard = (o) => o.consume === 'ward' || (o.consume && o.consume.s === 'ward') || (o.op === 'removeStatus' && o.s === 'ward');
  // The Room: Block and healing for both, Reverb cashed in, a revive net, a fortress finisher
  ['suzu_barrier', 'suzu_moon_veil', 'suzu_omamori', 'suzu_waxing_moon'].forEach((id) => t.ok(ops(id).some((o) => (o.op === 'block' || o.op === 'heal') && ['both', 'front', 'ally'].includes(o.tgt)), id + ' protects the party'));
  ['suzu_prayer_wall', 'suzu_renewal_rite'].forEach((id) => t.ok(ops(id).some(spendsWard), id + ' spends Reverb'));
  t.ok(ops('suzu_shrine_grounds').some((o) => o.op === 'hook' && o.on === 'turnStart') && ops('suzu_sacred_stream').some((o) => o.op === 'hook' && o.on === 'turnEnd'), 'Acoustic Foam and Comfort Noise are standing engines');
  t.ok(ops('suzu_sacred_stream').some((o) => o.op === 'heal' && o.n.per === 'block'), 'Comfort Noise turns Block into healing');
  t.ok(ops('suzu_guardian_kami').some((o) => o.op === 'revive'), 'Voice Memo revives');
  t.ok(ops('suzu_komainu_roar').some((o) => o.op === 'dmg' && o.tgt === 'all' && o.n.per === 'block'), 'Wall of Sound turns Block into damage to all');
  t.ok(ops('suzu_guardians_reply').some((o) => o.op === 'dmg' && o.n.per === 'block' && o.n.who === 'ally'), "Bounce Back reads the ally's Block from the backing spot");
  t.ok(ops('suzu_purifying_foxfire').some((o) => o.op === 'removeStatus' && o.s === 'debuffs' && o.tgt === 'both'), 'a purge that clears debuffs from both heroes');
  // Feedback and Spotlight
  t.ok(['suzu_tolling_bell', 'suzu_stone_lion', 'suzu_yata_mirror'].every((id) => ops(id).some((o) => o.op === 'status' && o.s === 'taunt')), 'Spotlight cards exist');
  t.ok(['suzu_tolling_bell', 'suzu_stone_lion', 'suzu_ring_of_thorns', 'suzu_yata_mirror'].every((id) => ops(id).some((o) => o.op === 'status' && o.s === 'thorns')), 'Feedback engines exist');
  t.ok(ops('suzu_briar_lash').some((o) => o.op === 'dmg' && o.n.per === 'status' && o.n.s === 'thorns'), 'Distortion pays per Feedback');
  t.ok(ops('suzu_swaying_bells').some((o) => o.op === 'hook' && o.on === 'onSwap'), 'Ping Pong Delay is the swap payoff');
  t.ok(ops('suzu_yata_mirror').some((o) => o.op === 'status' && o.s === 'thorns' && o.n.per === 'status' && o.n.s === 'thorns'), 'Double Tracking doubles Feedback');
  // Effects Rack: appliers, a Reverb-bought Starstruck, per-debuff payoffs, Tag for the partner
  ['suzu_ofuda', 'suzu_thousand_ofuda', 'suzu_ofuda_barrage'].forEach((id) => t.ok(ops(id).some((o) => o.op === 'status' && o.s === 'mark'), id + ' applies Tag'));
  t.ok(ops('suzu_paper_seal').some((o) => o.s === 'weak') && ops('suzu_binding_seal').some((o) => o.s === 'vulnerable'), 'Muffled and Exposed appliers');
  t.ok(ops('suzu_silencing_seal').some((o) => o.op === 'status' && o.s === 'stun') && ops('suzu_silencing_seal').some(spendsWard), 'a Starstruck that costs Reverb');
  ['suzu_banishing_seal', 'suzu_moonlit_verdict'].forEach((id) => t.ok(ops(id).some((o) => o.op === 'dmg' && o.n.per === 'debuffs'), id + ' pays per debuff'));
  t.ok(ops('suzu_trailing_charms').some((o) => o.op === 'hook' && o.on === 'onPlay'), 'Slapback hooks on play');
  t.ok(ops('suzu_lunar_domain').some((o) => o.op === 'hook' && o.every === 2), 'Mixing Desk is the long mix (every 2nd turn)');
  t.ok(nonToken.some((c) => allOps(c).some((o) => o.op === 'cond' && o.if && o.if.turn)) || nonToken.some((c) => bothOps(c).some((o) => o.n && o.n.per === 'turn')), 'a card that grows with the turn number (Long Sustain)');
  // the partner: Volume and Tag work with anyone, and the two hero:any hooks reward the partner's plays and wounds
  t.ok(ops('suzu_blessed_blade').some((o) => o.s === 'might' && (o.tgt === 'ally' || o.tgt === 'both')), 'Volume for the ally');
  t.ok(['suzu_swaying_bells', 'suzu_trailing_charms', 'suzu_guardian_kami'].every((id) => ops(id).some((o) => o.op === 'hook' && o.filter && o.filter.hero === 'any')), 'hooks that reward the partner use filter.hero any');
});

// ---------------------------------------------------------------------------------------------- names, text, art, flavor, locks
t.test('names: 1 to 3 words, unique, no dashes, no digits', () => {
  const names = nonToken.map((c) => c.name);
  t.eq(new Set(names).size, names.length, 'duplicate names inside the file');
  t.eq(new Set(names.map((n) => n.toLowerCase())).size, names.length, 'names differ ignoring case');
  names.forEach((n) => { t.ok(words(n) >= 1 && words(n) <= 3, n + ' has 1 to 3 words'); t.ok(/^[A-Z][A-Za-z' ]+$/.test(n), n + ' is plain words'); });
  nonToken.forEach((c) => t.ok(/^suzu_[a-z][a-z0-9_]*$/.test(c.id), c.id + ' is snake_case with the hero prefix'));
  const EM = String.fromCharCode(0x2014), EN = String.fromCharCode(0x2013);
  t.ok(!JSON.stringify(cards).includes(EM) && !JSON.stringify(cards).includes(EN), 'no em or en dashes in the data');
  t.ok(!nonToken.some((c) => c.text !== undefined), 'no hand typed text field (text is generated)');
  // the integration pass owns the cross-hero check; here it is a note, and a failure only in strict mode
  const mine = new Set(names.map((n) => n.toLowerCase()));
  const clash = Object.values(DATA.cards).filter((c) => c.hero !== 'suzu' && c.name && mine.has(c.name.toLowerCase())).map((c) => c.id + ' "' + c.name + '"');
  if (clash.length) console.log('  note: names shared with other heroes: ' + clash.join(', '));
  if (STRICT) t.eq(clash.length, 0, 'card names are unique across the game: ' + clash.join(', '));
});
t.test('art: every card has m and c, pairs are unique, hero poses on about half of the attacks', () => {
  nonToken.forEach((c) => { t.ok(L.motifs.includes(c.art.m), c.id + ' motif ' + c.art.m); t.ok(L.palettes.includes(c.art.c), c.id + ' palette ' + c.art.c); });
  const pairs = nonToken.map((c) => c.art.m + '/' + c.art.c);
  t.eq(new Set(pairs).size, pairs.length, 'duplicate art.m plus art.c pair');
  const atk = nonToken.filter((c) => c.type === 'attack'); const heroAtk = atk.filter((c) => c.art.hero);
  t.ok(heroAtk.length >= atk.length * 0.35 && heroAtk.length <= atk.length * 0.65, `hero pose on ${heroAtk.length} of ${atk.length} attacks (about half)`);
  t.ok(new Set(nonToken.map((c) => c.art.m)).size >= 26, 'a wide spread of motifs: ' + new Set(nonToken.map((c) => c.art.m)).size);
  t.ok(nonToken.filter((c) => c.art.hero && c.type !== 'attack').length <= 4, 'hero poses stay mostly on attacks');
});
t.test('flavor: every rare, and at least a third of the rest', () => {
  nonToken.filter((c) => c.rarity === 'rare').forEach((c) => t.ok(typeof c.flavor === 'string' && c.flavor.length > 8, c.id + ' has a flavor line'));
  const rest = nonToken.filter((c) => c.rarity !== 'rare');
  t.ok(rest.filter((c) => c.flavor).length >= Math.ceil(rest.length / 3), 'flavor on a third of the non-rares: ' + rest.filter((c) => c.flavor).length + ' of ' + rest.length);
  nonToken.filter((c) => c.flavor).forEach((c) => { t.ok(c.flavor.length <= 90, c.id + ' flavor is one short line'); t.ok(!/\d/.test(c.flavor), c.id + ' flavor carries no numbers'); });
});
t.test('locks: never on starters or commons, at most 4 uncommons and 4 rares, every archetype keeps an unlocked engine and finisher', () => {
  t.eq(nonToken.filter((c) => c.locked && (c.rarity === 'starter' || c.rarity === 'common')).length, 0, 'no locked starters or commons');
  t.ok(nonToken.filter((c) => c.locked && c.rarity === 'uncommon').length <= 4, 'locked uncommons');
  t.ok(nonToken.filter((c) => c.locked && c.rarity === 'rare').length <= 4, 'locked rares');
  ['suzu_moonlit_verdict', 'suzu_komainu_roar', 'suzu_yata_mirror', 'suzu_lunar_domain', 'suzu_shrine_grounds', 'suzu_stone_lion', 'suzu_ofuda_barrage', 'suzu_silencing_seal', 'suzu_renewal_rite', 'suzu_ring_of_thorns', 'suzu_sacred_stream', 'suzu_swaying_bells'].forEach((id) => t.ok(!byId(id).locked, id + ' is never locked (it carries an archetype)'));
});

// ---------------------------------------------------------------------------------------------- slots
t.test('slots: counts per rarity, colours per card, gold on powers, prism limit, colour totals', () => {
  nonToken.forEach((c) => {
    const n = c.slots.length;
    if (c.rarity === 'uncommon') t.ok(n >= 1 && n <= 2, c.id + ' uncommon slots ' + n); else if (c.rarity === 'rare') t.eq(n, 2, c.id + ' rare slots'); else t.eq(n, 1, c.id + ' slots');
    const ops = allOps(c), top = topOps(c.fx), topUp = topOps(c.up && c.up.fx);
    const blueOk = (list) => list.some((o) => o.op === 'block' || o.op === 'heal');
    if (c.slots.includes('red')) t.ok(ops.some((o) => o.op === 'dmg'), c.id + ': red slot needs a damage op');
    // stricter than the validator: a blue gem's flat Block and healing only reach ops outside hooks, so a blue slot needs one
    if (c.slots.includes('blue')) t.ok(blueOk(top) && (!c.up || !c.up.fx || blueOk(topUp)), c.id + ': blue slot needs a Block or heal op outside any hook (base and upgraded)');
    if (c.slots.includes('red')) t.ok(top.some((o) => o.op === 'dmg') && (!c.up || !c.up.fx || topUp.some((o) => o.op === 'dmg')), c.id + ': red slot needs a damage op outside any hook');
    if (c.type === 'power') t.ok(c.slots.includes('gold'), c.id + ': every power has a gold slot');
    t.ok(new Set(c.slots).size === c.slots.length, c.id + ' does not repeat a slot colour');
  });
  t.ok(nonToken.filter((c) => c.rarity === 'rare' && c.slots.includes('any')).length <= 4, 'at most 4 rares with a prism slot');
  const colour = (col) => nonToken.filter((c) => c.slots.includes(col)).length;
  t.ok(colour('red') >= 10, 'red ' + colour('red')); t.ok(colour('blue') >= 10, 'blue ' + colour('blue'));
  t.ok(colour('green') >= 8, 'green ' + colour('green')); t.ok(colour('gold') >= 8, 'gold ' + colour('gold'));
  t.ok(colour('red') >= 11 && colour('blue') >= 10 && colour('green') >= 10 && colour('gold') >= 12, 'margin over the colour quotas: ' + ['red', 'blue', 'green', 'gold'].map((c) => c + ' ' + colour(c)).join(', '));
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
    if (c.up.kw !== undefined) t.ok(JSON.stringify(c.up.kw) !== JSON.stringify(c.kw || []), c.id + ': up.kw differs from the base keywords');
  });
  // upgrade text really differs, so the player can see what the + does (only when the generator exists)
  if (TEXT) nonToken.forEach((c) => { if (c.up.cost === undefined) t.ok(DATA.cardPlain({ id: c.id, up: 1, gems: [] }) !== DATA.cardPlain(c.id), c.id + ': the + changes the rules text'); });
});

// ---------------------------------------------------------------------------------------------- the budget ruler
const ENEMIES = 2, AOE = 1.8, TURNS = 4, W_BACK = 0.6, W_FRONT = 0.4;
// points per stack. 1 point = 1 damage or 1 Block on one target. Reverb is priced as what it BUYS (2), so making it earns 2 and
// spending it costs 2, which is why every spender must pay out clearly more than 2 per Reverb.
const PT = { ward: 2, thorns: 3.5, taunt: 2, might: 6, mightTemp: 2.5, regen: 2, bulwark: 4, dodge: 4.5, vulnerable: 4, weak: 3, frail: 1.5, mark: 2.5, stun: 10, poison: 2.5, burn: 2 };
// Healing is priced at 1.0 an HP, up from 0.8: HP healed carries from fight to fight, and the balance bot measured Tape Warmth, Chill Mix and Warm Pad among
// RawClaw's best cards at the old price. (After the Tape Warmth trim to 2 HP a Reverb it sat at 2.6 under the old price, below the 4.5 floor, while still a top card.)
const PRICE = { draw: 3.5, energy: 6.5, heal: 1.0, swap: 1.2, revive: 12, purgeSelf: 2.5, retain: 1.5, upgrade: 4, pickOther: 1 };
const BOTH_BLOCK = 1.7, ALLY_BLOCK = 0.85, BOTH_HEAL = 1.8, ALLY_HEAL = 0.9, BOTH_STATUS = 1.7, ALLY_STATUS = 0.85;
// the reference state a card is priced in: mid fight, a partly built turn (RawClaw in front has the row's 2 Feedback)
const REF = { ward: 3, block: 3, allyBlock: 6, debuffs: 2, handSize: 3, drawPile: 12, discardPile: 6, exhaustPile: 1, cardsPlayed: 2, attacksPlayed: 1, skillsPlayed: 1, energy: 1, hp: 50, missingHp: 15, allyMissingHp: 15, enemies: ENEMIES, kills: 0, turn: 3, gems: 0, damageTaken: 6, hitsTaken: 1, targetBlock: 0, picked: 1, X: 2 };
// Payoff cards are priced in the state they are built for. A finisher is clunky without its engine, by design.
const SETUP = {
  suzu_briar_lash: { thorns: 2 },          // the row's 2 Feedback in front, or two Feedback cards out: Feedback are permanent, so it is priced with them
  suzu_yata_mirror: { thorns: 4 },         // it doubles what you have built
  suzu_moonlit_verdict: { debuffs: 3 },    // Muffled, Wobbly and Exposed from a Low Pass and a Dry Signal, or Tag, Muffled and Exposed
  suzu_komainu_roar: { block: 10 },        // the fortress the finisher is for (Acoustic Foam or two Block cards)
  suzu_shrine_grounds: { ward: 4 },        // the bank has grown by the time the power has paid for itself
};
const clone = (S) => Object.assign({}, S, { st: Object.assign({}, S.st), allySt: Object.assign({}, S.allySt) });
const fresh = (row, setup) => {
  const u = setup || {};
  return {
    row, block: u.block !== undefined ? u.block : REF.block, allyBlock: REF.allyBlock, debuffs: u.debuffs !== undefined ? u.debuffs : REF.debuffs, X: REF.X,
    st: { ward: u.ward !== undefined ? u.ward : REF.ward, thorns: u.thorns !== undefined ? u.thorns : (row === 'front' ? 2 : 0) }, allySt: {},
  };
};
const stOf = (S, who, s) => ((who === 'ally' ? S.allySt : S.st)[s] || 0);
function countOf(v, S) {
  switch (v.per) {
    case 'X': return S.X;
    case 'block': return v.who === 'ally' ? S.allyBlock : S.block;
    case 'status': return stOf(S, v.who, v.s);
    case 'debuffs': return S.debuffs;
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
const isRevertHook = (o) => o.op === 'hook' && o.on === 'turnEnd' && o.once && o.fx.every((x) => x.op === 'status' && x.n < 0);
const revertOf = (fx) => { const r = {}; (fx || []).forEach((o) => { if (isRevertHook(o)) o.fx.forEach((x) => { r[x.s] = true; }); }); return r; };
function condProb(c, S) {
  let p = 1;
  Object.keys(c).forEach((k) => {
    const q = c[k]; let ok;
    if (k === 'row') ok = S.row === q ? 1 : 0;
    else if (k === 'status') { const n = stOf(S, q.who, q.s); ok = (q.gte === undefined || n >= q.gte) && (q.lte === undefined || n <= q.lte) ? 1 : 0; }
    else if (k === 'lastKill') ok = 0.3; else if (k === 'targetStatus') ok = 0.5; else if (k === 'allyDown') ok = 0.05; else if (k === 'hpPct') ok = 0.3;
    else if (k === 'turn') ok = (q.gte === undefined || REF.turn >= q.gte) && (q.lte === undefined || REF.turn <= q.lte) ? 1 : 0;
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
// triggers a hook fires over the 4 turn horizon
function hookRate(h) {
  if (h.on === 'onHeroDown') return 0.4;                          // a safety net: it pays only when the worst happens
  if (h.once) return 1;
  let per = { combatStart: 0.25, turnStart: 1, turnEnd: 1, onPlay: 2, onDamaged: 1.4, onKill: 0.7, onSwap: 1.2, onShuffle: 0.35, onExhaust: 0.5 }[h.on];
  if (h.on === 'onPlay' && h.filter && h.filter.type === 'attack') per = h.filter.hero === 'any' ? 2.4 : 1.4;   // either hero's Attacks, about 2.4 a turn
  if (h.on === 'onDamaged' && h.filter && h.filter.hero === 'any') per = 2.5;                                     // either hero's wounds
  if (h.every) per /= h.every;
  if (h.limit) per = Math.min(per, h.limit);
  return per * TURNS;
}
function evalOps(ops, S, A, hookMode, revert) {
  (ops || []).forEach((o) => {
    switch (o.op) {
      case 'dmg': {
        const n = V(o.n, S), hits = o.hits === undefined ? 1 : Math.max(0, V(o.hits, S));
        const per = n + (S.st.might || 0);
        A.gross += Math.max(0, per) * hits * (o.tgt === 'all' ? AOE : o.tgt === 'others' ? 0.8 : 1) * (o.pierce ? 1.1 : 1);
        spend(o, S, A); break;
      }
      case 'block': {
        const tgt = o.tgt || 'self';
        const n = Math.max(0, V(o.n, S) + (hookMode ? 0 : (S.row === 'front' ? 1 : 0)));    // the lead spot adds 1 to every Block op of his own cards
        A.gross += n * (tgt === 'both' ? BOTH_BLOCK : tgt === 'ally' ? ALLY_BLOCK : 1);
        if (tgt !== 'ally') S.block += n; else S.allyBlock += n;
        spend(o, S, A); break;
      }
      case 'heal': A.gross += V(o.n, S) * PRICE.heal * (o.tgt === 'both' ? BOTH_HEAL : o.tgt === 'ally' ? ALLY_HEAL : 1); spend(o, S, A); break;
      case 'status': {
        const n = V(o.n, S), tgt = o.tgt || (DATA.isDebuff(o.s) ? 'enemy' : 'self');
        if (L.heroTgt.includes(tgt)) {
          const temp = revert && revert[o.s] && n > 0;
          const unit = temp ? PT.mightTemp : PT[o.s];
          const mult = tgt === 'both' ? BOTH_STATUS : tgt === 'ally' ? ALLY_STATUS : 1;
          A.gross += n * unit * mult;
          if (tgt !== 'ally') S.st[o.s] = (S.st[o.s] || 0) + n;
          if (tgt === 'ally' || tgt === 'both') S.allySt[o.s] = (S.allySt[o.s] || 0) + n;
        } else A.gross += n * PT[o.s] * (tgt === 'all' ? AOE : 1);
        spend(o, S, A); break;
      }
      case 'removeStatus': {
        if (o.s === 'debuffs') { A.gross += o.tgt === 'both' ? PRICE.purgeSelf * 2 : PRICE.purgeSelf; break; }
        const have = stOf(S, undefined, o.s), n = Math.min(have, o.n === undefined ? have : V(o.n, S));
        if (DATA.statuses[o.s] && DATA.statuses[o.s].kind === 'resource') { A.spent += n * PT[o.s]; S.st[o.s] = have - n; }
        break;
      }
      case 'draw': A.gross += V(o.n, S) * PRICE.draw; spend(o, S, A); break;
      case 'energy': A.gross += V(o.n, S) * PRICE.energy; spend(o, S, A); break;
      case 'swap': A.gross += PRICE.swap; S.row = S.row === 'front' ? 'back' : 'front'; break;
      case 'pick': A.gross += Math.min(V(o.n, S), 3) * ({ retain: PRICE.retain, upgrade: PRICE.upgrade }[o.then] || PRICE.pickOther) * (o.optional ? 0.8 : 1); break;
      case 'revive': A.gross += PRICE.revive; break;
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
        const n = hookRate(o), S2 = clone(S), A2 = { gross: 0, spent: 0 };
        evalOps(o.fx, S2, A2, true, null);
        A.gross += n * (A2.gross - A2.spent); break;
      }
      default: break;
    }
  });
}
function netOf(def, row, setup) {
  const S = fresh(row, setup), A = { gross: 0, spent: 0 };
  evalOps(def.fx, S, A, false, revertOf(def.fx));
  return A.gross - A.spent;
}
// weighted over the two rows; a card that moves between rows is scored from where it starts
const valueOf = (c, up) => {
  const d = resolveDef(c, up), setup = SETUP[c.id];
  return W_BACK * netOf(d, 'back', setup) + W_FRONT * netOf(d, 'front', setup);
};
const energyOf = (d) => (d.cost === 'X' ? REF.X : d.cost);
const bandOf = (c, up) => {
  const d = resolveDef(c, up), e = energyOf(d), exhaust = d.kw.includes('exhaust');
  let lo, hi, per = false;
  if (c.type === 'power') { lo = 3; hi = 15; per = true; }
  else if (e === 0) { lo = 2; hi = exhaust ? 11 : 7.5; }
  else if (e === 1) { lo = 4.5; hi = 10.5; }
  else { lo = 4.5; hi = 9.5; per = true; }
  return { lo, hi: up ? hi * 1.3 : hi, per, e };
};
const scoreOf = (c, up) => { const v = valueOf(c, up), b = bandOf(c, up); return b.per ? v / b.e : v; };

t.test('the ruler itself: a few known values so the table can be trusted', () => {
  const st = (id) => byId(id);
  const near = (a, b, msg) => t.near(a, b, 0.05, msg);
  // Reverb Wall in the backing spot: 3 Block to both = 3 * 1.7; in the lead spot the Block op gains 1 from the row: 4 * 1.7
  near(netOf(resolveDef(st('suzu_barrier'), false), 'back'), 3 * BOTH_BLOCK, 'barrier back');
  near(netOf(resolveDef(st('suzu_barrier'), false), 'front'), 4 * BOTH_BLOCK, 'barrier front');
  // Synth Zap: 5 damage plus one Tag
  near(netOf(resolveDef(st('suzu_ofuda'), false), 'back'), 5 + PT.mark, 'ofuda');
  // Stadium Reverb at 3 Reverb: Block (2 + 2 * 3) for both, minus 3 Reverb spent
  near(netOf(resolveDef(st('suzu_prayer_wall'), false), 'back'), 8 * BOTH_BLOCK - 3 * PT.ward, 'prayer wall');
});
t.test('budget: every card, base and upgraded, sits inside its value band', () => {
  const rows = [];
  nonToken.forEach((c) => {
    [false, true].forEach((up) => {
      const b = bandOf(c, up), s = scoreOf(c, up);
      rows.push([c.id + (up ? '+' : ''), c.rarity, c.type, String(resolveDef(c, up).cost), s.toFixed(1), (b.lo).toFixed(1) + '..' + b.hi.toFixed(1) + (b.per ? ' /E' : '')]);
      t.ok(s >= b.lo - 1e-9 && s <= b.hi + 1e-9, `${c.id}${up ? '+' : ''} scores ${s.toFixed(2)} outside ${b.lo}..${b.hi.toFixed(2)}${b.per ? ' per Breath' : ''}`);
    });
  });
  if (process.env.RB_TABLE) { console.log('card | rarity | type | cost | score | band'); rows.forEach((r) => console.log(r.join(' | '))); }
});
t.test('budget: an upgrade never lowers the value per Breath, and never adds more than about half again', () => {
  nonToken.forEach((c) => {
    const a = scoreOf(c, false), b = scoreOf(c, true), ea = bandOf(c, false), eb = bandOf(c, true);
    const pa = ea.per ? a : a / Math.max(1, ea.e), pb = eb.per ? b : b / Math.max(1, eb.e);
    t.ok(pb >= pa - 0.05, `${c.id}: the upgrade lowers the value (${pa.toFixed(2)} to ${pb.toFixed(2)})`);
    t.ok(pb <= pa * 2.1 + 0.5, `${c.id}: the upgrade more than doubles the value (${pa.toFixed(2)} to ${pb.toFixed(2)})`);
  });
});
t.test('budget: zero and one cost cards are strict, and no cheap card carries a stiff effect', () => {
  nonToken.forEach((c) => {
    [false, true].forEach((up) => {
      const d = resolveDef(c, up), e = energyOf(d);
      if (e > 1 || c.type === 'power') return;
      const s = scoreOf(c, up);
      t.ok(s <= (e === 0 ? 7.5 : 10.5) * (up ? 1.3 : 1) + 1e-9, `${c.id}${up ? '+' : ''} is too strong for cost ${e}: ${s.toFixed(2)}`);
      if (e === 0) t.ok(!flat(d.fx).some((o) => o.op === 'energy'), `${c.id}: no Breath on a free card`);
    });
  });
  t.ok(!nonToken.some((c) => bothOps(c).some((o) => o.op === 'energy')), 'RawClaw has no Breath gain at all (CONTENT_SPEC: it needs a real drawback)');
  // Reverb economy: a spender must beat what the same Reverb earns, and every Reverb card is in the gallery
  const spenders = nonToken.filter((c) => allOps(c).some((o) => o.consume === 'ward' || (o.consume && o.consume.s === 'ward') || (o.op === 'removeStatus' && o.s === 'ward')));
  t.ok(spenders.length >= 4, 'Reverb spenders: ' + spenders.map((c) => c.id).join(', '));
  const makers = nonToken.filter((c) => bothOps(c).some((o) => (o.op === 'status' && o.s === 'ward' && (o.tgt === 'self' || o.tgt === undefined)) || (o.op === 'hook' && flat(o.fx).some((x) => x.op === 'status' && x.s === 'ward'))));
  t.ok(makers.length >= 5, 'Reverb makers besides the passive: ' + makers.map((c) => c.id).join(', '));
});

// ---------------------------------------------------------------------------------------------- text (data_text.js)
const inst = (id, up, gems) => ({ uid: U.uid(), id, up: up ? 1 : 0, gems: gems || (byId(id).slots || []).map(() => null) });
const BAD_TEXT = /undefined|NaN|\[object|null|Infinity/;
if (TEXT) {
  t.test('text: every card, base and upgraded, has clean rules text under 110 characters', () => {
    nonToken.forEach((c) => [0, 1].forEach((up) => {
      const s = DATA.cardPlain(inst(c.id, up));
      t.ok(typeof s === 'string' && s.length > 5, `${c.id}${up ? '+' : ''} has rules text`);
      t.ok(!BAD_TEXT.test(s), `${c.id}${up ? '+' : ''} text is clean: ${s}`);
      t.ok(s.length <= 110, `${c.id}${up ? '+' : ''} text is ${s.length} characters: ${s}`);
      t.ok(/[.!?]$/.test(s), `${c.id}${up ? '+' : ''} ends in a full stop`);
    }));
  });
  t.test('text: a few cards say what they do (their numbers and key words, not the exact phrasing)', () => {
    const P = (id, up) => DATA.cardPlain(inst(id, up));
    const S = (id) => new RegExp(esc(DATA.statuses[id].name)), K = (id) => new RegExp(esc(DATA.keywords[id].name));
    const says = (id, up, ...res) => res.forEach((re) => t.ok(re.test(P(id, up)), `${id}${up ? '+' : ''} says ${re}: ${P(id, up)}`));
    says('suzu_ofuda', 0, /\b5\b/, /damage/i, /\b1\b/, S('mark')); says('suzu_ofuda', 1, /\b7\b/);
    says('suzu_barrier', 0, /both/i, /\b3\b/, K('block')); says('suzu_barrier', 1, /\b5\b/);
    says('suzu_banishing_seal', 0, /\b2\b/, /\b3\b/, /debuff/i, /damage/i);
    says('suzu_prayer_wall', 0, K('retain'), /\b3\b/, /\b2\b/, S('ward'), K('block'), /both/i);
    says('suzu_blessed_blade', 0, /ally/i, /\b3\b/, S('might'), /end of/i);
    says('suzu_silencing_seal', 0, S('stun'), S('weak'), /\b2\b/, S('ward'), K('retain'));
    says('suzu_lunar_domain', 0, /2nd|second|other/i, S('weak'), S('vulnerable'), /all enemies/i);
    says('suzu_guardian_kami', 0, /bring them back/i, /50/, /voice/i, K('block'));
    says('suzu_ring_of_thorns', 1, K('innate')); t.ok(!K('innate').test(P('suzu_ring_of_thorns', 0)), 'the base Ring is not Opener');
    says('suzu_renewal_rite', 0, K('retain'), /\b3\b/, /\b2\b/, S('ward'), /heal/i);
    says('suzu_komainu_roar', 0, K('block'), /all enemies/i, /\b16\b/, K('exhaust')); t.ok(!K('exhaust').test(P('suzu_komainu_roar', 1)), 'the upgraded Roar no longer exhausts');
    says('suzu_yata_mirror', 0, S('thorns'), /\b2\b/, S('taunt'), K('exhaust'));
    says('suzu_kagura_blessing', 0, /Upgrade/, /\b2\b/, K('exhaust'));
    says('suzu_trailing_charms', 0, /Attack/, S('mark'));
    says('suzu_kagura_step', 0, K('swap'), /Lead/, /Backing/);
    says('suzu_moonbeam', 0, /all enemies/i, S('mark'));
  });
  t.test('text: every gem colour on every slot resolves without throwing', () => {
    const gems = { red: { id: 'tg_red', color: 'red', mod: { dmg: 2 } }, blue: { id: 'tg_blue', color: 'blue', mod: { block: 2, heal: 2 } }, green: { id: 'tg_green', color: 'green', mod: { draw: 1 } }, gold: { id: 'tg_gold', color: 'gold', mod: { status: { s: 'ward', n: 1, tgt: 'self' } } } };
    Object.keys(gems).forEach((k) => { DATA.gems[gems[k].id] = Object.assign({ name: k, tier: 1, art: { cut: 'round' } }, gems[k]); });
    nonToken.forEach((c) => c.slots.forEach((slot, i) => {
      const colours = slot === 'any' ? Object.keys(gems) : [slot];
      colours.forEach((col) => {
        const gs = c.slots.map(() => null); gs[i] = gems[col].id;
        const s = DATA.cardPlain(inst(c.id, 0, gs));
        t.ok(typeof s === 'string' && !BAD_TEXT.test(s), `${c.id} with a ${col} gem: ${s}`);
      });
    }));
    Object.keys(gems).forEach((k) => { delete DATA.gems[gems[k].id]; });
  });
}

// ---------------------------------------------------------------------------------------------- the engine: real plays
if (ENGINE) {
  // a synthetic enemy set, registered in this test's own copy of DATA. The dummy never dies and hits the lead hero for a little; the
  // biter attacks random heroes in threes so hooks that need wounds have wounds; the brute and the sniper hit far above anyone's HP
  // (the lead hero and the backing hero) so that heroes fall; the weakling is a minion that lets a combat run without threatening anyone
  const enemyBase = { chapter: 1, tier: 'normal', size: 'm', art: { id: 'kappa' }, lore: 'A synthetic test enemy.', tags: ['spirit'] };
  DATA.add('enemies', {
    suzu_test_dummy: Object.assign({}, enemyBase, { id: 'suzu_test_dummy', name: 'Test Dummy', hp: [600, 600], moves: { poke: { name: 'Poke', kind: 'attack', fx: [{ op: 'dmg', n: 5, tgt: 'front' }] }, sway: { name: 'Sway', kind: 'defend', fx: [{ op: 'block', n: 4 }] } }, ai: { seq: ['poke', 'sway'] } }),
    suzu_test_biter: Object.assign({}, enemyBase, { id: 'suzu_test_biter', name: 'Test Biter', hp: [600, 600], moves: { bite: { name: 'Bite', kind: 'multi', fx: [{ op: 'dmg', n: 4, hits: 3, tgt: 'random' }] } }, ai: { seq: ['bite'] } }),
    suzu_test_brute: Object.assign({}, enemyBase, { id: 'suzu_test_brute', name: 'Test Brute', hp: [600, 600], moves: { smash: { name: 'Smash', kind: 'heavy', fx: [{ op: 'dmg', n: 40, tgt: 'front' }] } }, ai: { seq: ['smash'] } }),
    suzu_test_sniper: Object.assign({}, enemyBase, { id: 'suzu_test_sniper', name: 'Test Sniper', hp: [600, 600], moves: { snipe: { name: 'Snipe', kind: 'heavy', fx: [{ op: 'dmg', n: 30, tgt: 'back' }] } }, ai: { seq: ['snipe'] } }),
    suzu_test_weakling: Object.assign({}, enemyBase, { id: 'suzu_test_weakling', name: 'Test Weakling', tier: 'minion', size: 's', hp: [3, 3], moves: { tap: { name: 'Tap', kind: 'attack', fx: [{ op: 'dmg', n: 1, tgt: 'front' }] } }, ai: { seq: ['tap'] } }),
  });
  let deckUid = 1;
  const D = (id, up, extra) => Object.assign({ uid: deckUid++, id, up: up ? 1 : 0, gems: (byId(id).slots || []).map(() => null) }, extra);
  // make a combat. deck: card ids (or {id, up}); the deck is stacked so the FIRST entries are drawn first (hand 5)
  function make(o) {
    o = o || {};
    const partner = o.partner || 'kuro';
    const deck = (o.deck || []).map((d) => (typeof d === 'string' ? D(d, 0) : D(d.id, d.up)));
    const C = COMBAT.create({
      heroes: [{ id: 'suzu', hp: o.hp !== undefined ? o.hp : 60, maxHp: 68 }, { id: partner, hp: o.partnerHp !== undefined ? o.partnerHp : 60, maxHp: DATA.heroes[partner].maxHp }],
      frontIdx: o.row === 'front' ? 0 : 1, deck, enemies: o.enemies || ['suzu_test_dummy', 'suzu_test_dummy'], seed: o.seed || 11, tier: 'normal', chapter: 1, mods: o.mods || {},
    });
    C.start();
    C.suzuDeck = deck.length;                 // the deck size for the conservation check (the engine's own counter is not part of its contract)
    // stack the hand: pull the wanted cards to the top of the hand (the opening shuffle is random)
    (o.hand || []).forEach((id) => {
      let c = C.hand.find((x) => x.id === id && !x._want);
      if (!c) { const i = C.draw.findIndex((x) => x.id === id); if (i >= 0) { c = C.draw.splice(i, 1)[0]; C.hand.push(c); } }
      if (c) c._want = true;
    });
    if (o.ward !== undefined) C.heroes[0].st.ward = o.ward;
    if (o.st) Object.keys(o.st).forEach((k) => { C.heroes[0].st[k] = o.st[k]; });
    if (o.allySt) Object.keys(o.allySt).forEach((k) => { C.heroes[1].st[k] = o.allySt[k]; });
    return C;
  }
  const suzu = (C) => C.heroes[0], partner = (C) => C.heroes[1];
  const handCard = (C, id) => C.hand.find((c) => c.id === id);
  const play = (C, id, target) => {
    const c = handCard(C, id);
    if (!c) throw new Error(id + ' is not in hand: ' + C.hand.map((x) => x.id).join(','));
    const tgt = C.needsTarget(c.uid) ? (target || C.legalTargets(c.uid)[0]) : undefined;
    const ev = C.play(c.uid, tgt);
    // answer a pick with the first candidates
    let guard = 0;
    while (C.pending && guard++ < 5) { const p = C.pending; C.resolvePick(p.uids.slice(0, p.optional ? Math.min(p.n, p.uids.length) : p.n)); }
    return ev;
  };
  const conserved = (C) => C.hand.length + C.draw.length + C.discard.length + C.exhaust.length + C.powers.length + (C.inPlay ? 1 : 0) === C.suzuDeck + (C.added || 0);
  const fill = (n) => Array.from({ length: n }, () => 'suzu_barrier');

  t.test('engine: every card, base and upgraded, plays in both rows with three partners and keeps the piles conserved', () => {
    let plays = 0;
    nonToken.forEach((c) => [0, 1].forEach((up) => ['front', 'back'].forEach((row) => ['hanae', 'kuro', 'raiga'].forEach((pt) => {
      const label = `${c.id}${up ? '+' : ''} ${row} with ${pt}`;
      let C;
      try {
        C = make({ row, partner: pt, deck: [{ id: c.id, up }].concat(fill(5)), hand: [c.id], ward: 4, enemies: ['suzu_test_biter', 'suzu_test_dummy'], seed: 3 + plays });
        // give the enemy a couple of debuffs and Block so the per-debuff and per-Block cards have something to read
        const en = C.enemies[0]; en.st.weak = 1; en.st.mark = 1; en.block = 3;
        const can = C.canPlay(handCard(C, c.id).uid, C.legalTargets(handCard(C, c.id).uid)[0]);
        t.ok(can.ok, `${label}: playable with 3 Breath (${can.reason})`);
        const ev = play(C, c.id);
        plays++;
        t.ok(ev.some((e) => e.type === 'play'), `${label}: emits a play event`);
        t.ok(!C.pending, `${label}: no pick left hanging`);
        t.ok(conserved(C), `${label}: piles conserved after the play`);
        // three full rounds: hooks, enemy phases and the next draws must not throw
        for (let r = 0; r < 3 && C.result === null; r++) {
          const hc = C.hand.find((x) => x.id === 'suzu_barrier');
          if (hc && C.canPlay(hc.uid).ok) C.play(hc.uid);
          C.endTurn();
          t.ok(conserved(C), `${label}: piles conserved after round ${r + 1}`);
        }
      } catch (e) { t.ok(false, `${label}: threw ${e && e.stack || e}`); }
    }))));
    t.ok(plays === nonToken.length * 2 * 2 * 3, 'every combination ran: ' + plays);
  });

  t.test('engine: playing every card twice in one turn and with a full hand does not throw', () => {
    ['front', 'back'].forEach((row) => {
      const C = make({ row, deck: nonToken.map((c) => ({ id: c.id, up: 1 })), ward: 6, enemies: ['suzu_test_biter', 'suzu_test_dummy', 'suzu_test_weakling'], seed: 21 });
      for (let round = 0; round < 6 && C.result === null; round++) {
        C.energy = 10;
        C.hand.slice().forEach((c) => { if (C.result === null && C.canPlay(c.uid, C.legalTargets(c.uid)[0]).ok) { try { play(C, c.id); } catch (e) { t.ok(false, `${row}: ${c.id} threw ${e && e.stack || e}`); } } });
        t.ok(conserved(C), `${row} round ${round}: piles conserved`);
        C.endTurn();
      }
      t.ok(true, `${row}: six rounds of everything ran`);
    });
  });

  // ---- scenarios: the rules the cards lean on
  t.test('starters: Synth Zap marks, Reverb Wall blocks both, Warm Pad makes Reverb and heals both; Always Rolling gives Reverb every turn', () => {
    const C = make({ row: 'back', deck: ['suzu_ofuda', 'suzu_barrier', 'suzu_moon_prayer', 'suzu_ofuda', 'suzu_barrier'], hand: ['suzu_ofuda', 'suzu_barrier', 'suzu_moon_prayer'] });
    t.eq(suzu(C).st.ward, 1, 'turn 1: the passive gave 1 Reverb');
    const e = C.enemies[0];
    play(C, 'suzu_ofuda', e.id);
    t.eq(e.hp, e.maxHp - 5, 'ofuda hits for 5 (no row bonus for RawClaw)'); t.eq(e.st.mark, 1, 'and marks');
    play(C, 'suzu_barrier');
    t.eq(suzu(C).block, 3, 'barrier: 3 Block for RawClaw in the back'); t.eq(partner(C).block, 3, 'and 3 for the partner');
    suzu(C).hp = 50; partner(C).hp = 50;
    play(C, 'suzu_moon_prayer');
    t.eq(suzu(C).st.ward, 3, 'moon prayer: 2 more Reverb'); t.eq(suzu(C).hp, 52, 'heals RawClaw'); t.eq(partner(C).hp, 52, 'and the partner');
    C.endTurn();
    t.eq(suzu(C).st.ward, 4, 'a new turn: Always Rolling adds 1');
  });
  t.test('RawClaw has no damage bonus, but his spots give +1 Block in the lead and Feedback 2 (lead) or Warm Tea 2 (backing)', () => {
    const F = make({ row: 'front', deck: ['suzu_barrier', 'suzu_ofuda'], hand: ['suzu_barrier', 'suzu_ofuda'] });
    play(F, 'suzu_barrier');
    t.eq(suzu(F).block, 4, 'front: 3 plus the row 1'); t.eq(partner(F).block, 4, 'the row bonus reaches the partner too');
    t.eq(suzu(F).st.thorns, 2, 'front: Feedback 2');
    const e = F.enemies[0]; play(F, 'suzu_ofuda', e.id);
    t.eq(e.hp, e.maxHp - 5, 'no damage bonus in the lead spot either');
    const B = make({ row: 'back', deck: ['suzu_barrier'], hand: ['suzu_barrier'] });
    t.eq(suzu(B).rowSt.regen, 2, 'back: the row grants Regen 2'); t.eq(suzu(B).st.regen, 1, 'and it has already ticked once this turn');
  });
  t.test('Sidechain Pump pays 3 per debuff (Tag counts) and Distortion pays 3 per Feedback (up to 6)', () => {
    const C = make({ row: 'back', deck: ['suzu_banishing_seal', 'suzu_banishing_seal', 'suzu_briar_lash', 'suzu_briar_lash'], hand: ['suzu_banishing_seal', 'suzu_banishing_seal', 'suzu_briar_lash', 'suzu_briar_lash'] });
    const e = C.enemies[0];
    play(C, 'suzu_banishing_seal', e.id);
    t.eq(e.hp, e.maxHp - 2, 'no debuffs: 2');
    C.energy = 9; e.hp = e.maxHp; e.st.weak = 1; e.st.vulnerable = 1; e.st.mark = 1;
    play(C, 'suzu_banishing_seal', e.id);
    // 3 debuffs: (2 + 9) = 11, Exposed x1.5 = 16, Tag +3 first (raw 14, x1.5 = 21)
    t.eq(e.maxHp - e.hp, Math.floor((11 + 3) * 1.5), 'three debuffs, Tag and Exposed land: ' + (e.maxHp - e.hp));
    e.hp = e.maxHp; e.st = {};
    play(C, 'suzu_briar_lash', e.id);
    t.eq(e.maxHp - e.hp, 3, 'backing spot, no Feedback: 3');
    suzu(C).st.thorns = 10; e.hp = e.maxHp;
    play(C, 'suzu_briar_lash', e.id);
    t.eq(e.maxHp - e.hp, 3 + 3 * 6, 'Feedback counted up to 6');
  });
  t.test('Laser Synth spends up to 3 Reverb for +2 each, and the backing spot hands 1 back', () => {
    const C = make({ row: 'back', deck: ['suzu_hamaya_shot', 'suzu_hamaya_shot'], hand: ['suzu_hamaya_shot', 'suzu_hamaya_shot'], ward: 5 });
    const e = C.enemies[0];
    play(C, 'suzu_hamaya_shot', e.id);
    t.eq(e.maxHp - e.hp, 10 + 6, '5 Reverb, 3 counted: 16'); t.eq(suzu(C).st.ward, 5 - 3 + 1, 'spent 3, backing spot returns 1');
    suzu(C).st.ward = 0; C.energy = 3; e.hp = e.maxHp;
    play(C, 'suzu_hamaya_shot', e.id);
    t.eq(e.maxHp - e.hp, 10, 'no Reverb: the base'); t.eq(suzu(C).st.ward, 1, 'the backing spot still returns 1');
    const F = make({ row: 'front', deck: ['suzu_hamaya_shot'], hand: ['suzu_hamaya_shot'], ward: 2 });
    play(F, 'suzu_hamaya_shot', F.enemies[0].id);
    t.eq(suzu(F).st.ward || 0, 0, 'lead spot: no refund');
  });
  t.test('Stadium Reverb, Tape Warmth and Long Sustain: Reverb to Block, Reverb to healing, Block by turn number', () => {
    const C = make({ row: 'back', deck: ['suzu_prayer_wall', 'suzu_renewal_rite', 'suzu_waxing_moon'], hand: ['suzu_prayer_wall', 'suzu_renewal_rite', 'suzu_waxing_moon'], ward: 4 });
    play(C, 'suzu_prayer_wall');
    t.eq(suzu(C).block, 2 + 2 * 3, 'up to 3 Reverb counted: 8'); t.eq(partner(C).block, 8, 'both heroes'); t.eq(suzu(C).st.ward, 1, '3 spent');
    suzu(C).hp = 40; partner(C).hp = 40; suzu(C).st.ward = 6; C.energy = 3;
    play(C, 'suzu_renewal_rite');
    t.eq(suzu(C).hp, 40 + 6, 'up to 3 Reverb counted, 2 healing each'); t.eq(partner(C).hp, 40 + 6, 'both heroes'); t.eq(suzu(C).st.ward, 3, '3 spent');
    suzu(C).block = 0; partner(C).block = 0;
    play(C, 'suzu_waxing_moon');
    t.eq(partner(C).block, 2, 'turn 1: 2 Block for the lead hero (the partner)'); t.eq(suzu(C).block, 0, 'not for RawClaw in the back');
    const late = make({ row: 'back', deck: ['suzu_waxing_moon'], hand: ['suzu_waxing_moon'] });
    late.turn = 4; play(late, 'suzu_waxing_moon');
    t.eq(partner(late).block, 8, 'turn 4: 8');
    const cap = make({ row: 'front', deck: ['suzu_waxing_moon'], hand: ['suzu_waxing_moon'] });
    cap.turn = 9; play(cap, 'suzu_waxing_moon');
    t.eq(suzu(cap).block, 12 + 1, 'late in the fight it is capped at 12 (plus the lead spot 1 on RawClaw\'s own Block)');
  });
  t.test('Solo Button and Crossfade: Spotlight redirects back-row attacks, Crossfade swaps without using the free swap', () => {
    const C = make({ row: 'back', deck: ['suzu_tolling_bell'], hand: ['suzu_tolling_bell'], enemies: ['suzu_test_biter'] });
    play(C, 'suzu_tolling_bell');
    t.eq(suzu(C).block, 5, 'backing spot: 5 Block'); t.eq(suzu(C).st.taunt, 1, 'Spotlight 1'); t.ok(!suzu(C).st.thorns, 'no Feedback from the backing spot');
    const it = C.intent(C.enemies[0]);
    t.deep(it.tgt, ['suzu'], 'the random-target biter is drawn to the taunting hero');
    suzu(C).block = 0; const hits0 = C.events.length;
    C.endTurn();
    const bites = C.events.slice(hits0).filter((e) => e.type === 'hit' && e.src && e.src.kind === 'enemy');
    t.ok(bites.length === 3 && bites.every((e) => e.dst.id === 'suzu'), 'all three bites of the biter went to the taunting hero: ' + bites.map((e) => e.dst.id).join(','));
    const F = make({ row: 'front', deck: ['suzu_tolling_bell'], hand: ['suzu_tolling_bell'] });
    play(F, 'suzu_tolling_bell');
    t.eq(suzu(F).st.thorns, 3, 'lead spot: the row gave 2 and the bell planted 1'); t.eq(suzu(F).block, 6, 'front Block 6');
    // Crossfade
    const K = make({ row: 'back', deck: ['suzu_kagura_step'], hand: ['suzu_kagura_step'] });
    play(K, 'suzu_kagura_step');
    t.eq(K.front().id, 'suzu', 'from the backing spot he steps into the lead'); t.ok(suzu(K).block > 0 && suzu(K).st.taunt === 1, 'and gains Block and Spotlight');
    t.ok(K.canSwap().cost === 0, 'the free swap is still there');
    const K2 = make({ row: 'front', deck: ['suzu_kagura_step'], hand: ['suzu_kagura_step'] });
    suzu(K2).hp = 40; partner(K2).hp = 40;
    play(K2, 'suzu_kagura_step');
    t.eq(K2.back().id, 'suzu', 'from the lead he steps back'); t.eq(suzu(K2).hp, 44, 'and heals both'); t.eq(partner(K2).hp, 44, 'the partner too');
    t.eq(suzu(K2).st.regen, 2, 'the backing spot Regen arrives at once');
    const KU = make({ row: 'back', deck: [{ id: 'suzu_kagura_step', up: 1 }], hand: ['suzu_kagura_step'] });
    const before = KU.energy; play(KU, 'suzu_kagura_step'); t.eq(KU.energy, before, 'upgraded it costs nothing');
  });
  t.test('Push the Fader: Volume for the ally that ends with the turn', () => {
    const C = make({ row: 'back', deck: ['suzu_blessed_blade'], hand: ['suzu_blessed_blade'], partner: 'hanae' });
    play(C, 'suzu_blessed_blade');
    t.eq(partner(C).st.might, 3, 'the ally has 3 Volume'); t.ok(!suzu(C).st.might, 'RawClaw does not');
    C.endTurn();
    t.ok(!partner(C).st.might, 'gone at the end of the turn');
    const U2 = make({ row: 'back', deck: [{ id: 'suzu_blessed_blade', up: 1 }], hand: ['suzu_blessed_blade'], partner: 'raiga' });
    play(U2, 'suzu_blessed_blade');
    t.eq(partner(U2).st.might, 4, 'upgraded: 4 Volume'); t.ok(!suzu(U2).st.might, 'still only for the ally');
    U2.endTurn(); t.ok(!partner(U2).st.might, 'and it is given back');
    // a partner with a hit-heavy plan really does hit harder this turn, and only this turn
    if (DATA.cards.raiga_jab) {
      const J = make({ row: 'back', partner: 'raiga', deck: ['suzu_blessed_blade', 'raiga_jab'], hand: ['suzu_blessed_blade', 'raiga_jab'], enemies: ['suzu_test_dummy'] });
      play(J, 'suzu_blessed_blade'); const je = J.enemies[0]; const hp0 = je.hp;
      J.swap();
      const jc = J.hand.find((c) => c.id === 'raiga_jab');
      if (jc) { J.play(jc.uid, je.id); t.ok(hp0 - je.hp >= 3 + 1, 'the ally\'s strike carries the extra Volume: ' + (hp0 - je.hp)); }
    }
  });
  t.test('Preset, Low Pass, Dry Signal, Tape Stop: cheap tricks and the Reverb-bought Starstruck', () => {
    const C = make({ row: 'back', deck: ['suzu_saisen', 'suzu_paper_seal', 'suzu_binding_seal', 'suzu_silencing_seal', 'suzu_barrier', 'suzu_barrier', 'suzu_barrier'], hand: ['suzu_saisen', 'suzu_paper_seal', 'suzu_binding_seal', 'suzu_silencing_seal'], ward: 0 });
    const e = C.enemies[0], w0 = C.hand.length;
    play(C, 'suzu_saisen');
    t.eq(suzu(C).st.ward, 1, 'saisen: +1 Reverb'); t.eq(C.hand.length, w0 - 1 + 1, 'and draws a card'); t.eq(C.energy, 3, 'for free');
    play(C, 'suzu_paper_seal', e.id);
    t.eq(e.st.weak, 1, 'paper seal: Muffled'); t.eq(e.st.frail, 1, 'and Wobbly'); t.eq(C.energy, 3, 'for free');
    play(C, 'suzu_binding_seal', e.id);
    t.eq(e.st.vulnerable, 2, 'binding seal: Exposed 2');
    // Tape Stop: 1 Reverb is not enough (Muffled instead), 2 Reverb stuns
    C.energy = 3;
    play(C, 'suzu_silencing_seal', e.id);
    t.eq(suzu(C).st.ward, 1, 'with 1 Reverb nothing is spent'); t.eq(e.st.weak, 2, 'the fallback is another Muffled'); t.ok(!e.st.stun, 'and no Starstruck');
    const S2 = make({ row: 'back', deck: ['suzu_silencing_seal'], hand: ['suzu_silencing_seal'], ward: 3 });
    play(S2, 'suzu_silencing_seal', S2.enemies[0].id);
    t.eq(suzu(S2).st.ward, 1, 'stun: 2 Reverb spent'); t.eq(S2.enemies[0].st.stun, 1, 'the enemy is stunned');
    S2.endTurn();
    t.ok(S2.events.some((ev) => ev.type === 'skip' && ev.unit.id === S2.enemies[0].id), 'the stunned enemy skips its action');
    const S3 = make({ row: 'back', deck: [{ id: 'suzu_silencing_seal', up: 1 }], hand: ['suzu_silencing_seal'], ward: 1 });
    play(S3, 'suzu_silencing_seal', S3.enemies[0].id);
    t.eq(suzu(S3).st.ward || 0, 0, 'upgraded: 1 Reverb is enough'); t.eq(S3.enemies[0].st.stun, 1, 'and stuns');
    const boss = make({ row: 'back', deck: ['suzu_silencing_seal'], hand: ['suzu_silencing_seal'], ward: 3, enemies: ['boss_kuzunoha'] });
    if (DATA.enemies.boss_kuzunoha) { play(boss, 'suzu_silencing_seal', boss.enemies[0].id); t.ok(!boss.enemies[0].st.stun, 'a boss ignores Starstruck'); }
  });
  t.test('Finger Drumming: X hits and X Tag; Phaser and Filter Sweep hit everyone; Arpeggiator marks everyone', () => {
    const C = make({ row: 'back', deck: ['suzu_ofuda_barrage'], hand: ['suzu_ofuda_barrage'] });
    const e = C.enemies[0];
    play(C, 'suzu_ofuda_barrage', e.id);
    t.eq(C.energy, 0, 'X spends everything'); t.eq(e.maxHp - e.hp, 15, '3 hits of 5'); t.eq(e.st.mark, 3, 'X Tag');
    const C0 = make({ row: 'back', deck: ['suzu_ofuda_barrage'], hand: ['suzu_ofuda_barrage'] });
    C0.energy = 0; play(C0, 'suzu_ofuda_barrage', C0.enemies[0].id);
    t.eq(C0.enemies[0].hp, C0.enemies[0].maxHp, 'X = 0 does nothing and does not throw');
    const G = make({ row: 'back', deck: ['suzu_gohei_sweep', 'suzu_moonbeam', 'suzu_thousand_ofuda'], hand: ['suzu_gohei_sweep', 'suzu_moonbeam', 'suzu_thousand_ofuda'] });
    play(G, 'suzu_gohei_sweep', G.enemies[0].id);
    G.enemies.forEach((x) => { t.eq(x.maxHp - x.hp, 5, 'sweep hits every enemy'); t.eq(x.st.weak, 1, 'and weakens it'); });
    G.enemies[1].hp -= 2;                                       // the second enemy is the weakest
    play(G, 'suzu_moonbeam', G.enemies[0].id);
    G.enemies.forEach((x, i) => t.eq(x.maxHp - x.hp, 8 + (i === 1 ? 2 : 0), 'moonbeam adds 3 to every enemy'));
    t.ok(!G.enemies[0].st.mark && G.enemies[1].st.mark === 1, 'and Tags only the weakest enemy');
    G.energy = 3; const hp0 = G.enemies[0].hp; play(G, 'suzu_thousand_ofuda', G.enemies[0].id);
    t.eq(hp0 - G.enemies[0].hp, 9, 'thousand ofuda hits for 9');
    G.enemies.forEach((x) => { t.eq(x.st.mark, 2, 'thousand ofuda marks every enemy'); });
  });
  t.test("Bounce Back reads the lead hero's Block; Wall of Sound turns Block into damage and keeps the Block", () => {
    const B = make({ row: 'back', deck: ['suzu_guardians_reply'], hand: ['suzu_guardians_reply'] });
    partner(B).block = 9; suzu(B).block = 1;
    play(B, 'suzu_guardians_reply', B.enemies[0].id);
    t.eq(B.enemies[0].maxHp - B.enemies[0].hp, 3 + 9, "backing spot: the ally's Block (the ally is in front)");
    const F = make({ row: 'front', deck: ['suzu_guardians_reply'], hand: ['suzu_guardians_reply'] });
    partner(F).block = 9; suzu(F).block = 4;
    play(F, 'suzu_guardians_reply', F.enemies[0].id);
    t.eq(F.enemies[0].maxHp - F.enemies[0].hp, 3 + 4, 'lead spot: his own Block');
    const R = make({ row: 'back', deck: ['suzu_komainu_roar'], hand: ['suzu_komainu_roar'] });
    suzu(R).block = 12;
    play(R, 'suzu_komainu_roar');
    R.enemies.forEach((x) => t.eq(x.maxHp - x.hp, 12, 'every enemy takes her Block'));
    t.eq(suzu(R).block, 12, 'the Block stays'); t.eq(R.exhaust.length, 1, 'the card exhausts');
    const R2 = make({ row: 'back', deck: ['suzu_komainu_roar'], hand: ['suzu_komainu_roar'] });
    suzu(R2).block = 40; play(R2, 'suzu_komainu_roar');
    R2.enemies.forEach((x) => t.eq(x.maxHp - x.hp, 16, 'capped at 16'));
  });
  t.test('Final Mixdown pays 6 per debuff (5 counted) and a kill pays 1 Reverb', () => {
    const C = make({ row: 'back', deck: ['suzu_moonlit_verdict', 'suzu_moonlit_verdict'], hand: ['suzu_moonlit_verdict', 'suzu_moonlit_verdict'], ward: 0, enemies: ['suzu_test_dummy', 'suzu_test_dummy'] });
    const e = C.enemies[0]; e.st.weak = 1; e.st.frail = 1; e.st.mark = 1;
    play(C, 'suzu_moonlit_verdict', e.id);
    t.eq(e.maxHp - e.hp, 18 + 3, 'three debuffs count before the hit, and the Tag is spent on it: 18 + 3');
    t.eq(suzu(C).st.ward || 0, 0, 'no kill, no Reverb');
    e.hp = 4; e.st.weak = 1; C.energy = 3;
    play(C, 'suzu_moonlit_verdict', e.id);
    t.ok(e.down, 'the enemy dies'); t.eq(suzu(C).st.ward, 1, 'and the kill pays 1 Reverb');
    const many = make({ row: 'back', deck: ['suzu_moonlit_verdict'], hand: ['suzu_moonlit_verdict'], enemies: ['suzu_test_dummy'] });
    const me = many.enemies[0]; Object.assign(me.st, { weak: 1, frail: 1, vulnerable: 1, poison: 1, burn: 1, mark: 1, stun: 1 });
    play(many, 'suzu_moonlit_verdict', me.id);
    t.eq(me.maxHp - me.hp, Math.floor((30 + 3) * 1.5), 'seven debuffs count as five, Tag and Exposed land');
  });
  t.test('Stage Monitors and Double Tracking: Block, Spotlight and Feedback; Feedback double up to the cap and hurt attackers', () => {
    const C = make({ row: 'front', deck: ['suzu_stone_lion', 'suzu_yata_mirror'], hand: ['suzu_stone_lion', 'suzu_yata_mirror'], enemies: ['suzu_test_dummy'] });
    C.energy = 6;
    play(C, 'suzu_stone_lion');
    t.eq(suzu(C).block, 11, 'front: 10 plus 1'); t.eq(suzu(C).st.taunt, 2, 'Spotlight 2'); t.eq(suzu(C).st.thorns, 3, 'the row 2 plus the lion 1');
    play(C, 'suzu_yata_mirror');
    t.eq(suzu(C).st.thorns, 6, 'doubled'); t.eq(suzu(C).st.taunt, 4, 'Spotlight stacks');
    const hp = C.enemies[0].hp;
    suzu(C).block = 0;
    C.endTurn();
    t.ok(hp - C.enemies[0].hp >= 6, 'the dummy poked him and paid 6 Feedback: ' + (hp - C.enemies[0].hp));
    const big = make({ row: 'front', deck: ['suzu_yata_mirror'], hand: ['suzu_yata_mirror'], st: { thorns: 20 } });
    play(big, 'suzu_yata_mirror'); t.eq(suzu(big).st.thorns, 28, 'the doubling is capped at 8 more');
    // a swap to the backing spot removes only the 2 the row gave, not what the card planted
    const sw = make({ row: 'front', deck: ['suzu_stone_lion'], hand: ['suzu_stone_lion'] });
    play(sw, 'suzu_stone_lion'); sw.swap();
    t.eq(suzu(sw).st.thorns, 1, 'backing spot: only the lion Feedback is left');
  });
  t.test('Howlround: one Feedback a turn, and the upgraded Ring is Opener', () => {
    const C = make({ row: 'back', deck: ['suzu_ring_of_thorns'], hand: ['suzu_ring_of_thorns'], enemies: ['suzu_test_weakling'] });
    play(C, 'suzu_ring_of_thorns'); t.ok(C.powers.length === 1, 'the power sits in the power zone');
    t.ok(!suzu(C).st.thorns, 'nothing yet');
    C.endTurn(); t.eq(suzu(C).st.thorns, 1, 'turn 2: 1 Feedback');
    C.endTurn(); t.eq(suzu(C).st.thorns, 2, 'turn 3: 2 Feedback');
    const inn = make({ row: 'back', deck: [{ id: 'suzu_ring_of_thorns', up: 1 }].concat(fill(20)), hand: [] });
    t.ok(inn.hand.some((c) => c.id === 'suzu_ring_of_thorns'), 'the upgraded Ring starts in the opening hand');
    // 20 barriers cannot hide it: the plain Ring is drawn only by chance, so over several seeds it is sometimes missing
    const missing = [1, 2, 3, 4, 5, 6, 7, 8].filter((sd) => !make({ row: 'back', deck: [{ id: 'suzu_ring_of_thorns', up: 0 }].concat(fill(20)), hand: [], seed: sd }).hand.some((c) => c.id === 'suzu_ring_of_thorns')).length;
    t.ok(missing >= 3, 'the plain Ring is not Opener (missing from the opening hand in ' + missing + ' of 8 seeds)');
  });
  t.test('Comfort Noise: at the end of your turn both heroes heal for your Block (max 3), before the enemy phase', () => {
    const M = make({ row: 'back', deck: ['suzu_sacred_stream', 'suzu_barrier'], hand: ['suzu_sacred_stream', 'suzu_barrier'], enemies: ['suzu_test_weakling'] });
    play(M, 'suzu_sacred_stream'); t.eq(M.powers.length, 1, 'a power');
    play(M, 'suzu_barrier');     // 4 Block for each, RawClaw has 4
    suzu(M).hp = 30; partner(M).hp = 30;
    const at = M.events.length;
    M.endTurn();
    const heals = M.events.slice(at).filter((e) => e.type === 'heal' && e.amount === 3);
    t.deep(heals.map((e) => e.dst.id).sort(), ['kuro', 'suzu'], 'both heroes healed for 3 (her Block 4, capped at 3)');
    const firstAct = M.events.slice(at).findIndex((e) => e.type === 'enemy_act'), firstHeal = M.events.slice(at).findIndex((e) => e.type === 'heal');
    t.ok(firstHeal >= 0 && (firstAct < 0 || firstHeal < firstAct), 'the heal comes before the enemy acts');
    const none = make({ row: 'back', deck: ['suzu_sacred_stream'], hand: ['suzu_sacred_stream'], enemies: ['suzu_test_weakling'] });
    play(none, 'suzu_sacred_stream'); suzu(none).hp = 30; partner(none).hp = 30; none.endTurn();
    t.ok(!none.events.some((e) => e.type === 'heal' && e.amount === 3), 'no Block, no healing');
    const up = make({ row: 'back', deck: [{ id: 'suzu_sacred_stream', up: 1 }, 'suzu_barrier'], hand: ['suzu_sacred_stream'], enemies: ['suzu_test_weakling'] });
    play(up, 'suzu_sacred_stream'); suzu(up).block = 9; suzu(up).hp = 30; partner(up).hp = 30;
    up.endTurn();
    t.ok(up.events.some((e) => e.type === 'heal' && e.dst.id === 'kuro' && e.amount === 5), 'upgraded: capped at 5');
  });
  t.test('Ping Pong Delay: the first swap each turn pays 1 Reverb and 2 Block to both, whoever steps forward', () => {
    const C = make({ row: 'back', deck: ['suzu_swaying_bells', 'suzu_kagura_step'], hand: ['suzu_swaying_bells', 'suzu_kagura_step'], ward: 0, enemies: ['suzu_test_weakling'] });
    play(C, 'suzu_swaying_bells');
    t.ok(!suzu(C).st.ward, 'no Reverb yet');
    C.energy = 3; C.swap();                                            // the free swap: RawClaw steps forward
    t.eq(suzu(C).st.ward, 1, 'the swap paid a Reverb'); t.eq(suzu(C).block, 2, 'and 2 Block'); t.eq(partner(C).block, 2, 'for both heroes');
    play(C, 'suzu_kagura_step');                                       // a card's swap the same turn: limit 1 per turn
    t.eq(suzu(C).st.ward, 1, 'a second swap in the same turn pays nothing'); t.eq(C.back().id, 'suzu', 'though Crossfade really did swap him back');
    C.endTurn();
    const back = C.swap();                                             // next turn: the partner or RawClaw, either direction counts
    t.ok(back.some((e) => e.type === 'swap'), 'swapped again');
    t.eq(suzu(C).st.ward, 1 + 1 + 1, 'the new turn gave 1 and the swap 1 more');
    // stepping BACK counts too (the engine reports the hero who moved forward, so this needs filter.hero any)
    const F = make({ row: 'front', deck: ['suzu_swaying_bells'], hand: ['suzu_swaying_bells'], ward: 0, enemies: ['suzu_test_weakling'] });
    play(F, 'suzu_swaying_bells'); F.swap();
    t.eq(suzu(F).st.ward, 1, 'RawClaw stepping back pays as well');
    // a forced swap (a hero falls) is not a swap the player made
    const H = make({ row: 'back', deck: ['suzu_swaying_bells'], hand: ['suzu_swaying_bells'], ward: 0, enemies: ['suzu_test_brute'], partnerHp: 1 });
    play(H, 'suzu_swaying_bells'); H.endTurn();
    t.ok(H.events.some((e) => e.type === 'swap' && e.forced), 'the partner fell and RawClaw was forced forward');
    t.eq(suzu(H).st.ward, 1, 'only the new turn gave Reverb: a forced swap pays nothing');
    const U2 = make({ row: 'back', deck: [{ id: 'suzu_swaying_bells', up: 1 }], hand: ['suzu_swaying_bells'], ward: 0, enemies: ['suzu_test_weakling'] });
    play(U2, 'suzu_swaying_bells'); U2.swap();
    t.eq(suzu(U2).st.ward, 2, 'upgraded: 2 Reverb');
  });
  t.test('Slapback: an Attack from either hero leaves a Tag on its target', () => {
    const C = make({ row: 'back', deck: ['suzu_trailing_charms', 'suzu_banishing_seal'], hand: ['suzu_trailing_charms', 'suzu_banishing_seal'], enemies: ['suzu_test_dummy'] });
    play(C, 'suzu_trailing_charms');
    const e = C.enemies[0];
    C.endTurn();
    C.energy = 3;
    play(C, 'suzu_banishing_seal', e.id);
    t.eq(e.st.mark, 1, 'the strike left a Tag');
    if (DATA.cards.hanae_slash) {
      const H = make({ row: 'back', partner: 'hanae', deck: ['suzu_trailing_charms', 'hanae_slash'], hand: ['suzu_trailing_charms', 'hanae_slash'], enemies: ['suzu_test_dummy'] });
      play(H, 'suzu_trailing_charms');
      const he = H.enemies[0];
      const hc = H.hand.find((c) => c.id === 'hanae_slash');
      t.ok(!!hc, 'the partner card is in hand');
      if (hc) { H.swap(); H.play(hc.uid, he.id); t.eq(he.st.mark, 1, "the partner's Slash left a Tag too"); }
    }
  });
  t.test('Voice Memo revives the first hero to fall, either hero, and both heroes gain Block; only once', () => {
    // the sniper hits the BACK hero for far more than anyone has, so the backing hero falls every round
    const back = make({ row: 'front', deck: ['suzu_guardian_kami'], hand: ['suzu_guardian_kami'], enemies: ['suzu_test_sniper'], partnerHp: 5 });
    play(back, 'suzu_guardian_kami');
    back.endTurn();
    const downs = back.events.filter((e) => e.type === 'hero_down'), revs = back.events.filter((e) => e.type === 'hero_revive');
    t.eq(downs.length, 1, 'the partner went down'); t.eq(revs.length, 1, 'and was revived'); t.eq(back.result, null, 'the fight goes on');
    t.eq(partner(back).down, false, 'the partner stands'); t.eq(partner(back).hp, Math.round(0.5 * partner(back).maxHp), 'with 50 percent of the max HP');
    const gains = back.events.filter((e) => e.type === 'block' && e.amount === 10).map((e) => e.dst.id).sort();
    t.deep(gains, ['kuro', 'suzu'], 'both heroes gained 10 Block when the partner stood up (it is cleared again at the next turn start)');
    partner(back).hp = 3; back.endTurn();
    t.eq(back.events.filter((e) => e.type === 'hero_revive').length, 1, 'no second revive: the power fired once');
    t.eq(partner(back).down, true, 'the partner stays down');
    // RawClaw himself loses his voice: his own hook fires for its owner (the Phoenix rule) and he returns in the backing spot
    const self = make({ row: 'front', deck: ['suzu_guardian_kami'], hand: ['suzu_guardian_kami'], enemies: ['suzu_test_brute'], hp: 3 });
    play(self, 'suzu_guardian_kami');
    self.endTurn();
    t.ok(self.events.some((e) => e.type === 'hero_down' && e.hero === 'suzu'), 'RawClaw fell'); t.ok(self.events.some((e) => e.type === 'hero_revive' && e.hero === 'suzu'), 'and stood up again');
    t.eq(suzu(self).down, false, 'he is on his feet'); t.eq(self.result, null, 'the fight goes on');
    // with the net in place a fight that would have been lost is not
    const both = make({ row: 'front', deck: ['suzu_guardian_kami'], hand: ['suzu_guardian_kami'], enemies: ['suzu_test_brute'], hp: 1, partnerHp: 0 });
    play(both, 'suzu_guardian_kami');
    both.endTurn();
    t.ok(both.events.some((e) => e.type === 'hero_down' && e.hero === 'suzu') && both.events.some((e) => e.type === 'hero_revive' && e.hero === 'suzu'), 'the last hero fell and was revived');
    t.ok(both.result !== 'lose', 'and the fight was not lost: the hook runs before the lose check');
  });
  t.test('Acoustic Foam: Block for both equal to Reverb (up to 5) at the start of every turn', () => {
    const C = make({ row: 'back', deck: ['suzu_shrine_grounds'], hand: ['suzu_shrine_grounds'], enemies: ['suzu_test_weakling'] });
    play(C, 'suzu_shrine_grounds');
    suzu(C).st.ward = 8; C.energy = 0; C.endTurn();
    t.eq(suzu(C).st.ward, 9, 'the Reverb was not spent');
    t.eq(suzu(C).block, 5, 'Block capped at 5'); t.eq(partner(C).block, 5, 'for both heroes');
    const U3 = make({ row: 'back', deck: [{ id: 'suzu_shrine_grounds', up: 1 }], hand: ['suzu_shrine_grounds'], enemies: ['suzu_test_weakling'] });
    play(U3, 'suzu_shrine_grounds'); suzu(U3).st.ward = 8; U3.energy = 0; U3.endTurn();
    t.eq(suzu(U3).block, 7, 'upgraded: capped at 7');
  });
  t.test('Mixing Desk: every 2nd turn Muffled 2 and Exposed 1 on every enemy, so Muffled never lapses', () => {
    const C = make({ row: 'back', deck: ['suzu_lunar_domain'], hand: ['suzu_lunar_domain'], enemies: ['suzu_test_dummy', 'suzu_test_dummy'] });
    C.energy = 3; play(C, 'suzu_lunar_domain');
    const seen = [];
    for (let i = 0; i < 6; i++) {
      C.endTurn();
      seen.push(C.enemies.map((e) => `${e.st.weak || 0}/${e.st.vulnerable || 0}`).join(','));
    }
    // the hook counts triggers from the play: turn 2 is the 1st (nothing), turn 3 the 2nd (fires), then 5, 7. Muffled 2 lasts two rounds
    t.deep(seen, ['0/0,0/0', '2/1,2/1', '1/0,1/0', '2/1,2/1', '1/0,1/0', '2/1,2/1'], 'the long-mix phases: ' + seen.join(' | '));
    t.ok(seen.slice(1).every((x) => !/^0\//.test(x)), 'from the first firing on, every enemy is Muffled at the start of every turn');
  });
  t.test('Mastering upgrades cards in hand for this combat; Save the Session retains what you choose', () => {
    const C = make({ row: 'back', deck: ['suzu_kagura_blessing', 'suzu_barrier', 'suzu_barrier', 'suzu_ofuda', 'suzu_moonbeam'], hand: ['suzu_kagura_blessing', 'suzu_barrier', 'suzu_barrier', 'suzu_ofuda', 'suzu_moonbeam'], partner: 'hanae' });
    play(C, 'suzu_kagura_blessing');
    t.eq(C.hand.filter((c) => c.up).length, 2, 'two cards upgraded'); t.eq(C.exhaust.length, 1, 'Blessing exhausts');
    const up = C.hand.find((c) => c.up); const before = C.hand.length;
    t.ok(DATA.resolveCard(up).name.endsWith('+'), 'the upgraded card reads with a +');
    t.ok(before === 4, 'the hand is what is left');
    const V = make({ row: 'back', deck: ['suzu_prayer_vigil', 'suzu_barrier', 'suzu_ofuda', 'suzu_moonbeam', 'suzu_omamori'], hand: ['suzu_prayer_vigil', 'suzu_barrier', 'suzu_ofuda', 'suzu_moonbeam', 'suzu_omamori'], ward: 0 });
    const keep = V.hand.filter((c) => c.id === 'suzu_ofuda' || c.id === 'suzu_omamori').map((c) => c.uid);
    const vc = handCard(V, 'suzu_prayer_vigil');
    V.play(vc.uid);
    t.ok(V.pending && V.pending.then === 'retain' && V.pending.optional, 'a hand pick that may choose any number up to 2');
    V.resolvePick(keep);
    t.eq(suzu(V).st.ward, 1, 'and 1 Reverb');
    V.endTurn();
    t.ok(V.hand.some((c) => c.id === 'suzu_ofuda') && V.hand.some((c) => c.id === 'suzu_omamori'), 'the chosen cards were kept for the next turn');
  });
  t.test('retained Reverb spenders stay in hand across turns', () => {
    const C = make({ row: 'back', deck: ['suzu_prayer_wall', 'suzu_renewal_rite', 'suzu_silencing_seal', 'suzu_barrier', 'suzu_barrier'], hand: ['suzu_prayer_wall', 'suzu_renewal_rite', 'suzu_silencing_seal'], enemies: ['suzu_test_weakling'] });
    C.endTurn();
    ['suzu_prayer_wall', 'suzu_renewal_rite', 'suzu_silencing_seal'].forEach((id) => t.ok(C.hand.some((c) => c.id === id), id + ' was retained'));
  });
  t.test('Undo clears debuffs from both heroes; Chill Mix heals without overhealing; Noise Gate blocks the lead hero', () => {
    const C = make({ row: 'back', deck: ['suzu_purifying_foxfire', 'suzu_omamori', 'suzu_moon_veil'], hand: ['suzu_purifying_foxfire', 'suzu_omamori', 'suzu_moon_veil'], st: { weak: 2, poison: 3 }, allySt: { frail: 2, burn: 4 } });
    play(C, 'suzu_purifying_foxfire', C.enemies[0].id);
    t.eq(C.enemies[0].maxHp - C.enemies[0].hp, 6, 'Undo hits for 8, less the Muffled RawClaw still carries when he throws it');
    t.ok(!suzu(C).st.weak && !suzu(C).st.poison && !partner(C).st.frail && !partner(C).st.burn, 'every debuff on both heroes is gone');
    C.energy = 3; suzu(C).hp = 66; partner(C).hp = 20;
    play(C, 'suzu_omamori');
    t.eq(suzu(C).hp, 68, 'no overheal'); t.eq(partner(C).hp, 24, 'the partner heals 4');
    play(C, 'suzu_moon_veil');
    t.eq(partner(C).block, 7, 'the lead hero (the partner) gets 7'); t.eq(suzu(C).block, 0, 'RawClaw in the back does not');
    const F = make({ row: 'front', deck: ['suzu_moon_veil'], hand: ['suzu_moon_veil'] });
    play(F, 'suzu_moon_veil'); t.eq(suzu(F).block, 8, 'in front it is her, with the row bonus'); t.eq(partner(F).block, 0, 'and not the partner');
  });
  t.test('the three plans work end to end: Effects Rack, Feedback and Spotlight, The Room', () => {
    // EFFECTS RACK: two free-ish effects, then the payoff. Exposed 2, Muffled, Wobbly, and the Synth Zap's Tag set up Sidechain Pump and Synth Zap
    const T = make({ row: 'back', deck: ['suzu_paper_seal', 'suzu_binding_seal', 'suzu_banishing_seal', 'suzu_ofuda'], hand: ['suzu_paper_seal', 'suzu_binding_seal', 'suzu_banishing_seal', 'suzu_ofuda'], enemies: ['suzu_test_dummy'] });
    const te = T.enemies[0];
    play(T, 'suzu_paper_seal', te.id); play(T, 'suzu_binding_seal', te.id); play(T, 'suzu_banishing_seal', te.id); play(T, 'suzu_ofuda', te.id);
    t.eq(T.energy, 0, 'the whole line costs exactly the 3 Breath of a turn');
    t.ok(te.maxHp - te.hp >= 20, 'a 3 Breath effects-rack turn deals at least 20 to one enemy: ' + (te.maxHp - te.hp));
    t.ok(te.st.vulnerable === 2 && te.st.weak === 1 && te.st.frail === 1 && te.st.mark === 1, 'and leaves Muffled, Wobbly, Exposed and a Tag on it for the partner');
    // SQUEAL BACK: lead spot, Stage Monitors draws the biter's random hits and every one costs it Feedback
    const H = make({ row: 'front', deck: ['suzu_stone_lion'], hand: ['suzu_stone_lion'], enemies: ['suzu_test_biter'] });
    play(H, 'suzu_stone_lion'); const be = H.enemies[0], hp = be.hp;
    H.endTurn();
    t.ok(hp - be.hp >= 3 * 3, 'three bites into 3 Feedback cost the biter at least 9 HP: ' + (hp - be.hp));
    t.ok(H.events.filter((e) => e.type === 'thorns').length >= 3, 'a thorns event per bite, even though the Block soaked the blows');
    // THE ROOM: bank Reverb, wall both heroes, then the Roar turns the wall into damage and the wall stays
    const S = make({ row: 'back', deck: ['suzu_prayer_wall', 'suzu_barrier', 'suzu_komainu_roar'], hand: ['suzu_prayer_wall', 'suzu_barrier', 'suzu_komainu_roar'], ward: 3, enemies: ['suzu_test_dummy', 'suzu_test_dummy'] });
    S.energy = 4; play(S, 'suzu_prayer_wall'); play(S, 'suzu_barrier'); play(S, 'suzu_komainu_roar');
    t.eq(suzu(S).block, 8 + 3, 'an 11 Block wall');
    S.enemies.forEach((e) => t.eq(e.maxHp - e.hp, 11, 'the Roar hits every enemy for the whole wall'));
    t.eq(suzu(S).block, 11, 'and the wall is still standing');
  });
  t.test('a downed ally: RawClaw still plays, ally-only ops are skipped, and nothing throws', () => {
    const C = make({ row: 'front', deck: nonToken.map((c) => c.id), enemies: ['suzu_test_dummy'], ward: 4 });
    partner(C).hp = 0; partner(C).down = true;
    for (let r = 0; r < 3 && C.result === null; r++) {
      C.energy = 6;
      C.hand.slice().forEach((c) => { if (C.result === null && C.canPlay(c.uid, C.legalTargets(c.uid)[0]).ok) { try { play(C, c.id); } catch (e) { t.ok(false, `${c.id} threw with a downed ally: ${e && e.stack || e}`); } } });
      C.endTurn();
    }
    t.ok(conserved(C), 'piles conserved');
  });
  t.test('the whole set is deterministic for a seed', () => {
    const run = (seed) => {
      const C = make({ row: 'back', deck: nonToken.map((c) => ({ id: c.id, up: seed % 2 })), enemies: ['suzu_test_biter', 'suzu_test_dummy'], seed, ward: 3 });
      for (let r = 0; r < 4 && C.result === null; r++) {
        C.energy = 6;
        C.hand.slice().forEach((c) => { if (C.result === null && C.canPlay(c.uid, C.legalTargets(c.uid)[0]).ok) play(C, c.id); });
        C.endTurn();
      }
      return JSON.stringify([C.heroes.map((h) => [h.hp, h.block, h.st]), C.enemies.map((e) => [e.hp, e.st]), C.events.length]);
    };
    t.eq(run(31), run(31), 'same seed, same fight'); t.ok(run(31) !== run(32), 'a different seed differs');
  });
  t.test('a greedy simulated fight with a RawClaw deck ends without an engine error', () => {
    const deck = DATA.heroes.suzu.starter.map((id) => D(id, 0));
    const partnerDeck = DATA.cards.hanae_slash ? ['hanae_slash', 'hanae_slash', 'hanae_parry', 'hanae_parry', 'hanae_petal_step'].map((id) => D(id, 0)) : [];
    const sum = COMBAT.simulate({ heroes: [{ id: 'suzu', hp: 68, maxHp: 68 }, { id: 'hanae', hp: 76, maxHp: 76 }], frontIdx: 1, deck: deck.concat(partnerDeck), enemies: ['suzu_test_dummy'], seed: 5, tier: 'normal', chapter: 1, maxTurns: 12 });
    t.ok(sum && sum.actions > 0, 'the bot played cards');
  });
}

t.done();
