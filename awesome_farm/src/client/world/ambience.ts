// The world's moods around the farmer: the evening hearth rings, the roof you are under fading away, the caves (going
// under, the rock streaming in, the dark), the Dread Reaches' veil, waves on the sea and the brackets round your target.

import * as Phaser from 'phaser';
import { TILE, TUNING, UNDER_Y, WORLD_TILES } from '../../shared/config';
import { feetTile } from '../../shared/geom';
import { caveDepth } from '../../shared/cave';
import { BUILDINGS } from '../../shared/data/buildings';
import { PAL } from '../../shared/palette';
import type { BuildE } from '../../shared/sim/types';
import type { World } from '../../shared/world';
import type { TileLayer } from './tiles';
import type { Target } from './interact';

type Img = Phaser.GameObjects.Image;
type Spr = Phaser.GameObjects.Sprite;

/** The slice of a view the hearth and the brackets read. */
interface HearthView { sprite: Img | Spr; hgShown?: number }
interface BracketView { sprite: Img | Spr; crop?: Img }

/** The slice of the Game scene the ambience reads. */
interface AmbienceHost {
    readonly world: World;
    readonly local: { x: number; y: number };
    readonly clock: { clock: number; night: boolean };
    readonly conn: { saveFailed?: boolean };
    readonly tiles: TileLayer | null;
    readonly camTarget: Phaser.Math.Vector2;
    banner (d: { text: string; sub?: string; color?: number }): void;
    inView (x: number, y: number, margin?: number): boolean;
}

/** What one frame of hearth drawing shares: the two Graphics, whether the last minute of the day is running, the time. */
interface HearthFrame { ground: Phaser.GameObjects.Graphics; ring: Phaser.GameObjects.Graphics; on: boolean; t: number }

export class Ambience {
    /** Roof pieces by entity id, and which of them hang over the player right now. */
    readonly roofs = new Map<number, Img>();
    private roofUnder = new Set<number>();
    private roofKey = -1;
    /** The evening hearth: the ring on the ground that shows where to sit, and the ring over the fire that fills as company gathers. */
    private hearthGround?: Phaser.GameObjects.Graphics;
    private hearthRing?: Phaser.GameObjects.Graphics;
    private brackets: Phaser.GameObjects.Graphics;
    private dread = 0;
    private underAmt = 0;
    /** Is the farmer down in the caves? */
    underNow = false;
    /** Rock dug out of the caves that this client has been told about but has not made the caves for yet. */
    pendingDug: number[] = [];
    private waveT = 0;
    private healT = 0;
    private saveWarnT = 0;

    constructor (private scene: Phaser.Scene, private h: AmbienceHost) {
        this.brackets = scene.add.graphics().setDepth(1e5);
    }

    /** A new world is arriving: the roofs it brings are not the ones we knew. */
    forgetRoofs () { this.roofs.clear(); this.roofUnder.clear(); this.roofKey = -1; }

    /** 0..1: how far into the caves you are (it fades in over a moment after you climb down). */
    undergroundAmount () { return this.underAmt; }
    /** 0..1: how deep in the Dread Reaches you are standing (it fades in and out as you cross the border). */
    dreadAmount () { return this.dread; }
    /** 0 in the middle of the caves, 1 at the edge of the map (ore is richer and the dark nastier the further out you go). */
    caveDepthHere () { return caveDepth(Math.floor(this.h.local.x / TILE), Math.floor(this.h.local.y / TILE) - UNDER_Y); }

    // ── the evening hearth ──────────────────────────────────────────────────
    /** Clear last frame's rings; says whether the last minute of the day is running (the rings and the ground circle only show then). */
    beginHearths (): HearthFrame {
        const ground = (this.hearthGround ??= this.scene.add.graphics().setDepth(-4)), ring = (this.hearthRing ??= this.scene.add.graphics().setDepth(7.9e4));
        ground.clear(); ring.clear();
        const left = TUNING.dayLength - this.h.clock.clock;
        return { ground, ring, on: !this.h.clock.night && left > 0 && left <= TUNING.duskWarn[0], t: this.scene.time.now / 1000 };
    }

