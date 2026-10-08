// Biomes and plot modifiers — the dice rolled for each piece of land.

import { PAL } from '../palette';
import type { NodeKind } from './nodes';

export const BIOMES = ['meadow', 'quarry', 'goldsand', 'snowcap', 'bog'] as const;
export type Biome = typeof BIOMES[number];

interface BiomeDef {
    name: string;
    color: number;                              // UI accent + minimap
    nodes: Partial<Record<NodeKind, number>>;   // respawn weights
    priceMul: number;
}

export const BIOME_DEFS: Record<Biome, BiomeDef> = {
    meadow:   { name: 'Meadow',   color: PAL.grass,  priceMul: 1,    nodes: { tree: 34, bush: 18, flower: 16, rock: 12, cotton: 8, reeds: 6, herb: 4, clay: 5, gold: 3 } },
    quarry:   { name: 'Quarry',   color: PAL.stone,  priceMul: 1,    nodes: { rock: 28, iron: 26, copper: 18, coal: 18, clay: 5, tree: 6, flower: 4 } },
    goldsand: { name: 'Goldsand', color: PAL.gold,   priceMul: 1.1,  nodes: { gold: 22, sand: 24, rock: 18, copper: 10, tree: 10, bush: 8, flower: 6 } },
    snowcap:  { name: 'Snowcap',  color: PAL.foam,   priceMul: 1.15, nodes: { coal: 22, iron: 20, rock: 16, tree: 16, copper: 8, crystal: 8, gold: 4 } },
    bog:      { name: 'Bog',      color: PAL.plum,   priceMul: 1.15, nodes: { mushroom: 24, tree: 20, reeds: 14, herb: 14, peat: 14, clay: 10, rock: 6, crystal: 4 } },
};

export type ModKind = 'bountiful' | 'fertile' | 'treasure' | 'haunted' | 'fairy' | 'ruins';

export const MODS: Record<ModKind, { name: string; desc: string; priceMul: number; color: number }> = {
    bountiful: { name: 'Bountiful',  desc: '+1 to every drop here',        priceMul: 1.15, color: PAL.gold },
    fertile:   { name: 'Fertile',    desc: 'Regrows twice as fast',        priceMul: 1.1,  color: PAL.lime },
    treasure:  { name: 'Treasure',   desc: 'A chest waits here',           priceMul: 1.25, color: PAL.pumpkin },
    haunted:   { name: 'Haunted',    desc: 'Cheap — but monsters gather',  priceMul: 0.7,  color: PAL.plum },
    ruins:     { name: 'Ancient Ruins', desc: 'Elite guardians watch over a vault', priceMul: 1.4, color: PAL.sand },
    fairy:     { name: 'Fairy Ring', desc: 'Heals you while you stand in it', priceMul: 1.2, color: PAL.blossom },
};
