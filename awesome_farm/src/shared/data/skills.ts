// The skill tree: six branches radiating from the hub. Every level earns a point
// (bosses and goals pay extra). Nodes have ranks, an "any of" requirement list, stat
// mods (see stats.ts) and/or unlock tokens that gate recipes and buildings.

import { PAL } from '../palette';
import type { Mods } from './stats';

export type BranchId = 'gather' | 'farm' | 'industry' | 'combat' | 'taming' | 'explore';

interface BranchDef { id: BranchId; name: string; blurb: string; color: number; dark: number; angle: number; icon: string }

export const BRANCHES: Record<BranchId, BranchDef> = {
    gather:   { id: 'gather',   name: 'Gathering', blurb: 'Hit harder, harvest more, waste nothing.', color: PAL.lime,    dark: PAL.pine,   angle: -90, icon: 'k_axe' },
    farm:     { id: 'farm',     name: 'Farming & Cooking', blurb: 'Crops, kitchens, looms and brews.', color: PAL.pumpkin, dark: PAL.bark, angle: -30, icon: 'k_sprout' },
    industry: { id: 'industry', name: 'Industry',  blurb: 'Smithing, engineering and full automation.', color: PAL.gold, dark: PAL.slate, angle: 30, icon: 'k_gear' },
    combat:   { id: 'combat',   name: 'Combat',    blurb: 'Hearts, steel and a stubborn will to live.', color: PAL.berry, dark: PAL.bark, angle: 90, icon: 'k_sword' },
    taming:   { id: 'taming',   name: 'Taming',    blurb: 'Befriend wild creatures and put them to work.', color: PAL.blossom, dark: PAL.plum, angle: 150, icon: 'k_paw' },
    explore:  { id: 'explore',  name: 'Explorer',  blurb: 'Speed, stamina, trade and the far horizon.', color: PAL.foam, dark: PAL.deepSea, angle: 210, icon: 'k_compass' },
};
export const BRANCH_ORDER: BranchId[] = ['gather', 'farm', 'industry', 'combat', 'taming', 'explore'];

export interface SkillNode {
    id: string;
    branch: BranchId;
    name: string;
    icon: string;             // texture key
    u: number;                // distance from the hub along the branch
    v: number;                // sideways offset
    req: string[];            // learnable once ANY of these has a rank ('hub' = always)
    max: number;
    cost: number;             // points per rank
    mods?: Mods;              // per rank
    unlock?: string[];        // tokens granted at rank 1
    desc?: string;
    key?: boolean;            // keystone: drawn bigger
}

type Row = [id: string, name: string, icon: string, u: number, v: number, req: string[], max: number, cost: number, mods?: Mods | null, unlock?: string[] | null, desc?: string, key?: boolean];

function branch (b: BranchId, rows: Row[]): SkillNode[] {
    return rows.map(([id, name, icon, u, v, req, max, cost, mods, unlock, desc, key]) => ({
        id, branch: b, name, icon, u, v, req, max, cost, mods: mods ?? undefined, unlock: unlock ?? undefined, desc, key,
    }));
}

