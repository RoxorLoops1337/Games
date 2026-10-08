// Your blueprint book: copy a stretch of the farm, keep it, paste it anywhere. Beside it, "Starter
// layouts": ready-made production lines (see ui/screens/starters.ts).

import type * as Phaser from 'phaser';
import { extent, totalCost } from '../../../shared/blueprint';
import { BUILDINGS } from '../../../shared/data/buildings';
import { iconOf, ItemId } from '../../../shared/data/items';
import { PAL } from '../../../shared/palette';
import { scaledCost } from '../../../shared/sim/stats';
import { MAX_SAVED } from '../../world/blueprints';
import { button, deviceText, Footer, icon, Pager, rowBox, Section, TabBar, ts, Win } from '../kit';
import { hex, STYLES } from '../px';
import { StarterPanel } from './starters';
import type { Screen, ScreenCtx } from './types';

const PER = 5, ROW_H = 46;
type Tab = 'starter' | 'book';
let lastTab: Tab | null = null;

export class BlueprintScreen implements Screen {
    private win: Win;
    private g: Phaser.GameObjects.Graphics;
    private key = '';
    private nameT: Phaser.GameObjects.Text[] = [];
    private subT: Phaser.GameObjects.Text[] = [];
    private costI: Phaser.GameObjects.Image[][] = [];
    private costT: Phaser.GameObjects.Text[][] = [];
    private place: ReturnType<typeof button>[] = [];
    private del: ReturnType<typeof button>[] = [];
    private pager: Pager;
    private emptyT: Phaser.GameObjects.Text;
    private page = 0;
    private ids: string[] = [];
    private foot: Footer;
    private bookSec: Section;
    private layerS: Phaser.GameObjects.Graphics;
    private layerB: Phaser.GameObjects.Graphics;
    /** Everything that belongs to the book tab, so the other tab can hide it. */
    private bookObjs: { setVisible (v: boolean): unknown }[] = [];
    private tabs: TabBar;
    private starters: StarterPanel;
    private tab: Tab;
    private topY: number;
    private capH: number;

    constructor (private ctx: ScreenCtx) {
        const s = ctx.scene;
        this.win = new Win(s, { size: 'large', title: 'Blueprints', icon: 'k_gear', accent: PAL.foam, onClose: () => ctx.close() });
        const w = this.win;
        this.foot = w.footer({ primary: { label: 'Place it', w: 170, onClick: () => this.primary() }, hint: '' });
        const body = w.body, cy = w.top + w.toolH / 2;
        this.tabs = new TabBar(w, body.x, cy, [{ id: 'starter', label: 'Starter layouts' }, { id: 'book', label: 'My blueprints' }], 'starter', (id) => this.show(id as Tab), { minW: 150 });
        w.text(deviceText('Copy a stretch of your farm, belts and machines with their settings, and paste it anywhere as often as you like.', 'Copy a stretch of your farm, belts and machines with their settings, and paste it anywhere.'), body.x + body.w, cy, ts('cap'), PAL.pebble, { origin: [1, 0.5], bold: false, align: 'right', wrap: body.w - 400 });
        const area = w.under;
        this.layerS = w.put(s.add.graphics(), 0, 0);
        this.layerB = w.put(s.add.graphics(), 0, 0);
        this.g = w.put(s.add.graphics(), 0, 0);
        this.bookObjs.push(this.g);
        // ── the book ──
        this.bookSec = w.section(area.x, area.y, area.w, area.h, 'My blueprints', { right: '', layer: this.layerB });
        this.bookObjs.push(this.bookSec.head!, this.bookSec.right!);
        const bi = this.bookSec.inner;
        this.capH = Math.round(ts('cap') * 1.2) + 4;
        this.topY = bi.y + this.capH + 8;
        const note = w.text(`${MAX_SAVED} fit in the book. ` + deviceText('In the world: drag a box around some buildings, then click to paste. R turns it.', 'In the world: drag a box around some buildings, then tap to paste. TURN turns it.'), bi.x, bi.y, ts('cap'), PAL.pebble, { bold: false, wrap: bi.w });
        this.bookObjs.push(note);
        for (let i = 0; i < PER; i++) {
            const y = this.topY + i * ROW_H;
            this.nameT.push(w.text('', bi.x + 12, y + 5, ts('body'), PAL.cream, { font: 'head' }));
            this.subT.push(w.text('', bi.x + 12, y + 5 + Math.round(ts('body') * 1.2) + 1, ts('cap'), PAL.pebble, { bold: false }));
            const imgs: Phaser.GameObjects.Image[] = [], txts: Phaser.GameObjects.Text[] = [];
            for (let k = 0; k < 4; k++) {
                imgs.push(w.put(icon(s, 'i_wood', 0, 0, 1), bi.x + 400 + k * 76, y + ROW_H / 2 - 2).setVisible(false));
                txts.push(w.text('', bi.x + 412 + k * 76, y + ROW_H / 2 - 2, ts('body'), PAL.cream, { origin: [0, 0.5] }));
            }
            this.costI.push(imgs); this.costT.push(txts);
            const p = button(s, 0, 0, 100, 28, 'Place', () => this.use(i), { style: STYLES.lime, size: 14 });
            w.put(p.root, bi.x + bi.w - 112, y + (ROW_H - 4) / 2);
            const d = button(s, 0, 0, 56, 28, '✕', () => this.remove(i), { style: STYLES.berry, size: 14 });
            w.put(d.root, bi.x + bi.w - 34, y + (ROW_H - 4) / 2);
            this.place.push(p); this.del.push(d);
            this.bookObjs.push(this.nameT[i], this.subT[i], ...imgs, ...txts);
        }
        this.emptyT = w.text('Your book is empty.\n\nPress "Copy an area", then drag a box around some buildings.\nOr use Starter layouts for ready-made ones.', bi.x + bi.w / 2, bi.y + bi.h / 2, ts('body'), PAL.pebble, { origin: [0.5, 0.5], bold: false, align: 'center', wrap: bi.w - 80 });
        this.bookObjs.push(this.emptyT);
        this.pager = new Pager(w, bi.x + bi.w / 2, bi.y + bi.h - 14, (d) => { this.page = Math.max(0, this.page + d); this.key = ''; });
        this.starters = new StarterPanel(ctx, w, area, this.layerS, this.foot);
        this.tab = lastTab ?? (ctx.farm.blueprints.length ? 'book' : 'starter');
        this.show(this.tab);
    }

