// The evening hearth: where farmers gather in the last minute of the day. Two or more at the same fire (a farmer and their
// own companion count as two) earn Hearthside, a buff that lasts until dawn. The rules are sim/hearth.ts; the buff is
// `hearth` in data/stats.ts; the numbers (radius, how long it takes, the heart tick) are in TUNING.

import type { BuildingKind } from './buildings';

/** The buildings people gather round, and what the circle calls them in words. A campfire is the heart of it; a Table is the supper table. */
export const HEARTH_SPOTS: Partial<Record<BuildingKind, { name: string }>> = {
    campfire: { name: 'campfire' },
    table: { name: 'table' },
    lantern: { name: 'lantern' },
    lamppost: { name: 'lamp post' },
};

export const isHearthSpot = (kind: string): kind is BuildingKind => Object.prototype.hasOwnProperty.call(HEARTH_SPOTS, kind);

/** "Anna", "Anna & Ben", "Anna, Ben & Pip", "Anna, Ben, Pip +2": the names a banner can carry without running off the screen. */
export function circleNames (names: string[], max = 3): string {
    if (names.length <= 1) return names[0] ?? '';
    if (names.length <= max) return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
    return `${names.slice(0, max).join(', ')} +${names.length - max}`;
}