const GATHER = branch('gather', [
    ['g_hands',  'Calloused Hands',   'k_fist',   1, 0,  ['hub'], 3, 1, { swingSpeed: 0.06 }],
    ['g_wood',   'Lumberjack',        'i_wood',   2, -1, ['g_hands'], 4, 1, { wood: 0.4 }],
    ['g_reach',  'Long Arms',         'k_reach',  2, 0,  ['g_hands'], 3, 1, { reach: 0.1 }],
    ['g_stone',  'Stonemason',        'i_stone',  2, 1,  ['g_hands'], 4, 1, { stone: 0.4 }],
    ['g_forage', 'Forager',           'i_berry',  3, -2, ['g_wood'], 4, 1, { plant: 0.5 }],
    ['g_axe',    'Keen Axe',          'k_axe',    3, -1, ['g_wood'], 4, 1, { nodeCrit: 0.06 }],
    ['g_magnet', 'Magnet Pockets',    'k_magnet', 3, 0,  ['g_reach'], 3, 1, { magnet: 0.25 }],
    ['g_pick',   'Prospector',        'i_iron',   3, 1,  ['g_stone'], 4, 1, { ore: 0.35 }],
    ['g_regrow', 'Regrowth',          'k_sprout', 3, 2,  ['g_stone'], 4, 1, { regrow: 0.2 }],
    ['g_lucky',  'Four-Leaf Clover',  'k_clover', 4, -1, ['g_axe', 'g_magnet'], 4, 1, { luck: 0.05 }],
    ['g_shaft',  'Mine Shafts',       'k_drill',  4, 0,  ['g_magnet', 'g_pick'], 1, 2, null, ['mineshaft'], 'Dig down to the caves under the world.'],
    ['g_swing',  'Efficient Swing',   'k_bolt',   4, 1,  ['g_pick', 'g_magnet'], 4, 1, { swingCost: -0.1 }],
    ['g_loot',   'Treasure Hunter',   'k_chest',  4, -2, ['g_forage'], 3, 1, { chestLoot: 0.25 }],
    ['g_zeal',   "Gatherer's Zeal",   'k_star',   4, 2,  ['g_regrow'], 3, 1, { swingSpeed: 0.05, regrow: 0.1 }],
    ['g_mass',   'Mass Harvest',      'k_burst',  5, -1.5, ['g_lucky', 'g_loot'], 3, 2, { nodeCrit: 0.08, luck: 0.03 }],
    ['g_depth',  'Deep Delver',       'i_crystal', 5, 1.5, ['g_swing', 'g_zeal'], 3, 2, { ore: 0.5, stone: 0.5 }],
    ['g_master', 'Master Gatherer',   'k_crown',  6, 0,  ['g_mass', 'g_depth'], 1, 4, { wood: 1, stone: 1, ore: 1, plant: 1 }, null, 'Every harvest gives more.', true],
    ['g_titan',  "Titan's Touch",     'k_fist',   7, 0,  ['g_master'], 1, 4, { nodeCrit: 0.15, swingSpeed: 0.12 }, null, 'Nothing stays standing for long.', true],
]);

const FARM = branch('farm', [
    ['f_thumb',  'Green Thumb',       'k_sprout', 1, 0,  ['hub'], 5, 1, { grow: 0.12 }],
    ['f_yield',  'Bountiful Harvest', 'i_wheat',  2, -1, ['f_thumb'], 4, 1, { cropYield: 0.4 }],
    ['f_cook',   'Kitchen Know-How',  'i_bread',  2, 0,  ['f_thumb'], 1, 1, null, ['cooking']],
    ['f_seed',   'Seed Saver',        'i_seed_wheat', 2, 1, ['f_thumb'], 4, 1, { seedChance: 0.15 }],
    ['f_hardy',  'Hardy Crops',       'i_carrot', 3, -2, ['f_yield'], 3, 1, { grow: 0.08, cropYield: 0.2 }],
    ['f_gourmet', 'Gourmet',          'i_stew',   3, -1, ['f_cook', 'f_yield'], 4, 1, { foodPower: 0.12 }],
    ['f_chef',   'Master Chef',       'i_pie',    3, 0,  ['f_cook'], 1, 2, null, ['cooking2']],
    ['f_bake',   "Baker's Touch",     'k_flask',  3, 1,  ['f_cook'], 3, 1, { buffTime: 0.15 }],
    ['f_weave',  'Weaver',            'i_cloth',  3, 2,  ['f_seed'], 1, 1, null, ['weaving']],
    ['f_rain',   'Rain Dancer',       'k_drop',   4, -2, ['f_hardy'], 3, 1, { grow: 0.1 }],
    ['f_feast',  'Feast Table',       'i_pumpkin', 4, -1, ['f_gourmet'], 3, 2, { foodPower: 0.1, buffTime: 0.1 }],
    ['f_alch',   'Herbalist',         'i_herb',   4, 1,  ['f_bake', 'f_chef'], 1, 1, null, ['alchemy']],
    ['f_orchard', 'Orchard Keeper',   'i_berry',  4, 2,  ['f_weave'], 3, 1, { plant: 0.5, seedChance: 0.1 }],
    ['f_alch2',  'Master Brewer',     'i_potion_heal', 5, 1, ['f_alch'], 1, 2, null, ['alchemy2']],
    ['f_harvest', 'Harvest Festival', 'k_burst',  5, -1.5, ['f_rain', 'f_feast'], 3, 2, { cropYield: 0.5, luck: 0.02 }],
    ['f_garden', 'Garden of Plenty',  'k_crown',  6, -0.5, ['f_harvest'], 1, 4, { cropYield: 1, grow: 0.25, plant: 1 }, null, 'Crops come thick and fast.', true],
    ['f_golden', 'Golden Harvest',    'k_crown',  7, 0,  ['f_garden', 'f_alch2'], 1, 4, { seedChance: 0.2, sell: 0.1, cropYield: 0.5 }, null, 'The farm pays you back.', true],
]);