    private primary () {
        if (this.tab === 'starter') this.starters.use();
        else { this.ctx.close(); this.ctx.farm.bp.startSelect(); }
    }

    private show (t: Tab) {
        this.tab = lastTab = t;
        const book = t === 'book';
        this.layerB.setVisible(book); this.layerS.setVisible(!book);
        for (const o of this.bookObjs) o.setVisible(book);
        for (const b of [...this.place, ...this.del]) { b.root.setVisible(book); if (b.zone.input) b.zone.input.enabled = book; }
        this.starters.setVisible(!book);
        this.tabs.set(t);
        if (book) {
            this.foot.primary!.setLabel('Copy an area');
            this.foot.primary!.setEnabled(true);
            this.foot.setHint(deviceText('Copy an area, drag a box around what you want to keep, and it goes in the book.', 'Copy an area, drag a box around what you want to keep, and it goes in the book.'));
        }
        this.key = '';
    }

    private use (i: number) {
        const id = this.ids[i];
        const bp = this.ctx.farm.blueprints.find((b) => b.id === id);
        if (!bp) return;
        this.ctx.close();
        this.ctx.farm.bp.startPaste(bp);
    }

    private remove (i: number) {
        const id = this.ids[i];
        if (id) { this.ctx.farm.deleteBlueprint(id); this.key = ''; }
    }

    update () {
        if (this.tab === 'starter') { this.starters.update(); return; }
        const list = this.ctx.farm.blueprints;
        const me = this.ctx.me();
        const k = JSON.stringify([list.map((b) => b.id), this.page, me.inv, this.tab]);
        if (k === this.key) return;
        this.key = k;
        const g = this.g, bi = this.bookSec.inner;
        g.clear();
        const pages = Math.max(1, Math.ceil(list.length / PER));
        this.page = Math.min(this.page, pages - 1);
        this.ids = [];
        this.emptyT.setVisible(!list.length);
        this.bookSec.setRight(`${list.length} of ${MAX_SAVED} saved`);
        for (let i = 0; i < PER; i++) {
            const bp = list[this.page * PER + i];
            const y = this.topY + i * ROW_H;
            const show = !!bp;
            this.nameT[i].setText(bp?.name ?? ''); this.subT[i].setText('');
            this.place[i].root.setVisible(show); this.del[i].root.setVisible(show);
            if (this.place[i].zone.input) this.place[i].zone.input!.enabled = show;
            if (this.del[i].zone.input) this.del[i].zone.input!.enabled = show;
            this.costI[i].forEach((im) => im.setVisible(false)); this.costT[i].forEach((t) => t.setText(''));
            if (!bp) continue;
            this.ids.push(bp.id);
            rowBox(g, bi.x, y, bi.w, ROW_H - 4);
            const box = extent(bp.items);
            const kinds = new Map<string, number>();
            for (const it of bp.items) kinds.set(it.kind, (kinds.get(it.kind) ?? 0) + 1);
            const top = [...kinds.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([kind, n]) => `${n} ${BUILDINGS[kind as keyof typeof BUILDINGS].name}`).join(', ');
            this.subT[i].setText(`${bp.items.length} pieces · ${box.w}×${box.h} tiles · ${top}`);
            // the biggest costs, red when you are short
            const cost = Object.entries(scaledCost(me, totalCost(bp.items))) as [ItemId, number][];
            cost.sort((a, b) => b[1] - a[1]).slice(0, 4).forEach(([res, n], c) => {
                const have = (res as string) === 'coin' ? me.coins : (me.inv[res] ?? 0);
                this.costI[i][c].setVisible(true).setTexture(iconOf(res), 0);
                this.win.at(this.costI[i][c], bi.x + 400 + c * 76, y + ROW_H / 2 - 2);
                this.costT[i][c].setText(`${n}`).setColor(hex(have >= n ? PAL.cream : PAL.berry));
                this.win.at(this.costT[i][c], bi.x + 412 + c * 76, y + ROW_H / 2 - 2 - this.costT[i][c].height / 2);
            });
        }
        this.pager.set(this.page, pages);
    }

    destroy () { this.win.destroy(); }
}
