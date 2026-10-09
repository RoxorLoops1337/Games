// The caves under the world: one map as big as the surface, made from the world's seed so every client and the server draw the same one.
// Rock is solid until it is dug. Ore sits in clusters inside the rock, richer and rarer towards the edge of the map.
// No Phaser, no DOM: this runs in the browser and on the server.

import { WORLD_TILES } from './config';
import type { ItemId } from './data/items';
import { Rng } from './rng';

export const CAVE_N = WORLD_TILES;

/** What can be found in the rock (ore index 1.. into this list; 0 is plain rock). */
export const CAVE_ORES: readonly ItemId[] = ['coal', 'iron', 'copper', 'goldore', 'crystal'];

export interface Cave {
    /** 1 = rock, 0 = open floor, per tile (row-major, CAVE_N wide). */
    rock: Uint8Array;
    /** 0 = plain rock, else 1 + index into CAVE_ORES. */
    ore: Uint8Array;
    /** The ancient chambers: the middle of each (cave cells), a square room of open floor with a vault in it. */
    chambers: { x: number; y: number }[];
}

/** How far a chamber's room reaches from its middle (it is a square of 2 × this + 1, with a pillar of rock in each corner). */
export const CHAMBER_R = 4;

/**
 * What an ore cluster in the rock is, by how far from the middle of the map it grows (`upTo`: 0 in the middle, 1 at the
 * edge): weights over 1 + the index into CAVE_ORES (1 coal, 2 iron, 3 copper, 4 gold ore, 5 crystal).
 */
export const CAVE_ORE_BANDS: { upTo: number; w: Record<string, number> }[] = [
    { upTo: 0.35, w: { 1: 36, 2: 34, 3: 30 } },
    { upTo: 0.7, w: { 1: 12, 2: 28, 3: 22, 4: 30, 5: 8 } },
    { upTo: Infinity, w: { 1: 8, 2: 14, 3: 10, 4: 40, 5: 28 } },
];
export const CHAMBERS = 16;

/** Roll the caves for a world. About a hundred milliseconds. */
export function genCave (seed: string): Cave {
    const N = CAVE_N, rng = new Rng(`${seed}:cave`);
    let rock = new Uint8Array(N * N);
    // scatter, then smooth into caverns: a tile is rock if five of the nine around it are
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) rock[y * N + x] = x < 3 || y < 3 || x >= N - 3 || y >= N - 3 || rng.next() < 0.47 ? 1 : 0;
    let next = new Uint8Array(N * N);
    for (let pass = 0; pass < 5; pass++) {
        for (let y = 0; y < N; y++) {
            for (let x = 0; x < N; x++) {
                if (x < 3 || y < 3 || x >= N - 3 || y >= N - 3) { next[y * N + x] = 1; continue; }
                let n = 0;
                for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) n += rock[(y + dy) * N + x + dx];
                next[y * N + x] = n >= 5 ? 1 : 0;
            }
        }
        [rock, next] = [next, rock];
    }
    // ancient chambers: square rooms with pillars in the corners, spread across the map (none in the shallows, none too close together)
    const chambers: { x: number; y: number }[] = [];
    for (let tries = 0; chambers.length < CHAMBERS && tries < 600; tries++) {
        const x = rng.int(14, N - 15), y = rng.int(14, N - 15);
        if (caveDepth(x, y) < 0.35 || chambers.some((c) => Math.hypot(c.x - x, c.y - y) < 70)) continue;
        chambers.push({ x, y });
        for (let dy = -CHAMBER_R; dy <= CHAMBER_R; dy++) for (let dx = -CHAMBER_R; dx <= CHAMBER_R; dx++) {
            const pillar = Math.abs(dx) >= CHAMBER_R - 1 && Math.abs(dy) >= CHAMBER_R - 1;
            rock[(y + dy) * N + x + dx] = pillar ? 1 : 0;
        }
    }
    // ore: clusters grown through the rock; what they are depends on how far from the middle of the map
    const ore = new Uint8Array(N * N);
    const plant = (cx: number, cy: number) => {
        const d = Math.hypot(cx - N / 2, cy - N / 2) / (N / 2);                // 0 in the middle, 1 at the edge
        const kind = rng.weighted((CAVE_ORE_BANDS.find((b) => d < b.upTo) ?? CAVE_ORE_BANDS[CAVE_ORE_BANDS.length - 1]).w);
        const size = rng.int(4, 6 + Math.round(d * 6));
        let x = cx, y = cy;
        for (let n = 0, guard = 0; n < size && guard < 60; guard++) {
            if (rock[y * N + x] && !ore[y * N + x]) { ore[y * N + x] = Number(kind); n++; }
            const [dx, dy] = rng.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
            x = Math.max(4, Math.min(N - 5, x + dx)); y = Math.max(4, Math.min(N - 5, y + dy));
        }
    };
    const clusters = Math.round((N * N) / 2000);
    for (let k = 0; k < clusters; k++) {
        const cx = rng.int(6, N - 7), cy = rng.int(6, N - 7);
        if (rock[cy * N + cx]) plant(cx, cy);
    }
    // no stretch of rock is bare: a block with no ore at all gets a cluster, so there is always something to mine near wherever a shaft is sunk
    const B = 24;
    for (let by = 4; by < N - 4; by += B) {
        for (let bx = 4; bx < N - 4; bx += B) {
            const x1 = Math.min(N - 5, bx + B - 1), y1 = Math.min(N - 5, by + B - 1);
            let has = false;
            for (let y = by; y <= y1 && !has; y++) for (let x = bx; x <= x1 && !has; x++) if (ore[y * N + x]) has = true;
            if (has) continue;
            for (let tries = 0; tries < 60; tries++) {
                const cx = rng.int(bx, x1), cy = rng.int(by, y1);
                if (rock[cy * N + cx]) { plant(cx, cy); break; }
            }
        }
    }
    return { rock, ore, chambers };
}

/** A little depth for the eye: 0 near the middle of the map, 1 at the edge. */
export const caveDepth = (x: number, y: number) => Math.min(1, Math.hypot(x - CAVE_N / 2, y - CAVE_N / 2) / (CAVE_N / 2));
