'use strict';
// ===================== DATA: cards, enemies, grafts, events =====================
const BC = {}; // battle cards
const NC = {}; // negotiation cards
function bc(id, name, cost, rarity, cls, art, d, up) {
  const o = Object.assign({ id, name, cost, rarity, cls, art, kind: 'b', upg: up || {} }, d);
  o.type = d.type || (d.pwr ? 'pwr' : d.dmg || d.special === 'detonate' || d.special === 'bodyslam' ? 'atk' : 'skl');
  BC[id] = o;
}
function nc(id, name, cost, rarity, cls, art, d, up) {
  const o = Object.assign({ id, name, cost, rarity, cls, art, kind: 'n', type: 'n', upg: up || {} }, d); NC[id] = o;
}
// ----- shared / any -----
bc('strike', 'Strike', 1, 'starter', 'any', 'sword', { dmg: 6 }, { dmg: 9 });
bc('guard', 'Guard', 1, 'starter', 'any', 'shield', { blk: 5 }, { blk: 8 });
bc('bandage', 'Bandage', 1, 'common', 'any', 'heart', { heal: 6, exhaust: 1 }, { heal: 10 });
bc('adrenal', 'Adrenal Shot', 0, 'uncommon', 'any', 'bolt', { ap: 1, draw: 1, exhaust: 1 }, { draw: 2 });
bc('molotov', 'Molotov', 2, 'uncommon', 'any', 'fire', { dmg: 7, all: 1, bleed: 2 }, { dmg: 10, bleed: 3 });
bc('cleaver', 'Cleaver', 2, 'common', 'any', 'axe', { dmg: 13 }, { dmg: 18 });
bc('pocket_sand', 'Pocket Sand', 1, 'common', 'any', 'dust', { weak: 2, draw: 1 }, { weak: 3 });
bc('scrap_armor', 'Scrap Armor', 2, 'uncommon', 'any', 'shield', { blk: 9, thorns: 2 }, { blk: 12, thorns: 3 });
bc('rotgut', 'Rotgut', 0, 'uncommon', 'any', 'bottle', { str: 2, hurt: 3, exhaust: 1 }, { str: 3 });
bc('regret', 'Regret', 0, 'curse', 'curse', 'curse', { type: 'curse', unplayable: 1, text: 'Unplayable. A bad decision, in your pocket.' });
// ----- Rook: blades & bleeding -----
bc('quick_stab', 'Quick Stab', 0, 'common', 'rook', 'dagger', { dmg: 4, bleed: 1 }, { dmg: 6, bleed: 2 });
bc('deep_cut', 'Deep Cut', 1, 'common', 'rook', 'drop', { dmg: 5, bleed: 3 }, { dmg: 6, bleed: 5 });
bc('flurry', 'Flurry', 1, 'common', 'rook', 'sword', { dmg: 3, hits: 3 }, { dmg: 3, hits: 4 });
bc('sidestep', 'Sidestep', 1, 'common', 'rook', 'boot', { blk: 6, draw: 1 }, { blk: 8, draw: 1 });
bc('smoke_bomb', 'Smoke Bomb', 1, 'uncommon', 'rook', 'smoke', { weak: 2, blk: 4, all: 1, type: 'skl' }, { weak: 3, blk: 6 });
bc('rend', 'Rend', 1, 'uncommon', 'rook', 'drop', { special: 'detonate', mult: 2, tg: 'enemy' }, { mult: 3 });
bc('hemorrhage', 'Hemorrhage', 2, 'rare', 'rook', 'drop', { dmg: 6, all: 1, bleed: 4 }, { dmg: 8, bleed: 5 });
bc('whetted', 'Whetted Edge', 1, 'rare', 'rook', 'dagger', { pwr: 1, str: 2 }, { str: 3 });
// ----- Mourn: strength & block -----
bc('headbutt', 'Headbutt', 1, 'common', 'mourn', 'fist', { dmg: 7, vuln: 2 }, { dmg: 9, vuln: 3 });
bc('brace', 'Brace', 2, 'common', 'mourn', 'shield', { blk: 14 }, { blk: 19 });
bc('shrug', 'Shrug It Off', 1, 'common', 'mourn', 'body', { blk: 4, draw: 1 }, { blk: 6, draw: 1 });
bc('ground_pound', 'Ground Pound', 2, 'uncommon', 'mourn', 'quake', { dmg: 8, all: 1 }, { dmg: 12 });
bc('roar', 'Roar', 0, 'uncommon', 'mourn', 'mouth', { str: 1, exhaust: 1 }, { str: 2 });
bc('bodyslam', 'Body Slam', 1, 'uncommon', 'mourn', 'body', { special: 'bodyslam', tg: 'enemy' }, { cost: 0 });
bc('iron_hide', 'Iron Hide', 2, 'rare', 'mourn', 'shield', { pwr: 1, plating: 3 }, { plating: 4 });
bc('berserk', 'Berserk', 1, 'rare', 'mourn', 'fire', { pwr: 1, str: 3, hurt: 4 }, { str: 4 });
bc('sledge', 'Sledge', 3, 'rare', 'mourn', 'hammer', { dmg: 30, vuln: 2 }, { dmg: 40 });
// ----- Pia: tricks & debuffs -----
bc('jab', 'Jab', 0, 'common', 'pia', 'fist', { dmg: 4 }, { dmg: 6 });
bc('dirty_trick', 'Dirty Trick', 1, 'common', 'pia', 'dust', { dmg: 4, weak: 1, vuln: 1 }, { dmg: 6, weak: 2, vuln: 2 });
bc('pickpocket', 'Pickpocket', 0, 'common', 'pia', 'coin', { dmg: 2, money: 8 }, { dmg: 3, money: 14 });
bc('low_blow', 'Low Blow', 1, 'uncommon', 'pia', 'boot', { dmg: 8, bonus: 6, special: 'lowblow' }, { dmg: 10, bonus: 8 });
bc('gambit', 'Gambit', 1, 'rare', 'pia', 'cards', { draw: 4, exhaust: 1 }, { draw: 5 });
bc('spiked_collar', 'Spiked Collar', 1, 'uncommon', 'pia', 'thorn', { pwr: 1, thorns: 3 }, { thorns: 5 });
bc('second_wind', 'Second Wind', 0, 'uncommon', 'pia', 'bolt', { ap: 2, exhaust: 1 }, { ap: 2, draw: 2 });
bc('fancy_footwork', 'Fancy Footwork', 1, 'common', 'pia', 'boot', { blk: 5, weak: 1, all: 1, type: 'skl' }, { blk: 8, weak: 2 });
// ----- RawClaw: sound alchemist (debuffs, cheap cycling, resonance) -----
bc('sample_chop', 'Sample Chop', 0, 'common', 'claw', 'cards', { dmg: 3, draw: 1 }, { dmg: 5 });
bc('static_burst', 'Static Burst', 1, 'common', 'claw', 'dust', { dmg: 5, weak: 1 }, { dmg: 8, weak: 2 });
bc('filter_sweep', 'Filter Sweep', 1, 'common', 'claw', 'smoke', { weak: 2, vuln: 1 }, { weak: 3, vuln: 2 });
bc('echo_bomb', 'Echo Bomb', 2, 'uncommon', 'claw', 'quake', { dmg: 6, all: 1, weak: 1 }, { dmg: 9, weak: 2 });
bc('bass_boost', 'Bass Boost', 1, 'uncommon', 'claw', 'bolt', { str: 1, blk: 5 }, { str: 2, blk: 7 });
bc('resonance', 'Resonance', 2, 'rare', 'claw', 'fire', { dmg: 7, hits: 2, vuln: 2 }, { dmg: 9, vuln: 3 });
bc('loop_station', 'Loop Station', 1, 'rare', 'claw', 'clock', { pwr: 1, plating: 2 }, { plating: 3 });
// ----- negotiation -----
nc('plea', 'Plea', 1, 'starter', 'any', 'mouth', { inf: 4 }, { inf: 6 });
nc('hold_ground', 'Hold Ground', 1, 'starter', 'any', 'shield', { comp: 5 }, { comp: 8 });
nc('deep_breath', 'Deep Breath', 0, 'common', 'any', 'clock', { comp: 2, draw: 1 }, { comp: 3, draw: 2 });
nc('sweeten', 'Sweeten the Deal', 2, 'uncommon', 'any', 'coin', { inf: 10 }, { inf: 14 });
nc('stall', 'Stall', 1, 'common', 'any', 'clock', { comp: 6, soften: 3 }, { comp: 8, soften: 5 });
nc('sincerity', 'Sincerity', 2, 'rare', 'any', 'heart', { arg: { name: 'Sincerity', kind: 'inf', n: 3, turns: 0 } }, { arg: { name: 'Sincerity', kind: 'inf', n: 5, turns: 0 } });
nc('rattled', 'Rattled', 1, 'uncommon', 'any', 'eye', { inf: 3, strip: 1 }, { inf: 5 });
nc('doubt', 'Doubt', 1, 'curse', 'curse', 'curse', { unplayable: 1, text: 'Unplayable. A seed of doubt.' });
// Rook (cool, precise)
nc('needle', 'Needle', 1, 'common', 'rook', 'needle', { inf: 3, hits: 2 }, { inf: 4, hits: 2 });
nc('cold_read', 'Cold Read', 1, 'common', 'rook', 'eye', { inf: 4, draw: 1 }, { inf: 6, draw: 1 });
nc('poker_face', 'Poker Face', 1, 'common', 'rook', 'mask', { comp: 7, draw: 1 }, { comp: 10 });
nc('leverage', 'Leverage', 2, 'uncommon', 'rook', 'hammer', { inf: 13 }, { inf: 18 });
nc('checkmate', 'Checkmate', 3, 'rare', 'rook', 'crown', { inf: 24 }, { inf: 32 });
nc('insight', 'Insight', 1, 'uncommon', 'rook', 'eye', { pwr: 1, arg: { name: 'Insight', kind: 'draw', n: 1, turns: 0 } }, {});
// Mourn (intimidation)
nc('glare', 'Glare', 1, 'common', 'mourn', 'eye', { inf: 7, hurt: 2 }, { inf: 10, hurt: 2 });
nc('slam_table', 'Slam the Table', 2, 'common', 'mourn', 'fist', { inf: 9, soften: 4 }, { inf: 12, soften: 6 });
nc('loom', 'Loom', 1, 'common', 'mourn', 'body', { comp: 6, soften: 2 }, { comp: 9, soften: 3 });
nc('threat', 'Threat', 0, 'common', 'mourn', 'mouth', { inf: 3, hurt: 1 }, { inf: 5 });
nc('menace', 'Looming Menace', 2, 'rare', 'mourn', 'skull', { arg: { name: 'Menace', kind: 'inf', n: 5, turns: 0 } }, { arg: { name: 'Menace', kind: 'inf', n: 7, turns: 0 } });
nc('crush', 'Crush Resolve', 2, 'uncommon', 'mourn', 'hammer', { inf: 8, all: 1 }, { inf: 11 });
// Pia (charm)
nc('flatter', 'Flatter', 1, 'common', 'pia', 'heart', { inf: 3, heal: 3 }, { inf: 5, heal: 4 });
nc('fast_talk', 'Fast Talk', 0, 'common', 'pia', 'mouth', { inf: 2, draw: 1 }, { inf: 3, draw: 1 });
nc('mirrors', 'Smoke & Mirrors', 1, 'uncommon', 'pia', 'smoke', { inf: 3, all: 1 }, { inf: 5 });
nc('charm', 'Charming', 2, 'uncommon', 'pia', 'heart', { arg: { name: 'Charming', kind: 'comp', n: 3, turns: 0 } }, { arg: { name: 'Charming', kind: 'comp', n: 5, turns: 0 } });
nc('bluff', 'Bluff', 2, 'rare', 'pia', 'cards', { inf: 8, draw: 2, ap: 1 }, { inf: 11, draw: 2, ap: 1 });
nc('sleight', 'Sleight of Hand', 1, 'common', 'pia', 'coin', { inf: 4, money: 6 }, { inf: 6, money: 10 });

