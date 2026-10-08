// Harvestable resource nodes. Each sits on one tile and blocks movement.

import type { Action } from '../actions';
import type { Biome } from './biomes';
import type { Res } from './items';

export type NodeKind =
    | 'tree' | 'rock' | 'iron' | 'copper' | 'gold' | 'coal' | 'sand' | 'clay' | 'peat' | 'crystal'
    | 'bush' | 'flower' | 'mushroom' | 'reeds' | 'herb' | 'cotton' | 'chest' | 'vault' | 'mound'
    | 'titan_oak' | 'titan_rock';
/** Skills key off the group (Lumberjack → wood, Prospector → ore…). */
export type NodeGroup = 'wood' | 'stone' | 'ore' | 'earth' | 'gem' | 'plant' | 'chest';

/** [resource, min, max, chance = 1] */
type DropRoll = [Res, number, number, number?];

interface NodeDef {
    name: string;
    hp: number;
    xp: number;
    group: NodeGroup;
    tex: (b: Biome) => string;
    hit: Action;              // fx on a non-final hit
    brk: Action;              // fx when it breaks
    drops: DropRoll[];
    minTier?: number;         // pick tier needed to damage it
    tall?: boolean;           // drawn above the player when they stand behind it
    titan?: true;             // a Titan node: only takes damage while two or more farmers are swinging at it together (sim/titan.ts); creatures cannot work it
}

/** Titan nodes (a Great Oak, a Titan Boulder): the dials. Rules in sim/titan.ts. */
export const TITAN = {
    window: 3,            // s: a farmer's swing counts as a "hand" on the node for this long
    minHands: 2,          // different farmers within the window before a hit does damage
    share: 6,             // s: everyone who swung within this long of its fall shares what it drops
    handBonus: 0.5,       // each hand beyond the first adds this much to what EVERY helper gets (×1.5 with two hands, ×2 with three…)
    maxHands: 4,          // … up to this many hands; more may help, and are paid at the four-hand rate
    sayEvery: 4,          // s between two "Needs a friend!" floats for one farmer
    farmers: 2,           // a world only grows Titans once this many farmers have a farm in it (online or not)
    chance: 0.02,         // a tree or boulder that grows on owned land is a Titan this often
    perPlot: 1,           // never more than this many on one island …
    worldCap: (owned: number) => 1 + Math.floor(owned / 4),     // … nor in the whole world (owned islands → most Titans standing)
} as const;

