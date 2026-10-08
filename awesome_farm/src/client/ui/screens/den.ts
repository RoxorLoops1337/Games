// A Creature Den: who lives and works here, who could, and the goods they have brought in.

import { critTex } from '../../art/storybook-critters';
import type * as Phaser from 'phaser';
import { BUILDINGS } from '../../../shared/data/buildings';
import { ELEMENT_COLOR, Pet, spOf, WORK_INFO, WORK_KINDS, WorkKind, workCycle } from '../../../shared/data/creatures';
import { ITEM_ORDER, ItemId, iconOf, ITEMS } from '../../../shared/data/items';
import { PAL } from '../../../shared/palette';
import { petsOf, workSlots } from '../../../shared/sim/creatures';
import { derived } from '../../../shared/sim/stats';
import type { BuildE, CritE } from '../../../shared/sim/types';
import { GridItem, ItemGrid } from '../grid';
import { button, Footer, GAP, icon, onTap, rowBox, Section, tipOn, ts, Win } from '../kit';
import { hex, rect, STYLES } from '../px';
import { itemTip } from '../tips';
import { fitScale } from './creatures';
import type { Screen, ScreenCtx } from './types';

const SLOTS = 3, CELL = 54, COLS = 7, PROWS = 3;

export class DenScreen implements Screen {
    private win: Win;
    private id: number;
    private g: Phaser.GameObjects.Graphics;
    private key = '';
    private faces: Phaser.GameObjects.Image[] = [];
    private names: Phaser.GameObjects.Text[] = [];
    private subs: Phaser.GameObjects.Text[] = [];
    private doing: Phaser.GameObjects.Text[] = [];
    private unBtns: ReturnType<typeof button>[] = [];
    private pool: { img: Phaser.GameObjects.Image; lv: Phaser.GameObjects.Text }[] = [];
    private goods: ItemGrid;
    private living: Section;
    private pets: Section;
    private goodsSec: Section;
    private foot: Footer;
    private empty: Phaser.GameObjects.Text;
    private idle: Pet[] = [];
    private cardH: number;

