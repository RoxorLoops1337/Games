// Treasure: the 66 relics (js/data_relics.js), the 24 gems (js/data_gems.js) and the 12 junk cards (js/data_cards_shared.js).
//
//   node tests/rogue_book_treasure.test.mjs
//
// What this suite guards (each block is its own group of assertions so a failure names the rule):
//   1 structure   registries, validator (zero errors and zero warnings), audit (zero lines), ids, unique names
//   2 relic quotas CONTENT_SPEC section 5: 66 = 22/22/12/6/4, the four fixed ids and rarities, three per hero, locked share, icon and
//                 palette spread, coverage of every mod key, every hook, rows, gem and swap relics, boss trades
//   3 relic text  one plain sentence of at most 90 characters, and a MACHINE SUMMARY of each relic (mods, rows and every hook through
//                 DATA.hookText) that the sentence must agree with: every number, status, resource, noun and trigger the data uses has
//                 to be in the text, and a hero relic names its hero. A sample is also checked against exact expected phrases.
//   4 gems        24 gems, six per colour, tier ladder 1,1,2,2,3,3, unique names, locks, colour identity (green and gold work on any
//                 card, red and blue flat keys only on cards that have the op), a ROUGH VALUE MODEL that keeps the tiers a real ladder
//   5 gems on cards  every gem resolved on attack, skill, power, 0 cost and X cost cards, in both rows: a dmg gem on a skill does nothing,
//                 gold and green gems work on anything, a row gem works only in its row
//   6 junk cards  the six curses and six status cards exactly as CONTENT_SPEC section 2 words them
//   7 engine      when js/combat.js exists: every gem played in a real combat, every junk card in a real combat, every combat hook
//                 relic fired through a swapping bot in four scenarios with its effect events checked, a kitchen sink fight with all
//                 relics, mods and rows reaching the engine. Skipped (with a note) while the engine files are missing.
//   8 run hooks   when js/run.js and js/map.js exist: pickup, chapter start, paint, rest, shop and fight won hooks through RUN.
//
// ROUGH VALUE MODEL (block 4). Points are "damage equivalents" for one play of the card the gem sits on:
//   flat damage 1.3 per point (a card averages a bit more than one hit), Block 1, healing 1.4 per HP (HP lasts across fights; a gem with both
//   flat Block and flat heal counts the better of the two), an extra
//   hit 6, one Energy 8 (cost -1 is worth 6.5: it is ignored on 0 cost and X cards), a card drawn 3.5, Might 4, Thorns 2.5, Dodge 3.5,
//   Ritual 7, gold 0.7, Ink 3, a pick from the discard pile 5, a resource point 3 (a list of conditions counts as its best branch), Retain 2.5, losing Exhaust 3, Poison 1.8; a splash
//   op counts x1.8 (two victims), Block for both heroes x2, life steal adds 0.7 per point; a row gated gem is worth 75 percent of its raw value.
//   BANDS: tier 1 in [2, 5.5], tier 2 in [5, 10.5], tier 3 in [6.5, 16]; per colour the tier means must climb by at least 1.4 a tier.
//   The model is deliberately crude: it exists to catch a typo that makes a gem twice as strong or a tier that is not an upgrade.
import fs from 'node:fs';
import path from 'node:path';
import { boot, harness, DIR } from './rogue_book_lib.mjs';

const t = harness('rogue_book treasure');
const JS = path.join(DIR, 'js');
const exists = (f) => fs.existsSync(path.join(JS, f));
const DASH = new RegExp('[' + String.fromCharCode(0x2014, 0x2013) + ']');

const api = boot({ only: ['data_relics', 'data_gems', 'data_cards_shared'].concat(exists('data_text.js') ? ['data_text'] : []) });
const { DATA } = api;
const L = DATA.LISTS;
const HAS_TEXT = typeof DATA.hookText === 'function' && typeof DATA.gemText === 'function';

// ------------------------------------------------------------------------------------------------ helpers
const relics = Object.values(DATA.relics);
const gems = Object.values(DATA.gems);
const junk = Object.values(DATA.cards);
const byRarity = (r) => relics.filter((x) => x.rarity === r);
const count = (list, f) => list.filter(f).length;
const flatOps = (fx) => { const out = []; DATA.walkOps(fx, (o) => out.push(o)); return out; };
const hooksOf = (r) => r.hooks || [];
const numbersDeep = (v, out) => {
  if (typeof v === 'number') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => numbersDeep(x, out));
  else if (v && typeof v === 'object') Object.keys(v).forEach((k) => numbersDeep(v[k], out));
  return out;
};

// ================================================================================================ 1 structure
t.test('loading: the three files load without errors and define only their own registries', () => {
  t.eq(api._errors.length, 0, 'no load errors: ' + JSON.stringify(api._errors));
  t.eq(relics.length, 66, 'relic count');
  t.eq(gems.length, 24, 'gem count');
  t.eq(junk.length, 12, 'only the 12 junk cards are defined by these files');
  t.ok(junk.every((c) => c.hero === 'curse' || c.hero === 'status'), 'every card here is a curse or a status card');
  t.ok(relics.every((r) => /^[a-z][a-z0-9_]*$/.test(r.id)) && gems.every((g) => /^[a-z][a-z0-9_]*$/.test(g.id)), 'ids are snake_case');
});

t.test('the validator finds nothing (errors and warnings), and the audits are silent', () => {
  ['relics', 'gems'].forEach((k) => { const v = DATA.validate(k); t.deep(v.errors, [], `${k}: no validation errors`); t.deep(v.warnings, [], `${k}: no validation warnings`); });
  const c = DATA.validate('cards', { hero: 'shared' });
  t.deep(c.errors, [], 'junk cards: no validation errors'); t.deep(c.warnings, [], 'junk cards: no validation warnings');
  t.deep(DATA.audit('relics'), [], 'DATA.audit relics has no audit or guide lines');
  t.deep(DATA.audit('gems'), [], 'DATA.audit gems has no audit or guide lines');
  t.deep(DATA.audit('cards', { hero: 'shared' }), [], 'DATA.audit cards (shared scope) has no lines');
  const strict = DATA.validate(['relics', 'gems'], { strict: true });
  t.deep(strict.errors, [], 'strict validation of relics and gems (fixed ids present with the right rarity)');
});

t.test('no em or en dashes anywhere in the content, and no function values', () => {
  [relics, gems, junk].forEach((list) => list.forEach((d) => { t.ok(!DASH.test(JSON.stringify(d)), `${d.id} has no dash`); t.ok(JSON.stringify(d) === JSON.stringify(JSON.parse(JSON.stringify(d))), `${d.id} is plain data`); }));
});

t.test('names are unique, non empty and short enough to fit a plaque', () => {
  const rn = relics.map((r) => r.name.toLowerCase()), gn = gems.map((g) => g.name.toLowerCase()), cn = junk.map((c) => c.name.toLowerCase());
  t.eq(new Set(rn).size, rn.length, 'relic names are unique');
  t.eq(new Set(gn).size, gn.length, 'gem names are unique');
  t.eq(new Set(cn).size, cn.length, 'junk card names are unique');
  t.eq(new Set(rn.concat(gn)).size, rn.length + gn.length, 'no relic shares a name with a gem');
  t.ok(relics.every((r) => r.name.length >= 4 && r.name.length <= 30), 'relic names are 4 to 30 characters');
  t.ok(gems.every((g) => g.name.length >= 8 && g.name.length <= 30), 'gem names are 8 to 30 characters');
});

// ================================================================================================ 2 relic quotas
t.test('relic quota: 66 = common 22, uncommon 22, rare 12, boss 6, shop 4', () => {
  const q = DATA.QUOTA.relics;
  ['common', 'uncommon', 'rare', 'boss', 'shop'].forEach((r) => t.eq(byRarity(r).length, q[r], `${r} count`));
  t.eq(q.common + q.uncommon + q.rare + q.boss + q.shop, 66, 'the quota itself sums to 66');
  t.ok(relics.every((r) => L.relicRarities.indexOf(r.rarity) >= 0), 'every rarity is a legal rarity');
});

t.test('the four fixed relics exist with the rarities CONTENT_SPEC section 2 gives them', () => {
  const fixed = { brass_lantern: 'common', fox_mask: 'uncommon', silver_bell: 'uncommon', jade_key: 'rare' };
  Object.keys(fixed).forEach((id) => { t.ok(DATA.relics[id], `${id} exists`); t.eq(DATA.relics[id] && DATA.relics[id].rarity, fixed[id], `${id} rarity`); });
  t.deep(DATA.FIXED.relics, fixed, 'DATA.FIXED agrees');
  t.ok(!DATA.relics.brass_lantern.locked && !DATA.relics.fox_mask.locked && !DATA.relics.silver_bell.locked && !DATA.relics.jade_key.locked, 'events add the fixed relics by id, so none of them is locked');
});

t.test('three relics per hero, one of each of common, uncommon and rare, none locked, all built on that hero\'s resource', () => {
  const RES = { hanae: 'bloom', kuro: 'sumi', suzu: 'ward', raiga: 'charge' };
  L.heroIds.forEach((h) => {
    const mine = relics.filter((r) => r.hero === h);
    t.eq(mine.length, 3, `${h} has exactly 3 relics`);
    t.deep(mine.map((r) => r.rarity).sort(), ['common', 'rare', 'uncommon'], `${h}: one common, one uncommon, one rare`);
    t.ok(mine.every((r) => !r.locked), `${h}: hero relics are never locked (a hero relic must be findable the first time you play that hero)`);
    t.ok(mine.every((r) => hooksOf(r).length > 0 && !r.mods && !r.rows), `${h}: owned relics are pure hooks (mods and rows are party wide, so they would not be the hero's own)`);
    t.ok(mine.some((r) => JSON.stringify(r.hooks).indexOf('"' + RES[h] + '"') >= 0), `${h}: at least one relic touches ${RES[h]}`);
    t.ok(mine.every((r) => r.text.indexOf(DATA.heroes[h].name) >= 0), `${h}: every text names the hero`);
  });
  t.eq(count(relics, (r) => r.hero), 12, 'exactly 12 hero relics in all');
  t.ok(relics.every((r) => !r.hero || hooksOf(r).every((h) => L.combatHooks.indexOf(h.on) >= 0)), 'owned hooks are combat hooks (a run hook has no owner)');
});

t.test('locked share is at most 30 percent, boss and shop pools keep enough unlocked relics, every pool has starter content', () => {
  const locked = relics.filter((r) => r.locked);
  t.ok(locked.length <= Math.floor(relics.length * 0.3), `locked ${locked.length} of ${relics.length}`);
  t.ok(locked.length >= 6, 'and there is something to buy in the Library');
  t.ok(count(byRarity('boss'), (r) => !r.locked) >= 5, 'at least 5 unlocked boss relics (a boss offers 3, and there are 3 chapters)');
  t.ok(count(byRarity('shop'), (r) => !r.locked) >= 3, 'at least 3 unlocked shop relics');
  t.ok(count(byRarity('common'), (r) => !r.locked) >= 18, 'at least 18 unlocked commons');
  t.ok(count(byRarity('uncommon'), (r) => !r.locked) >= 14, 'at least 14 unlocked uncommons');
  t.ok(count(byRarity('rare'), (r) => !r.locked) >= 7, 'at least 7 unlocked rares');
  ['common', 'uncommon', 'rare', 'boss', 'shop'].forEach((r) => t.ok(DATA.relicPool(r, { card: [], relic: [], gem: [] }, ['hanae', 'kuro']).length >= 3, `a fresh profile has a ${r} pool for a Hanae and Kuro party`));
  t.ok(locked.every((r) => r.rarity !== 'common' || locked.filter((x) => x.rarity === 'common').length <= 2), 'at most 2 locked commons');
});

t.test('icons: at least 40 (in fact all 58) different, none used more than twice; palettes spread over all twelve hues', () => {
  const icons = {}; relics.forEach((r) => { icons[r.art.m] = (icons[r.art.m] || 0) + 1; });
  t.ok(Object.keys(icons).length >= 40, `distinct icons ${Object.keys(icons).length}`);
  t.eq(Object.keys(icons).length, L.relicIcons.length, 'every relic icon in LISTS.relicIcons is drawn by at least one relic (the icon art is never wasted)');
  t.ok(Object.keys(icons).every((k) => icons[k] <= 2), 'no icon is used more than twice: ' + JSON.stringify(Object.keys(icons).filter((k) => icons[k] > 2)));
  const pal = {}; relics.forEach((r) => { pal[r.art.c] = (pal[r.art.c] || 0) + 1; });
  t.ok(relics.every((r) => L.palettes.indexOf(r.art.c) >= 0), 'every relic has a palette from LISTS.palettes');
  t.eq(Object.keys(pal).length, L.palettes.length, 'all twelve palettes appear');
  t.ok(Object.keys(pal).every((k) => pal[k] <= 9 && pal[k] >= 3), 'no palette dominates: ' + JSON.stringify(pal));
  t.ok(['common', 'uncommon', 'rare', 'boss', 'shop'].every((r) => new Set(byRarity(r).map((x) => x.art.c)).size >= Math.min(4, byRarity(r).length)), 'every rarity is drawn in at least four hues (or all it has)');
});

t.test('coverage: every mod key, every combat hook (combatEnd included), every run hook, rows and gem relics', () => {
  const mods = new Set(), hooks = {};
  relics.forEach((r) => { Object.keys(r.mods || {}).forEach((k) => mods.add(k)); hooksOf(r).forEach((h) => { hooks[h.on] = (hooks[h.on] || 0) + 1; }); });
  L.mods.forEach((k) => t.ok(mods.has(k), `mod ${k} is used`));
  L.combatHooks.concat(L.runHooks).forEach((h) => t.ok(hooks[h] >= 1, `hook ${h} is used`));
  t.ok(count(relics, (r) => r.rows) >= 2, 'at least 2 relics with rows');
  t.ok(relics.some((r) => r.rows && r.rows.front) && relics.some((r) => r.rows && r.rows.back), 'rows relics reach both the front and the back row');
  t.ok(count(relics, (r) => hooksOf(r).some((h) => h.filter && h.filter.gems)) >= 3, 'at least 3 relics keyed on gems');
  t.ok(count(relics, (r) => hooksOf(r).some((h) => h.on === 'onSwap')) >= 3, 'at least 3 swap hook relics');
  t.ok(count(relics, (r) => hooksOf(r).some((h) => h.on === 'onSwap') || (r.mods && r.mods.freeSwaps)) >= 4, 'at least 4 swap relics counting the free swap');
  t.ok(count(relics, (r) => r.mods && r.mods.freeSwaps) >= 1, 'a free swap relic');
  t.ok(count(relics, (r) => hooksOf(r).some((h) => flatOps(h.fx).some((o) => o.op === 'cond' && o.if && o.if.row))) >= 1, 'a relic that reads the row with a cond');
  t.ok(count(relics, (r) => hooksOf(r).some((h) => L.runHooks.indexOf(h.on) >= 0 && h.fx.some((o) => o.op === 'paint' || o.op === 'ink' || o.op === 'addBrush'))) >= 5, 'at least 5 map relics (paint, Ink or Brush hooks)');
  t.ok(count(relics, (r) => r.mods && (r.mods.inkMax || r.mods.startInk || r.mods.wellInk)) >= 3, 'at least 3 Ink stock relics (inkstone_weight, ink_jar, well_kasa: the Gourd is a Might trade now)');
  t.ok(count(relics, (r) => hooksOf(r).some((h) => h.on === 'onRest')) >= 1 && count(relics, (r) => r.mods && r.mods.campActions) >= 1, 'camp relics');
  t.ok(count(relics, (r) => hooksOf(r).some((h) => h.on === 'onShopEnter')) >= 1 && count(relics, (r) => r.mods && r.mods.priceMul) >= 1, 'shop relics');
  ['bloom', 'sumi', 'ward', 'charge'].forEach((s) => t.ok(count(relics, (r) => JSON.stringify(hooksOf(r)).indexOf('"' + s + '"') >= 0) >= 2, `at least 2 relics use ${s}`));
  t.ok(count(relics, (r) => r.mods && r.mods.energy) >= 2 && count(relics, (r) => r.mods && r.mods.hand) >= 2, 'Energy and hand size come from boss relics only: see the next test');
});

t.test('economy guards: Energy and hand size only on boss relics, always with a real drawback; no boss relic is a free lunch', () => {
  relics.forEach((r) => {
    const m = r.mods || {};
    if (m.energy > 0 || m.hand > 0) t.eq(r.rarity, 'boss', `${r.id}: a plus to Energy or hand size is a boss trade`);
  });
  byRarity('boss').forEach((r) => {
    const m = r.mods || {};
    const drawback = m.healMul < 0 || m.goldMul < 0 || m.hand < 0 || m.startInk < 0 || m.inkMax < 0 || m.energy < 0 || m.priceMul > 0
      || hooksOf(r).some((h) => flatOps(h.fx).some((o) => o.op === 'addCurse' || o.op === 'hurt' || (o.op === 'add' && /^curse_/.test(o.card)) || (o.op === 'status' && DATA.isDebuff(o.s) && ['self', 'ally', 'both', 'front', 'back'].indexOf(o.tgt) >= 0)));
    t.ok(drawback, `${r.id} has a drawback in its data`);
    t.ok(/\bbut\b/i.test(r.text), `${r.id}: the text says "but"`);
    const parts = Object.keys(m).length + hooksOf(r).reduce((n, h) => n + flatOps(h.fx).length, 0);
    t.ok(parts >= 2, `${r.id} pairs a boon with its price (${parts} parts)`);
  });
  const stack = DATA.modsFor(relics.filter((r) => r.rarity !== 'boss').map((r) => r.id), 0);
  t.eq(stack.energy, 3, 'no non-boss relic touches Energy');
  t.eq(stack.hand, 5, 'no non-boss relic touches the hand size');
  t.ok(DATA.modsFor(['tyrants_crown', 'blood_moon_vow'], 0).energy === 5, 'two Energy boss relics stack (and are exactly what a 3 chapter run could hold)');
});

t.test('economy guards: a row bonus follows whoever stands there, so a relic row bonus may never smuggle in extra cards or Energy', () => {
  relics.forEach((r) => ['front', 'back'].forEach((row) => { const b = (r.rows || {})[row] || {}; t.ok(!b.drawAdd, `${r.id}.${row}: drawAdd would be a free hand size relic (both rows are always occupied)`); t.ok(!b.startBlock || b.startBlock <= 3, `${r.id}.${row}: startBlock stays small`); }));
  t.ok(relics.every((r) => !r.rows || !r.mods), 'a rows relic is only rows (its text has one job)');
});