export const NODES: Record<NodeKind, NodeDef> = {
    tree:     { name: 'Tree', hp: 3, xp: 2, group: 'wood', tex: (b) => (b === 'snowcap' ? 'pine' : 'tree'), hit: 'hitWood', brk: 'breakTree', drops: [['wood', 2, 3], ['seed_pumpkin', 1, 1, 0.08]], tall: true },
    rock:     { name: 'Boulder', hp: 4, xp: 3, group: 'stone', tex: () => 'rock', hit: 'hitStone', brk: 'breakRock', drops: [['stone', 2, 3], ['coal', 1, 1, 0.25]] },
    iron:     { name: 'Iron vein', hp: 6, xp: 5, group: 'ore', tex: () => 'ore_iron', hit: 'hitStone', brk: 'breakOre', drops: [['iron', 1, 2], ['stone', 1, 1]] },
    copper:   { name: 'Copper vein', hp: 6, xp: 5, group: 'ore', tex: () => 'ore_copper', hit: 'hitStone', brk: 'breakOre', drops: [['copper', 1, 2], ['stone', 1, 1]] },
    gold:     { name: 'Gold vein', hp: 7, xp: 6, group: 'ore', tex: () => 'ore_gold', hit: 'hitStone', brk: 'breakOre', drops: [['goldore', 1, 2], ['coin', 1, 2, 0.4]] },
    coal:     { name: 'Coal seam', hp: 5, xp: 4, group: 'ore', tex: () => 'ore_coal', hit: 'hitStone', brk: 'breakRock', drops: [['coal', 2, 3]] },
    sand:     { name: 'Sand dune', hp: 2, xp: 2, group: 'earth', tex: () => 'sand', hit: 'hitEarth', brk: 'breakEarth', drops: [['sand', 2, 4]] },
    clay:     { name: 'Clay bank', hp: 3, xp: 2, group: 'earth', tex: () => 'clay', hit: 'hitEarth', brk: 'breakEarth', drops: [['clay', 2, 3]] },
    peat:     { name: 'Peat mound', hp: 3, xp: 2, group: 'earth', tex: () => 'peat', hit: 'hitEarth', brk: 'breakEarth', drops: [['peat', 2, 3]] },
    crystal:  { name: 'Crystal cluster', hp: 10, xp: 16, group: 'gem', tex: () => 'crystal', hit: 'hitCrystal', brk: 'breakCrystal', drops: [['crystal', 1, 2], ['stone', 1, 1]], minTier: 2 },
    bush:     { name: 'Berry bush', hp: 1, xp: 1, group: 'plant', tex: () => 'bush', hit: 'breakPlant', brk: 'breakPlant', drops: [['berry', 1, 3], ['seed_carrot', 1, 1, 0.2], ['seed_pepper', 1, 1, 0.14]] },
    flower:   { name: 'Wildflower', hp: 1, xp: 1, group: 'plant', tex: () => 'flower', hit: 'breakPlant', brk: 'breakPlant', drops: [['seed_wheat', 1, 2, 0.85], ['seed_carrot', 1, 1, 0.3], ['seed_cotton', 1, 1, 0.2], ['seed_beet', 1, 1, 0.22], ['seed_corn', 1, 1, 0.18]] },
    mushroom: { name: 'Mushroom', hp: 1, xp: 2, group: 'plant', tex: (b) => (b === 'bog' ? 'mushroom_bog' : 'mushroom'), hit: 'breakPlant', brk: 'breakPlant', drops: [['mushroom', 1, 2]] },
    reeds:    { name: 'Reeds', hp: 1, xp: 1, group: 'plant', tex: () => 'reeds', hit: 'breakPlant', brk: 'breakPlant', drops: [['fiber', 2, 3], ['seed_flax', 1, 1, 0.22]] },
    herb:     { name: 'Swamp herb', hp: 1, xp: 2, group: 'plant', tex: () => 'herb', hit: 'breakPlant', brk: 'breakPlant', drops: [['herb', 1, 2]] },
    cotton:   { name: 'Wild cotton', hp: 1, xp: 2, group: 'plant', tex: () => 'cottonplant', hit: 'breakPlant', brk: 'breakPlant', drops: [['cotton', 1, 3], ['seed_cotton', 1, 1, 0.25]] },
    vault:    { name: 'Ancient vault', hp: 2, xp: 40, group: 'chest', tex: () => 'vault', hit: 'openChest', brk: 'openChest', drops: [['coin', 40, 80], ['goldbar', 2, 4], ['crystal', 1, 3, 0.6], ['potion_heal', 2, 3], ['pod_great', 1, 2], ['steel', 2, 4, 0.6], ['ironbar', 3, 6], ['treat', 2, 4], ['potion_might', 1, 1, 0.5]] },
    mound:    { name: 'Buried treasure', hp: 2, xp: 8, group: 'chest', tex: () => 'mound', hit: 'dig', brk: 'dig', drops: [] },       // what it holds is rolled by sim/fortune.ts
    titan_oak:  { name: 'Great Oak', hp: 120, xp: 40, group: 'wood', tex: (b) => (b === 'snowcap' ? 'titan_pine' : 'titan_oak'), hit: 'hitWood', brk: 'breakTree', drops: [['wood', 36, 48], ['seed_pumpkin', 1, 2, 0.5]], tall: true, titan: true },
    titan_rock: { name: 'Titan Boulder', hp: 150, xp: 48, group: 'stone', tex: () => 'titan_rock', hit: 'hitStone', brk: 'breakRock', drops: [['stone', 36, 48], ['coal', 4, 8, 0.6]], titan: true },
    chest:    { name: 'Treasure chest', hp: 1, xp: 10, group: 'chest', tex: () => 'chest', hit: 'openChest', brk: 'openChest', drops: [['coin', 10, 18], ['ironbar', 1, 2, 0.5], ['goldbar', 1, 1, 0.2], ['potion_heal', 1, 1, 0.35], ['seed_pumpkin', 1, 2], ['seed_melon', 1, 2, 0.5]] },
};
