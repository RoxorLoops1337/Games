// Rolls a new world: biomes in rings, plot modifiers, and the 8 spawn slots.

import { CENTER, DREAD_RING, DREAD_ZONES, FAR_RING, GRID, LEGACY_PLOT, PLOT, SEA, SPAWN_RING, SPAWN_RING_2 } from '../config';
import { Biome, ModKind } from '../data/biomes';
import type { ItemId } from '../data/items';
import { Rng } from '../rng';
import type { Plot, Vein } from './types';

/**
 * Home plot of spawn slot k. Slots go around the ring in order, so slot 0 and slot 1
 * (the first two players) are neighbours ~6 plots apart: far enough that meeting up
 * takes ~10 minutes of expanding toward each other.
 */
export function slotPlot (k: number) {
    // the first eight farmers live on the inner ring; the next eight on a second one, between them
    const outer = k >= 8;
    const a = outer ? ((k - 8) * Math.PI) / 4 + Math.PI / 8 : (k * Math.PI) / 4;
    const r = outer ? SPAWN_RING_2 : SPAWN_RING;
    return { gx: Math.round(CENTER.gx + r * Math.cos(a)), gy: Math.round(CENTER.gy + r * Math.sin(a)) };
}

/**
 * Where farmer `k` (nine and up) will live: the ring spot if it is still wild, otherwise the nearest wild spot round the second ring.
 * A spot is wild when neither it nor its four neighbours belong to anybody (or are the Old Heart or another home).
 */
export function homeSpot (plots: readonly Plot[], k: number): { gx: number; gy: number } | null {
    const at = (gx: number, gy: number) => (gx >= 0 && gy >= 0 && gx < GRID && gy < GRID ? plots[gy * GRID + gx] : undefined);
    const wild = (gx: number, gy: number) => {
        if (gx < 2 || gy < 2 || gx > GRID - 3 || gy > GRID - 3) return false;
        if (plots.some((p) => p.blight === 1 && Math.max(Math.abs(p.gx - gx), Math.abs(p.gy - gy)) <= 3)) return false;      // (never next door to a Blight nest)
        return [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => { const p = at(gx + dx, gy + dy); return !!p && !p.owned && !p.heart && p.home === undefined && !p.dread && !p.blight; });
    };
    const first = slotPlot(k);
    if (wild(first.gx, first.gy)) return first;
    for (const r of [SPAWN_RING_2, SPAWN_RING_2 + 2, SPAWN_RING_2 - 2, SPAWN_RING_2 + 3, SPAWN_RING_2 - 3]) {
        for (let step = 0; step < 48; step++) {
            const a = ((k * 7 + step) * Math.PI * 2) / 48;
            const gx = Math.round(CENTER.gx + r * Math.cos(a)), gy = Math.round(CENTER.gy + r * Math.sin(a));
            if (plots.some((p) => p.home !== undefined && Math.abs(p.gx - gx) + Math.abs(p.gy - gy) < 4)) continue;
            if (wild(gx, gy)) return { gx, gy };
        }
    }
    return null;
}

/** Turn wild land into a home for farmer `k`: a meadow with a quarry and goldsand next door, and nothing haunted near it. Returns the plots it changed. */
export function raiseHome (plots: Plot[], spot: { gx: number; gy: number }, k: number, rng: Rng): number[] {
    const changed: number[] = [];
    const home = plots[spot.gy * GRID + spot.gx];
    home.biome = 'meadow'; home.mod = null; home.home = k;
    home.veins = genVeins(rng, home, true);
    changed.push(home.i);
    const ring = rng.shuffle<Biome>(['quarry', 'goldsand', 'meadow', 'meadow']);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = plots[(spot.gy + dy) * GRID + (spot.gx + dx)];
        if (!n || n.owned || n.heart || n.home !== undefined || n.blight) continue;
        n.biome = ring.pop()!; n.mod = null;
        n.veins = genVeins(rng, n, false);
        changed.push(n.i);
    }
    return changed;
}

/** Which boss keeps each Dread block (by block, going round from the north-east). */
export const DREAD_BOSS = ['frost', 'dune', 'stone', 'bog'];

