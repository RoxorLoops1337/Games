// The worker strip along the bottom of a machine or workshop window: who works here, how they are getting on, and (at a
// workshop) the order they are working through.

import { critTex } from '../art/storybook-critters';
import type * as Phaser from 'phaser';
import { BUILDINGS } from '../../shared/data/buildings';
import { ELEMENT_COLOR, spOf, STATUS_INFO, type Pet } from '../../shared/data/creatures';
import { ITEMS } from '../../shared/data/items';
import { RECIPES } from '../../shared/data/recipes';
import { PAL } from '../../shared/palette';
import { stationOk } from '../../shared/sim/jobs';
import { petsOf } from '../../shared/sim/petlib';
import { hasUnlock } from '../../shared/sim/stats';
import type { BuildE, PlayerS } from '../../shared/sim/types';
import { statusOf } from './crew';
import { isTouchUi } from '../input/layout';
import { button, icon, ts, Win } from './kit';
import { hex, inset, STYLES } from './px';
import type { ScreenCtx } from './screens/types';
import { fitScale } from './screens/creatures';

const QTY = [1, 5, 10, 25];
/** The height of the strip (a little taller on a phone, where the words are bigger). */
export const stripH = () => (isTouchUi() ? 46 : 40);

/** Could this farmer ever put a creature to work here: they have one, or the Taming skill that leads to one. Before that the strip only puzzles. */
export const canStaff = (me: PlayerS) => petsOf(me).length > 0 || hasUnlock(me, 'taming');

interface WorkerStripOpts {
    ctx: ScreenCtx;
    win: Win;
    x: number; y: number; w: number;
    bld: () => BuildE | null;
    /** Where to come back to after choosing a creature. */
    back: () => { name: string; arg?: unknown };
    /** At a workshop: the recipe that is selected right now, if any. */
    recipe?: () => string | null;
}

export class WorkerStrip {
    private g: Phaser.GameObjects.Graphics;
    private face: Phaser.GameObjects.Image;
    private nameT: Phaser.GameObjects.Text;
    private statT: Phaser.GameObjects.Text;
    private orderT: Phaser.GameObjects.Text;
    private noneT: Phaser.GameObjects.Text;
    private assign: ReturnType<typeof button>;
    private change: ReturnType<typeof button>;
    private home: ReturnType<typeof button>;
    private qtyBtn: ReturnType<typeof button>;
    private makeBtn: ReturnType<typeof button>;
    private stop: ReturnType<typeof button>;
    private key = '';
    private qty = 1;
    private shown = true;
    private all: { setVisible (v: boolean): unknown }[] = [];

    constructor (private o: WorkerStripOpts) {
        const { ctx, win: w, x, y, w: W } = o, s = ctx.scene;
        const cy = y + stripH() / 2;
        this.g = s.add.graphics();
        w.put(this.g, 0, 0);
        this.face = w.put(icon(s, 'px', 0, 0, 2), x + 36, cy + 5).setVisible(false);
        this.nameT = w.text('', x + 62, y + 4, ts('body'), PAL.cream, { font: 'head' });
        this.statT = w.text('', x + 62, y + 4 + Math.round(ts('body') * 1.2) + 1, ts('cap'), PAL.pebble, { bold: false });
        this.orderT = w.text('', x + 250, cy, ts('cap'), PAL.cream, { origin: [0, 0.5], bold: false, wrap: Math.max(120, W - 640) });
        this.noneT = w.text('Nobody works here.', x + 12, cy, ts('body'), PAL.pebble, { origin: [0, 0.5], bold: false });
        this.assign = button(s, 0, 0, 210, 28, 'Put a creature to work', () => this.pick(), { style: STYLES.lime, size: 13 });
        w.put(this.assign.root, x + W - 110, cy);
        this.home = button(s, 0, 0, 92, 28, 'Send home', () => { const p = this.keeper(); if (p) ctx.send({ t: 'pet', op: 'unassign', pet: p.id }); }, { style: STYLES.gold, size: 12 });
        w.put(this.home.root, x + W - 50, cy);
        this.change = button(s, 0, 0, 76, 28, 'Change', () => this.pick(), { style: STYLES.dark, size: 12 });
        w.put(this.change.root, x + W - 142, cy);
        this.stop = button(s, 0, 0, 30, 28, '✕', () => { const p = this.keeper(); if (p) ctx.send({ t: 'pet', op: 'order', pet: p.id, rcp: '', n: 0 }); }, { style: STYLES.berry, size: 12, ink: false });
        w.put(this.stop.root, x + W - 196, cy);
        this.makeBtn = button(s, 0, 0, 150, 28, 'Order', () => this.order(), { style: STYLES.gold, size: 12 });
        w.put(this.makeBtn.root, x + W - 288, cy);
        this.qtyBtn = button(s, 0, 0, 44, 28, '×1', () => { this.qty = QTY[(QTY.indexOf(this.qty) + 1) % QTY.length]; this.key = ''; }, { style: STYLES.dark, size: 12 });
        w.put(this.qtyBtn.root, x + W - 364, cy);
        for (const b of [this.qtyBtn, this.makeBtn, this.stop]) b.root.setVisible(false);
        this.all = [this.g, this.face, this.nameT, this.statT, this.orderT, this.noneT, this.assign.root, this.change.root, this.home.root, this.qtyBtn.root, this.makeBtn.root, this.stop.root];
    }