nc('remix', 'Remix', 1, 'common', 'claw', 'cards', { inf: 3, draw: 1 }, { inf: 5 });
nc('sample_pitch', 'Pitch Shift', 1, 'common', 'claw', 'mask', { comp: 6, soften: 2 }, { comp: 9, soften: 3 });
nc('feedback', 'Feedback', 0, 'uncommon', 'claw', 'mouth', { inf: 2, strip: 1 }, { inf: 4 });
nc('dub_plate', 'Dub Plate', 2, 'uncommon', 'claw', 'eye', { inf: 6, all: 1 }, { inf: 8 });
nc('mastering', 'Mastering', 2, 'rare', 'claw', 'crown', { arg: { name: 'Mastering', kind: 'inf', n: 4, turns: 0 } }, { arg: { name: 'Mastering', kind: 'inf', n: 6, turns: 0 } });

// resolved card definitions (upgrade merged) + text
const _cdCache = {};
function cd(inst) {
  const key = inst.id + (inst.up ? '+' : '');
  if (_cdCache[key]) return _cdCache[key];
  const base = BC[inst.id] || NC[inst.id];
  const d = Object.assign({}, base, inst.up ? base.upg : {}); d.up = !!inst.up;
  if (d.kind === 'b') {
    d.tg = d.tg || ((d.dmg || d.bleed || d.weak || d.vuln) && !d.all ? 'enemy' : 'self');
    if (d.all) d.tg = 'self';
    if (!d.text) d.text = battleText(d);
  } else {
    d.tg = d.tg || (d.inf && !d.all ? 'opp' : 'self');
    if (d.all) d.tg = 'self';
    if (!d.text) d.text = negText(d);
  }
  _cdCache[key] = d; return d;
}
function battleText(d) {
  const p = [];
  if (d.special === 'detonate') p.push(`Deal ${d.mult}× the target's Bleed as damage. Remove Bleed.`);
  if (d.special === 'bodyslam') p.push('Deal damage equal to your Block.');
  if (d.dmg != null) {
    let s = `Deal ${d.dmg}${d.special === 'lowblow' ? '' : ''} damage`;
    if (d.hits > 1) s += ` ${d.hits} times`; if (d.all) s += ' to ALL enemies'; p.push(s + '.');
  }
  if (d.special === 'lowblow') p.push(`+${d.bonus} if target is Weak or Vulnerable.`);
  const tgt = d.all ? ' to ALL enemies' : '';
  if (d.bleed) p.push(`Apply ${d.bleed} Bleed${tgt}.`);
  if (d.weak) p.push(`Apply ${d.weak} Weak${tgt}.`);
  if (d.vuln) p.push(`Apply ${d.vuln} Vulnerable${tgt}.`);
  if (d.blk) p.push(`Gain ${d.blk} Block.`);
  if (d.str) p.push(`Gain ${d.str} Strength.`);
  if (d.plating) p.push(`Gain ${d.plating} Plating.`);
  if (d.thorns) p.push(`Gain ${d.thorns} Thorns.`);
  if (d.heal) p.push(`Heal ${d.heal} HP.`);
  if (d.hurt) p.push(`Lose ${d.hurt} HP.`);
  if (d.draw) p.push(`Draw ${d.draw} card${d.draw > 1 ? 's' : ''}.`);
  if (d.ap) p.push(`Gain ${d.ap} AP.`);
  if (d.money) p.push(`Gain ${d.money} shil.`);
  if (d.exhaust) p.push('Exhaust.');
  return p.join(' ');
}
function negText(d) {
  const p = [];
  if (d.inf != null) p.push(`Deal ${d.inf}${d.hits > 1 ? '×' + d.hits : ''} Influence${d.all ? ' to ALL' : ''}.`);
  if (d.strip) p.push('Remove their Composure.');
  if (d.comp) p.push(`Gain ${d.comp} Composure.`);
  if (d.soften) p.push(`Their next attack is ${d.soften} weaker.`);
  if (d.arg) {
    const a = d.arg;
    p.push(`Argument: ${a.kind === 'inf' ? `Deal ${a.n} Influence` : a.kind === 'comp' ? `Gain ${a.n} Composure` : `Draw ${a.n} card`} each turn.`);
  }
  if (d.heal) p.push(`Heal ${d.heal} Resolve.`);
  if (d.hurt) p.push(`Lose ${d.hurt} Resolve.`);
  if (d.draw) p.push(`Draw ${d.draw} card${d.draw > 1 ? 's' : ''}.`);
  if (d.ap) p.push(`Gain ${d.ap} AP.`);
  if (d.money) p.push(`Gain ${d.money} shil.`);
  return p.join(' ');
}
function newInst(id, up) { return { id, up: !!up, uid: Math.random().toString(36).slice(2, 8) }; }