const INDUSTRY = branch('industry', [
    ['i_smith',  'Blacksmithing',     'k_anvil',  1, 0,  ['hub'], 1, 1, null, ['smithing']],
    ['i_fuel',   'Efficient Burn',    'i_coal',   2, -1, ['i_smith'], 4, 1, { fuelSave: 0.12 }],
    ['i_smelt',  'Hot Fire',          'k_flame',  2, 0,  ['i_smith'], 4, 1, { smelt: 0.15 }],
    ['i_craft',  'Frugal Crafter',    'k_coin',   2, 1,  ['i_smith'], 4, 1, { craftSave: 0.06 }],
    ['i_smith3', 'Crystalwork',       'i_crystal', 3, -2, ['i_smith2'], 1, 3, null, ['smithing3']],
    ['i_smith2', 'Steelwork',         'i_steel',  3, -1, ['i_smelt', 'i_fuel'], 1, 2, null, ['smithing2']],
    ['i_eng',    'Engineering',       'k_gear',   3, 0,  ['i_smelt', 'i_craft'], 1, 2, null, ['engineering']],
    ['i_build',  'Master Builder',    'k_hammer', 3, 1.5, ['i_craft'], 4, 1, { buildCost: -0.06 }],
    ['i_belts',  'Logistics',         'k_belt',   4, -1, ['i_eng'], 1, 2, null, ['logistics']],
    ['i_drills', 'Mining Machines',   'k_drill',  4, 0,  ['i_eng'], 1, 2, null, ['drills']],
    ['i_power',  'Electricity',       'k_bolt',   4, 1,  ['i_eng'], 1, 2, null, ['power']],
    ['i_speed',  'Overclock',         'k_gear',   5, -2, ['i_belts'], 4, 1, { machineSpeed: 0.1 }],
    ['i_belt2',  'Fast Belts',        'k_belt',   5, -1, ['i_belts'], 3, 1, { beltSpeed: 0.2 }],
    ['i_yield',  'Drill Bits',        'k_drill',  5, 0,  ['i_drills'], 4, 1, { drillYield: 0.12 }],
    ['i_grid',   'Efficient Grid',    'k_bolt',   5, 1,  ['i_power'], 4, 1, { powerSave: 0.1 }],
    ['i_asm',    'Assembly',          'k_robot',  5, 2,  ['i_power'], 1, 3, null, ['assembly']],
    ['i_auto',   'Full Automation',   'k_crown',  7, 0,  ['i_speed', 'i_yield', 'i_grid', 'i_belt2'], 1, 4, { machineSpeed: 0.25, beltSpeed: 0.25, drillYield: 0.25 }, null, 'The factory runs itself.', true],
]);

