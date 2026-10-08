// How item lists are ordered and narrowed in the Backpack, the chests and the Market. Pure data and functions, so a test can drive them.
// The game keeps your things as counts, not slots, so "sorting" is how the list is shown: the order and the filter are a preference
// that is remembered per window (client/ui/listtools.ts), and the server never needs to know.

import { FILTER_CATS } from './filters';
import { ITEM_ORDER, ITEMS, ItemId } from './items';

type SortMode = 'type' | 'name' | 'amount' | 'value' | 'rarity';

export const SORT_MODES: { id: SortMode; name: string; hint: string }[] = [
    { id: 'type', name: 'Type', hint: 'Grouped: ores, stone, bars, food and so on' },
    { id: 'name', name: 'Name', hint: 'A to Z' },
    { id: 'amount', name: 'Amount', hint: 'The biggest piles first' },
    { id: 'value', name: 'Value', hint: 'What the pile would sell for, most first' },
    { id: 'rarity', name: 'Rarity', hint: 'The rarest first' },
];

const isSortMode = (v: unknown): v is SortMode => SORT_MODES.some((m) => m.id === v);

/** Which group an item sorts under: the position of the first category that holds it (anything else goes last). */
const GROUP = new Map<ItemId, number>();
for (const id of ITEM_ORDER) { const i = FILTER_CATS.findIndex((c) => c.has(id)); GROUP.set(id, i < 0 ? FILTER_CATS.length : i); }
const POS = new Map(ITEM_ORDER.map((id, i) => [id, i] as const));

export const groupOf = (id: ItemId) => GROUP.get(id) ?? FILTER_CATS.length;

/**
 * A list in a new order. `count` says how many of each there are (for Amount and Value). The order is each mode's natural one
 * (Amount: most first; Name: A to Z); `reverse` turns it round. Ties keep the catalogue order, so the result never jumps about.
 */
export function sortItems (list: readonly ItemId[], mode: SortMode, count: (id: ItemId) => number, reverse = false): ItemId[] {
    const pos = (id: ItemId) => POS.get(id) ?? 0;
    const cmp: Record<SortMode, (a: ItemId, b: ItemId) => number> = {
        type: (a, b) => groupOf(a) - groupOf(b) || pos(a) - pos(b),
        name: (a, b) => ITEMS[a].name.localeCompare(ITEMS[b].name),
        amount: (a, b) => count(b) - count(a),
        value: (a, b) => count(b) * ITEMS[b].sell - count(a) * ITEMS[a].sell,
        rarity: (a, b) => ITEMS[b].rarity - ITEMS[a].rarity,
    };
    const out = [...list].sort((a, b) => cmp[mode](a, b) || pos(a) - pos(b));
    return reverse ? out.reverse() : out;
}

/** Only the items of one category (`all` keeps everything). */
export function filterItems (list: readonly ItemId[], cat: string): ItemId[] {
    if (cat === 'all') return [...list];
    const c = FILTER_CATS.find((x) => x.id === cat);
    return c ? list.filter((id) => c.has(id)) : [...list];
}

/** The categories that have something in `list`, in the order the chips are shown, with how many. */
export function presentCats (list: readonly ItemId[]): { id: string; n: number }[] {
    const out: { id: string; n: number }[] = [];
    for (const c of FILTER_CATS) { const n = list.reduce((k, id) => k + (c.has(id) ? 1 : 0), 0); if (n) out.push({ id: c.id, n }); }
    return out;
}

export interface ListPrefs { sort: SortMode; reverse: boolean; cat: string }
export const DEFAULT_PREFS: ListPrefs = { sort: 'type', reverse: false, cat: 'all' };

/** Whatever was stored, made into good preferences (a removed category or an old value falls back to the default). */
export function cleanPrefs (v: unknown): ListPrefs {
    const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    const cat = typeof o.cat === 'string' && (o.cat === 'all' || FILTER_CATS.some((c) => c.id === o.cat)) ? o.cat : 'all';
    return { sort: isSortMode(o.sort) ? o.sort : 'type', reverse: o.reverse === true, cat };
}

/** The next sort mode in the cycle the Sort button walks through. */
export const nextSort = (m: SortMode): SortMode => SORT_MODES[(SORT_MODES.findIndex((x) => x.id === m) + 1) % SORT_MODES.length].id;
