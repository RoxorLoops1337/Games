// DATA core: closed lists, economy invariants, mods folding, and the validator itself.
//
// Two jobs. (1) Bad-content probes: every hole the design review found (typo'd fields, op/target
// mismatches, per X on a non-X card, junk run ops, bad AI references, unsorted phases, cross-file
// references) must produce an error. (2) A complete synthetic "universe" (every fixed id, 37 cards
// per hero, 66 relics, 24 gems, 51 enemies, 40 events, ...) that must pass strict validation and every
// audit, then be broken one piece at a time. Also checks that DESIGN.md, CONTENT_SPEC.md,
// ART_BIBLE.md and index.html agree with js/data.js.
import fs from 'node:fs';
import path from 'node:path';
import { boot, harness, DIR } from './hocus_vocus_lib.mjs';

const t = harness('hocus_vocus data');
const EM = String.fromCharCode(0x2014), EN = String.fromCharCode(0x2013);   // built at run time: this file must contain no dash characters itself
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
const load = () => boot({ only: ['util', 'data'] });
const boot0 = load();
t.ok(!boot0._errors || boot0._errors.length === 0, 'util and data load without errors: ' + JSON.stringify(boot0._errors));
const has = (arr, sub) => arr.some((e) => e.includes(sub));
const D0 = boot0.DATA;
const L = D0.LISTS;

// ------------------------------------------------------------------ closed lists and constants
t.test('lists have no duplicates and use snake_case ids', () => {
  Object.keys(L).forEach((k) => {
    if (!Array.isArray(L[k])) return;
    t.eq(new Set(L[k]).size, L[k].length, `LISTS.${k} has duplicates`);
  });
  ['motifs', 'relicIcons', 'sfx', 'music', 'tiles', 'fx', 'combatEvents'].forEach((k) => L[k].forEach((id) => t.ok(/^[a-z][A-Za-z0-9_:]*$/.test(id), `${k}: ${id}`)));
});
t.test('vocabulary sizes the docs quote', () => {
  t.eq(L.motifs.length, 59, 'motifs');
  t.eq(L.relicIcons.length, 58, 'relic icons');
  t.eq(L.fx.length, 24, 'fx');
  t.eq(Object.keys(D0.statuses).length, 20, 'statuses');
  t.eq(L.heroIds.length, 4, 'heroes');
  t.deep(L.pickPairs.hand, ['discard', 'exhaust', 'retain', 'upgrade', 'copy'], 'hand picks');
});
t.test('the Tour Bus list gains follow LAST (P9 9D), and DATA.LINKS is the frozen link config of HV_STORY 5.2', () => {
  t.deep(L.libraryTabs, ['unlocks', 'achievements', 'story', 'bestiary', 'history', 'follow'], 'six tabs, the sixth appended last (ids only: the labels live in the screen)');
  const K = D0.LINKS;
  t.ok(K && typeof K === 'object' && Object.isFrozen(K), 'DATA.LINKS exists and is frozen');
  t.deep(Object.keys(K), ['handle', 'website', 'youtube', 'facebook', 'tiktok', 'instagram', 'support', 'game'], 'the exact keys, in the documented order');
  t.eq(K.handle, '@roxorloopsandjasmin', 'the handle');
  Object.keys(K).forEach((k) => t.eq(typeof K[k], 'string', `LINKS.${k} is a string (an empty one hides its button)`));
  Object.keys(K).filter((k) => k !== 'handle').forEach((k) => t.ok(K[k] === '' || /^https:\/\/\S+$/.test(K[k]), `LINKS.${k} is empty or an https address`));
  t.throws(() => { K.website = 'https://example.org/'; }, 'a frozen config cannot be edited at run time');
  t.ok(D0.LISTS.libraryTabs.indexOf('follow') === D0.LISTS.libraryTabs.length - 1 && D0.LINKS === K, 'LINKS sits on DATA next to LISTS');
});
t.test('op contexts are consistent', () => {
  L.hookOps.forEach((o) => t.ok(L.cardOps.indexOf(o) >= 0, `hook op ${o} is also a card op`));
  ['pick', 'repeat', 'swap', 'hook'].forEach((o) => t.ok(L.hookOps.indexOf(o) < 0, `${o} is not a hook op`));
  t.ok(L.cardOps.indexOf('hook') >= 0 && L.cardOps.indexOf('revive') >= 0, 'card ops have hook and revive');
  t.ok(L.hookOps.indexOf('revive') >= 0 && L.hookOps.indexOf('hook') < 0, 'hook ops have revive, not hook');
  t.ok(L.enemyOps.indexOf('flee') >= 0 && L.enemyOps.indexOf('stealGold') >= 0, 'enemy ops have flee and stealGold');
  t.ok(L.enemyCardTgt.indexOf('others') >= 0 && L.cardTgt.indexOf('others') >= 0, 'others target');
  t.ok(L.mods.indexOf('maxHpPct') < 0, 'maxHpPct is gone');
  Object.keys(L.modKind).forEach((k) => t.ok(L.mods.indexOf(k) >= 0, `modKind ${k} is a mod`));
  Object.keys(L.trialModKind).forEach((k) => t.ok(L.trialMods.indexOf(k) >= 0, `trialModKind ${k} is a trial mod`));
  L.mods.forEach((k) => t.ok(L.modKind[k], `mod ${k} has a kind`));
  L.trialMods.forEach((k) => t.ok(L.trialModKind[k], `trial mod ${k} has a kind`));
});
t.test('statuses are well formed', () => {
  Object.values(D0.statuses).forEach((s) => {
    t.ok(['buff', 'debuff', 'resource'].indexOf(s.kind) >= 0 && ['int', 'dur'].indexOf(s.stack) >= 0 && s.text.length > 10, `status ${s.id}`);
    if (s.kind === 'resource') t.ok(L.heroIds.indexOf(s.hero) >= 0, `resource ${s.id} names its hero`);
  });
  L.heroIds.forEach((id) => t.eq(D0.statuses[D0.heroes[id].res].hero, id, `${id} resource belongs to the hero`));
  t.ok(D0.isDebuff('weak') && !D0.isDebuff('might') && D0.isBuff('might'), 'isDebuff / isBuff');
});
t.test('DATA.COLOUR_NAME gives every slot colour id a display word (the ids stay)', () => {
  t.deep(D0.COLOUR_NAME, { red: 'pink', blue: 'blue', green: 'green', gold: 'gold', any: 'rainbow' }, 'the display table');
  L.slotColors.concat(L.gemColors).forEach((c) => t.ok(typeof D0.COLOUR_NAME[c] === 'string' && D0.COLOUR_NAME[c].length > 0, `colour ${c} has a display word`));
});
t.test('economy invariants (Vox numbers from the lead)', () => {
  const E = D0.ECONOMY;
  t.eq(E.startInk, 10, 'startInk'); t.eq(E.inkMax, 14, 'inkMax'); t.eq(E.wellInk, 4, 'wellInk');
  t.deep(E.map.solve, { min: 16, max: 22 }, 'solve range');
  t.eq(E.map.bossCol - E.map.startCol - E.map.startRing, E.map.solve.min, 'solve floor is the column geometry');
  t.ok(E.map.bossCol < E.map.cols && E.map.startCol >= 0, 'columns inside the map');
  t.ok(E.startInk + E.map.wells.count * E.wellInk >= E.map.solve.max, 'start Ink plus 3 wells covers the worst legal map');
  t.ok(E.startInk <= E.inkMax, 'start Ink fits the pool');
  Object.keys(E.dist).forEach((k) => { t.ok(E.countMin[k] !== undefined || k === 'enemy', `countMin ${k}`); if (E.countMax[k] !== undefined) t.ok(E.countMax[k] >= (E.countMin[k] || 0), `countMax ${k}`); });
  t.ok(Object.values(E.dist).reduce((a, b) => a + b, 0) < 0.6, 'tile fractions leave room for empty ground');
  const nonBlock = Math.round(E.map.cols * E.map.rows * (1 - E.map.blockFrac));
  Object.keys(E.dist).forEach((k) => { const n = D0.tileCount(k, nonBlock); t.ok(n >= (E.countMin[k] || 0) && n <= (E.countMax[k] === undefined ? 1e9 : E.countMax[k]), `tileCount ${k}=${n}`); });
  t.ok(D0.tileCount('well', nonBlock) >= 6 && D0.tileCount('event', nonBlock) <= 26, 'well and event counts');
  t.ok(E.rarity.normal.common + E.rarity.normal.uncommon + E.rarity.normal.rare === 100, 'rarity weights sum to 100');
  t.ok(E.library.card.rare > E.library.card.uncommon && E.inkstones.win > 0 && E.score.curse < 0, 'library, inkstones, score');
  t.eq(E.rareOffsetCap, 40, 'rareOffsetCap');
});
t.test('settings domains', () => {
  const S = D0.SETTINGS;
  t.deep(Object.keys(S).sort(), ['colorblind', 'damageNumbers', 'fastAnim', 'hints', 'musicVol', 'quality', 'reduceMotion', 'sfxVol', 'shake', 'textScale'], 'setting keys');
  t.eq(D0.cleanSetting('musicVol', 7), 1, 'clamped high'); t.eq(D0.cleanSetting('musicVol', 'x'), 0.7, 'default on junk');
  t.eq(D0.cleanSetting('textScale', 1.3), 1.3, 'listed value'); t.eq(D0.cleanSetting('textScale', 2), 1, 'unlisted value falls back');
  t.eq(D0.cleanSetting('reduceMotion', null), null, 'null is legal'); t.eq(D0.cleanSetting('nope', 1), undefined, 'unknown key');
});
t.test('heroes validate on their own and their rows are legal', () => {
  const v = D0.validate('heroes');
  t.eq(v.errors.length, 0, 'heroes valid: ' + v.errors.join('; '));
  t.deep(D0.rowFor('suzu', 'front', []), { blockAdd: 1, thorns: 2 }, 'rowFor plain');
});

// ------------------------------------------------------------------ mods folding
t.test('foldMods: counts, fractions, clamps', () => {
  const base = D0.foldMods([]);
  t.eq(base.energy, 3, 'energy'); t.eq(base.hand, 5, 'hand'); t.eq(base.inkMax, 14, 'inkMax'); t.eq(base.startInk, 10, 'startInk');
  t.eq(base.wellInk, 4, 'wellInk'); t.eq(base.goldMul, 1, 'goldMul'); t.eq(base.reviveFrac, 0.25, 'reviveFrac'); t.eq(base.campActions, 1, 'campActions');
  const m = D0.foldMods([{ energy: 1, goldMul: 0.25, healMul: -0.25 }, { goldMul: 0.25, inkMax: -2 }, null, { enemyDmg: 0.1, enemyDmg2: 9 }]);
  t.eq(m.energy, 4, 'energy +1'); t.near(m.goldMul, 1.5, 1e-9, 'two relics add, not multiply'); t.near(m.healMul, 0.75, 1e-9, 'healMul -0.25');
  t.eq(m.inkMax, 12, 'inkMax -2'); t.near(m.enemyDmg, 1.1, 1e-9, 'enemyDmg factor');
  t.eq(D0.foldMods([{ inkMax: -99 }]).inkMax, 6, 'inkMax floor'); t.eq(D0.foldMods([{ startInk: 50 }]).startInk, 14, 'startInk never above inkMax');
  t.near(D0.foldMods([{ priceMul: -5 }]).priceMul, 0.1, 1e-9, 'fraction floor 0.1');
  t.near(D0.foldMods([{ reviveFrac: -1 }]).reviveFrac, 0.05, 1e-9, 'reviveFrac floor'); t.eq(D0.foldMods([{ reviveFrac: 5 }]).reviveFrac, 1, 'reviveFrac cap');
  t.eq(D0.foldMods([{ hand: 99 }]).hand, 10, 'hand never above maxHand');
});
t.test('trialDeltas sums levels 1..N and modsFor folds relics plus trial', () => {
  const { DATA } = load();
  DATA.add('trials', { trial_1: { level: 1, name: 'One', text: 'x', mods: { enemyHp: 0.1 } }, trial_2: { level: 2, name: 'Two', text: 'x', mods: { enemyHp: 0.1, startInk: -1 } }, trial_3: { level: 3, name: 'Three', text: 'x', mods: { enemyDmg: 0.2 } } });
  t.near(DATA.trialDeltas(2).enemyHp, 0.2, 1e-9, 'levels 1 and 2 add'); t.eq(DATA.trialDeltas(2).enemyDmg, undefined, 'level 3 not included'); t.eq(DATA.trialDeltas(0).enemyHp, undefined, 'trial 0 is empty');
  DATA.add('relics', { r1: { name: 'R', rarity: 'common', text: 'x.', art: { m: 'lantern' }, mods: { startInk: 2 } } });
  const m = DATA.modsFor(['r1'], 2);
  t.eq(m.startInk, 11, 'relic +2 and trial -1'); t.near(m.enemyHp, 1.2, 1e-9, 'trial enemyHp factor');
  t.eq(DATA.modsFor(['ghost'], 0).startInk, 10, 'unknown relic id is ignored');
  t.eq(DATA.modsFor(['r1'], DATA.trialDeltas(2)).startInk, 11, 'the stored deltas object works like a level');
  DATA.trials.trial_2.mods.startInk = -5; t.eq(DATA.modsFor(['r1'], { enemyHp: 0.2, startInk: -1 }).startInk, 11, 'stored deltas do not drift when trial data is retuned');
});
t.test('rowFor merges relic rows', () => {
  const { DATA } = load();
  DATA.add('relics', { r1: { name: 'R', rarity: 'common', text: 'x.', art: { m: 'lantern' }, rows: { front: { dmgAdd: 1 }, back: { drawAdd: 1 } } } });
  t.deep(DATA.rowFor('hanae', 'front', ['r1']), { dmgAdd: 3 }, 'front'); t.deep(DATA.rowFor('hanae', 'back', ['r1']), { blockAdd: 1, drawAdd: 1 }, 'back');
});