// ----- statuses -----
const STATUS = {
  str: { name: 'Strength', icon: 'fist', col: C.orange, desc: 'Attacks deal +1 damage per stack.' },
  plating: { name: 'Plating', icon: 'shield', col: C.blue, desc: 'Block gained from cards is increased per stack.' },
  thorns: { name: 'Thorns', icon: 'thorn', col: C.green, desc: 'Deal damage to attackers per stack.' },
  bleed: { name: 'Bleed', icon: 'drop', col: C.red, desc: 'Take damage at turn start, then lose 1 stack.' },
  weak: { name: 'Weak', icon: 'down', col: C.plum, desc: 'Deals 25% less attack damage. Wears off.' },
  vuln: { name: 'Vulnerable', icon: 'crack', col: C.orange, desc: 'Takes 50% more attack damage. Wears off.' }
};

// ----- characters -----
const CHARS = [
  {
    id: 'rook', name: 'Roxor', title: 'The Beatbox Wizard', hp: 62, nres: 38, desc: 'Cheeky mohawked beatboxer with a mic and a loop for every occasion. Wins fights by bleeding foes dry with sound, or sweet-talking them into leaving.',
    spec: { kind: 'rj', rj: 'roxor', s: 1, seed: 21 }, accent: '#3fcf6a',
    start: { loop_rats: 1, gloss: -1 },
    deck: ['strike', 'strike', 'strike', 'strike', 'guard', 'guard', 'guard', 'guard', 'quick_stab', 'deep_cut'],
    ndeck: ['plea', 'plea', 'plea', 'plea', 'hold_ground', 'hold_ground', 'hold_ground', 'hold_ground', 'needle', 'cold_read'],
    trait: 'Bleeding foes take double from Rend.', graft: 'wire_spool'
  },
  {
    id: 'mourn', name: 'Andy', title: 'The Thunder Bass', hp: 82, nres: 26, desc: 'Big-hearted, unflappable bassist with an orange bass slung low. Stacks Strength and Block, then flattens things with groove. Not a smooth talker.',
    spec: { kind: 'rj', rj: 'andy', s: 1.05, seed: 34 }, accent: '#ff9a2e',
    start: { bass_cartel: 1, static_choir: -1 },
    deck: ['strike', 'strike', 'strike', 'strike', 'guard', 'guard', 'guard', 'guard', 'headbutt', 'shrug'],
    ndeck: ['plea', 'plea', 'plea', 'hold_ground', 'hold_ground', 'hold_ground', 'hold_ground', 'glare', 'glare', 'loom'],
    trait: 'Starts each fight with 1 Strength.', graft: 'iron_knuckle'
  },
  {
    id: 'pia', name: 'Jasmin', title: 'The Blossom Voice', hp: 52, nres: 46, desc: 'Warm, dreamy singer with a high ponytail and a silver tongue. Weakens, cheapens and out-draws everything. Born to haggle.',
    spec: { kind: 'rj', rj: 'jasmin', s: 1, seed: 47 }, accent: '#ff7eb6',
    start: { gloss: 1, scrap_kings: -1 },
    deck: ['strike', 'strike', 'strike', 'guard', 'guard', 'guard', 'guard', 'jab', 'jab', 'dirty_trick'],
    ndeck: ['plea', 'plea', 'plea', 'hold_ground', 'hold_ground', 'hold_ground', 'flatter', 'flatter', 'fast_talk', 'fast_talk'],
    trait: 'Starts negotiations with 3 Composure.', graft: 'silver_tongue'
  },
  {
    id: 'claw', name: 'RawClaw', title: 'The Sound Alchemist', hp: 56, nres: 40, desc: 'Laid-back sampler nerd who mixes sound into trouble. Dusts foes with debuffs, cycles cards fast, and out-argues with clever tricks.',
    spec: { kind: 'rj', rj: 'rawclaw', s: 1, seed: 58 }, accent: '#a77bff',
    start: { scrap_kings: 1 },
    deck: ['strike', 'strike', 'strike', 'guard', 'guard', 'guard', 'guard', 'pocket_sand', 'pocket_sand', 'adrenal'],
    ndeck: ['plea', 'plea', 'plea', 'hold_ground', 'hold_ground', 'hold_ground', 'hold_ground', 'deep_breath', 'deep_breath', 'stall'],
    trait: 'Starts each battle drawing one extra card.', graft: 'lucky_coin'
  }
];

