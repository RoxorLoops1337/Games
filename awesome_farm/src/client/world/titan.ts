// Titan nodes (a Great Oak, a Titan Boulder) in the world: the little "2+" badge that says it wants friends, a gold ring that
// pulses on the ground around it, and a health bar once somebody has started on it. Nothing here is hover-only: on a phone the
// badge is there all the time. Game.ts calls `mark` for each Titan view every frame and `draw` once after them.

import * as Phaser from 'phaser';
import { NODES } from '../../shared/data/nodes';
import { PAL } from '../../shared/palette';
import type { NodeE } from '../../shared/sim/types';
import { ensureTitanBadge, TITAN_BADGE_TEX } from '../art/badges';

type Img = Phaser.GameObjects.Image;

/** The slice of Game's entity view that this needs. */
interface ViewLike { x: number; y: number; sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite }

export class TitanFx {
    /** The ring lies on the ground (over the shadows, under everything that stands); the bar and badge hang over the world. */
    private ground: Phaser.GameObjects.Graphics;
    private air: Phaser.GameObjects.Graphics;
    private badges = new Map<number, Img>();
    private seen = new Set<number>();
    private marks: { id: number; v: ViewLike; e: NodeE }[] = [];

    constructor (private scene: Phaser.Scene) {
        ensureTitanBadge(scene);
        // (2D only: the 3D Titan models carry their own ring, badge and bar, client3d/models/nodes-titan.ts, so these stay unmarked)
        this.ground = scene.add.graphics().setDepth(-4.5);
        this.air = scene.add.graphics().setDepth(9e4);
    }

    destroy () { this.ground.destroy(); this.air.destroy(); for (const b of this.badges.values()) b.destroy(); this.badges.clear(); }

    /** A Titan node's view this frame (only when it is near the screen). */
    mark (v: ViewLike, e: NodeE, visible: boolean) {
        if (visible) this.marks.push({ id: e.id, v, e });
    }

    /** The node is gone (felled): its badge goes with it. */
    forget (id: number) {
        this.badges.get(id)?.destroy();
        this.badges.delete(id);
    }

    draw (now: number) {
        const g = this.ground, a = this.air, t = now / 1000;
        g.clear(); a.clear();
        this.seen.clear();
        for (const { id, v, e } of this.marks) {
            const def = NODES[e.kind];
            this.seen.add(id);
            const hurt = e.hp < def.hp;
            // the ring: one steady, one that opens and fades (quicker once somebody is working on it)
            const pulse = 0.5 + 0.5 * Math.sin(t * 3 + id);
            g.lineStyle(1, PAL.gold, 0.28 + 0.28 * pulse);
            g.strokeEllipse(v.x, v.y - 2, 30, 13);
            const ph = (t * (hurt ? 1.5 : 0.8) + id * 0.37) % 1;
            g.lineStyle(1, PAL.cream, 0.55 * (1 - ph));
            g.strokeEllipse(v.x, v.y - 2, 30 + ph * 22, 13 + ph * 10);
            // the badge floats over the crown
            let b = this.badges.get(id);
            if (!b) { b = this.scene.add.image(0, 0, TITAN_BADGE_TEX, 0).setDepth(9e4); this.badges.set(id, b); }
            const top = v.y - v.sprite.displayHeight;
            b.setVisible(true).setPosition(Math.round(v.x), Math.round(top - 5 - Math.abs(Math.sin(t * 2 + id)) * 1.5)).setScale(1 + 0.05 * pulse);
            // the health bar, once somebody has started
            if (hurt) {
                const w = 26, h = 4, x = Math.round(v.x - w / 2), y = Math.round(top + 3), f = Math.max(0, Math.min(1, e.hp / def.hp));
                a.fillStyle(PAL.ink, 0.9).fillRect(x - 1, y - 1, w + 2, h + 2);
                a.fillStyle(PAL.pebble, 0.5).fillRect(x, y, w, h);
                a.fillStyle(f > 0.5 ? PAL.lime : f > 0.25 ? PAL.gold : PAL.berry, 1).fillRect(x, y, Math.max(1, Math.round(w * f)), h);
            }
        }
        for (const [id, b] of this.badges) if (!this.seen.has(id)) b.setVisible(false);
        this.marks.length = 0;
    }
}
