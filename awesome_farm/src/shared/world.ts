// World geometry shared by the server simulation and the client's mirror:
// which tiles are land, what stands on them, which plots can be bought and for how much.
// No rendering here — client/world/tiles.ts draws it.

import { CAVE_N, CAVE_ORES, genCave, type Cave } from './cave';
import { GRID, PLOT, RIFT_ISLANDS, RIFT_RADIUS, riftOrigin, SEA, TILE, TUNING, UNDER_Y, WORLD_H, WORLD_TILES } from './config';
import { BIOME_DEFS, MODS } from './data/biomes';
import type { ItemId } from './data/items';
import { Rng } from './rng';
import type { Plot } from './sim/types';

const W = WORLD_TILES;
const H = WORLD_H;

export class World {
    readonly land = new Uint8Array(W * H);
    /** Entity id standing on each tile (0 = nothing; -1 = solid rock in the caves, until it is dug). */
    readonly occ = new Int32Array(W * H);
    /** Entity id of the floor (path, planks…) laid on each tile; walkable, drawn underneath. */
    readonly floor = new Int32Array(W * H);
    /** Entity id of something that takes a tile but can be walked over (garden beds, doorways). */
    readonly soft = new Int32Array(W * H);
    /** Entity id of the roof over each tile (it hangs above whatever stands there, so it never blocks anything). */
    readonly roof = new Int32Array(W * H);
    /** 1 where a doorway is: you walk through it, monsters do not. */
    readonly gate = new Uint8Array(W * H);
    /** 1 where a wall piece stands (the server keeps it: flying monsters cannot cross a wall, a doorway or a roof). */
    readonly wall = new Uint8Array(W * H);
    private readonly seen = new Int32Array(W * H);
    /** The caves under the world, once somebody has been (or been told) to look: made from the seed, then the tiles that have been dug are opened. */
    private cave: Cave | null = null;
    private seenGen = 0;
    private readonly queue = new Int32Array(2048);
    /** How many plots are ground that grows things (owned, or the Dread Reaches; not the nest isles): the respawn clock runs on it every step. Kept by `recompute`. */
    landCount = 0;

    constructor (readonly plots: Plot[], readonly seed = '') {
        this.recompute();
    }

