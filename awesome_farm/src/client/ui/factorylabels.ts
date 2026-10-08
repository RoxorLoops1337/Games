// The captions of the Factory view (grid percentages, items per minute, chest counts): the world side
// (world/factoryview.ts) hands over positions, and the HUD draws them as crisp text over the world.

import type * as Phaser from 'phaser';
import { hex } from './px';
import { label } from './kit';
import type { FactoryView } from '../world/factoryview';
import { clearOfHud, slots } from './slots';

/** The slice of the Game scene the captions read: the Factory view's label pool, whether a window is up, and the camera. */
interface LabelsHost {
    readonly fv: Pick<FactoryView, 'on' | 'labels' | 'nLabels'>;
    readonly menuOpen: boolean;
    worldToScreen (x: number, y: number): { x: number; y: number };
}

export class FactoryLabels {
    private pool: Phaser.GameObjects.Text[] = [];
    private shown: string[] = [];

    constructor (private scene: Phaser.Scene, private farm: LabelsHost) {}

    update () {
        const fv = this.farm.fv;
        const n = fv.on && !this.farm.menuOpen ? fv.nLabels : 0;
        const obst = n ? slots.obstacles() : [];
        for (let i = 0; i < n; i++) {
            const l = fv.labels[i];
            const t = (this.pool[i] ??= label(this.scene, 0, 0, '', 12, 0xffffff, { origin: [0.5, 1], stroke: 3, font: 'head' }).setDepth(3));
            const key = `${l.text}|${l.color}`;
            if (this.shown[i] !== key) { this.shown[i] = key; t.setText(l.text).setColor(hex(l.color)); }
            const s = this.farm.worldToScreen(l.x, l.y);
            // a caption that would sit under the cards or the buttons slides sideways until it is clear (and waits out of sight if there is no room)
            const spot = clearOfHud({ x: s.x - t.width / 2, y: s.y - t.height, w: t.width, h: t.height }, obst, 120);
            t.setPosition(Math.round(spot ? spot.x + t.width / 2 : s.x), Math.round(spot ? spot.y + t.height : s.y)).setVisible(!!spot);
        }
        for (let i = n; i < this.pool.length; i++) this.pool[i].setVisible(false);
    }
}
