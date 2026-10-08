// Draws the shared World's land/sea as a Phaser tilemap. New land ripples up ring by ring.

import { PLOT, RIFT_ISLANDS, riftOrigin, TILE, UNDER_Y, WORLD_H, WORLD_TILES } from '../../shared/config';
import { SS } from '../res';
import type { Plot } from '../../shared/sim/types';
import type { World } from '../../shared/world';
import { TILE_RIFT_CLIFF, TILE_SHALLOW, tileCaveFloor, tileCliff, tileGround, tileRift, tileRockFace, tileRockTop, tileShore } from '../art/sprites';

const W = WORLD_TILES;
const H = WORLD_H;
/** The caves are tiled a chunk at a time, around whoever is down there: half a million tiles at once would be far too many. */
const CHUNK = 32;

/** Deep water has no tile: the animated sea (sea.ts) shows through the empty cells. */
const TILE_SEA = -2;

export class TileLayer {
    readonly layer: Phaser.Tilemaps.TilemapLayer;
    /** The map and its tile sheet, shared with the vein layer (world/veins.ts). */
    readonly map: Phaser.Tilemaps.Tilemap;
    readonly tileset: Phaser.Tilemaps.Tileset;
    private tiles = new Int16Array(W * H).fill(-1);
    private chunks = new Map<number, number[]>();        // loaded cave chunks → the tile indexes drawn for each
    private lastChunk = -1;
    /** While new land is still rippling up (wall-clock ms), the ripple owns the tiles and `heal` leaves them alone. */
    private rippleUntil = 0;
    /** The heal pass under way: the rows still to check (one a frame) and its columns. */
    private healing: { x0: number; x1: number; ty: number; y1: number } | null = null;