// ------------------------------------------------------------------ registry writing
t.test('DATA.add rules', () => {
  const { DATA } = load();
  t.throws(() => DATA.add('cards', [{ id: 'a' }]), 'an array throws');
  t.throws(() => DATA.add('nope', {}), 'unknown registry throws');
  t.throws(() => DATA.add('cards', { a: { id: 'b' } }), 'key must equal id');
  DATA.add('cards', { x_one: { name: 'One' } });
  t.throws(() => DATA.add('cards', { x_one: { name: 'Two' } }), 'duplicate throws');
  DATA.add('tips', 'one'); DATA.add('tips', ['two', 'three']);
  t.eq(DATA.tips.length, 3, 'tips accept a string or an array');
  DATA.addEncounters(1, { normal: [{ id: 'ch1_a', enemies: ['kappa'], w: 1, min: 0 }] });
  t.throws(() => DATA.addEncounters(1, { normal: [{ id: 'ch1_a', enemies: ['kappa'], w: 1, min: 0 }] }), 'duplicate group id throws');
  t.throws(() => DATA.addEncounters(2, { normal: [{ id: 'ch1_a', enemies: ['kappa'], w: 1, min: 0 }] }), 'group ids are global');
  DATA.addEncounters(1, { boss: 'boss_kuzunoha' });
  t.throws(() => DATA.addEncounters(1, { boss: 'boss_kuzunoha' }), 'second boss throws');
  t.eq(DATA.groupById('ch1_a').w, 1, 'groupById');
});
t.test('lookups filter locked content by the unlocked set', () => {
  const { DATA } = load();
  const mk = (id, over) => Object.assign({ name: id, hero: 'hanae', type: 'attack', rarity: 'rare', cost: 1, fx: [], art: { m: 'slash', c: 'rose' } }, over);
  DATA.add('cards', { hanae_a: mk('a'), hanae_b: mk('b', { locked: true }), hanae_s: mk('s', { rarity: 'starter' }) });
  t.deep(DATA.rewardPool('hanae', 'rare').map((c) => c.id), ['hanae_a', 'hanae_b'], 'undefined unlocked means everything');
  t.deep(DATA.rewardPool('hanae', 'rare', { card: [] }).map((c) => c.id), ['hanae_a'], 'locked card hidden');
  t.deep(DATA.rewardPool('hanae', 'rare', { card: ['hanae_b'] }).map((c) => c.id), ['hanae_a', 'hanae_b'], 'owned locked card shown');
  t.deep(DATA.rewardPool('hanae', 'starter'), [], 'starters never reward');
  DATA.add('relics', { rr: { name: 'R', rarity: 'common', text: 'x.', art: { m: 'lantern' }, mods: { energy: 1 }, hero: 'kuro' }, rs: { name: 'S', rarity: 'common', text: 'x.', art: { m: 'lantern' }, mods: { energy: 1 } } });
  t.deep(DATA.relicPool('common', undefined, ['hanae', 'suzu']).map((r) => r.id), ['rs'], 'hero relic needs its hero in the party');
  t.deep(DATA.relicPool('common', undefined, ['kuro', 'suzu']).map((r) => r.id).sort(), ['rr', 'rs'], 'hero relic drops with its hero');
  t.ok(DATA.isUnlocked('hero', 'suzu', { card: [] }) && DATA.isUnlocked('trial', 3, { card: [] }) && DATA.isUnlocked('card', 'ghost', { card: [] }), 'kinds without a registry (hero, trial) and unknown ids never throw and count as unlocked: META owns hero and trial locks');
});
t.test('walkOps visits nested ops including hook fx', () => {
  const seen = [];
  D0.walkOps([{ op: 'cond', if: { handEmpty: true }, then: [{ op: 'block', n: 1 }], else: [{ op: 'repeat', n: 2, do: [{ op: 'draw', n: 1 }] }] }, { op: 'hook', on: 'turnStart', fx: [{ op: 'energy', n: 1 }] }], (o) => seen.push(o.op));
  t.deep(seen, ['cond', 'block', 'repeat', 'draw', 'hook', 'energy'], 'walk order');
});

// ------------------------------------------------------------------ card and op probes
const cardDef = (over) => Object.assign({ name: 'Test Cut', hero: 'hanae', type: 'attack', rarity: 'common', cost: 1, fx: [{ op: 'dmg', n: 6, tgt: 'enemy' }], up: { fx: [{ op: 'dmg', n: 9, tgt: 'enemy' }] }, kw: [], slots: ['red'], art: { m: 'slash', c: 'rose' } }, over);
const cardErrs = (over, opt) => { const { DATA } = load(); DATA.add('cards', { hanae_test: cardDef(over) }); return DATA.validate('cards', opt); };
const fxErrs = (fx, extra) => cardErrs(Object.assign({ fx }, extra || {})).errors;

t.test('a good card and good ops validate clean', () => {
  const good = [
    [{ op: 'dmg', n: { base: 2, per: 'status', s: 'bloom', mul: 2, upTo: 4 }, hits: 2, tgt: 'all', pierce: true, lifesteal: true, el: 'fire', consume: { s: 'bloom', upTo: 4 } }],
    [{ op: 'dmg', n: { per: 'block' }, consume: 'block' }, { op: 'block', n: { per: 'block', who: 'ally' }, tgt: 'ally' }, { op: 'dmg', n: 3, tgt: 'others' }],
    [{ op: 'status', s: 'might', n: -3, tgt: 'self' }, { op: 'status', s: 'poison', n: 4 }, { op: 'removeStatus', s: 'sumi', n: 2, tgt: 'self' }, { op: 'removeStatus', s: 'debuffs' }],
    [{ op: 'pick', from: 'hand', n: 1, then: 'exhaust', optional: true }, { op: 'pick', from: 'draw', n: 2, top: 3, then: 'toHand', filter: { type: 'attack' } }, { op: 'add', card: 'x_y', n: 2, to: 'draw', up: true }],
    [{ op: 'cond', if: { row: 'front', status: { s: 'bloom', gte: 2, who: 'self' }, hpPct: { who: 'ally', lt: 0.5 }, enemies: { gte: 2 }, handEmpty: true }, then: [{ op: 'draw', n: 1 }], else: [{ op: 'energy', n: 1 }] }],
    [{ op: 'heal', n: 4, tgt: 'both' }, { op: 'hurt', n: 2, tgt: 'self', lethal: false }, { op: 'revive', pct: 0.25 }, { op: 'swap' }, { op: 'gold', n: 5 }, { op: 'ink', n: 1 }, { op: 'maxHp', n: 1 }],
    [{ op: 'hook', on: 'onPlay', filter: { type: ['skill', 'power'], cost: { lte: 1 } }, limit: 1, every: 2, fx: [{ op: 'status', s: 'sumi', n: 1, tgt: 'self' }] }],
    [{ op: 'hook', on: 'turnEnd', once: true, fx: [{ op: 'status', s: 'might', n: -3, tgt: 'self' }] }, { op: 'dmg', n: 4, tgt: 'enemy' }],
  ];
  good.forEach((fx, i) => { const e = fxErrs(fx); t.eq(e.length, 0, `good #${i}: ${e.join('; ')}`); });
  t.eq(fxErrs([{ op: 'repeat', n: { per: 'X' }, do: [{ op: 'dmg', n: 4 }] }], { cost: 'X', up: { cost: 'X', kw: ['retain'] } }).length, 0, 'X card with per X');
  const c = cardErrs({});
  t.eq(c.errors.length, 0, 'plain card ' + c.errors.join('; '));
});
t.test('op probes: every hole the review found is rejected', () => {
  const bad = [
    ['unknown op', [{ op: 'zap', n: 1 }], 'op "zap" not allowed'],
    ['unknown field hit', [{ op: 'dmg', n: 3, hit: 3 }], 'unknown field "hit"'],
    ['unknown field pierse', [{ op: 'dmg', n: 3, pierse: true }], 'unknown field "pierse"'],
    ['block tgt enemy', [{ op: 'block', n: 3, tgt: 'enemy' }], 'tgt "enemy" not legal for block'],
    ['dmg tgt self', [{ op: 'dmg', n: 3, tgt: 'self' }], 'tgt "self" not legal for dmg'],
    ['hurt tgt enemy', [{ op: 'hurt', n: 3, tgt: 'enemy' }], 'tgt "enemy" not legal for hurt'],
    ['heal tgt all', [{ op: 'heal', n: 3, tgt: 'all' }], 'tgt "all" not legal for heal'],
    ['per X on a cost-1 card', [{ op: 'dmg', n: { per: 'X' } }], 'per X needs a card with cost'],
    ['bad per', [{ op: 'dmg', n: { per: 'bananas' } }], 'per "bananas"'],
    ['who on per turn', [{ op: 'dmg', n: { per: 'turn', who: 'ally' } }], 'who only applies'],
    ['value with neither', [{ op: 'dmg', n: {} }], 'needs base or per'],
    ['value string', [{ op: 'dmg', n: '6' }], 'value must be a number'],
    ['unknown value key', [{ op: 'dmg', n: { per: 'turn', pow: 2 } }], 'unknown value key "pow"'],
    ['per status without s', [{ op: 'dmg', n: { per: 'status' } }], 'per status needs a known s'],
    ['unknown status', [{ op: 'status', s: 'zzz', n: 1 }], 'unknown status "zzz"'],
    ['consume unknown', [{ op: 'dmg', n: 3, consume: 'zzz' }], 'consume must be'],
    ['consume on gold', [{ op: 'gold', n: 3, consume: 'bloom' }], 'unknown field "consume" on gold'],
    ['el unknown', [{ op: 'dmg', n: 3, el: 'plasma' }], 'not in LISTS.elements'],
    ['pick bad pair', [{ op: 'pick', from: 'hand', n: 1, then: 'toHand' }], 'cannot then toHand'],
    ['pick top off draw', [{ op: 'pick', from: 'hand', n: 1, then: 'discard', top: 2 }], "only applies to from 'draw'"],
    ['pick bad from', [{ op: 'pick', from: 'nowhere', n: 1, then: 'discard' }], 'bad pick.from'],
    ['add to bad', [{ op: 'add', card: 'x', to: 'top' }], 'bad add.to'],
    ['add top without draw', [{ op: 'add', card: 'x', top: true }], 'top must be true and needs'],
    ['revive both', [{ op: 'revive', n: 5, pct: 0.5 }], 'exactly one of n or pct'],
    ['revive none', [{ op: 'revive' }], 'exactly one of n or pct'],
    ['revive pct 0', [{ op: 'revive', pct: 0 }], 'fraction'],
    ['cond unknown key', [{ op: 'cond', if: { moon: true }, then: [{ op: 'draw', n: 1 }] }], 'unknown condition "moon"'],
    ['cond bad comparator', [{ op: 'cond', if: { cardsPlayed: { gt: 2 } }, then: [{ op: 'draw', n: 1 }] }], 'unknown key "gt"'],
    ['cond who banana', [{ op: 'cond', if: { status: { s: 'bloom', who: 'banana' } }, then: [{ op: 'draw', n: 1 }] }], 'who "banana"'],
    ['cond empty', [{ op: 'cond', if: {}, then: [{ op: 'draw', n: 1 }] }], 'empty condition'],
    ['cond no then', [{ op: 'cond', if: { handEmpty: true } }], 'then must be a non-empty array'],
    ['cond row bad', [{ op: 'cond', if: { row: 'middle' }, then: [{ op: 'draw', n: 1 }] }], 'row must be front or back'],
    ['hpPct without bound', [{ op: 'cond', if: { hpPct: { who: 'self' } }, then: [{ op: 'draw', n: 1 }] }], 'needs lt or gt'],
    ['repeat without do', [{ op: 'repeat', n: 2 }], 'do must be a non-empty array'],
    ['hook nested in hook', [{ op: 'hook', on: 'onPlay', fx: [{ op: 'hook', on: 'onPlay', fx: [{ op: 'draw', n: 1 }] }] }], 'op "hook" not allowed in hook context'],
    ['hook bad on', [{ op: 'hook', on: 'onFoo', fx: [{ op: 'draw', n: 1 }] }], 'hook.on "onFoo"'],
    ['hook run hook', [{ op: 'hook', on: 'onPaint', fx: [{ op: 'draw', n: 1 }] }], 'hook.on "onPaint"'],
    ['hook tier filter on onPlay', [{ op: 'hook', on: 'onPlay', filter: { tier: 'elite' }, fx: [{ op: 'draw', n: 1 }] }], 'tier is meaningless on onPlay'],
    ['hook filter unknown', [{ op: 'hook', on: 'onPlay', filter: { moon: 1 }, fx: [{ op: 'draw', n: 1 }] }], 'unknown key "moon"'],
    ['hook filter hero nobody', [{ op: 'hook', on: 'onPlay', filter: { hero: 'nobody' }, fx: [{ op: 'draw', n: 1 }] }], 'hero "nobody"'],
    ['hook every 1', [{ op: 'hook', on: 'onPlay', every: 1, fx: [{ op: 'draw', n: 1 }] }], 'every must be an integer >= 2'],
    ['hook once and every', [{ op: 'hook', on: 'onPlay', once: true, every: 2, fx: [{ op: 'draw', n: 1 }] }], 'once and every cannot combine'],
    ['hook limit 0', [{ op: 'hook', on: 'onPlay', limit: 0, fx: [{ op: 'draw', n: 1 }] }], 'limit must be'],
    ['hook empty fx', [{ op: 'hook', on: 'onPlay', fx: [] }], 'fx must be a non-empty array'],
    ['hook pick inside', [{ op: 'hook', on: 'onPlay', fx: [{ op: 'pick', from: 'hand', n: 1, then: 'discard' }] }], 'op "pick" not allowed in hook context'],
    ['fx not array', 'nope', 'fx must be an array'],
    ['enemy op in card', [{ op: 'summon', enemy: 'kappa' }], 'op "summon" not allowed in card context'],
    ['status field junk', [{ op: 'status', s: 'weak', n: 1, turns: 2 }], 'unknown field "turns"'],
    ['maxHp tgt enemy', [{ op: 'maxHp', n: 1, tgt: 'enemy' }], 'tgt "enemy" not legal for maxHp'],
  ];
  bad.forEach(([label, fx, sub]) => { const e = fxErrs(fx); t.ok(has(e, sub), `${label}: expected "${sub}" in [${e.join(' | ')}]`); });
});
t.test('card shape probes', () => {
  const bad = [
    ['text field', { text: 'Deal 6.' }, 'card text is generated'],
    ['unknown card field', { hooks: [] }, 'unknown field "hooks"'],
    ['missing up', { up: undefined }, 'missing up'],
    ['up nothing', { up: {} }, 'up must change fx, cost or kw'],
    ['up unknown key', { up: { text: 'x', fx: [{ op: 'dmg', n: 9 }] } }, 'up.text unknown'],
    ['up bad kw', { up: { kw: ['bogus'] } }, 'unknown keyword "bogus" in up.kw'],
    ['up kw not array', { up: { kw: 'retain' } }, 'up.kw must be an array'],
    ['up bad fx', { up: { fx: [{ op: 'dmg', n: 9, tgt: 'self' }] } }, 'tgt "self" not legal'],
    ['bad kw', { kw: ['sticky'] }, 'unknown keyword "sticky"'],
    ['bad slot', { slots: ['purple'] }, 'bad slot colour'],
    ['four slots', { slots: ['red', 'red', 'red', 'red'] }, 'at most 3 slots'],
    ['bad motif', { art: { m: 'nope', c: 'rose' } }, 'not in LISTS.motifs'],
    ['no palette', { art: { m: 'slash' } }, 'art.c is required'],
    ['bad palette', { art: { m: 'slash', c: 'pink' } }, 'not in LISTS.palettes'],
    ['locked common', { locked: true }, 'starters and commons are never locked'],
    ['id prefix', {}, null],
    ['no cost', { cost: undefined }, 'cost is required'],
    ['cost 9', { cost: 9 }, 'cost must be 0..5'],
    ['no fx', { fx: [] }, 'a playable card needs fx'],
    ['bad hero', { hero: 'nobody' }, 'hero "nobody"'],
    ['bad type', { type: 'spell' }, 'type'],
    ['bad rarity', { rarity: 'mythic' }, 'rarity'],
    ['hand junk', { hand: { turnEnd: [{ op: 'hurt', n: 1 }], sometimes: [] } }, 'hand.sometimes unknown'],
    ['hand debuff without tgt', { hand: { drawn: [{ op: 'status', s: 'weak', n: 1 }] } }, 'a debuff in a hand op needs an explicit tgt'],
    ['dash', { name: 'Bad ' + EM + ' Name' }, 'em or en dash'],
  ];
  bad.forEach(([label, over, sub]) => { if (sub === null) return; const e = cardErrs(over).errors; t.ok(has(e, sub), `${label}: expected "${sub}" in [${e.join(' | ')}]`); });
  { const { DATA } = load(); DATA.add('cards', { kuro_test: cardDef({}) }); t.ok(has(DATA.validate('cards').errors, 'id must start with "hanae_"'), 'id prefix must match the hero'); }
  { const { DATA } = load(); DATA.add('cards', { curse_x: { name: 'C', hero: 'curse', type: 'curse', rarity: 'token', kw: [], fx: [], art: { m: 'skull' } } }); t.ok(has(DATA.validate('cards').errors, 'curses are unplayable'), 'curses need unplayable'); }
  { const { DATA } = load(); DATA.add('cards', { curse_x: { name: 'C', hero: 'curse', type: 'curse', rarity: 'token', kw: ['unplayable'], fx: [], art: { m: 'skull' }, hand: { turnEnd: [{ op: 'hurt', n: 2 }] } } }); t.eq(DATA.validate('cards').errors.length, 0, 'a curse is valid without cost, up or art.c'); }
  t.ok(has(cardErrs({ cost: 'X', fx: [{ op: 'repeat', n: { per: 'X' }, do: [{ op: 'dmg', n: 4 }] }], up: { cost: 1 } }).errors, 'up.cost turns an X card into a fixed cost'), 'an upgrade cannot strand per X');
  t.eq(cardErrs({ cost: 'X', fx: [{ op: 'repeat', n: { per: 'X' }, do: [{ op: 'dmg', n: 4 }] }], up: { cost: 1, fx: [{ op: 'dmg', n: 9 }] } }).errors.length, 0, 'unless up.fx rewrites the ops');
  { const { DATA } = load(); DATA.add('cards', { kuro_tok_x: { name: 'T', hero: 'hanae', type: 'skill', rarity: 'token', cost: 0, fx: [{ op: 'draw', n: 1 }], art: { m: 'scroll' } } }); t.ok(has(DATA.validate('cards').errors, 'token ids look like hanae_tok_<name>'), 'a token id carries its hero'); }
  { const { DATA } = load(); DATA.add('cards', { hanae_tok_x: { name: 'T', hero: 'hanae', type: 'skill', rarity: 'token', cost: 0, fx: [{ op: 'draw', n: 1 }], art: { m: 'scroll' } } }); t.eq(DATA.validate('cards').errors.length, 0, 'a well named token validates without up or art.c'); }
  { const { DATA } = load(); t.ok(has(DATA.validate('cardz').errors, 'unknown registry "cardz"'), 'a misspelt registry name is an error'); t.ok(has(DATA.validate(['cards', 'nope']).errors, 'unknown registry "nope"'), 'also inside an array'); t.eq(DATA.validate(['cards', 'gems']).errors.length, 0, 'a list of real names is fine'); }
  t.ok(has(cardErrs({ type: 'attack', fx: [{ op: 'block', n: 4 }] }).warnings, 'attack card has no dmg op'), 'warn: attack without dmg');
  t.ok(has(cardErrs({ type: 'skill', slots: ['red'], fx: [{ op: 'block', n: 4 }] }).warnings, 'red slot but no dmg op'), 'warn: red slot without dmg');
  t.ok(has(cardErrs({ type: 'skill', slots: ['blue'], fx: [{ op: 'draw', n: 1 }] }).warnings, 'blue slot but no block'), 'warn: blue slot without block');
  t.ok(has(cardErrs({ type: 'power', slots: ['gold'], fx: [{ op: 'draw', n: 1 }] }).warnings, 'power has no hook or status op'), 'warn: power without hook');
});
t.test('scoped validation: opt.hero and the starter check', () => {
  const { DATA } = load();
  DATA.add('cards', { hanae_bad: cardDef({ fx: [{ op: 'zap' }] }), kuro_bad: cardDef({ hero: 'kuro', fx: [{ op: 'zap' }] }) });
  t.ok(has(DATA.validate('cards', { hero: 'hanae' }).errors, 'card hanae_bad'), 'hanae scope sees hanae');
  t.ok(!has(DATA.validate('cards', { hero: 'hanae' }).errors, 'card kuro_bad'), 'hanae scope ignores kuro');
  t.ok(!has(DATA.validate('cards').errors, 'starter card'), 'lenient mode does not demand starters');
  t.ok(has(DATA.validate('cards', { hero: 'hanae' }).errors, 'starter card "hanae_slash"'), 'hero scope demands that hero\'s starters');
  t.ok(!has(DATA.validate('cards', { hero: 'hanae' }).errors, 'starter card "kuro'), 'but not the others');
  t.ok(has(DATA.validate('cards', { strict: true }).errors, 'starter card "raiga_jab"'), 'strict demands every starter');
});

