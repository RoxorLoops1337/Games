// The Relic Satchel: the other bag. Relics (small stones with a shape) are puzzled into a grid; the way they sit decides what they give.
//   * every relic gives its tag's stat, more for a bigger one;
//   * a relic touching another of its own tag gives more (each neighbour of its kind adds to it);
//   * two touching relics of different tags make a combo, with a bonus of its own (Steam, Wildfire, Aegis...);
//   * every worn ring of a tag attunes the relics of that tag (the Equipment Bag keeps rings and relics together).
// Pure: the sim (sim/satchel.ts, sim/stats.ts), the Equipment Bag screen and the tests all read it.

import type { Mods } from './stats';

export type RelicTag = 'ember' | 'frost' | 'vine' | 'iron' | 'spirit';
export const RELIC_TAGS: RelicTag[] = ['ember', 'frost', 'vine', 'iron', 'spirit'];
export type RelicSize = 'chip' | 'shard' | 'core';

/** A relic's footprint (width, height) before it is turned: a chip is one cell, a shard two in a row, a core a 2 x 2 block. */
export const SIZES: Record<RelicSize, [number, number]> = { chip: [1, 1], shard: [2, 1], core: [2, 2] };

export const TAG_INFO: Record<RelicTag, { name: string; color: number; mod: keyof Mods; per: number; word: string }> = {
    ember:  { name: 'Ember',  color: 0xf8a24a, mod: 'dmgPct',     per: 0.008, word: 'damage' },
    frost:  { name: 'Frost',  color: 0x8fdcf2, mod: 'armor',      per: 0.05,  word: 'armor' },
    vine:   { name: 'Vine',   color: 0x92d364, mod: 'healPower',  per: 0.03,  word: 'healing' },
    iron:   { name: 'Iron',   color: 0xb8bed2, mod: 'maxEnergy',  per: 3,     word: 'energy' },
    spirit: { name: 'Spirit', color: 0xb07aff, mod: 'luck',       per: 0.008, word: 'luck' },
};

/** What touching relics of two different tags make. */
export const COMBOS: { a: RelicTag; b: RelicTag; name: string; mods: Mods }[] = [
    { a: 'ember', b: 'frost',  name: 'Steam',         mods: { moveSpeed: 0.03 } },
    { a: 'ember', b: 'vine',   name: 'Wildfire',      mods: { dmgPct: 0.03 } },
    { a: 'ember', b: 'iron',   name: 'Forge',         mods: { swingSpeed: 0.04 } },
    { a: 'ember', b: 'spirit', name: 'Phoenix',       mods: { vamp: 0.02 } },
    { a: 'frost', b: 'vine',   name: 'Winter Garden', mods: { grow: 0.05 } },
    { a: 'frost', b: 'iron',   name: 'Rime Plate',    mods: { armor: 0.12 } },
    { a: 'frost', b: 'spirit', name: 'Whisper',       mods: { luck: 0.02 } },
    { a: 'vine',  b: 'iron',   name: 'Thornmail',     mods: { armor: 0.06 } },
    { a: 'vine',  b: 'spirit', name: 'Bloom',         mods: { healPower: 0.06 } },
    { a: 'iron',  b: 'spirit', name: 'Aegis',         mods: { dodge: 0.02 } },
];
export const comboOf = (x: RelicTag, y: RelicTag) => COMBOS.find((c) => (c.a === x && c.b === y) || (c.a === y && c.b === x));

/** Each neighbour of the same tag adds this share to a relic's own bonus (up to `LINK_MAX` neighbours count). */
export const LINK = 0.4;
export const LINK_MAX = 3;
/** Each worn ring of a relic's tag adds this share to it. */
export const ATTUNE = 0.2;

/** Which tag each ring carries: the attunement a worn ring gives. */
export const RING_TAG: Record<string, RelicTag> = {
    ring_copper: 'ember', ring_iron: 'iron', ring_gold: 'spirit', ring_steel: 'iron', ring_crystal: 'frost', ring_blight: 'spirit',
    ring_slime: 'vine', ring_stone: 'iron', ring_hex: 'spirit', ring_sun: 'ember', ring_frost: 'frost',
};

