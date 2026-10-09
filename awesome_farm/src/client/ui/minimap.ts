// The corner map in the world block and the big map's drawing: plots as cells, landmarks, pings and farmers as dots; down
// in the caves, a little window of the rock around you instead. Redrawn five times a second, or when something changed.

import * as Phaser from 'phaser';
import { GRID, PLOT, RIFT_ISLANDS, SEA, TILE } from '../../shared/config';
import { BIOME_DEFS } from '../../shared/data/biomes';
import { PAL } from '../../shared/palette';
import { PLAYER_COLORS } from '../../shared/sim/stats';
import type { GameScene } from '../scenes/Game';
import { SS } from '../res';
import { hex, panel, rect, STYLES } from './px';
import { label } from './kit';
import { MINI_CELL, MINI_SPAN, worldBlock } from './slots';

export class Minimap {
    private mapG: Phaser.GameObjects.Graphics;
    private caveG: Phaser.GameObjects.Graphics;
    private depthT: Phaser.GameObjects.Text;
    private caveKey = '';
    private caveAt = 0;
    /** Seconds until the corner map is drawn again (it walks every plot: five times a second is plenty). */
    private mapIn = 0;
    private t = 0;

    constructor (private scene: Phaser.Scene, private farm: GameScene, touch: boolean) {
        const wb = worldBlock(touch);
        this.mapG = scene.add.graphics().setDepth(5);
        this.caveG = scene.add.graphics().setDepth(5).setVisible(false);
        this.depthT = label(scene, wb.map.x + wb.map.w / 2, wb.map.y + wb.map.h - 4, '', 11, PAL.cream, { origin: [0.5, 1], stroke: 3 }).setDepth(6).setVisible(false);
    }

    /** Once a frame: the corner map (five times a second: it walks every plot in its window). */
    update (dt: number, touch: boolean) {
        this.t += dt;
        if ((this.mapIn -= dt) > 0) return;
        this.mapIn = 0.2;
        const f = this.farm, wb = worldBlock(touch);
        const pp = f.playerPos, pg = (v: number) => Math.round(v / (PLOT * TILE) - SEA - MINI_SPAN / 2);
        if (f.underground) {
            const d = f.caveDepthHere();
            this.depthT.setVisible(true).setText(d < 0.35 ? 'The upper caves' : d < 0.7 ? 'The deep caves' : 'The edge of the world');
            this.mapG.setVisible(false); this.caveG.setVisible(true);
            this.drawCaveMap(this.caveG, wb.map.x, wb.map.y);
        } else {
            this.depthT.setVisible(false);
            this.caveG.setVisible(false); this.mapG.setVisible(true);
            this.draw(this.mapG, wb.map.x, wb.map.y, MINI_CELL, undefined, false, false, { gx: Math.max(0, Math.min(GRID - MINI_SPAN, pg(pp.x))), gy: Math.max(0, Math.min(GRID - MINI_SPAN, pg(pp.y))), span: MINI_SPAN });
        }
    }

    /** Down in the caves the corner map is a little window of the rock around you: what you have dug, the ore you can see, ladders and friends. Redrawn only when something changed. */
    private drawCaveMap (g: Phaser.GameObjects.Graphics, x: number, y: number) {
        const f = this.farm, w = f.world, P = f.playerPos;
        const cx = Math.floor(P.x / TILE), cy = Math.floor(P.y / TILE), N = 34, C = 4;
        const key = `${cx},${cy},${w.digs}`;
        const now = this.scene.time.now;
        if (key === this.caveKey && now - this.caveAt < 300) return;
        this.caveKey = key; this.caveAt = now;
        g.clear();
        rect(g, x, y, N * C, N * C, PAL.ink);
        const ORE = [0, 0x0e0c14, 0xe0a080, 0xf5a050, 0xffd966, 0x9ee0ff];
        for (let j = 0; j < N; j++) {
            for (let i = 0; i < N; i++) {
                const tx = cx - N / 2 + i, ty = cy - N / 2 + j;
                if (!w.isLand(tx, ty)) continue;
                const rock = w.rockAt(tx, ty), ore = rock ? w.oreIndex(tx, ty) : 0;
                rect(g, x + i * C, y + j * C, C, C, ore ? ORE[ore] : rock ? 0x5b5676 : 0x2a2740);
                if (rock && !ore && (tx + ty) % 2 === 0) rect(g, x + i * C, y + j * C, C, 1, 0x6f6a8a);
            }
        }
        for (const e of Object.values(f.ents)) {
            if (e.k !== 'bld' || e.kind !== 'mineladder') continue;
            const i = e.tx - (cx - N / 2), j = e.ty - (cy - N / 2);
            if (i >= 0 && j >= 0 && i < N && j < N) { rect(g, x + i * C - 1, y + j * C - 1, C + 2, C + 2, PAL.ink); rect(g, x + i * C, y + j * C, C, C, PAL.cream); }
        }
        const pk = f.players[f.me]?.pk;
        if (pk) {
            const i = Math.floor(pk.x / TILE) - (cx - N / 2), j = Math.floor(pk.y / TILE) - (cy - N / 2);
            if (i >= 0 && j >= 0 && i < N && j < N) { rect(g, x + i * C - 2, y + j * C - 2, C + 4, C + 4, PAL.ink); rect(g, x + i * C - 1, y + j * C - 1, C + 2, C + 2, PAL.gold); }
        }
        for (const p of Object.values(f.players)) {
            if (!p.online || p.id === f.me) continue;
            const i = Math.floor(p.x / TILE) - (cx - N / 2), j = Math.floor(p.y / TILE) - (cy - N / 2);
            if (i >= 0 && j >= 0 && i < N && j < N) { rect(g, x + i * C - 1, y + j * C - 1, C + 2, C + 2, PAL.ink); rect(g, x + i * C, y + j * C, C, C, PLAYER_COLORS[p.color]); }
        }
        const i = N / 2, j = N / 2;
        rect(g, x + i * C - 1, y + j * C - 1, C + 2, C + 2, PAL.ink); rect(g, x + i * C, y + j * C, C, C, PAL.snow);
    }