const COMBAT = branch('combat', [
    ['c_vit',    'Vitality',          'i_charm_vital', 1, 0, ['hub'], 6, 1, { maxHearts: 0.5 }],
    ['c_brawn',  'Brawler',           'k_fist',   2, -1, ['c_vit'], 5, 1, { dmgPct: 0.08 }],
    ['c_skin',   'Iron Skin',         'k_shield', 2, 0,  ['c_vit'], 4, 1, { armor: 0.25 }],
    ['c_edge',   'Sharpened Edge',    'k_sword',  2, 1,  ['c_vit'], 4, 1, { dmg: 0.25 }],
    ['c_crit',   'Deadly Aim',        'k_target', 3, -2, ['c_brawn'], 4, 1, { crit: 0.05 }],
    ['c_night',  'Night Hunter',      'k_moon',   3, -1, ['c_brawn'], 4, 1, { nightDmg: 0.1 }],
    ['c_vamp',   'Bloodthirst',       'k_drop',   3, 0,  ['c_skin'], 3, 1, { vamp: 0.06 }],
    ['c_dodge',  'Nimble',            'k_boot',   3, 1,  ['c_edge'], 4, 1, { dodge: 0.04 }],
    ['c_wind',   'Second Wind',       'k_heart',  3, 2,  ['c_edge'], 1, 2, null, ['secondwind'], 'Once a day, get back up on your own.'],
    ['c_boss',   'Boss Hunter',       'k_skull',  4, -1.5, ['c_crit', 'c_night'], 4, 1, { bossDmg: 0.1 }, ['altar'], 'Unlocks the Boss Altar: craft sigils and summon the island\u2019s bosses.'],
    ['c_guard',  'Bulwark',           'k_shield', 4, 0,  ['c_skin', 'c_vamp'], 3, 2, { armor: 0.25, maxHearts: 0.5 }],
    ['c_dash',   'Dash',              'k_boot',   4, 1.5, ['c_dodge', 'c_wind'], 1, 2, null, ['dash'], 'Press Shift to roll away with brief invulnerability.'],
    ['c_heal',   'Field Medic',       'i_potion_heal', 5, 0.5, ['c_guard'], 3, 1, { healPower: 0.15 }],
    ['c_exec',   'Executioner',       'k_skull',  5, -1, ['c_boss'], 3, 2, { dmgPct: 0.1, crit: 0.03 }],
    ['c_resolve', "Hero's Resolve",   'k_crown',  6, -0.5, ['c_exec', 'c_heal'], 1, 4, { maxHearts: 2, dmgPct: 0.2, armor: 0.5 }, null, 'Stand where others fall.', true],
    ['c_last',   'Unbreakable',       'k_crown',  7, 0,  ['c_resolve'], 1, 4, { dodge: 0.08, armor: 0.5, vamp: 0.1 }, null, 'You simply do not stay down.', true],
    ['c_war',    'Warcry',            'k_burst',  5, 2,  ['c_dash'], 3, 1, { dmgPct: 0.06, swingSpeed: 0.05 }],
]);

const TAMING = branch('taming', [
    ['t_pod',    'Pod Crafter',       'k_paw',    1, 0,  ['hub'], 1, 1, null, ['taming'], 'Craft pods and build dens.'],
    ['t_gentle', 'Gentle Hands',      'k_hand',   2, -1, ['t_pod'], 5, 1, { catch: 0.06 }],
    ['t_slot',   'Den Keeper',        'k_den',    2, 0,  ['t_pod'], 3, 2, { creatureSlots: 1 }],
    ['t_foreman', 'Foreman',          'k_hammer', 2, 1,  ['t_pod'], 5, 1, { work: 0.1 }],
    ['t_xp',     'Fast Learners',     'k_star',   3, -2, ['t_gentle'], 4, 1, { creatureXp: 0.1 }],
    ['t_whisper', 'Beast Whisperer',  'k_ear',    3, -1, ['t_gentle'], 1, 2, { catch: 0.12 }, ['greaterpod']],
    ['t_bond',   'Bonded',            'k_heart',  3, 0,  ['t_slot'], 4, 1, { companionDmg: 0.12 }],
    ['t_feed',   'Good Provider',     'i_berry',  3, 1,  ['t_foreman'], 3, 1, { work: 0.05, creatureXp: 0.05 }],
    ['t_stable', 'Stable Master',     'k_den',    3, 2,  ['t_slot', 't_foreman'], 2, 2, { creatureSlots: 1 }],
    ['t_rare',   'Rare Finder',       'k_eye',    4, -2, ['t_xp', 't_whisper'], 1, 2, null, ['rarecatch'], 'Rarer creatures start to show themselves.'],
    ['t_pack',   'Pack Leader',       'k_paw',    4, -0.5, ['t_bond', 't_whisper'], 3, 1, { companionDmg: 0.1, armor: 0.1 }],
    ['t_over',   'Overseer',          'k_whistle', 4, 1.5, ['t_feed', 't_stable'], 3, 1, { work: 0.12 }],
    ['t_breed',  'Matchmaker',        'k_heart',  4, 0.5, ['t_bond', 't_feed'], 1, 2, null, ['breeding'], 'Build a Hatchery: two creatures, a few treats, and an egg.'],
    ['t_nursery', 'Nursery',          'k_den',    5, 0,  ['t_breed'], 3, 2, { breed: 0.2, creatureXp: 0.05 }],
    ['t_prime',  'Prime Training',    'k_star',   5, -1.5, ['t_rare', 't_pack'], 3, 2, { creatureXp: 0.2, companionDmg: 0.1 }],
    ['t_hive',   'Hive Mind',         'k_gear',   5, 1.5, ['t_over'], 3, 2, { work: 0.15, machineSpeed: 0.05 }],
    ['t_mentor', 'Shared Lessons',    'k_book',   4, 2.8, ['t_stable', 't_over'], 3, 1, { crewXp: 0.1 }, null, 'You learn from your creatures\' work: more of the XP they earn on jobs comes to you.'],
    ['t_lore',   'Pack Lore',         'k_star',   6, 2.2, ['t_hive', 't_mentor'], 1, 3, { crewXp: 0.25, creatureXp: 0.1 }, null, 'Every job your creatures do teaches you something.'],
    ['t_master', 'Beastmaster',       'k_crown',  6, 0,  ['t_prime', 't_hive', 't_pack'], 1, 4, { creatureSlots: 2, work: 0.2, companionDmg: 0.2 }, null, 'The wild answers when you call.', true],
    ['t_spirit', 'Spirit Bond',       'k_crown',  7, 0,  ['t_master'], 1, 4, { catch: 0.2, creatureXp: 0.3, healPower: 0.2 }, null, 'A bond beyond words.', true],
]);

