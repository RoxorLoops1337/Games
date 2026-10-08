// Saved worlds from older versions, carried forward so nobody loses their farm.
//
// v4 → v5: the map grew from 17×17 plots to 35×35. The old land is moved into the middle (the Old Heart
// stays the centre and the homes stay on the same ring around it), so every coordinate in the save shifts by
// the same amount, and a ring of brand new plots is rolled around it. The four rift islands sit in the corners
// of the sea, so they ride out to the new corners with whatever is standing on them.
//
// v5 → v6: every plot grew from 12×12 tiles to 18×18. Each old plot sits in the middle of its bigger one, so a
// tile moves to (its plot × 18) + (its place in the plot) + 3. Whatever stands on it moves with it (a building keeps
// its whole footprint: only its corner is placed), and the new three-tile border of every owned plot gets a fresh
// helping of resources. Anything that ran from one plot into the next now has a six-tile gap to bridge.
//
// v6 → v7: the Dread Reaches. Four 3×3 blocks of wild land in the far corners become haunted bog with a warden at their heart
// (they slide aside if somebody already owns the spot).

import { GRID, LEGACY_GRID, LEGACY_PLOT, PLOT, RIFT_ISLANDS, SEA, TILE } from '../config';
import { BIOME_DEFS } from '../data/biomes';
import { BUILDINGS } from '../data/buildings';
import { NODES } from '../data/nodes';
import { Rng } from '../rng';
import type { Plot, WorldState } from './types';
import { generatePlots, genVeins, markDread } from './worldgen';

// (the v4 → v5 step works in the old 12-tile plots; the v5 → v6 step then grows them all)
const OFF = (GRID - LEGACY_GRID) / 2;                    // plots of new land on every side
const SHIFT_TILES = OFF * LEGACY_PLOT;
const OLD_FAR = (LEGACY_GRID + SEA) * LEGACY_PLOT;       // tile origin of the right/bottom rift islands, before
const NEW_FAR = (GRID + SEA) * LEGACY_PLOT;              // … and after

type Pt = [dx: number, dy: number];

/** How far a point (in pixels) moves: onto a rift island in a corner, out with the corner; anywhere else, with the land. */
function shiftOf (x: number, y: number): Pt {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    for (let i = 0; i < RIFT_ISLANDS; i++) {
        const ox = i & 1 ? OLD_FAR : 0, oy = i & 2 ? OLD_FAR : 0;
        if (tx >= ox && tx < ox + LEGACY_PLOT && ty >= oy && ty < oy + LEGACY_PLOT) return [(i & 1 ? NEW_FAR - OLD_FAR : 0) * TILE, (i & 2 ? NEW_FAR - OLD_FAR : 0) * TILE];
    }
    return [SHIFT_TILES * TILE, SHIFT_TILES * TILE];
}

/** Move every listed x/y pair of `o` by the shift of the first pair. */
function movePairs (o: Record<string, unknown>, pairs: [string, string][]) {
    const [kx, ky] = pairs[0];
    if (typeof o[kx] !== 'number' || typeof o[ky] !== 'number') return;
    const [dx, dy] = shiftOf(o[kx] as number, o[ky] as number);
    for (const [a, b] of pairs) {
        if (typeof o[a] === 'number') o[a] = (o[a] as number) + dx;
        if (typeof o[b] === 'number') o[b] = (o[b] as number) + dy;
    }
}

const newIndex = (oldIndex: number) => (Math.floor(oldIndex / LEGACY_GRID) + OFF) * GRID + (oldIndex % LEGACY_GRID) + OFF;

function growTo35 (s: WorldState) {
    // the plots: roll the whole new map, then lay the old land over its middle
    const plots = generatePlots(new Rng(`${s.seed}:grown`), LEGACY_PLOT);
    for (const old of s.plots as Plot[]) {
        const gx = old.gx + OFF, gy = old.gy + OFF, i = gy * GRID + gx;
        plots[i] = { ...old, i, gx, gy, ...(old.veins ? { veins: old.veins.map(([tx, ty, res]) => [tx + SHIFT_TILES, ty + SHIFT_TILES, res] as [number, number, typeof res]) } : {}) };
    }
    s.plots = plots;

    for (const e of Object.values(s.ents)) {
        const o = e as unknown as Record<string, unknown>;
        switch (e.k) {
            case 'node': e.tx += SHIFT_TILES; e.ty += SHIFT_TILES; e.plot = newIndex(e.plot); break;
            case 'bld': e.tx += SHIFT_TILES; e.ty += SHIFT_TILES; break;
            case 'drop': movePairs(o, [['x', 'y'], ['ox', 'oy']]); break;
            case 'proj': movePairs(o, [['x', 'y']]); break;
            case 'mob': movePairs(o, [['x', 'y'], ['hx', 'hy'], ['gx', 'gy']]); break;
            case 'crit':
                movePairs(o, [['x', 'y'], ['hx', 'hy']]);
                if (typeof e.tx === 'number') e.tx += SHIFT_TILES;      // the tile it is working at
                if (typeof e.ty === 'number') e.ty += SHIFT_TILES;
                break;
        }
    }

    for (const p of Object.values(s.players)) {
        const o = p as unknown as Record<string, unknown>;
        const [dx, dy] = shiftOf(p.x, p.y);
        p.x += dx; p.y += dy;
        for (const k of ['fishing', 'line'] as const) {
            const f = o[k] as Record<string, number> | undefined;
            if (!f) continue;
            for (const [a, b] of [['x', 'y'], ['ox', 'oy']]) {
                if (typeof f[a] === 'number') f[a] += dx;
                if (typeof f[b] === 'number') f[b] += dy;
            }
        }
        p.warp = (p.warp ?? 0) + 1;                  // a clean snap to the new position
    }

    for (const run of Object.values(s.rifts ?? {})) {
        for (const spot of Object.values(run.from)) movePairs(spot as unknown as Record<string, unknown>, [['x', 'y']]);
    }
}

