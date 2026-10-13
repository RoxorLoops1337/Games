// The Blueprint Shelf's window: the layouts farmers shared, with Copy (into your own book) and Take down (your own). "Share my
// newest" puts the newest blueprint of your book on the shelf. Rules and checks are in shared/sim/shelf.ts.

import type * as Phaser from 'phaser';
import { totalCost } from '../../../shared/blueprint';
import { PAL } from '../../../shared/palette';
import { SHELF_MAX } from '../../../shared/sim/shelf';
import { button, rowBox, ts, Win, type Footer } from '../kit';
import { STYLES } from '../px';
import type { Screen, ScreenCtx } from './types';

const ROW_H = 44;

interface Row { name: Phaser.GameObjects.Text; sub: Phaser.GameObjects.Text; btn: ReturnType<typeof button>; sid: number; mine: boolean }

export class ShelfScreen implements Screen {
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
        this.win = new Win(s, { size: 'medium', title: 'Blueprint Shelf', icon: 'shelf', accent: PAL.foam, onClose: () => ctx.close() });
        const w = this.win, body = w.body;
        this.foot = w.footer({ primary: { label: 'Share my newest', w: 190, onClick: () => this.share() }, hint: '' });
        this.g = w.put(s.add.graphics(), 0, 0);
        this.empty = w.text('Nothing is shared yet. Copy a stretch of your farm (V, then Copy an area), then share it here for everyone.', body.x + 12, body.y + 14, ts('body'), PAL.pebble, { bold: false, wrap: body.w - 24 });
        for (let i = 0; i < SHELF_MAX; i++) {
            const y = body.y + i * (ROW_H + 3);
            const row: Row = {
                name: w.text('', body.x + 14, y + 5, ts('head'), PAL.cream, { font: 'head' }),
                sub: w.text('', body.x + 14, y + 5 + Math.round(ts('head') * 1.25), ts('cap'), PAL.pebble, { bold: false }),
                btn: button(s, 0, 0, 120, 28, 'Copy', () => this.act(row), { style: STYLES.lime, size: 13 }),
                sid: 0, mine: false,
            };
            w.put(row.btn.root, body.x + body.w - 72, y + ROW_H / 2);
            this.rows.push(row);
        }
    }

    private share () {
        const bp = this.ctx.farm.blueprints[0];
        if (!bp) { this.ctx.toast('Your book is empty: copy an area first (V)', undefined, PAL.pebble); return; }
        this.ctx.send({ t: 'shelf', op: 'publish', id: this.id, name: bp.name, items: bp.items });
    }

    private act (r: Row) {
        const e = this.ctx.farm.ents[this.id];
        if (e?.k !== 'bld') return;
        const entry = e.bps?.find((x) => x.sid === r.sid);
        if (!entry) return;
        if (r.mine) this.ctx.send({ t: 'shelf', op: 'remove', id: this.id, sid: r.sid });
        else this.ctx.farm.adoptBlueprint(entry.name, entry.items);
    }

    update () {
        const e = this.ctx.farm.ents[this.id];
        if (!e || e.k !== 'bld') { this.ctx.close(); return; }
        const me = this.ctx.me(), list = e.bps ?? [];
        const k = list.map((r) => r.sid).join(',') + `|${me.id}|${this.ctx.farm.blueprints[0]?.id ?? ''}`;
        if (k === this.key) return;
        this.key = k;
        const body = this.win.body, g = this.g;
        g.clear();
        this.empty.setVisible(!list.length);
        this.rows.forEach((row, i) => {
            const r = list[i], show = !!r;
            row.name.setVisible(show); row.sub.setVisible(show); row.btn.root.setVisible(show);
            if (!r) return;
            const y = body.y + i * (ROW_H + 3), mine = r.by === me.id;
            rowBox(g, body.x, y, body.w, ROW_H, { on: !mine, accent: PAL.foam });
            row.sid = r.sid; row.mine = mine;
            const cost = Object.entries(totalCost(r.items)).filter(([k2]) => k2 !== 'coin').sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k2, n]) => `${n} ${k2.replace(/_/g, ' ')}`).join(', ');
            row.name.setText(r.name);
            row.sub.setText(`${mine ? 'Shared by you' : `Shared by ${r.who}`}  ·  ${r.items.length} pieces  ·  costs ${cost || 'nothing'}`);
            row.btn.setLabel(mine ? 'Take down' : 'Copy to my book');
            row.btn.setStyle(mine ? STYLES.dark : STYLES.lime);
        });
        const mineBp = this.ctx.farm.blueprints[0];
        this.foot.setHint(mineBp ? `Shares: ${mineBp.name} (${mineBp.items.length} pieces)  ·  ${list.length}/${SHELF_MAX} on the shelf` : `${list.length}/${SHELF_MAX} on the shelf`, PAL.pebble);
    }

    destroy () { this.win.destroy(); }
}