// ------------------------------------------------------------------ gems and relics
const gemDef = (over) => Object.assign({ name: 'Test Gem', color: 'red', tier: 1, art: { cut: 'round' }, mod: { dmg: 2 } }, over);
t.test('gem probes', () => {
  const errs = (over) => { const { DATA } = load(); DATA.add('gems', { g1: gemDef(over) }); return DATA.validate('gems').errors; };
  t.eq(errs({}).length, 0, 'good gem');
  t.eq(errs({ mod: { cost: -1 }, tier: 3 }).length, 0, 'tier 3 cost gem');
  t.eq(errs({ mod: { status: { s: 'weak', n: 1, tgt: 'enemy' }, fx: [{ op: 'draw', n: 1 }], kw: ['retain'], kwRemove: ['exhaust'], cond: 'front' } }).length, 0, 'rich gem');
  [
    ['dmg string', { mod: { dmg: '2' } }, 'mod.dmg must be a positive whole number'],
    ['dmg zero', { mod: { dmg: 0 } }, 'mod.dmg must be'],
    ['cost positive', { mod: { cost: 1 }, tier: 3 }, 'mod.cost must be a negative'],
    ['cost on tier 1', { mod: { cost: -1 } }, 'tier 3 only'],
    ['status n string', { mod: { status: { s: 'weak', n: 'x' } } }, 'mod.status.n'],
    ['status unknown', { mod: { status: { s: 'zzz', n: 1 } } }, 'mod.status.s unknown status'],
    ['kw bogus', { mod: { kw: ['bogus'] } }, 'unknown keyword "bogus"'],
    ['cond middle', { mod: { cond: 'middle' } }, 'mod.cond must be front or back'],
    ['mod unknown key', { mod: { luck: 3 } }, 'mod.luck unknown'],
    ['empty mod', { mod: {} }, 'mod must be a non-empty object'],
    ['fx per X', { mod: { fx: [{ op: 'dmg', n: { per: 'X' } }] } }, 'per X needs a card with cost'],
    ['bad cut', { art: { cut: 'heart' } }, 'art.cut'],
    ['bad colour', { color: 'pink' }, 'color'],
    ['bad tier', { tier: 4 }, 'tier must be 1..3'],
    ['unknown gem field', { sparkle: 3 }, null],
  ].forEach(([label, over, sub]) => { if (sub === null) return; const e = errs(over); t.ok(has(e, sub), `${label}: expected "${sub}" in [${e.join(' | ')}]`); });
});
const relicDef = (over) => Object.assign({ name: 'Test Charm', rarity: 'common', text: 'A plain test charm.', art: { m: 'lantern', c: 'gold' }, mods: { energy: 1 } }, over);
t.test('relic probes', () => {
  const errs = (over) => { const { DATA } = load(); DATA.add('relics', { r1: relicDef(over) }); return DATA.validate('relics').errors; };
  t.eq(errs({}).length, 0, 'good relic');
  t.eq(errs({ mods: undefined, hooks: [{ on: 'onPaint', every: 3, fx: [{ op: 'ink', n: 1 }] }, { on: 'onFightWon', filter: { tier: 'elite' }, fx: [{ op: 'gold', n: 20 }] }, { on: 'onPlay', filter: { gems: { gte: 1 } }, limit: 1, fx: [{ op: 'block', n: 1, tgt: 'self' }] }, { on: 'onHeroDown', once: true, fx: [{ op: 'revive', pct: 0.25 }] }, { on: 'onKill', filter: { tier: ['normal', 'elite'] }, fx: [{ op: 'gold', n: 2 }] }] }).length, 0, 'rich hooks');
  t.eq(errs({ mods: undefined, rows: { front: { dmgAdd: 1 } } }).length, 0, 'rows only relic');
  ['It jingles when you walk.', 'Ta-da!', 'Who made this?', 'x'.repeat(79) + '.'].forEach((f) => t.eq(errs({ flavor: f }).length, 0, `optional flavor line is accepted: ${f.slice(0, 30)}`));
  t.eq(errs({ mods: { goldMul: 0.25, inkMax: -2, healMul: -0.25 } }).length, 0, 'mods with signs');
  [
    ['maxHpPct gone', { mods: { maxHpPct: 0.1 } }, 'unknown mod "maxHpPct"'],
    ['int not whole', { mods: { energy: 0.5 } }, 'is a count and must be a whole number'],
    ['frac out of range', { mods: { goldMul: 5 } }, 'within -0.9..2'],
    ['zero mod', { mods: { energy: 0 } }, 'non-zero'],
    ['empty mods', { mods: {} }, 'mods is empty'],
    ['nothing', { mods: undefined }, 'needs mods, hooks or rows'],
    ['text long', { text: 'x'.repeat(91) }, 'text over 90 characters'],
    ['flavor long', { flavor: 'x'.repeat(80) + '.' }, 'flavor over 80 characters'],
    ['flavor not a string', { flavor: 7 }, 'flavor must be a non-empty string'],
    ['flavor empty', { flavor: '' }, 'flavor must be a non-empty string'],
    ['flavor not ascii', { flavor: 'Ta' + String.fromCharCode(0x2026) + ' da.' }, 'flavor must be printable ASCII'],
    ['flavor control char', { flavor: 'Ta\tda.' }, 'flavor must be printable ASCII'],
    ['flavor no end mark', { flavor: 'It jingles when you walk' }, 'flavor must end with . ! or ?'],
    ['bad icon', { art: { m: 'nope' } }, 'not in LISTS.relicIcons'],
    ['bad hero', { hero: 'nobody' }, 'hero'],
    ['rows bad row', { mods: undefined, rows: { middle: {} } }, 'rows.middle'],
    ['rows bad field', { mods: undefined, rows: { front: { luck: 1 } } }, 'unknown key "luck"'],
    ['hook filter hero nobody', { mods: undefined, hooks: [{ on: 'onPlay', filter: { hero: 'nobody' }, fx: [{ op: 'draw', n: 1 }] }] }, 'hero "nobody"'],
    ['gems filter on turnStart', { mods: undefined, hooks: [{ on: 'turnStart', filter: { gems: { gte: 1 } }, fx: [{ op: 'draw', n: 1 }] }] }, 'gems is meaningless on turnStart'],
    ['tier filter on onPlay', { mods: undefined, hooks: [{ on: 'onPlay', filter: { tier: 'elite' }, fx: [{ op: 'draw', n: 1 }] }] }, 'tier is meaningless on onPlay'],
    ['fight in run hook', { mods: undefined, hooks: [{ on: 'onPickup', fx: [{ op: 'fight', enemies: ['kappa'] }] }] }, 'fight is only legal in an event outcome'],
    ['run op unknown', { mods: undefined, hooks: [{ on: 'onPickup', fx: [{ op: 'notanop' }] }] }, 'unknown run op "notanop"'],
    ['combat op in run hook', { mods: undefined, hooks: [{ on: 'onPickup', fx: [{ op: 'dmg', n: 1 }] }] }, 'unknown run op "dmg"'],
    ['run op in combat hook', { mods: undefined, hooks: [{ on: 'turnStart', fx: [{ op: 'addRelic', rarity: 'rare' }] }] }, 'op "addRelic" not allowed in hook context'],
    ['hook unknown', { mods: undefined, hooks: [{ on: 'onSneeze', fx: [{ op: 'draw', n: 1 }] }] }, 'unknown hook "onSneeze"'],
    ['hook extra field', { mods: undefined, hooks: [{ on: 'turnStart', owner: 'kuro', fx: [{ op: 'draw', n: 1 }] }] }, 'unknown field "owner"'],
    ['hook block tgt enemy', { mods: undefined, hooks: [{ on: 'turnStart', fx: [{ op: 'block', n: 1, tgt: 'enemy' }] }] }, 'tgt "enemy" not legal for block'],
  ].forEach(([label, over, sub]) => { const e = errs(over); t.ok(has(e, sub), `${label}: expected "${sub}" in [${e.join(' | ')}]`); });
  { const { DATA } = load(); DATA.add('relics', { r1: relicDef({ rarity: 'mythic' }) }); t.ok(has(DATA.validate('relics').errors, 'rarity'), 'bad rarity'); }
});