/** The middle plot of Dread block `q`, `r` plots from the centre of the world (the blocks sit on the four diagonals). */
const dreadCentre = (q: number, r = DREAD_RING) => {
    const a = Math.PI / 4 + (q * Math.PI) / 2;
    return { gx: Math.round(CENTER.gx + r * Math.cos(a)), gy: Math.round(CENTER.gy + r * Math.sin(a)) };
};

/**
 * Turn four 3×3 blocks of wild land into the Dread Reaches: bog ground, always land, never for sale, a warden in the middle.
 * A block whose spot is taken (owned, somebody's home, the Old Heart) slides outward or inward a plot at a time. Returns the plots it changed.
 */
export function markDread (plots: Plot[]): Plot[] {
    const at = (gx: number, gy: number) => (gx >= 0 && gy >= 0 && gx < GRID && gy < GRID ? plots[gy * GRID + gx] : undefined);
    const changed: Plot[] = [];
    for (let q = 0; q < DREAD_ZONES; q++) {
        const home = dreadCentre(q);
        // the usual spot first, then the nearest ones that are still out in the wilds
        const spots: { gx: number; gy: number }[] = [];
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) spots.push({ gx: home.gx + dx, gy: home.gy + dy });
        spots.sort((a, b) => Math.hypot(a.gx - home.gx, a.gy - home.gy) - Math.hypot(b.gx - home.gx, b.gy - home.gy) || a.gy - b.gy || a.gx - b.gx);
        for (const c of spots) {
            const far = Math.hypot(c.gx - CENTER.gx, c.gy - CENTER.gy);
            if (far < FAR_RING + 0.5 || c.gx < 2 || c.gy < 2 || c.gx > GRID - 3 || c.gy > GRID - 3) continue;
            const cells: Plot[] = [];
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const p = at(c.gx + dx, c.gy + dy); if (p) cells.push(p); }
            const free = cells.length === 9
                && cells.every((p) => !p.owned && !p.heart && p.home === undefined && !p.dread)
                && !plots.some((p) => p.dread && Math.abs(p.gx - c.gx) <= 4 && Math.abs(p.gy - c.gy) <= 4)           // (blocks keep apart)
                && !plots.some((p) => p.home !== undefined && Math.abs(p.gx - c.gx) <= 3 && Math.abs(p.gy - c.gy) <= 3);
            if (!free) continue;
            for (const p of cells) { p.dread = p.gx === c.gx && p.gy === c.gy ? 2 : 1; p.zone = q; p.biome = 'bog'; p.mod = null; changed.push(p); }
            break;
        }
    }
    return changed;
}

/** `size` is the patch size in tiles: only the old-save migration asks for anything but the current one. */
export function generatePlots (rng: Rng, size = PLOT): Plot[] {
    const homes = Array.from({ length: 8 }, (_, k) => slotPlot(k));
    const homeIdx = new Map(homes.map((h, k) => [h.gy * GRID + h.gx, k]));
    const plots: Plot[] = [];
    for (let gy = 0; gy < GRID; gy++) {
        for (let gx = 0; gx < GRID; gx++) {
            const i = gy * GRID + gx;
            const r = Math.hypot(gx - CENTER.gx, gy - CENTER.gy);
            let biome: Biome;
            if (r >= FAR_RING) biome = rng.weighted<Biome>({ snowcap: 30, quarry: 26, goldsand: 22, bog: 12, meadow: 10 });
            else if (r >= SPAWN_RING + 0.5) biome = rng.weighted<Biome>({ meadow: 35, goldsand: 25, snowcap: 25, quarry: 15 });
            else if (r >= 3) biome = rng.weighted<Biome>({ meadow: 25, quarry: 25, goldsand: 20, snowcap: 15, bog: 15 });
            else biome = rng.weighted<Biome>({ bog: 40, snowcap: 35, quarry: 25 });
            plots.push({ i, gx, gy, biome, mod: null, owned: false, nodes: 0 });
        }
    }
    // each home: meadow, with a guaranteed quarry + goldsand next door and no haunted land
    homes.forEach((h, k) => {
        const home = plots[h.gy * GRID + h.gx];
        home.biome = 'meadow';
        home.home = k;
        const ring = rng.shuffle<Biome>(['quarry', 'goldsand', 'meadow', 'meadow']);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const n = plots[(h.gy + dy) * GRID + (h.gx + dx)];
            if (n && !homeIdx.has(n.i)) n.biome = ring.pop()!;
        }
    });
    const nearHome = (p: Plot) => homes.some((h) => Math.abs(h.gx - p.gx) + Math.abs(h.gy - p.gy) <= 1);
    for (const p of plots) {
        const far = Math.hypot(p.gx - CENTER.gx, p.gy - CENTER.gy) >= FAR_RING;
        if (homeIdx.has(p.i) || !rng.chance(far ? 0.55 : 0.45)) continue;
        p.mod = rng.weighted<ModKind>(nearHome(p)
            ? { bountiful: 30, fertile: 30, treasure: 25, fairy: 15 }
            : far
                ? { bountiful: 18, fertile: 14, treasure: 24, haunted: 16, fairy: 8, ruins: 20 }
                : { bountiful: 22, fertile: 22, treasure: 18, haunted: 16, fairy: 11, ruins: 14 });
    }
    const heart = plots[CENTER.gy * GRID + CENTER.gx];
    heart.heart = true;
    heart.mod = null;
    markDread(plots);
    for (const p of plots) p.veins = genVeins(rng, p, homeIdx.has(p.i), size);
    return plots;
}

