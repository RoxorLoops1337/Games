// What a fall costs. If a friend picks you up (or Second Wind does) it costs nothing. If you give up waiting, run out of time or leave while down,
// half the XP you had towards your next level is gone and your whole backpack stays where you fell, as a Lost Backpack anyone can take things from.
// Expeditions are safe: there, falling only ends the run.

import { TILE, TUNING } from '../config';
import { BUILDINGS } from '../data/buildings';
import type { ItemId } from '../data/items';
import { feetTile } from '../geom';
import { PAL } from '../palette';
import type { Sim } from './sim';
import type { BuildE, Inv, PlayerS } from './types';

/** The lost backpacks lying about, whoever's they are. */
export const packs = (sim: Sim): readonly BuildE[] => sim.buildings('lostpack');

/** Take the price of a fall from a farmer. Returns what to tell them. */
export function penalty (sim: Sim, p: PlayerS): string {
    const lostXp = Math.floor(p.xp * TUNING.deathXpLoss);
    p.xp -= lostXp;
    const items = (Object.entries(p.inv) as [ItemId, number][]).filter(([, n]) => n > 0);
    let pack: BuildE | null = null;
    if (items.length) {
        const feet = feetTile(p);
        const spot = sim.nearestFree(feet.tx, feet.ty);
        if (spot) {
            const inv: Inv = {};
            for (const [item, n] of items) inv[item] = n;
            for (const [item] of items) delete p.inv[item];
            pack = sim.add<BuildE>({ k: 'bld', kind: 'lostpack', tx: spot.tx, ty: spot.ty, rot: 0, by: p.id, inv, born: sim.s.time });
            p.pk = { x: (spot.tx + 0.5) * TILE, y: (spot.ty + 0.5) * TILE };
        }
        // (no free ground anywhere near: the backpack is kept rather than lost)
    }
    sim.fx('packDrop', p.x, p.y - 6, p.id);
    const parts: string[] = [];
    parts.push(pack ? 'Your backpack lies where you fell' : 'You kept your backpack');
    if (lostXp > 0) parts.push(`${lostXp} XP lost`);
    return parts.join(' · ');
}

/** Packs nobody came back for fade away after a long while (checked every five seconds or so). */
export function update (sim: Sim) {
    if (sim.s.tick % 100 !== 0) return;
    for (const b of packs(sim)) {
        if (sim.s.time - (b.born ?? 0) < TUNING.packLife) continue;
        const c = sim.center(b);
        sim.fx('collect', c.x, c.y);
        if (b.by && sim.s.players[b.by]?.online) sim.toast(b.by, 'Your lost backpack crumbled away', undefined, PAL.pebble);
        sim.remove(b.id);
    }
}

/** A pack with nothing left in it goes away. */
export function tidy (sim: Sim, b: BuildE) {
    if (!BUILDINGS[b.kind].grave || Object.values(b.inv ?? {}).some((n) => (n ?? 0) > 0)) return;
    const c = sim.center(b);
    sim.fx('collect', c.x, c.y);
    sim.remove(b.id);
}