// ------------------------------------------------------------------ enemies
const enemyDef = (id, over) => {
  const r = D0.rosterById[id];
  return Object.assign({ id, name: r.name, chapter: r.chapter, tier: r.tier, size: r.size, hp: D0.GUIDE.hp[r.chapter][r.tier].slice(), moves: { hit: { name: 'Hit', kind: 'attack', fx: [{ op: 'dmg', n: 5, tgt: 'front' }] }, guard: { name: 'Guard', kind: 'defend', fx: [{ op: 'block', n: 6 }] } }, ai: { seq: ['hit', 'guard'] }, art: { id }, lore: 'A test creature of the tale.', tags: ['spirit'] }, over || {});
};
const enemyErrs = (id, over, opt) => { const { DATA } = load(); DATA.add('enemies', { [id]: enemyDef(id, over) }); return DATA.validate('enemies', opt); };
t.test('a good enemy validates clean', () => {
  const rich = enemyDef('boss_kuzunoha', {
    title: 'The Nine-Tail Ink Fox', start: [{ op: 'status', s: 'thorns', n: 3, tgt: 'self' }], immune: ['stun'],
    moves: {
      hit: { name: 'Claw Rake', kind: 'multi', fx: [{ op: 'dmg', n: 3, hits: 3, tgt: 'random', el: 'ink' }] }, howl: { name: 'Howl', kind: 'buff', fx: [{ op: 'status', s: 'ritual', n: 1, tgt: 'self' }, { op: 'status', s: 'weak', n: 1, tgt: 'both' }] },
      call: { name: 'Call Kodama', kind: 'summon', fx: [{ op: 'summon', enemy: 'paper_kodama', n: 2 }] }, blot: { name: 'Blot', kind: 'debuff', fx: [{ op: 'add', card: 'status_blot', n: 2, to: 'draw', top: true }] },
      steal: { name: 'Snatch', kind: 'debuff', fx: [{ op: 'stealGold', n: 20 }] }, run: { name: 'Bolt', kind: 'flee', fx: [{ op: 'flee' }] }, slam: { name: 'Slam', kind: 'heavy', fx: [{ op: 'dmg', n: { base: 10, per: 'turn', mul: 1, cap: 16 }, tgt: 'back' }, { op: 'swap' }] },
      mend: { name: 'Mend', kind: 'heal', fx: [{ op: 'heal', n: 8, tgt: 'lowestEnemy' }, { op: 'removeStatus', s: 'debuffs' }, { op: 'cond', if: { hpPct: { who: 'self', lt: 0.5 } }, then: [{ op: 'block', n: 5, tgt: 'allEnemies' }] }] },
      dispel: { name: 'Dispel', kind: 'debuff', fx: [{ op: 'removeStatus', s: 'buffs', tgt: 'front' }] },
    },
    ai: { open: ['howl'], weighted: [['hit', 3], ['blot', 1]], noRepeat: 2, rules: [{ if: { turnEvery: [3, 2] }, do: 'slam' }, { if: { minions: { lt: 2 }, alone: false === true }, do: 'call', once: true }, { if: { hpLt: 0.5, heroStatus: { s: 'weak', gte: 1 }, allyHpLt: 0.3, heroHpLt: 0.2 }, do: 'mend' }] },
    phases: [{ at: 0.66, say: 'Enough.', fx: [{ op: 'status', s: 'might', n: 2, tgt: 'self' }], ai: { open: ['call'], seq: ['hit', 'slam'], rules: [{ if: { hpLt: 0.2 }, do: 'mend', once: true }] } }, { at: 0.33, say: 'Now.', ai: { seq: ['slam'] } }],
    hooks: [{ on: 'onDeath', fx: [{ op: 'dmg', n: 4, tgt: 'front' }] }, { on: 'onHeroPlay', filter: { type: 'skill' }, limit: 1, fx: [{ op: 'status', s: 'might', n: 1, tgt: 'self' }] }, { on: 'onAllyDeath', once: true, fx: [{ op: 'block', n: 4, tgt: 'self' }] }],
    tags: ['spirit', 'beast'],
  });
  delete rich.ai.rules[1].if.alone; rich.ai.rules[1].if.alone = true;
  const { DATA } = load(); DATA.add('enemies', { boss_kuzunoha: rich });
  const v = DATA.validate('enemies');
  t.eq(v.errors.length, 0, 'rich boss valid: ' + v.errors.join('; '));
  t.eq(enemyErrs('kappa', {}).errors.length, 0, 'plain kappa');
});
t.test('enemy probes', () => {
  const bad = [
    ['not in roster', 'kappa', { id: 'kappa2', art: { id: 'kappa2' } }, null],
    ['wrong tier', 'kappa', { tier: 'elite' }, 'tier must be normal'],
    ['wrong size', 'kappa', { size: 'xl' }, 'size must be m'],
    ['wrong chapter', 'kappa', { chapter: 2 }, 'chapter must be 1'],
    ['art id', 'kappa', { art: { id: 'tanuki' } }, 'art.id must equal the enemy id'],
    ['no lore', 'kappa', { lore: undefined }, 'lore is required'],
    ['no tags', 'kappa', { tags: [] }, 'tags needs at least one'],
    ['bad tag', 'kappa', { tags: ['not_a_tag'] }, 'tag "not_a_tag"'],
    ['hp junk', 'kappa', { hp: [10, 5] }, 'hp must be [min,max]'],
    ['hp fractional', 'kappa', { hp: [10.5, 12] }, 'hp must be [min,max]'],
    ['ai unknown move', 'kappa', { ai: { seq: ['hit', 'zzz'] } }, 'unknown move "zzz"'],
    ['ai seq and weighted', 'kappa', { ai: { seq: ['hit'], weighted: [['hit', 1]] } }, 'exactly one of seq or weighted'],
    ['ai neither', 'kappa', { ai: { open: ['hit'] } }, 'exactly one of seq or weighted'],
    ['ai weighted bad', 'kappa', { ai: { weighted: [['hit', 0]] } }, 'weight > 0'],
    ['ai noRepeat with seq', 'kappa', { ai: { seq: ['hit'], noRepeat: 2 } }, 'noRepeat only applies to weighted'],
    ['ai rule unknown move', 'kappa', { ai: { seq: ['hit'], rules: [{ if: { hpLt: 0.5 }, do: 'zzz' }] } }, 'unknown move "zzz"'],
    ['ai rule unknown key', 'kappa', { ai: { seq: ['hit'], rules: [{ if: { hpLt: 0.5 }, do: 'hit', twice: true }] } }, 'unknown key "twice"'],
    ['ai turnEvery bad', 'kappa', { ai: { seq: ['hit'], rules: [{ if: { turnEvery: [3, 3] }, do: 'hit' }] } }, 'turnEvery must be'],
    ['ai turnEvery period 1', 'kappa', { ai: { seq: ['hit'], rules: [{ if: { turnEvery: [1, 0] }, do: 'hit' }] } }, 'turnEvery must be'],
    ['ai hpLt 5', 'kappa', { ai: { seq: ['hit'], rules: [{ if: { hpLt: 5 }, do: 'hit' }] } }, 'hpLt must be a fraction'],
    ['ai unknown cond', 'kappa', { ai: { seq: ['hit'], rules: [{ if: { moon: 1 }, do: 'hit' }] } }, 'unknown condition "moon"'],
    ['ai card cond', 'kappa', { ai: { seq: ['hit'], rules: [{ if: { row: 'front' }, do: 'hit' }] } }, 'unknown condition "row" for ai'],
    ['ai heroStatus bad', 'kappa', { ai: { seq: ['hit'], rules: [{ if: { heroStatus: { s: 'zzz' } }, do: 'hit' }] } }, 'heroStatus.s'],
    ['ai minions bad', 'kappa', { ai: { seq: ['hit'], rules: [{ if: { minions: { gt: 2 } }, do: 'hit' }] } }, 'unknown key "gt"'],
    ['phase unsorted', 'kappa', { phases: [{ at: 0.3 }, { at: 0.6 }] }, 'sorted by descending at'],
    ['phase at 1', 'kappa', { phases: [{ at: 1 }] }, 'at must be in (0,1)'],
    ['phase ai unknown move', 'kappa', { phases: [{ at: 0.5, ai: { seq: ['zzz'] } }] }, 'phases[0].ai references unknown move "zzz"'],
    ['phase ai weighted unknown move', 'kappa', { phases: [{ at: 0.5, ai: { weighted: [['zzz', 1]] } }] }, 'unknown move "zzz"'],
    ['phase ai rules unknown move', 'kappa', { phases: [{ at: 0.5, ai: { seq: ['hit'], rules: [{ if: { hpLt: 0.1 }, do: 'zzz' }] } }] }, 'unknown move "zzz"'],
    ['phase unknown key', 'kappa', { phases: [{ at: 0.5, rage: 1 }] }, 'unknown key "rage"'],
    ['phase fx bad', 'kappa', { phases: [{ at: 0.5, fx: [{ op: 'swap', n: 1 }] }] }, 'unknown field "n"'],
    ['kind attack without dmg', 'kappa', { moves: { hit: { name: 'Hit', kind: 'attack', fx: [{ op: 'block', n: 4 }] }, guard: { name: 'G', kind: 'defend', fx: [{ op: 'block', n: 6 }] } } }, 'kind "attack" needs a dmg op'],
    ['kind summon without summon', 'kappa', { moves: { hit: { name: 'Hit', kind: 'summon', fx: [{ op: 'dmg', n: 4, tgt: 'front' }] }, guard: { name: 'G', kind: 'defend', fx: [{ op: 'block', n: 6 }] } } }, 'kind "summon" needs a summon op'],
    ['kind none with fx', 'kappa', { moves: { hit: { name: 'Idle', kind: 'none', fx: [{ op: 'block', n: 4 }] }, guard: { name: 'G', kind: 'defend', fx: [{ op: 'block', n: 6 }] } } }, 'kind "none" has no fx'],
    ['move kind bad', 'kappa', { moves: { hit: { name: 'Hit', kind: 'kick', fx: [] }, guard: { name: 'G', kind: 'defend', fx: [{ op: 'block', n: 6 }] } } }, 'kind "kick"'],
    ['move field junk', 'kappa', { moves: { hit: { name: 'Hit', kind: 'attack', fx: [{ op: 'dmg', n: 4, tgt: 'front' }], power: 3 }, guard: { name: 'G', kind: 'defend', fx: [{ op: 'block', n: 6 }] } } }, 'unknown field "power"'],
    ['enemy block tgt front', 'kappa', { moves: { hit: { name: 'Hit', kind: 'attack', fx: [{ op: 'dmg', n: 4, tgt: 'front' }] }, guard: { name: 'G', kind: 'defend', fx: [{ op: 'block', n: 6, tgt: 'front' }] } } }, 'tgt "front" not legal for block in enemy'],
    ['enemy dmg tgt enemy', 'kappa', { moves: { hit: { name: 'Hit', kind: 'attack', fx: [{ op: 'dmg', n: 4, tgt: 'enemy' }] }, guard: { name: 'G', kind: 'defend', fx: [{ op: 'block', n: 6 }] } } }, 'tgt "enemy" not legal for dmg in enemy'],
    ['enemy V per X', 'kappa', { moves: { hit: { name: 'Hit', kind: 'attack', fx: [{ op: 'dmg', n: { per: 'X' }, tgt: 'front' }] }, guard: { name: 'G', kind: 'defend', fx: [{ op: 'block', n: 6 }] } } }, 'per "X" is not legal in enemy'],
    ['enemy V per hp ok', 'kappa', { moves: { hit: { name: 'Hit', kind: 'attack', fx: [{ op: 'dmg', n: { per: 'hp', who: 'ally' }, tgt: 'front' }] }, guard: { name: 'G', kind: 'defend', fx: [{ op: 'block', n: 6 }] } } }, 'who "ally" is not legal in enemy'],
    ['enemy hook op', 'kappa', { moves: { hit: { name: 'Hit', kind: 'attack', fx: [{ op: 'dmg', n: 4, tgt: 'front' }, { op: 'hook', on: 'turnStart', fx: [] }] }, guard: { name: 'G', kind: 'defend', fx: [{ op: 'block', n: 6 }] } } }, 'op "hook" not allowed in enemy context'],
    ['enemy add to hand', 'kappa', { moves: { hit: { name: 'Hit', kind: 'attack', fx: [{ op: 'dmg', n: 4, tgt: 'front' }, { op: 'add', card: 'status_blot', to: 'hand' }] }, guard: { name: 'G', kind: 'defend', fx: [{ op: 'block', n: 6 }] } } }, 'bad add.to "hand" in enemy context'],
    ['enemy cond card key', 'kappa', { moves: { hit: { name: 'Hit', kind: 'attack', fx: [{ op: 'dmg', n: 4, tgt: 'front' }, { op: 'cond', if: { row: 'front' }, then: [{ op: 'block', n: 1 }] }] }, guard: { name: 'G', kind: 'defend', fx: [{ op: 'block', n: 6 }] } } }, 'unknown condition "row" for enemy'],
    ['enemy summon n', 'kappa', { moves: { hit: { name: 'Hit', kind: 'summon', fx: [{ op: 'summon', enemy: 'leaf_imp', n: 9 }] }, guard: { name: 'G', kind: 'defend', fx: [{ op: 'block', n: 6 }] } } }, 'must be an integer 1..4'],
    ['immune bad', 'kappa', { immune: ['zzz'] }, 'immune: unknown status'],
    ['hook bad on', 'kappa', { hooks: [{ on: 'turnStart', fx: [{ op: 'block', n: 1 }] }] }, 'hook.on "turnStart"'],
    ['hook every', 'kappa', { hooks: [{ on: 'onDeath', every: 2, fx: [{ op: 'block', n: 1 }] }] }, 'enemy hooks have no every'],
    ['hook filter non-type', 'kappa', { hooks: [{ on: 'onHeroPlay', filter: { tier: 'elite' }, fx: [{ op: 'block', n: 1 }] }] }, 'enemy hooks only filter on type'],
    ['dash in lore', 'kappa', { lore: 'A ' + EN + ' dash.' }, 'em or en dash'],
    ['lore long', 'kappa', { lore: 'x'.repeat(300) }, 'lore over 260'],
    ['enemy field junk', 'kappa', { power: 9 }, 'unknown field "power"'],
  ];
  bad.forEach(([label, id, over, sub]) => {
    if (label === 'not in roster') { const { DATA } = load(); DATA.add('enemies', { kappa2: Object.assign(enemyDef('kappa'), { id: 'kappa2', art: { id: 'kappa2' } }) }); t.ok(has(DATA.validate('enemies').errors, 'id is not in the fixed roster'), 'ids outside the roster are rejected'); return; }
    const e = enemyErrs(id, over).errors; t.ok(has(e, sub), `${label}: expected "${sub}" in [${e.join(' | ')}]`);
  });
  t.ok(has(enemyErrs('kappa', { name: 'Fussy Foghorn Deluxe' }).warnings, 'name should be "Fussy Foghorn"'), 'name mismatch warns');
  t.ok(has(enemyErrs('boss_kuzunoha', {}).warnings, 'a boss should have a title'), 'boss without title warns');
  t.ok(has(enemyErrs('kappa', { moves: { hit: { name: 'Hit', kind: 'debuff', fx: [{ op: 'dmg', n: 4, tgt: 'front' }, { op: 'status', s: 'weak', n: 1 }] }, guard: { name: 'G', kind: 'defend', fx: [{ op: 'block', n: 6 }] } } }).warnings, 'should use kind attack'), 'damage under a debuff icon warns');
  const chOnly = enemyErrs('kappa', { tier: 'elite' }, { chapter: 2 });
  t.eq(chOnly.errors.length, 0, 'opt.chapter scopes the enemy check');
});
t.test('encounter probes', () => {
  const groupErrs = (ch, g, strict) => { const { DATA } = load(); DATA.add('enemies', { kappa: enemyDef('kappa'), oni_brute: enemyDef('oni_brute'), boss_kuzunoha: enemyDef('boss_kuzunoha', { title: 'T' }), crow_tengu: enemyDef('crow_tengu'), storm_drone: enemyDef('storm_drone') }); DATA.addEncounters(ch, { normal: [g] }); return DATA.validate('enemies', strict ? { strict: true } : undefined).errors; };
  t.eq(groupErrs(1, { id: 'ch1_ok', enemies: ['kappa', 'crow_tengu'], w: 2, min: 0.3 }).length, 0, 'good group');
  t.ok(has(groupErrs(1, { id: 'bad_id', enemies: ['kappa'], w: 1, min: 0 }), 'group id must start with "ch1_"'), 'prefix');
  t.ok(has(groupErrs(1, { id: 'ch1_x', enemies: ['kappa'], w: 0, min: 0 }), 'w must be > 0'), 'weight');
  t.ok(has(groupErrs(1, { id: 'ch1_x', enemies: ['kappa'], w: 1, min: 1.5 }), 'min must be in 0..1'), 'min');
  t.ok(has(groupErrs(1, { id: 'ch1_x', enemies: ['kappa', 'kappa', 'kappa', 'kappa'], w: 1, min: 0 }), 'enemies must list 1..3'), 'chapter 1 group size');
  t.eq(groupErrs(2, { id: 'ch2_x', enemies: ['storm_drone'], w: 1, min: 0 }).length > 0, true, 'chapter mismatch');
  t.ok(has(groupErrs(1, { id: 'ch1_x', enemies: ['oni_brute'], w: 1, min: 0 }), 'is an elite in a normal group'), 'elite in normal group');
  t.ok(has(groupErrs(1, { id: 'ch1_x', enemies: ['boss_kuzunoha'], w: 1, min: 0 }), 'is a boss'), 'boss in group');
  t.eq(groupErrs(1, { id: 'ch1_x', enemies: ['ghost'], w: 1, min: 0 }).length, 0, 'lenient: unknown enemy id is not checked yet');
  t.ok(has(groupErrs(1, { id: 'ch1_x', enemies: ['ghost'], w: 1, min: 0 }, true), 'unknown enemy "ghost"'), 'strict: unknown enemy id is an error');
  const { DATA } = load(); DATA.addEncounters(1, { boss: 'boss_jorogumo' });
  t.ok(has(DATA.validate('enemies').errors, 'boss must be "boss_kuzunoha"'), 'boss id is fixed per chapter');
});

