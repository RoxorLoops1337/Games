// Waystones: pick another stone to step to.

import type * as Phaser from 'phaser';
import { BIOME_DEFS } from '../../../shared/data/biomes';
import { TILE } from '../../../shared/config';
import { PAL } from '../../../shared/palette';
import { button, icon, Pager, rowBox, Section, ts, Win } from '../kit';
import { hex, STYLES } from '../px';
import type { Screen, ScreenCtx } from './types';

const PER = 4;

export class WaystoneScreen implements Screen {
    private win: Win;
    private id: number;
    private g: Phaser.GameObjects.Graphics;
    private page = 0;
    private key = '';
    private rowI: Phaser.GameObjects.Image[] = [];
    private rowT: Phaser.GameObjects.Text[] = [];
    private rowS: Phaser.GameObjects.Text[] = [];
    private rowB: ReturnType<typeof button>[] = [];
    private sec: Section;
    private pager: Pager;
    private ids: number[] = [];
    private rowH: number;

    constructor (private ctx: ScreenCtx, arg: unknown) {
        const s = ctx.scene;
        this.id = (arg as { id: number }).id;
        this.win = new Win(s, { size: 'medium', title: 'Waystone', icon: 'waystone', accent: PAL.foam, sub: 'Step to another waystone you have built. The closest ones come first.', onClose: () => ctx.close() });
        const w = this.win;
        w.footer({ hint: 'Build a second waystone on another island and they link up. Travelling takes you there at once.' });
        const body = w.body;
        this.g = w.put(s.add.graphics(), 0, 0);
        this.sec = w.section(body.x, body.y, body.w, body.h, 'Where to?', { right: '' });
        const si = this.sec.inner;
        this.rowH = Math.floor((si.h - 36) / PER);
        for (let i = 0; i < PER; i++) {
            const y = si.y + i * this.rowH;
            this.rowI.push(w.put(icon(s, 'waystone', 0, 0, 1), si.x + 24, y + this.rowH / 2 - 2));
            this.rowT.push(w.text('', si.x + 52, y + 6, ts('body'), PAL.cream, { font: 'head' }));
            this.rowS.push(w.text('', si.x + 52, y + 6 + Math.round(ts('body') * 1.2) + 2, ts('cap'), PAL.pebble, { bold: false }));
            const b = button(s, 0, 0, 104, 28, 'Travel', () => { const id = this.ids[i]; if (id) { ctx.send({ t: 'travel', to: id }); ctx.close(); } }, { style: STYLES.gold, size: 14 });
            w.put(b.root, si.x + si.w - 60, y + (this.rowH - 4) / 2);
            this.rowB.push(b);
        }
        this.pager = new Pager(w, si.x + si.w / 2, si.y + si.h - 16, (d) => { this.page = Math.max(0, this.page + d); this.key = ''; });
    }

    update () {
        const ways = this.ctx.farm.ways;
        const here = this.ctx.farm.ents[this.id];
        if (!here || here.k !== 'bld') { this.ctx.close(); return; }
        const k = JSON.stringify([ways, this.page]);
        if (k === this.key) return;
        this.key = k;
        const g = this.g, si = this.sec.inner;
        g.clear();
        const hx = (here.tx + 0.5) * TILE, hy = here.ty * TILE;
        const others = ways.list.filter((w) => w.id !== this.id).sort((a, b) => Math.hypot(a.x - hx, a.y - hy) - Math.hypot(b.x - hx, b.y - hy));
        const pages = Math.max(1, Math.ceil(others.length / PER));
        this.page = Math.min(this.page, pages - 1);
        this.ids = [];
        this.sec.setRight(others.length ? `${others.length} other waystone${others.length === 1 ? '' : 's'}` : '');
        for (let i = 0; i < PER; i++) {
            const w = others[this.page * PER + i];
            const y = si.y + i * this.rowH;
            if (!w) { this.rowI[i].setVisible(false); this.rowT[i].setText(''); this.rowS[i].setText(''); this.rowB[i].root.setVisible(false); continue; }
            this.ids.push(w.id);
            rowBox(g, si.x, y, si.w, this.rowH - 4);
            const plot = this.ctx.farm.world.plots[w.plot];
            const biome = plot ? BIOME_DEFS[plot.biome].name : 'Unknown';
            const dist = Math.round(Math.hypot(w.x - hx, w.y - hy) / TILE);
            this.rowI[i].setVisible(true).setTexture('waystone', 0);
            this.win.at(this.rowI[i], si.x + 24, y + (this.rowH - 4) / 2);
            this.rowT[i].setText(`${biome} waystone`).setColor(hex(plot ? BIOME_DEFS[plot.biome].color : PAL.cream));
            this.rowS[i].setText(`${dist} tiles away${w.by ? ` · built by ${w.by}` : ''}`);
            this.rowB[i].root.setVisible(true);
        }
        if (!others.length) {
            this.rowT[0].setText('No other waystones yet').setColor(hex(PAL.pebble));
            this.rowS[0].setText('Build a second one somewhere else and they will link up.');
        }
        this.pager.set(this.page, pages);
    }

    destroy () { this.win.destroy(); }
}