// ── v5 → v6: plots from 12×12 to 18×18 tiles ──────────────────────────────────
const PAD = (PLOT - LEGACY_PLOT) / 2;
/** Where a tile (counted from the map's corner) goes: its plot's origin grows, and it sits in the middle of the bigger plot. */
const bigTile = (t: number) => { const q = Math.floor(t / LEGACY_PLOT); return q * PLOT + (t - q * LEGACY_PLOT) + PAD; };
/** … and a point in pixels. */
const bigPx = (v: number) => { const t = Math.floor(v / TILE); return (bigTile(t) + (v / TILE - t)) * TILE; };

function bigPairs (o: Record<string, unknown>, keys: string[]) {
    for (const k of keys) if (typeof o[k] === 'number') o[k] = bigPx(o[k] as number);
}

function growPlots (s: WorldState) {
    const rng = new Rng(`${s.seed}:plots18`);
    const taken = new Set<number>();                      // tiles with something standing on them, in the new numbering
    const W = (GRID + SEA * 2) * PLOT;

    for (const e of Object.values(s.ents)) {
        const o = e as unknown as Record<string, unknown>;
        switch (e.k) {
            case 'node': e.tx = bigTile(e.tx); e.ty = bigTile(e.ty); taken.add(e.ty * W + e.tx); break;
            case 'bld': {
                e.tx = bigTile(e.tx); e.ty = bigTile(e.ty);
                const [w, h] = BUILDINGS[e.kind]?.size ?? [1, 1];
                for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) taken.add((e.ty + y) * W + e.tx + x);
                break;
            }
            case 'drop': bigPairs(o, ['x', 'y', 'ox', 'oy']); break;
            case 'proj': bigPairs(o, ['x', 'y']); break;
            case 'mob': bigPairs(o, ['x', 'y', 'hx', 'hy', 'gx', 'gy']); break;
            case 'crit':
                bigPairs(o, ['x', 'y', 'hx', 'hy']);
                if (typeof e.tx === 'number') e.tx = bigTile(e.tx);          // the tile it is working at
                if (typeof e.ty === 'number') e.ty = bigTile(e.ty);
                break;
        }
    }

    for (const p of Object.values(s.players)) {
        const o = p as unknown as Record<string, unknown>;
        bigPairs(o, ['x', 'y']);
        for (const k of ['fishing', 'line'] as const) {
            const f = o[k] as Record<string, number> | undefined;
            if (f) bigPairs(f, ['x', 'y', 'ox', 'oy']);
        }
        p.warp = (p.warp ?? 0) + 1;                  // a clean snap to the new position
    }
    for (const run of Object.values(s.rifts ?? {})) {
        for (const spot of Object.values(run.from)) bigPairs(spot as unknown as Record<string, unknown>, ['x', 'y']);
    }

    // the plots: ore rides along, and the new border gets its share; land nobody owns yet is simply rolled again at the new size
    const fresh = generatePlots(new Rng(`${s.seed}:veins18`));
    for (const plot of s.plots as Plot[]) {
        const o = { tx: (plot.gx + SEA) * PLOT, ty: (plot.gy + SEA) * PLOT };
        const inCore = (tx: number, ty: number) => tx >= o.tx + PAD && tx < o.tx + PAD + LEGACY_PLOT && ty >= o.ty + PAD && ty < o.ty + PAD + LEGACY_PLOT;
        if (!plot.owned) { plot.veins = fresh[plot.i].veins; continue; }
        const mine = (plot.veins ?? []).map(([tx, ty, res]) => [bigTile(tx), bigTile(ty), res] as [number, number, typeof res]);
        const seen = new Set(mine.map(([tx, ty]) => `${tx},${ty}`));
        for (const v of genVeins(rng, plot, plot.home !== undefined)) {
            if (!inCore(v[0], v[1]) && !seen.has(`${v[0]},${v[1]}`)) { mine.push(v); seen.add(`${v[0]},${v[1]}`); }
        }
        plot.veins = mine;

        // fresh resources on the new border (a plot is land from edge to edge, bar its rounded corners)
        const want = plot.home !== undefined ? rng.int(9, 12) : rng.int(6, 9);
        for (let n = 0, guard = 0; n < want && guard < 200; guard++) {
            const tx = o.tx + rng.int(1, PLOT - 2), ty = o.ty + rng.int(1, PLOT - 2);
            if (inCore(tx, ty) || taken.has(ty * W + tx)) continue;
            const kind = rng.weighted(BIOME_DEFS[plot.biome].nodes);
            taken.add(ty * W + tx);
            const id = s.nextId++;
            s.ents[id] = { id, k: 'node', kind, tx, ty, hp: NODES[kind].hp, plot: plot.i };
            plot.nodes++;
            n++;
        }
    }
}

/** v6 → v7: put the Dread Reaches on the map, on ground nobody owns. */
function addDread (s: WorldState) {
    const rng = new Rng(`${s.seed}:dread`);
    for (const p of markDread(s.plots as Plot[])) p.veins = genVeins(rng, p, false);
}

/** Bring a saved world up to the current version (in place); newer-than-known or unknown versions are left for the caller to refuse. */
export function migrate (state: WorldState): WorldState {
    if (state.version === 4) { growTo35(state); state.version = 5; }
    if (state.version === 5) { growPlots(state); state.version = 6; }
    if (state.version === 6) { addDread(state); state.version = 7; }
    return state;
}