// ------------------------------------------------------------------ events, meta content
const eventDef = (over) => Object.assign({
  title: 'A Test Fable', text: 'A lantern sways over a fogbound shrine path and something small watches you from the reeds.', art: { scene: 'event' },
  choices: [{ label: 'Leave', out: [{ w: 1, text: 'You walk on.', ops: [] }] }, { label: 'Feed it', cost: '10 gold', req: { gold: 10 }, out: [{ w: 3, text: 'It purrs.', ops: [{ op: 'gold', n: -10 }, { op: 'heal', pct: 0.1 }] }, { w: 1, text: 'It bites.', ops: [{ op: 'hurt', n: 3, who: 'front' }] }] }],
}, over || {});
const evErrs = (over) => { const { DATA } = load(); DATA.add('events', { ev_test: eventDef(over) }); return DATA.validate('events'); };
t.test('event probes', () => {
  const good = evErrs({ once: true, chapters: [1, 2], w: 2, when: { flag: 'x', relic: 'silver_bell', hero: 'kuro' } });
  t.eq(good.errors.length, 0, 'good event ' + good.errors.join('; '));
  t.eq(evErrs({}).warnings.length, 0, 'no warnings on the good event');
  const oc = (ops, extra) => eventDef({ choices: [{ label: 'A', out: [{ w: 1, text: 'x', ops }] }, { label: 'B', out: [{ w: 1, text: 'y', ops: [] }] }] });
  const rich = evErrs(oc([{ op: 'gold', pct: -0.1 }, { op: 'ink', n: 2 }, { op: 'maxHp', n: -2, who: 'lowest' }, { op: 'addCard', pool: 'party', rarity: 'rare', up: true }, { op: 'removeCard' }, { op: 'upgradeCard', random: true, filter: { type: 'attack' } }, { op: 'transformCard', n: 2 }, { op: 'duplicateCard' }, { op: 'addRelic', rarity: 'rare' }, { op: 'addGem', color: 'red', tier: 2 }, { op: 'addBrush', id: 'random' }, { op: 'addCurse' }, { op: 'addCurse', id: 'curse_hex', n: 2 }, { op: 'flag', k: 'fox_spared' }, { op: 'paint', n: 3 }, { op: 'cardReward', rarity: 'uncommon', hero: 'party', n: 3 }, { op: 'fight', enemies: ['kappa', 'kappa'], tier: 'elite', rewards: false, win: [{ op: 'flag', k: 'won' }] }]));
  t.eq(rich.errors.length, 0, 'every run op in its good form: ' + rich.errors.join('; '));
  [
    ['one choice', { choices: [{ label: 'Leave', out: [{ w: 1, text: 'ok', ops: [] }] }] }, 'choices must be 2..4'],
    ['five choices', { choices: [1, 2, 3, 4, 5].map((n) => ({ label: 'c' + n, out: [{ w: 1, text: 'ok', ops: [] }] })) }, 'choices must be 2..4'],
    ['short text', { text: 'Hi.' }, 'text must be 60 to 220'],
    ['long text', { text: 'x'.repeat(230) }, 'text must be 60 to 220'],
    ['bad scene', { art: { scene: 'not_a_scene' } }, 'art.scene must be in LISTS.scenes'],
    ['no art', { art: undefined }, 'art.scene'],
    ['bad chapters', { chapters: [4] }, 'chapters has bad value 4'],
    ['empty chapters', { chapters: [] }, 'chapters must be a non-empty array'],
    ['when unknown', { when: { moon: 1 } }, 'when: unknown key "moon"'],
    ['when hero bad', { when: { hero: 'nobody' } }, 'when.hero'],
    ['w zero', { w: 0 }, 'w must be a number > 0'],
    ['title long', { title: 'x'.repeat(41) }, 'title must be 1 to 40'],
    ['req unknown', { choices: [{ label: 'A', req: { banana: 1 }, out: [{ w: 1, text: 'x', ops: [] }] }, { label: 'B', out: [{ w: 1, text: 'y', ops: [] }] }] }, 'req: unknown key "banana"'],
    ['req hpPct percent', { choices: [{ label: 'A', req: { hpPct: 50 }, out: [{ w: 1, text: 'x', ops: [] }] }, { label: 'B', out: [{ w: 1, text: 'y', ops: [] }] }] }, 'hpPct must be a fraction'],
    ['outcome no text', { choices: [{ label: 'A', out: [{ w: 1, ops: [] }] }, { label: 'B', out: [{ w: 1, text: 'y', ops: [] }] }] }, 'out[0].text'],
    ['outcome weight', { choices: [{ label: 'A', out: [{ w: 0, text: 'x', ops: [] }] }, { label: 'B', out: [{ w: 1, text: 'y', ops: [] }] }] }, 'out[0].w must be a number > 0'],
    ['outcome unknown key', { choices: [{ label: 'A', out: [{ w: 1, text: 'x', ops: [], luck: 1 }] }, { label: 'B', out: [{ w: 1, text: 'y', ops: [] }] }] }, 'unknown key "luck"'],
    ['no out', { choices: [{ label: 'A', out: [] }, { label: 'B', out: [{ w: 1, text: 'y', ops: [] }] }] }, 'choices[0].out'],
  ].forEach(([label, over, sub]) => { const e = evErrs(over).errors; t.ok(has(e, sub), `${label}: expected "${sub}" in [${e.join(' | ')}]`); });
  [
    ['run op unknown', [{ op: 'notanop' }], 'unknown run op "notanop"'],
    ['flag without k', [{ op: 'flag' }], 'flag needs k'],
    ['unknown field', [{ op: 'gold', n: 5, amount: 3 }], 'unknown field "amount"'],
    ['gold n and pct', [{ op: 'gold', n: 5, pct: 0.1 }], 'exactly one of n or pct'],
    ['gold neither', [{ op: 'gold' }], 'exactly one of n or pct'],
    ['heal negative', [{ op: 'heal', n: -3 }], 'positive whole number'],
    ['heal who banana', [{ op: 'heal', n: 3, who: 'banana' }], 'bad who "banana"'],
    ['maxHp zero', [{ op: 'maxHp', n: 0 }], 'non-zero'],
    ['addCard both', [{ op: 'addCard', card: 'a_b', pool: 'party' }], 'exactly one of card or pool'],
    ['addCard bad pool', [{ op: 'addCard', pool: 'nobody' }], 'bad pool'],
    ['addCard rarity with card', [{ op: 'addCard', card: 'a_b', rarity: 'rare' }], 'rarity only applies with pool'],
    ['removeCard bad filter', [{ op: 'removeCard', filter: { rarity: 'rare' } }], 'unknown key "rarity"'],
    ['addRelic neither', [{ op: 'addRelic' }], 'exactly one of id or rarity'],
    ['addRelic bad rarity', [{ op: 'addRelic', rarity: 'mythic' }], 'bad rarity'],
    ['addGem both', [{ op: 'addGem', id: 'g', color: 'red' }], 'id or color/tier, not both'],
    ['addBrush unknown', [{ op: 'addBrush', id: 'broom' }], 'unknown brush "broom"'],
    ['addCurse not curse', [{ op: 'addCurse', id: 'hanae_slash' }], 'curse_* id'],
    ['paint zero', [{ op: 'paint', n: 0 }], 'paint needs n 1..12'],
    ['cardReward bad hero', [{ op: 'cardReward', hero: 'nobody' }], 'bad hero'],
    ['fight tier weird', [{ op: 'fight', enemies: ['kappa'], tier: 'weird' }], 'fight tier must be normal or elite'],
    ['fight neither', [{ op: 'fight' }], 'exactly one of enc or enemies'],
    ['fight both', [{ op: 'fight', enc: 'ch1_a', enemies: ['kappa'] }], 'exactly one of enc or enemies'],
    ['fight five', [{ op: 'fight', enemies: ['kappa', 'kappa', 'kappa', 'kappa', 'kappa'] }], 'enemies must list 1..4'],
    ['fight not last', [{ op: 'fight', enemies: ['kappa'] }, { op: 'gold', n: 5 }], 'fight must be the last op'],
    ['fight win bad op', [{ op: 'fight', enemies: ['kappa'], win: [{ op: 'notanop' }] }], 'unknown run op "notanop"'],
    ['nested fight in win', [{ op: 'fight', enemies: ['kappa'], win: [{ op: 'fight', enemies: ['kappa'] }] }], 'fight is only legal in an event outcome'],
  ].forEach(([label, ops, sub]) => { const oc = eventDef({ choices: [{ label: 'A', out: [{ w: 1, text: 'x', ops }] }, { label: 'B', out: [{ w: 1, text: 'y', ops: [] }] }] }); const e = evErrs(oc).errors; t.ok(has(e, sub), `${label}: expected "${sub}" in [${e.join(' | ')}]`); });
  const unpaid = evErrs({ choices: [{ label: 'A', cost: '30 gold', out: [{ w: 1, text: 'x', ops: [{ op: 'flag', k: 'a' }] }] }, { label: 'B', out: [{ w: 1, text: 'y', ops: [] }] }] });
  t.ok(has(unpaid.warnings, 'shows a cost but no outcome pays it'), 'a cost without a paying op warns');
});
t.test('achievements, trials, tips, lore probes', () => {
  const ach = (a) => { const { DATA } = load(); DATA.add('achievements', { a1: Object.assign({ name: 'A', text: 'Do it.', stat: { k: 'wins', gte: 1 } }, a) }); return DATA.validate('achievements').errors; };
  t.eq(ach({}).length, 0, 'good achievement'); t.eq(ach({ reward: { inkstones: 5 } }).length, 0, 'reward');
  t.ok(has(ach({ stat: { k: 'nope', gte: 1 } }), 'stat {k in LISTS.statKeys'), 'stat key'); t.ok(has(ach({ stat: { k: 'wins', gte: 0 } }), 'gte > 0'), 'gte');
  t.ok(has(ach({ reward: { inkstones: 0 } }), 'reward must be'), 'reward'); t.ok(has(ach({ text: '' }), 'name and text'), 'text');
  const tr = (a) => { const { DATA } = load(); DATA.add('trials', { trial_1: Object.assign({ level: 1, name: 'T', text: 'Harder.', mods: { enemyHp: 0.1 } }, a) }); return DATA.validate('trials').errors; };
  t.eq(tr({}).length, 0, 'good trial');
  t.ok(has(tr({ mods: { maxHpPct: 1 } }), 'unknown mod "maxHpPct"'), 'trial mod'); t.ok(has(tr({ mods: { startInk: -0.5 } }), 'whole number'), 'int mod'); t.ok(has(tr({ mods: { energy: 1 } }), 'unknown mod "energy"'), 'relic-only mod');
  t.ok(has(tr({ level: 11 }), 'level must be 1..10'), 'level'); t.ok(has(tr({ level: 2 }), 'id must be trial_2'), 'id matches level'); t.ok(has(tr({ mods: undefined }), 'must be an object'), 'mods required');
  { const { DATA } = load(); DATA.add('trials', { trial_1: { level: 1, name: 'A', text: 'x', mods: { enemyHp: 0.1 } } }); DATA.trials.trial_9 = { id: 'trial_9', level: 1, name: 'B', text: 'x', mods: { enemyHp: 0.1 } }; t.ok(has(DATA.validate('trials').errors, 'defined twice'), 'duplicate level'); }
  const tips = (arr) => { const { DATA } = load(); DATA.add('tips', arr); return DATA.validate('tips').errors; };
  t.eq(tips(['A tip.']).length, 0, 'good tip'); t.ok(has(tips([42]), 'must be a string'), 'tip type'); t.ok(has(tips(['x'.repeat(120)]), 'over 110'), 'tip length'); t.ok(has(tips(['a ' + EM + ' b']), 'em or en dash'), 'tip dash');
  const barks = (over) => ({ id: 'barks_hanae', lines: Object.assign({ start: ['a', 'b', 'c', 'd', 'e'], hurt: ['a', 'b', 'c', 'd', 'e'], kill: ['a', 'b', 'c', 'd', 'e'], down: ['a', 'b', 'c', 'd', 'e'], win: ['a', 'b', 'c', 'd', 'e'], swap: ['a', 'b', 'c', 'd', 'e'] }, over) });
  const lore = (def) => { const { DATA } = load(); DATA.add('lore', { [def.id]: def }); return DATA.validate('lore').errors; };
  t.eq(lore(barks({})).length, 0, 'good barks'); t.eq(lore({ id: 'intro', title: 'Once', text: 'Once upon a page.' }).length, 0, 'good lore');
  t.ok(has(lore(barks({ hurt: ['a', 'b'] })), 'lines.hurt needs exactly 5'), 'bark count'); t.ok(has(lore(barks({ boo: ['a'] })), 'lines.boo unknown'), 'bark key');
  t.ok(has(lore(barks({ win: ['a', 'b', 'c', 'd', 'x'.repeat(70)] })), 'at most 64'), 'bark length'); t.ok(has(lore({ id: 'barks_nobody', lines: barks({}).lines }), 'barks_<heroId>'), 'bark hero');
  t.ok(has(lore({ id: 'intro', text: 'no title' }), 'title (at most 40'), 'lore title');
});

