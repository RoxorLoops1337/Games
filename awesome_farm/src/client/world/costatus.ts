// What the co-op boss statuses look like in the world (the rules are shared/sim/costatus.ts): an ice block over a frozen farmer, a
// curse swirling round a hexed one and a chain between two tethered farmers, slack while they keep close and taut (and trembling,
// and red) when they stray. Game.ts feeds it the farmers it is drawing every frame; it keeps no state of the fight.

import { ensureMobArt } from '../art/storybook-mobs';
import * as Phaser from 'phaser';
import { CHAIN_LEN } from '../../shared/data/costatus';
import type { PlayerView } from '../../shared/net/protocol';
import { PAL } from '../../shared/palette';
import { INK, mixc } from '../art/paint';

type Img = Phaser.GameObjects.Image;
type Spr = Phaser.GameObjects.Sprite;
const MULTIPLY = Phaser.TintModes.MULTIPLY;

/** The part of a farmer's view that is drawn on: where it stands, its sprite and its worn layers. */
interface CoView { id: string; x: number; y: number; sprite: Spr; worn: Partial<Record<string, Img>> }

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));

export class CoFx {
    private g: Phaser.GameObjects.Graphics;
    private ice = new Map<string, { img: Img; born: number }>();
    private tinted = new Set<string>();
    private t = 0;

    constructor (private scene: Phaser.Scene) {
        this.g = scene.add.graphics().setDepth(5.1e4);
    }

    destroy () { this.g.destroy(); for (const i of this.ice.values()) i.img.destroy(); this.ice.clear(); }

    /** `now` is the world's clock (a status's start and end are in it). */
    update (dt: number, views: Iterable<CoView>, players: Record<string, PlayerView>, now: number) {
        this.t += dt;
        const g = this.g;
        g.clear();
        const byId = new Map<string, CoView>();
        for (const v of views) byId.set(v.id, v);
        const frozen = new Set<string>();
        for (const v of byId.values()) {
            const co = players[v.id]?.co;
            this.tint(v, co?.k);
            if (!co) continue;
            if (co.k === 'frozen') { frozen.add(v.id); this.block(v); }
            else if (co.k === 'hexed') this.curse(g, v, now - co.s);
            else if (co.k === 'tether' && co.w && v.id < co.w) {
                const other = byId.get(co.w);
                if (other && players[co.w]?.co?.k === 'tether') this.chain(g, v, other);
            }
        }
        // the ice goes (with a little shatter) when the farmer thaws or leaves
        for (const [id, i] of this.ice) {
            if (frozen.has(id)) continue;
            this.ice.delete(id);
            this.scene.tweens.add({ targets: i.img, scaleX: 1.35, scaleY: 1.2, alpha: 0, duration: 200, ease: 'Quad.easeOut', onComplete: () => i.img.destroy() });
        }
    }

    /** The farmer's own colours, cooled for ice and washed violet for a curse (cleared again when it ends). */
    private tint (v: CoView, kind: 'frozen' | 'hexed' | 'tether' | undefined) {
        const layers: (Spr | Img | undefined)[] = [v.sprite, ...Object.values(v.worn)];
        if (kind === 'frozen' || kind === 'hexed') {
            const c = kind === 'frozen' ? 0x9fd2ff : mixc(0xc9a0ff, 0xffffff, 0.5 + 0.5 * Math.sin(this.t * 6));
            for (const l of layers) l?.setTint(c).setTintMode(MULTIPLY);
            this.tinted.add(v.id);
        } else if (this.tinted.delete(v.id)) for (const l of layers) l?.clearTint();
    }

    /** The block of ice over a frozen farmer: it pops in, and stays put over them. */
    private block (v: CoView) {
        let i = this.ice.get(v.id);
        if (!i) { ensureMobArt(this.scene); i = { img: this.scene.add.image(v.x, v.y, 'fx_ice', 0).setOrigin(0.5, 1), born: this.t }; this.ice.set(v.id, i); }
        const age = this.t - i.born, k = Math.min(1, age / 0.16), pop = 1 + 0.35 * (1 - k) * (1 - k);
        i.img.setPosition(v.x, v.y + 2).setDepth(v.y + 0.5).setScale(pop * (0.6 + 0.4 * k), pop * (1.1 - 0.1 * k)).setAlpha(0.95);
    }