const EXPLORE = branch('explore', [
    ['x_swift',  'Swift Feet',        'k_boot',   1, 0,  ['hub'], 5, 1, { moveSpeed: 0.04 }],
    ['x_stam',   'Stamina',           'k_bolt',   2, -1, ['x_swift'], 5, 1, { maxEnergy: 10 }],
    ['x_regen',  'Catch Your Breath', 'k_lung',   2, 0,  ['x_swift'], 4, 1, { energyRegen: 0.2 }],
    ['x_pack',   'Backpack',          'k_bag',    2, 1,  ['x_swift'], 4, 1, { carry: 25 }],
    ['x_haggle', 'Haggler',           'k_coin',   3, -2, ['x_stam'], 5, 1, { sell: 0.06 }],
    ['x_scholar', 'Scholar',          'k_book',   3, -1, ['x_stam'], 5, 1, { xp: 0.06 }],
    ['x_land',   'Land Baron',        'k_flag',   3, 0,  ['x_regen'], 5, 1, { landCost: -0.05 }],
    ['x_bag',    'Pack Rat',          'k_bag',    3, 1.5, ['x_pack'], 3, 1, { carry: 40, magnet: 0.1 }],
    ['x_trade',  'Merchant Contacts', 'k_coin',   4, -2, ['x_haggle'], 1, 2, null, ['trader'], 'A travelling trader visits your market.'],
    ['x_wise',   'Wisdom',            'k_book',   4, -1, ['x_scholar'], 4, 2, { xp: 0.06 }],
    ['x_way',    'Waystones',         'k_compass', 4, 0.5, ['x_land', 'x_bag'], 1, 2, null, ['waystone'], 'Build waystones to travel between them instantly.'],
    ['x_angler', 'Angler',            'k_drop',   4, 2.4, ['x_bag'], 4, 1, { fishSpeed: 0.1 }, null, 'Fish bite sooner.'],
    ['x_lure',   'Lure Maker',        'k_clover', 5, 3,  ['x_angler'], 3, 1, { fishLuck: 0.12 }, null, 'Rarer fish, and bigger ones.'],
    ['x_haul',   'Big Haul',          'k_bag',    6, 3.4, ['x_lure'], 2, 2, { fishSpeed: 0.1, fishLuck: 0.1, luck: 0.04 }, null, 'Sometimes two fish take the hook.'],
    ['x_fortune', 'Fortune',          'k_clover', 5, -3, ['x_trade'], 3, 1, { luck: 0.04, chestLoot: 0.15, sell: 0.04 }],
    ['x_exped',  'Expedition Pass',   'k_map',    5, 0,  ['x_way'], 1, 3, null, ['expedition'], 'Launch expeditions to far-off islands.'],
    ['x_endure', 'Endurance',         'k_lung',   5, -2, ['x_wise', 'x_trade'], 3, 2, { maxEnergy: 20, energyRegen: 0.2, armor: 0.1 }],
    ['x_sage',   'Sage',              'k_book',   6, -2.6, ['x_endure', 'x_fortune'], 3, 2, { xp: 0.1, buffTime: 0.05 }, null, 'A lifetime of lessons: more XP from everything.'],
    ['x_wander', 'Wanderer',          'k_crown',  6, -1, ['x_endure', 'x_exped'], 1, 4, { moveSpeed: 0.15, maxEnergy: 30, carry: 50, xp: 0.1 }, null, 'The road never tires you.', true],
    ['x_world',  'World Walker',      'k_crown',  7, 0,  ['x_wander'], 1, 4, { landCost: -0.2, buildCost: -0.15, sell: 0.1 }, null, 'The world is yours to shape.', true],
]);