t.test('economy guards: fractions and counts stay inside the folding rules; nothing pushes a stat out of range', () => {
  const all = DATA.modsFor(relics.map((r) => r.id), 0);
  t.ok(all.goldMul >= 0.1 && all.healMul >= 0.1 && all.priceMul >= 0.1, 'every fraction folds to at least 0.1');
  t.ok(all.cardChoices <= 6 && all.wellInk <= 12 && all.campActions <= 3 && all.freeSwaps <= 5, 'counts stay in their clamps even with every relic');
  relics.forEach((r) => Object.keys(r.mods || {}).forEach((k) => { if (L.modKind[k] === 'frac') t.ok(Math.abs(r.mods[k]) <= 0.5, `${r.id}.${k} is a modest fraction`); }));
  relics.forEach((r) => Object.keys(r.mods || {}).forEach((k) => t.ok(Math.abs(r.mods[k]) <= 8 || L.modKind[k] === 'frac', `${r.id}.${k} is a sane size`)));
});

// ================================================================================================ 3 relic text
t.test('text: one plain sentence of at most 90 characters, capitalised, ending in a period, no markup', () => {
  relics.forEach((r) => {
    t.ok(typeof r.text === 'string' && r.text.length >= 12 && r.text.length <= 90, `${r.id}: text length ${r.text && r.text.length}`);
    t.ok(/^[A-Z0-9]/.test(r.text) && /\.$/.test(r.text), `${r.id}: capital first, period last`);
    t.ok(!/[.!?;:](\s|$)/.test(r.text.slice(0, -1)) && !/[<>]/.test(r.text), `${r.id}: exactly one sentence, no markup`);
    t.ok(!/\s\s/.test(r.text) && r.text === r.text.trim(), `${r.id}: clean spacing`);
    t.eq(DATA.relicText ? DATA.relicText(r.id) : r.text, r.text, `${r.id}: DATA.relicText returns the text`);
  });
});

// The machine summary. Numbers, nouns, statuses, targets and triggers the data uses must all be in the sentence.
const NUMWORDS = { 0: ['zero', 'no', 'free'], 1: ['one', 'a', 'an', 'once', 'first', 'next', 'single', 'another', 'extra', 'more', 'less', 'fewer'], 2: ['two', 'twice', 'second', 'both'], 3: ['three', 'third'], 4: ['four', 'fourth'], 5: ['five', 'fifth'], 6: ['six'], 8: ['eight'], 10: ['ten'], 20: ['twenty'] };
const mentions = (text, n) => new RegExp('(^|[^0-9.])' + n + '(?![0-9])').test(text) || (NUMWORDS[n] || []).some((w) => new RegExp('\\b' + w + '\\b', 'i').test(text));
const OPWORD = {
  dmg: /damage/i, block: /block/i, heal: /heal/i, draw: /draw/i, energy: /energy/i, gold: /gold/i, ink: /\bink\b/i, maxHp: /max HP/i, revive: /revive/i,
  hurt: /lose|hurt/i, removeStatus: /cleanse|remove|spend/i, paint: /paint/i, addBrush: /brush/i, addGem: /gem/i, addCurse: /curse/i, upgradeCard: /upgrade/i,
};
const MODWORD = {
  energy: [/energy/i], hand: [/card/i, /draw/i], startBlock: [/block/i], inkMax: [/ink/i], startInk: [/ink/i], wellInk: [/well/i, /ink/i], cardChoices: [/card/i],
  freeSwaps: [/swap/i], campActions: [/camp/i], rareBoost: [/rare/i], goldMul: [/gold/i], priceMul: [/price/i], healMul: [/heal/i],
};
const ROWWORD = { dmgAdd: /damage/i, blockAdd: /block/i, startBlock: /block/i, regen: /regen/i, thorns: /thorns/i, drawAdd: /draw/i };
const TRIG = {
  combatStart: /start(s)? (of )?(each )?(combat|fight)/i, combatEnd: /end of (each|the) (combat|fight)/i,
  turnStart: /start of (your|each|every) turn|turn start|first turn|\d(st|nd|rd|th) turn|each turn|every turn|\ba turn\b/i, turnEnd: /end of (your|each) turn/i,
  onPlay: /\bplay(s|ed)?\b/i, onDamaged: /\bhit\b/i, onKill: /defeat|kill/i, onSwap: /swap/i, onHeroDown: /falls?\b/i, onShuffle: /reshuffle/i, onExhaust: /exhaust/i,
  onPickup: /when you take this|taking this/i, onChapterStart: /chapter/i, onRest: /rest/i, onPaint: /paint/i, onFightWon: /fight|winning/i, onShopEnter: /shop/i,
};
const TGTWORD = { all: /\ball\b/i, both: /both|heroes|each/i, ally: /ally/i, front: /front/i };
const TIERWORD = { elite: /elite/i, boss: /boss/i, normal: /normal/i, minion: /minion/i };

function summary(r) {
  const nums = [], words = [], notes = [];
  const needNum = (n, why) => { if (typeof n === 'number' && Number.isFinite(n)) nums.push({ n: Math.abs(n), why }); };
  const needWord = (re, why) => words.push({ re, why });
  Object.keys(r.mods || {}).forEach((k) => {
    needNum(L.modKind[k] === 'frac' ? Math.round(r.mods[k] * 100) : r.mods[k], `mod ${k}`);
    (MODWORD[k] || []).forEach((re) => needWord(re, `mod ${k}`));
    notes.push(`${k} ${r.mods[k] > 0 ? '+' : ''}${r.mods[k]}`);
  });
  ['front', 'back'].forEach((row) => Object.keys((r.rows || {})[row] || {}).forEach((k) => {
    needNum(r.rows[row][k], `${row} ${k}`); needWord(ROWWORD[k], `${row} ${k}`); needWord(new RegExp(row, 'i'), `row ${row}`);
    notes.push(`${row} ${k} ${r.rows[row][k]}`);
  }));
  hooksOf(r).forEach((h) => {
    needWord(TRIG[h.on], `trigger ${h.on}`);
    if (h.every) needNum(h.every, 'every');
    if (h.limit) needNum(h.limit, 'limit');
    if (h.once) needWord(/first time|once|next/i, 'once');
    const f = h.filter || {};
    if (f.type) [].concat(f.type).forEach((x) => needWord(new RegExp(x, 'i'), `filter type ${x}`));
    if (f.cost) { needWord(/cost/i, 'filter cost'); numbersDeep(f.cost, []).forEach((n) => needNum(n, 'filter cost')); }
    if (f.gems) { needWord(/gem/i, 'filter gems'); needNum(f.gems.gte, 'filter gems'); }
    if (f.tier) [].concat(f.tier).forEach((x) => needWord(TIERWORD[x], `filter tier ${x}`));
    DATA.walkOps(h.fx, (o) => {
      if (OPWORD[o.op]) needWord(OPWORD[o.op], `op ${o.op}`);
      if (typeof o.n === 'number') needNum(o.n, `${o.op} n`);
      if (typeof o.pct === 'number') needNum(Math.round(o.pct * 100), `${o.op} pct`);
      if (o.tier) needNum(o.tier, `${o.op} tier`);
      if (o.op === 'status' || (o.op === 'removeStatus' && DATA.statuses[o.s])) needWord(new RegExp(DATA.statuses[o.s].name, 'i'), `status ${o.s}`);
      if (o.op === 'removeStatus' && o.s === 'debuffs') needWord(/cleanse|debuff/i, 'debuffs');
      if (o.op === 'addBrush') needWord(/random/i, 'random brush');
      if (o.op === 'upgradeCard' && o.random) needWord(/random/i, 'random upgrade');
      if (o.op === 'dmg' && o.tgt === 'enemy' && h.on === 'onDamaged') needWord(/attacker/i, 'attacker');
      if (o.op === 'dmg' && o.tgt === 'enemy' && h.on === 'onPlay') needWord(/target|more damage/i, 'same target');
      if (o.tgt && TGTWORD[o.tgt]) needWord(TGTWORD[o.tgt], `target ${o.tgt}`);
      if (o.op === 'cond' && o.if) {
        needWord(/if|at \d|with|when|first turn/i, 'condition');
        if (o.if.row) needWord(new RegExp(o.if.row, 'i'), 'cond row');
        numbersDeep(o.if, []).forEach((n) => needNum(n, 'cond'));
        if (o.if.status) needWord(new RegExp(DATA.statuses[o.if.status.s].name, 'i'), `cond status ${o.if.status.s}`);
        if (o.if.block) needWord(/block/i, 'cond block');
        if (o.if.turn) needWord(/first turn|turn 1/i, 'cond turn');
      }
    });
    if (HAS_TEXT) notes.push(DATA.hookText(h));
  });
  return { nums, words, notes };
}

