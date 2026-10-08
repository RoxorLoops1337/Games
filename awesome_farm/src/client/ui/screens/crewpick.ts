// Who should work here? Pick one of your creatures for a machine or a workshop.

import { critTex } from '../../art/storybook-critters';
import type * as Phaser from 'phaser';
import { BUILDINGS } from '../../../shared/data/buildings';
import { ELEMENT_COLOR, spOf, STATUS_INFO, WORK_INFO, type Pet } from '../../../shared/data/creatures';
import { PAL } from '../../../shared/palette';
import { stationOk } from '../../../shared/sim/jobs';
import { petsOf } from '../../../shared/sim/petlib';
import type { BuildE } from '../../../shared/sim/types';
import { aptOf, crewTip, pips, statusOf, stationTip } from '../crew';
import { Footer, GAP, icon, onTap, rowBox, Section, showBtn, tipOn, ts, Win } from '../kit';
import { hex, inset, rect } from '../px';
import { fitScale } from './creatures';
import type { Screen, ScreenCtx } from './types';

const COLS = 6, CELL = 58, GAPC = 4;

interface Arg { bld: number; back?: { name: string; arg?: unknown } }

export class CrewPickScreen implements Screen {
    private win: Win;
    private id: number;
    private back?: Arg['back'];
    private g: Phaser.GameObjects.Graphics;
    private key = '';
    private cells: { img: Phaser.GameObjects.Image; lv: Phaser.GameObjects.Text }[] = [];
    private order: Pet[] = [];
    private icon: Phaser.GameObjects.Image;
    private needT: Phaser.GameObjects.Text;
    private keeperT: Phaser.GameObjects.Text;
    private infoT: Phaser.GameObjects.Text;
    private foot: Footer;
    private list: Section;
    private det: Section;
    private rows: number;

    constructor (private ctx: ScreenCtx, arg: unknown) {
        const s = ctx.scene;
        const a = arg as Arg;
        this.id = a.bld;
        this.back = a.back;
        const b = this.ent();
        const def = b ? BUILDINGS[b.kind] : BUILDINGS.furnace;
        this.win = new Win(s, { size: 'large', title: 'Who should work here?', icon: def.tex, accent: PAL.lime, onClose: () => ctx.close() });
        const w = this.win;
        this.foot = w.footer({
            primary: { label: 'Done', w: 130, onClick: () => this.done() },
            extras: [{ label: 'Send it home', w: 150, onClick: () => { const p = this.keeper(); if (p) ctx.send({ t: 'pet', op: 'unassign', pet: p.id }); } }],
            hint: 'Click a creature to put it to work here. The dots show how good it is at this job.',
        });
        const body = w.body, lw = 440;
        this.g = w.put(s.add.graphics(), 0, 0);
        this.list = w.section(body.x, body.y, lw, body.h, 'Your creatures', { right: '' });
        const li = this.list.inner;
        this.rows = Math.max(1, Math.floor((li.h + GAPC) / (CELL + GAPC)));
        for (let i = 0; i < COLS * this.rows; i++) {
            const x = li.x + (i % COLS) * (CELL + GAPC), y = li.y + Math.floor(i / COLS) * (CELL + GAPC);
            const img = w.put(icon(s, 'px', 0, 0, 2), x + CELL / 2, y + CELL / 2 - 4).setVisible(false);
            const lv = w.text('', x + CELL - 5, y + CELL - 4, ts('cap'), PAL.cream, { origin: [1, 1], stroke: 3, dark: true });
            this.cells.push({ img, lv });
            const z = s.add.zone(0, 0, CELL, CELL).setOrigin(0).setInteractive({ useHandCursor: true });
            w.put(z, x, y);
            onTap(z, () => this.pick(i));
            tipOn(z, () => {
                const p = this.order[i], e = this.ent();
                if (!p || !e) return null;
                const ok = stationOk(p, e.kind);
                const base = crewTip(ctx.me(), p, def.work, ok ? 'Click to put it to work here' : `${p.name} cannot run this`);
                return ok ? { ...base, lines: [...(base.lines ?? []), ...(stationTip(ctx.me(), p, e.kind).lines ?? []).slice(1)] } : base;
            });
        }
        this.det = w.section(body.x + lw + GAP, body.y, body.w - lw - GAP, body.h, def.name, { right: '' });
        const di = this.det.inner;
        inset(w.g, di.x, di.y, 64, 64, PAL.deepSea, PAL.slate);
        this.icon = w.put(icon(s, def.tex, 0, 0, 3), di.x + 32, di.y + 32);
        this.needT = w.text('', di.x + 76, di.y + 4, ts('body'), PAL.pebble, { font: 'head', wrap: di.w - 80 });
        this.keeperT = w.text('', di.x, di.y + 84, ts('body'), PAL.cream, { bold: false, wrap: di.w });
        this.infoT = w.text('', di.x, di.y + 150, ts('body'), PAL.pebble, { bold: false, wrap: di.w });
    }