// ------------------------------------------------------------------ strict cross references
t.test('strict mode checks cross-file references, lenient mode skips them', () => {
  const setup = () => {
    const { DATA } = load();
    DATA.add('cards', {
      hanae_link: cardDef({ fx: [{ op: 'dmg', n: 4 }, { op: 'add', card: 'ghost_card' }], up: { fx: [{ op: 'dmg', n: 6 }] } }),
      curse_x: { name: 'C', hero: 'curse', type: 'curse', rarity: 'token', kw: ['unplayable'], fx: [], art: { m: 'skull' } },
    });
    DATA.add('enemies', { kappa: enemyDef('kappa', { moves: { hit: { name: 'Hit', kind: 'attack', fx: [{ op: 'dmg', n: 4, tgt: 'front' }, { op: 'add', card: 'hanae_link' }] }, call: { name: 'Call', kind: 'summon', fx: [{ op: 'summon', enemy: 'oni_brute' }, { op: 'summon', enemy: 'ghost_enemy' }] } }, ai: { seq: ['hit', 'call'] } }), oni_brute: enemyDef('oni_brute') });
    DATA.add('relics', { r1: relicDef({ mods: undefined, hooks: [{ on: 'onPickup', fx: [{ op: 'addRelic', id: 'ghost_relic' }, { op: 'addGem', id: 'ghost_gem' }, { op: 'addCard', card: 'ghost_card' }, { op: 'addCurse', id: 'curse_ghost' }] }] }) });
    DATA.add('events', { ev1: eventDef({ choices: [{ label: 'A', req: { relic: 'ghost_relic' }, out: [{ w: 1, text: 'x', ops: [{ op: 'fight', enemies: ['ghost_enemy'] }] }] }, { label: 'B', out: [{ w: 1, text: 'y', ops: [{ op: 'fight', enc: 'ch1_ghost' }] }] }] }), ev2: eventDef({ when: { relic: 'ghost_relic' } }) });
    return DATA;
  };
  const lenient = setup().validate(undefined);
  t.eq(lenient.errors.length, 0, 'lenient: no cross-reference errors: ' + lenient.errors.join('; '));
  const strict = setup().validate(undefined, { strict: true }).errors;
  ['add: unknown card "ghost_card"', 'summon: unknown enemy "ghost_enemy"', 'summon: "oni_brute" is not a minion', 'addRelic: unknown relic "ghost_relic"', 'addGem: unknown gem "ghost_gem"',
    'addCard: unknown card "ghost_card"', 'addCurse: unknown curse "curse_ghost"', 'fight: unknown enemy "ghost_enemy"', 'fight: unknown enc "ch1_ghost"', 'req.relic unknown "ghost_relic"', 'when.relic unknown "ghost_relic"',
    'enemy ops may only add curse or status cards', 'starter card "hanae_slash"', 'roster: enemy "tanuki_bandit"', 'fixed: relic "brass_lantern"', 'fixed: curse card "curse_regret"', 'fixed: achievement "ch1_clear"', 'fixed: lore "intro"',
    'boss encounter missing', 'unlock achievement "ch1_clear" not defined'].forEach((sub) => t.ok(has(strict, sub), `strict flags "${sub}"`));
  const only = setup().validate('enemies', { strict: true }).errors;
  t.ok(has(only, 'roster: enemy "tanuki_bandit"') && !has(only, 'req.relic unknown'), 'strict with `only` limits itself to that registry (references run in the full pass)');
});

// ------------------------------------------------------------------ the synthetic universe: good content passes strict validation and every audit
function universe(D) {
  const heroes = D.LISTS.heroIds;
  const pal = D.LISTS.palettes, motifs = D.LISTS.motifs;
  // --- 37 cards per hero
  heroes.forEach((h, hi) => {
    const starters = D.heroes[h].starter.filter((x, i, a) => a.indexOf(x) === i);
    const defs = {};
    let n = 0;
    const mk = (id, rarity, type, over) => {
      const i = n++;
      const isAtk = type === 'attack', isPow = type === 'power';
      const fx = isAtk ? [{ op: 'dmg', n: 6, tgt: 'enemy' }] : isPow ? [{ op: 'hook', on: 'onPlay', filter: { type: 'skill' }, fx: [{ op: 'status', s: D.heroes[h].res, n: 1, tgt: 'self' }] }] : [{ op: 'block', n: 6 }];
      const slots = rarity === 'rare' ? [isAtk ? 'red' : isPow ? 'gold' : 'blue', i % 2 ? 'green' : 'gold'] : rarity === 'uncommon' ? (i % 3 === 0 ? [isPow ? 'gold' : isAtk ? 'red' : 'blue', 'green'] : [isPow ? 'gold' : isAtk ? 'red' : 'blue']) : [isAtk ? 'red' : 'blue'];
      if (rarity === 'common' && !isAtk && i % 4 === 0) slots[0] = 'green';
      if (rarity === 'common' && !isAtk && i % 4 === 1) slots[0] = 'gold';
      const d = { name: id.replace(/_/g, ' '), hero: h, type, rarity, cost: isPow ? 2 : 1, fx, up: { fx: fx.map((o) => Object.assign({}, o, o.n ? { n: o.n + 3 } : {})) }, kw: [], slots, art: { m: motifs[(hi * 40 + i) % motifs.length], c: pal[(i + hi) % pal.length], hero: i % 2 === 0 } };
      if (rarity === 'rare') d.flavor = 'A line worth keeping.';
      if (Array.isArray(over)) over.forEach((f) => f(d)); else if (over) Object.assign(d, over);
      defs[id] = d;
    };
    mk(starters[0], 'starter', 'attack'); mk(starters[1], 'starter', 'skill'); mk(starters[2], 'starter', 'skill');
    for (let i = 0; i < 14; i++) mk(`${h}_c${i}`, 'common', i < 6 ? 'attack' : 'skill', i === 0 ? { cost: 'X', fx: [{ op: 'repeat', n: { per: 'X' }, do: [{ op: 'dmg', n: 4, tgt: 'enemy' }] }], up: { cost: 'X', kw: ['retain'] } } : null);
    for (let i = 0; i < 12; i++) mk(`${h}_u${i}`, 'uncommon', i < 4 ? 'attack' : i < 9 ? 'skill' : 'power', null);
    for (let i = 0; i < 8; i++) mk(`${h}_r${i}`, 'rare', i < 3 ? 'attack' : i < 6 ? 'skill' : 'power', null);
    // quota features spread over commons and uncommons
    ['c1', 'c2', 'c3'].forEach((k) => { const c = defs[`${h}_${k}`]; c.fx = [{ op: 'cond', if: { row: 'front' }, then: c.fx, else: [{ op: 'draw', n: 1 }] }]; c.up = { fx: c.fx }; });
    ['c6', 'c7', 'c8', 'c9'].forEach((k) => { const c = defs[`${h}_${k}`]; c.fx = c.fx.concat([{ op: 'block', n: 4, tgt: 'ally' }]); c.up = { fx: c.fx }; });
    ['c7', 'c10'].forEach((k) => { const c = defs[`${h}_${k}`]; c.fx = c.fx.concat([{ op: 'pick', from: 'hand', n: 1, then: 'discard', optional: true }]); c.up = { fx: c.fx }; });
    ['c2', 'c3', 'c4', 'c5', 'c11'].forEach((k) => { defs[`${h}_${k}`].kw = ['exhaust']; });
    defs[`${h}_r7`].locked = true; defs[`${h}_r6`].locked = true; defs[`${h}_u0`].locked = true;
    D.add('cards', defs);
  });
  // --- curse and status cards
  const junk = {};
  D.FIXED.curses.forEach((id) => { junk[id] = { name: id, hero: 'curse', type: 'curse', rarity: 'token', kw: ['unplayable'], fx: [], art: { m: 'skull' } }; });
  junk.curse_regret.hand = { turnEnd: [{ op: 'hurt', n: 2, tgt: 'front' }] };
  D.FIXED.statusCards.forEach((id) => { junk[id] = { name: id, hero: 'status', type: 'status', rarity: 'token', kw: ['unplayable'], fx: [], art: { m: 'void' } }; });
  D.add('cards', junk);
  // --- enemies: every roster id, with the mechanics each Act must show
  [1, 2, 3].forEach((ch) => {
    const G = D.GUIDE, defs = {};
    const ros = D.ROSTER[ch];
    const norm = ros.filter((r) => r.tier === 'normal'), minions = ros.filter((r) => r.tier === 'minion');
    const hit = (kind, fx) => ({ hit: { name: 'Strike', kind, fx }, guard: { name: 'Guard', kind: 'defend', fx: [{ op: 'block', n: 5 }] } });
    ros.forEach((r) => {
      const idx = norm.indexOf(r);
      let moves = hit('attack', [{ op: 'dmg', n: 4, tgt: 'front' }]);
      let extra = {};
      if (idx === 0 || idx === 1) moves = hit('attack', [{ op: 'dmg', n: 4, tgt: 'back' }]);
      if (idx === 2 || idx === 3) moves.weak = { name: 'Hex', kind: 'debuff', fx: [{ op: 'status', s: 'weak', n: 1, tgt: 'front' }] };
      if (idx === 4) moves.call = { name: 'Call', kind: 'summon', fx: [{ op: 'summon', enemy: minions[0].id }] };
      if (idx === 5) extra.start = [{ op: 'status', s: 'thorns', n: 3, tgt: 'self' }];
      if (idx === 6 || idx === 7) moves = hit('multi', [{ op: 'dmg', n: 2, hits: 3, tgt: 'front' }]);
      if (idx === 8) moves.junk = { name: 'Blot', kind: 'debuff', fx: [{ op: 'add', card: 'status_blot' }] };
      const ai = { seq: Object.keys(moves) };
      if (r.tier === 'elite') ai.rules = [{ if: { hpLt: 0.5 }, do: 'hit' }];
      const d = { id: r.id, name: r.name, chapter: ch, tier: r.tier, size: r.size, hp: G.hp[ch][r.tier].slice(), moves, ai, art: { id: r.id }, lore: 'A creature of the tale.', tags: ['spirit'] };
      if (r.tier === 'boss') {
        d.title = r.title; d.moves = Object.assign({}, moves, { call: { name: 'Call', kind: 'summon', fx: [{ op: 'summon', enemy: minions[0].id }] }, open: { name: 'Roar', kind: 'buff', fx: [{ op: 'status', s: 'ritual', n: 1, tgt: 'self' }] } });
        d.ai = { open: ['open'], seq: ['hit', 'guard', 'call'], rules: [{ if: { turnEvery: [4, 3] }, do: 'call' }] };
        d.phases = (ch === 3 ? [0.66, 0.33] : [0.5]).map((at) => ({ at, say: 'The page turns.', ai: { open: ['call'], seq: ['hit'] } }));
        d.immune = ['stun'];
      }
      Object.assign(d, extra);
      defs[r.id] = d;
    });
    D.add('enemies', defs);
    const mins = [0, 0, 0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.8];
    D.addEncounters(ch, {
      normal: mins.map((min, i) => ({ id: `ch${ch}_n${i}`, enemies: i < 4 ? [norm[i % 10].id] : [norm[i % 10].id, norm[(i + 1) % 10].id].slice(0, ch === 1 ? 2 : 2), w: 1, min })),
      elite: ros.filter((r) => r.tier === 'elite').map((r, i) => ({ id: `ch${ch}_e${i}`, enemies: [r.id], w: 1, min: 0.3 })),
      boss: D.FIXED.bosses[ch],
    });
  });
  // --- relics: 66
  const rar = [['common', 22], ['uncommon', 22], ['rare', 12], ['boss', 6], ['shop', 4]];
  const hooks = D.LISTS.combatHooks.filter((x) => x !== 'combatEnd').concat(D.LISTS.runHooks);
  const relics = {};
  let ri = 0;
  const fixedIds = Object.keys(D.FIXED.relics);
  rar.forEach(([r, count]) => {
    for (let k = 0; k < count; k++) {
      const i = ri++;
      let id = `relic_${i}`;
      const fixed = fixedIds.find((f) => D.FIXED.relics[f] === r && !relics[f]);
      if (fixed) id = fixed;
      const d = { name: 'Relic ' + i, rarity: r, text: 'A small test relic.', art: { m: D.LISTS.relicIcons[i % D.LISTS.relicIcons.length], c: pal[i % pal.length] } };
      if (i < hooks.length) {
        const on = hooks[i];
        const run = D.LISTS.runHooks.indexOf(on) >= 0;
        d.hooks = [{ on, fx: run ? [{ op: 'gold', n: 5 }] : [{ op: 'block', n: 1, tgt: 'self' }] }];
        if (on === 'onFightWon') d.hooks[0].filter = { tier: 'elite' };
      } else if (i < hooks.length + D.LISTS.mods.length) {
        const key = D.LISTS.mods[i - hooks.length];
        d.mods = { [key]: D.LISTS.modKind[key] === 'int' ? 1 : 0.1 };
      } else if (i < hooks.length + D.LISTS.mods.length + 2) d.rows = { front: { dmgAdd: 1 } };
      else if (i < hooks.length + D.LISTS.mods.length + 4) d.hooks = [{ on: 'onPlay', filter: { gems: { gte: 1 } }, limit: 1, fx: [{ op: 'block', n: 1, tgt: 'self' }] }];
      else d.mods = { startBlock: 1 };
      relics[id] = d;
    }
  });
  const ids = Object.keys(relics);
  heroes.forEach((h, hi) => { for (let k = 0; k < 3; k++) relics[ids[40 + hi * 3 + k]].hero = h; });
  [0, 1, 2, 3, 4, 5, 6, 7].forEach((k) => { relics[ids[22 + k]].locked = true; });
  D.add('relics', relics);
  // --- gems: 24
  const gems = {};
  D.LISTS.gemColors.forEach((c, ci) => [1, 1, 2, 2, 3, 3].forEach((tier, k) => {
    const mod = c === 'red' ? { dmg: tier + 1 } : c === 'blue' ? { block: tier + 1 } : c === 'green' ? (tier === 3 ? { cost: -1 } : { draw: 1 }) : { status: { s: D.heroes[D.LISTS.heroIds[k % 4]].res, n: tier, tgt: 'self' } };
    gems[`${c}_gem_${k}`] = { name: `${c} gem ${k}`, color: c, tier, art: { cut: D.LISTS.gemCuts[(ci + k) % 5] }, mod, locked: tier >= 2 && k % 2 === 1 ? true : undefined };
  }));
  D.add('gems', gems);
  // --- events: 40
  const evs = {};
  const pad = (s) => (s + ' The reeds whisper and the lantern light gutters on the water.').slice(0, 200);
  for (let i = 0; i < 40; i++) {
    const ch = i < 30 ? [Math.floor(i / 10) + 1] : undefined;
    const e = { title: 'Fable ' + i, text: pad('A quiet fable number ' + i + ' waits on the page.'), art: { scene: 'event' }, once: i % 5 === 0 ? true : undefined,
      choices: [{ label: 'Walk on', out: [{ w: 1, text: 'Nothing happens.', ops: [] }] }, { label: 'Gamble', out: [{ w: 1, text: 'Luck.', ops: [{ op: 'gold', n: 20 }] }, { w: 1, text: 'Ouch.', ops: [{ op: 'hurt', n: 3 }] }] }] };
    if (ch) e.chapters = ch;
    evs['ev_' + i] = e;
  }
  evs.ev_1.choices.push({ label: 'Ring the bell', req: { relic: 'silver_bell' }, out: [{ w: 1, text: 'It rings true.', ops: [{ op: 'flag', k: 'fox_spared' }] }] });
  evs.ev_2.when = { flag: 'fox_spared' };
  D.add('events', evs);
  // --- meta
  const ach = {};
  const keys = D.LISTS.statKeys;
  D.FIXED.achievements.forEach((id, i) => { ach[id] = { name: id, text: 'Clear a chapter.', stat: { k: `boss${i + 1}Kills`, gte: 1 } }; });
  for (let i = 0; ach && Object.keys(ach).length < 32; i++) ach['ach_' + i] = { name: 'Feat ' + i, text: 'Do the thing.', stat: { k: keys[i % keys.length], gte: i + 1 }, reward: i % 3 === 0 ? { inkstones: 5 } : undefined };
  D.add('achievements', ach);
  const trials = {};
  for (let i = 1; i <= 10; i++) trials['trial_' + i] = { level: i, name: 'Trial ' + i, text: 'A little harder.', mods: i % 2 ? { enemyHp: 0.05 } : { startInk: -1 } };
  D.add('trials', trials);
  D.add('tips', Array.from({ length: 30 }, (_, i) => 'Tip number ' + i + '.'));
  const lore = {};
  D.FIXED.lore.forEach((id) => {
    if (/^barks_/.test(id)) lore[id] = { id, lines: Object.fromEntries(D.FIXED.barkKeys.map((k) => [k, ['One.', 'Two.', 'Three.', 'Four.', 'Five.']])) };
    else lore[id] = { id, title: id, text: 'Once upon a page, the book began to write itself.' };
  });
  D.add('lore', lore);
  return D;
}
t.test('the synthetic universe passes strict validation and every audit', () => {
  const { DATA } = load();
  universe(DATA);
  const v = DATA.validate(undefined, { strict: true });
  t.eq(v.errors.length, 0, 'strict errors: ' + v.errors.slice(0, 8).join('; '));
  t.eq(v.counts.cards, 4 * 37 + 12, 'card count'); t.eq(v.counts.enemies, 51, 'enemy count'); t.eq(v.counts.relics, 66, 'relic count'); t.eq(v.counts.gems, 24, 'gem count');
  t.eq(v.counts.events, 40, 'event count'); t.eq(v.counts.groups, 45, 'group count');
  const a = DATA.audit().filter((x) => x.indexOf('audit') === 0);
  t.eq(a.length, 0, 'audit lines: ' + a.slice(0, 10).join('; '));
  const g = DATA.audit('enemies').filter((x) => x.indexOf('guide') === 0);
  t.eq(g.length, 0, 'guide lines: ' + g.slice(0, 6).join('; '));
  t.eq(DATA.audit('cards', { hero: 'kuro' }).length, 0, 'scoped card audit');
});
t.test('breaking the universe one piece at a time is caught', () => {
  const broken = (fn) => { const { DATA } = load(); universe(DATA); fn(DATA); return DATA; };
  const auditHas = (D, kind, sub, opt) => has(D.audit(kind, opt), sub);
  // strict validation
  let D = broken((d) => { delete d.enemies.kappa; }); t.ok(has(D.validate(undefined, { strict: true }).errors, 'roster: enemy "kappa"'), 'missing roster enemy');
  D = broken((d) => { delete d.relics.silver_bell; }); t.ok(has(D.validate(undefined, { strict: true }).errors, 'relic "silver_bell"'), 'missing fixed relic');
  D = broken((d) => { delete d.lore.intro; }); t.ok(has(D.validate(undefined, { strict: true }).errors, 'lore "intro"'), 'missing lore');
  D = broken((d) => { delete d.achievements.ch2_clear; }); t.ok(has(D.validate(undefined, { strict: true }).errors, 'ch2_clear'), 'missing achievement');
  D = broken((d) => { d.cards.curse_hex.hero = 'status'; }); t.ok(has(D.validate(undefined, { strict: true }).errors, 'must have hero curse'), 'wrong curse hero');
  // audits: cards
  D = broken((d) => { delete d.cards.kuro_c13; }); t.ok(auditHas(D, 'cards', 'audit kuro: need 3/14/12/8'), 'card count');
  D = broken((d) => { Object.values(d.cards).filter((c) => c.hero === 'kuro' && c.type === 'power').forEach((c) => { c.type = 'skill'; }); }); t.ok(auditHas(D, 'cards', 'fewer than 4 powers', { hero: 'kuro' }), 'powers');
  D = broken((d) => { Object.values(d.cards).filter((c) => c.hero === 'suzu').forEach((c) => { if (c.cost === 'X') { c.cost = 1; } }); }); t.ok(auditHas(D, 'cards', 'no X cost card', { hero: 'suzu' }), 'X card');
  D = broken((d) => { Object.values(d.cards).filter((c) => c.hero === 'raiga').forEach((c) => { c.kw = []; }); }); t.ok(auditHas(D, 'cards', 'fewer than 5 cards with keywords', { hero: 'raiga' }), 'keywords');
  D = broken((d) => { d.cards.hanae_c1.art = Object.assign({}, d.cards.hanae_c2.art); }); t.ok(auditHas(D, 'cards', 'same art.m plus art.c pair', { hero: 'hanae' }), 'art pair');
  D = broken((d) => { d.cards.hanae_slash.locked = true; }); t.ok(auditHas(D, 'cards', 'a starter or common is locked', { hero: 'hanae' }), 'locked starter');
  D = broken((d) => { Object.values(d.cards).filter((c) => c.hero === 'hanae' && c.type === 'power').forEach((c) => { c.slots = ['red']; }); }); t.ok(auditHas(D, 'cards', 'every power needs a gold slot', { hero: 'hanae' }), 'power gold slot');
  D = broken((d) => { d.cards.hanae_r0.flavor = undefined; }); t.ok(auditHas(D, 'cards', 'every rare needs a flavor', { hero: 'hanae' }), 'rare flavor');
  D = broken((d) => { d.cards.hanae_c0.slots = ['red', 'red']; }); t.ok(auditHas(D, 'cards', 'slot counts', { hero: 'hanae' }), 'slot counts');
  // audits: enemies
  D = broken((d) => { Object.values(d.enemies).filter((e) => e.chapter === 1).forEach((e) => { Object.values(e.moves).forEach((m) => { m.fx = m.fx.filter((o) => o.op !== 'summon'); if (m.kind === 'summon') { m.kind = 'defend'; m.fx = [{ op: 'block', n: 1 }]; } }); }); });
  t.ok(auditHas(D, 'enemies', 'ch1: no summoner', { chapter: 1 }), 'no summoner');
  D = broken((d) => { d.encounters[2].normal.pop(); }); t.ok(auditHas(D, 'enemies', 'need at least 12 normal groups', { chapter: 2 }), 'group count');
  D = broken((d) => { d.enemies.boss_editor.phases.pop(); }); t.ok(auditHas(D, 'enemies', 'boss_editor: needs exactly 2 phases entries', { chapter: 3 }), 'editor phases');
  D = broken((d) => { d.enemies.oni_brute.ai.rules = undefined; }); t.ok(auditHas(D, 'enemies', 'oni_brute: an elite needs a rules entry or a phase', { chapter: 1 }), 'elite rules');
  D = broken((d) => { d.enemies.kappa.hp = [200, 300]; }); t.ok(auditHas(D, 'enemies', 'guide kappa: hp 200 to 300 outside 16 to 38', { chapter: 1 }), 'guide hp');
  D = broken((d) => { d.encounters[1].normal.forEach((g) => { g.min = 0.5; }); }); t.ok(auditHas(D, 'enemies', 'group min values must spread', { chapter: 1 }), 'min spread');
  // audits: content
  D = broken((d) => { delete d.relics.relic_30; }); t.ok(auditHas(D, 'relics', 'need exactly'), 'relic count');
  D = broken((d) => { Object.values(d.relics).forEach((r) => { r.locked = true; }); }); t.ok(auditHas(D, 'relics', 'more than 30 percent locked'), 'relic locked cap');
  D = broken((d) => { delete d.gems.red_gem_5; }); t.ok(auditHas(D, 'gems', 'need exactly 24 gems'), 'gem count');
  D = broken((d) => { delete d.events.ev_1; }); t.ok(auditHas(D, 'events', 'silver_bell'), 'silver_bell path');
  D = broken((d) => { Object.values(d.events).forEach((e) => { e.once = true; }); }); t.ok(auditHas(D, 'events', 'more than 60 percent'), 'once cap');
  D = broken((d) => { d.events.ev_5.choices = [{ label: 'Risk', cost: '5 gold', out: [{ w: 1, text: 'x', ops: [{ op: 'hurt', n: 2 }] }] }, { label: 'Risk more', out: [{ w: 1, text: 'y', ops: [{ op: 'addCurse' }] }] }]; }); t.ok(auditHas(D, 'events', 'ev_5: needs at least one safe choice'), 'safe choice');
  D = broken((d) => { d.tips.pop(); }); t.ok(auditHas(D, 'meta', 'at least 30 tips'), 'tips');
  D = broken((d) => { delete d.achievements.ach_5; }); t.ok(auditHas(D, 'meta', 'exactly 32 achievements'), 'achievements');
});