    /**
     * Plots as cells: owned land in its biome colour, sea dark, buyable plots light; players as dots.
     * With `view`, only that window of plots is drawn (the corner minimap follows you around the big world).
     */
    draw (g: Phaser.GameObjects.Graphics, x: number, y: number, cell: number, labels?: Phaser.GameObjects.Container, big = false, framed = true, view?: { gx: number; gy: number; span: number }) {
        const f = this.farm;
        g.clear();
        const span = view?.span ?? GRID, ox = view?.gx ?? 0, oy = view?.gy ?? 0;
        const size = span * cell;
        if (framed) panel(g, x - 6, y - 6, size + 12, size + 12, { ...STYLES.dark, shadow: !big });
        rect(g, x, y, size, size, PAL.deepSea);
        for (let i = 0; i < span; i += 2) rect(g, x, y + i * cell, size, 1, PAL.sea, 0.12);
        for (const p of f.world.plots) {
            if (p.gx < ox || p.gy < oy || p.gx >= ox + span || p.gy >= oy + span) continue;
            const cx = x + (p.gx - ox) * cell, cy = y + (p.gy - oy) * cell;
            if (p.owned) {
                rect(g, cx, cy, cell, cell, BIOME_DEFS[p.biome].color);
                if (cell >= 12) { rect(g, cx, cy, cell, 2, PAL.snow, 0.18); rect(g, cx, cy + cell - 2, cell, 2, PAL.ink, 0.22); }
            } else if (p.dread) {
                // the Dread Reaches: dark violet land that breathes, with a skull in its middle
                rect(g, cx, cy, cell, cell, PAL.night);
                rect(g, cx, cy, cell, cell, PAL.plum, 0.35 + 0.18 * Math.sin(this.t * 2 + p.gx));
                if (p.dread === 2 && cell >= 5) {
                    const m = Math.max(1, Math.floor(cell / 4)), sx = cx + Math.floor(cell / 2) - m, sy = cy + Math.floor(cell / 2) - m;
                    rect(g, sx, sy, m * 2, m * 2, PAL.cream); rect(g, sx + Math.max(0, m - 1), sy + m * 2, Math.max(1, m), Math.max(1, m - 1), PAL.cream);
                    rect(g, sx, sy + Math.floor(m / 2), Math.max(1, Math.floor(m * 0.7)), Math.max(1, Math.floor(m * 0.7)), PAL.ink); rect(g, sx + m * 2 - Math.max(1, Math.floor(m * 0.7)), sy + Math.floor(m / 2), Math.max(1, Math.floor(m * 0.7)), Math.max(1, Math.floor(m * 0.7)), PAL.ink);
                }
            } else if (p.blight === 1) {
                // a Blight nest isle: bruised dark land with a red mark that throbs, bigger for a higher level (always shown: a reason to go out)
                rect(g, cx, cy, cell, cell, PAL.night);
                rect(g, cx, cy, cell, cell, PAL.berry, 0.18 + 0.12 * Math.sin(this.t * 3 + p.gx * 1.7));
                const m = Math.max(1, Math.round(cell * Math.min(0.42, 0.18 + 0.03 * (p.nl ?? 1)))), mx = cx + Math.floor(cell / 2), my = cy + Math.floor(cell / 2);
                rect(g, mx - m - 1, my - m - 1, m * 2 + 2, m * 2 + 2, PAL.ink); rect(g, mx - m, my - m, m * 2, m * 2, PAL.berry);
            } else if (p.blight === 2) {
                // a cleansed nest isle: plain land nobody owns yet (anybody may buy it)
                rect(g, cx, cy, cell, cell, BIOME_DEFS[p.biome].color, 0.45);
                rect(g, cx + 1, cy + 1, cell - 2, cell - 2, PAL.foam, 0.2 + 0.12 * Math.sin(this.t * 3));
            } else if (f.world.isPurchasable(p)) {
                const pulse = 0.25 + 0.15 * Math.sin(this.t * 3);
                rect(g, cx + 1, cy + 1, cell - 2, cell - 2, PAL.foam, pulse);
            }
            if (p.heart) { g.lineStyle(big ? 2 : 1, PAL.berry, 1).strokeRect(cx + 0.5, cy + 0.5, cell - 1, cell - 1); }
        }
        const toMap = (wx: number, wy: number) => ({ x: x + (wx / (PLOT * TILE) - SEA - ox) * cell, y: y + (wy / (PLOT * TILE) - SEA - oy) * cell });
        const inside = (m: { x: number; y: number }) => m.x >= x && m.y >= y && m.x <= x + size && m.y <= y + size;
        // the four rift islands live off the edge of the world: a violet diamond in each corner
        const riftSpot = (i: number) => ({ x: x + (i & 1 ? size - cell * 0.55 : cell * 0.55), y: y + (i & 2 ? size - cell * 0.55 : cell * 0.55) });
        for (let i = 0; i < RIFT_ISLANDS && !view; i++) {
            const m = riftSpot(i), r = big ? Math.max(4, cell / 3) : 3;
            const live = f.meS?.rift?.arena === i;
            g.fillStyle(PAL.ink, 1).fillPoints([new Phaser.Math.Vector2(m.x, m.y - r - 1), new Phaser.Math.Vector2(m.x + r + 1, m.y), new Phaser.Math.Vector2(m.x, m.y + r + 1), new Phaser.Math.Vector2(m.x - r - 1, m.y)], true);
            g.fillStyle(live ? PAL.cream : PAL.plum, 1).fillPoints([new Phaser.Math.Vector2(m.x, m.y - r), new Phaser.Math.Vector2(m.x + r, m.y), new Phaser.Math.Vector2(m.x, m.y + r), new Phaser.Math.Vector2(m.x - r, m.y)], true);
        }
        // landmarks: waystones, dens and altars you have seen, and any boss that is awake (the world keeps the list: no walk over every entity)
        for (const e of f.landmarks()) {
            if (e.k === 'bld') {
                const m = toMap((e.tx + 1) * TILE, (e.ty + 1) * TILE);
                if (!inside(m)) continue;
                const col = e.kind === 'waystone' ? PAL.foam : e.kind === 'den' ? PAL.pumpkin : PAL.plum;
                const r = big ? Math.max(3, cell / 4) : 2;
                rect(g, m.x - r - 1, m.y - r - 1, r * 2 + 2, r * 2 + 2, PAL.ink); rect(g, m.x - r, m.y - r, r * 2, r * 2, col);
            } else if (e.k === 'mob') {
                const m = toMap(e.x, e.y);
                if (!inside(m)) continue;
                const pulse = 2 + Math.abs(Math.sin(this.t * 5)) * 2;
                g.fillStyle(PAL.ink, 1).fillCircle(m.x, m.y, pulse + 1.5);
                g.fillStyle(PAL.berry, 1).fillCircle(m.x, m.y, pulse);
            }
        }
        for (const pg of f.pingMarks) {
            const m = toMap(pg.x, pg.y);
            if (!inside(m)) continue;
            g.lineStyle(1, pg.color, 1).strokeCircle(m.x, m.y, 2 + ((pg.age * 6) % 5));
        }
        for (const p of Object.values(f.players)) {
            if (!p.online) continue;
            const pos = p.id === f.me ? f.playerPos : f.playerScreenPos(p.id) ?? p;
            const rift = f.world.riftAtPx(pos.x, pos.y);
            const m = rift >= 0 ? riftSpot(rift) : toMap(pos.x, pos.y);
            if (view ? rift >= 0 || !inside(m) : false) continue;
            const r = big ? cell / 3 : 2;
            g.fillStyle(PAL.ink, 1).fillCircle(m.x, m.y, r + 1);
            g.fillStyle(p.id === f.me ? PAL.snow : PLAYER_COLORS[p.color], 1).fillCircle(m.x, m.y, r);
            labels?.add(this.scene.add.text(m.x, m.y - r - 2, p.id === f.me ? 'you' : p.name, { fontFamily: '"Jersey 15", "Pixelify Sans"', fontSize: '15px', color: hex(PLAYER_COLORS[p.color]), stroke: hex(PAL.ink), strokeThickness: 3, resolution: SS }).setOrigin(0.5, 1));
        }
    }
}
