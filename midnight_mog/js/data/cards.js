// Cards: one summon card per cat (generated, id call_<catId>), plus hand-written spells, traps and builds.
// Every card.effect carries `target`: 'none' | 'tile' | 'enemy' | 'lane' (what the player must tap).
// Flat `amount` values are reference amounts scaled by the sim (card level and stage reference), see docs/SYSTEMS.md.
import { CATS } from './cats.js';

const SUMMON_COST = { common: 1, rare: 2, epic: 3, legend: 4, mythic: 5 };
const SUMMON_COST_OVERRIDE = { biscuit_bruiser: 2, cushion_cat: 2, tin_can_tom: 2, sir_purrcival: 3, bell_kitten: 1, baron_von_fluff: 4, mother_of_nine_lives: 5, big_mama_maine: 4 };

const summonCards = CATS.map((c) => ({
  id: 'call_' + c.id,
  name: c.name,
  cost: SUMMON_COST_OVERRIDE[c.id] ?? SUMMON_COST[c.rarity],
  type: 'summon',
  rarity: c.rarity,
  text: 'Summon ' + c.name + '. ' + c.ability.text,
  effect: { kind: 'summon', target: 'tile', cat: c.id },
}));

const card = (id, name, cost, type, rarity, text, effect) => ({ id, name, cost, type, rarity, text, effect });

const spells = [
  // cost 0
  card('cat_nap', 'Cat Nap', 0, 'spell', 'common', 'Heal the base for 40.',
    { kind: 'heal', target: 'none', to: 'base', amount: 40 }),
  card('tail_flick', 'Tail Flick', 0, 'spell', 'common', 'Knock enemies near a tile back 1 tile.',
    { kind: 'knockback', target: 'tile', to: 'radius', at: 'target', radius: 1.5, tiles: 1 }),
  // cost 1
  card('pounce', 'Pounce', 1, 'spell', 'common', 'Deal 90 damage to an enemy.',
    { kind: 'damage', target: 'enemy', to: 'target', amount: 90 }),
  card('zoomies', 'Zoomies', 1, 'spell', 'common', 'All cats attack 25% faster for 5s.',
    { kind: 'buff', target: 'none', to: 'all', stat: 'rate', pct: 0.25, duration: 5 }),
  card('fur_ball', 'Fur Ball', 1, 'spell', 'common', 'Slow enemies near a tile by 40% for 4s.',
    { kind: 'debuff', target: 'tile', to: 'radius', at: 'target', radius: 2, stat: 'speed', pct: 0.4, duration: 4 }),
  card('curious_cat', 'Curious Cat', 1, 'spell', 'common', 'Draw 2 cards.',
    { kind: 'draw', target: 'none', count: 2 }),
  card('catnip_stash', 'Catnip Stash', 1, 'spell', 'rare', 'Gain 2 energy.',
    { kind: 'energy', target: 'none', amount: 2 }),
  // cost 2
  card('moonlit_mend', 'Moonlit Mend', 2, 'spell', 'common', 'Heal all cats for 30% max HP.',
    { kind: 'heal', target: 'none', to: 'all', pct: 0.3 }),
  card('sour_milk', 'Sour Milk', 2, 'spell', 'common', 'Poison enemies near a tile for 4s.',
    { kind: 'dot', target: 'tile', to: 'radius', at: 'target', radius: 2, dps: 45, duration: 4, element: 'poison' }),
  card('catnip_surge', 'Catnip Surge', 2, 'spell', 'rare', 'All cats: +40% attack speed and +15% damage for 6s.',
    { kind: 'multi', target: 'none', steps: [{ kind: 'buff', to: 'all', stat: 'rate', pct: 0.4, duration: 6 }, { kind: 'buff', to: 'all', stat: 'dmg', pct: 0.15, duration: 6 }] }),
  card('neon_flash', 'Neon Flash', 2, 'spell', 'rare', 'Stun enemies near a tile for 2s.',
    { kind: 'stun', target: 'tile', to: 'radius', at: 'target', radius: 2.5, duration: 2 }),
  card('lightning_whisker', 'Lightning Whisker', 2, 'spell', 'rare', 'Neon lightning chains through 4 enemies.',
    { kind: 'chain', target: 'enemy', jumps: 4, amount: 140, falloff: 0.1, range: 2.5, element: 'elec' }),
  card('final_pounce', 'Final Pounce', 2, 'spell', 'epic', 'Execute an enemy below 25% HP. Bosses take 300 damage instead.',
    { kind: 'execute', target: 'enemy', to: 'target', threshold: 0.25, bossAmount: 300 }),
  // cost 3
  card('hairball_barrage', 'Hairball Barrage', 3, 'spell', 'rare', 'Hit 6 random enemies for 90.',
    { kind: 'damage', target: 'none', to: 'random', n: 6, amount: 90 }),
  card('shatter_mirror', 'Shatter Mirror', 3, 'spell', 'rare', 'Shield all cats for 80 for 8s.',
    { kind: 'shield', target: 'none', to: 'all', amount: 80, duration: 8 }),
  card('second_wind', 'Second Wind', 3, 'spell', 'epic', 'Revive up to 2 fallen cats at 50% HP.',
    { kind: 'revive', target: 'none', n: 2, hpPct: 0.5 }),
  // cost 4
  card('midnight_howl', 'Midnight Howl', 4, 'spell', 'epic', 'Stun all enemies for 1.5s. All cats +30% damage for 8s.',
    { kind: 'multi', target: 'none', steps: [{ kind: 'stun', to: 'all', duration: 1.5 }, { kind: 'buff', to: 'all', stat: 'dmg', pct: 0.3, duration: 8 }] }),
  card('meteor_of_yarn', 'Meteor of Yarn', 4, 'spell', 'epic', 'A flaming yarn ball deals 400 in a large area.',
    { kind: 'aoe', target: 'tile', at: 'target', radius: 2.5, amount: 400, element: 'fire' }),
  // cost 5
  card('scratch_post_slam', 'Scratch Post Slam', 5, 'spell', 'legend', 'Deal 600 to all enemies and stun them for 1s.',
    { kind: 'multi', target: 'none', steps: [{ kind: 'damage', to: 'all', amount: 600 }, { kind: 'stun', to: 'all', duration: 1 }] }),
  card('starfall_purrade', 'Starfall Purrade', 5, 'spell', 'mythic', 'Deal 1000 to all enemies and burn them for 5s.',
    { kind: 'multi', target: 'none', steps: [{ kind: 'damage', to: 'all', amount: 1000, element: 'holy' }, { kind: 'dot', to: 'all', dps: 80, duration: 5, element: 'fire' }] }),
];