t.test('validate and audit never throw on junk (deterministic mutation fuzz)', () => {
  const { DATA: D, U } = load();
  universe(D);
  const REGS = ['cards', 'gems', 'relics', 'enemies', 'events', 'achievements', 'trials', 'lore'];
  const snap = {}; REGS.forEach((k) => { snap[k] = U.deepCopy(D[k]); });
  const tips = U.deepCopy(D.tips), enc = U.deepCopy(D.encounters);
  const restore = () => {
    REGS.forEach((k) => { Object.keys(D[k]).forEach((x) => delete D[k][x]); Object.assign(D[k], U.deepCopy(snap[k])); });
    D.tips.length = 0; D.tips.push(...U.deepCopy(tips));
    [1, 2, 3].forEach((c) => { D.encounters[c].normal = U.deepCopy(enc[c].normal); D.encounters[c].elite = U.deepCopy(enc[c].elite); D.encounters[c].boss = enc[c].boss; });
  };
  const rng = U.rng(20260928);
  const junk = () => rng.pick([null, 0, -1, 1.5, NaN, Infinity, '', 'x', 'front', true, false, [], [1, 2], {}, { op: 'dmg' }, { op: 'cond' }, [null], [{}], { per: 'X' }, 'debuffs', 'onPlay', [[]], { s: 1 }]);
  const paths = (o, p, out) => { if (o && typeof o === 'object') { out.push(p); Object.keys(o).forEach((k) => paths(o[k], p.concat(k), out)); } return out; };
  let thrown = 0, first = '';
  const run = (label) => { try { D.validate(undefined, { strict: true }); D.validate(label); D.audit(); } catch (e) { thrown++; if (!first) first = label + ': ' + String(e.stack).split('\n').slice(0, 2).join(' | '); } };
  for (let it = 0; it < 500; it++) {
    const reg = rng.pick(REGS), id = rng.pick(Object.keys(D[reg]));
    if (rng.chance(0.08)) { D[reg][id] = junk(); run(reg); restore(); continue; }
    if (rng.chance(0.05)) { const g = D.encounters[rng.pick([1, 2, 3])][rng.pick(['normal', 'elite'])]; if (g.length) rng.pick(g)[rng.pick(['id', 'enemies', 'w', 'min'])] = junk(); }
    if (rng.chance(0.05)) D.tips[rng.int(0, D.tips.length - 1)] = junk();
    const ps = paths(D[reg][id], [], []).filter((p) => p.length > 0);
    for (let m = rng.int(1, 3); m > 0 && ps.length; m--) {
      const p = rng.pick(ps); let o = D[reg][id];
      for (let i = 0; i < p.length - 1; i++) if (o && typeof o === 'object') o = o[p[i]];
      if (o && typeof o === 'object') { if (rng.chance(0.25)) delete o[p[p.length - 1]]; else o[p[p.length - 1]] = junk(); }
    }
    run(reg); restore();
  }
  t.eq(thrown, 0, 'validate or audit threw on junk: ' + first);
  restore();
  t.eq(D.validate(undefined, { strict: true }).errors.length, 0, 'the universe is intact after the fuzz');
});

t.test('sparse arrays (deleted elements) do not crash validate or audit', () => {
  const { DATA: D } = load();
  universe(D);
  const holey = new Array(3); holey[1] = { at: 0.5, say: 'x' };
  D.enemies.boss_kuzunoha.phases = holey;
  D.enemies.kappa.moves.hit.fx = new Array(2);
  D.events.ev_3.choices = new Array(3);
  D.cards.hanae_c1.fx = new Array(2);
  let threw = '';
  try { D.validate(undefined, { strict: true }); D.audit(); } catch (e) { threw = String(e.stack).split('\n').slice(0, 2).join(' | '); }
  t.eq(threw, '', 'no throw on holey arrays');
});

