// The Farm Coffer's window: what is in the box, what you put in, and three buttons (put 100, put all, take your share back).
// The rules are in shared/sim/coffer.ts; this only asks.

import type * as Phaser from 'phaser';
import { PAL } from '../../../shared/palette';
import { shareOf, totalOf } from '../../../shared/sim/coffer';
import { ts, Win, type Footer } from '../kit';
import { hex } from '../px';
import type { Screen, ScreenCtx } from './types';

export class CofferScreen implements Screen {
    private win: Win;
    private id: number;
    private foot: Footer;
    private totalT: Phaser.GameObjects.Text;
    private mineT: Phaser.GameObjects.Text;
    private key = '';

    constructor (private ctx: ScreenCtx, arg: unknown) {
        const s = ctx.scene;
        this.id = (arg as { id: number }).id;
        this.win = new Win(s, { size: 'small', title: 'Farm Coffer', icon: 'coffer', accent: PAL.gold, onClose: () => ctx.close() });
        const w = this.win, body = w.body;
        const put = (n: number) => ctx.send({ t: 'coffer', op: 'put', id: this.id, n });
        this.foot = w.footer({
            primary: { label: 'Put 100', w: 120, onClick: () => put(100) },
            extras: [{ label: 'Put all', w: 110, onClick: () => put(1e9) }],
            secondary: [{ label: 'Take mine back', w: 140, onClick: () => ctx.send({ t: 'coffer', op: 'take', id: this.id, n: 1e9 }) }],
            hint: '',
        });
        this.totalT = w.text('', body.x + body.w / 2, body.y + 24, 26, PAL.gold, { font: 'head', origin: [0.5, 0] });
        this.mineT = w.text('', body.x + body.w / 2, body.y + 66, ts('head'), PAL.cream, { origin: [0.5, 0], bold: false });
        w.text('The whole farm can pay in. You can only take back what you put in. When anyone buys land and is short of coins, the coffers pay the difference.', body.x + 8, body.y + 110, ts('body'), PAL.pebble, { bold: false, wrap: body.w - 16 });
    }

    update () {
        const e = this.ctx.farm.ents[this.id];
        if (!e || e.k !== 'bld') { this.ctx.close(); return; }
        const me = this.ctx.me();
        const all = Object.values(this.ctx.farm.ents).filter((x) => x.k === 'bld' && x.kind === 'coffer').reduce((a, x) => a + (x.k === 'bld' ? totalOf(x) : 0), 0);
        const k = `${totalOf(e)}|${shareOf(e, me.id)}|${all}|${me.coins}`;
        if (k === this.key) return;
        this.key = k;
        this.totalT.setText(`${totalOf(e)} coins`);
        this.mineT.setText(`You put in ${shareOf(e, me.id)}   ·   you carry ${me.coins}`).setColor(hex(PAL.cream));
        this.foot.setHint(all !== totalOf(e) ? `All coffers together: ${all} coins` : '', PAL.pebble);
    }

    destroy () { this.win.destroy(); }
}

