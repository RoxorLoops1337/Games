// The Blight in the world view: a nest throbs (bigger and darker the higher its level), wears a name plate with its kind and level, and
// a health bar once it is hurt, over a dark ring of blight on the ground; a raider in the sea wades (sunk to the waist, with ripples and
// the odd splash); a wall or doorway a raider has hurt shows a small health bar. Game.ts calls `nest`, `defense` and `wade` for the views on screen every frame and `draw` once after them.

import * as Phaser from 'phaser';
import { NEST_KINDS } from '../../shared/data/mobs';
import { PAL } from '../../shared/palette';
import { TILE } from '../../shared/config';
import { BUILDINGS } from '../../shared/data/buildings';
import type { BuildE, MobE, NodeE, Plot } from '../../shared/sim/types';
import type { World } from '../../shared/world';
import { overlay3d } from './view3d-bridge';

type Img = Phaser.GameObjects.Image;
type Txt = Phaser.GameObjects.Text;
interface ViewLike { x: number; y: number; sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite; shadow?: Img }

/** How big a nest is drawn at a level (it grows, then levels off). */
export const nestScale = (lv: number) => Math.min(1.9, 0.85 + 0.09 * (Math.max(1, lv) - 1));

export class BlightFx {
    private g: Phaser.GameObjects.Graphics;
    /** The wading ripples: 2D only (unmarked, so the 3D view, which draws its own foam on the water in client3d/wade.ts, leaves them out). */
    private wg: Phaser.GameObjects.Graphics;
    private splash: Phaser.GameObjects.Particles.ParticleEmitter;
    private plates = new Map<number, Txt>();
    private seen = new Set<number>();
    private bars: { x: number; y: number; w: number; f: number }[] = [];
    private rings: { x: number; y: number; r: number }[] = [];

    constructor (private scene: Phaser.Scene, private world: () => World) {
        this.g = overlay3d(scene.add.graphics().setDepth(9e4));          // (the bars and the nest rings are world overlays: the 3D view shows them too)
        this.wg = scene.add.graphics().setDepth(9e4);
        this.splash = scene.add.particles(0, 0, 'px', {
            emitting: false, speed: { min: 8, max: 26 }, angle: { min: 200, max: 340 }, lifespan: { min: 240, max: 420 },
            scale: { start: 1, end: 0 }, alpha: { start: 0.9, end: 0 }, gravityY: 90, tint: [PAL.foam, PAL.sea, PAL.snow],
        }).setDepth(9e4);
    }

    destroy () { this.g.destroy(); this.wg.destroy(); this.splash.destroy(); for (const t of this.plates.values()) t.destroy(); this.plates.clear(); }

    forget (id: number) { this.plates.get(id)?.destroy(); this.plates.delete(id); }

    /** A nest on screen: throb, grow with its level, and wear its plate (and its health bar once hurt). */
    nest (v: ViewLike, e: NodeE, plot: Plot | undefined, now: number) {
        const lv = Math.max(1, plot?.nl ?? 1), t = now / 1000;
        const beat = Math.max(0, Math.sin(t * (2.2 + lv * 0.05) + e.id));
        const s = nestScale(lv);
        const spr = v.sprite as Phaser.GameObjects.Sprite;
        spr.setScale(s * (1 + beat * 0.05), s * (1 - beat * 0.03));
        if (spr.setFrame) spr.setFrame(beat > 0.6 ? 1 : 0);
        const dark = Math.min(0.3, (lv - 1) * 0.03);
        spr.setTint(Phaser.Display.Color.GetColor(255 - dark * 140, 255 - dark * 160, 255 - dark * 120));
        v.shadow?.setScale(s * 2.2, 1.2);
        this.seen.add(e.id);
        const top = v.y - spr.displayHeight;
        let plate = this.plates.get(e.id);
        const words = `${plot?.nk ? NEST_KINDS[plot.nk].name : 'Blight Nest'}  Lv ${lv}`;
        if (!plate) {
            plate = overlay3d(this.scene.add.text(0, 0, words, { fontFamily: 'Pixelify Sans', fontSize: '20px', color: '#ffc0c8', stroke: '#2a1d2c', strokeThickness: 4 })
                .setResolution(2).setScale(0.25).setOrigin(0.5, 1).setDepth(9e4));
            this.plates.set(e.id, plate);
        } else if (plate.text !== words) plate.setText(words);
        const mhp = e.mhp ?? e.hp, hurt = e.hp < mhp;
        plate.setVisible(true).setPosition(Math.round(v.x), Math.round(top - (hurt ? 6 : 2)));
        if (hurt) this.bars.push({ x: v.x, y: top - 4, w: 30, f: e.hp / mhp });
        // the blight seeps: a dark ring that breathes on the ground round it
        this.rings.push({ x: v.x, y: v.y - 2, r: 14 * s + beat * 2 });
    }