// ----- grafts (relics) -----
const GRAFTS = {
  wire_spool: { name: 'Wire Spool', icon: 'gear', desc: 'Start each battle with 5 Block.', cost: 120 },
  iron_knuckle: { name: 'Iron Knuckle', icon: 'fist', desc: 'Start each battle with 1 Strength.', cost: 140 },
  silver_tongue: { name: 'Silver Tongue', icon: 'mouth', desc: 'Start negotiations with 4 Composure.', cost: 120 },
  gold_tooth: { name: 'Gold Tooth', icon: 'coin', desc: 'Gain 25% more shil from every reward.', cost: 150 },
  spare_tooth: { name: 'Spare Rib', icon: 'heart', desc: 'Heal 6 HP after each battle.', cost: 160 },
  lucky_coin: { name: 'Lucky Coin', icon: 'star', desc: 'Draw 1 extra card on the first turn of battles and talks.', cost: 140 },
  whetstone: { name: 'Whetstone', icon: 'dagger', desc: 'Your first attack each battle deals +5 damage.', cost: 130 },
  scrap_heart: { name: 'Scrap Heart', icon: 'heart', desc: '+12 Max HP.', cost: 150 },
  ledger: { name: 'Dusty Ledger', icon: 'cards', desc: 'Gain +1 AP on the first turn of every negotiation.', cost: 140 },
  rusty_cog: { name: 'Rusty Cog', icon: 'gear', desc: 'Gain +1 AP on the first turn of every battle.', cost: 170 },
  hot_sauce: { name: 'Hot Sauce', icon: 'fire', desc: 'Apply 1 extra Bleed whenever you apply Bleed.', cost: 140 },
  big_hat: { name: 'Enormous Hat', icon: 'crown', desc: 'Start with +8 Resolve in negotiations.', cost: 130 }
};