    /** Wisps of curse circling the farmer: more of them the longer the curse has lived (it is getting worse). */
    private curse (g: Phaser.GameObjects.Graphics, v: CoView, age: number) {
        const n = 3 + Math.min(4, Math.floor(Math.max(0, age) / 4)), cx = v.x, cy = v.y - 7;
        g.lineStyle(1, PAL.plum, 0.45 + 0.2 * Math.sin(this.t * 5)).strokeEllipse(v.x, v.y - 1, 19 + Math.sin(this.t * 4) * 2, 8);
        const cols = [PAL.plum, PAL.blossom, PAL.foam, PAL.plum];
        for (let i = 0; i < n; i++) {
            const a = this.t * 3.2 + (i * Math.PI * 2) / n, r = 8.5 + Math.sin(this.t * 4 + i * 1.7) * 1.6;
            for (let k = 0; k < 3; k++) {                                                 // (a short tail behind each wisp)
                const aa = a - k * 0.34, rr = r - k * 0.5;
                g.fillStyle(cols[i % cols.length], 0.95 - k * 0.3).fillCircle(cx + Math.cos(aa) * rr, cy + Math.sin(aa) * rr * 0.62 - Math.sin(this.t * 3 + i) * 2.4, 1.7 - k * 0.45);
            }
        }
        g.fillStyle(PAL.plum, 0.18).fillEllipse(cx, cy, 15, 17);
    }

    /** A chain of oval links from one farmer's belt to the other's, hanging when it is slack and straight and shaking when it is not. */
    private chain (g: Phaser.GameObjects.Graphics, a: CoView, b: CoView) {
        const ax = a.x, ay = a.y - 4, bx = b.x, by = b.y - 4, d = Math.hypot(bx - ax, by - ay);
        const stretch = clamp((d - CHAIN_LEN) / CHAIN_LEN), taut = d > CHAIN_LEN;
        const sag = taut ? 0 : 2 + (1 - d / CHAIN_LEN) * 16;
        const mx = (ax + bx) / 2, my = (ay + by) / 2 + sag * 2;
        const body = taut ? mixc(PAL.pebble, PAL.berry, 0.35 + 0.65 * stretch) : PAL.pebble, rim = mixc(body, INK, 0.65);
        const n = Math.max(3, Math.round((d + sag) / 4.2));
        if (taut) g.lineStyle(3, PAL.berry, 0.18 + 0.12 * Math.sin(this.t * 22)).lineBetween(ax, ay, bx, by);
        let px = ax, py = ay;
        for (let i = 1; i <= n; i++) {
            const u = i / n, w = 1 - u;
            let x = w * w * ax + 2 * w * u * mx + u * u * bx, y = w * w * ay + 2 * w * u * my + u * u * by;
            if (taut && i < n) { const s = Math.sin(this.t * 38 + i * 2.1) * (0.5 + stretch * 0.9); x += ((by - ay) / d) * s; y -= ((bx - ax) / d) * s; }       // (it trembles)
            const ang = Math.atan2(y - py, x - px), long = i % 2 === 0, rx = long ? 2.9 : 1.7, ry = long ? 1.5 : 2.1;
            const pts: Phaser.Math.Vector2[] = [];
            for (let k = 0; k < 8; k++) { const q = (k / 8) * Math.PI * 2, lx = Math.cos(q) * rx, ly = Math.sin(q) * ry; pts.push(new Phaser.Math.Vector2((px + x) / 2 + lx * Math.cos(ang) - ly * Math.sin(ang), (py + y) / 2 + lx * Math.sin(ang) + ly * Math.cos(ang))); }
            g.fillStyle(long ? body : mixc(body, INK, 0.25), 1).fillPoints(pts, true);
            g.lineStyle(1, rim, 0.95).strokePoints([...pts, pts[0]], false);
            px = x; py = y;
        }
        // a gold cuff at each end
        for (const [x, y] of [[ax, ay + 3], [bx, by + 3]]) g.lineStyle(1.5, PAL.gold, 1).strokeEllipse(x, y, 9, 4.5);
    }
}
