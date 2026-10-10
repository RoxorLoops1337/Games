// The Combat Art keys on a computer: up to three small slots left of the hotbar, each with its key, its icon and a cooldown that drains.
// A phone has round buttons instead (touchcontrols.ts). Click a slot to open the Arts window (which art is on which key).

import * as Phaser from 'phaser';
import { ART_CODES, ART_SLOTS, ARTS } from '../../shared/data/arts';
import { PAL } from '../../shared/palette';
import type { PlayerS } from '../../shared/sim/types';
import { rect, STYLES } from './px';
import { icon, label, panel } from './kit';
import { hotbarLayout, type Rect } from './slots';

const SIZE = 40, GAP = 4;

interface ArtsHost { time: Phaser.Time.Clock; artCd: Record<string, number> }

export class ArtsBar {
    private g: Phaser.GameObjects.Graphics;
    private icons: Phaser.GameObjects.Image[] = [];
    private keys: Phaser.GameObjects.Text[] = [];
    private cds: Phaser.GameObjects.Text[] = [];
    private zones: Phaser.GameObjects.Zone[] = [];
    private sig = '';
    private on = false;

    constructor (scene: Phaser.Scene, private farm: ArtsHost, open: () => void) {
        this.g = scene.add.graphics().setDepth(6);
        const hot = hotbarLayout(false);
        for (let i = 0; i < ART_SLOTS; i++) {
            const x = this.x(i, hot), y = hot.y + hot.h - SIZE - 6;
            this.icons.push(icon(scene, 'k_hook', x + SIZE / 2, y + SIZE / 2, 2).setDepth(7).setVisible(false));
            this.keys.push(label(scene, x + 3, y + 2, ART_CODES[i].slice(3), 11, PAL.cream, { stroke: 3 }).setDepth(8).setVisible(false));
            this.cds.push(label(scene, x + SIZE / 2, y + SIZE / 2, '', 14, PAL.cream, { origin: [0.5, 0.5], stroke: 3, font: 'head' }).setDepth(8).setVisible(false));
            const z = scene.add.zone(x, y, SIZE, SIZE).setOrigin(0).setInteractive({ useHandCursor: true }).setDepth(9);
            z.on('pointerup', open);
            z.input!.enabled = false;
            this.zones.push(z);
        }
    }

    private x (i: number, hot = hotbarLayout(false)) { return hot.x - 10 - (ART_SLOTS - i) * (SIZE + GAP); }

    /** The strip's rectangle while it shows (other things keep clear of it). */
    get rect (): Rect | null {
        if (!this.on) return null;
        const hot = hotbarLayout(false);
        return { x: this.x(0, hot) - 2, y: hot.y + hot.h - SIZE - 8, w: ART_SLOTS * (SIZE + GAP), h: SIZE + 4 };
    }

    update (me: PlayerS, show: boolean) {
        const has = show && !!me.arts?.some(Boolean);
        const now = this.farm.time.now;
        const g = this.g, hot = hotbarLayout(false);
        const cdNow = (me.arts ?? []).map((id) => (id ? Math.max(0, (this.farm.artCd[id] ?? 0) - now) : 0));
        const sig = `${has}|${(me.arts ?? []).join(',')}|${cdNow.map((c) => Math.ceil(c / 100)).join(',')}`;
        this.on = has;
        if (sig === this.sig) return;
        this.sig = sig;
        g.clear();
        for (let i = 0; i < ART_SLOTS; i++) {
            const id = has ? me.arts![i] : null, def = id ? ARTS[id] : null;
            this.icons[i].setVisible(!!def); this.keys[i].setVisible(has && !!def); this.zones[i].input!.enabled = has;
            this.cds[i].setVisible(false);
            if (!has) continue;
            const x = this.x(i, hot), y = hot.y + hot.h - SIZE - 6;
            panel(g, x, y, SIZE, SIZE, { ...STYLES.dark, rim: def ? def.color : PAL.slate });
            if (!def) continue;
            this.icons[i].setTexture(def.icon, 0);
            const left = cdNow[i];
            if (left > 0) {
                const f = left / (def.cd * 1000);
                rect(g, x + 2, y + 2 + (SIZE - 4) * (1 - f), SIZE - 4, (SIZE - 4) * f, PAL.ink, 0.65);
                this.cds[i].setVisible(true).setText(`${Math.ceil(left / 1000)}`);
            }
        }
    }
}