    /** A defense piece a raider has hurt: a small health bar over it until it mends at dawn. */
    defense (v: ViewLike, b: BuildE) {
        const max = BUILDINGS[b.kind].hp;
        if (!max || b.hp === undefined || b.hp >= max) return;
        const [w, h] = BUILDINGS[b.kind].size;
        this.bars.push({ x: (b.tx + w / 2) * TILE, y: v.y - Math.max(h * TILE, v.sprite.displayHeight) - 3, w: 14, f: b.hp / max });
    }

    /** A raider (or anything) standing in the sea wades: sunk to the waist, with ripples and the odd splash. */
    wade (v: ViewLike, e: MobE, dt: number, flies: boolean) {
        const spr = v.sprite as Phaser.GameObjects.Sprite;
        const wet = !flies && !this.world().isLand(Math.floor(v.x / TILE), Math.floor(v.y / TILE));
        if (!wet) { if (spr.isCropped) spr.setCrop(); v.shadow?.setVisible(true); return; }
        const fh = spr.frame.realHeight, fw = spr.frame.realWidth;
        spr.setCrop(0, 0, fw, fh * 0.68);
        spr.y += 3;
        v.shadow?.setVisible(false);
        this.rings.push({ x: v.x, y: v.y - 1, r: -(6 + Math.sin(performance.now() / 160 + e.id) * 1.5) });
        if (Math.hypot(e.vx, e.vy) > 3 && Math.random() < dt * 6) this.splash.explode(2, v.x + (Math.random() - 0.5) * 6, v.y - 1);
    }

    draw () {
        const g = this.g, wg = this.wg;
        g.clear();
        wg.clear();
        for (const r of this.rings) {
            if (r.r > 0) { g.fillStyle(PAL.night, 0.22).fillEllipse(r.x, r.y, r.r * 2.2, r.r * 0.9); g.lineStyle(1, PAL.berry, 0.35).strokeEllipse(r.x, r.y, r.r * 2.2, r.r * 0.9); }
            else { const k = -r.r; wg.lineStyle(1, PAL.foam, 0.75).strokeEllipse(r.x, r.y, k * 2.2, k * 0.8); wg.lineStyle(1, PAL.snow, 0.4).strokeEllipse(r.x, r.y, k * 1.4, k * 0.5); }
        }
        for (const b of this.bars) {
            const x = Math.round(b.x - b.w / 2), y = Math.round(b.y), f = Math.max(0, Math.min(1, b.f));
            g.fillStyle(PAL.ink, 0.9).fillRect(x - 1, y - 1, b.w + 2, 4);
            g.fillStyle(PAL.night, 1).fillRect(x, y, b.w, 2);
            g.fillStyle(f > 0.5 ? PAL.lime : f > 0.25 ? PAL.gold : PAL.berry, 1).fillRect(x, y, Math.max(1, Math.round(b.w * f)), 2);
        }
        for (const [id, t] of this.plates) if (!this.seen.has(id)) t.setVisible(false);
        this.seen.clear();
        this.bars.length = 0;
        this.rings.length = 0;
    }
}