    constructor (private scene: Phaser.Scene, private world: World) {
        this.map = scene.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: W, height: H });
        // the tile image is painted at SS× density: cut it in whole painted tiles, the map still places 16-unit cells
        this.tileset = this.map.addTilesetImage('tiles', 'tiles', TILE * SS, TILE * SS, 0, 0)!;
        this.layer = this.map.createBlankLayer('ground', this.tileset, 0, 0)!;
        this.layer.setDepth(-10);
        this.redraw();
    }

    /** Take the map and every layer on it down (the vein layer too). */
    destroy () { this.map.destroy(); }

    private tileFor (tx: number, ty: number): number {
        const w = this.world;
        const h = ((tx * 92837111) ^ (ty * 689287499)) >>> 0;
        if (w.isLand(tx, ty)) {
            // mostly plain ground, now and then a tuft, flowers or pebbles
            const r = h % 100, variant = r < 25 ? 0 : r < 50 ? 1 : r < 75 ? 2 : r < 83 ? 3 : r < 92 ? 4 : 5;
            const plot = w.plotAt(tx, ty);
            return plot ? tileGround(plot.biome, variant) : tileRift(variant % 3);
        }
        if (w.isLand(tx, ty - 1)) { const above = w.plotAt(tx, ty - 1); return above ? tileCliff(above.biome) : TILE_RIFT_CLIFF; }
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            if (!w.isLand(tx + dx, ty + dy)) continue;
            // shallow water by the shore: foam on the sides that touch land
            const e = w.isLand(tx + 1, ty), wl = w.isLand(tx - 1, ty), so = w.isLand(tx, ty + 1);
            const se = !e && !so && w.isLand(tx + 1, ty + 1), sw = !wl && !so && w.isLand(tx - 1, ty + 1);
            const mask = (e ? 1 : 0) | (wl ? 2 : 0) | (so ? 4 : 0) | (se ? 8 : 0) | (sw ? 16 : 0);
            return mask ? tileShore(mask) : TILE_SHALLOW;
        }
        return TILE_SEA;
    }

    // ── the caves ──
    private caveTile (tx: number, ty: number): number {
        const w = this.world, h = ((tx * 92837111) ^ (ty * 689287499)) >>> 0;
        if (w.rockAt(tx, ty)) {
            const ore = w.oreIndex(tx, ty);
            return w.rockAt(tx, ty + 1) || !w.isLand(tx, ty + 1) ? tileRockTop(h % 3, ore) : tileRockFace(h % 2, ore);       // (a rock tile with open floor to its south shows its front)
        }
        const r = h % 100;
        return tileCaveFloor(r < 28 ? 0 : r < 56 ? 1 : r < 84 ? 2 : r < 90 ? 3 : r < 96 ? 4 : 5);
    }

    /** Keep the cave tiles drawn around (px, py): load the chunks nearby, drop the ones far away. Cheap when nothing changed. */
    streamCave (px: number, py: number) {
        if (!this.world.caveReady) return;
        const cx = Math.floor(px / TILE / CHUNK), cy = Math.floor((py / TILE - UNDER_Y) / CHUNK);
        const here = cy * 100 + cx;
        if (here === this.lastChunk) return;
        this.lastChunk = here;
        const maxC = Math.floor(W / CHUNK);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const x = cx + dx, y = cy + dy;
            if (x < 0 || y < 0 || x > maxC || y > maxC) continue;
            const key = y * 100 + x;
            if (!this.chunks.has(key)) this.loadChunk(x, y, key);
        }
        for (const key of [...this.chunks.keys()]) {
            const x = key % 100, y = Math.floor(key / 100);
            if (Math.abs(x - cx) > 2 || Math.abs(y - cy) > 2) this.dropChunk(key);
        }
    }

    private loadChunk (cx: number, cy: number, key: number) {
        const list: number[] = [];
        for (let y = 0; y < CHUNK; y++) {
            for (let x = 0; x < CHUNK; x++) {
                const tx = cx * CHUNK + x, ty = UNDER_Y + cy * CHUNK + y;
                if (tx >= W || ty >= H) continue;
                const t = this.caveTile(tx, ty), i = ty * W + tx;
                this.tiles[i] = t;
                this.layer.putTileAt(t, tx, ty);
                list.push(i);
            }
        }
        this.chunks.set(key, list);
    }

    private dropChunk (key: number) {
        for (const i of this.chunks.get(key) ?? []) { this.layer.removeTileAt(i % W, Math.floor(i / W)); this.tiles[i] = -1; }
        this.chunks.delete(key);
    }

    /** A tile of rock was dug out: re-tile it and the tiles around it (the one above now shows its face, ore frames change). */
    openCave (i: number) {
        const tx = i % W, ty = Math.floor(i / W);
        for (const [dx, dy] of [[0, 0], [0, -1], [0, 1], [-1, 0], [1, 0]]) {
            const x = tx + dx, y = ty + dy, j = y * W + x;
            if (y < UNDER_Y || y >= H || x < 0 || x >= W || this.tiles[j] < 0) continue;       // (only what is drawn)
            const t = this.caveTile(x, y);
            if (t === this.tiles[j]) continue;
            this.tiles[j] = t;
            this.layer.putTileAt(t, x, y);
        }
    }

    /**
     * Make the tiles round a point what the world says they are. A ripple that never finished, a plot that arrived while the
     * page was asleep or any other missed redraw would leave land drawn as sea (and the farmer walking on 'water'): this
     * quietly puts it right. `heal` begins a pass over what the camera can see (about once a second); `healStep`, called every
     * frame, checks one row of it, so the work is spread thin instead of landing in one frame.
     */
    heal (x: number, y: number, rx: number, ry: number) {
        if (performance.now() < this.rippleUntil) return;
        this.healing = {
            x0: Math.max(0, Math.floor((x - rx) / TILE)), x1: Math.min(W - 1, Math.ceil((x + rx) / TILE)),
            ty: Math.max(0, Math.floor((y - ry) / TILE)), y1: Math.min(UNDER_Y - 1, Math.ceil((y + ry) / TILE)),
        };
    }

    healStep () {
        const h = this.healing;
        if (!h) return;
        const ty = h.ty++;
        if (ty > h.y1) { this.healing = null; return; }
        for (let tx = h.x0; tx <= h.x1; tx++) {
            const want = this.tileFor(tx, ty), have = this.layer.getTileAt(tx, ty)?.index ?? TILE_SEA;
            if (have === want) continue;
            this.tiles[ty * W + tx] = want;
            if (want === TILE_SEA) this.layer.removeTileAt(tx, ty); else this.layer.putTileAt(want, tx, ty);
        }
    }

    /**
     * Re-tile the map (or just around `rising`). A freshly bought plot ripples up from
     * its centre ring by ring; `onRing` fires per ring (for splashes).
     */
    redraw (rising?: Plot, onRing?: (x: number, y: number, ring: number) => void) {
        const w = this.world;
        const c = rising ? w.plotCenter(rising) : null;
        // only the ground near land has anything to draw: the rest of the sea is empty cells (and a big world is a lot of cells)
        const rects: [number, number, number, number][] = [];
        if (rising) { const o = w.plotOrigin(rising); rects.push([o.tx - 2, o.ty - 2, o.tx + PLOT + 2, o.ty + PLOT + 2]); }
        else {
            for (const p of w.plots) if (p.owned || p.dread) { const o = w.plotOrigin(p); rects.push([o.tx - 2, o.ty - 2, o.tx + PLOT + 2, o.ty + PLOT + 2]); }
            for (let i = 0; i < RIFT_ISLANDS; i++) { const o = riftOrigin(i); rects.push([o.tx - 2, o.ty - 2, o.tx + PLOT + 2, o.ty + PLOT + 2]); }
        }
        const rings = new Map<number, number[]>();
        for (const [x0, y0, x1, y1] of rects) {
            for (let ty = Math.max(0, y0); ty <= Math.min(W - 1, y1); ty++) {
                for (let tx = Math.max(0, x0); tx <= Math.min(W - 1, x1); tx++) {
                    const i = ty * W + tx;
                    const t = this.tileFor(tx, ty);
                    if (this.tiles[i] === t) continue;
                    const ring = c ? Math.floor(Math.max(Math.abs((tx + 0.5) * TILE - c.x), Math.abs((ty + 0.5) * TILE - c.y)) / TILE) : 0;
                    if (!rings.has(ring)) rings.set(ring, []);
                    rings.get(ring)!.push(i);
                    this.tiles[i] = t;
                }
            }
        }
        if (c && rings.size) this.rippleUntil = performance.now() + (Math.max(...rings.keys()) + 1) * 45 + 400;
        for (const [ring, list] of rings) {
            const put = () => {
                for (const i of list) {
                    if (this.tiles[i] === TILE_SEA) this.layer.removeTileAt(i % W, Math.floor(i / W));
                    else this.layer.putTileAt(this.tiles[i], i % W, Math.floor(i / W));
                }
                if (c && onRing) onRing(c.x, c.y, ring);
            };
            if (c) this.scene.time.delayedCall(ring * 45, put);
            else put();
        }
    }
}