/** What each biome's ground is rich in, and how many clusters a plot gets. */
const VEIN_TABLE: Record<Biome, { count: [number, number]; ore: Partial<Record<ItemId, number>> }> = {
    meadow:   { count: [1, 2], ore: { stone: 30, clay: 20, sand: 15, coal: 15, iron: 10, copper: 10 } },
    quarry:   { count: [3, 4], ore: { iron: 28, copper: 22, coal: 22, stone: 20, goldore: 8 } },
    goldsand: { count: [2, 3], ore: { goldore: 30, sand: 25, copper: 20, iron: 10, stone: 15 } },
    snowcap:  { count: [2, 3], ore: { iron: 25, coal: 25, copper: 15, crystal: 15, goldore: 10, stone: 10 } },
    bog:      { count: [2, 3], ore: { clay: 30, peat: 30, coal: 15, iron: 10, crystal: 10, stone: 5 } },
};

/**
 * Ore for land that has just become somebody's. It is made from the seed and the plot alone, so land nobody owns carries no veins in the
 * save or on the wire (they were most of the file); a plot that already has them keeps them.
 */
export function ensureVeins (seed: string, plot: Plot) {
    if (!plot.veins) plot.veins = genVeins(new Rng(`${seed}:veins:${plot.i}`), plot, plot.home !== undefined);
}

/** Blobs of ore tiles in a plot's ground. Home plots always have the basics for a first drill. */
export function genVeins (rng: Rng, plot: Plot, home: boolean, size = PLOT): Vein[] {
    const f = size / LEGACY_PLOT;            // a bigger patch has proportionally more ore (exactly the old amounts at the old size)
    const o = { tx: (plot.gx + SEA) * size, ty: (plot.gy + SEA) * size };
    const taken = new Set<string>();
    const veins: Vein[] = [];
    const defs = VEIN_TABLE[plot.biome];
    const wanted: ItemId[] = home ? ['stone', 'coal', 'iron', 'copper'] : Array.from({ length: Math.round(rng.int(defs.count[0], defs.count[1]) * f) }, () => rng.weighted(defs.ore));
    for (const res of wanted) {
        const blob = Math.round((home ? rng.int(5, 7) : rng.int(4, 9)) * f);
        let tx = o.tx + rng.int(2, size - 3), ty = o.ty + rng.int(2, size - 3);
        for (let n = 0, guard = 0; n < blob && guard < 60 * f; guard++) {
            const key = `${tx},${ty}`;
            if (!taken.has(key) && tx > o.tx && tx < o.tx + size - 1 && ty > o.ty && ty < o.ty + size - 1) {
                taken.add(key);
                veins.push([tx, ty, res]);
                n++;
            }
            const [dx, dy] = rng.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
            tx = Math.max(o.tx + 1, Math.min(o.tx + size - 2, tx + dx));
            ty = Math.max(o.ty + 1, Math.min(o.ty + size - 2, ty + dy));
        }
    }
    return veins;
}
