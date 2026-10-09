// Fishing lines: from each angler's rod tip to a floating bobber. The bobber sits quietly and
// ripples while the fish thinks, dips and flashes "!" on a bite, and thrashes while a fish
// fights; the line sags when slack and goes taut when something is on it.

import type * as Phaser from 'phaser';
import { PAL } from '../../shared/palette';
import { TILE } from '../../shared/config';
import { CAST_RANGE } from '../../shared/data/fish';
import type { World } from '../../shared/world';
import { overlay3d } from './view3d-bridge';

export interface LineView {
    id: string;
    tipX: number; tipY: number;            // where the rod ends
    x: number; y: number;                  // the bobber
    ph: 0 | 1 | 2 | 3;
    mine: boolean;
}

export class FishLines {
    private g: Phaser.GameObjects.Graphics;
    private marks = new Map<string, Phaser.GameObjects.Image>();
    private t = 0;

    constructor (private scene: Phaser.Scene) {
        this.g = overlay3d(scene.add.graphics().setDepth(5000));        // (the line, the bobber and the "!" are world overlays: the 3D view shows them too)
    }

    draw (dt: number, lines: LineView[]) {
        this.t += dt;
        const g = this.g, t = this.t;
        g.clear();
        const live = new Set<string>();
        for (const l of lines) {
            live.add(l.id);
            const seed = l.id.charCodeAt(0) % 7;
            let bx = l.x, by = l.y;
            const bite = l.ph === 1 || l.ph === 3;
            if (l.ph === 0) by += Math.sin(t * 3 + seed) * 0.8;
            else if (bite) by += 2.5 + Math.sin(t * 38) * 0.8;
            else { bx += Math.sin(t * 17 + seed) * 2.2; by += Math.cos(t * 13 + seed) * 1.2; }
            // ripples
            const ripple = (age: number, speed: number) => {
                const a = (t * speed + age) % 1;
                g.lineStyle(1, PAL.foam, (1 - a) * 0.8).strokeEllipse(bx, by + 1, 4 + a * 14, 2 + a * 6);
            };
            ripple(0, l.ph === 2 ? 1.6 : 0.8);
            if (l.ph === 2 || bite) ripple(0.5, l.ph === 2 ? 1.6 : 0.8);
            // the line: slack = sags, taut = straight
            const taut = l.ph >= 2;
            const mx = (l.tipX + bx) / 2, my = (l.tipY + by) / 2 + (taut ? 0 : 9 + Math.sin(t * 2 + seed) * 1.5);
            g.lineStyle(1, PAL.cream, taut ? 0.95 : 0.75);
            g.beginPath();
            for (let i = 0; i <= 12; i++) {
                const k = i / 12;
                const px = (1 - k) * (1 - k) * l.tipX + 2 * k * (1 - k) * mx + k * k * bx;
                const py = (1 - k) * (1 - k) * l.tipY + 2 * k * (1 - k) * my + k * k * by;
                if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
            }
            g.strokePath();
            // the bobber
            g.fillStyle(PAL.ink, 1).fillRect(Math.round(bx) - 2, Math.round(by) - 3, 5, 6);
            g.fillStyle(PAL.berry, 1).fillRect(Math.round(bx) - 1, Math.round(by) - 2, 3, 2);
            g.fillStyle(PAL.snow, 1).fillRect(Math.round(bx) - 1, Math.round(by), 3, 2);
            // "!" on a bite or a tug
            let m = this.marks.get(l.id);
            if (bite) {
                if (!m) { m = overlay3d(this.scene.add.image(0, 0, 'mark_alert', 0).setDepth(5001)); this.marks.set(l.id, m); }
                m.setVisible(true).setPosition(Math.round(bx), Math.round(by - 12 - Math.abs(Math.sin(t * 14)) * 2)).setTint(l.ph === 3 ? PAL.foam : 0xffffff);
            } else m?.setVisible(false);
        }
        for (const [id, m] of this.marks) if (!live.has(id)) { m.destroy(); this.marks.delete(id); }
    }

    destroy () {
        this.g.destroy();
        for (const m of this.marks.values()) m.destroy();
        this.marks.clear();
    }
}

/** The first water tile straight ahead of the farmer, within casting range: where the bobber would land (null: no open water that way). */
export function castTarget (world: World, l: { x: number; y: number; face: { x: number; y: number } }): { x: number; y: number } | null {
    const fx = l.face.x, fy = l.face.y;
    for (let d = CAST_RANGE[0] + 6; d <= CAST_RANGE[1]; d += 6) {
        const x = l.x + fx * d, y = l.y - 4 + fy * d;
        const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
        if (world.inBounds(tx, ty) && !world.isLand(tx, ty) && world.riftAtTile(tx, ty) < 0) return { x, y };
    }
    return null;
}