/** A relic in the satchel: its item, the top-left cell and whether it lies turned (a shard stands up). */
export interface Placed { it: string; x: number; y: number; r?: 1 }

/** The grid a farmer has: 4 x 3 to begin with, and it grows with their level. */
export function satchelDims (level: number): { w: number; h: number } {
    return { w: 4 + (level >= 12 ? 1 : 0), h: 3 + (level >= 24 ? 1 : 0) + (level >= 36 ? 1 : 0) };
}

/** What a relic looks like for the satchel (from the item). */
export interface RelicDef { tag: RelicTag; size: RelicSize }

/** The cells (x, y) a footprint covers, turned or not. */
export function cellsOf (size: RelicSize, x: number, y: number, r?: 1): [number, number][] {
    const [w, h] = r ? [SIZES[size][1], SIZES[size][0]] : SIZES[size];
    const out: [number, number][] = [];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out.push([x + i, y + j]);
    return out;
}

/** Can this go there: inside the grid, and not on top of anything already in it? (`skip`: an index to ignore, a relic being moved.) */
export function fits (def: (it: string) => RelicDef | undefined, grid: { w: number; h: number }, placed: readonly Placed[], it: string, x: number, y: number, r?: 1, skip = -1): boolean {
    const d = def(it);
    if (!d || !Number.isInteger(x) || !Number.isInteger(y)) return false;
    const taken = new Set<number>();
    placed.forEach((p, i) => { const q = def(p.it); if (q && i !== skip) for (const [cx, cy] of cellsOf(q.size, p.x, p.y, p.r)) taken.add(cy * 64 + cx); });
    return cellsOf(d.size, x, y, r).every(([cx, cy]) => cx >= 0 && cy >= 0 && cx < grid.w && cy < grid.h && !taken.has(cy * 64 + cx));
}

export interface SatchelResult { mods: Mods; combos: { name: string; a: number; b: number; mods: Mods }[]; links: [number, number][]; each: { tag: RelicTag; mult: number; area: number }[] }

/** Everything the satchel gives for what is in it and the rings worn (`rings`: their tags). Never throws on a damaged list. */
export function satchelResult (def: (it: string) => RelicDef | undefined, placed: readonly Placed[], rings: readonly RelicTag[] = []): SatchelResult {
    const items = placed.map((p) => ({ p, d: def(p.it) })).filter((o): o is { p: Placed; d: RelicDef } => !!o.d);
    const cells = items.map((o) => cellsOf(o.d.size, o.p.x, o.p.y, o.p.r));
    const owner = new Map<number, number>();
    cells.forEach((cs, i) => { for (const [x, y] of cs) owner.set(y * 64 + x, i); });
    // which relics touch (an edge between a cell of one and a cell of another)
    const near = items.map(() => new Set<number>());
    cells.forEach((cs, i) => {
        for (const [x, y] of cs) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const j = owner.get((y + dy) * 64 + x + dx);
            if (j !== undefined && j !== i) { near[i].add(j); near[j].add(i); }
        }
    });
    const mods: Mods = {};
    const add = (m: Mods, mul = 1) => { for (const k of Object.keys(m) as (keyof Mods)[]) mods[k] = (mods[k] ?? 0) + (m[k] ?? 0) * mul; };
    const each: SatchelResult['each'] = [];
    items.forEach((o, i) => {
        const info = TAG_INFO[o.d.tag], area = cells[i].length;
        const same = [...near[i]].filter((j) => items[j].d.tag === o.d.tag).length;
        const attune = rings.filter((t) => t === o.d.tag).length;
        const mult = 1 + LINK * Math.min(LINK_MAX, same) + ATTUNE * attune;
        add({ [info.mod]: info.per * area } as Mods, mult);
        each.push({ tag: o.d.tag, mult, area });
    });
    const combos: SatchelResult['combos'] = [], links: [number, number][] = [];
    items.forEach((o, i) => {
        for (const j of near[i]) {
            if (j <= i) continue;
            links.push([i, j]);
            const c = o.d.tag !== items[j].d.tag ? comboOf(o.d.tag, items[j].d.tag) : undefined;
            if (c) { add(c.mods); combos.push({ name: c.name, a: i, b: j, mods: c.mods }); }
        }
    });
    return { mods, combos, links, each };
}
