// Ore veins painted on the ground of every raised plot. Drills mine what lies beneath them.
// They are a second layer of the ground tilemap (the decals are frames of the tile sheet), so a hundred plots' worth of
// veins is one display object instead of thousands of images.

import type { World } from '../../shared/world';
import { tileVein } from '../art/sprites';
import { VEIN_KINDS } from '../art/storybook-ground';
import type { TileLayer } from './tiles';

export class VeinLayer {
    private layer: Phaser.Tilemaps.TilemapLayer;
    private drawn = new Set<number>();

    constructor (private world: World, tiles: TileLayer) {
        this.layer = tiles.map.createBlankLayer('veins', tiles.tileset, 0, 0)!.setDepth(-9).setAlpha(0.95);
    }

    /** Paint any newly owned plots (idempotent: call after every plot update). */
    sync () {
        for (const p of this.world.plots) {
            if (!p.owned || this.drawn.has(p.i) || !p.veins) continue;
            for (const [tx, ty, res] of p.veins) if (VEIN_KINDS.includes(res)) this.layer.putTileAt(tileVein(res, (tx * 7 + ty * 3) % 3), tx, ty);
            this.drawn.add(p.i);
        }
    }

    destroy () {
        this.layer.destroy();
        this.drawn.clear();
    }
}
