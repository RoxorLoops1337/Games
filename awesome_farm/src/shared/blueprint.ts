// Blueprints: capturing a rectangle of buildings as relative pieces, turning them a quarter,
// and adding up what they cost. Pure functions, shared by the client (copy/paste UI) and tests.

import { BUILDINGS } from './data/buildings';
import type { Cost } from './data/items';
import type { BlueprintItem, BuildE } from './sim/types';

export interface Blueprint { id: string; name: string; items: BlueprintItem[] }

/** The most pieces one blueprint may hold, and how far from you its anchor may be (tiles). */
export const BLUEPRINT_MAX = 120;
export const BLUEPRINT_RANGE = 16;

/** Width and height (tiles) of the box around a set of pieces, counting every piece's own size. */
export function extent (items: BlueprintItem[]) {
    let w = 0, h = 0;
    for (const it of items) {
        const [bw, bh] = BUILDINGS[it.kind].size;
        w = Math.max(w, it.dx + bw); h = Math.max(h, it.dy + bh);
    }
    return { w, h };
}

/** Everything in the tile rectangle (inclusive) as pieces relative to the top-left piece's corner. Null when empty. */
export function captureItems (buildings: BuildE[], x0: number, y0: number, x1: number, y1: number): BlueprintItem[] | null {
    const inside = buildings.filter((b) => {
        const [w, h] = BUILDINGS[b.kind].size;
        return b.tx >= x0 && b.ty >= y0 && b.tx + w - 1 <= x1 && b.ty + h - 1 <= y1;
    });
    if (!inside.length) return null;
    const ax = Math.min(...inside.map((b) => b.tx)), ay = Math.min(...inside.map((b) => b.ty));
    // floors and belts first, then machines, in reading order: a stable, tidy blueprint
    return inside
        .sort((a, b) => a.ty - b.ty || a.tx - b.tx)
        .map((b): BlueprintItem => ({ kind: b.kind, dx: b.tx - ax, dy: b.ty - ay, rot: b.rot & 3, ...(b.flt ? { flt: b.flt } : {}), ...(b.sel ? { sel: b.sel } : {}) }));
}

/** Can the whole layout be turned a quarter? Pieces that are not square (a 2×1 market) cannot. */
export const canTurn = (items: BlueprintItem[]) => items.every((it) => { const [w, h] = BUILDINGS[it.kind].size; return w === h; });

/** The layout turned a quarter clockwise (belts and machines turn with it). */
export function turnItems (items: BlueprintItem[]): BlueprintItem[] {
    if (!canTurn(items)) return items;
    const { h } = extent(items);
    return items.map((it) => {
        const [s] = BUILDINGS[it.kind].size;
        return { ...it, dx: h - it.dy - s, dy: it.dx, rot: (it.rot + 1) & 3 };
    });
}

/** Total cost of placing every piece (before the player's building discount). */
export function totalCost (items: BlueprintItem[]): Cost {
    const out: Cost = {};
    for (const it of items) for (const [res, n] of Object.entries(BUILDINGS[it.kind].cost) as [keyof Cost, number][]) out[res] = (out[res] ?? 0) + n;
    return out;
}
