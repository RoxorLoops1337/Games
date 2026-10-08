// The warning a farmer sees while a co-op boss status is on them (rules: shared/sim/costatus.ts): a tint over the screen, and one
// frame under the farmer saying what it is, what to do about it and how long it has to run: "Frozen! A friend can thaw you", "Hexed!
// Touch a friend to pass the curse on", "Chained! Stay within 7 tiles". It sits where the 'down' panel does (they never show together).

import * as Phaser from 'phaser';
import { TUNING } from '../../shared/config';
import { CHAIN_LEN, CO_INFO, hexTick } from '../../shared/data/costatus';
import { dist } from '../../shared/geom';
import { css, PAL } from '../../shared/palette';
import type { PlayerView } from '../../shared/net/protocol';
import type { PlayerS } from '../../shared/sim/types';
import { forDevice, H, label, W } from './kit';
import { bar, panel, rect, STYLES } from './px';

/** Where the frame starts (under the farmer, who stands in the middle of the screen) and how wide it is. */
const Y = 296, PW = 380;

/** The slice of the Game scene the warning reads: world time, the others (a chain partner's name) and where farmers are drawn. */
interface CoHudHost {
    readonly clock: { time: number };
    readonly players: Record<string, PlayerView>;
    playerScreenPos (id: string): { x: number; y: number } | null;
}

/** "¼", "½", "1" and so on: hearts as the player reads them. */
const hearts = (n: number) => (n % 1 === 0.25 ? `${Math.floor(n) || ''}¼` : n % 1 === 0.5 ? `${Math.floor(n) || ''}½` : n % 1 === 0.75 ? `${Math.floor(n) || ''}¾` : `${n}`);

export class CoHud {
    private g: Phaser.GameObjects.Graphics;
    private title: Phaser.GameObjects.Text;
    private sub: Phaser.GameObjects.Text;
    private note: Phaser.GameObjects.Text;
    private t = 0;
    private key = '';

    constructor (scene: Phaser.Scene, private farm: CoHudHost) {
        this.g = scene.add.graphics().setDepth(5.5);
        this.title = label(scene, W / 2, Y + 27, '', 24, PAL.foam, { origin: [0.5, 0.5], align: 'center', font: 'head', stroke: 3 }).setDepth(8).setVisible(false);
        this.sub = label(scene, W / 2, Y + 46, '', 12, PAL.cream, { origin: [0.5, 0], align: 'center', wrap: PW - 28 }).setDepth(8).setVisible(false);
        this.note = label(scene, W / 2, Y + 78, '', 12, PAL.pebble, { origin: [0.5, 0], align: 'center', wrap: PW - 28 }).setDepth(8).setVisible(false);
    }

    /** Called every frame; `hidden` while a window covers the screen or you are down. */
    update (dt: number, me: PlayerS, hidden: boolean) {
        this.t += dt;
        const g = this.g;
        g.clear();
        const co = me.co;
        if (!co || hidden || me.downed > 0) { this.title.setVisible(false); this.sub.setVisible(false); this.note.setVisible(false); this.key = ''; return; }
        const info = CO_INFO[co.k], now = this.farm.clock.time, left = Math.max(0, co.u - now);
        const pulse = 0.5 + 0.5 * Math.sin(this.t * 4);
        const mate = co.w ? this.farm.players[co.w] : undefined;
        // the tint: cold blue for ice, violet for a curse, and a red edge when a chain is pulling
        let d = 0;
        if (co.k === 'tether' && mate) { const pv = this.farm.playerScreenPos(me.id), pm = this.farm.playerScreenPos(mate.id); if (pv && pm) d = dist(pm.x, pm.y, pv.x, pv.y); }
        const over = co.k === 'tether' && d > CHAIN_LEN;
        rect(g, 0, 0, W, H, over ? PAL.berry : info.color, co.k === 'tether' ? (over ? 0.05 + 0.04 * pulse : 0) : 0.07 + 0.04 * pulse);
        // the frame
        const rim = over ? PAL.berry : info.color, h = 116, x = W / 2 - PW / 2;
        panel(g, x, Y, PW, h, { ...STYLES.dark, rim, shadow: true });
        const sub = forDevice(co.k === 'frozen' || co.k === 'hexed' ? info.how : `Stay within ${TUNING.coop.chainTiles} tiles of ${mate?.name ?? 'your partner'}`);
        let note = '', frac = 0, color: number = rim;
        if (co.k === 'frozen') {
            const th = co.th ?? 0;
            note = th > 0 ? 'A friend is thawing you!' : `You thaw by yourself in ${Math.ceil(left)} s`;
            frac = th > 0 ? th / TUNING.coop.thawSeconds : 1 - left / Math.max(1, co.u - co.s);
            color = th > 0 ? PAL.lime : PAL.foam;
        } else if (co.k === 'hexed') {
            const age = now - co.s, others = Object.values(this.farm.players).some((p) => p.id !== me.id && p.online && p.downed <= 0 && !p.co);
            note = `Hurts ${hearts(hexTick(age, !others))} ♥ a second, and gets worse  ·  fades in ${Math.ceil(left)} s`;
            frac = left / Math.max(1, co.u - co.s);
            color = PAL.plum;
        } else {
            note = over ? 'The chain pulls and hurts you both: step closer!' : `Chained to ${mate?.name ?? 'a friend'}  ·  ${Math.ceil(left)} s left`;
            frac = d / (CHAIN_LEN * 1.5);
            color = over ? PAL.berry : d > CHAIN_LEN * 0.8 ? PAL.gold : PAL.lime;
        }
        bar(g, x + 20, Y + h - 19, PW - 40, 10, Math.min(1, frac), color);
        const key = `${co.k}|${sub}|${note}`;
        if (key !== this.key) {
            this.key = key;
            this.title.setText(co.k === 'tether' ? `Chained${mate ? ` to ${mate.name}` : ''}!` : info.warn).setColor(css(info.color));
            this.sub.setText(sub);
            this.note.setText(note);
        }
        this.title.setVisible(true);
        this.sub.setVisible(true);
        this.note.setVisible(true).setY(Y + 78);
        this.sub.setY(Y + 46);
    }
}
