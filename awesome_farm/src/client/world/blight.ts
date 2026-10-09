// The Blight in the world view: a nest throbs (bigger and darker the higher its level), wears a name plate with its kind and level, and
// a health bar once it is hurt, over a dark ring of blight on the ground. Game.ts calls `nest` for the views on screen every frame and
// `draw` once after them.

import * as Phaser from 'phaser';
import { NEST_KINDS } from '../../shared/data/mobs';
import { PAL } from '../../shared/palette';
import type { NodeE, Plot } from '../../shared/sim/types';

type Img = Phaser.GameObjects.Image;
type Txt = Phaser.GameObjects.Text;
interface ViewLike { x: number; y: number; sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite; shadow?: Img }

/** How big a nest is drawn at a level (it grows, then levels off). */
export const nestScale = (lv: number) => Math.min(1.9, 0.85 + 0.09 * (Math.max(1, lv) - 1));

export class BlightFx {
    private g: Phaser.GameObjects.Graphics;
    private plates = new Map<number, Txt>();
    private seen = new Set<number>();
    private bars: { x: number; y: number; w: number; f: number }[] = [];
    private rings: { x: number; y: number; r: number }[] = [];

    constructor (private scene: Phaser.Scene) {
        this.g = scene.add.graphics().setDepth(9e4);
    }

    destroy () { this.g.destroy(); for (const t of this.plates.values()) t.destroy(); this.plates.clear(); }

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
            plate = this.scene.add.text(0, 0, words, { fontFamily: 'Pixelify Sans', fontSize: '20px', color: '#ffc0c8', stroke: '#2a1d2c', strokeThickness: 4 })
                .setResolution(2).setScale(0.25).setOrigin(0.5, 1).setDepth(9e4);
            this.plates.set(e.id, plate);
        } else if (plate.text !== words) plate.setText(words);
        const mhp = e.mhp ?? e.hp, hurt = e.hp < mhp;
        plate.setVisible(true).setPosition(Math.round(v.x), Math.round(top - (hurt ? 6 : 2)));
        if (hurt) this.bars.push({ x: v.x, y: top - 4, w: 30, f: e.hp / mhp });
        // the blight seeps: a dark ring that breathes on the ground round it
        this.rings.push({ x: v.x, y: v.y - 2, r: 14 * s + beat * 2 });
    }

    draw () {
        const g = this.g;
        g.clear();
        for (const r of this.rings) {
            if (r.r > 0) { g.fillStyle(PAL.night, 0.22).fillEllipse(r.x, r.y, r.r * 2.2, r.r * 0.9); g.lineStyle(1, PAL.berry, 0.35).strokeEllipse(r.x, r.y, r.r * 2.2, r.r * 0.9); }
            else { const k = -r.r; g.lineStyle(1, PAL.foam, 0.75).strokeEllipse(r.x, r.y, k * 2.2, k * 0.8); g.lineStyle(1, PAL.snow, 0.4).strokeEllipse(r.x, r.y, k * 1.4, k * 0.5); }
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