const traps = [
  card('tuna_tripwire', 'Tuna Tripwire', 1, 'trap', 'common', 'Slows enemies by 60% for 4s. 3 charges.',
    { kind: 'trap', target: 'tile', charges: 3, radius: 1, effect: { kind: 'debuff', to: 'radius', radius: 1, stat: 'speed', pct: 0.6, duration: 4 } }),
  card('spiky_scratch_post', 'Spiky Scratch Post', 1, 'trap', 'common', 'Deals 80 and bleeds. 2 charges.',
    { kind: 'trap', target: 'tile', charges: 2, radius: 1, effect: { kind: 'multi', steps: [{ kind: 'damage', to: 'target', amount: 80 }, { kind: 'dot', to: 'target', dps: 30, duration: 4, element: 'bleed' }] } }),
  card('mouse_trap_mk2', 'Mouse Trap Mk II', 2, 'trap', 'common', 'Deals 200 to one enemy. 1 charge.',
    { kind: 'trap', target: 'tile', charges: 1, radius: 1, effect: { kind: 'damage', to: 'target', amount: 200 } }),
  card('catnip_cloud', 'Catnip Cloud', 2, 'trap', 'rare', 'Enemies deal 50% less damage for 5s. 2 charges.',
    { kind: 'trap', target: 'tile', charges: 2, radius: 1.5, effect: { kind: 'debuff', to: 'radius', radius: 1.5, stat: 'dmg', pct: 0.5, duration: 5 } }),
  card('laser_pointer_decoy', 'Laser Pointer Decoy', 2, 'trap', 'rare', 'Stuns enemies for 2s. 2 charges.',
    { kind: 'trap', target: 'tile', charges: 2, radius: 1, effect: { kind: 'stun', to: 'radius', radius: 1, duration: 2 } }),
  card('bear_trap_bell', 'Bear Trap Bell', 3, 'trap', 'rare', 'Stuns for 3s and deals 150. 1 charge.',
    { kind: 'trap', target: 'tile', charges: 1, radius: 1, effect: { kind: 'multi', steps: [{ kind: 'damage', to: 'radius', radius: 1, amount: 150 }, { kind: 'stun', to: 'radius', radius: 1, duration: 3 }] } }),
  card('neon_mine', 'Neon Mine', 3, 'trap', 'epic', 'Explodes for 350 in a wide area. 1 charge.',
    { kind: 'trap', target: 'tile', charges: 1, radius: 1.5, effect: { kind: 'aoe', at: 'target', radius: 1.5, amount: 350, element: 'elec' } }),
  card('black_cat_curse', 'Black Cat Curse', 4, 'trap', 'legend', 'Enemies take 30% more damage and poison for 6s. 3 charges.',
    { kind: 'trap', target: 'tile', charges: 3, radius: 2, effect: { kind: 'multi', steps: [{ kind: 'debuff', to: 'radius', radius: 2, stat: 'vuln', pct: 0.3, duration: 6 }, { kind: 'dot', to: 'radius', radius: 2, dps: 60, duration: 6, element: 'poison' }] } }),
];