t.test('text agrees with the data: every number, noun, status, target and trigger of every mod, row and hook is in the sentence', () => {
  relics.forEach((r) => {
    const s = summary(r);
    s.nums.forEach((x) => t.ok(mentions(r.text, x.n), `${r.id}: "${r.text}" must mention ${x.n} (${x.why})`));
    s.words.forEach((x) => t.ok(x.re.test(r.text), `${r.id}: "${r.text}" must match ${x.re} (${x.why})`));
    if (r.hero) t.ok(r.text.indexOf(DATA.heroes[r.hero].name) >= 0, `${r.id}: names ${r.hero}`);
    // the second, independent path: what DATA.opsText prints for the hook bodies, number by number
    if (HAS_TEXT && typeof DATA.opsText === 'function') hooksOf(r).forEach((h) => {
      const run = L.runHooks.indexOf(h.on) >= 0;
      const out = DATA.opsText(h.fx, { run });
      t.ok(out.length > 0 && !/undefined|NaN|\[object/.test(out), `${r.id}: opsText reads the ${h.on} body: ${out}`);
      (out.match(/\d+/g) || []).map(Number).filter((n) => n >= 2).forEach((n) => t.ok(mentions(r.text, n), `${r.id}: opsText says "${out}", so the text "${r.text}" must mention ${n}`));
    });
  });
});

t.test('text: the machine summaries themselves are sane (DATA.hookText reads every hook, and the sentences do not contradict them)', () => {
  if (!HAS_TEXT) { console.log('treasure: hookText checks skipped (data_text.js missing)'); return; }
  relics.forEach((r) => hooksOf(r).forEach((h) => {
    const s = DATA.hookText(h);
    t.ok(typeof s === 'string' && s.length > 10 && /\.$/.test(s), `${r.id}: hookText gives a sentence for ${h.on}`);
    t.ok(!/undefined|NaN|\[object/.test(s), `${r.id}: hookText is clean: ${s}`);
  }));
  // a sample checked against exact machine phrases (eyeballed once, now pinned)
  const say = (id, i) => DATA.hookText(DATA.relics[id].hooks[i || 0]);
  t.eq(say('rice_ball'), 'Whenever you win a fight, heal both heroes for 2 HP and heal the weakest hero for 2 HP.', 'rice_ball');
  t.eq(say('pilgrim_compass'), 'Every 5th time you paint a hex, gain 1 Ink.', 'pilgrim_compass');
  t.eq(say('silver_bell'), 'The next time you are hit, both heroes gain 6 Block.', 'silver_bell reads as a once per fight hook');
  t.eq(say('fox_mask'), 'Once per turn, every 2nd time you swap rows, gain 1 Dodge.', 'fox_mask (the actor is the new front hero)');
  t.eq(say('mirror_of_two_faces'), 'Once per turn, whenever you swap rows, gain 1 Energy.', 'mirror_of_two_faces');
  t.eq(say('prism_crown'), 'Once per turn, whenever you play a card with 2 or more gems, gain 1 Energy.', 'prism_crown');
  t.eq(say('phoenix_feather'), 'The next time a hero falls, revive that hero with 25% HP.', 'phoenix_feather');
  t.eq(say('dragon_pearl'), 'Whenever you defeat an Elite, both heroes gain 2 max HP.', 'dragon_pearl');
  t.eq(say('sands_of_patience'), 'At the start of every 3rd turn, gain 1 Energy and draw 1 card.', 'sands_of_patience');
  t.eq(say('thunder_wheel'), 'Every 3rd time you play an Attack, gain 2 Charge and deal 4 damage to all enemies.', 'thunder_wheel');
  t.eq(say('nightlong_inkwell'), 'At the end of your turn, apply 2 Poison to all enemies.', 'nightlong_inkwell');
  t.eq(say('tyrants_crown'), 'When you take this, add 3 curses to your deck.', 'tyrants_crown pays its price on pickup');
  t.eq(say('blood_moon_vow'), 'At the start of your turn, both heroes lose 2 HP.', 'blood_moon_vow');
  t.eq(say('apothecary_jar'), 'At the end of combat, heal both heroes for 3 HP.', 'apothecary_jar is a combatEnd hook');
  t.eq(say('longbow_of_reach'), 'Up to 2 times per turn, whenever you play an Attack, Back: deal 3 damage to the same target.', 'longbow_of_reach reads the row');
  t.eq(JSON.stringify(DATA.relics.formation_scroll.rows), '{"front":{"startBlock":3},"back":{"blockAdd":1}}', 'formation_scroll rows');
  t.eq(JSON.stringify(DATA.relics.war_banner.rows), '{"front":{"dmgAdd":1}}', 'war_banner rows');
});

// ================================================================================================ 4 gems
t.test('gem quota: 24 gems, six per colour with tiers 1, 1, 2, 2, 3, 3, and a complete definition each', () => {
  t.eq(gems.length, DATA.QUOTA.gems.perColor * 4, '24 gems');
  L.gemColors.forEach((c) => {
    const mine = gems.filter((g) => g.color === c);
    t.eq(mine.length, 6, `${c} has 6 gems`);
    t.deep(mine.map((g) => g.tier).sort(), DATA.QUOTA.gems.tiers, `${c} tier ladder`);
  });
  gems.forEach((g) => {
    t.ok(g.art && L.gemCuts.indexOf(g.art.cut) >= 0, `${g.id}: a legal cut`);
    t.ok(g.mod && Object.keys(g.mod).every((k) => L.gemModKeys.indexOf(k) >= 0), `${g.id}: only legal mod keys`);
    t.ok(JSON.stringify(g.mod).indexOf('"X"') < 0, `${g.id}: no per X in gem fx`);
    t.ok(!('fx' in g.mod) || Array.isArray(g.mod.fx), `${g.id}: at most one fx group, and it is a list`);
    t.ok(!g.mod.cond || (['front', 'back'].indexOf(g.mod.cond) >= 0), `${g.id}: conditions are front or back only, through mod.cond`);
    t.ok(!g.mod.cost || g.tier === 3, `${g.id}: a cost gem is tier 3`);
  });
  L.gemCuts.forEach((cut) => t.ok(gems.some((g) => g.art.cut === cut), `the ${cut} cut is used`));
  L.gemColors.forEach((c) => t.ok(new Set(gems.filter((g) => g.color === c).map((g) => g.art.cut)).size >= 3, `${c} gems come in at least 3 cuts`));
  const fxGems = gems.filter((g) => g.mod.fx);
  t.ok(fxGems.length >= 6, 'at least 6 gems carry an fx group (the tier 3 role changers among them)');
});

t.test('gem locks: never tier 1, at least 4 (tier 2 and 3), and every colour keeps an unlocked tier 2 and tier 3', () => {
  t.ok(gems.filter((g) => g.tier === 1).every((g) => !g.locked), 'tier 1 gems are never locked');
  t.ok(count(gems, (g) => g.locked) >= 4, 'at least 4 locked gems');
  t.ok(count(gems, (g) => g.locked) <= 8, 'and no more than a third of the set');
  t.ok(gems.some((g) => g.locked && g.tier === 2) && gems.some((g) => g.locked && g.tier === 3), 'both tier 2 and tier 3 have something to unlock');
  L.gemColors.forEach((c) => [2, 3].forEach((tier) => t.ok(gems.some((g) => g.color === c && g.tier === tier && !g.locked), `${c} tier ${tier} has an unlocked gem`)));
  [[1, 8], [2, 6], [3, 4]].forEach(([tier, n]) => t.ok(DATA.gemPool({ tier }, { card: [], relic: [], gem: [] }).length >= n, `a fresh profile has at least ${n} tier ${tier} gems`));
  L.gemColors.forEach((c) => t.ok(DATA.gemPool({ color: c }, { card: [], relic: [], gem: [] }).length >= 4, `a fresh profile has at least 4 ${c} gems`));
});

t.test('colour identity: red offence, blue defence, green and gold work on any card', () => {
  const ofKind = (g, ...ops) => flatOps(g.mod.fx || []).some((o) => ops.indexOf(o.op) >= 0);
  gems.forEach((g) => {
    const m = g.mod;
    if (g.color === 'red') t.ok(m.dmg || m.hits || ofKind(g, 'dmg'), `${g.id}: a red gem makes an attack hit harder, more often or wider`);
    if (g.color === 'blue') t.ok(m.block || m.heal || ofKind(g, 'heal', 'block') || (m.status && ['thorns', 'dodge', 'bulwark', 'regen'].indexOf(m.status.s) >= 0), `${g.id}: a blue gem defends`);
    if (g.color === 'green' || g.color === 'gold') {
      t.ok(!m.dmg && !m.block && !m.heal && !m.hits, `${g.id}: ${g.color} gems carry no flat dmg, block, heal or hits key (they must work on any card)`);
      t.ok(!ofKind(g, 'dmg', 'block', 'heal'), `${g.id}: ${g.color} gems append no damage, Block or heal op`);
    }
    if (g.color === 'green') t.ok(m.draw || m.energy || m.cost || m.kw || m.kwRemove || ofKind(g, 'pick', 'draw', 'energy'), `${g.id}: a green gem is a utility gem (draw, cost, Energy, Retain, pick)`);
    if (g.color === 'gold') t.ok(m.status || ofKind(g, 'gold', 'ink', 'status') || m.draw, `${g.id}: a gold gem seeds a status or pays gold, Ink or resources`);
  });
  t.ok(gems.some((g) => g.mod.cond === 'front') && gems.some((g) => g.mod.cond === 'back'), 'both a front row gem and a back row gem exist');
  t.ok(gems.filter((g) => g.mod.cond).every((g) => g.tier >= 1), 'row gems come in tiers');
  t.ok(gems.some((g) => g.mod.cost) && gems.some((g) => g.mod.energy) && gems.some((g) => g.mod.draw) && gems.some((g) => g.mod.kw) && gems.some((g) => g.mod.hits) && gems.some((g) => ofKind(g, 'pick')), 'cost, Energy, draw, Retain, extra hits and pick are all on offer');
  t.ok(gems.some((g) => g.mod.status && g.mod.status.s === 'thorns') && gems.some((g) => g.mod.status && g.mod.status.s === 'dodge') && gems.some((g) => ofKind(g, 'heal')) && gems.some((g) => ofKind(g, 'dmg') && g.mod.fx.some((o) => o.lifesteal)), 'Thorns, Dodge, healing and a life steal are on offer');
  t.ok(gems.some((g) => ofKind(g, 'gold')) && gems.some((g) => ofKind(g, 'ink')) && gems.some((g) => g.mod.status && g.mod.status.s === 'might') && gems.some((g) => g.mod.status && g.mod.status.s === 'ritual'), 'gold, Ink, Might and Ritual seeds are on offer');
  t.ok(gems.some((g) => JSON.stringify(g.mod).indexOf('"bloom"') >= 0 && JSON.stringify(g.mod).indexOf('"charge"') >= 0), 'a resource gem covers Bloom, Sumi, Ward and Charge');
});

// the value model (see the header)
function valueOfOps(ops) {
  let v = 0, condBest = 0;                                   // several conditions in one list (the four resources) count as the best branch
  (ops || []).forEach((o) => {
    const n = typeof o.n === 'number' ? o.n : 0;
    if (o.op === 'dmg') { v += n * (o.tgt === 'all' ? 1.8 : 1) + (o.lifesteal ? 0.7 * n : 0); }
    else if (o.op === 'block') v += n * (o.tgt === 'both' ? 2 : 1);
    else if (o.op === 'heal') v += n * 1.4 * (o.tgt === 'both' ? 2 : 1);
    else if (o.op === 'draw') v += 3.5 * n;
    else if (o.op === 'energy') v += 8 * n;
    else if (o.op === 'gold') v += 0.7 * n;
    else if (o.op === 'ink') v += 3 * n;
    else if (o.op === 'pick') v += 5;
    else if (o.op === 'status') v += n * ({ might: 4, thorns: 2.5, dodge: 3.5, ritual: 7, bulwark: 3, bloom: 3, sumi: 3, ward: 3, charge: 3 }[o.s] || 2);
    else if (o.op === 'cond') condBest = Math.max(condBest, valueOfOps(o.then), valueOfOps(o.else));
  });
  return v + condBest;
}
function gemValue(g) {
  const m = g.mod;
  let v = 0;
  if (m.dmg) v += 1.3 * m.dmg * (m.hits ? 2 : 1);
  if (m.block || m.heal) v += Math.max(m.block || 0, 1.4 * (m.heal || 0));            // a card usually has one of the two ops: the gem is worth the better fit
  if (m.hits) v += 6 * m.hits;
  if (m.cost) v += 6.5 * -m.cost;
  if (m.draw) v += 3.5 * m.draw;
  if (m.energy) v += 8 * m.energy;
  if (m.poison) v += 1.8 * m.poison;
  if (m.status) v += valueOfOps([Object.assign({ op: 'status' }, m.status)]);
  if (m.fx) v += valueOfOps(m.fx);
  if (m.kw) v += 2.5 * m.kw.length;
  if (m.kwRemove) v += 3 * m.kwRemove.length;
  if (m.cond) v *= 0.75;
  return v;
}
t.test('gem power ladder: tier 1 is a solid small bonus, tier 2 a real upgrade, tier 3 changes a card; each colour climbs', () => {
  const BAND = { 1: [2, 5.5], 2: [5, 10.5], 3: [6.5, 16] };
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  gems.forEach((g) => { const v = gemValue(g); t.ok(v >= BAND[g.tier][0] && v <= BAND[g.tier][1], `${g.id} (tier ${g.tier}) is worth ${v.toFixed(1)}, band ${BAND[g.tier]}`); });
  L.gemColors.forEach((c) => {
    const vs = [1, 2, 3].map((tier) => gems.filter((g) => g.color === c && g.tier === tier).map(gemValue));
    t.ok(mean(vs[1]) - mean(vs[0]) >= 1.4, `${c}: tier 2 mean ${mean(vs[1]).toFixed(1)} beats tier 1 mean ${mean(vs[0]).toFixed(1)} by at least 1.4`);
    t.ok(mean(vs[2]) - mean(vs[1]) >= 1.4, `${c}: tier 3 mean ${mean(vs[2]).toFixed(1)} beats tier 2 mean ${mean(vs[1]).toFixed(1)} by at least 1.4`);
    t.ok(Math.min(...vs[2]) > Math.max(...vs[0]), `${c}: the weakest tier 3 gem out-values the best tier 1 gem`);
  });
  // tier 3 changes what a card is for: an fx group, a cost cut, Energy, a Ritual or a paired row effect, never just a bigger number
  gems.filter((g) => g.tier === 3).forEach((g) => t.ok(g.mod.fx || g.mod.cost || g.mod.energy || (g.mod.status && g.mod.status.n >= 3) || (g.mod.status && g.mod.status.s === 'ritual') || (g.mod.hits && g.mod.cond) || (g.mod.draw && g.mod.status), `${g.id}: a tier 3 gem changes the card's role`));
  gems.filter((g) => g.tier === 1).forEach((g) => t.ok(Object.keys(g.mod).length <= 2 && !g.mod.cost, `${g.id}: a tier 1 gem is one plain bonus`));
});

t.test('gem text: generated text is readable for every gem, and a hand written text is only used where the auto text cannot carry it', () => {
  if (!HAS_TEXT) { console.log('treasure: gem text checks skipped (data_text.js missing)'); return; }
  gems.forEach((g) => {
    const s = DATA.gemText(g.id);
    t.ok(typeof s === 'string' && s.length >= 6 && s.length <= 90 && !/undefined|NaN|\[object/.test(s), `${g.id}: text "${s}"`);
    t.ok(!DASH.test(s), `${g.id}: no dash in the text`);
  });
  t.deep(gems.filter((g) => g.text).map((g) => g.id), ['heartflame_topaz'], 'only the four way resource gem has hand written text');
  const say = (id) => DATA.gemText(id);
  t.eq(say('ember_ruby'), '+2 damage', 'ember_ruby'); t.eq(say('vanguard_garnet'), 'Front row: +3 damage', 'vanguard_garnet'); t.eq(say('twinfang_spinel'), '+1 hit', 'twinfang_spinel');
  t.eq(say('kirin_jasper'), 'Front row: +3 damage, +1 hit', 'kirin_jasper'); t.eq(say('tidewatch_sapphire'), '+3 Block, +2 healing', 'tidewatch_sapphire'); t.eq(say('sanctum_iolite'), 'Both heroes gain 6 Block', 'sanctum_iolite'); t.eq(say('ironbark_sapphire'), '+3 Block, gain 4 Thorns', 'ironbark_sapphire');
  t.eq(say('featherlight_emerald'), 'Costs 1 less', 'featherlight_emerald'); t.eq(say('wellspring_tourmaline'), 'Gain 1 Energy', 'wellspring_tourmaline');
  t.eq(say('dusklight_amber'), 'Back row: draw 2 cards, gain 1 Dodge', 'dusklight_amber'); t.eq(say('thornwake_lapis'), 'Gain 2 Thorns', 'thornwake_lapis'); t.eq(say('inkwell_amber'), 'Gain 1 Ink, 2 gold and 3 Regen', 'inkwell_amber'); t.eq(say('solstice_citrine'), 'Gain 1 Ritual, gain 2 Might', 'solstice_citrine'); t.eq(say('sunfall_ruby'), 'Deal 6 damage to all enemies', 'sunfall_ruby');
});

// ================================================================================================ 5 gems on cards
// Probe cards (added after the validator tests above ran): one per card type, a free card, an X card, an Exhaust card.
const PROBE = (hero, over) => Object.assign({ hero, type: 'attack', rarity: 'common', cost: 1, kw: [], slots: ['any'], art: { m: 'slash', c: 'rose' }, fx: [{ op: 'dmg', n: 6, tgt: 'enemy' }], up: { fx: [{ op: 'dmg', n: 9, tgt: 'enemy' }] } }, over);
function addProbes(D, hero) {
  const defs = {};
  defs[`zz_${hero}_attack`] = PROBE(hero, { name: 'Probe Attack', kw: ['innate'] });
  defs[`zz_${hero}_skill`] = PROBE(hero, { name: 'Probe Skill', type: 'skill', fx: [{ op: 'block', n: 5, tgt: 'self' }], up: { fx: [{ op: 'block', n: 7, tgt: 'self' }] }, kw: ['innate'] });
  defs[`zz_${hero}_power`] = PROBE(hero, { name: 'Probe Power', type: 'power', fx: [{ op: 'hook', on: 'turnStart', fx: [{ op: 'block', n: 2, tgt: 'self' }] }], up: { cost: 0 }, kw: ['innate'] });
  defs[`zz_${hero}_zero`] = PROBE(hero, { name: 'Probe Free', cost: 0, fx: [{ op: 'dmg', n: 3, tgt: 'enemy' }], up: { fx: [{ op: 'dmg', n: 4, tgt: 'enemy' }] }, kw: ['innate'] });
  defs[`zz_${hero}_x`] = PROBE(hero, { name: 'Probe X', cost: 'X', fx: [{ op: 'dmg', n: { per: 'X', mul: 4 }, tgt: 'enemy' }], up: { fx: [{ op: 'dmg', n: { per: 'X', mul: 5 }, tgt: 'enemy' }] }, kw: ['innate'] });
  defs[`zz_${hero}_exhaust`] = PROBE(hero, { name: 'Probe Exhaust', kw: ['innate', 'exhaust'], fx: [{ op: 'dmg', n: 6, tgt: 'enemy' }] });
  defs[`zz_${hero}_heal`] = PROBE(hero, { name: 'Probe Heal', type: 'skill', fx: [{ op: 'heal', n: 5, tgt: 'self' }], up: { fx: [{ op: 'heal', n: 7, tgt: 'self' }] }, kw: ['innate'] });
  defs[`zz_${hero}_plain`] = PROBE(hero, { name: 'Probe Plain', fx: [{ op: 'dmg', n: 6, tgt: 'enemy' }] });          // not innate: filler that may or may not be drawn
  defs[`zz_${hero}_area`] = PROBE(hero, { name: 'Probe Area', fx: [{ op: 'dmg', n: 4, tgt: 'all' }], kw: ['innate'] });
  defs[`zz_${hero}_two`] = PROBE(hero, { name: 'Probe Two Gems', slots: ['any', 'any'], fx: [{ op: 'dmg', n: 5, tgt: 'enemy' }] });      // deck instances carry two gems
  defs[`zz_${hero}_heavy`] = PROBE(hero, { name: 'Probe Heavy', type: 'skill', cost: 2, fx: [{ op: 'block', n: 8, tgt: 'self' }], up: { fx: [{ op: 'block', n: 10, tgt: 'self' }] } });
  defs[`zz_${hero}_itwo`] = PROBE(hero, { name: 'Probe Two Gems Innate', slots: ['any', 'any'], kw: ['innate'], fx: [{ op: 'dmg', n: 5, tgt: 'enemy' }] });
  defs[`zz_${hero}_iheavy`] = PROBE(hero, { name: 'Probe Heavy Innate', type: 'skill', cost: 2, kw: ['innate'], fx: [{ op: 'block', n: 8, tgt: 'self' }], up: { fx: [{ op: 'block', n: 10, tgt: 'self' }] } });
  defs[`zz_${hero}_cheap`] = PROBE(hero, { name: 'Probe Cheap Skill', type: 'skill', fx: [{ op: 'block', n: 4, tgt: 'self' }], up: { fx: [{ op: 'block', n: 6, tgt: 'self' }] } });
  D.add('cards', defs);
}
let probesReady = false;
const ensureProbes = () => { if (!probesReady) { addProbes(DATA, 'hanae'); probesReady = true; } };

const resolve = (gemId, probe, row) => { ensureProbes(); return DATA.resolveCard({ id: `zz_hanae_${probe}`, up: 0, gems: [gemId] }, row ? { unit: { row, id: 'hanae' } } : undefined); };
const active = (gemId, probe, row) => resolve(gemId, probe, row).gemActive[0];

t.test('gems on cards: a flat dmg or hits gem does nothing on a skill or a power, a flat Block gem does nothing on an attack', () => {
  if (!HAS_TEXT) { console.log('treasure: resolveCard checks skipped (data_text.js missing)'); return; }
  ['ember_ruby', 'twinfang_spinel'].forEach((g) => {
    t.ok(active(g, 'attack'), `${g} works on an attack`);
    t.ok(!active(g, 'skill') && !active(g, 'power'), `${g} does nothing on a skill or a power`);
  });
  ['vanguard_garnet', 'kirin_jasper'].forEach((g) => {
    t.ok(active(g, 'attack', 'front'), `${g} works on an attack in the front row`);
    t.ok(!active(g, 'attack', 'back'), `${g} is grey in the back row`);
    t.ok(!active(g, 'skill', 'front') && !active(g, 'power', 'front'), `${g} does nothing on a skill or a power even in front`);
    t.ok(resolve(g, 'attack', 'back').gemNotes.length === 1 && resolve(g, 'attack', 'back').gemNotes[0].cond === 'front', `${g}: the back row card lists the gem as a front row note`);
  });
  t.ok(active('tidewatch_sapphire', 'skill') && active('tidewatch_sapphire', 'heal') && !active('tidewatch_sapphire', 'attack') && !active('tidewatch_sapphire', 'power'), 'flat Block and heal work on a Block skill and a healing skill only (hook bodies do not count)');
  t.ok(active('twinfang_spinel', 'zero') && active('ember_ruby', 'x'), 'flat gems work on free and X attacks');
});

t.test('gems on cards: the numbers land on the ops (dmg plus, hits plus, Block plus, appended ops)', () => {
  if (!HAS_TEXT) return;
  t.eq(resolve('ember_ruby', 'attack').fx[0].plus, 2, 'ember_ruby adds 2 to the hit');
  t.eq(resolve('twinfang_spinel', 'attack').fx[0].hitsPlus, 1, 'twinfang_spinel adds a hit');
  t.eq(resolve('vanguard_garnet', 'attack', 'front').fx[0].plus, 3, 'vanguard_garnet adds 3 in front');
  const k = resolve('kirin_jasper', 'attack', 'front').fx[0]; t.ok(k.plus === 3 && k.hitsPlus === 1, 'kirin_jasper adds 3 damage and a hit in front');
  t.eq(resolve('tidewatch_sapphire', 'skill').fx[0].plus, 3, 'tidewatch_sapphire adds 3 Block'); t.eq(resolve('tidewatch_sapphire', 'heal').fx[0].plus, 2, 'tidewatch_sapphire adds 2 healing');
  const mir = resolve('mirrorlake_aquamarine', 'skill'); t.ok(mir.fx[0].plus === 2 && mir.fx.some((o) => o.op === 'status' && o.s === 'dodge' && o.n === 1), 'mirrorlake_aquamarine: +2 Block and a Dodge');
  const iron = resolve('ironbark_sapphire', 'skill'); t.ok(iron.fx[0].plus === 3 && iron.fx.some((o) => o.op === 'status' && o.s === 'thorns' && o.n === 4), 'ironbark_sapphire: +3 Block and 4 Thorns');
  t.ok(resolve('sanctum_iolite', 'skill').fx.some((o) => o.op === 'block' && o.tgt === 'both' && o.n === 6), 'sanctum_iolite shields both heroes for 6');
  t.ok(resolve('sunfall_ruby', 'attack').fx.some((o) => o.op === 'dmg' && o.tgt === 'all' && o.n === 6), 'sunfall_ruby splashes 6 to all');
  t.ok(resolve('bloodmoon_carnelian', 'attack').fx.some((o) => o.op === 'dmg' && o.lifesteal), 'bloodmoon_carnelian appends a life stealing bite');
  DATA.add('cards', { zz_hanae_triple: Object.assign({}, DATA.cards.zz_hanae_skill, { id: undefined, name: 'Probe Triple', slots: ['any', 'any', 'any'] }) });
  const stack = DATA.resolveCard({ id: 'zz_hanae_triple', up: 0, gems: ['tidewatch_sapphire', 'sanctum_iolite', 'mirrorlake_aquamarine'] });
  t.eq(stack.fx[0].plus, 5, 'three gems on a three slot card stack: +3 and +2 Block on the card');
  t.ok(stack.fx.some((o) => o.op === 'block' && o.tgt === 'both' && o.plus === 5) && stack.fx.some((o) => o.op === 'status' && o.s === 'dodge'), 'and the flat Block also lifts the party Block another gem appended');
});

t.test('gems on cards: green and gold gems work on an attack, a skill and a power alike', () => {
  if (!HAS_TEXT) return;
  gems.filter((g) => (g.color === 'green' || g.color === 'gold') && !g.mod.cond && !g.mod.cost && !g.mod.kw).forEach((g) => ['attack', 'skill', 'power', 'zero', 'x', 'area'].forEach((p) => t.ok(active(g.id, p), `${g.id} works on the ${p} probe`)));
  ['attack', 'skill', 'power'].forEach((p) => t.ok(active('dusklight_amber', p, 'back') && !active('dusklight_amber', p, 'front'), `dusklight_amber works only in the back row (${p})`));
  ['attack', 'skill', 'power'].forEach((p) => t.ok(active('keepsake_peridot', p), `keepsake_peridot gives Retain to a ${p}`));
  t.ok(!active('keepsake_peridot', 'attack') || resolve('keepsake_peridot', 'attack').kw.indexOf('retain') >= 0, 'and the keyword really lands');
  t.deep(resolve('keepsake_peridot', 'attack').kw.slice().sort(), ['innate', 'retain'], 'keepsake_peridot adds Retain to the keyword list');
  const ev = resolve('evergreen_jade', 'exhaust'); t.ok(ev.kw.indexOf('exhaust') < 0 && ev.kw.indexOf('innate') >= 0 && ev.fx.some((o) => o.op === 'draw'), 'evergreen_jade removes Exhaust and draws');
  t.ok(!active('evergreen_jade', 'attack') || resolve('evergreen_jade', 'attack').kw.length === 1, 'evergreen_jade on a card without Exhaust still draws and keeps its keywords');
  t.eq(resolve('featherlight_emerald', 'attack').cost, 0, 'featherlight_emerald cuts a 1 cost card to 0');
  t.eq(resolve('featherlight_emerald', 'skill').cost, 0, 'featherlight_emerald cuts a 1 cost skill to 0');
  t.ok(!active('featherlight_emerald', 'zero') && resolve('featherlight_emerald', 'zero').cost === 0, 'featherlight_emerald is grey on a 0 cost card');
  t.ok(!active('featherlight_emerald', 'x') && resolve('featherlight_emerald', 'x').cost === 'X', 'featherlight_emerald is grey on an X card and leaves X alone');
  t.ok(resolve('heartflame_topaz', 'attack').fx.filter((o) => o.op === 'cond').length === 4, 'heartflame_topaz carries one condition per resource');
});

t.test('gems on cards: a poison or status rider follows the card, and wrong colours are refused', () => {
  if (!HAS_TEXT) return;
  ensureProbes();
  const wrong = DATA.resolveCard({ id: 'zz_hanae_attack', up: 0, gems: ['tidewatch_sapphire'] });
  t.ok(!wrong.gemActive[0] || wrong.slots[0] === 'any', 'a probe with a prism slot takes any colour');
  const cardDef = DATA.cards.zz_hanae_attack;
  DATA.add('cards', { zz_red_only: Object.assign({}, cardDef, { id: undefined, name: 'Red Only', slots: ['red'] }) });
  const refuse = DATA.resolveCard({ id: 'zz_red_only', up: 0, gems: ['quickthought_emerald'] });
  t.ok(!refuse.gemActive[0] && refuse.fx.length === 1, 'a green gem in a red slot does nothing');
  const accept = DATA.resolveCard({ id: 'zz_red_only', up: 0, gems: ['ember_ruby'] });
  t.ok(accept.gemActive[0], 'a red gem in a red slot works');
});

// ================================================================================================ 6 junk cards
t.test('junk cards: the six curses exactly as CONTENT_SPEC section 2 words them', () => {
  const c = DATA.cards;
  t.deep(DATA.FIXED.curses.slice().sort(), Object.keys(c).filter((id) => c[id].hero === 'curse').sort(), 'the six fixed curse ids, exactly');
  DATA.FIXED.curses.forEach((id) => {
    const d = c[id];
    t.ok(d.hero === 'curse' && d.type === 'curse' && d.rarity === 'token', `${id}: hero curse, type curse, rarity token`);
    t.ok(d.kw.indexOf('unplayable') >= 0 && d.cost === undefined && !d.up && !(d.slots && d.slots.length), `${id}: unplayable, no cost, no up, no slots`);
    t.ok(typeof d.flavor === 'string' && d.flavor.length > 10, `${id}: a flavor line`);
    t.ok(d.art && L.motifs.indexOf(d.art.m) >= 0, `${id}: art motif`);
  });
  t.deep(c.curse_regret.hand, { turnEnd: [{ op: 'hurt', n: 2, tgt: 'front' }] }, 'curse_regret: in hand at end of turn, hurt 2 to the front hero');
  t.ok(!c.curse_smudge.hand && !c.curse_smudge.fx.length && c.curse_smudge.kw.join() === 'unplayable', 'curse_smudge: pure clutter');
  t.deep(c.curse_doubt.hand, { drawn: [{ op: 'status', s: 'weak', n: 1, tgt: 'front' }] }, 'curse_doubt: when drawn, Weak 1 on the front hero');
  t.deep(c.curse_burden.kw.slice().sort(), ['innate', 'unplayable'], 'curse_burden: unplayable and innate'); t.ok(!c.curse_burden.hand, 'curse_burden has no trigger');
  t.deep(c.curse_hex.hand, { turnEnd: [{ op: 'status', s: 'vulnerable', n: 1, tgt: 'both' }] }, 'curse_hex: in hand at end of turn, Vulnerable 1 on both heroes');
  t.deep(c.curse_decay.hand, { turnEnd: [{ op: 'hurt', n: 1, tgt: 'both' }] }, 'curse_decay: in hand at end of turn, hurt 1 to both');
  t.eq(new Set(DATA.FIXED.curses.map((id) => c[id].name)).size, 6, 'six different names');
});

t.test('junk cards: the six status cards exactly as CONTENT_SPEC section 2 words them', () => {
  const c = DATA.cards;
  t.deep(DATA.FIXED.statusCards.slice().sort(), Object.keys(c).filter((id) => c[id].hero === 'status').sort(), 'the six fixed status ids, exactly');
  DATA.FIXED.statusCards.forEach((id) => {
    const d = c[id];
    t.ok(d.hero === 'status' && d.type === 'status' && d.rarity === 'token' && !d.up && !(d.slots && d.slots.length), `${id}: hero status, type status, rarity token, no up, no slots`);
    t.ok(typeof d.flavor === 'string' && d.flavor.length > 10 && d.art && L.motifs.indexOf(d.art.m) >= 0, `${id}: flavor and art`);
  });
  t.deep(c.status_blot.kw.slice().sort(), ['ethereal', 'unplayable'], 'status_blot: unplayable and ethereal');
  t.ok(c.status_tangle.cost === 1 && c.status_tangle.kw.join() === 'exhaust' && JSON.stringify(c.status_tangle.fx) === JSON.stringify([{ op: 'removeStatus', s: 'bind', tgt: 'both' }]), 'status_tangle: cost 1, exhaust, remove Bind from both heroes');
  t.deep(c.status_scorch.kw.slice().sort(), ['ethereal', 'unplayable'], 'status_scorch: unplayable and ethereal');
  t.deep(c.status_scorch.hand, { turnEnd: [{ op: 'hurt', n: 2, tgt: 'front' }] }, 'status_scorch: in hand at end of turn, hurt 2 to the front hero');
  t.deep(c.status_redacted.kw, ['unplayable'], 'status_redacted: unplayable'); t.ok(!c.status_redacted.hand, 'status_redacted has no trigger');
  t.ok(c.status_static.cost === 0 && c.status_static.kw.join() === 'exhaust' && JSON.stringify(c.status_static.fx) === JSON.stringify([{ op: 'hurt', n: 2, tgt: 'self' }, { op: 'draw', n: 1 }]), 'status_static: cost 0, exhaust, hurt 2 self, draw 1');
  t.deep(c.status_wilt.hand, { drawn: [{ op: 'energy', n: -1 }] }, 'status_wilt: when drawn, lose 1 Energy'); t.deep(c.status_wilt.kw, ['unplayable'], 'status_wilt: unplayable');
  if (HAS_TEXT) {
    junk.forEach((d) => { const s = DATA.cardPlain(d.id); t.ok(s.length > 0 && s.length <= 110 && !/undefined|NaN/.test(s), `${d.id}: rules text "${s}"`); });
    t.eq(DATA.cardPlain('curse_regret'), 'Unplayable. If this is in your hand at the end of your turn, the front hero loses 2 HP.', 'regret text');
    t.eq(DATA.cardPlain('status_tangle'), 'Remove Bind from both heroes. Exhaust.', 'tangle text');
    t.eq(DATA.cardPlain('status_wilt'), 'Unplayable. When drawn, lose 1 Energy.', 'wilt text');
  }
});

// ================================================================================================ 7 engine
let E = null, skipWhy = null;
if (!exists('combat.js')) skipWhy = 'js/combat.js is missing';
else if (!exists('data_text.js')) skipWhy = 'js/data_text.js is missing';
else {
  try { E = boot({ only: ['combat'] }); } catch (e) { skipWhy = 'combat.js did not load: ' + String(e && e.message).split('\n')[0]; }
}
const contentReady = (D) => !!(D.relics.brass_lantern && D.gems.ember_ruby && D.cards.curse_regret && D.cards.hanae_slash && D.cards.kuro_ink_bolt && D.cards.suzu_ofuda && D.cards.raiga_jab && D.enemies.kappa && D.enemies.oni_brute && D.enemies.boss_kuzunoha && D.enemies.bamboo_sprite && D.enemies.leaf_imp && D.enemies.paper_kodama && D.enemies.moss_guardian && D.enemies.oni_cub && D.enemies.karakasa);   // the peers' cards and enemies the scenarios lean on
if (E && (E._errors.length || !E.COMBAT || !contentReady(E.DATA))) { skipWhy = 'the engine boot is incomplete: ' + JSON.stringify(E._errors.map((x) => x.file + ' ' + x.message)); E = null; }
if (!E) console.log('treasure: engine tests skipped (' + skipWhy + ')');

if (E) {
  const { COMBAT, DATA: ED, U: EU } = E;
  const HEROES = ED.LISTS.heroIds;
  HEROES.forEach((h) => addProbes(ED, h));
  const startersOf = (h) => ED.heroes[h].starter.slice();
  const evTypes = (evs) => evs.map((e) => e.type);
  const of = (evs, type, f) => evs.filter((e) => e.type === type && (!f || f(e)));

  // hp: [a, b] absolute or undefined (full). deck: card ids or {id, gems, up}. Returns a started combat, C.
  function mk(o) {
    const party = o.heroes || ['hanae', 'kuro'];
    const heroes = party.map((id, i) => ({ id, maxHp: ED.heroes[id].maxHp, hp: o.hp ? o.hp[i] : ED.heroes[id].maxHp }));
    const deck = (o.deck || party.flatMap(startersOf)).map((d, i) => ({ uid: i + 1, id: typeof d === 'string' ? d : d.id, up: d.up ? 1 : 0, gems: (typeof d === 'string' ? [] : d.gems || []).slice() }));
    const relicIds = o.relics || [];
    const C = COMBAT.create({ heroes, frontIdx: o.front || 0, deck, enemies: o.enemies || ['kappa'], tier: o.tier || 'normal', chapter: o.chapter || 1, seed: o.seed || 1, mods: ED.modsFor(relicIds, o.trial || 0), relics: relicIds, gold: 100 });
    C.start();
    return C;
  }
  const cardOf = (C, id) => C.hand.find((c) => c.id === id);
  const playAll = (C, id) => { const c = cardOf(C, id); const tg = C.needsTarget(c.uid) ? C.legalTargets(c.uid)[0] : undefined; return C.play(c.uid, tg); };

  t.test('gems on the real cards: every gem works on nearly every real card whose slot takes it (the slot colour rules and the gems agree)', () => {
    const cards = Object.values(ED.cards).filter((c) => c.rarity !== 'token' && !/^zz_/.test(c.id) && (c.slots || []).length);
    if (cards.length < 100) { console.log('treasure: real card coverage skipped (only ' + cards.length + ' real cards with slots are loaded)'); return; }
    const MIN = { ember_ruby: 0.8, vanguard_garnet: 0.8, kirin_jasper: 0.8, twinfang_spinel: 0.75, tidewatch_sapphire: 0.75, keepsake_peridot: 0.8, featherlight_emerald: 0.7 };
    Object.values(ED.gems).forEach((g) => {
      let n = 0, act = 0;
      cards.forEach((c) => c.slots.forEach((slot, si) => {
        if (slot !== g.color) return;                                                                 // prism slots are the player's free choice, so only count the dedicated colour slots
        [0, 1].forEach((up) => { const r = ED.resolveCard({ id: c.id, up, gems: c.slots.map((_, i) => (i === si ? g.id : null)) }, { unit: { id: c.hero, row: g.mod.cond || 'front' } }); n++; if (r.gemActive[si]) act++; });
      }));
      t.ok(n >= 20, `${g.id}: at least 20 real card slots take it (${n})`);
      t.ok(act / n >= (MIN[g.id] || 0.95), `${g.id}: works on ${act} of ${n} real card slots (${Math.round(100 * act / n)}%), needs ${Math.round(100 * (MIN[g.id] || 0.95))}%`);
    });
    // every power has a gold slot, and every gold gem does something on a power
    Object.values(ED.cards).filter((c) => c.type === 'power' && !/^zz_/.test(c.id) && c.rarity !== 'token').forEach((c) => {
      const si = c.slots.indexOf('gold');
      Object.values(ED.gems).filter((g) => g.color === 'gold').forEach((g) => t.ok(ED.resolveCard({ id: c.id, up: 0, gems: c.slots.map((_, i) => (i === si ? g.id : null)) }, { unit: { id: c.hero, row: g.mod.cond || 'front' } }).gemActive[si], `${g.id} works on the power ${c.id}`));
    });
  });

  t.test('engine: every gem, played in a real combat, does what its text says', () => {
    const base = (probe, gem, o) => { const C = mk(Object.assign({ deck: [{ id: `zz_hanae_${probe}`, gems: gem ? [gem] : [] }, ...Array.from({ length: 8 }, () => 'zz_hanae_plain')], enemies: ['kappa'], hp: [50, 40] }, o)); return { C, ev: playAll(C, `zz_hanae_${probe}`) }; };
    const hits = (ev) => of(ev, 'hit', (e) => e.dst.kind === 'enemy');
    const total = (ev) => hits(ev).reduce((s, e) => s + e.raw, 0);

    // red
    t.eq(total(base('attack', 'ember_ruby').ev) - total(base('attack', null).ev), 2, 'ember_ruby: +2 to the hit');
    t.eq(total(base('attack', 'vanguard_garnet').ev) - total(base('attack', null).ev), 3, 'vanguard_garnet: +3 in the front row');
    t.eq(total(base('attack', 'vanguard_garnet', { front: 1 }).ev) - total(base('attack', null, { front: 1 }).ev), 0, 'vanguard_garnet: nothing when Hanae stands in the back row');
    t.eq(hits(base('attack', 'twinfang_spinel').ev).length, hits(base('attack', null).ev).length + 1, 'twinfang_spinel: one more hit');
    { const r = base('attack', 'bloodmoon_carnelian'); t.eq(hits(r.ev).length, 2, 'bloodmoon_carnelian: an extra bite'); t.ok(of(r.ev, 'heal').length >= 1 && of(r.ev, 'heal')[0].amount > 0, 'bloodmoon_carnelian: and it heals the wounded attacker'); }
    { const r = base('attack', 'sunfall_ruby', { enemies: ['kappa', 'kappa', 'kappa'] }); t.eq(hits(r.ev).length, 4, 'sunfall_ruby: the strike plus 6 to each of the three enemies'); }
    { const w = base('attack', 'kirin_jasper'); const n = base('attack', null); t.eq(hits(w.ev).length, hits(n.ev).length + 1, 'kirin_jasper: an extra hit in front'); t.eq(total(w.ev) - total(n.ev), 2 * (8 + 3) - 8, 'kirin_jasper: two hits of 6 + 2 row + 3 gem each, against one plain hit of 8'); }
    // blue
    const blockOf = (ev) => of(ev, 'block', (e) => e.dst.id === 'hanae').reduce((s, e) => s + e.amount, 0);
    t.eq(blockOf(base('skill', 'tidewatch_sapphire').ev) - blockOf(base('skill', null).ev), 3, 'tidewatch_sapphire: +3 Block');
    { const wounded = { hp: [40, 40] }; const a = base('heal', 'tidewatch_sapphire', wounded), b = base('heal', null, wounded); const amt = (r) => of(r.ev, 'heal').reduce((x, e) => x + e.amount, 0); t.eq(amt(a) - amt(b), 2, 'tidewatch_sapphire: +2 healing on a healing card'); }
    { const r = base('skill', 'thornwake_lapis'); t.ok(of(r.ev, 'status', (e) => e.s === 'thorns' && e.dst.id === 'hanae' && e.delta === 2).length === 1, 'thornwake_lapis: +2 Thorns'); }
    { const r = base('skill', 'mirrorlake_aquamarine'); t.eq(blockOf(r.ev), 7, 'mirrorlake_aquamarine: 5 + 2 Block'); t.ok(r.C.unit('hanae').st.dodge === 1, 'and a Dodge'); }
    { const r = base('skill', 'springwell_tanzanite'); t.eq(of(r.ev, 'heal').map((e) => e.dst.id).sort().join(), 'hanae,kuro', 'springwell_tanzanite: heals both heroes'); t.ok(of(r.ev, 'heal').every((e) => e.amount === 2), 'for 2 each'); }
    { const r = base('skill', 'ironbark_sapphire'); t.eq(blockOf(r.ev), 8, 'ironbark_sapphire: +3 Block'); t.eq(r.C.unit('hanae').st.thorns >= 4, true, 'and 4 Thorns'); }
    { const r = base('skill', 'sanctum_iolite'); t.eq(of(r.ev, 'block', (e) => e.dst.id === 'kuro').reduce((s, e) => s + e.amount, 0), 6, 'sanctum_iolite: 6 Block for the ally'); t.eq(blockOf(r.ev), 5 + 6, 'sanctum_iolite: and 6 more for the hero who played it'); }
    // green
    { const r = base('attack', 'quickthought_emerald'); t.eq(of(r.ev, 'draw').reduce((s, e) => s + e.cards.length, 0), 1, 'quickthought_emerald: draws 1'); }
    { const C = mk({ deck: [{ id: 'zz_hanae_attack', gems: ['keepsake_peridot'] }, 'zz_hanae_skill', ...Array.from({ length: 8 }, () => 'zz_hanae_plain')], seed: 3 }); const gemmed = C.hand.find((c) => c.gems[0] === 'keepsake_peridot'); const other = C.hand.find((c) => c.id === 'zz_hanae_skill');
      t.ok(!!gemmed && !!other, '(sanity) both innate probes are in the opening hand'); C.endTurn();
      t.ok(C.events.some((e) => e.type === 'retain' && e.cards.some((c) => c.uid === gemmed.uid)), 'keepsake_peridot: the gemmed card is retained at turn end');
      t.ok(!C.events.some((e) => e.type === 'retain' && e.cards.some((c) => c.uid === other.uid)), 'keepsake_peridot: and the ungemmed one is not');
      t.ok(C.hand.some((c) => c.uid === gemmed.uid), 'keepsake_peridot: it is still in the hand on the next turn'); }
    { const r = base('exhaust', 'evergreen_jade'); t.eq(of(r.ev, 'exhaust').length, 0, 'evergreen_jade: the Exhaust card no longer exhausts'); t.eq(of(r.ev, 'draw').reduce((s, e) => s + e.cards.length, 0), 1, 'evergreen_jade: and draws 1'); t.ok(r.C.discard.some((c) => c.id === 'zz_hanae_exhaust'), 'evergreen_jade: it lands in the discard pile'); const n = base('exhaust', null); t.eq(of(n.ev, 'exhaust').length, 1, '(control) without the gem it exhausts'); }
    { const C = mk({ deck: [{ id: 'zz_hanae_attack', gems: ['scholars_malachite'] }, ...Array.from({ length: 9 }, () => 'zz_hanae_plain')], seed: 5 });
      const filler = C.hand.filter((c) => c.id === 'zz_hanae_plain'); filler.slice(0, 2).forEach((c) => C.play(c.uid, C.legalTargets(c.uid)[0]));
      const before = C.hand.length; C.play(cardOf(C, 'zz_hanae_attack').uid, C.legalTargets(cardOf(C, 'zz_hanae_attack').uid)[0]);
      t.ok(C.pending && C.pending.from === 'discard' && C.pending.then === 'toHand', 'scholars_malachite: asks for a card from the discard pile');
      if (C.pending) { const pick = C.pending.uids[0]; C.resolvePick([pick]); t.ok(C.hand.some((c) => c.uid === pick), 'scholars_malachite: the chosen card returns to the hand'); } }
    { const a = base('attack', 'featherlight_emerald'); const b = base('attack', null); t.eq(a.C.energy - b.C.energy, 1, 'featherlight_emerald: the card costs 1 less'); t.eq(a.C.energy, 3, 'featherlight_emerald: a 1 cost card is free'); }
    { const r = base('attack', 'wellspring_tourmaline'); t.eq(r.C.energy, 3, 'wellspring_tourmaline: pays the Energy back (3 - 1 + 1)'); t.ok(of(r.ev, 'energy').some((e) => e.delta === 1), 'wellspring_tourmaline: an energy +1 event'); }
    // gold
    { const r = base('attack', 'sunwake_topaz'); t.eq(r.C.unit('hanae').st.might, 1, 'sunwake_topaz: 1 Might'); }
    { const r = base('attack', 'coinluck_citrine'); t.eq(of(r.ev, 'gold').reduce((s, e) => s + e.n, 0), 4, 'coinluck_citrine: 4 gold'); }
    { const r = base('attack', 'inkwell_amber'); t.eq(of(r.ev, 'ink').reduce((s, e) => s + e.n, 0), 1, 'inkwell_amber: 1 Ink'); t.eq(of(r.ev, 'gold').reduce((s, e) => s + e.n, 0), 2, 'inkwell_amber: 2 gold'); t.eq(r.C.unit('hanae').st.regen, 3, 'inkwell_amber: and 3 Regen for the hero who played the card'); }
    { const has = (h, res) => { const C = mk({ heroes: [h, h === 'hanae' ? 'kuro' : 'hanae'], deck: [{ id: `zz_${h}_attack`, gems: ['heartflame_topaz'] }, ...Array.from({ length: 8 }, () => `zz_${h}_plain`)], seed: 2 }); C.unit(h).st[res] = 1; playAll(C, `zz_${h}_attack`); return C.unit(h).st[res] || 0; };
      t.eq(has('hanae', 'bloom'), 3 + 1, 'heartflame_topaz: Bloom 1 becomes 3 (plus 1 from her own passive after the play)'); t.eq(has('kuro', 'sumi'), 3, 'heartflame_topaz: Sumi 1 becomes 3');
      t.eq(has('suzu', 'ward'), 3, 'heartflame_topaz: Ward 1 becomes 3'); t.eq(has('raiga', 'charge'), 3, 'heartflame_topaz: Charge 1 becomes 3');
      const C = mk({ deck: [{ id: 'zz_hanae_attack', gems: ['heartflame_topaz'] }, ...Array.from({ length: 8 }, () => 'zz_hanae_plain')], seed: 2 }); playAll(C, 'zz_hanae_attack'); t.ok(!C.unit('hanae').st.sumi && !C.unit('hanae').st.ward && !C.unit('hanae').st.charge, 'heartflame_topaz: never adds a resource the hero does not use'); t.ok(!C.unit('hanae').st.bloom || C.unit('hanae').st.bloom === 1, 'heartflame_topaz: does nothing without a Bloom to build on (only the passive gives 1)'); }
    { const r = base('attack', 'solstice_citrine'); t.eq(r.C.unit('hanae').st.ritual, 1, 'solstice_citrine: Ritual 1'); t.eq(r.C.unit('hanae').st.might, 2, 'solstice_citrine: and 2 Might at once'); const mightBefore = r.C.unit('hanae').st.might || 0; r.C.endTurn(); t.eq(r.C.unit('hanae').st.might - mightBefore, 1, 'solstice_citrine: the Ritual pays 1 Might at the next turn start'); }
    { const back = base('attack', 'dusklight_amber', { front: 1 }); t.eq(of(back.ev, 'draw').reduce((s, e) => s + e.cards.length, 0), 2, 'dusklight_amber: draws 2 in the back row'); t.eq(back.C.unit('hanae').st.dodge, 1, 'dusklight_amber: and a Dodge in the back row');
      const front = base('attack', 'dusklight_amber'); t.eq(of(front.ev, 'draw').length, 0, 'dusklight_amber: nothing in the front row'); }
  });

  t.test('engine: every gem in every slot of every probe card plays through a whole combat without throwing, and piles stay honest', () => {
    const probes = ['attack', 'skill', 'power', 'zero', 'x', 'exhaust', 'area'];
    let n = 0;
    Object.values(ED.gems).forEach((g) => probes.forEach((p, pi) => {
      const deck = [{ id: `zz_hanae_${p}`, gems: [g.id] }, { id: `zz_hanae_${p}`, gems: [g.id] }, ...startersOf('hanae'), ...startersOf('kuro')];
      [0, 1].forEach((front) => {
        const s = COMBAT.simulate({ heroes: [{ id: 'hanae', hp: 76, maxHp: 76 }, { id: 'kuro', hp: 60, maxHp: 60 }], frontIdx: front, deck: deck.map((d, i) => ({ uid: i + 1, id: typeof d === 'string' ? d : d.id, up: 0, gems: typeof d === 'string' ? [] : d.gems })), enemies: ['kappa', 'oni_cub'], tier: 'normal', chapter: 1, seed: 11 + pi + front, mods: ED.foldMods([]), relics: [], gold: 0, maxTurns: 25 });
        const C = s.C;
        t.ok(!s.capped, `${g.id} on ${p} (front ${front}): the combat ends`);
        const total = C.hand.length + C.draw.length + C.discard.length + C.exhaust.length + C.powers.length + (C.inPlay ? 1 : 0);
        t.eq(total, deck.length + C.added, `${g.id} on ${p}: conservation`);
        n++;
      });
    }));
    t.eq(n, 24 * 7 * 2, 'every gem on every probe in both rows was played');
  });

  t.test('engine: the junk cards in real combats', () => {
    const one = (id, extra, o) => mk(Object.assign({ deck: [id].concat(extra || []), enemies: ['paper_kodama'], seed: 4 }, o || {}));
    const hurts = (C) => of(C.events, 'hurt', (e) => e.cause === 'curse');
    { const C = one('curse_regret'); const hp0 = C.front().hp; C.endTurn(); const h = hurts(C); t.eq(h.length, 1, 'curse_regret: one curse hurt event'); t.ok(h[0].amount === 2 && h[0].dst.id === 'hanae', 'curse_regret: 2 HP from the front hero'); t.ok(C.canPlay(C.hand[0] ? C.hand[0].uid : 0).ok === false, '(sanity) unplayable'); }
    { const C = one('curse_regret', [], { front: 1 }); C.endTurn(); t.eq(hurts(C)[0].dst.id, 'kuro', 'curse_regret hurts whoever is in front (Kuro when he leads)'); }
    { const C = one('curse_smudge'); const uid = C.hand[0].uid; t.eq(C.canPlay(uid).reason, 'unplayable', 'curse_smudge: unplayable'); C.endTurn(); t.eq(hurts(C).length, 0, 'curse_smudge: never hurts'); t.ok(C.discard.some((c) => c.id === 'curse_smudge') || C.hand.some((c) => c.id === 'curse_smudge'), 'curse_smudge: simply cycles through the deck'); }
    { const C = one('curse_doubt'); const w = of(C.events, 'status', (e) => e.s === 'weak'); t.eq(w.length, 1, 'curse_doubt: Weak on draw'); t.ok(w[0].dst.id === 'hanae' && w[0].delta === 1, 'curse_doubt: Weak 1 on the front hero'); }
    { const C = one('curse_burden'); const filler = Array.from({ length: 14 }, () => 'hanae_slash'); const D2 = mk({ deck: filler.concat(['curse_burden']), enemies: ['paper_kodama'], seed: 6 }); t.ok(D2.hand.some((c) => c.id === 'curse_burden'), 'curse_burden: innate, in the opening hand of a 15 card deck'); t.ok(C.hand.length === 1, '(sanity)'); }
    { const C = one('curse_hex'); C.endTurn(); const v = of(C.events, 'status', (e) => e.s === 'vulnerable' && e.delta === 1); t.eq(v.map((e) => e.dst.id).sort().join(), 'hanae,kuro', 'curse_hex: Vulnerable 1 on both heroes'); }
    { const C = one('curse_decay'); C.endTurn(); const h = hurts(C); t.eq(h.map((e) => e.dst.id).sort().join(), 'hanae,kuro', 'curse_decay: both heroes'); t.ok(h.every((e) => e.amount === 1), 'curse_decay: 1 HP each'); }
    { const C = one('status_blot'); C.endTurn(); t.ok(of(C.events, 'exhaust', (e) => e.card.id === 'status_blot' && e.reason === 'ethereal').length === 1, 'status_blot: exhausted at end of turn (Ethereal)'); t.eq(C.canPlay(C.exhaust[0] ? C.exhaust[0].uid : 0).ok, false, '(sanity) not playable'); }
    { const C = one('status_scorch'); C.endTurn(); t.eq(hurts(C).length, 1, 'status_scorch: hurts once'); t.ok(hurts(C)[0].amount === 2 && hurts(C)[0].dst.id === 'hanae', 'status_scorch: 2 HP from the front hero'); t.ok(of(C.events, 'exhaust', (e) => e.card.id === 'status_scorch').length === 1, 'status_scorch: and burns away (Ethereal)'); }
    { const C = one('status_redacted'); t.eq(C.canPlay(C.hand[0].uid).reason, 'unplayable', 'status_redacted: unplayable'); C.endTurn(); t.eq(hurts(C).length, 0, 'status_redacted: harmless but sticky'); }
    { const C = one('status_wilt', ['hanae_slash']); const e = of(C.events, 'energy', (x) => x.delta === -1); t.ok(e.length === 1 || C.energy === 2, 'status_wilt: costs 1 Energy when drawn'); t.eq(C.energy, 2, 'status_wilt: 2 Energy left on the first turn'); }
    { const C = one('status_tangle'); C.front().st.bind = 2; C.back().st.bind = 1; t.eq(C.canSwap().reason, 'bind', '(sanity) Bind stops the swap'); const uid = C.hand[0].uid; t.eq(C.canPlay(uid).ok, true, 'status_tangle: playable for 1 Energy'); C.play(uid); t.ok(!C.front().st.bind && !C.back().st.bind, 'status_tangle: removes Bind from both heroes'); t.eq(C.energy, 2, 'status_tangle: cost 1'); t.eq(C.exhaust.length, 1, 'status_tangle: exhausts'); t.eq(C.canSwap().ok, true, 'and the swap works again'); }
    { const fill = ['hanae_slash', 'hanae_slash', 'hanae_slash', 'hanae_slash', 'hanae_slash', 'hanae_slash', 'hanae_slash'];
      let C = null; for (let sd = 1; sd < 60 && !C; sd++) { const x = one('status_static', fill, { seed: sd }); if (x.hand.some((c) => c.id === 'status_static')) C = x; }
      t.ok(!!C, '(sanity) a seed puts Static in the opening hand');
      const hp0 = C.front().hp; const h0 = C.hand.length; const c = C.hand.find((x) => x.id === 'status_static');
      C.play(c.uid); t.eq(C.front().hp, hp0 - 2, 'status_static: costs the front hero 2 HP'); t.eq(C.energy, 3, 'status_static: costs no Energy'); t.eq(C.hand.length, h0, 'status_static: draws 1 (hand size is the same after playing itself)'); t.eq(C.exhaust.length, 1, 'status_static: exhausts'); }
    { const fill = ['hanae_slash', 'hanae_slash', 'hanae_slash', 'hanae_slash', 'hanae_slash', 'hanae_slash'];
      let C = null; for (let sd = 1; sd < 60 && !C; sd++) { const x = one('status_static', fill, { front: 1, seed: sd }); if (x.hand.some((c) => c.id === 'status_static')) C = x; }
      t.ok(!!C, '(sanity) a seed puts Static in the opening hand (Kuro leads)');
      const hp0 = C.front().hp; C.play(C.hand.find((x) => x.id === 'status_static').uid); t.eq(C.front().id, 'kuro', '(sanity) Kuro is in front'); t.eq(C.front().hp, hp0 - 2, 'status_static: self is the FRONT hero'); }
    { const C = one('curse_regret', [], { hp: [1, 30] }); C.endTurn(); t.ok(C.front().hp >= 1 || C.result === 'lose', 'a hurt from a curse never takes a hero below 1 HP by itself'); }
  });

  // ------------------------------------------------------------------------------------------------ relics in combat
  const partnerOf = { hanae: 'kuro', kuro: 'hanae', suzu: 'raiga', raiga: 'suzu' };
  const isCombatHook = (h) => ED.LISTS.combatHooks.indexOf(h.on) >= 0;
  const combatRelics = Object.values(ED.relics).filter((r) => (r.hooks || []).some(isCombatHook));
  const richDeck = (a, b) => {
    const d = [];
    [a, b].forEach((h) => startersOf(h).forEach((id) => d.push(id)));
    [a, b].forEach((h) => {
      d.push(`zz_${h}_exhaust`, `zz_${h}_zero`, `zz_${h}_heavy`, `zz_${h}_cheap`);
      d.push({ id: `zz_${h}_two`, gems: ['ember_ruby', 'quickthought_emerald'] });
      d.push({ id: `zz_${h}_plain`, gems: ['ember_ruby'] });
    });
    return d;
  };
  const SCEN = [
    { name: 'brawl', enemies: ['kappa', 'oni_cub', 'karakasa'], tier: 'normal', frac: 0.7 },
    { name: 'marathon', enemies: ['moss_guardian'], tier: 'elite', frac: 0.8 },
    { name: 'lowhp', enemies: ['oni_brute'], tier: 'elite', hp: [6, 9] },
    { name: 'boss', enemies: ['boss_kuzunoha'], tier: 'boss', frac: 0.9 },
  ];
  function swapBot() {
    let last = -1;
    return (C) => {
      if (!C.pending && C.phase === 'player' && last !== C.turn) { last = C.turn; const cs = C.canSwap(); if (cs.ok && cs.cost === 0) return { type: 'swap' }; }
      return COMBAT.greedyPolicy(C);
    };
  }
  function scenario(relicIds, cfg, party, seed, front) {
    const heroes = party.map((id, i) => ({ id, maxHp: ED.heroes[id].maxHp, hp: cfg.hp ? cfg.hp[i] : Math.round(ED.heroes[id].maxHp * (cfg.frac || 1)) }));
    const deck = richDeck(party[0], party[1]).map((d, i) => ({ uid: i + 1, id: typeof d === 'string' ? d : d.id, up: 0, gems: typeof d === 'string' ? [] : d.gems.slice() }));
    return COMBAT.simulate({ heroes, frontIdx: front, deck, enemies: cfg.enemies, tier: cfg.tier, chapter: 1, seed, mods: ED.modsFor(relicIds, 0), relics: relicIds, gold: 100, maxTurns: 30 }, swapBot());
  }
  const EFFECT = { dmg: 'hit', block: 'block', energy: 'energy', gold: 'gold', ink: 'ink', maxHp: 'max_hp', revive: 'hero_revive', hurt: 'hurt', status: 'status' };

  t.test('engine: every combat hook relic fires in a real fight, without throwing, and its first effect follows the trigger', () => {
    const sumFired = {};
    combatRelics.forEach((r) => {
      const parties = r.hero ? [[r.hero, partnerOf[r.hero]], [partnerOf[r.hero], r.hero]] : [['hanae', 'kuro'], ['suzu', 'raiga']];
      let fired = null;
      outer: for (const cfg of SCEN) for (const party of parties) for (const seed of [1, 2, 3]) for (const front of [0, 1]) {
        const s = scenario([r.id], cfg, party, seed, front);
        const C = s.C;
        t.ok(C.events[C.events.length - 1].type === 'end', `${r.id} in ${cfg.name}: the combat ends cleanly`);
        const i = C.events.findIndex((e) => e.type === 'relic' && e.id === r.id);
        if (i >= 0) { fired = { C, i, cfg: cfg.name, seed }; break outer; }
      }
      t.ok(!!fired, `${r.id} fires in at least one scenario`);
      sumFired[r.id] = !!fired;
      if (!fired) return;
      const h = r.hooks.find(isCombatHook);
      const first = h.fx[0];
      if (first && EFFECT[first.op]) {
        const after = fired.C.events.slice(fired.i + 1, fired.i + 40).map((e) => e.type);
        t.ok(after.indexOf(EFFECT[first.op]) >= 0, `${r.id}: after the relic event a "${EFFECT[first.op]}" event follows (${first.op}); saw ${after.slice(0, 8).join(',')}`);
      }
    });
    t.eq(Object.keys(sumFired).length, combatRelics.length, 'every combat relic was tried');
    t.ok(combatRelics.length >= 34, 'there are at least 34 combat hook relics: ' + combatRelics.length);
  });

  t.test('engine: the kitchen sink (all 66 relics at once) plays whole fights without throwing, in every scenario', () => {
    const all = Object.keys(ED.relics);
    SCEN.forEach((cfg) => [[['hanae', 'kuro'], 0], [['suzu', 'raiga'], 1], [['raiga', 'hanae'], 0]].forEach(([party, front], k) => {
      const s = scenario(all, cfg, party, 20 + k, front);
      t.ok(!s.capped && s.C.result !== null, `all relics, ${cfg.name}, ${party.join('+')}: the fight reaches a result (${s.C.result}) in ${s.turns} turns`);
      const C = s.C;
      const total = C.hand.length + C.draw.length + C.discard.length + C.exhaust.length + C.powers.length + (C.inPlay ? 1 : 0);
      t.eq(total, C.deckSize + C.added, `all relics, ${cfg.name}: conservation of cards`);
    }));
  });

  t.test('engine: mods and rows reach the combat exactly as the texts promise', () => {
    const W = (relic, o) => mk(Object.assign({ deck: ['zz_hanae_attack', 'zz_hanae_skill', 'zz_kuro_skill', 'zz_kuro_attack', 'zz_hanae_plain', 'zz_kuro_plain', 'zz_hanae_plain', 'zz_kuro_plain'], enemies: ['kappa'], relics: relic ? [].concat(relic) : [] }, o));
    t.eq(W(null).maxEnergy, 3, '(control) 3 Energy'); t.eq(W(null).hand.length, 5, '(control) 5 cards'); t.deep(W(null).heroes.map((h) => h.block), [0, 0], '(control) no starting Block');
    t.eq(W('tyrants_crown').maxEnergy, 4, 'tyrants_crown: 4 Energy'); t.eq(W(['tyrants_crown', 'blood_moon_vow']).maxEnergy, 5, 'two Energy relics: 5');
    t.eq(W('book_of_falling_leaves').hand.length, 6, 'book_of_falling_leaves: 6 cards');
    t.eq(W('ironclad_tsuba').hand.length, 4, 'ironclad_tsuba: 4 cards'); t.deep(W('ironclad_tsuba').heroes.map((h) => h.block), [2, 2], 'ironclad_tsuba: 2 Block each at the start of the turn'); t.deep(W('ironclad_tsuba').heroes.map((h) => h.st.thorns), [3, 3], 'ironclad_tsuba: and 3 Thorns each from the first turn');
    t.deep(W('bottomless_gourd').heroes.map((h) => [h.st.might, h.st.vulnerable]), [[3, 2], [3, 2]], 'bottomless_gourd: 3 Might and 2 Vulnerable on both heroes from the first turn'); t.eq(W('bottomless_gourd').hand.length, 5, 'bottomless_gourd: no change to the hand');
    t.deep(W('paper_umbrella').heroes.map((h) => h.block), [1, 1], 'paper_umbrella: 1 Block each');
    t.deep(W(['paper_umbrella', 'ironclad_tsuba']).heroes.map((h) => h.block), [3, 3], 'startBlock relics add');
    { const C = W('formation_scroll'); t.deep(C.heroes.map((h) => h.block), [3, 0], 'formation_scroll: the front hero starts with 3 Block, the back hero with none'); t.eq(C.hand.length, 5, 'formation_scroll: and it does not touch the hand size (only boss relics do)'); const D2 = W('formation_scroll', { front: 1 }); t.deep(D2.heroes.map((h) => h.block), [0, 3], 'formation_scroll follows the ROW, not the hero');
      const blockPlayed = (X, id) => { const c = X.hand.find((x) => x.id === id); return X.play(c.uid).filter((e) => e.type === 'block').reduce((a, e) => a + e.amount, 0); };
      t.eq(blockPlayed(W('formation_scroll'), 'zz_kuro_skill') - blockPlayed(W(null), 'zz_kuro_skill'), 1, 'formation_scroll: the back hero (Kuro) gains 1 more Block from a card'); t.eq(blockPlayed(W('formation_scroll'), 'zz_hanae_skill') - blockPlayed(W(null), 'zz_hanae_skill'), 0, 'formation_scroll: the front hero (Hanae) does not'); }
    { const C = W('war_banner'); const n = W(null); const uid = C.hand.find((c) => c.id === 'zz_hanae_attack').uid; t.eq(C.preview(uid, C.legalTargets(uid)[0]).dmg - n.preview(uid, n.legalTargets(uid)[0]).dmg, 1, 'war_banner: +1 damage to the front hero');
      const B = W('war_banner', { front: 1 }); const ub = B.hand.find((c) => c.id === 'zz_hanae_attack').uid; const nb = W(null, { front: 1 }); t.eq(B.preview(ub, B.legalTargets(ub)[0]).dmg - nb.preview(ub, nb.legalTargets(ub)[0]).dmg, 0, 'war_banner: nothing for the hero standing in the back'); }
    { const C = W('green_bamboo'); t.deep(C.heroes.map((h) => h.block), [6, 6], 'green_bamboo: 6 Block each on the first turn'); C.endTurn(); t.deep(C.heroes.map((h) => h.block).map((b) => b >= 0), [true, true], '(sanity)'); t.eq(C.turn, 2, 'turn 2'); t.deep(C.heroes.map((h) => h.block), [0, 0], 'green_bamboo: and nothing on the second turn'); }
    { const C = W('dancer_geta'); t.eq(C.canSwap().cost, 0, 'dancer_geta: first swap free'); C.swap(); t.eq(C.canSwap().cost, 0, 'dancer_geta: second swap free too'); C.swap(); t.eq(C.canSwap().cost, 1, 'dancer_geta: the third costs 1 Energy'); }
    { const C = W(null); C.swap(); t.eq(C.canSwap().cost, 1, '(control) the second swap costs 1 Energy'); }
  });

  // targeted, exact scenarios per relic: each builds the situation by hand and reads the events
  t.test('engine: relic effects, exactly (row, swap, kill, hit, exhaust, gem and resource relics)', () => {
    const P = (h) => `zz_${h}_`;
    const D = (...ids) => ids;
    const R = (id, o) => mk(Object.assign({ relics: [id], enemies: ['kappa'] }, o));
    const evs = (C, type, f) => of(C.events, type, f);
    const after = (C, relicId) => { const i = C.events.findIndex((e) => e.type === 'relic' && e.id === relicId); return i < 0 ? [] : C.events.slice(i + 1); };
    const relicCount = (C, id) => evs(C, 'relic', (e) => e.id === id).length;
    const heroHits = (C) => evs(C, 'hit', (e) => e.dst.kind === 'hero');
    const pump = (C, pred, max = 4) => { for (let i = 0; i < max && !pred() && C.phase === 'player'; i++) C.endTurn(); return pred(); };     // end turns until something has happened (enemy openers may take a turn)
    const attackFirst = (C, id) => { const c = C.hand.find((x) => x.id === id); return C.play(c.uid, C.needsTarget(c.uid) ? C.legalTargets(c.uid)[0] : undefined); };

    // swap relics
    { const C = R('fox_mask', { deck: D(P('hanae') + 'plain', P('kuro') + 'plain') }); C.swap(); t.eq(C.front().id, 'kuro', '(sanity) Kuro leads'); t.ok(!C.front().st.dodge && !C.back().st.dodge, 'fox_mask: the 1st swap of the fight grants nothing (every 2nd swap)'); C.swap(); t.eq(C.front().id, 'hanae', '(sanity) Hanae leads again'); t.eq(C.front().st.dodge, 1, 'fox_mask: the 2nd swap gives the new front hero 1 Dodge'); t.ok(!C.back().st.dodge, 'and the hero who stepped back has none'); C.swap(); C.swap(); t.eq(C.unit('hanae').st.dodge, 1, 'fox_mask: once per turn (the 4th swap is an even one too, but grants nothing more)'); t.ok(!C.unit('kuro').st.dodge, 'and Kuro never got one'); C.endTurn(); C.swap(); t.eq(C.unit('kuro').st.dodge || 0, 0, 'fox_mask: the 5th swap (next turn) is an odd one'); C.swap(); t.eq(C.unit('hanae').st.dodge, 1, 'fox_mask: the 6th swap pays again (the first Dodge was spent on the enemy phase)'); }
    { const C = R('mirror_of_two_faces', { deck: D(P('hanae') + 'plain') }); C.swap(); t.eq(C.energy, 4, 'mirror_of_two_faces: the free swap pays 1 Energy (3 + 1)'); C.swap(); t.eq(C.energy, 3, 'mirror_of_two_faces: the paid swap costs 1 and pays nothing (once per turn)'); C.endTurn(); C.swap(); t.eq(C.energy, 4, 'mirror_of_two_faces: it works again next turn'); }
    { const C = R('flute_of_changing_tunes', { deck: D(...Array.from({ length: 12 }, () => P('hanae') + 'plain')) }); const n = C.hand.length; C.swap(); t.eq(C.hand.length, n + 1, 'flute_of_changing_tunes: a swap draws 1'); C.swap(); t.eq(C.hand.length, n + 1, 'flute_of_changing_tunes: once per turn'); }
    { const C = mk({ relics: ['fox_mask', 'flute_of_changing_tunes'], deck: D(P('hanae') + 'plain', P('kuro') + 'plain'), enemies: ['kappa'] }); t.ok(C.hand.length > 0, 'two swap relics stack without error'); C.swap(); t.ok(relicCount(C, 'fox_mask') === 0 && relicCount(C, 'flute_of_changing_tunes') === 1, 'the flute fires on the 1st swap, the mask waits for the 2nd'); C.swap(); t.ok(relicCount(C, 'fox_mask') === 1 && relicCount(C, 'flute_of_changing_tunes') === 1, 'and the mask fires on the 2nd (the flute is once per turn)'); }
    // the card swap op counts as a swap
    { ED.add('cards', { zz_swapper: { hero: 'hanae', name: 'Probe Swapper', type: 'skill', rarity: 'common', cost: 0, fx: [{ op: 'swap' }], kw: ['innate'], slots: ['any'], art: { m: 'wind', c: 'azure' }, up: { cost: 0 } } }); const C = R('mirror_of_two_faces', { deck: D('zz_swapper', P('kuro') + 'plain') }); const c = C.hand.find((x) => x.id === 'zz_swapper'); C.play(c.uid); t.eq(C.energy, 4, 'a swap op on a card also pays out (and leaves the free swap alone)'); t.eq(C.canSwap().cost, 0, 'the free swap is still there'); }
    // hits and kills
    { const C = R('silver_bell', { enemies: ['bamboo_sprite'], deck: D(P('hanae') + 'plain') }); t.ok(pump(C, () => heroHits(C).length >= 2), '(sanity) the sprite lands at least two hits'); t.eq(relicCount(C, 'silver_bell'), 1, 'silver_bell: exactly once per fight, however many hits land'); const b = after(C, 'silver_bell').filter((e) => e.type === 'block').slice(0, 2); t.deep(b.map((e) => e.dst.id).sort(), ['hanae', 'kuro'], 'silver_bell: Block for both heroes'); t.ok(b.every((e) => e.amount === 6), 'silver_bell: 6 each'); }
    { const C = R('sturdy_shell', { enemies: ['bamboo_sprite', 'bamboo_sprite'], deck: D(P('hanae') + 'plain'), seed: 2 }); t.ok(pump(C, () => heroHits(C).length >= 3), '(sanity) two sprites land at least three hits'); t.ok(relicCount(C, 'sturdy_shell') >= 1, 'sturdy_shell fires when a hero is hit'); const perTurn = {}; let turn = 1; C.events.forEach((e) => { if (e.type === 'turn_start' && e.who === 'player') turn = e.turn; if (e.type === 'relic' && e.id === 'sturdy_shell') perTurn[turn] = (perTurn[turn] || 0) + 1; }); t.ok(Object.keys(perTurn).every((k) => perTurn[k] <= 2), 'sturdy_shell: never more than twice a turn: ' + JSON.stringify(perTurn)); }
    { const C = R('juzu_beads', { heroes: ['raiga', 'suzu'], enemies: ['bamboo_sprite'], deck: D(P('raiga') + 'plain'), hp: [80, 60], seed: 3 }); t.ok(pump(C, () => heroHits(C).length >= 1), '(sanity) Raiga is hit'); const back = evs(C, 'hit', (e) => e.src === null && e.dst.kind === 'enemy'); t.ok(back.length >= 1 && back.every((e) => e.raw === 3), 'juzu_beads: 3 damage back at the attacker'); t.ok(back.length <= 2, 'juzu_beads: twice a turn at most'); }
    { const C = R('juzu_beads', { heroes: ['raiga', 'suzu'], front: 1, enemies: ['bamboo_sprite'], deck: D(P('raiga') + 'plain'), seed: 3 }); t.ok(pump(C, () => heroHits(C).length >= 3), '(sanity) three hits land'); let bad = 0, fired = 0; C.events.forEach((e, i) => { if (e.type === 'relic' && e.id === 'juzu_beads') { fired++; let j = i - 1; while (j >= 0 && !(C.events[j].type === 'hit' && C.events[j].dst.kind === 'hero')) j--; if (j < 0 || C.events[j].dst.id !== 'raiga') bad++; } }); t.eq(bad, 0, 'juzu_beads: it only ever follows a hit on Raiga herself (Suzu leads here, Raiga stands in the back)'); t.eq(fired > 0, heroHits(C).some((e) => e.dst.id === 'raiga'), 'juzu_beads: fires exactly when Raiga was hit at least once (and stays silent when only Suzu was)'); }
    { const C = R('wolf_fang', { enemies: ['leaf_imp'], deck: D(P('hanae') + 'plain') }); C.enemies[0].hp = 1; attackFirst(C, P('hanae') + 'plain'); t.eq(C.result, 'win', '(sanity) the imp dies'); const b = evs(C, 'block').filter((e) => e.dst.id === 'hanae'); t.ok(b.length === 1 && b[0].amount === 3, 'wolf_fang: 3 Block for the hero who struck'); }
    { const C = R('hungry_skull', { enemies: ['kappa', 'kappa'], hp: [30, 60], deck: D(P('hanae') + 'plain', P('hanae') + 'plain', P('hanae') + 'plain') }); C.enemies[0].hp = 1; attackFirst(C, P('hanae') + 'plain'); const h = evs(C, 'heal'); t.ok(h.length === 1 && h[0].amount === 2 && h[0].dst.id === 'hanae', 'hungry_skull: the killer heals 2'); }
    { const C = R('spring_tsuba', { enemies: ['kappa', 'kappa'], deck: D(P('hanae') + 'plain', P('kuro') + 'plain') }); C.enemies[0].hp = 1; attackFirst(C, P('hanae') + 'plain'); t.ok(C.unit('hanae').st.bloom >= 2 && evs(C, 'block', (e) => e.dst.id === 'hanae' && e.amount === 3).length === 1, 'spring_tsuba: 2 Bloom and 3 Block for Hanae on her kill');
      const D2 = R('spring_tsuba', { enemies: ['kappa', 'kappa'], deck: D(P('hanae') + 'plain', P('kuro') + 'plain'), front: 1 }); D2.enemies[0].hp = 1; const c = D2.hand.find((x) => x.id === P('kuro') + 'plain'); D2.play(c.uid, D2.legalTargets(c.uid)[0]); t.eq(relicCount(D2, 'spring_tsuba'), 0, 'spring_tsuba: nothing when Kuro makes the kill'); }
    { const C = R('dragon_pearl', { enemies: ['oni_brute'], tier: 'elite', deck: D(P('hanae') + 'plain') }); C.enemies[0].hp = 1; attackFirst(C, P('hanae') + 'plain'); const m = evs(C, 'max_hp'); t.deep(m.map((e) => e.hero + ':' + e.n).sort(), ['hanae:2', 'kuro:2'], 'dragon_pearl: +2 max HP for both heroes on an Elite kill'); t.deep(C.summary().maxHpGain, { hanae: 2, kuro: 2 }, 'dragon_pearl: reported in the summary');
      const n = R('dragon_pearl', { enemies: ['kappa'], deck: D(P('hanae') + 'plain') }); n.enemies[0].hp = 1; attackFirst(n, P('hanae') + 'plain'); t.eq(evs(n, 'max_hp').length, 0, 'dragon_pearl: nothing for a normal enemy'); }
    { const C = R('phoenix_feather', { enemies: ['oni_brute'], tier: 'elite', hp: [3, 40], deck: D(P('hanae') + 'plain'), seed: 5 }); t.ok(pump(C, () => evs(C, 'hero_down').length >= 1, 5), '(sanity) Hanae falls'); const rev = evs(C, 'hero_revive'); t.eq(rev.length, 1, 'phoenix_feather: one revive'); t.eq(rev[0].hero, 'hanae', 'the fallen hero rises'); const mx = ED.heroes.hanae.maxHp; t.ok(rev[0].hp >= Math.floor(mx * 0.25) && rev[0].hp <= Math.ceil(mx * 0.25), '25% of her max HP'); t.eq(C.unit('hanae').row, 'back', 'in the back row'); t.eq(relicCount(C, 'phoenix_feather'), 1, 'and only once a fight'); }
    { const C = R('remembrance_candle', { deck: D(P('hanae') + 'plain'), enemies: ['paper_kodama'] }); C.endTurn(); t.ok(evs(C, 'block', (e) => e.dst.id === 'hanae' && e.amount === 6).length === 1, 'remembrance_candle: 6 Block for a front hero with none');
      const B = R('remembrance_candle', { deck: D(P('hanae') + 'cheap'), enemies: ['paper_kodama'] }); const c = B.hand.find((x) => x.id === P('hanae') + 'cheap'); B.play(c.uid); B.endTurn(); t.eq(evs(B, 'block', (e) => e.amount === 6).length, 0, 'remembrance_candle: nothing when the front hero already has Block'); }
    // playing cards
    { const C = R('longbow_of_reach', { deck: D(P('hanae') + 'plain', P('kuro') + 'plain'), front: 0, seed: 4 }); const k = C.hand.find((x) => x.id === P('kuro') + 'plain'); const before = evs(C, 'hit').length; C.play(k.uid, C.legalTargets(k.uid)[0]); const hits = evs(C, 'hit').slice(before); t.eq(hits.length, 2, 'longbow_of_reach: a back row Attack hits twice'); t.ok(hits[1].src === null && hits[1].raw === 3, 'longbow_of_reach: the extra hit is 3 unattributed damage to the same enemy'); t.eq(hits[1].dst.id, hits[0].dst.id, 'the same target');
      const F = R('longbow_of_reach', { deck: D(P('hanae') + 'plain', P('kuro') + 'plain'), front: 0, seed: 4 }); const h = F.hand.find((x) => x.id === P('hanae') + 'plain'); const b2 = evs(F, 'hit').length; F.play(h.uid, F.legalTargets(h.uid)[0]); t.eq(evs(F, 'hit').length - b2, 1, 'longbow_of_reach: nothing for the front row hero'); }
    { // the text says "your first 2 Attacks each turn ... when played from the back row": the limit counts every Attack (whoever plays it), only a back row play gets the bonus
      const mkL = () => R('longbow_of_reach', { deck: D(P('hanae') + 'attack', P('hanae') + 'attack', P('kuro') + 'attack'), front: 0, seed: 4 });
      const hitsOf = (C, c) => { const n = evs(C, 'hit').length; C.play(c.uid, C.legalTargets(c.uid)[0]); return evs(C, 'hit').length - n; };
      const L1 = mkL(); t.eq(hitsOf(L1, L1.hand.find((x) => x.id === P('kuro') + 'attack')), 2, 'longbow_of_reach: a back row Attack that is one of the first 2 Attacks of the turn gets the bonus');
      const L2 = mkL(); L2.hand.filter((x) => x.id === P('hanae') + 'attack').forEach((h) => L2.play(h.uid, L2.legalTargets(h.uid)[0])); t.eq(hitsOf(L2, L2.hand.find((x) => x.id === P('kuro') + 'attack')), 1, 'longbow_of_reach: after two Attacks from the front row the back row Attack is the 3rd, so it gets nothing (the limit counts every Attack)');
      L2.endTurn(); const k3 = L2.hand.find((x) => x.id === P('kuro') + 'attack'); if (k3) t.eq(hitsOf(L2, k3), 2, 'longbow_of_reach: and the count starts again next turn'); }
    { const C = R('battle_drum', { deck: D(P('hanae') + 'iheavy', P('hanae') + 'iheavy', P('hanae') + 'cheap', ...Array.from({ length: 8 }, () => P('hanae') + 'plain')), seed: 7 }); const heavies = C.hand.filter((x) => x.id === P('hanae') + 'iheavy'); t.eq(heavies.length, 2, '(sanity) both innate heavies are in hand'); const cheap = C.hand.find((x) => x.id === P('hanae') + 'plain');
      const n0 = C.hand.length; C.play(heavies[0].uid); t.eq(C.hand.length, n0 - 1 + 1, 'battle_drum: a 2 cost card draws 1'); C.energy = 5; C.play(heavies[1].uid); t.eq(relicCount(C, 'battle_drum'), 1, 'battle_drum: once per turn'); if (cheap) { const c1 = relicCount(C, 'battle_drum'); C.play(cheap.uid, C.legalTargets(cheap.uid)[0]); t.eq(relicCount(C, 'battle_drum'), c1, 'battle_drum: a 1 cost card does nothing'); } }
    { const C = R('hundred_petal_fan', { deck: D(P('hanae') + 'zero', P('hanae') + 'zero', P('hanae') + 'zero', ...Array.from({ length: 8 }, () => P('hanae') + 'plain')), seed: 2 }); const zs = C.hand.filter((x) => x.id === P('hanae') + 'zero'); zs.forEach((z) => C.play(z.uid, C.legalTargets(z.uid)[0])); t.eq(relicCount(C, 'hundred_petal_fan'), Math.min(2, zs.length), 'hundred_petal_fan: twice per turn at most'); t.ok(C.unit('hanae').st.bloom >= 2, 'hundred_petal_fan: Bloom for Hanae'); }
    { const C = R('hundred_petal_fan', { deck: D(P('hanae') + 'plain', P('hanae') + 'attack', 'zz_kuro_zero'), seed: 2 }); const z = C.hand.find((x) => x.id === 'zz_kuro_zero'); if (z) { C.play(z.uid, C.legalTargets(z.uid)[0]); t.eq(relicCount(C, 'hundred_petal_fan'), 0, 'hundred_petal_fan: only Hanae\'s own 0 cost Attacks'); } }
    { const C = R('scholars_spectacles', { heroes: ['kuro', 'hanae'], deck: D(P('kuro') + 'skill', P('kuro') + 'skill', P('kuro') + 'skill', ...Array.from({ length: 8 }, () => P('kuro') + 'plain')), seed: 2 }); const sk = C.hand.filter((x) => x.id === P('kuro') + 'skill'); t.eq(sk.length, 3, '(sanity) three innate skills in hand'); C.play(sk[0].uid); t.eq(relicCount(C, 'scholars_spectacles'), 0, 'scholars_spectacles: nothing on the 1st Skill'); const s0 = C.unit('kuro').st.sumi || 0; const n0 = C.hand.length; C.play(sk[1].uid); t.eq(relicCount(C, 'scholars_spectacles'), 1, 'scholars_spectacles: the 2nd Skill'); t.eq(C.unit('kuro').st.sumi - s0, 1, 'scholars_spectacles: 1 Sumi (his own passive already paid on the first Skill of the turn)'); t.eq(C.hand.length, n0, 'scholars_spectacles: and a card (hand size unchanged after playing the Skill)'); C.play(sk[2].uid); t.eq(relicCount(C, 'scholars_spectacles'), 1, 'scholars_spectacles: not on the 3rd'); }
    { const C = R('thunder_wheel', { heroes: ['raiga', 'suzu'], enemies: ['kappa', 'kappa'], deck: D(P('raiga') + 'zero', P('raiga') + 'zero', P('raiga') + 'zero', P('raiga') + 'zero'), seed: 3 }); const zs = C.hand.filter((x) => x.id === P('raiga') + 'zero'); zs.slice(0, 3).forEach((z, i) => { C.play(z.uid, C.legalTargets(z.uid)[0]); t.eq(relicCount(C, 'thunder_wheel'), i === 2 ? 1 : 0, `thunder_wheel: fires on the 3rd Attack only (play ${i + 1})`); }); t.ok(C.unit('raiga').st.charge >= 2, 'thunder_wheel: 2 Charge'); const splash = evs(C, 'hit', (e) => e.src === null); t.eq(splash.length, 2, 'thunder_wheel: a hit on each of the two enemies'); t.ok(splash.every((e) => e.raw === 4), 'for 4'); }
    { const C = R('stormtiger_sash', { heroes: ['raiga', 'suzu'], enemies: ['bamboo_sprite'], deck: D(P('raiga') + 'plain'), hp: [80, 60], seed: 2 }); C.unit('raiga').st.charge = 7; t.ok(pump(C, () => relicCount(C, 'stormtiger_sash') >= 1), 'stormtiger_sash fires when Raiga is hit'); t.ok(evs(C, 'hit', (e) => e.src === null && e.raw === 10).length >= 1, 'stormtiger_sash: 10 to everyone at 8 Charge'); t.ok((C.unit('raiga').st.charge || 0) < 8, 'and the Charge was spent'); }
    { const C = R('nightlong_inkwell', { heroes: ['kuro', 'hanae'], enemies: ['kappa', 'kappa'], deck: D(P('kuro') + 'plain') }); C.endTurn(); const p = evs(C, 'status', (e) => e.s === 'poison' && e.dst.kind === 'enemy' && e.delta === 2); t.eq(p.length, 2, 'nightlong_inkwell: 2 Poison on each enemy at the end of the turn'); }
    { const C = R('nightlong_inkwell', { heroes: ['hanae', 'suzu'], enemies: ['kappa'], deck: D(P('hanae') + 'plain') }); C.endTurn(); t.eq(relicCount(C, 'nightlong_inkwell'), 0, 'nightlong_inkwell: nothing without Kuro in the party'); }
    { const C = R('crescent_kanzashi', { heroes: ['suzu', 'raiga'], enemies: ['paper_kodama'], deck: D(P('suzu') + 'plain'), hp: [50, 50] }); C.unit('suzu').st.ward = 2; C.unit('raiga').st.weak = 2; C.unit('suzu').st.frail = 1; C.endTurn(); t.ok(relicCount(C, 'crescent_kanzashi') >= 1, 'crescent_kanzashi fires at 3 Ward'); t.ok(!C.unit('raiga').st.weak && !C.unit('suzu').st.frail, 'crescent_kanzashi: debuffs are cleansed from both heroes'); t.ok(evs(C, 'heal').filter((e) => e.amount === 2).length === 2, 'crescent_kanzashi: heals both for 2'); }
    { const C = R('lotus_sanctuary', { heroes: ['suzu', 'raiga'], enemies: ['kappa', 'kappa'], deck: D(P('suzu') + 'plain') }); C.unit('suzu').st.ward = 3; C.endTurn(); t.ok(relicCount(C, 'lotus_sanctuary') >= 1, 'lotus_sanctuary fires each turn'); t.ok(C.enemies.every((e) => e.st.weak >= 1 || e.down), 'lotus_sanctuary: Weak on every enemy at 4 Ward'); { const li = C.events.map((e) => e.type === 'relic' && e.id === 'lotus_sanctuary').lastIndexOf(true); const seq = C.events.slice(li + 1, li + 13).filter((e) => e.type === 'block'); t.deep(seq.map((e) => e.dst.id + ':' + e.amount).sort(), ['raiga:3', 'suzu:3'], 'lotus_sanctuary: 3 Block for both heroes right after the hook'); } t.ok((C.unit('suzu').st.ward || 0) <= 2, 'lotus_sanctuary: the Ward is spent'); }
    { const C = R('mizuhiki_cord', { heroes: ['suzu', 'raiga'], deck: D(P('suzu') + 'plain'), front: 1 }); const base0 = mk({ heroes: ['suzu', 'raiga'], deck: D(P('suzu') + 'plain'), front: 1 }); t.eq(C.unit('raiga').block - base0.unit('raiga').block, 3, 'mizuhiki_cord: 3 Block for Suzu\'s ally at the start of the turn (on top of Raiga\'s own front row Block)'); t.eq(C.unit('suzu').block, 0, 'and not for Suzu'); }
    { const C = R('pressed_petal', { deck: D(P('hanae') + 'plain') }); t.eq(C.unit('hanae').st.bloom, 1, 'pressed_petal: 1 Bloom at the first turn start'); C.endTurn(); t.eq(C.unit('hanae').st.bloom, 2, 'pressed_petal: and 1 more each turn'); }
    { const C = R('vial_of_spare_ink', { heroes: ['kuro', 'hanae'], deck: D(P('kuro') + 'plain') }); t.eq(C.unit('kuro').st.sumi, 3, 'vial_of_spare_ink: 3 Sumi at the start of combat'); const N = R('vial_of_spare_ink', { heroes: ['hanae', 'suzu'], deck: D(P('hanae') + 'plain') }); t.ok(!N.unit('hanae').st.sumi, 'vial_of_spare_ink: nothing without Kuro'); }
    // gem and exhaust and shuffle relics
    { const C = R('facet_lens', { deck: D({ id: P('hanae') + 'attack', gems: ['ember_ruby'] }, { id: P('hanae') + 'attack', gems: ['ember_ruby'] }, P('kuro') + 'skill'), seed: 1 }); const gs = C.hand.filter((x) => x.gems[0]); const n = C.hand.find((x) => !x.gems[0]); t.ok(gs.length === 2 && !!n, '(sanity) two gemmed and one plain innate card'); C.play(n.uid); t.eq(evs(C, 'gold').length, 0, 'facet_lens: no gold for a plain card'); C.play(gs[0].uid, C.legalTargets(gs[0].uid)[0]); t.deep(evs(C, 'gold').map((e) => e.n), [3], 'facet_lens: 3 gold for the first gemmed card'); t.eq(evs(C, 'block').filter((e) => e.amount === 3 && e.dst.id === 'hanae').length, 1, 'facet_lens: and 3 Block for the hero who played it'); C.play(gs[1].uid, C.legalTargets(gs[1].uid)[0]); t.deep(evs(C, 'gold').map((e) => e.n), [3], 'facet_lens: once per turn'); t.eq(evs(C, 'block').filter((e) => e.amount === 3).length, 1, 'facet_lens: the Block is once per turn too'); C.endTurn(); const g3 = C.hand.find((x) => x.gems[0]); if (g3) { C.play(g3.uid, C.legalTargets(g3.uid)[0]); t.eq(evs(C, 'gold').length, 2, 'facet_lens: and again next turn'); } }
    { const deck = [{ id: P('hanae') + 'attack', gems: ['ember_ruby'] }, { id: P('hanae') + 'attack', gems: ['ember_ruby'] }, ...Array.from({ length: 8 }, () => P('hanae') + 'plain')]; const C = R('jewelers_loupe', { deck, seed: 1 }); const gs = C.hand.filter((x) => x.gems[0]); t.eq(gs.length, 2, '(sanity) both innate gemmed cards are in hand'); const n0 = C.hand.length, mark = C.events.length; C.play(gs[0].uid, C.legalTargets(gs[0].uid)[0]); t.eq(C.hand.length, n0, 'jewelers_loupe: a gemmed card draws 1 (hand size unchanged after playing it)'); C.play(gs[1].uid, C.legalTargets(gs[1].uid)[0]); t.eq(relicCount(C, 'jewelers_loupe'), 1, 'jewelers_loupe: the hook fires once, for the first gemmed card of the turn'); t.eq(C.events.slice(mark).filter((e) => e.type === 'draw').length, 1, 'jewelers_loupe: and only that one drew'); }
    { const C = R('prism_crown', { deck: D({ id: P('hanae') + 'itwo', gems: ['ember_ruby', 'sunwake_topaz'] }, { id: P('hanae') + 'itwo', gems: ['ember_ruby', 'sunwake_topaz'] }, { id: P('hanae') + 'attack', gems: ['ember_ruby'] }, P('kuro') + 'plain'), seed: 1 }); const one = C.hand.find((x) => x.id === P('hanae') + 'attack'); const twos = C.hand.filter((x) => x.id === P('hanae') + 'itwo'); t.ok(!!one && twos.length === 2, '(sanity) the innate cards are in hand');
      C.play(one.uid, C.legalTargets(one.uid)[0]); t.eq(C.energy, 2, 'prism_crown: a one gem card pays nothing (3 - 1)'); C.play(twos[0].uid, C.legalTargets(twos[0].uid)[0]); t.eq(C.energy, 2, 'prism_crown: the two gem card pays 1 Energy back (2 - 1 + 1)'); C.play(twos[1].uid, C.legalTargets(twos[1].uid)[0]); t.eq(C.energy, 1, 'prism_crown: once per turn (the second two gem card costs 1)'); }
    { const C = R('burnt_offering', { deck: D(P('hanae') + 'exhaust', P('kuro') + 'plain') }); const c = C.hand.find((x) => x.id === P('hanae') + 'exhaust'); C.play(c.uid, C.legalTargets(c.uid)[0]); t.ok(evs(C, 'block', (e) => e.dst.id === 'hanae' && e.amount === 3).length === 1, 'burnt_offering: 3 Block when a card is exhausted'); }
    { const C = R('wooden_comb', { deck: D(...Array.from({ length: 6 }, () => P('hanae') + 'plain')), enemies: ['paper_kodama'] }); C.endTurn(); C.endTurn(); const sh = evs(C, 'shuffle'); t.ok(sh.length >= 1, '(sanity) the pile reshuffled'); t.ok(relicCount(C, 'wooden_comb') === sh.length, 'wooden_comb: once per reshuffle'); t.ok(evs(C, 'block', (e) => e.amount === 5).length >= 2, 'wooden_comb: 5 Block for both heroes'); }
    // combat start openers
    { const C = R('ember_charm', { enemies: ['kappa', 'kappa'] }); t.ok(C.enemies.every((e) => e.st.burn === 3), 'ember_charm: 3 Burn on every enemy at the start'); }
    { const C = R('paper_crane', { enemies: ['kappa', 'kappa'] }); t.ok(C.enemies.every((e) => e.st.weak === 1), 'paper_crane: 1 Weak on every enemy'); }
    { const C = R('wintry_bell', { enemies: ['kappa', 'kappa'] }); t.ok(C.enemies.every((e) => e.st.vulnerable === 1), 'wintry_bell: 1 Vulnerable on every enemy'); const base = mk({ enemies: ['kappa'], deck: D(P('hanae') + 'plain') }); const w = R('wintry_bell', { enemies: ['kappa'], deck: D(P('hanae') + 'plain') }); const u = w.hand[0].uid; t.ok(w.preview(u, w.legalTargets(u)[0]).dmg > base.preview(base.hand[0].uid, base.legalTargets(base.hand[0].uid)[0]).dmg, 'wintry_bell: +50% on the first turn'); }
    // turn cadence
    { const C = R('sands_of_patience', { enemies: ['moss_guardian'], tier: 'elite', deck: D(...Array.from({ length: 30 }, () => P('hanae') + 'plain')) }); const seen = [C.energy]; for (let i = 0; i < 6; i++) { C.endTurn(); seen.push(C.energy); } t.deep(seen, [3, 3, 4, 3, 3, 4, 3], 'sands_of_patience: +1 Energy on turns 3 and 6 only'); }
    { const C = R('blood_moon_vow', { enemies: ['paper_kodama'], deck: D(P('hanae') + 'plain'), hp: [30, 20] }); t.eq(C.maxEnergy, 4, 'blood_moon_vow: 4 Energy'); t.deep(C.heroes.map((h) => h.hp), [28, 18], 'blood_moon_vow: both heroes lose 2 HP at the start of the turn'); const L2 = R('blood_moon_vow', { enemies: ['paper_kodama'], deck: D(P('hanae') + 'plain'), hp: [1, 1] }); t.deep(L2.heroes.map((h) => h.hp), [1, 1], 'blood_moon_vow: it never kills a hero'); }
    { const C = R('apothecary_jar', { enemies: ['leaf_imp'], deck: D(P('hanae') + 'plain'), hp: [30, 40] }); C.enemies[0].hp = 1; attackFirst(C, P('hanae') + 'plain'); t.eq(C.result, 'win', '(sanity) won'); t.deep(evs(C, 'heal').map((e) => e.dst.id + ':' + e.amount).sort(), ['hanae:3', 'kuro:3'], 'apothecary_jar: 3 HP for both heroes when the fight is won'); const L2 = R('apothecary_jar', { enemies: ['leaf_imp'], deck: D(P('hanae') + 'plain') }); t.ok(L2.result === null, '(sanity)'); }
    // the boss relic hooks
    { const C = R('tyrants_crown', { deck: D(P('hanae') + 'plain') }); t.eq(C.maxEnergy, 4, 'tyrants_crown: 4 Energy in combat (its curses are a run hook)'); t.eq(evs(C, 'relic').length, 0, 'tyrants_crown: no combat hook to fire'); }
    { const C = R('ironclad_tsuba', { enemies: ['bamboo_sprite'], deck: D(P('hanae') + 'plain'), hp: [60, 60], seed: 3 }); C.endTurn(); const th = evs(C, 'thorns'); t.ok(th.length >= 1 && th[0].amount === 3 && th[0].dst.kind === 'enemy', 'ironclad_tsuba: the 3 Thorns bite the attacker'); t.eq(evs(C, 'relic').length, 1, 'ironclad_tsuba: its one hook fires once, at the start of the fight'); }
    { const strike = (C) => { const a = C.hand.find((x) => x.id === P('hanae') + 'attack'); const n0 = evs(C, 'hit').length; C.play(a.uid, C.legalTargets(a.uid)[0]); return evs(C, 'hit').slice(n0).filter((e) => e.dst.kind === 'enemy')[0].raw; };
      const deck = D(P('hanae') + 'attack', P('hanae') + 'plain');
      t.eq(strike(R('bottomless_gourd', { deck, seed: 2 })) - strike(mk({ deck: D(P('hanae') + 'attack', P('hanae') + 'plain'), enemies: ['kappa'], seed: 2 })), 3, 'bottomless_gourd: every hit lands 3 harder (Might 3)');
      const taken = (C) => { C.endTurn(); return evs(C, 'hit').filter((e) => e.dst.kind === 'hero' && e.src).map((e) => e.raw)[0]; };
      const withG = taken(R('bottomless_gourd', { deck: D(P('hanae') + 'plain'), seed: 2 })), plain = taken(mk({ deck: D(P('hanae') + 'plain'), enemies: ['kappa'], seed: 2 }));
      t.eq(withG, Math.floor(plain * 1.5), 'bottomless_gourd: and the first enemy hit lands 50% harder (Vulnerable 2)'); }
  });
}

// ================================================================================================ 8 run hooks
let RB = null, runWhy = null;
if (!exists('run.js') || !exists('map.js') || !exists('combat.js')) runWhy = 'js/run.js, js/map.js or js/combat.js is missing';
else { try { RB = boot({ only: ['run'] }); } catch (e) { runWhy = 'run.js did not load: ' + String(e && e.message).split('\n')[0]; } }
if (RB && (RB._errors.length || !RB.RUN || !RB.MAP || !contentReady(RB.DATA))) { runWhy = 'the run boot is incomplete: ' + JSON.stringify(RB._errors.map((x) => x.file + ' ' + x.message)); RB = null; }
if (!RB) console.log('treasure: run hook tests skipped (' + runWhy + ')');

if (RB) {
  const { RUN, MAP, DATA: RD } = RB;
  const NEW = (o) => RUN.newRun(Object.assign({ heroes: ['hanae', 'kuro'], seed: 7 }, o || {}));
  const paintedN = (R) => Object.values(R.map.tiles).filter((x) => x.painted).length;
  const paintOne = (R) => { const k = Object.keys(R.map.tiles).find((key) => { const x = R.map.tiles[key]; return MAP.canPaint(R.map, x.q, x.r).ok; }); const x = R.map.tiles[k]; return RUN.paint(R, x.q, x.r); };
  const upgraded = (R) => R.deck.filter((c) => c.up).length;
  const curses = (R) => R.deck.filter((c) => RD.cards[c.id].hero === 'curse').length;

  t.test('run hooks: onPickup relics act once, when taken, and never twice', () => {
    { const R = NEW(); const hp0 = R.heroes.map((h) => h.maxHp); const r = RUN.addRelic(R, 'heart_charm'); t.ok(r.ok, 'taken'); t.deep(R.heroes.map((h) => [h.hp, h.maxHp]), hp0.map((m) => [m + 5, m + 5]), 'heart_charm: +5 max HP and current HP for both heroes'); t.eq(RUN.addRelic(R, 'heart_charm').ok, false, 'a relic cannot be taken twice'); t.deep(R.heroes.map((h) => h.maxHp), hp0.map((m) => m + 5), '(so it does not pay twice)'); }
    { const R = NEW(); const b = upgraded(R); RUN.addRelic(R, 'whetstone'); t.eq(upgraded(R), b + 3, 'whetstone (Honing Stone): 3 cards upgraded'); }
    { const R = NEW(); RUN.addRelic(R, 'koi_pouch'); t.eq(R.gems.length, 1, 'koi_pouch: one gem'); t.eq(RD.gems[R.gems[0]].tier, 2, 'koi_pouch: of tier 2'); }
    { const R = NEW(); const n = R.deck.length; RUN.addRelic(R, 'tyrants_crown'); t.eq(curses(R), 3, 'tyrants_crown: 3 curses in the deck'); t.eq(R.deck.length, n + 3, 'and nothing else'); t.eq(RUN.mods(R).energy, 4, 'tyrants_crown: 4 Energy in the run mods'); }
    { const R = NEW(); const r = RUN.addRelic(R, 'toll_bridge'); t.eq(r.pending.length, 0, 'toll_bridge: no choice waits on pickup (a boss relic is claimed on the reward page)'); t.eq(R.gems.length, 1, 'toll_bridge: a gem on pickup'); t.eq(RD.gems[R.gems[0]].tier, 3, 'toll_bridge: of tier 3'); t.eq(RUN.mods(R).cardChoices, 5, 'toll_bridge: 5 cards in every later reward'); t.eq(RUN.addRelic(R, 'toll_bridge').ok, false, 'and it pays once'); t.eq(R.gems.length, 1, '(so one gem only)'); }
    { const R = NEW(); const hp0 = R.heroes.map((h) => h.maxHp); RUN.addRelic(R, 'inkstone_weight'); t.deep(R.heroes.map((h) => h.maxHp), hp0.map((m) => m + 3), 'inkstone_weight (Heavy Inkstone): +3 max HP for both heroes on pickup'); t.eq(R.pending.length, 0, 'and nothing waits'); }
    { const R = NEW(); RUN.addRelic(R, 'paper_umbrella'); t.eq(R.deck.length, 10, 'a mod relic changes nothing on pickup'); t.eq(RUN.mods(R).startBlock, 1, 'paper_umbrella is in the run mods'); }
  });

  t.test('run hooks: onChapterStart relics fire when a chapter starts, not before', () => {
    const control = NEW(); RUN.startChapter(control, 2);
    { const R = NEW(); const p0 = paintedN(R); RUN.addRelic(R, 'brass_lantern'); t.eq(paintedN(R), p0, 'brass_lantern: nothing on pickup'); RUN.startChapter(R, 2); t.eq(paintedN(R) - paintedN(control), 2, 'brass_lantern: 2 hexes painted for free when the chapter opens'); t.eq(R.ink, control.ink, 'brass_lantern: and they cost no Ink'); }
    { const R = NEW(); RUN.addRelic(R, 'sable_brush'); t.eq(R.brushes.length, 1, 'sable_brush: nothing on pickup'); RUN.startChapter(R, 2); t.eq(R.brushes.length, 2, 'sable_brush: a Brush at chapter start'); RUN.startChapter(R, 3); t.eq(R.brushes.length, 3, 'sable_brush: and again every chapter'); }
    { const R = NEW(); RUN.addRelic(R, 'sable_brush'); RUN.addRelic(R, 'brass_lantern'); const r = RUN.startChapter(R, 2); t.ok(r.log.filter((x) => x.op === 'relic').length === 2, 'both chapter hooks report'); }
  });

  t.test('run hooks: onPaint relics refund Ink on every Nth hex, counted over the whole run', () => {
    { const R = NEW(); RUN.addRelic(R, 'pilgrim_compass'); const ink0 = R.ink; for (let i = 0; i < 4; i++) t.ok(paintOne(R).ok, `paint ${i + 1}`); t.eq(R.ink, ink0 - 4, 'pilgrim_compass: no refund on the first 4'); paintOne(R); t.eq(R.ink, ink0 - 5 + 1, 'pilgrim_compass: the 5th hex refunds 1 Ink'); for (let i = 0; i < 5; i++) paintOne(R); t.eq(R.ink, ink0 - 10 + 2, 'pilgrim_compass: and the 10th'); }
    { const R = NEW(); RUN.addRelic(R, 'plum_pendant'); const ink0 = R.ink; for (let i = 0; i < 6; i++) paintOne(R); t.eq(R.ink, ink0 - 6 + 2, 'plum_pendant: every 3rd hex refunds 1 Ink'); RUN.startChapter(R, 2); const ink1 = R.ink; paintOne(R); paintOne(R); paintOne(R); t.eq(R.ink, ink1 - 3 + 1, 'plum_pendant: the count carries over into the next chapter (6 painted, the 9th refunds)'); }
    { const R = NEW(); RUN.addRelic(R, 'plum_pendant'); RUN.addRelic(R, 'pilgrim_compass'); const ink0 = R.ink; for (let i = 0; i < 15; i++) paintOne(R); t.eq(R.ink, ink0 - 15 + 5 + 3, 'both refunds stack (15 hexes: 5 and 3)'); }
    { const R = NEW(); RUN.addRelic(R, 'plum_pendant'); R.ink = 3; const before = paintedN(R);
      let spot = null; Object.keys(R.map.tiles).forEach((key) => { const x = R.map.tiles[key]; if (spot || !x.painted) return; for (let d = 0; d < 6; d++) if (MAP.brushCells(R.map, 'stroke', x.q, x.r, d).length === 3) { spot = [x.q, x.r, d]; break; } });
      t.ok(!!spot, '(sanity) a stroke that paints 3 new hexes exists'); const res = RUN.useBrush(R, 'stroke', spot[0], spot[1], spot[2]); t.ok(res.ok && paintedN(R) - before === 3, '(sanity) the Brush painted 3 hexes'); t.eq(R.ink, 3 + 1, 'a Brush paints count too: 3 hexes, so plum_pendant refunds 1 Ink and the Brush costs none'); }
  });

  t.test('run hooks: onRest, onShopEnter and onFightWon relics', () => {
    { const R = NEW(); R.ink = 4; RUN.addRelic(R, 'shrine_box'); const h = RUN.hook(R, 'onRest', {}); t.eq(R.ink, 6, 'shrine_box: +2 Ink at a camp'); t.ok(h.log.some((x) => x.id === 'shrine_box'), 'and it is logged'); t.eq(RUN.hook(R, 'onFightWon', { tier: 'normal' }).log.length, 0, 'shrine_box: silent on other hooks'); R.ink = 13; RUN.hook(R, 'onRest', {}); t.eq(R.ink, 14, 'shrine_box: Ink never goes over the pool'); }
    { const R = NEW(); R.heroes[0].hp = 10; R.heroes[1].hp = 12; RUN.addRelic(R, 'jade_key'); RUN.hook(R, 'onRest', {}); t.deep(R.heroes.map((h) => h.hp), [14, 16], 'jade_key: a rest also heals both heroes 4 HP'); t.eq(RUN.hook(R, 'onFightWon', { tier: 'normal' }).log.length, 0, 'jade_key: silent on other hooks'); }
    { const R = NEW(); RUN.addRelic(R, 'pearl_satchel'); RUN.hook(R, 'onShopEnter', {}); t.eq(R.gems.length, 1, 'pearl_satchel: a gem on entering a shop'); t.eq(RD.gems[R.gems[0]].tier, 1, 'of tier 1'); RUN.hook(R, 'onShopEnter', {}); t.eq(R.gems.length, 2, 'every shop'); }
    { const R = NEW(); RUN.addRelic(R, 'bounty_scroll'); const g0 = R.gold; RUN.hook(R, 'onFightWon', { tier: 'normal' }); t.eq(R.gold, g0, 'bounty_scroll: nothing for a normal fight'); RUN.hook(R, 'onFightWon', { tier: 'boss' }); t.eq(R.gold, g0, 'bounty_scroll: nothing for a boss'); RUN.hook(R, 'onFightWon', { tier: 'elite' }); t.eq(R.gold, g0 + 20, 'bounty_scroll: 20 gold for an Elite'); }
    { const R = NEW(); RUN.addRelic(R, 'merchants_seal'); const g0 = R.gold; ['normal', 'elite', 'boss'].forEach((tier, i) => { RUN.hook(R, 'onFightWon', { tier }); t.eq(R.gold, g0 + 8 * (i + 1), `merchants_seal: 8 gold after a ${tier} fight`); }); }
    { const R = NEW(); R.heroes[0].hp = 10; R.heroes[1].hp = 8; RUN.addRelic(R, 'rice_ball'); RUN.hook(R, 'onFightWon', { tier: 'normal' }); t.deep(R.heroes.map((h) => h.hp), [12, 12], 'rice_ball: 2 HP for both heroes, and 2 more for the one with less HP'); R.heroes[0].hp = R.heroes[0].maxHp; RUN.hook(R, 'onFightWon', { tier: 'normal' }); t.eq(R.heroes[0].hp, R.heroes[0].maxHp, 'rice_ball never overheals'); }
  });

  t.test('run: mods from relics fold the way the texts say, in the run and in the deck of relics a boss run could hold', () => {
    const M = (...ids) => { const R = NEW(); ids.forEach((id) => RUN.addRelic(R, id)); return { R, m: RUN.mods(R) }; };
    t.eq(M('inkstone_weight').m.inkMax, 16, 'inkstone_weight: 16 Ink'); t.eq(M('inkstone_weight').R.inkMax, 16, 'and R.inkMax follows at once');
    t.eq(M('ink_jar').m.startInk, 12, 'ink_jar: 12 start Ink'); t.eq(M('well_kasa').m.wellInk, 5, 'well_kasa: wells give 5');
    t.deep(M('bottomless_gourd').m, M().m, 'bottomless_gourd: a combat trade only, no mod at all');
    t.near(M('fortune_coin').m.goldMul, 1.25, 1e-9, 'fortune_coin: x1.25'); t.near(M('toll_bridge').m.priceMul, 1.25, 1e-9, 'toll_bridge: shops x1.25'); t.near(M('fox_haggler_token', 'toll_bridge').m.priceMul, 1.05, 1e-9, 'price fractions add (1 - 0.2 + 0.25)');
    t.eq(M('toll_bridge').m.cardChoices, 5, 'toll_bridge: 5 cards'); t.eq(M('toll_bridge', 'branching_bookmark').m.cardChoices, 6, 'with the bookmark: 6 (the cap)');
    t.near(M('fox_haggler_token').m.priceMul, 0.8, 1e-9, 'fox_haggler_token: prices x0.8'); t.eq(M('loaded_dice').m.rareBoost, 8, 'loaded_dice: +8 rare points');
    t.eq(M('jade_key').m.campActions, 2, 'jade_key: 2 camp actions'); t.eq(M('dancer_geta').m.freeSwaps, 2, 'dancer_geta: 2 free swaps');
    t.near(M('steaming_teacup').m.healMul, 1.25, 1e-9, 'steaming_teacup: x1.25'); t.near(M('steaming_teacup', 'book_of_falling_leaves').m.healMul, 0.85, 1e-9, 'healMul adds across relics (1 + 0.25 - 0.4)');
    t.eq(M('book_of_falling_leaves').m.hand, 6, 'book_of_falling_leaves: 6 cards'); t.eq(M('ironclad_tsuba').m.hand, 4, 'ironclad_tsuba: 4 cards'); t.eq(M('ironclad_tsuba').m.startBlock, 2, 'ironclad_tsuba: 2 Block each turn'); t.eq(M('book_of_falling_leaves', 'ironclad_tsuba').m.hand, 5, 'the two cancel to 5');
    t.eq(M('blood_moon_vow').m.energy, 4, 'blood_moon_vow: 4 Energy');
    t.eq(RD.rowFor('hanae', 'front', ['war_banner']).dmgAdd, 3, 'war_banner: Hanae\'s +2 front row damage becomes +3'); t.eq(RD.rowFor('hanae', 'back', ['war_banner']).dmgAdd, undefined, 'war_banner: nothing in the back row');
    t.deep(RD.rowFor('kuro', 'back', ['formation_scroll']), { dmgAdd: 2, blockAdd: 1 }, 'formation_scroll: Kuro in the back gains 1 more Block from cards'); t.deep(RD.rowFor('raiga', 'front', ['formation_scroll']), { thorns: 2, startBlock: 6 }, 'formation_scroll: Raiga\'s front Block doubles');
  });

  t.test('run: taking every relic in a row never throws, keeps the run consistent and survives a save round trip', () => {
    const R = NEW({ heroes: ['suzu', 'raiga'], seed: 21 });
    Object.keys(RD.relics).forEach((id) => { const r = RUN.addRelic(R, id); t.ok(r.ok, `${id} can be taken`); });
    t.eq(R.relics.length, 66, 'all 66 relics owned');
    const m = RUN.mods(R);
    t.ok(Object.keys(m).every((k) => Number.isFinite(m[k])), 'every folded mod is a finite number');
    t.ok(m.energy >= 1 && m.hand >= 1 && m.inkMax >= 6 && m.startInk <= m.inkMax, 'and inside its clamp');
    t.eq(curses(R), 3, 'the boss curses are in the deck');
    t.ok(R.heroes.every((h) => h.hp <= h.maxHp && h.hp >= 1), 'heroes are consistent');
    const back = RUN.deserialize(JSON.parse(JSON.stringify(RUN.serialize(R))));
    t.ok(back && back.relics.length === 66 && back.deck.length === R.deck.length, 'the run round-trips through a save');
    RUN.startChapter(R, 2); RUN.startChapter(R, 3); t.ok(R.map && R.chapter === 3, 'chapters still start with every chapter hook owned');
  });

  t.test('run: the relic pools behave (hero relics need their hero, shop and boss relics sit in their own pools, locks are respected)', () => {
    const fresh = { card: [], relic: [], gem: [] };
    ['common', 'uncommon', 'rare'].forEach((r) => {
      const hanaeKuro = RD.relicPool(r, fresh, ['hanae', 'kuro']).map((x) => x.id);
      t.ok(hanaeKuro.every((id) => !RD.relics[id].hero || ['hanae', 'kuro'].indexOf(RD.relics[id].hero) >= 0), `${r}: only Hanae and Kuro relics for that party`);
      t.ok(hanaeKuro.every((id) => !RD.relics[id].locked), `${r}: a fresh profile sees no locked relic`);
    });
    t.deep(RD.relicPool('boss', fresh, ['suzu', 'raiga']).map((x) => x.id).sort(), Object.values(RD.relics).filter((x) => x.rarity === 'boss' && !x.locked).map((x) => x.id).sort(), 'boss pool = the unlocked boss relics');
    t.ok(RD.relicPool('shop', undefined, ['hanae', 'kuro']).length === 4, 'with everything unlocked, all four shop relics can be sold');
    t.ok(RD.relicPool('common', undefined, ['hanae', 'kuro']).length === 18 + 2, 'a Hanae and Kuro party can see 18 generic and 2 hero commons');
  });
}

t.done();
