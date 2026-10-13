// The Request Board's window: what the farm has asked for, one row each, with Fill (hand in what you carry) or Take down (your own).
// "Ask for something" asks the player for words like "plank 50" (the rules and the reading of them are shared/data/board.ts).

import type * as Phaser from 'phaser';
import { ASK_MAX, BOARD_MAX, parseAsk } from '../../../shared/data/board';
import { ITEMS } from '../../../shared/data/items';
import { PAL } from '../../../shared/palette';
import { countOf } from '../../../shared/sim/stats';
import { button, icon, rowBox, ts, Win, type Footer } from '../kit';
import { STYLES } from '../px';
import type { Screen, ScreenCtx } from './types';

const ROW_H = 44;

interface Row { ic: Phaser.GameObjects.Image; name: Phaser.GameObjects.Text; sub: Phaser.GameObjects.Text; btn: ReturnType<typeof button>; rid: number; mine: boolean }

export class BoardScreen implements Screen {
    private win: Win;
    private id: number;
    private g: Phaser.GameObjects.Graphics;
    private foot: Footer;
    private rows: Row[] = [];
    private empty: Phaser.GameObjects.Text;
    private key = '';

    constructor (private ctx: ScreenCtx, arg: unknown) {
        const s = ctx.scene;
        this.id = (arg as { id: number }).id;
        this.win = new Win(s, { size: 'medium', title: 'Request Board', icon: 'board', accent: PAL.gold, onClose: () => ctx.close() });
        const w = this.win, body = w.body;
        this.foot = w.footer({ primary: { label: 'Ask for something…', w: 190, onClick: () => this.ask() }, hint: '' });
        this.g = w.put(s.add.graphics(), 0, 0);
        this.empty = w.text('Nothing is asked for yet. Pin what the farm needs and pay the reward up front: whoever brings it collects the coins.', body.x + 12, body.y + 14, ts('body'), PAL.pebble, { bold: false, wrap: body.w - 24 });
        for (let i = 0; i < BOARD_MAX; i++) {
            const y = body.y + i * (ROW_H + 4);
            const row: Row = {
                ic: w.put(icon(s, 'i_plank', 0, 0, 2), body.x + 26, y + ROW_H / 2),
                name: w.text('', body.x + 54, y + 5, ts('head'), PAL.cream, { font: 'head' }),
                sub: w.text('', body.x + 54, y + 5 + Math.round(ts('head') * 1.25), ts('cap'), PAL.pebble, { bold: false }),
                btn: button(s, 0, 0, 110, 28, 'Fill', () => this.act(row), { style: STYLES.lime, size: 13 }),
                rid: 0, mine: false,
            };
            w.put(row.btn.root, body.x + body.w - 66, y + ROW_H / 2);
            this.rows.push(row);
        }
    }

    private ask () {
        const v = typeof window !== 'undefined' && typeof window.prompt === 'function' ? window.prompt(`What does the farm need? For example "plank 50" (up to ${ASK_MAX}). The reward is paid up front.`, '') : null;
        if (!v) return;
        const a = parseAsk(v);
        if (!a) { this.ctx.toast('The board could not read that: try "plank 50"', undefined, PAL.pebble); return; }
        this.ctx.send({ t: 'board', op: 'post', id: this.id, text: v });
    }

    private act (r: Row) { this.ctx.send({ t: 'board', op: r.mine ? 'cancel' : 'fill', id: this.id, rid: r.rid }); }

    update () {
        const e = this.ctx.farm.ents[this.id];
        if (!e || e.k !== 'bld') { this.ctx.close(); return; }
        const me = this.ctx.me(), list = e.ask ?? [];
        const k = list.map((r) => `${r.rid}:${r.got}`).join(',') + `|${me.id}|${Object.entries(me.inv).join(',')}`;
        if (k === this.key) return;
        this.key = k;
        const body = this.win.body, g = this.g;
        g.clear();
        this.empty.setVisible(!list.length);
        this.rows.forEach((row, i) => {
            const r = list[i], show = !!r;
            row.ic.setVisible(show); row.name.setVisible(show); row.sub.setVisible(show); row.btn.root.setVisible(show);
            if (!r) return;
            const y = body.y + i * (ROW_H + 4), mine = r.by === me.id, have = countOf(me, r.it);
            rowBox(g, body.x, y, body.w, ROW_H, { on: !mine && have > 0, accent: PAL.gold });
            row.rid = r.rid; row.mine = mine;
            row.ic.setTexture(`i_${r.it}`, 0);
            row.name.setText(`${ITEMS[r.it].name}  ${r.got}/${r.n}`);
            row.sub.setText(`${mine ? 'Your request' : `Asked by ${r.who}`}  ·  ${r.ea} coins each`);
            row.btn.setLabel(mine ? 'Take down' : have > 0 ? `Give ${Math.min(have, r.n - r.got)}` : 'Fill');
            row.btn.setStyle(mine ? STYLES.dark : have > 0 ? STYLES.lime : STYLES.dark);
        });
        this.foot.setHint(`${list.length}/${BOARD_MAX} open  ·  you carry ${me.coins} coins`, PAL.pebble);
    }

    destroy () { this.win.destroy(); }
}