const builds = [
  card('fish_stand', 'Fish Stand', 1, 'build', 'common', 'Fish rewards +25% this battle.',
    { kind: 'reward_mult', target: 'none', resource: 'fish', pct: 0.25 }),
  card('cardboard_fort', 'Cardboard Fort', 1, 'build', 'common', 'Place a barricade with 300 HP.',
    { kind: 'barricade', target: 'tile', hp: 300, duration: 30 }),
  card('cat_tree', 'Cat Tree', 2, 'build', 'common', 'Cat on this tile gets +20% range.',
    { kind: 'aura', target: 'tile', radius: 0.5, interval: 1, duration: 0, effect: { kind: 'buff', to: 'radius', radius: 0.5, stat: 'range', pct: 0.2, duration: 1.2 } }),
  card('rooftop_garden', 'Rooftop Garden', 2, 'build', 'rare', 'Heals cats nearby 3% max HP per second for 25s.',
    { kind: 'aura', target: 'tile', radius: 2.5, interval: 1, duration: 25, effect: { kind: 'heal', to: 'radius', radius: 2.5, pct: 0.03 } }),
  card('neon_sign', 'Neon Sign', 2, 'build', 'rare', 'Cats nearby deal +15% damage for 25s.',
    { kind: 'aura', target: 'tile', radius: 3, interval: 1, duration: 25, effect: { kind: 'buff', to: 'radius', radius: 3, stat: 'dmg', pct: 0.15, duration: 1.2 } }),
  card('water_tower_pump', 'Water Tower Pump', 2, 'build', 'rare', 'Repairs the base for 4% per second for 15s.',
    { kind: 'aura', target: 'none', radius: 0, interval: 1, duration: 15, effect: { kind: 'heal', to: 'base', pct: 0.04 } }),
  card('yarn_pylon', 'Yarn Pylon', 3, 'build', 'epic', 'Energy regenerates +0.2 per second this battle.',
    { kind: 'battle_rule', target: 'none', rule: 'energy_regen_add', value: 0.2 }),
  card('fortified_roof', 'Fortified Roof', 3, 'build', 'epic', 'Base max HP +30% this battle and heal 30%.',
    { kind: 'multi', target: 'none', steps: [{ kind: 'battle_rule', rule: 'base_hp_pct', value: 0.3 }, { kind: 'heal', to: 'base', pct: 0.3 }] }),
];

export const CARDS = [...summonCards, ...spells, ...traps, ...builds];
export const CARD_BY_ID = Object.fromEntries(CARDS.map((c) => [c.id, c]));
export const STARTER_DECK = ['call_scrap_tabby', 'call_scrap_tabby', 'call_whisker_scout', 'call_whisker_scout', 'call_spark_kit', 'call_nurse_purrnell', 'call_tin_can_tom', 'call_snare_stray', 'pounce', 'tuna_tripwire', 'curious_cat', 'zoomies'];