    constructor (private ctx: ScreenCtx, arg: unknown) {
        const s = ctx.scene;
        this.id = (arg as { id: number }).id;
        this.win = new Win(s, { size: 'large', title: 'Creature Den', icon: 'den', accent: PAL.pumpkin, sub: 'Creatures that live here work on their own: they tend everything within 7 tiles of the den. What they gather goes into the nearest chest, or here.', onClose: () => ctx.close() });
        const w = this.win;
        this.foot = w.footer({ primary: { label: 'Take all goods', onClick: () => this.takeAll() }, hint: 'Click a creature on the right to move it in. Send it home to give the room to another.' });
        const body = w.body, lw = 440;
        this.g = w.put(s.add.graphics(), 0, 0);
        // ── who lives here ──
        this.living = w.section(body.x, body.y, lw, body.h, 'Living here', { right: '' });
        const li = this.living.inner;
        this.cardH = Math.floor((li.h + 4) / SLOTS) - 4;
        for (let i = 0; i < SLOTS; i++) {
            const y = li.y + i * (this.cardH + 4);
            this.faces.push(w.put(icon(s, 'px', 0, 0, 3), li.x + 44, y + this.cardH / 2));
            this.names.push(w.text('', li.x + 94, y + 10, ts('head'), PAL.cream, { font: 'head' }));
            this.subs.push(w.text('', li.x + 94, y + 10 + Math.round(ts('head') * 1.2) + 4, ts('cap'), PAL.pebble, { bold: false, wrap: li.w - 104 }));
            this.doing.push(w.text('', li.x + 94, y + this.cardH - Math.round(ts('cap') * 1.2) - 12, ts('cap'), PAL.lime, { bold: false }));
            const b = button(s, 0, 0, 96, 28, 'Send home', () => { const p = this.worker(i); if (p) ctx.send({ t: 'pet', op: 'unassign', pet: p.id }); }, { style: STYLES.gold, size: 13 });
            w.put(b.root, li.x + li.w - 56, y + this.cardH - 26);
            this.unBtns.push(b);
        }
        // ── who could move in ──
        const rx = body.x + lw + GAP, rw = body.w - lw - GAP;
        const petsH = 33 + PROWS * (CELL + 4) + 14;
        this.pets = w.section(rx, body.y, rw, petsH, 'Your creatures', { right: '' });
        const pi = this.pets.inner;
        for (let i = 0; i < COLS * PROWS; i++) {
            const x = pi.x + (i % COLS) * (CELL + 4), y = pi.y + Math.floor(i / COLS) * (CELL + 4);
            const img = w.put(icon(s, 'px', 0, 0, 2), x + CELL / 2, y + CELL / 2 - 3).setVisible(false);
            const lv = w.text('', x + CELL - 4, y + CELL - 3, ts('cap'), PAL.cream, { origin: [1, 1], stroke: 3, dark: true });
            this.pool.push({ img, lv });
            const z = s.add.zone(0, 0, CELL, CELL).setOrigin(0).setInteractive({ useHandCursor: true });
            w.put(z, x, y);
            onTap(z, () => { const p = this.idle[i]; if (p) ctx.send({ t: 'pet', op: 'assign', pet: p.id, den: this.id }); });
            tipOn(z, () => {
                const p = this.idle[i];
                if (!p) return null;
                const sp = spOf(p.sp), ow = derived(ctx.me()).mods.work ?? 0;
                const best = (Object.entries(sp.work) as [WorkKind, number][]).sort((a, b) => b[1] - a[1]);
                return { title: p.name, color: ELEMENT_COLOR[sp.element], sub: `${sp.name} · Lv ${p.lv}`, lines: best.map(([k, a]) => ({ t: `${WORK_INFO[k].name} ${'●'.repeat(a)}  ${Math.round(k === 'guard' ? workCycle(p, k, ow) / 4 : workCycle(p, k, ow))}s`, c: WORK_INFO[k].color })), foot: 'Click to move in' };
            });
        }
        this.empty = w.text('You have no creatures to spare. Throw a Taming Pod (T) at a wild one to make a friend.', pi.x + pi.w / 2, pi.y + pi.h / 2, ts('body'), PAL.pebble, { origin: [0.5, 0.5], align: 'center', bold: false, wrap: pi.w - 40 });
        // ── what they brought in ──
        const gy = body.y + petsH + GAP;
        this.goodsSec = w.section(rx, gy, rw, body.y + body.h - gy, 'Goods collected', { right: '' });
        const gi = this.goodsSec.inner, gf = ItemGrid.fit(gi.w, gi.h, 48, 4);
        this.goods = new ItemGrid(w, gi.x, gi.y, gf.cols, gf.rows, 48, 4, 'Nothing yet. Give them some work!');
    }

    private den (): BuildE | null {
        const e = this.ctx.farm.ents[this.id];
        return e && e.k === 'bld' ? e : null;
    }

    private worker (i: number): Pet | undefined {
        return petsOf(this.ctx.me()).filter((p) => p.den === this.id)[i];
    }

    private takeAll () {
        const d = this.den();
        if (!d?.inv) return;
        for (const [item, n] of Object.entries(d.inv) as [ItemId, number][]) if (n > 0) this.ctx.send({ t: 'xfer', id: this.id, item, n, dir: 'take', part: 'inv' });
    }

    wheel (dy: number, x: number, y: number) { if (this.goods.contains(x, y)) this.goods.scroll(dy); }

