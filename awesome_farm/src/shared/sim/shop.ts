// The travelling trader's stock and waystone travel.

import { TILE } from '../config';
import { ITEMS, ItemId } from '../data/items';
import { Rng } from '../rng';
import { PAL } from '../palette';
import type { Sim } from './sim';
import * as quests from './quests';
import { hasUnlock } from './stats';
import type { BuildE, PlayerS, Shop } from './types';

interface Pool { item: ItemId; n: [number, number]; mul: number; minDay: number; w: number }
const POOL: Pool[] = [
    { item: 'seed_wheat', n: [8, 20], mul: 2.5, minDay: 1, w: 8 }, { item: 'seed_carrot', n: [6, 16], mul: 2.5, minDay: 1, w: 8 },
    { item: 'seed_pumpkin', n: [4, 10], mul: 3, minDay: 2, w: 6 }, { item: 'seed_melon', n: [3, 8], mul: 3, minDay: 3, w: 5 }, { item: 'seed_pepper', n: [4, 10], mul: 2.6, minDay: 2, w: 5 }, { item: 'seed_flax', n: [4, 10], mul: 2.6, minDay: 2, w: 5 }, { item: 'seed_cotton', n: [4, 10], mul: 3, minDay: 2, w: 6 },
    { item: 'pod', n: [4, 10], mul: 2.4, minDay: 1, w: 8 }, { item: 'pod_great', n: [2, 5], mul: 2.4, minDay: 4, w: 5 }, { item: 'pod_ultra', n: [1, 2], mul: 2.4, minDay: 10, w: 2 },
    { item: 'potion_heal', n: [3, 8], mul: 2.4, minDay: 1, w: 7 }, { item: 'potion_energy', n: [3, 8], mul: 2.4, minDay: 1, w: 5 }, { item: 'potion_swift', n: [2, 5], mul: 2.4, minDay: 3, w: 4 },
    { item: 'bread', n: [6, 14], mul: 2.2, minDay: 1, w: 6 }, { item: 'treat', n: [4, 10], mul: 2.4, minDay: 2, w: 5 },
    { item: 'rope', n: [8, 20], mul: 2.4, minDay: 1, w: 5 }, { item: 'cloth', n: [6, 14], mul: 2.4, minDay: 2, w: 4 }, { item: 'glass', n: [8, 20], mul: 2.4, minDay: 2, w: 4 },
    { item: 'brick', n: [10, 24], mul: 2.4, minDay: 2, w: 4 }, { item: 'steel', n: [3, 8], mul: 2.6, minDay: 6, w: 3 }, { item: 'goldbar', n: [2, 5], mul: 2.6, minDay: 5, w: 3 },
    { item: 'crystal', n: [1, 3], mul: 2.8, minDay: 8, w: 2 }, { item: 'circuit', n: [2, 5], mul: 2.6, minDay: 8, w: 2 }, { item: 'charm_lucky', n: [1, 1], mul: 2.5, minDay: 6, w: 1 },
    { item: 'dagger_bone', n: [1, 1], mul: 2.5, minDay: 3, w: 1 }, { item: 'bow_long', n: [1, 1], mul: 2.5, minDay: 6, w: 1 },
];

/** Stock for a given day: the same on every server restart. */
export function stockFor (seed: string, day: number): Shop {
    const rng = new Rng(`${seed}:shop:${day}`);
    const pool = POOL.filter((p) => p.minDay <= day);
    const chosen = new Set<Pool>();
    while (chosen.size < Math.min(9, pool.length)) {
        const weights = Object.fromEntries(pool.map((p, i) => [i, chosen.has(p) ? 0 : p.w]));
        chosen.add(pool[Number(rng.weighted(weights))]);
    }
    return {
        day,
        stock: [...chosen].map((p) => ({ item: p.item, n: rng.int(p.n[0], p.n[1]), price: Math.max(2, Math.round(ITEMS[p.item].sell * p.mul * (1 + Math.min(1, day / 60)))) })),
    };
}

/** Restock every second day. */
export function refresh (sim: Sim) {
    const s = sim.s;
    const slot = Math.floor((s.day - 1) / 2) * 2 + 1;
    if (s.shop?.day === slot) return;
    s.shop = stockFor(s.seed, slot);
}

export function cmdShop (sim: Sim, p: PlayerS, i: number, n: number) {
    if (!hasUnlock(p, 'trader')) { sim.deny(p, 'Learn Merchant Contacts to trade with the traveller'); return; }
    if (!sim.stationNear(p, (b) => b.kind === 'market', 3)) { sim.deny(p, 'Stand next to a market'); return; }
    if (!sim.s.shop) refresh(sim);
    const it = Number.isInteger(i) && i >= 0 ? sim.s.shop?.stock[i] : undefined;      // (`stock['length']` is a number, not a row)
    n = Math.floor(n);
    if (!it || !(n >= 1)) return;
    n = Math.min(n, it.n);
    if (n <= 0) { sim.deny(p, 'Sold out'); return; }
    const cost = it.price * n;
    if (p.coins < cost) { sim.deny(p, `Needs ${cost} coins`); return; }
    p.coins -= cost;
    it.n -= n;
    sim.give(p, it.item, n);
    quests.count(p, 'shop', n);
    sim.fx('sell', p.x, p.y - 10, p.id);
    sim.float(p.x, p.y - 24, `-${cost} coins`, PAL.gold, p.id, 'buy');
}

// ── waystones ───────────────────────────────────────────────────────────────
export function openWaystone (sim: Sim, p: PlayerS, b: BuildE) {
    const list = sim.buildings('waystone').map((w) => ({ id: w.id, x: (w.tx + 0.5) * TILE, y: (w.ty + 1) * TILE, plot: sim.world.plotAt(w.tx, w.ty)?.i ?? 0, by: w.by ? sim.s.players[w.by]?.name : undefined }));
    sim.events.push({ e: 'ways', to: p.id, from: b.id, list });
    sim.events.push({ e: 'open', to: p.id, ui: 'waystone', id: b.id });
}

export function cmdTravel (sim: Sim, p: PlayerS, to: number) {
    const here = sim.stationNear(p, (b) => b.kind === 'waystone', 2.6);
    const dest = sim.s.ents[to];
    if (!here) { sim.deny(p, 'Stand next to a waystone'); return; }
    if (!dest || dest.k !== 'bld' || dest.kind !== 'waystone' || dest.id === here.id) return;
    if ((sim.travelT[p.id] ?? 0) > sim.s.time) { sim.deny(p, 'The stones are still humming'); return; }
    sim.travelT[p.id] = sim.s.time + 6;
    sim.fx('summon', p.x, p.y - 8, p.id);
    const spot = sim.nearestFree(dest.tx, dest.ty + 1) ?? { tx: dest.tx, ty: dest.ty + 1 };
    p.x = (spot.tx + 0.5) * TILE; p.y = (spot.ty + 1) * TILE - 3;
    p.warp++;
    p.invuln = Math.max(p.invuln, 1);
    sim.fx('summon', p.x, p.y - 8, p.id);
    sim.banner('Waystone', 'You stepped through the stones', PAL.foam, p.id);
}