    private ent (): BuildE | null { const e = this.ctx.farm.ents[this.id]; return e && e.k === 'bld' ? e : null; }
    private keeper (): Pet | undefined { return petsOf(this.ctx.me()).find((p) => p.post?.k === 'stn' && p.post.id === this.id); }

    private done () {
        if (this.back) this.ctx.open(this.back.name, this.back.arg); else this.ctx.close();
    }

    private pick (i: number) {
        const p = this.order[i], e = this.ent();
        if (!p || !e || !stationOk(p, e.kind)) return;
        this.ctx.send({ t: 'pet', op: 'post', pet: p.id, at: { bld: this.id } });
    }

    update () {
        const e = this.ent();
        if (!e) { this.ctx.close(); return; }
        const me = this.ctx.me();
        const k = JSON.stringify([petsOf(me), me.skills]);
        if (k === this.key) return;
        this.key = k;
        const def = BUILDINGS[e.kind], skill = def.work!, info = WORK_INFO[skill];
        const g = this.g, li = this.list.inner;
        g.clear();
        // the ones that can do it first, best first
        this.order = [...petsOf(me)].sort((a, b) => (stationOk(b, e.kind) ? 1 : 0) - (stationOk(a, e.kind) ? 1 : 0) || aptOf(b, skill) - aptOf(a, skill) || b.lv - a.lv);
        const able = this.order.filter((p) => stationOk(p, e.kind)).length;
        this.list.setRight(`${able} of ${this.order.length} can do it`);
        this.cells.forEach((c, i) => {
            const x = li.x + (i % COLS) * (CELL + GAPC), y = li.y + Math.floor(i / COLS) * (CELL + GAPC), p = this.order[i];
            const can = !!p && stationOk(p, e.kind), here = p?.post?.k === 'stn' && p.post.id === this.id;
            rowBox(g, x, y, CELL, CELL, { off: !p, on: here, accent: PAL.lime });
            if (!p) { c.img.setVisible(false); c.lv.setText(''); return; }
            c.img.setVisible(true).setTexture(critTex(this.ctx.scene, p.sp), 0).setScale(fitScale(this.ctx.scene, critTex(this.ctx.scene, p.sp), CELL - 16, 3)).setAlpha(can ? 1 : 0.35);
            rect(g, x + 3, y + CELL - 6, CELL - 6, 3, ELEMENT_COLOR[spOf(p.sp).element], can ? 1 : 0.3);
            if (can) pips(g, x + 8, y + 4, aptOf(p, skill), info.color, 5);
            if (p.post || p.den !== undefined) rect(g, x + CELL - 10, y + 5, 6, 6, here ? PAL.gold : PAL.lime);
            c.lv.setText(`${p.lv}`);
        });
        this.icon.setTexture(def.tex, 0).setScale(fitScale(this.ctx.scene, def.tex, 44, 3));
        this.win.at(this.icon, this.det.inner.x + 32, this.det.inner.y + 32);
        this.det.setTitle(def.name);
        this.needT.setText(`Needs ${info.name}`).setColor(hex(info.color));
        const kp = this.keeper();
        this.keeperT.setText(kp ? `${kp.name} works here: ${STATUS_INFO[statusOf(kp)].text}.${STATUS_INFO[statusOf(kp)].bad ? '\n' + STATUS_INFO[statusOf(kp)].hint : ''}` : 'Nobody works here yet. Click a creature on the left.')
            .setColor(hex(kp ? STATUS_INFO[statusOf(kp)].color : PAL.pebble));
        showBtn(this.foot.extras[0], !!kp);
        this.win.at(this.infoT, this.det.inner.x, this.det.inner.y + 84 + Math.ceil(this.keeperT.height) + 14);
        this.infoT.setText(def.proc
            ? `A keeper brings ingredients and fuel from the chests within nine tiles, empties the machine into them, and makes it run faster. Put a Chest next to it with what it needs.${def.proc === 'assembler' ? '\nOpen the Assembler and choose what it builds first.' : ''}`
            : 'The worker makes what you order: open the workshop (E), pick a recipe and give it a number. It takes the ingredients from the chests within nine tiles and puts the result back in.');
        if (!petsOf(me).length) this.keeperT.setText('You have no creatures yet. Throw a Taming Pod (T) at a wild creature.');
    }

    destroy () { this.win.destroy(); }
}