    // ── geometry ──
    idx (tx: number, ty: number) { return ty * W + tx; }
    inBounds (tx: number, ty: number) { return tx >= 0 && ty >= 0 && tx < W && ty < H; }
    plot (gx: number, gy: number): Plot | null {
        return gx >= 0 && gy >= 0 && gx < GRID && gy < GRID ? this.plots[gy * GRID + gx] : null;
    }
    plotAt (tx: number, ty: number): Plot | null {
        return this.plot(Math.floor(tx / PLOT) - SEA, Math.floor(ty / PLOT) - SEA);
    }
    plotAtPx (x: number, y: number) { return this.plotAt(Math.floor(x / TILE), Math.floor(y / TILE)); }
    plotOrigin (p: Plot) { return { tx: (p.gx + SEA) * PLOT, ty: (p.gy + SEA) * PLOT }; }
    plotCenter (p: Plot) {
        const o = this.plotOrigin(p);
        return { x: (o.tx + PLOT / 2) * TILE, y: (o.ty + PLOT / 2) * TILE };
    }
    isLand (tx: number, ty: number) { return this.inBounds(tx, ty) && this.land[this.idx(tx, ty)] === 1; }
    isFree (tx: number, ty: number) { return this.isLand(tx, ty) && this.occ[this.idx(tx, ty)] === 0 && this.soft[this.idx(tx, ty)] === 0; }
    solidAt (px: number, py: number) {
        const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
        return !this.isLand(tx, ty) || this.occ[this.idx(tx, ty)] !== 0;
    }
    /** A feet box of half-size hw×hh standing at (x, y) touches something solid. */
    boxBlocked (x: number, y: number, hw: number, hh: number) {
        return this.solidAt(x - hw, y - hh) || this.solidAt(x + hw, y - hh) || this.solidAt(x - hw, y) || this.solidAt(x + hw, y);
    }
    setOcc (tx: number, ty: number, id: number) { if (this.inBounds(tx, ty)) this.occ[this.idx(tx, ty)] = id; }
    setOccRect (tx: number, ty: number, w: number, h: number, id: number) {
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) this.setOcc(tx + x, ty + y, id);
    }
    /** Every tile of a w×h footprint is land and unoccupied. */
    rectFree (tx: number, ty: number, w: number, h: number) {
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!this.isFree(tx + x, ty + y)) return false;
        return true;
    }
    setRoof (tx: number, ty: number, id: number) { if (this.inBounds(tx, ty)) this.roof[this.idx(tx, ty)] = id; }
    roofAt (tx: number, ty: number) { return this.inBounds(tx, ty) ? this.roof[this.idx(tx, ty)] : 0; }
    setGate (tx: number, ty: number, on: boolean) { if (this.inBounds(tx, ty)) this.gate[this.idx(tx, ty)] = on ? 1 : 0; }
    gateAt (tx: number, ty: number) { return this.inBounds(tx, ty) && this.gate[this.idx(tx, ty)] === 1; }
    /** For monsters: like boxBlocked, but doorways are shut to them too. */
    mobBlocked (x: number, y: number, hw: number, hh: number) {
        if (this.boxBlocked(x, y, hw, hh)) return true;
        for (const [px, py] of [[x - hw, y - hh], [x + hw, y - hh], [x - hw, y], [x + hw, y]]) if (this.gateAt(Math.floor(px / TILE), Math.floor(py / TILE))) return true;
        return false;
    }
    setWall (tx: number, ty: number, on: boolean) { if (this.inBounds(tx, ty)) this.wall[this.idx(tx, ty)] = on ? 1 : 0; }
    /** Flying monsters stop at walls, doorways, roofs and solid rock (a house with a roof is shut to them too). Anything already inside one may fly out. */
    flyBlocked (x: number, y: number, fromX: number, fromY: number) {
        const shut = (px: number, py: number) => { const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE); return this.wall[this.idx(tx, ty)] === 1 || this.gate[this.idx(tx, ty)] === 1 || this.roof[this.idx(tx, ty)] !== 0 || this.occ[this.idx(tx, ty)] === -1; };
        if (!this.inBounds(Math.floor(x / TILE), Math.floor(y / TILE))) return false;
        return shut(x, y) && !(this.inBounds(Math.floor(fromX / TILE), Math.floor(fromY / TILE)) && shut(fromX, fromY));
    }
    /**
     * Is this tile walled in? Spread out through everything a monster could walk across: if the pocket closes within
     * `cap` tiles without ever touching the sea or the edge of the map, it is a room (or a yard) and nothing spawns inside it.
     */
    sealed (tx: number, ty: number, cap = 400): boolean {
        if (!this.isLand(tx, ty)) return false;
        const gen = ++this.seenGen, q = this.queue;
        const open = (i: number) => this.occ[i] === 0 && this.gate[i] === 0;
        const start = this.idx(tx, ty);
        if (!open(start)) return false;
        let head = 0, tail = 0;
        this.seen[start] = gen; q[tail++] = start;
        while (head < tail) {
            if (head >= cap) return false;                              // too big to be a room
            const cur = q[head++];
            const cx = cur % W, cy = (cur - cx) / W;
            for (let d = 0; d < 4; d++) {
                const nx = cx + (d === 0 ? 1 : d === 1 ? -1 : 0), ny = cy + (d === 2 ? 1 : d === 3 ? -1 : 0);
                if (!this.isLand(nx, ny)) return false;                 // the sea (or the edge of the map): it is open
                const ni = this.idx(nx, ny);
                if (this.seen[ni] === gen || !open(ni)) continue;
                this.seen[ni] = gen;
                if (tail >= q.length) return false;
                q[tail++] = ni;
            }
        }
        return true;
    }
    setSoft (tx: number, ty: number, id: number) { if (this.inBounds(tx, ty)) this.soft[this.idx(tx, ty)] = id; }
    softAt (tx: number, ty: number) { return this.inBounds(tx, ty) ? this.soft[this.idx(tx, ty)] : 0; }
    floorAt (tx: number, ty: number) { return this.inBounds(tx, ty) ? this.floor[this.idx(tx, ty)] : 0; }
    setFloor (tx: number, ty: number, id: number) { if (this.inBounds(tx, ty)) this.floor[this.idx(tx, ty)] = id; }
    occAt (tx: number, ty: number) { return this.inBounds(tx, ty) ? this.occ[this.idx(tx, ty)] : 0; }

    /** The ore under a tile, if any. */
    veinAt (tx: number, ty: number): ItemId | null {
        const v = this.plotAt(tx, ty)?.veins;
        if (!v) return null;
        for (const e of v) if (e[0] === tx && e[1] === ty) return e[2];
        return null;
    }

    ownedPlots () { return this.plots.filter((p) => p.owned); }
    /** The plots of the Dread Reaches. */
    dreadPlots () { return this.plots.filter((p) => !!p.dread); }

    /** Unowned plots touching an owned plot on a side (the ones anyone can buy), and the cleansed nest isles (land already, anybody may buy one). */
    purchasable () {
        return this.plots.filter((p) => this.isPurchasable(p));
    }

    isPurchasable (p: Plot) {
        if (p.owned || p.dread || p.blight === 1) return false;       // (the Dread Reaches are land already, and nobody's; a nest isle is not for sale while its nest lives)
        if (p.blight === 2) return true;                               // (a cleansed nest isle: whoever stands on it may buy it)
        return [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dx, dy]) => this.plot(p.gx + dx, p.gy + dy)?.owned);
    }

    /** Is this plot ground (owned, the Dread Reaches, or a nest isle)? */
    isGround (p: Plot) { return p.owned || !!p.dread || !!p.blight; }

    /** Price for a buyer who has already bought `plotsBought` plots. */
    price (p: Plot, plotsBought: number) {
        const knee = TUNING.landPriceKnee;
        const base = plotsBought <= knee
            ? TUNING.landBasePrice * Math.pow(TUNING.landPriceGrowth, plotsBought)
            : TUNING.landBasePrice * Math.pow(TUNING.landPriceGrowth, knee) + (plotsBought - knee) * TUNING.landPriceStep;
        return Math.round(base * BIOME_DEFS[p.biome].priceMul * (p.mod ? MODS[p.mod].priceMul : 1));
    }

    /** Where a plot's price tag sits: just offshore of the owned border nearest to `near`. */
    tagAnchor (p: Plot, near: { x: number; y: number }) {
        const c = this.plotCenter(p);
        let best = c, bd = Infinity;
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            if (!this.plot(p.gx + dx, p.gy + dy)?.owned) continue;
            const half = (PLOT * TILE) / 2;
            const a = { x: c.x + dx * (half - TILE * 1.6), y: c.y + dy * (half - TILE * 1.6) };
            const d = Math.hypot(a.x - near.x, a.y - near.y);
            if (d < bd) { bd = d; best = a; }
        }
        return best;
    }

    randomFreeTile (p: Plot, rng: Rng, avoid?: { x: number; y: number }[], margin = 1) {
        const o = this.plotOrigin(p);
        for (let tries = 0; tries < 30; tries++) {
            const tx = o.tx + rng.int(margin, PLOT - 1 - margin), ty = o.ty + rng.int(margin, PLOT - 1 - margin);
            if (!this.isFree(tx, ty) || this.floor[this.idx(tx, ty)] !== 0) continue;      // (nothing grows or wanders onto a floor)
            if (avoid?.some((a) => Math.hypot((tx + 0.5) * TILE - a.x, (ty + 0.5) * TILE - a.y) < TILE * 1.6)) continue;
            return { tx, ty };
        }
        return null;
    }

    /** Which rift island (0..3) a tile is on, or -1. */
    riftAtTile (tx: number, ty: number) {
        for (let i = 0; i < RIFT_ISLANDS; i++) {
            const o = riftOrigin(i);
            if (tx >= o.tx && ty >= o.ty && tx < o.tx + PLOT && ty < o.ty + PLOT) return i;
        }
        return -1;
    }
    riftAtPx (x: number, y: number) { return this.riftAtTile(Math.floor(x / TILE), Math.floor(y / TILE)); }
    /** The middle of a rift island, in pixels (where its gate stands). */
    riftCenter (i: number) {
        const o = riftOrigin(i);
        return { x: (o.tx + PLOT / 2) * TILE, y: (o.ty + PLOT / 2) * TILE };
    }

    // ── the caves ──
    isUnder (ty: number) { return ty >= UNDER_Y; }
    isUnderPx (y: number) { return y >= UNDER_Y * TILE; }
    get caveReady () { return !!this.cave; }
    /** Make the caves (from the seed), then open every tile in `dug`. Safe to call again: it only does it once. */
    ensureCave (dug: readonly number[] = []) {
        if (!this.cave) {
            this.cave = genCave(this.seed);
            this.markCave();
            for (let y = 0; y < CAVE_N; y++) for (let x = 0; x < CAVE_N; x++) if (this.cave.rock[y * CAVE_N + x]) this.occ[(UNDER_Y + y) * W + x] = -1;
            for (const i of dug) this.openTile(i);
        }
        return this.cave;
    }
    /** All of the caves are ground (rock is solid through `occ`, not by being "sea"). */
    private markCave () { for (let y = 0; y < CAVE_N; y++) this.land.fill(1, (UNDER_Y + y) * W, (UNDER_Y + y) * W + CAVE_N); }
    /** The middles of the ancient chambers (cave cells). */
    caveChambers () { return this.cave?.chambers ?? []; }
    /** Solid, undug rock? */
    rockAt (tx: number, ty: number) { return this.inBounds(tx, ty) && this.occ[this.idx(tx, ty)] === -1; }
    /** What the rock at a tile holds besides stone (coal, iron…), if anything. */
    oreAt (tx: number, ty: number): ItemId | null {
        if (!this.cave || !this.rockAt(tx, ty)) return null;
        const k = this.cave.ore[(ty - UNDER_Y) * CAVE_N + tx];
        return k ? CAVE_ORES[k - 1] : null;
    }
    /** The ore index (1..5, 0 none) in a cave cell, whether it is still rock or not. */
    oreIndex (tx: number, ty: number) { return this.cave && ty >= UNDER_Y && ty < UNDER_Y + CAVE_N && tx >= 0 && tx < CAVE_N ? this.cave.ore[(ty - UNDER_Y) * CAVE_N + tx] : 0; }
    /** How many tiles of rock have been opened (a cheap way for views to tell the caves have changed). */
    digs = 0;
    /** Take the rock out of a tile (by world index). Returns true if there was rock. */
    openTile (i: number) {
        if (!this.cave || this.occ[i] !== -1) return false;
        this.occ[i] = 0;
        this.digs++;
        const x = i % W, y = Math.floor(i / W) - UNDER_Y;
        this.cave.rock[y * CAVE_N + x] = 0;
        return true;
    }

    /** Mark owned plots as land, with the outer corners of each coastline rounded off; rift islands are always there. */
    recompute () {
        this.land.fill(0);
        if (this.cave) this.markCave();
        for (let i = 0; i < RIFT_ISLANDS; i++) {
            const o = riftOrigin(i);
            for (let y = 0; y < PLOT; y++) for (let x = 0; x < PLOT; x++) {
                if (Math.hypot(x + 0.5 - PLOT / 2, y + 0.5 - PLOT / 2) <= RIFT_RADIUS) this.land[this.idx(o.tx + x, o.ty + y)] = 1;
            }
        }
        const owned = (gx: number, gy: number) => { const q = this.plot(gx, gy); return !!q && this.isGround(q); };
        this.landCount = 0;
        for (const p of this.plots) {
            if (!this.isGround(p)) continue;
            if (p.owned || p.dread) this.landCount++;          // (a nest isle grows nothing: it is not counted for the respawn clock)
            const o = this.plotOrigin(p);
            for (let y = 0; y < PLOT; y++) for (let x = 0; x < PLOT; x++) this.land[this.idx(o.tx + x, o.ty + y)] = 1;
            for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
                if (owned(p.gx + dx, p.gy) || owned(p.gx, p.gy + dy) || owned(p.gx + dx, p.gy + dy)) continue;
                this.land[this.idx(o.tx + (dx < 0 ? 0 : PLOT - 1), o.ty + (dy < 0 ? 0 : PLOT - 1))] = 0;
            }
        }
    }
}