// ------------------------------------------------------------------ the docs agree with data.js
t.test('CONTENT_SPEC roster and number tables equal the machine copy', () => {
  const md = read('CONTENT_SPEC.md');
  const rows = [...md.matchAll(/^\| `([a-z_0-9]+)` \| ([^|]+) \| (minion|normal|elite|boss) \| (s|m|l|xl) \| ([^|]+) \|$/gm)].map((m) => ({ id: m[1], name: m[2].trim(), tier: m[3], size: m[4], role: m[5].trim() }));
  const want = [].concat(D0.ROSTER[1], D0.ROSTER[2], D0.ROSTER[3]);
  t.eq(rows.length, 3 * 17, 'roster rows in CONTENT_SPEC');
  want.forEach((r, i) => t.ok(rows[i] && rows[i].id === r.id && rows[i].name === r.name && rows[i].tier === r.tier && rows[i].size === r.size && rows[i].role === r.role, `roster row ${r.id}`));
  [1, 2, 3].forEach((ch) => {
    const c = D0.ROSTER[ch];
    t.deep([10, 3, 3, 1], ['normal', 'elite', 'minion', 'boss'].map((k) => c.filter((r) => r.tier === k).length), `chapter ${ch} counts`);
    c.forEach((r) => { t.ok(/^[a-z][a-z0-9_]*$/.test(r.id), `snake id ${r.id}`); t.ok(r.role.length > 30 && r.role.length <= 130, `role length ${r.id}`); t.ok(r.tier === 'boss' ? r.size === 'xl' : r.tier === 'elite' ? r.size === 'l' : r.tier === 'minion' ? r.size === 's' : ['s', 'm', 'l'].indexOf(r.size) >= 0, `size class ${r.id}`); });
    t.eq(c.find((r) => r.tier === 'boss').id, D0.FIXED.bosses[ch], `boss id chapter ${ch}`);
  });
  t.eq(new Set(want.map((r) => r.id)).size, 51, 'roster ids are unique');
  const G = D0.GUIDE;
  const tableRows = [...md.matchAll(/^\| ([123]) \| (.+) \|$/gm)].filter((m) => m[2].indexOf('to') >= 0).map((m) => ({ ch: +m[1], nums: (m[0].match(/\d+/g) || []).map(Number).slice(1) }));
  t.eq(tableRows.length, 3, 'number table rows');
  tableRows.forEach((r) => {
    const ch = r.ch;
    const w = [].concat(G.hp[ch].minion, G.hit[ch].minion, G.hp[ch].normal, G.hit[ch].normal, G.heavy[ch].normal, G.hp[ch].elite, G.hit[ch].elite, G.hp[ch].boss, G.hit[ch].boss, G.heavy[ch].boss, G.round[ch]);
    t.deep(r.nums, w, `number table chapter ${ch} equals DATA.GUIDE`);
  });
  ['brass_lantern', 'fox_mask', 'silver_bell', 'jade_key'].forEach((id) => t.ok(md.includes('`' + id + '`') && D0.FIXED.relics[id], `fixed relic ${id} documented`));
  D0.FIXED.curses.concat(D0.FIXED.statusCards, D0.FIXED.achievements).forEach((id) => t.ok(md.includes('`' + id + '`'), `fixed id ${id} documented`));
  D0.FIXED.lore.filter((x) => !/^hero_|^barks_/.test(x)).forEach((id) => t.ok(md.includes('`' + id + '`'), `lore id ${id} documented`));
  t.ok(/exactly \*\*66\*\*/.test(md) && /at least \*\*40\*\*/.test(md) && /\*\*24\*\*/.test(md) && /\*\*32\*\*/.test(md), 'quotas quoted in CONTENT_SPEC');
  const q = D0.QUOTA;
  t.eq(q.relics.common + q.relics.uncommon + q.relics.rare + q.relics.boss + q.relics.shop, 66, 'relic quota sums to 66');
  t.eq(q.events.perChapter * 3 + q.events.any, 40, 'event quota sums to 40');
  t.eq(q.gems.perColor * 4, 24, 'gem quota'); t.eq(q.achievements, 32, 'achievement quota');
});
t.test('roster roles that call minions name a minion of their own Act', () => {
  [1, 2, 3].forEach((ch) => {
    const minions = D0.ROSTER[ch].filter((r) => r.tier === 'minion').map((r) => r.name.toLowerCase());
    D0.ROSTER[ch].filter((r) => /\bcalls?\b/i.test(r.role)).forEach((r) => {
      const role = r.role.toLowerCase();
      t.ok(minions.some((m) => role.includes(m) || role.includes(m + 's') || role.includes(m.replace(/ /g, '') + 's')), `${r.id} calls a minion that exists in chapter ${ch} (${minions.join(', ')}): ${r.role}`);
    });
  });
  t.ok(D0.ROSTER[2].find((r) => r.id === 'drowned_general').role.includes('Grumble Cloud'), 'the comment troll (drowned_general) calls Grumble Clouds, the Act II minion lantern_wisp');
});
t.test('every idiom printed in CONTENT_SPEC 3.1 is valid in its context', () => {
  const md = read('CONTENT_SPEC.md').replace(/\s+/g, ' ');
  const card = [
    "{ op: 'hook', on: 'turnStart', once: true, fx: [{ op: 'energy', n: 2 }] }",
    "[{ op: 'status', s: 'might', n: 3, tgt: 'self' }, { op: 'hook', on: 'turnEnd', once: true, fx: [{ op: 'status', s: 'might', n: -3, tgt: 'self' }] }]",
    "{ op: 'hook', on: 'onPlay', filter: { type: 'skill' }, fx: [{ op: 'status', s: 'sumi', n: 1, tgt: 'self' }] }",
    "{ op: 'hook', on: 'onExhaust', fx: [{ op: 'block', n: 3, tgt: 'self' }] }",
    "{ op: 'hook', on: 'turnStart', fx: [{ op: 'status', s: 'thorns', n: 1, tgt: 'self' }] }",
    "{ op: 'dmg', n: { per: 'status', s: 'bloom', mul: 4, upTo: 4 }, consume: { s: 'bloom', upTo: 4 } }",
    "{ op: 'cond', if: { status: { s: 'sumi', gte: 3 } }, then: [{ op: 'removeStatus', s: 'sumi', n: 3, tgt: 'self' }, { op: 'dmg', n: 10, tgt: 'all' }] }",
    "{ op: 'dmg', n: { per: 'block' }, consume: 'block' }",
    "[{ op: 'dmg', n: 6, tgt: 'enemy' }, { op: 'dmg', n: 3, tgt: 'others' }]",
    "{ op: 'dmg', n: { per: 'debuffs', mul: 4 }, tgt: 'enemy' }",
    "{ op: 'block', n: { per: 'block', who: 'ally' }, tgt: 'self' }",
    "{ op: 'heal', n: { per: 'missingHp', who: 'ally' }, tgt: 'ally' }",
    "{ op: 'revive', n: 10 }",
  ];
  card.forEach((src) => { t.ok(md.includes(src.replace(/\s+/g, ' ')), `idiom is printed: ${src.slice(0, 50)}`); const v = new Function('return ' + src)(); const e = fxErrs(Array.isArray(v) ? v : [v]); t.eq(e.length, 0, `card idiom valid: ${src.slice(0, 50)} :: ${e.join('; ')}`); });
  const relicHooks = [
    "{ on: 'onHeroDown', once: true, fx: [{ op: 'revive', pct: 0.25 }] }",
    "{ on: 'onPaint', every: 3, fx: [{ op: 'ink', n: 1 }] }",
    "{ on: 'onPlay', filter: { gems: { gte: 1 } }, limit: 1, fx: [{ op: 'block', n: 1, tgt: 'self' }] }",
    "{ on: 'onFightWon', filter: { tier: 'elite' }, fx: [{ op: 'gold', n: 20 }] }",
  ];
  relicHooks.forEach((src) => { t.ok(md.includes(src.replace(/\s+/g, ' ')), `relic idiom is printed: ${src.slice(0, 40)}`); const { DATA } = load(); DATA.add('relics', { r1: relicDef({ mods: undefined, hooks: [new Function('return ' + src)()] }) }); const e = DATA.validate('relics').errors; t.eq(e.length, 0, `relic idiom valid: ${src.slice(0, 40)} :: ${e.join('; ')}`); });
  t.ok(md.includes('rows: { front: { dmgAdd: 1 } }'), 'rows idiom is printed');
  const enemyIdioms = [
    ["hooks: [{ on: 'onDeath', fx: [{ op: 'dmg', n: 4, tgt: 'front' }] }]", (v) => ({ hooks: v })],
    ["{ op: 'removeStatus', s: 'buffs', tgt: 'front' }", (v) => ({ moves: { hit: { name: 'H', kind: 'buff', fx: [v] }, guard: { name: 'G', kind: 'defend', fx: [{ op: 'block', n: 6 }] } } })],
    ["[{ op: 'stealGold', n: 20 }, { op: 'flee' }]", (v) => ({ moves: { hit: { name: 'H', kind: 'special', fx: v }, guard: { name: 'G', kind: 'defend', fx: [{ op: 'block', n: 6 }] } } })],
  ];
  enemyIdioms.forEach(([src, wrap]) => { t.ok(md.includes(src.replace(/\s+/g, ' ')), `enemy idiom is printed: ${src.slice(0, 40)}`); const body = src.replace(/^hooks: /, ''); const v = new Function('return ' + body)(); const e = enemyErrs('kappa', wrap(v)).errors; t.eq(e.length, 0, `enemy idiom valid: ${src.slice(0, 40)} :: ${e.join('; ')}`); });
});
t.test('DESIGN.md documents every op, status, hook, event and bus name in data.js', () => {
  const md = read('DESIGN.md');
  const tick = (w) => md.includes('`' + w + '`');
  L.cardOps.concat(L.enemyOps, L.runOps).forEach((o) => t.ok(tick(o), `DESIGN mentions op \`${o}\``));
  Object.keys(D0.statuses).forEach((s) => t.ok(md.includes(s), `DESIGN mentions status ${s}`));
  L.combatHooks.concat(L.runHooks, L.enemyHooks).forEach((h) => t.ok(md.includes(h), `DESIGN mentions hook ${h}`));
  L.combatEvents.forEach((e) => t.ok(new RegExp('(^|[\\s(`])' + e + '[\\s`{]', 'm').test(md), `DESIGN documents combat event ${e}`));
  L.busEvents.forEach((e) => t.ok(md.includes("'" + e + "'"), `DESIGN documents bus event ${e}`));
  L.tutAnchors.forEach((a) => t.ok(md.includes(a), `DESIGN documents anchor ${a}`));
  L.screens.forEach((s) => t.ok(md.includes('`' + s), `DESIGN documents screen ${s}`));
  L.overlays.forEach((s) => t.ok(md.includes('`' + s), `DESIGN documents overlay ${s}`));
  L.libraryTabs.forEach((s) => t.ok(new RegExp(s, 'i').test(md), `DESIGN documents library tab ${s}`));
  L.fx.forEach((f) => t.ok(md.includes(f), `DESIGN documents fx ${f}`));
  L.mapKinds.forEach((f) => t.ok(md.includes(f), `DESIGN documents map kind ${f}`));
  L.iconKinds.forEach((k) => t.ok(md.includes('`' + k + '`') || md.includes(k + ' = '), `DESIGN documents icon kind ${k}`));
  Object.keys(L.cardSizes).forEach((k) => t.ok(md.includes('`' + k + '`'), `DESIGN documents card size ${k}`));
  Object.keys(D0.SETTINGS).forEach((k) => t.ok(md.includes(k), `DESIGN documents setting ${k}`));
  L.elements.forEach((e) => t.ok(md.includes(e), `DESIGN documents element ${e}`));
  L.expressions.forEach((e) => t.ok(md.includes(e) || read('ART_BIBLE.md').includes(e), `docs document expression ${e}`));
  ['foldMods', 'trialDeltas', 'modsFor', 'rowFor', 'tileCount', 'cleanSetting', 'walkOps', 'isUnlocked', 'rewardPool', 'relicPool', 'gemPool', 'eligibleGroups', 'groupById', 'isDebuff', 'isBuff', 'audit', 'validate'].forEach((f) => { t.ok(md.includes(f), `DESIGN mentions DATA.${f}`); t.eq(typeof D0[f], 'function', `DATA.${f} exists`); });
  const roomForRules = ['once per enemy attack hit on a hero, even when fully blocked', 'Hook damage has no attacker', 'RUN.finishNode', 'RUN.resolvePending', 'RUN.checkStranded', 'RUN.take', 'RUN.dailyHeroes', 'META.unlockedSet', 'META.check(R?)',
    // rules the final gate settled (each was a contradiction or a gap): keep them in the text
    'a lane with no living unit', "cause:'hit'|'turn'|'consume'", 'every boss is always immune to `stun`', 'UI.announce(text)', 'a free Cut Gems button', 'chapter 3 boss win -> reward -> victory',
    '`damageTaken` and `hitsTaken` counters', '`once` and `every` cannot be combined', 'must be a `minion` tier id', 'Cut Gems (any number of socket or replace operations)', '16 + dr/2', 'window.location'];
  roomForRules.forEach((s) => t.ok(md.includes(s), `DESIGN states: ${s}`));
  t.ok(!/maxHpPct|setIntentsVisible|RUN\.unsocket\(/.test(md), 'removed names are gone from DESIGN');
  t.ok(!new RegExp('[' + EM + EN + ']').test(md), 'no dashes');
});
t.test('ART_BIBLE, DESIGN and CONTENT_SPEC agree on shared facts', () => {
  const art = read('ART_BIBLE.md'), design = read('DESIGN.md'), spec = read('CONTENT_SPEC.md');
  t.ok(!/58 motifs/.test(art) && /currently 59/.test(art), 'motif count');
  L.fx.forEach((f) => t.ok(art.includes(f), `ART_BIBLE mentions fx ${f}`));
  t.ok(/FIXED ROSTER/.test(art) && /CONTENT_SPEC.md/.test(art), 'ART_BIBLE points at the roster');
  t.ok(!/META\.get\('musicVol'\)/.test(art) && /never references `META`/.test(art), 'audio does not read META');
  t.ok(/opts\.phase/.test(art) && /0 = opening form|`opts.phase` 0, 1, 2/.test(art), 'phase index convention');
  ['s', 'm', 'l', 'xl'].forEach((k) => t.ok(new RegExp('`' + k + '` ' + L.sizeHeight[k]).test(art), `ART_BIBLE height for size ${k}`));
  t.ok(design.includes('CONTENT_SPEC.md') && spec.includes('DESIGN.md'), 'documents reference each other');
  t.ok(!/user-scalable/.test(read('index.html')), 'viewport does not block zoom');
  ['hp', 'hit'].forEach(() => t.ok(spec.includes('DATA.GUIDE'), 'CONTENT_SPEC names the machine copy'));
});
t.test('index.html: layers, boot watchdog and load order', () => {
  const html = read('index.html');
  ['view', 'screens', 'overlays', 'over', 'tips', 'toasts'].forEach((id) => t.ok(new RegExp('id="' + id + '"').test(html), `#${id} exists`));
  const order = ['id="view"', 'id="screens"', 'id="overlays"', 'id="over"', 'id="tips"', 'id="toasts"'].map((s) => html.indexOf(s));
  t.deep(order, order.slice().sort((a, b) => a - b), 'layers are stacked in the documented order');
  t.ok(html.indexOf('id="boot-css"') < html.indexOf('css/base.css'), 'boot-css is above the stylesheet links');
  t.ok(html.indexOf('window.__errors') > 0 && html.indexOf('window.__errors') < html.indexOf('src="js/util.js"'), 'watchdog script runs before the game scripts');
  t.ok(html.indexOf('window.__errors') < html.indexOf('<link rel="stylesheet"'), 'the watchdog sits in the head above the stylesheet links, so it also records a missing stylesheet');
  t.ok(/id="sr"[^>]*aria-live="polite"/.test(html), '#sr is the visually hidden live region (UI.announce)');
  t.ok(/window\.__booted/.test(html) && /Try again/.test(html) && /6000/.test(html), 'watchdog waits for __booted and offers Try again');
  const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  t.eq(new Set(scripts).size, scripts.length, 'no script listed twice'); t.eq(scripts[0], 'js/util.js', 'util first'); t.eq(scripts[1], 'js/data.js', 'data second'); t.eq(scripts[scripts.length - 1], 'js/main.js', 'main last');
  const need = ['data_text', 'data_cards_hanae', 'data_cards_kuro', 'data_cards_suzu', 'data_cards_raiga', 'data_cards_shared', 'data_enemies_1', 'data_enemies_2', 'data_enemies_3', 'data_relics', 'data_gems', 'data_events', 'data_meta', 'data_samples', 'art', 'art_cast_kit', 'art_cast', 'art_enemies_1', 'art_enemies_2', 'art_enemies_3', 'art_cards', 'art_icons', 'art_scenes', 'art_map', 'art_fx', 'audio', 'combat', 'map', 'run', 'meta', 'ui', 'scene', 'screen_menu', 'screen_map', 'screen_combat', 'screen_node', 'screen_end', 'tutorial', 'main'];
  need.forEach((n) => t.ok(scripts.indexOf(`js/${n}.js`) > 1, `${n}.js is listed`));
  const design = read('DESIGN.md');
  // P8: the owners' sample manifest is a data file: after the last content file, before the first art file, and named in DESIGN section 3
  t.ok(scripts.indexOf('js/data_samples.js') === scripts.indexOf('js/data_meta.js') + 1 && scripts.indexOf('js/data_samples.js') + 1 === scripts.indexOf('js/art.js'), 'data_samples.js sits right after data_meta.js and right before art.js');
  t.ok(/^js\/data_samples\.js\s/m.test(design), 'DESIGN section 3 lists js/data_samples.js');
  scripts.forEach((s) => t.ok(design.includes(s.replace(/^js\//, '')) || design.includes(s.replace(/^js\//, '').replace(/\.js$/, '')), `DESIGN lists ${s}`));
});
t.test('util: rng streams and date key', () => {
  const { U } = boot0;
  t.ok(U.rng(0)() !== U.rng(1)(), 'seed 0 and seed 1 differ');
  t.eq(U.rng(5)(), U.rng(5)(), 'deterministic'); t.eq(U.dateKey(new Date(2026, 8, 28)), 20260928, 'dateKey');
  const seen = new Set(); for (let s = 0; s < 500; s++) seen.add(U.rng(s)()); t.eq(seen.size, 500, '500 seeds, 500 first values');
  t.ok(U.hash('a', 'b') !== U.hash('b', 'a') && U.hash(1, 'x') === U.hash(1, 'x'), 'hash order matters and is stable');
});
t.done();