    update () {
        const d = this.den();
        if (!d) { this.ctx.close(); return; }
        const me = this.ctx.me();
        const ents = Object.values(this.ctx.farm.ents).filter((e): e is CritE => e.k === 'crit' && e.den === this.id);
        const k = JSON.stringify([petsOf(me), d.inv, ents.map((e) => [e.pid, e.wk, e.st]), me.skills]);
        if (k === this.key) return;
        this.key = k;
        const g = this.g, li = this.living.inner, pi = this.pets.inner;
        g.clear();
        const mine = petsOf(me).filter((p) => p.den === this.id);
        const everyone = this.everyoneHere();
        this.living.setRight(`${everyone} / ${BUILDINGS.den.pets ?? 3} homes  ·  you can have ${workSlots(me)} working`);
        const ow = derived(me).mods.work ?? 0;
        for (let i = 0; i < SLOTS; i++) {
            const y = li.y + i * (this.cardH + 4);
            const p = mine[i];
            rowBox(g, li.x, y, li.w, this.cardH, { off: !p });
            rowBox(g, li.x + 8, y + 8, 72, this.cardH - 16, { off: true });
            if (p) {
                const sp = spOf(p.sp);
                this.faces[i].setVisible(true).setTexture(critTex(this.ctx.scene, p.sp), 0).setScale(fitScale(this.ctx.scene, critTex(this.ctx.scene, p.sp), 56, 3));
                this.win.at(this.faces[i], li.x + 44, y + this.cardH / 2);
                this.names[i].setText(`${p.name}   Lv ${p.lv}`).setColor(hex(ELEMENT_COLOR[sp.element]));
                const best = (Object.entries(sp.work) as [WorkKind, number][]).sort((a, b) => b[1] - a[1]);
                this.subs[i].setText(best.map(([kind, apt]) => `${WORK_INFO[kind].name} ${'●'.repeat(apt)}`).join('   '));
                const ent = ents.find((e) => e.pid === p.id);
                const cyc = best.length ? workCycle(p, best[0][0], ow) : Infinity;
                this.doing[i].setText(ent?.st === 3 && ent.wk ? `Busy: ${WORK_INFO[ent.wk].name}` : `Next job in ~${Math.round(best[0][0] === 'guard' ? cyc / 4 : cyc)}s`).setColor(hex(ent?.st === 3 ? PAL.gold : PAL.lime));
                this.unBtns[i].root.setVisible(true);
                const kinds = new Set(Object.keys(sp.work) as WorkKind[]);
                WORK_KINDS.forEach((kind, n) => rect(g, li.x + 94 + n * 22, y + this.cardH - 12, 18, 4, kinds.has(kind) ? WORK_INFO[kind].color : PAL.slate, kinds.has(kind) ? 1 : 0.4));
            } else {
                this.faces[i].setVisible(false);
                this.names[i].setText('Empty room').setColor(hex(PAL.pebble));
                this.subs[i].setText('Pick a creature on the right to move in.');
                this.doing[i].setText('');
                this.unBtns[i].root.setVisible(false);
            }
        }
        // creatures you could move in
        this.idle = petsOf(me).filter((p) => !p.den && me.comp !== p.id);
        this.pets.setRight(this.idle.length > this.pool.length ? `${this.idle.length} free (the first ${this.pool.length} shown)` : `${this.idle.length} free`);
        this.empty.setVisible(this.idle.length === 0);
        this.pool.forEach((c, i) => {
            const x = pi.x + (i % COLS) * (CELL + 4), y = pi.y + Math.floor(i / COLS) * (CELL + 4);
            const p = this.idle[i];
            if (this.idle.length) rowBox(g, x, y, CELL, CELL, { off: !p });
            if (p) {
                const sp = spOf(p.sp);
                c.img.setVisible(true).setTexture(critTex(this.ctx.scene, p.sp), 0).setScale(fitScale(this.ctx.scene, critTex(this.ctx.scene, p.sp), 40, 3));
                rect(g, x + 3, y + CELL - 6, CELL - 6, 3, ELEMENT_COLOR[sp.element]);
                c.lv.setText(`${p.lv}`);
            } else { c.img.setVisible(false); c.lv.setText(''); }
        });
        // goods
        const inv = (Object.entries(d.inv ?? {}) as [ItemId, number][]).filter(([, n]) => n > 0).sort((a, b) => ITEM_ORDER.indexOf(a[0]) - ITEM_ORDER.indexOf(b[0]));
        this.foot.primary!.setEnabled(inv.length > 0);
        this.goodsSec.setRight(inv.length ? `${inv.length} kind${inv.length === 1 ? '' : 's'}` : '');
        this.goods.setItems(inv.map(([id, n]): GridItem => ({
            data: { icon: iconOf(id), count: n, rarity: ITEMS[id].rarity },
            tip: () => itemTip(id, { count: n, foot: 'Click: take all' }),
            click: () => this.ctx.send({ t: 'xfer', id: this.id, item: id, n, dir: 'take', part: 'inv' }),
        })));
    }

    private everyoneHere () {
        let n = 0;
        for (const e of Object.values(this.ctx.farm.ents)) if (e.k === 'crit' && e.den === this.id) n++;
        return n;
    }

    destroy () { this.win.destroy(); }
}