// ----- enemies -----
const A = (n, h = 1, x) => Object.assign({ t: 'atk', n, h }, x || {});
const BLK = n => ({ t: 'blk', n });
const BUF = (st, n) => ({ t: 'buf', st, n });
const DEB = (st, n, dmg) => ({ t: 'deb', st, n, dmg });
const HEALM = n => ({ t: 'heal', n });
const SUM = id => ({ t: 'sum', id });
const SLP = () => ({ t: 'slp' });
const ENEMIES = {
  // ---- Act 1 ----
  rat: { name: 'Gutter Rat', hp: [11, 14], spec: { kind: 'beast', coat: '#8a7968', accent: '#b9362f', scale: .6, seed: 61 }, moves: [A(4), A(3, 2), A(5)], mode: 'rand', gold: 4 },
  hound: { name: 'Feral Hound', hp: [22, 26], spec: { kind: 'beast', coat: '#a0623a', accent: '#dd6a2c', scale: .9, seed: 62 }, moves: [A(5, 1, { st: ['bleed', 2] }), A(8), BUF('str', 1)], mode: 'cycle', gold: 10 },
  bandit: {
    name: 'Alley Bandit', hp: [26, 31], spec: { kind: 'human', skin: '#d6a47c', coat: '#7a4b2a', accent: '#b9362f', hat: 'bandana', hatCol: '#b9362f', weapon: 'knife', face: 'angry', build: 1, seed: 71 },
    moves: [A(7), BLK(6), A(5, 2)], mode: 'cycle', gold: 14,
    talk: { core: 22, name: 'Alley Bandit', moves: [4, 6, 3], max: 2, args: ['threat', 'excuse'], barks: ['Gimme what ya got.', 'Don\'t make this messy, friend.', 'You look like you can afford it.'] }
  },
  thug: {
    name: 'Rust Thug', hp: [34, 40], spec: { kind: 'human', skin: '#c8956c', coat: '#4a4a52', accent: '#e3a82a', hat: 'helm', weapon: 'wrench', face: 'grim', build: 1.3, seed: 72 },
    moves: [A(9), BUF('str', 2), A(6, 2)], mode: 'cycle', gold: 16,
    talk: { core: 28, name: 'Rust Thug', moves: [5, 4, 7], max: 2, args: ['threat', 'wall'], barks: ['I get paid by the broken bone.', 'Talk is cheap. So am I.', 'Boss said no loose ends.'] }
  },
  sludge: { name: 'Sludge Thing', hp: [38, 44], spec: { kind: 'blob', coat: '#6c9140', seed: 63, scale: 1 }, moves: [A(6), DEB('weak', 2, 4), A(9)], mode: 'cycle', gold: 12 },
  drone: { name: 'Scrap Drone', hp: [24, 28], spec: { kind: 'bot', coat: '#7d756a', eye: '#e3a82a', seed: 64, scale: .9 }, moves: [BLK(8), A(6), A(14, 1)], mode: 'cycle', gold: 14 },
  smuggler: {
    name: 'Dolly Pike', hp: [28, 33], spec: { kind: 'human', skin: '#e8c19a', coat: '#35577a', accent: '#e3a82a', hat: 'hair', hatCol: '#dd6a2c', weapon: 'pistol', face: 'grin', build: .92, seed: 73 },
    moves: [A(4, 2), DEB('vuln', 2, 0), A(10)], mode: 'cycle', gold: 18,
    talk: { core: 24, name: 'Dolly Pike', moves: [3, 5, 4], max: 3, args: ['excuse', 'bribe'], barks: ['Everything\'s for sale, darling.', 'You\'re haggling badly.', 'Cash up front, or lead.'] }
  },
  // elites
  venn: {
    name: 'Captain Venn', hp: [68, 72], spec: { kind: 'human', skin: '#d0a07a', coat: '#1f5a58', accent: '#e3a82a', hat: 'tophat', hatCol: '#1d1b3a', weapon: 'cane', face: 'grim', build: 1.1, seed: 81, beard: '#3a2a20', scale: 1.12 },
    moves: [A(12), BLK(10), BUF('str', 2), A(8, 2)], mode: 'cycle', gold: 40, elite: 1,
    talk: { core: 40, name: 'Captain Venn', moves: [6, 8, 5, 10], max: 3, args: ['threat', 'wall', 'excuse'], barks: ['Order. Discipline. Payment.', 'I\'ve broken better liars than you.', 'The Captain does not haggle.'] }
  },
  twins: { name: 'Wire Wardens', hp: [30, 34], spec: { kind: 'bot', coat: '#35577a', eye: '#e3a82a', seed: 65 }, moves: [A(7), BLK(7), A(5, 2)], mode: 'cycle', gold: 22, elite: 1 },
  brute: {
    name: 'Gorm the Breaker', hp: [78, 84], spec: { kind: 'human', skin: '#a77a57', coat: '#5d3b6b', accent: '#dd6a2c', hat: 'mohawk', hatCol: '#dd6a2c', weapon: 'axe', face: 'angry', build: 1.55, seed: 82, scar: 1, scale: 1.18 },
    moves: [BUF('str', 3), A(16), A(7, 3), BLK(14)], mode: 'cycle', gold: 44, elite: 1,
    talk: { core: 46, name: 'Gorm the Breaker', moves: [8, 6, 12], max: 2, args: ['threat', 'wall', 'threat'], barks: ['GORM SMASH. Then Gorm eat.', 'Words are small. Gorm is big.', 'You talk too much, tiny.'] }
  },
  // boss 1
  baron: {
    name: 'Baron Cogsworth', hp: [130, 130], spec: { kind: 'human', skin: '#e0b896', coat: '#b9362f', accent: '#e3a82a', hat: 'tophat', hatCol: '#7a2b24', weapon: 'cane', face: 'grin', build: 1.25, seed: 91, beard: '#d9d0b8', scale: 1.28, scarf: '#e3a82a' },
    moves: [A(14), SUM('hound'), BLK(18), A(8, 3), BUF('str', 2), A(20)], mode: 'cycle', gold: 100, boss: 1,
    talk: { core: 60, name: 'Baron Cogsworth', moves: [8, 6, 12, 5], max: 3, args: ['threat', 'bribe', 'wall'], barks: ['Everything in this district is MINE.', 'I admire the effort. Truly.', 'My lawyers are faster than your knife.'] }
  },
  // ---- Act 2 ----
  raider: {
    name: 'Dust Raider', hp: [42, 48], spec: { kind: 'human', skin: '#c28a5e', coat: '#e0a526', accent: '#b9362f', hat: 'hood', hatCol: '#7a2b24', weapon: 'axe', face: 'angry', build: 1.1, seed: 101 },
    moves: [A(11), A(7, 2), BLK(9), BUF('str', 2)], mode: 'cycle', gold: 20,
    talk: { core: 34, name: 'Dust Raider', moves: [6, 8, 5], max: 3, args: ['threat', 'excuse'], barks: ['Water or blood.', 'The dunes ate better men.', 'Hand it over.'] }
  },
  pithound: { name: 'Pit Hound', hp: [38, 44], spec: { kind: 'beast', coat: '#6c4f3a', accent: '#b9362f', scale: 1.05, seed: 102, eye: '#e3a82a' }, moves: [A(7, 1, { st: ['bleed', 3] }), A(11), A(5, 3)], mode: 'cycle', gold: 14 },
  siege: { name: 'Siege Drone', hp: [46, 52], spec: { kind: 'bot', coat: '#7a2b24', eye: '#e3a82a', seed: 103, scale: 1.1 }, moves: [BLK(12), A(9), DEB('vuln', 2, 8), A(18)], mode: 'cycle', gold: 20 },
  mire: { name: 'Mire Mass', hp: [60, 68], spec: { kind: 'blob', coat: '#5d3b6b', seed: 104, scale: 1.2 }, moves: [A(8), DEB('weak', 2, 6), HEALM(10), A(13)], mode: 'cycle', gold: 18 },
  gangster: {
    name: 'Pit Boss Marla', hp: [44, 50], spec: { kind: 'human', skin: '#e2b48c', coat: '#2d7d79', accent: '#e3a82a', hat: 'bowler', hatCol: '#1f5a58', weapon: 'bottle', face: 'grin', build: 1, seed: 105 },
    moves: [A(8), DEB('weak', 2, 5), A(6, 2), BLK(10)], mode: 'cycle', gold: 22,
    talk: { core: 36, name: 'Pit Boss Marla', moves: [5, 7, 4, 6], max: 3, args: ['bribe', 'wall', 'excuse'], barks: ['You\'re in my pit now.', 'I run the odds, kid.', 'Everybody pays the house.'] }
  },
  saint: {
    name: 'Saint Ketter', hp: [96, 100], spec: { kind: 'human', skin: '#d6b896', coat: '#5d3b6b', accent: '#e3a82a', hat: 'hood', hatCol: '#3a2347', weapon: 'cane', face: 'sad', build: 1, seed: 111, scale: 1.18, patch: 1 },
    moves: [A(10), DEB('weak', 2, 0), A(7, 3), HEALM(12), BUF('str', 2), A(18)], mode: 'cycle', gold: 60, elite: 1,
    talk: { core: 56, name: 'Saint Ketter', moves: [7, 9, 6], max: 3, args: ['excuse', 'wall', 'threat'], barks: ['Confess. Confession is cheaper.', 'I forgive nothing.', 'Kneel, or be knelt.'] }
  },
  rustjaw: { name: 'Rustjaw', hp: [92, 98], spec: { kind: 'beast', coat: '#4a4a52', accent: '#dd6a2c', scale: 1.5, seed: 112, eye: '#e3a82a' }, moves: [A(14, 1, { st: ['bleed', 3] }), BUF('str', 3), A(8, 3), A(22)], mode: 'cycle', gold: 60, elite: 1 },
  collector: {
    name: 'The Collector', hp: [180, 180], spec: { kind: 'human', skin: '#cfc2a8', coat: '#1d1b3a', accent: '#e3a82a', hat: 'tophat', hatCol: '#e3a82a', weapon: 'cane', face: 'grim', build: 1.3, seed: 121, scale: 1.34, scarf: '#b9362f', beard: '#8a8378' },
    moves: [A(16), SUM('drone'), BLK(22), A(10, 3), DEB('weak', 3, 10), BUF('str', 3), A(26)], mode: 'cycle', gold: 150, boss: 1,
    talk: { core: 90, name: 'The Collector', moves: [10, 8, 14, 6, 12], max: 3, args: ['bribe', 'threat', 'wall', 'excuse'], barks: ['Everything has a price. Yours is low.', 'You are already in my ledger.', 'Interesting. Insulting, but interesting.'] }
  }
};
ENEMIES.venn.talk.pool = 1;
// negotiation argument templates
const ARGS = {
  threat: { name: 'Threat', kind: 'pressure', n: 3, resolve: 7, icon: 'fist', desc: 'Pressures you for 3 each turn.' },
  excuse: { name: 'Excuse', kind: 'fort', n: 3, resolve: 6, icon: 'shield', desc: 'Gives their core 3 Composure each turn.' },
  wall: { name: 'Stonewall', kind: 'fort', n: 5, resolve: 10, icon: 'shield', desc: 'Gives their core 5 Composure each turn.' },
  bribe: { name: 'Counter-Offer', kind: 'mend', n: 4, resolve: 7, icon: 'coin', desc: 'Restores 4 of their core Resolve each turn.' },
  doubtseed: { name: 'Sow Doubt', kind: 'doubt', n: 1, resolve: 6, icon: 'question', desc: 'Adds a Doubt to your deck each turn.' }
};
// encounters
const ENC = {
  1: {
    fight: [['rat', 'rat'], ['hound'], ['bandit'], ['thug'], ['sludge'], ['drone', 'rat'], ['smuggler'], ['bandit', 'rat'], ['hound', 'hound']],
    elite: [['venn'], ['twins', 'twins'], ['brute']],
    boss: [['baron']], bg: 'alley'
  },
  2: {
    fight: [['raider'], ['pithound', 'pithound'], ['siege'], ['mire'], ['gangster'], ['raider', 'pithound'], ['gangster', 'drone']],
    elite: [['saint'], ['rustjaw']],
    boss: [['collector']], bg: 'desert'
  }
};

