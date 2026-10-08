// Two small HUD frames about the others and the hour: the party list (the friends online, under the farmer card) and the
// dusk pill ("Night falls in 25s", at the top of the screen while the last minute of daylight runs).

import * as Phaser from 'phaser';
import { TUNING } from '../../shared/config';
import { PAL } from '../../shared/palette';
import type { PlayerView } from '../../shared/net/protocol';
import { PLAYER_COLORS } from '../../shared/sim/stats';
import { isTouchUi } from '../input/layout';
import { bar, hex, panel, rect, STYLES } from './px';
import { icon, label, shrinkToFit, TEXT_SCALE, W } from './kit';
import { DUSK_H, EDGE, LEFT, type Rect } from './slots';

/** The slice of the Game scene these two read: the clock and the wall time for the pill, you and the others for the list. */
interface PartyHost {
    readonly clock: { clock: number; night: boolean };
    readonly time: { now: number };
    readonly me: string;
    readonly players: Record<string, PlayerView>;
}

/** The friends who are online, in one frame under the farmer card and the companion (no frame when you are alone). */
export class PartyList {
    private g: Phaser.GameObjects.Graphics;
    private nameT: Phaser.GameObjects.Text[] = [];
    private lvT: Phaser.GameObjects.Text[] = [];
    private keys: string[] = [];
    private moreT: Phaser.GameObjects.Text;
    /** The rectangle while friends are in view (for things that must keep clear of it). */
    rect: Rect | null = null;
    /** Where the next widget in the column may start. */
    bottom = 0;

    constructor (scene: Phaser.Scene, private farm: PartyHost) {
        this.g = scene.add.graphics().setDepth(5);
        for (let i = 0; i < 7; i++) {
            this.nameT.push(label(scene, 0, 0, '', 13, PAL.cream).setDepth(7));
            this.lvT.push(label(scene, 0, 0, '', 12, PAL.pebble, { origin: [1, 0] }).setDepth(7));
        }
        this.moreT = label(scene, 0, 0, '', 12, PAL.pebble).setDepth(7);
    }

    update (top: number) {
        const f = this.farm, g = this.g;
        g.clear();
        const all = Object.values(f.players).filter((p) => p.id !== f.me && p.online);
        // a phone has less room: four friends at most (three and a note when there are more)
        const cap = isTouchUi() ? 4 : 7;
        const shown = all.length > cap ? all.slice(0, cap - 1) : all, more = all.length - shown.length;
        const rows = shown.length + (more ? 1 : 0);
        if (!rows) {
            this.nameT.forEach((t) => t.setVisible(false)); this.lvT.forEach((t) => t.setVisible(false)); this.moreT.setVisible(false);
            this.keys = []; this.rect = null; this.bottom = top;
            return;
        }
        const x = LEFT.x, w = LEFT.w, h = 12 + rows * 22;
        panel(g, x, top, w, h, { ...STYLES.dark, shadow: true });
        shown.forEach((p, i) => {
            const y = top + 7 + i * 22, down = p.downed > 0;
            if (i > 0) rect(g, x + 12, y - 2, w - 24, 0.5, PAL.slate, 0.3);
            rect(g, x + 13, y + 4, 12, 12, PAL.ink); rect(g, x + 14, y + 5, 10, 10, PLAYER_COLORS[p.color]);
            // the words change rarely: set them only when they do (a text is drawn again every time it is touched)
            const key = `${p.name}|${p.level}|${down}`;
            if (this.keys[i] !== key) {
                this.keys[i] = key;
                shrinkToFit(this.nameT[i].setFontSize(Math.round(13 * TEXT_SCALE)).setText(p.name).setColor(hex(down ? PAL.berry : PAL.cream)), 112, 12);
                this.lvT[i].setText(down ? 'down' : `Lv ${p.level}`).setColor(hex(down ? PAL.berry : PAL.pebble));
            }
            this.nameT[i].setPosition(x + 32, y + 1).setVisible(true);
            this.lvT[i].setPosition(x + w - 80, y + 2).setVisible(true);
            bar(g, x + w - 72, y + 5, 60, 10, p.hearts / p.mh, down ? PAL.slate : PAL.berry);
        });
        for (let i = shown.length; i < this.nameT.length; i++) { this.nameT[i].setVisible(false); this.lvT[i].setVisible(false); this.keys[i] = ''; }
        this.moreT.setVisible(!!more).setText(`…and ${more} more online`).setPosition(x + 14, top + 7 + shown.length * 22 + 1);
        this.rect = { x, y: top, w, h };
        this.bottom = top + h + LEFT.gap;
    }
}

/** "Night falls in 25s": a small pill at the top of the screen while the last minute of daylight runs (the dial in the world block warms up too). */
export class DuskPill {
    private g: Phaser.GameObjects.Graphics;
    private t: Phaser.GameObjects.Text;
    private moon: Phaser.GameObjects.Image;
    private urgent = false;
    /** The countdown is showing. */
    on = false;
    y = EDGE + 2;
    get rect (): Rect | null { return this.on ? { x: W / 2 - 100, y: this.y, w: 200, h: DUSK_H } : null; }

    constructor (scene: Phaser.Scene, private farm: PartyHost) {
        this.g = scene.add.graphics().setDepth(7);
        this.t = label(scene, W / 2 + 10, 0, '', 14, PAL.pumpkin, { origin: [0.5, 0.5], font: 'head' }).setDepth(8).setVisible(false);
        this.moon = icon(scene, 'moon', W / 2 - 78, 0, 1.2).setDepth(8).setVisible(false);
    }

    /** Is the countdown running? (Read before `update`, so the stack above can make room.) */
    static left (farm: PartyHost) {
        const c = farm.clock, left = TUNING.dayLength - c.clock;
        return !c.night && left <= TUNING.duskWarn[0] && left > 0 ? left : 0;
    }

    update (y: number, allowed = true) {
        const left = DuskPill.left(this.farm), g = this.g;
        g.clear();
        this.on = left > 0 && allowed;
        this.y = y;
        if (!this.on) { this.t.setVisible(false); this.moon.setVisible(false); return; }
        const urgent = left <= TUNING.duskWarn[1];
        const a = urgent ? 0.7 + 0.3 * Math.abs(Math.sin(this.farm.time.now / 160)) : 1;
        panel(g, W / 2 - 100, y, 200, DUSK_H, { ...STYLES.dark, rim: urgent ? PAL.berry : PAL.pumpkin, shadow: true });
        g.setAlpha(a);
        if (urgent !== this.urgent) { this.urgent = urgent; this.t.setColor(hex(urgent ? PAL.berry : PAL.pumpkin)); }
        this.t.setVisible(true).setText(`Night falls in ${Math.ceil(left)}s`).setPosition(W / 2 + 10, y + DUSK_H / 2 - 1).setAlpha(a);
        this.moon.setVisible(true).setPosition(W / 2 - 78, y + DUSK_H / 2).setAlpha(a);
    }
}