    private hide () {
        if (!this.shown) return;
        this.shown = false;
        this.g.clear();
        for (const o of this.all) o.setVisible(false);
    }

    private keeper (): Pet | undefined {
        const b = this.o.bld();
        return b ? petsOf(this.o.ctx.me()).find((p) => p.post?.k === 'stn' && p.post.id === b.id) : undefined;
    }

    private pick () {
        const b = this.o.bld();
        if (b) this.o.ctx.open('crewpick', { bld: b.id, back: this.o.back() });
    }

    private order () {
        const p = this.keeper(), rid = this.o.recipe?.();
        if (!p || !rid) return;
        this.o.ctx.send({ t: 'pet', op: 'order', pet: p.id, rcp: rid, n: this.qty });
    }

    update () {
        const b = this.o.bld(), me = this.o.ctx.me();
        if (!b || !canStaff(me)) { this.hide(); return; }
        if (!this.shown) { this.shown = true; this.key = ''; }
        const k = this.keeper(), rid = this.o.recipe?.() ?? null;
        const has = petsOf(me).some((p) => stationOk(p, b.kind));
        const key = JSON.stringify([k && [k.id, k.name, k.ps, k.post, k.lv, k.pn], rid, this.qty, has, me.skills]);
        if (key === this.key) return;
        this.key = key;
        const { x, y, w } = this.o, g = this.g, orders = !!this.o.recipe;
        g.clear();
        inset(g, x, y, w, stripH(), PAL.night, k ? PAL.lime : PAL.slate);
        this.face.setVisible(!!k); this.nameT.setVisible(!!k); this.statT.setVisible(!!k);
        this.noneT.setVisible(!k);
        this.assign.root.setVisible(!k); this.change.root.setVisible(!!k); this.home.root.setVisible(!!k);
        this.assign.setEnabled(has);
        this.assign.setLabel(has ? 'Put a creature to work' : 'No creature can run it');
        this.noneT.setText(has ? 'Nobody works here.' : `None of your creatures can run a ${BUILDINGS[b.kind].name}.`);
        if (k) {
            const st = STATUS_INFO[statusOf(k)];
            this.face.setTexture(critTex(this.o.ctx.scene, k.sp), 0).setScale(fitScale(this.o.ctx.scene, critTex(this.o.ctx.scene, k.sp), 28, 2));
            this.o.win.at(this.face, x + 36, y + stripH() / 2 + 5);
            this.nameT.setText(`${k.name}  Lv ${k.lv}`).setColor(hex(ELEMENT_COLOR[spOf(k.sp).element]));
            this.statT.setText(st.text).setColor(hex(st.color));
        }
        const ord = k?.post?.k === 'stn' ? k.post.ord : undefined;
        this.orderT.setVisible(orders && !!k);
        if (orders && k) {
            const r = ord ? RECIPES[ord.r] : null;
            this.orderT.setText(r ? `Making ${ITEMS[r.out].name}: ${ord!.n} to go` : 'No order yet: pick a recipe above and press Order.');
            const sel = rid ? RECIPES[rid] : null;
            const can = !!sel && hasUnlock(me, sel.req) && sel.in.coin === undefined;
            this.qtyBtn.setLabel(`×${this.qty}`);
            this.makeBtn.setLabel(sel ? `Order ${ITEMS[sel.out].name}` : 'Order');
            this.makeBtn.setEnabled(can);
            this.qtyBtn.root.setVisible(true); this.makeBtn.root.setVisible(true);
            this.stop.root.setVisible(!!ord);
        } else for (const bt of [this.qtyBtn, this.makeBtn, this.stop]) bt.root.setVisible(false);
    }
}