// ----- events -----
const EVENTS = [
  {
    id: 'peddler', title: 'The Wounded Peddler', text: 'A peddler lies bleeding behind a stack of crates, clutching a battered satchel. "Please... a little help?"',
    opts: [
      { label: 'Patch him up (-12 shil)', cond: r => r.money >= 12, fx: r => { r.money -= 12; return { msg: 'He weeps gratitude and presses a card into your hand.', card: 1 }; } },
      { label: 'Rob him', fx: r => { r.money += 45; return { msg: 'You take his satchel. It feels heavier than it should. (+45 shil, gain Regret)', curse: 1 }; } },
      { label: 'Walk away', fx: r => ({ msg: 'You step over him. The alley gets quieter.' }) }
    ]
  },
  {
    id: 'surgeon', title: 'Back-Alley Surgeon', text: 'A man in a stained apron sharpens a saw. "Fix you right up. Cheap. Mostly."',
    opts: [
      { label: 'Stitch me up (-30 shil): heal 20 HP', cond: r => r.money >= 30, fx: r => { r.money -= 30; r.hp = Math.min(r.maxhp, r.hp + 20); return { msg: 'It hurts, but you feel better. (+20 HP)' }; } },
      { label: 'Remove a bad habit (-45 shil): remove a card', cond: r => r.money >= 45, fx: r => { r.money -= 45; return { msg: 'He gestures at your deck.', removeCard: 1 }; } },
      { label: 'Leave', fx: r => ({ msg: '"Suit yourself."' }) }
    ]
  },
  {
    id: 'dice', title: 'Dice in the Dark', text: 'Three hustlers are playing bones by a barrel fire. One of them shifts and makes room.',
    opts: [
      { label: 'Bet 25 shil (50%: win 60)', cond: r => r.money >= 25, fx: r => { if (Math.random() < .5) { r.money += 60; Snd.play('coin'); return { msg: 'The dice love you tonight. (+60 shil)' }; } r.money -= 25; return { msg: 'Snake eyes. They cackle. (-25 shil)' }; } },
      { label: 'Cheat (lose 6 HP, win 40)', fx: r => { r.hp = Math.max(1, r.hp - 6); r.money += 40; return { msg: 'You win, and a fist finds your ribs. (+40 shil, -6 HP)' }; } },
      { label: 'Decline', fx: r => ({ msg: 'You nod and leave them to it.' }) }
    ]
  },
  {
    id: 'shrine', title: 'Shrine of Scrap', text: 'A heap of twisted metal glows faintly. Offerings of bent spoons litter the ground.',
    opts: [
      { label: 'Offer blood (lose 8 HP): +6 Max HP', cond: r => r.hp > 10, fx: r => { r.hp -= 8; r.maxhp += 6; r.hp = Math.min(r.maxhp, r.hp + 6); return { msg: 'The scrap hums. You feel sturdier. (+6 Max HP)' }; } },
      { label: 'Pray for guidance: upgrade a card', fx: r => ({ msg: 'A faint voice tells you what to sharpen.', upgrade: 1 }) },
      { label: 'Leave', fx: r => ({ msg: 'You leave the shrine in peace.' }) }
    ]
  },
  {
    id: 'crate', title: 'The Suspicious Crate', text: 'A locked crate sits in the road with a "FREE" sign. Obviously a trap. Probably a good one.',
    opts: [
      { label: 'Pry it open', fx: r => { if (Math.random() < .55) return { msg: 'Inside: a strange device. It attaches itself to you.', graft: 1 }; r.hp = Math.max(1, r.hp - 10); return { msg: 'It explodes. (-10 HP)' }; } },
      { label: 'Kick it', fx: r => { r.money += 15; return { msg: 'Coins rattle out. Cheap, but free. (+15 shil)' }; } },
      { label: 'Ignore', fx: r => ({ msg: 'Wise. Probably.' }) }
    ]
  },
  {
    id: 'dog', title: 'Hungry Stray', text: 'A bony dog follows you at a distance, eyeing your rations.',
    opts: [
      { label: 'Feed it (-10 shil): +4 Max HP, heal 8', cond: r => r.money >= 10, fx: r => { r.money -= 10; r.maxhp += 4; r.hp = Math.min(r.maxhp, r.hp + 8); return { msg: 'It wags itself into a better mood. So do you.' }; } },
      { label: 'Shoo it away', fx: r => ({ msg: 'It slinks off, offended.' }) }
    ]
  },
  {
    id: 'broker', title: 'Card Broker', text: 'A woman with a coat full of pockets lays out cards. "I trade in advice. Sometimes it is even good."',
    opts: [
      { label: 'Trade a card for a rare', cond: r => r.deck.length > 5, fx: r => ({ msg: 'Choose a card to give up.', tradeCard: 1 }) },
      { label: 'Buy her advice (-40 shil)', cond: r => r.money >= 40, fx: r => { r.money -= 40; return { msg: 'She whispers; a sharp idea appears.', card: 1, rare: 1 }; } },
      { label: 'No thanks', fx: r => ({ msg: '"Your loss."' }) }
    ]
  }
];

// ----- helpers -----
function charById(id) { return CHARS.find(c => c.id === id); }
function cardPool(kind, run, rarityWeights) {
  const src = kind === 'b' ? BC : NC;
  return Object.values(src).filter(c => c.rarity !== 'starter' && c.rarity !== 'curse' && (c.cls === 'any' || c.cls === run.char));
}
function rollCards(kind, run, n, o = {}) {
  const pool = cardPool(kind, run);
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < 200) {
    let r = Math.random();
    const rareP = (o.rare ? .6 : (o.elite ? .18 : .07));
    const rar = r < rareP ? 'rare' : r < rareP + (o.elite ? .45 : .35) ? 'uncommon' : 'common';
    const cands = pool.filter(c => c.rarity === rar && !out.includes(c.id));
    if (!cands.length) continue; out.push(pick(cands).id);
  }
  return out;
}
function cardPrice(c) { return c.rarity === 'rare' ? 140 : c.rarity === 'uncommon' ? 80 : 50; }

// make enemy instance data
function spawnEnemyData(id, act) {
  const def = ENEMIES[id]; const m = 1 + (act - 1) * 0;
  const hp = Math.round(ri(def.hp[0], def.hp[1]) * m);
  return { id, def, hp, maxhp: hp };
}
