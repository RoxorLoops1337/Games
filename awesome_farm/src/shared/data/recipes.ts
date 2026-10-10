import type { ProcId, StationId } from './buildings';
import type { Cost, ItemId } from './items';

export interface Recipe {
    id: string;
    out: ItemId;
    n: number;
    in: Cost;
    station: StationId | ProcId;
    xp: number;
    req?: string;              // unlock token (granted by a skill)
    time: number;              // processor seconds (stations craft instantly)
    unlockedBy?: string;       // free-text hint shown while locked
}

type Row = [station: StationId | ProcId, out: ItemId, n: number, inp: Cost, xp: number, extra?: { req?: string; time?: number }];

const ROWS: Row[] = [
    // by hand
    ['hand', 'rope', 1, { fiber: 2 }, 1],
    ['hand', 'bait', 2, { fiber: 2, berry: 1 }, 0],
    // workbench
    ['workbench', 'plank', 1, { wood: 2 }, 1],
    ['workbench', 'rod', 1, { wood: 4, rope: 3 }, 4],
    ['workbench', 'bait', 4, { fish_minnow: 2 }, 0],
    ['workbench', 'bow_wood', 1, { wood: 4, rope: 3 }, 8],
    ['workbench', 'club', 1, { wood: 6 }, 2],
    ['workbench', 'bag_satchel', 1, { rope: 3, fiber: 8, plank: 2 }, 6],
    ['workbench', 'bag_rucksack', 1, { hide: 6, rope: 6, plank: 4 }, 12],
    ['workbench', 'seed_wheat', 2, { wheat: 1 }, 0],
    ['workbench', 'seed_carrot', 2, { carrot: 1 }, 0],
    ['workbench', 'seed_pumpkin', 2, { pumpkin: 1 }, 0],
    ['workbench', 'seed_cotton', 2, { cotton: 1 }, 0],
    ['workbench', 'seed_beet', 2, { beet: 1 }, 0],
    ['workbench', 'seed_corn', 2, { corn: 1 }, 0],
    ['workbench', 'seed_melon', 2, { melon: 1 }, 0],
    ['workbench', 'seed_pepper', 2, { pepper: 1 }, 0],
    ['workbench', 'seed_flax', 2, { flax: 1 }, 0],
    // anvil
    ['anvil', 'rod_fine', 1, { ironbar: 3, rope: 4, plank: 2 }, 14],
    ['anvil', 'rod_master', 1, { crystal: 2, goldbar: 2, rope: 4 }, 30, { req: 'smithing3' }],
    ['anvil', 'pick_iron', 1, { ironbar: 4, plank: 2 }, 14],
    ['anvil', 'pick_gold', 1, { goldbar: 4, ironbar: 2, plank: 2 }, 28, { req: 'smithing2' }],
    ['anvil', 'pick_crystal', 1, { crystal: 6, goldbar: 3, steel: 2 }, 60, { req: 'smithing3' }],
    ['anvil', 'sword_iron', 1, { ironbar: 3, plank: 1 }, 12],
    ['anvil', 'sword_steel', 1, { steel: 4, plank: 1 }, 30, { req: 'smithing2' }],
    ['anvil', 'spear_iron', 1, { ironbar: 3, rope: 1, plank: 2 }, 12],
    ['anvil', 'hammer_iron', 1, { ironbar: 5, plank: 2 }, 16],
    ['anvil', 'staff_crystal', 1, { crystal: 8, goldbar: 2, plank: 2 }, 70, { req: 'smithing3' }],
    ['anvil', 'helm_iron', 1, { ironbar: 4 }, 12],
    ['anvil', 'mail_iron', 1, { ironbar: 8, cloth: 2 }, 22],
    ['anvil', 'helm_steel', 1, { steel: 4, cloth: 1 }, 34, { req: 'smithing2' }],
    ['anvil', 'plate_steel', 1, { steel: 10, cloth: 3 }, 50, { req: 'smithing2' }],
    ['anvil', 'ring_copper', 1, { copperbar: 3 }, 8],
    ['anvil', 'ring_iron', 1, { ironbar: 3 }, 8],
    ['anvil', 'ring_gold', 1, { goldbar: 2 }, 22, { req: 'smithing2' }],
    ['anvil', 'ring_steel', 1, { steel: 2, ironbar: 1 }, 24, { req: 'smithing2' }],
    ['anvil', 'ring_crystal', 1, { crystal: 3, goldbar: 1 }, 50, { req: 'smithing3' }],
    ['anvil', 'ring_blight', 1, { blightcore: 2, ironbar: 2 }, 30],
    ['anvil', 'gear', 1, { ironbar: 2 }, 3],
    ['anvil', 'wire', 2, { copperbar: 1 }, 3],
    ['anvil', 'circuit', 1, { wire: 3, ironbar: 1, glass: 1 }, 10, { req: 'engineering' }],
    ['anvil', 'motor', 1, { gear: 3, wire: 4, ironbar: 2 }, 16, { req: 'engineering' }],
    // kitchen
    ['kitchen', 'bread', 1, { flour: 2 }, 3],
    ['kitchen', 'stew', 1, { carrot: 2, mushroom: 2 }, 6],
    ['kitchen', 'fish_pie', 1, { fish_carp: 1, fish_perch: 1, flour: 1 }, 6],
    ['kitchen', 'smoked_trout', 1, { fish_trout: 1, coal: 1 }, 6],
    ['kitchen', 'baked_bass', 1, { fish_bass: 1, berry: 2 }, 6],
    ['kitchen', 'stewed_eel', 1, { fish_eel: 1, carrot: 1, beet: 1 }, 8, { req: 'cooking2' }],
    ['kitchen', 'catfish_stew', 1, { fish_catfish: 1, pepper: 1, carrot: 1 }, 8, { req: 'cooking2' }],
    ['kitchen', 'koi_sashimi', 1, { fish_koi: 1 }, 12, { req: 'cooking2' }],
    ['kitchen', 'lantern_soup', 1, { fish_lantern: 1, mushroom: 2 }, 10, { req: 'cooking2' }],
    ['kitchen', 'pike_roast', 1, { fish_pike: 1, pepper: 1 }, 12, { req: 'cooking2' }],
    ['kitchen', 'soup', 1, { beet: 2, carrot: 1 }, 5],
    ['kitchen', 'cornbread', 1, { flour: 1, corn: 2 }, 5],
    ['kitchen', 'jam', 1, { berry: 6 }, 4],
    ['kitchen', 'melon_ice', 1, { melon: 1, berry: 2 }, 7],
    ['kitchen', 'spicy_stew', 1, { pepper: 2, carrot: 2, mushroom: 2 }, 12, { req: 'cooking2' }],
    ['kitchen', 'pie', 1, { pumpkin: 1, flour: 1, berry: 2 }, 10, { req: 'cooking2' }],
    // loom
    ['loom', 'cloth', 1, { cotton: 3 }, 3],
    ['loom', 'rope', 3, { flax: 2 }, 3],
    ['loom', 'cap_cloth', 1, { cloth: 2 }, 5],
    ['loom', 'tunic_cloth', 1, { cloth: 4, rope: 1 }, 9],
    // alchemy
    ['alchemy', 'potion_heal', 1, { herb: 2, berry: 2, glass: 1 }, 6],
    ['alchemy', 'potion_energy', 1, { herb: 2, mushroom: 1, glass: 1 }, 6],
    ['alchemy', 'potion_swift', 1, { herb: 3, carrot: 1, glass: 1 }, 8, { req: 'alchemy2' }],
    ['alchemy', 'potion_vigor', 1, { herb: 3, melon: 1, glass: 1 }, 12, { req: 'alchemy2' }],
    ['alchemy', 'potion_night', 1, { batwing: 1, herb: 2, glass: 1 }, 12, { req: 'alchemy2' }],
    ['alchemy', 'relic_ember_chip', 1, { coal: 2, copperbar: 1 }, 10],
    ['alchemy', 'relic_ember_shard', 1, { coal: 4, copperbar: 2 }, 22, { req: 'alchemy2' }],
    ['alchemy', 'relic_ember_core', 1, { coal: 8, copperbar: 4, goldbar: 1 }, 50, { req: 'alchemy2' }],
    ['alchemy', 'relic_frost_chip', 1, { frostshard: 2, glass: 1 }, 10],
    ['alchemy', 'relic_frost_shard', 1, { frostshard: 4, glass: 2 }, 22, { req: 'alchemy2' }],
    ['alchemy', 'relic_frost_core', 1, { frostshard: 8, glass: 4, goldbar: 1 }, 50, { req: 'alchemy2' }],
    ['alchemy', 'relic_vine_chip', 1, { herb: 2, rope: 1 }, 10],
    ['alchemy', 'relic_vine_shard', 1, { herb: 4, rope: 2 }, 22, { req: 'alchemy2' }],
    ['alchemy', 'relic_vine_core', 1, { herb: 8, rope: 4, goldbar: 1 }, 50, { req: 'alchemy2' }],
    ['alchemy', 'relic_iron_chip', 1, { ironbar: 2, gear: 1 }, 10],
    ['alchemy', 'relic_iron_shard', 1, { ironbar: 4, gear: 2 }, 22, { req: 'alchemy2' }],
    ['alchemy', 'relic_iron_core', 1, { ironbar: 8, gear: 4, goldbar: 1 }, 50, { req: 'alchemy2' }],
    ['alchemy', 'relic_spirit_chip', 1, { ectoplasm: 2, shroud: 1 }, 10],
    ['alchemy', 'relic_spirit_shard', 1, { ectoplasm: 4, shroud: 2 }, 22, { req: 'alchemy2' }],
    ['alchemy', 'relic_spirit_core', 1, { ectoplasm: 8, shroud: 4, goldbar: 1 }, 50, { req: 'alchemy2' }],
    ['alchemy', 'charm_lucky', 1, { goldbar: 1, herb: 4, cloth: 1 }, 24, { req: 'alchemy2' }],
    ['alchemy', 'charm_swift', 1, { copperbar: 2, herb: 3, cloth: 1 }, 24, { req: 'alchemy2' }],
    ['alchemy', 'charm_vital', 1, { goldbar: 2, berry: 8, cloth: 1 }, 30, { req: 'alchemy2' }],
    // fortune
    ['workbench', 'charm_fortune', 1, { lantern_shard: 3, goldbar: 4, crystal: 4, pearl: 1 }, 120],
    // monster-part gear
    ['workbench', 'dagger_bone', 1, { bone: 4, rope: 1 }, 8],
    ['workbench', 'staff_apprentice', 1, { plank: 3, glass: 2, ectoplasm: 2 }, 14],
    ['workbench', 'bow_long', 1, { plank: 4, rope: 3, bone: 4, hide: 1 }, 20],
    ['anvil', 'dagger_steel', 1, { steel: 3, bone: 2, hide: 1 }, 24, { req: 'smithing2' }],
    ['anvil', 'spear_steel', 1, { steel: 5, rope: 1, plank: 2 }, 28, { req: 'smithing2' }],
    ['anvil', 'hammer_steel', 1, { steel: 7, plank: 2, rockheart: 1 }, 34, { req: 'smithing2' }],
    ['anvil', 'sword_crystal', 1, { crystal: 8, steel: 4, goldbar: 2 }, 70, { req: 'smithing3' }],
    ['anvil', 'helm_crystal', 1, { crystal: 8, steel: 3, cloth: 1 }, 60, { req: 'smithing3' }],
    ['anvil', 'plate_crystal', 1, { crystal: 14, steel: 6, cloth: 3 }, 90, { req: 'smithing3' }],
    ['loom', 'cap_hide', 1, { hide: 2, rope: 1 }, 6],
    ['loom', 'tunic_hide', 1, { hide: 4, cloth: 2, rope: 2 }, 12],
    ['loom', 'cloak_shroud', 1, { shroud: 4, cloth: 3, rope: 2 }, 30],
    ['alchemy', 'potion_might', 1, { slimegel: 3, berry: 3, herb: 1, glass: 1 }, 8],
    ['alchemy', 'potion_guard', 1, { hide: 1, herb: 2, toadskin: 1, glass: 1 }, 9],
    ['alchemy', 'potion_mend', 1, { slimegel: 2, ectoplasm: 1, herb: 2, glass: 1 }, 12, { req: 'alchemy2' }],
    // the XP brews
    ['alchemy', 'potion_study', 1, { herb: 3, berry: 2, mushroom: 1, glass: 1 }, 8],
    ['alchemy', 'potion_kin', 1, { treat: 1, herb: 2, berry: 2, glass: 1 }, 10],
    ['alchemy', 'potion_insight', 1, { herb: 3, crystal: 1, ectoplasm: 1, glass: 1 }, 14, { req: 'alchemy2' }],
    ['alchemy', 'potion_memory', 1, { crystal: 2, goldbar: 1, ectoplasm: 2, glass: 1 }, 30, { req: 'alchemy2' }],
    // creatures
    ['workbench', 'pod', 2, { plank: 2, fiber: 3, slimegel: 1 }, 6, { req: 'taming' }],
    ['workbench', 'pod_great', 2, { rope: 2, ironbar: 1, ectoplasm: 1 }, 14, { req: 'greaterpod' }],
    ['workbench', 'pod_ultra', 1, { goldbar: 1, crystal: 1, shroud: 1 }, 30, { req: 'rarecatch' }],
    ['kitchen', 'treat', 2, { flour: 1, berry: 2 }, 3, { req: 'taming' }],
    // boss sigils (the altar)
    ['anvil', 'bag_pack', 1, { ironbar: 4, hide: 8, rope: 8, cloth: 4 }, 18],
    ['anvil', 'bag_frame', 1, { steel: 6, hide: 10, rope: 12, cloth: 8 }, 30, { req: 'smithing2' }],
    ['riftforge', 'bag_rift', 1, { rift_shard: 20, crystal: 4, cloth: 10, rope: 10 }, 100],
    ['riftforge', 'sword_rift', 1, { rift_shard: 30, goldbar: 6, crystal: 4 }, 120],
    ['riftforge', 'bow_rift', 1, { rift_shard: 30, goldbar: 4, crystal: 4, rope: 6 }, 120],
    ['riftforge', 'helm_rift', 1, { rift_shard: 24, steel: 6, crystal: 3 }, 100],
    ['riftforge', 'plate_rift', 1, { rift_shard: 40, steel: 10, crystal: 6 }, 140],
    ['riftforge', 'charm_rift', 1, { rift_shard: 36, rift_core: 3, goldbar: 4 }, 160],
    ['altar', 'sigil_slime', 1, { slimegel: 12, berry: 6, fiber: 4 }, 20],
    ['altar', 'sigil_stone', 1, { rockheart: 4, ironbar: 10, stone: 30 }, 40],
    ['altar', 'sigil_bog', 1, { ectoplasm: 8, toadskin: 4, herb: 12 }, 40],
    ['altar', 'sigil_dune', 1, { scarabshell: 10, goldbar: 4, sand: 20 }, 60],
    ['altar', 'sigil_frost', 1, { frostshard: 8, steel: 5, crystal: 2 }, 60],
    ['altar', 'sigil_heart', 1, { trophy_slime: 1, trophy_stone: 1, trophy_bog: 1, trophy_dune: 1, trophy_frost: 1 }, 200],
    // processors (timed)
    ['furnace', 'ironbar', 1, { iron: 1 }, 2, { time: 3.2 }],
    ['furnace', 'copperbar', 1, { copper: 1 }, 2, { time: 3.2 }],
    ['furnace', 'goldbar', 1, { goldore: 1 }, 3, { time: 4.2 }],
    ['furnace', 'brick', 1, { clay: 2 }, 1, { time: 2.6 }],
    ['furnace', 'glass', 1, { sand: 2 }, 1, { time: 3 }],
    ['furnace', 'steel', 1, { ironbar: 2, coal: 1 }, 6, { time: 6, req: 'smithing2' }],
    ['sawmill', 'plank', 2, { wood: 1 }, 1, { time: 2 }],
    // assemblers build these on their own (pick one in the machine)
    ['assembler', 'gear', 1, { ironbar: 2 }, 1, { time: 2 }],
    ['assembler', 'wire', 2, { copperbar: 1 }, 1, { time: 1.5 }],
    ['assembler', 'circuit', 1, { wire: 3, ironbar: 1, glass: 1 }, 2, { time: 4, req: 'engineering' }],
    ['assembler', 'motor', 1, { gear: 3, wire: 4, ironbar: 2 }, 3, { time: 6, req: 'engineering' }],
    ['assembler', 'rope', 1, { fiber: 2 }, 1, { time: 1 }],
    ['assembler', 'plank', 2, { wood: 1 }, 1, { time: 1.5 }],
    ['assembler', 'cloth', 1, { cotton: 3 }, 1, { time: 3 }],
    ['assembler', 'flour', 1, { wheat: 2 }, 1, { time: 2 }],
    ['assembler', 'bread', 1, { flour: 2 }, 2, { time: 4 }],
    ['assembler', 'pod', 2, { plank: 2, fiber: 3, slimegel: 1 }, 2, { time: 3, req: 'taming' }],
    ['assembler', 'treat', 2, { flour: 1, berry: 2 }, 2, { time: 3, req: 'taming' }],
    ['assembler', 'core', 1, { circuit: 4, motor: 2, crystal: 2 }, 12, { time: 20, req: 'engineering' }],
    ['millstone', 'flour', 1, { wheat: 2 }, 1, { time: 3 }],
];

export const RECIPES: Record<string, Recipe> = {};
export const RECIPE_LIST: Recipe[] = ROWS.map(([station, out, n, inp, xp, extra]) => {
    const r: Recipe = { id: `${station}:${out}`, out, n, in: inp, station, xp, req: extra?.req, time: extra?.time ?? 0 };
    RECIPES[r.id] = r;
    return r;
});

/** The recipes of each station, in list order. Grouped once: the machines ask every step. */
const RECIPES_BY_STATION: Partial<Record<StationId | ProcId, Recipe[]>> = {};
for (const r of RECIPE_LIST) (RECIPES_BY_STATION[r.station] ??= []).push(r);
const NONE: Recipe[] = [];

/** The recipes a station (or a processor) can make. The list is shared: never change it in place. */
export const recipesFor = (station: StationId | ProcId): readonly Recipe[] => RECIPES_BY_STATION[station] ?? NONE;