export const SKILL_LIST: SkillNode[] = [...GATHER, ...FARM, ...INDUSTRY, ...COMBAT, ...TAMING, ...EXPLORE];
export const SKILLS: Record<string, SkillNode> = Object.fromEntries(SKILL_LIST.map((n) => [n.id, n]));

/** Tokens → what they unlock (shown in tooltips and locked-recipe hints). */
export const UNLOCK_INFO: Record<string, string> = {
    smithing: 'Unlocks the Anvil: iron picks, weapons, armor and gears.',
    smithing2: 'Unlocks steel, golden picks and steel weapons and armor.',
    smithing3: 'Unlocks crystal picks and staffs.',
    cooking: 'Unlocks the Kitchen.',
    cooking2: 'Unlocks pies and feasts.',
    weaving: 'Unlocks the Loom: cloth and clothing.',
    alchemy: 'Unlocks the Alchemy Table: potions.',
    alchemy2: 'Unlocks swift brews and charms.',
    engineering: 'Unlocks circuits and engineering.',
    logistics: 'Unlocks belts, inserters, sorters and the export chute.',
    drills: 'Unlocks mining drills.',
    power: 'Unlocks power poles, generators and wind turbines.',
    assembly: 'Unlocks assemblers.',
    taming: 'Unlocks taming pods, creature treats and Creature Dens.',
    breeding: 'Unlocks the Hatchery: breed two of your creatures for an egg.',
    greaterpod: 'Unlocks greater pods.',
    rarecatch: 'Rare creatures appear more often.',
    secondwind: 'Once a day, get back up on your own.',
    dash: 'Press Shift to roll away.',
    trader: 'A travelling trader visits your market.',
    waystone: 'Unlocks waystones: fast travel.',
    expedition: 'Unlocks the Expedition Dock and the Rift Forge.',
    altar: 'Unlocks the Boss Altar: craft sigils and summon bosses.',
    mineshaft: 'Unlocks the Mine Shaft: a way down to the caves under the world.',
};

/** The skill that grants an unlock token (null for a token no skill gives). */
export const skillForUnlock = (token: string | undefined): SkillNode | null => (token && SKILL_LIST.find((s) => s.unlock?.includes(token))) || null;

/** What a locked thing says in a footer: which skill to learn, in which branch, and what that skill opens up. */
export function lockedWords (token: string | undefined): string {
    const s = skillForUnlock(token);
    const what = (token && UNLOCK_INFO[token]) || '';
    if (!s) return `Locked: ${what || token || 'learn more in the skill tree'}`;
    return `Locked: learn ${s.name} (${BRANCHES[s.branch].name})${what ? `. ${what}` : ''}`;
}

export const SKILL_POINT_TOTAL = SKILL_LIST.reduce((n, s) => n + s.cost * s.max, 0);

// ── layout ─────────────────────────────────────────────────────────────────
/** Radius of ring `u`, and the arc length between lateral neighbours (`v` steps). */
const TREE_RING = { base: 40, step: 115, arc: 72 };

/** Node position in tree space (hub at 0,0, y down): a fan, so branches never collide. */
export function skillPos (n: SkillNode) {
    const r = TREE_RING.base + n.u * TREE_RING.step;
    const a = ((BRANCHES[n.branch].angle) * Math.PI) / 180 + (n.v * TREE_RING.arc) / r;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}
