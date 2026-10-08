// Dedicated chests: a chest can be set to take only some things (all the ores, only stone, just seeds…) and wear an icon you can see
// from across the farm. A filter is a short list of entries: `#ore` for a whole category, or an item id for one thing.
// A chest with no filter takes everything, as it always did.

import { ITEMS, ITEM_ORDER, ItemId } from './items';

interface FilterCat {
    id: string;
    name: string;
    /** An item whose icon stands for the category. */
    icon: ItemId;
    desc: string;
    has (item: ItemId): boolean;
}

const kindOf = (item: ItemId) => ITEMS[item].kind;
/** The fish you pull out of the water (fish pie is a dish). */
const isRawFish = (i: ItemId) => i.startsWith('fish_') && i !== 'fish_pie';
const IS = (...ids: ItemId[]) => { const s = new Set<ItemId>(ids); return (i: ItemId) => s.has(i); };

export const FILTER_CATS: FilterCat[] = [
    { id: 'ore', name: 'Ores', icon: 'iron', desc: 'Coal, iron, copper, gold ore and crystals.', has: IS('coal', 'iron', 'copper', 'goldore', 'crystal') },
    { id: 'stone', name: 'Stone & earth', icon: 'stone', desc: 'Stone, sand, clay, peat, bricks and glass.', has: IS('stone', 'sand', 'clay', 'peat', 'brick', 'glass') },
    { id: 'bars', name: 'Bars', icon: 'ironbar', desc: 'Iron, copper and gold bars, and steel.', has: IS('ironbar', 'copperbar', 'goldbar', 'steel') },
    { id: 'wood', name: 'Wood & fibre', icon: 'wood', desc: 'Logs, planks, plant fibre, rope, cotton and cloth.', has: IS('wood', 'plank', 'fiber', 'rope', 'cotton', 'cloth', 'flax') },
    { id: 'parts', name: 'Machine parts', icon: 'gear', desc: 'Gears, wire, circuits, motors and cores.', has: IS('gear', 'wire', 'circuit', 'motor', 'core') },
    { id: 'seeds', name: 'Seeds', icon: 'seed_wheat', desc: 'Every kind of seed.', has: (i) => kindOf(i) === 'seed' },
    { id: 'crops', name: 'Crops', icon: 'wheat', desc: 'Wheat and flour, vegetables, fruit, berries, mushrooms and herbs.', has: IS('wheat', 'flour', 'berry', 'mushroom', 'carrot', 'pumpkin', 'beet', 'corn', 'melon', 'pepper', 'herb') },
    { id: 'food', name: 'Cooked food', icon: 'bread', desc: 'Meals, bakes and drinks you can eat (not the fresh fish).', has: (i) => kindOf(i) === 'food' && !isRawFish(i) },
    { id: 'fish', name: 'Fish', icon: 'fish_trout', desc: 'Everything fresh from the water.', has: isRawFish },
    { id: 'potions', name: 'Potions', icon: 'potion_heal', desc: 'Healing and boosting potions.', has: (i) => kindOf(i) === 'potion' },
    { id: 'gear', name: 'Gear', icon: 'sword_iron', desc: 'Tools, weapons, armour, charms and packs.', has: (i) => kindOf(i) === 'gear' },
    { id: 'monster', name: 'Monster parts', icon: 'slimegel', desc: 'What the night leaves behind: gel, bone, hide, shells, shards and cores.', has: IS('slimegel', 'bone', 'batwing', 'hide', 'ectoplasm', 'scarabshell', 'rockheart', 'frostshard', 'toadskin', 'shroud', 'rift_shard', 'rift_core', 'pearl', 'lantern_shard') },
    { id: 'odds', name: 'Odds & ends', icon: 'crate_wood', desc: 'Crates, bottles, sigils, trophies, pods, bait and fishing rods.', has: (i) => kindOf(i) === 'misc' },
];

const BY_ID = new Map(FILTER_CATS.map((c) => [c.id, c] as const));
export const filterCat = (id: string) => BY_ID.get(id.startsWith('#') ? id.slice(1) : id);

/** The most entries one chest can be set to. */
export const MAX_FILTER = 16;

/** Does this entry list take this item? No list (or an empty one) takes everything. */
export function takes (fl: readonly string[] | undefined, item: ItemId): boolean {
    if (!fl || !fl.length) return true;
    for (const f of fl) {
        if (f.charCodeAt(0) === 35) { if (BY_ID.get(f.slice(1))?.has(item)) return true; }
        else if (f === item) return true;
    }
    return false;
}

/** Is there a rule that names this item on purpose? (A chest set to take "stone" is stone's home; an open chest is nobody's.) */
export const names = (fl: readonly string[] | undefined, item: ItemId): boolean => !!fl && fl.length > 0 && takes(fl, item);

/** What a client sent as a chest's filter, made safe: a list of known categories and items, no repeats, nothing else. Returns null if it is not a list at all. */
export function cleanFilter (v: unknown): string[] | null {
    if (!Array.isArray(v)) return null;
    const out: string[] = [];
    for (const x of v.slice(0, 64)) {
        if (typeof x !== 'string' || out.includes(x)) continue;
        const ok = x.charCodeAt(0) === 35 ? BY_ID.has(x.slice(1)) : Object.prototype.hasOwnProperty.call(ITEMS, x);
        if (ok) out.push(x);
        if (out.length >= MAX_FILTER) break;
    }
    return out;
}

/** An icon for a chest: any item. (Chosen by the player; with none chosen, the first thing it takes lends its own.) */
export const validIcon = (v: unknown): v is ItemId => typeof v === 'string' && Object.prototype.hasOwnProperty.call(ITEMS, v);

/** The icon a chest wears, if any: the one chosen, else the first thing it is set to take. */
export function chestIcon (b: { fl?: string[]; ic?: string }): ItemId | null {
    if (b.ic && validIcon(b.ic)) return b.ic;
    const first = b.fl?.[0];
    if (!first) return null;
    if (first.charCodeAt(0) === 35) return BY_ID.get(first.slice(1))?.icon ?? null;
    return validIcon(first) ? first : null;
}

/** A few words for what a chest takes. */
export function filterLabel (fl: readonly string[] | undefined): string {
    if (!fl || !fl.length) return 'Everything';
    const names = fl.map((f) => (f.charCodeAt(0) === 35 ? BY_ID.get(f.slice(1))?.name : ITEMS[f as ItemId]?.name) ?? f);
    return names.length <= 3 ? names.join(', ') : `${names.slice(0, 2).join(', ')} + ${names.length - 2} more`;
}

/** Every item that falls under a category, in the order the catalogue lists them (for the picker). */
export const itemsOf = (catId: string): ItemId[] => { const c = BY_ID.get(catId); return c ? ITEM_ORDER.filter((i) => c.has(i)) : []; };