    /**
     * One fire (or table, or lamp) in the last minute of the day: a dotted circle on the ground that shows how close to sit, and over it a
     * ring that fills while company gathers (the world's `hg`), turns gold and pulses once the fire is kindled.
     */
    drawHearth (h: HearthFrame, v: HearthView, e: BuildE, dt: number) {
        const want = e.hg ?? 0;
        const shown = (v.hgShown ?? 0) + (want - (v.hgShown ?? 0)) * Math.min(1, dt * 7);
        v.hgShown = Math.abs(want - shown) < 0.004 ? want : shown;
        if (!h.on && v.hgShown <= 0) return;
        const l = this.h.local, [w, ht] = BUILDINGS[e.kind].size, fill = v.hgShown;
        const cx = (e.tx + w / 2) * TILE, cy = (e.ty + ht / 2) * TILE;
        if (!this.h.inView(cx, cy, 120)) return;
        const full = fill >= 0.999;
        // on the ground: where to sit (three tiles from the fire's edge), brighter while it fills, warm once it burns
        if (h.on && (fill > 0 || Math.hypot(cx - l.x, cy - l.y) < 150)) {
            const rx = (w * TILE) / 2 + TUNING.hearthRadius, ry = ((ht * TILE) / 2 + TUNING.hearthRadius) * 0.72;
            if (full) h.ground.fillStyle(PAL.pumpkin, 0.13 + 0.04 * Math.sin(h.t * 3)).fillEllipse(cx, cy + 3, rx * 2, ry * 2);
            h.ground.lineStyle(1.5, full ? PAL.gold : PAL.cream, full ? 0.75 : fill > 0 ? 0.45 + 0.4 * fill : 0.32);
            const n = 36;
            for (let i = 0; i < n; i += 2) {
                const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
                h.ground.lineBetween(cx + Math.cos(a0) * rx, cy + 3 + Math.sin(a0) * ry, cx + Math.cos(a1) * rx, cy + 3 + Math.sin(a1) * ry);
            }
        }
        // over the fire: the ring, a flame in the middle
        if (fill <= 0.001) return;
        const x = cx, y = Math.round(v.sprite.getTopCenter().y) - 10, r = 6.5 + (full ? Math.sin(h.t * 6) * 0.5 : 0);
        h.ring.fillStyle(PAL.ink, 0.62).fillCircle(x, y, 8.5);
        h.ring.lineStyle(2, PAL.pebble, 0.4).beginPath().arc(x, y, r, 0, Math.PI * 2).strokePath();
        h.ring.lineStyle(2, full ? PAL.gold : PAL.pumpkin, 1).beginPath().arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, fill)).strokePath();
        h.ring.fillStyle(PAL.pumpkin, 1).fillTriangle(x - 2.6, y + 3.2, x + 2.6, y + 3.2, x, y - 3.6);
        h.ring.fillStyle(PAL.gold, 1).fillTriangle(x - 1.3, y + 3.2, x + 1.3, y + 3.2, x, y - 0.4);
    }

    // ── roofs ───────────────────────────────────────────────────────────────
    /** The roof you are under fades away so you can see inside; every other roof stays solid. */
    updateRoofs (dt: number) {
        if (!this.roofs.size && !this.roofUnder.size) return;
        const w = this.h.world, l = this.h.local;
        const { tx, ty } = feetTile(l);
        const key = tx * 100003 + ty;
        const here = w.roofAt(tx, ty);
        if (key !== this.roofKey || (here !== 0) !== (this.roofUnder.size > 0)) {
            this.roofKey = key;
            this.roofUnder.clear();
            if (here) {
                // the whole connected roof over this room
                const seen = new Set<number>([key]), stack: [number, number][] = [[tx, ty]];
                while (stack.length && seen.size < 600) {
                    const [x, y] = stack.pop()!;
                    const id = w.roofAt(x, y);
                    if (id) this.roofUnder.add(id);
                    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                        const nx = x + dx, ny = y + dy, k = nx * 100003 + ny;
                        if (!seen.has(k) && w.roofAt(nx, ny)) { seen.add(k); stack.push([nx, ny]); }
                    }
                }
            }
        }
        const k = Math.min(1, dt * 7);
        for (const [id, im] of this.roofs) im.setAlpha(im.alpha + ((this.roofUnder.has(id) ? 0.12 : 1) - im.alpha) * k);
    }

    // ── the caves and the Dread Reaches ─────────────────────────────────────
    updateUnder (dt: number) {
        const h = this.h, l = h.local, cam = this.scene.cameras.main;
        const under = !!h.world && h.world.isUnderPx(l.y);
        if (under && !h.world.caveReady) { h.world.ensureCave(this.pendingDug); this.pendingDug = []; }
        if (under !== this.underNow) {
            this.underNow = under;
            const size = WORLD_TILES * TILE;
            cam.setBounds(0, under ? UNDER_Y * TILE : 0, size, size).setBackgroundColor(under ? 0x15121c : PAL.deepSea);
            h.camTarget.set(l.x, l.y - 8);
            cam.centerOn(l.x, l.y - 8);
            if (under) this.underAmt = Math.max(this.underAmt, 0.35);
        }
        this.underAmt += ((under ? 1 : 0) - this.underAmt) * Math.min(1, dt * 3.5);
        if (Math.abs((under ? 1 : 0) - this.underAmt) < 0.004) this.underAmt = under ? 1 : 0;
        if (h.conn.saveFailed && this.saveWarnT <= 0) {                    // the browser would not keep the solo world: say so (again every two minutes)
            this.saveWarnT = 120;
            h.banner({ text: 'Could not save', sub: 'Your browser is out of storage: free some space or you will lose progress', color: PAL.berry });
        }
        this.saveWarnT -= dt;
        if (under) h.tiles?.streamCave(l.x, l.y);
        else if (h.tiles) {                                              // once a second a pass begins over the tiles in view, a row a frame (see TileLayer.heal)
            if ((this.healT -= dt) <= 0) {
                this.healT = 1;
                h.tiles.heal(cam.midPoint.x, cam.midPoint.y, cam.displayWidth / 2 + TILE * 3, cam.displayHeight / 2 + TILE * 3);
            }
            h.tiles.healStep();
        }
    }

    updateDread (dt: number) {
        const l = this.h.local;
        const here = this.h.world.plotAtPx(l.x, l.y)?.dread ? 1 : 0;
        this.dread += (here - this.dread) * Math.min(1, dt * (here ? 1.2 : 0.7));
        if (Math.abs(here - this.dread) < 0.004) this.dread = here;
    }

    // ── the sea ─────────────────────────────────────────────────────────────
    updateWaves (dt: number) {
        this.waveT -= dt;
        if (this.waveT > 0) return;
        this.waveT = 0.18;
        const s = this.scene, w0 = this.h.world, v = s.cameras.main.worldView;
        const tx = Math.floor((v.x + Math.random() * v.width) / TILE), ty = Math.floor((v.y + Math.random() * v.height) / TILE);
        if (w0.isLand(tx, ty) || w0.isLand(tx, ty - 1)) return;
        const w = s.add.image((tx + Math.random()) * TILE, (ty + Math.random()) * TILE, 'wave', 0).setTint(PAL.foam).setAlpha(0).setDepth(-9);
        s.tweens.add({ targets: w, alpha: 0.7, x: w.x + 3, duration: 700, yoyo: true, onComplete: () => w.destroy() });
    }

    // ── the target brackets ─────────────────────────────────────────────────
    drawBrackets (t: Target | null, viewOf: (id: number) => BracketView | undefined) {
        const g = this.brackets;
        g.clear();
        if (!t) return;
        let b: { x: number; y: number; right: number; bottom: number };
        if (t.kind === 'rock') b = { x: t.tx * TILE, y: t.ty * TILE, right: (t.tx + 1) * TILE, bottom: (t.ty + 1) * TILE };
        else {
            const v = viewOf(t.ent.id);
            if (!v) return;
            b = (v.crop ?? v.sprite).getBounds();
        }
        const pad = 1 + (Math.sin(this.scene.time.now / 90) > 0 ? 1 : 0);
        const x0 = Math.floor(b.x) - pad, y0 = Math.floor(b.y) - pad, x1 = Math.ceil(b.right) + pad - 1, y1 = Math.ceil(b.bottom) + pad - 1;
        const corner = (x: number, y: number, sx: number, sy: number, color: number) => {
            g.fillStyle(color, 1);
            g.fillRect(x, y, 3 * sx, 1);
            g.fillRect(x, y, 1, 3 * sy);
        };
        for (const [color, off] of [[PAL.ink, 1], [t.kind === 'ent' && t.ent.k === 'mob' ? PAL.berry : PAL.cream, 0]] as const) {
            corner(x0 + off, y0 + off, 1, 1, color);
            corner(x1 + off, y0 + off, -1, 1, color);
            corner(x0 + off, y1 + off, 1, -1, color);
            corner(x1 + off, y1 + off, -1, -1, color);
        }
    }
}
