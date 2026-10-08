// Furnace / sawmill / millstone / assembler: ingredients in, fuel, progress, outputs, and what it makes.
// Assemblers get a recipe picker instead of a recipe list.

import * as Phaser from 'phaser';
import { BUILDINGS } from '../../../shared/data/buildings';
import { FUEL, ITEMS, ItemId, iconOf } from '../../../shared/data/items';
import { RECIPES, recipesFor } from '../../../shared/data/recipes';
import { PAL } from '../../../shared/palette';
import { procInputs } from '../../../shared/sim/machines';
import { sunlight } from '../../../shared/daylight';
import { buildPowerGraph, netStats } from '../../../shared/sim/power';
import { statusOf, type Status } from '../../../shared/sim/status';
import { countOf, hasUnlock } from '../../../shared/sim/stats';
import type { BuildE } from '../../../shared/sim/types';
import { StatusBlock } from '../factoryui';
import { GridItem, ItemGrid } from '../grid';
import { deviceText, GAP, icon, onTap, Section, Slot, tipOn, ts, Win } from '../kit';
import { bar, hex, inset, rect } from '../px';
import { itemTip, recipeTip } from '../tips';
import { stripH, WorkerStrip } from '../workercard';
import type { Screen, ScreenCtx } from './types';

type InvKey = 'inv' | 'fin' | 'out';

export class MachineScreen implements Screen {
    private win: Win;
    private id: number;
    private g: Phaser.GameObjects.Graphics;
    private inSlots: Slot[] = [];
    private fuelSlots: Slot[] = [];
    private outSlots: Slot[] = [];
    private grid: ItemGrid;
    private recGrid: ItemGrid | null = null;
    private recText: Phaser.GameObjects.Text[] = [];
    private recIn: Phaser.GameObjects.Image[] = [];
    private recOut: Phaser.GameObjects.Image[] = [];
    private recMore: Phaser.GameObjects.Text;
    private recSec: Section;
    private status: StatusBlock;
    private powerT: Phaser.GameObjects.Text;
    private bar = { x: 0, y: 0, w: 0 };
    private fuelBar = { x: 0, y: 0, w: 0 };
    private key = '';
    private anim = { prog: 0, last: -1 };
    private strip: WorkerStrip;
    private list: ReturnType<typeof recipesFor> = [];
    private rowsMax = 0;

    constructor (private ctx: ScreenCtx, arg: unknown) {
        const s = ctx.scene;
        this.id = (arg as { id: number }).id;
        const b = this.ent()!;
        const def = BUILDINGS[b.kind];
        this.win = new Win(s, { size: 'large', title: def.name, icon: def.tex, accent: PAL.pumpkin, onClose: () => ctx.close() });
        const w = this.win;
        w.footer({
            primary: { label: 'Collect all', onClick: () => ctx.send({ t: 'collect', id: this.id }) },
            secondary: [{ label: 'Load all', onClick: () => ctx.send({ t: 'load', id: this.id }) }],
            hint: deviceText('Click a slot to take what is in it. Click your items below to load them.', 'Tap a slot to take what is in it. Tap your items below to load them.'),
        });
        const body = w.body, rowA = 164, rowB = body.h - stripH() - GAP - rowA - GAP;
        this.g = w.put(s.add.graphics(), 0, 0);
        // ── the top row: what goes in, what it is doing, what comes out ──
        const inW = 316, outW = 216, midW = body.w - inW - outW - 2 * GAP;
        const ing = w.section(body.x, body.y, inW, rowA, 'Ingredients');
        for (let i = 0; i < 6; i++) this.inSlots.push(this.mkSlot(ing.inner.x + i * 50, ing.inner.y + 2, 'inv', i));
        if (def.fuel) {
            const fy = ing.inner.y + 62;
            w.text("Fuel", ing.inner.x, fy, ts("body"), PAL.pebble, { font: "head" });
            for (let i = 0; i < 3; i++) this.fuelSlots.push(this.mkSlot(ing.inner.x + i * 50, fy + 20, 'fin', i));
            this.fuelBar = { x: ing.inner.x + 164, y: fy + 38, w: ing.inner.w - 164 - 4 };
            w.text('Burns while it works', this.fuelBar.x, fy + 22, ts('cap'), PAL.pebble, { bold: false });
        }
        const mid = w.section(body.x + inW + GAP, body.y, midW, rowA);
        this.status = new StatusBlock(w, mid.inner.x, mid.inner.y, mid.inner.w);
        this.bar = { x: mid.inner.x, y: mid.inner.y + Math.round(ts('head') * 1.2) + 12, w: mid.inner.w - 24 };
        this.powerT = w.text('', mid.inner.x, mid.inner.y + mid.inner.h - Math.round(ts('body') * 1.2), ts('body'), PAL.gold, { bold: false, wrap: mid.inner.w });
        const out = w.section(body.x + inW + GAP + midW + GAP, body.y, outW, rowA, 'Output');
        for (let i = 0; i < 4; i++) this.outSlots.push(this.mkSlot(out.inner.x + i * 50, out.inner.y + 2, 'out', i));
        w.text(deviceText('Click to take it out', 'Tap to take it out'), out.inner.x, out.inner.y + 58, ts('cap'), PAL.pebble, { bold: false });
        // ── the bottom row: what it can make, and what you could put in ──
        const yB = body.y + rowA + GAP, recW = 444;
        const list = recipesFor(def.proc!);
        this.list = list;
        this.recMore = w.text('', 0, 0, ts('cap'), PAL.pebble, { bold: false });
        if (def.proc === 'assembler') {
            this.recSec = w.section(body.x, yB, recW, rowB, 'Choose what to build');
            const g = ItemGrid.fit(this.recSec.inner.w, this.recSec.inner.h, 40, 4);
            this.recGrid = new ItemGrid(w, this.recSec.inner.x, this.recSec.inner.y, g.cols, g.rows, 40, 4, '');
        } else {
            this.recSec = w.section(body.x, yB, recW, rowB, 'What it makes', { right: `${list.length} recipe${list.length === 1 ? '' : 's'}` });
            const pitch = ts('body') > 12 ? 26 : 22;
            this.rowsMax = Math.max(1, Math.floor(this.recSec.inner.h / pitch));
            for (let i = 0; i < Math.min(this.rowsMax, list.length); i++) {
                const y = this.recSec.inner.y + i * pitch;
                this.recIn.push(w.put(icon(s, 'i_wood', 0, 0, 1), this.recSec.inner.x + 10, y + pitch / 2));
                this.recOut.push(w.put(icon(s, 'i_wood', 0, 0, 1), this.recSec.inner.x + this.recSec.inner.w - 10, y + pitch / 2));
                this.recText.push(w.text('', this.recSec.inner.x + 26, y + pitch / 2, ts('body'), PAL.cream, { bold: false, origin: [0, 0.5] }));
            }
            if (list.length > this.rowsMax) this.recMore = w.text('', this.recSec.inner.x + this.recSec.inner.w - 8, this.recSec.inner.y + this.recSec.inner.h - 2, ts('cap'), PAL.pebble, { bold: false, origin: [1, 1] });
        }
        const its = w.section(body.x + recW + GAP, yB, body.w - recW - GAP, rowB, deviceText('Your items: click to load', 'Your items: tap to load, hold for more'));
        const gi = ItemGrid.fit(its.inner.w, its.inner.h, 44, 4);
        this.grid = new ItemGrid(w, its.inner.x, its.inner.y, gi.cols, gi.rows, 44, 4, 'Nothing useful in your pockets.');
        // a creature can run this: the strip along the bottom shows who, and how they are getting on
        this.strip = new WorkerStrip({ ctx, win: w, x: body.x, y: body.y + body.h - stripH(), w: body.w, bld: () => this.ent(), back: () => ({ name: 'machine', arg: { id: this.id } }) });
    }

    private ent (): BuildE | null {
        const e = this.ctx.farm.ents[this.id];
        return e && e.k === 'bld' ? e : null;
    }

    private mkSlot (x: number, y: number, which: InvKey, i: number) {
        const sl = new Slot(this.ctx.scene, 0, 0, 46);
        this.win.putAt(sl.root, x, y);
        const items = () => this.list2(which);
        const part = which === 'fin' ? 'fuel' : which;
        onTap(sl.interactive, () => { const it = items()[i]; if (it) this.ctx.send({ t: 'xfer', id: this.id, item: it[0], n: it[1], dir: 'take', part }); },
            () => { const it = items()[i]; if (it) this.ctx.send({ t: 'xfer', id: this.id, item: it[0], n: 1, dir: 'take', part }); });
        tipOn(sl.interactive, () => { const it = items()[i]; return it ? itemTip(it[0], { count: it[1], foot: deviceText('Click: take all · Right-click: take one', 'Tap: take all · Hold: take one') }) : null; });
        return sl;
    }

    private list2 (which: InvKey): [ItemId, number][] {
        const b = this.ent();
        const inv = b?.[which] ?? {};
        return (Object.entries(inv) as [ItemId, number][]).filter(([, n]) => n > 0);
    }

    wheel (dy: number, x: number, y: number) { if (this.grid.contains(x, y)) this.grid.scroll(dy); }

    update (dt: number) {
        const b = this.ent();
        if (!b) { this.ctx.close(); return; }
        const me = this.ctx.me();
        const k = JSON.stringify([b.inv, b.fin, b.out, b.rcp, b.sel, Math.round(b.fuel ?? 0), b.pw, me.inv, me.skills]);
        const r = b.rcp ? RECIPES[b.rcp] : null;
        const st = statusOf(b, this.ctx.farm.fv.statusEnv);
        if (!r) this.anim.prog = 0;
        else if ((b.prog ?? 0) !== this.anim.last) { this.anim.prog = b.prog ?? 0; this.anim.last = b.prog ?? 0; }
        else if (st.state === 'working') this.anim.prog = Math.min(r.time, this.anim.prog + dt * (BUILDINGS[b.kind].use ? (b.pw ?? 0) : 1));       // (it only creeps along while the machine really is working)
        if (k !== this.key) { this.key = k; this.sync(b); }
        this.drawProgress(b, r, st);
        this.strip.update();
    }

    private sync (b: BuildE) {
        const me = this.ctx.me(), def = BUILDINGS[b.kind];
        const fill = (slots: Slot[], list: [ItemId, number][]) => slots.forEach((sl, i) => { const it = list[i]; sl.set(it ? { icon: iconOf(it[0]), count: it[1], rarity: ITEMS[it[0]].rarity } : null); });
        fill(this.inSlots, this.list2('inv'));
        fill(this.fuelSlots, this.list2('fin'));
        fill(this.outSlots, this.list2('out'));
        const list = this.list;
        if (this.recGrid) {
            this.recGrid.setItems(list.map((r): GridItem => ({
                data: { icon: iconOf(r.out), count: r.n > 1 ? r.n : undefined, rarity: ITEMS[r.out].rarity, dim: !hasUnlock(me, r.req), overlay: !hasUnlock(me, r.req) ? 'k_lock' : undefined, badge: b.sel === r.id ? '✓' : undefined },
                tip: () => ({ ...recipeTip(me, r), foot: b.sel === r.id ? 'Currently building this' : 'Click to build this' }),
                click: () => this.ctx.send({ t: 'config', id: this.id, sel: r.id }),
            })));
        } else {
            const pitch = ts('body') > 12 ? 26 : 22, inner = this.recSec.inner;
            list.slice(0, this.recText.length).forEach((r, i) => {
                const [inId] = Object.keys(r.in) as ItemId[];
                const locked = !hasUnlock(me, r.req);
                const need = Object.entries(r.in).map(([id, n]) => `${n} ${ITEMS[id as ItemId].name}`).join(' + ');
                this.recIn[i].setTexture(iconOf(inId), 0).setAlpha(locked ? 0.35 : 1);
                this.recOut[i].setTexture(iconOf(r.out), 0).setAlpha(locked ? 0.35 : 1);
                this.recText[i].setText(`${need}  →  ${r.n > 1 ? r.n + ' ' : ''}${ITEMS[r.out].name}  (${r.time}s)${locked ? '  locked' : ''}`).setColor(hex(locked ? PAL.pebble : PAL.cream));
                this.win.at(this.recText[i], inner.x + 26, inner.y + i * pitch + pitch / 2 - this.recText[i].height / 2);
                this.win.at(this.recOut[i], inner.x + 26 + Math.ceil(this.recText[i].width) + 14, inner.y + i * pitch + pitch / 2);
            });
            if (list.length > this.recText.length) this.recMore.setText(`+${list.length - this.recText.length} more`);
        }
        const accepted = procInputs(b.kind, b.sel);
        const items: GridItem[] = (Object.keys(ITEMS) as ItemId[])
            .filter((id) => countOf(me, id) > 0 && (accepted.has(id) || (def.fuel && FUEL[id])))
            .map((id) => ({
                data: { icon: iconOf(id), count: countOf(me, id), rarity: ITEMS[id].rarity },
                tip: () => itemTip(id, { count: countOf(me, id), foot: def.fuel && FUEL[id] ? (accepted.has(id) ? deviceText('Click: fuel · Shift-click: ingredient', 'Tap: fuel · Hold: ingredient') : 'Click: add as fuel') : deviceText('Click: load one · Shift-click: load all', 'Tap: load one · Hold: load all') }),
                holdIsShift: true,                       // (a long press is the Shift-click on a phone)
                click: (shift: boolean) => {
                    const asFuel = !!def.fuel && !!FUEL[id] && !(shift && accepted.has(id));
                    this.ctx.send({ t: 'xfer', id: this.id, item: id, n: shift ? countOf(me, id) : asFuel ? 5 : 1, dir: 'put', part: asFuel ? 'fuel' : 'inv' });
                },
            }));
        this.grid.setItems(items);
    }

    private drawProgress (b: BuildE, r: typeof RECIPES[string] | null, st: Status) {
        const g = this.g, def = BUILDINGS[b.kind];
        g.clear();
        // the plain-language status (the same rules the badges in the world and the tooltips use)
        const { sentenceEnd } = this.status.set(st, 34);
        const x0 = this.bar.x, y0 = Math.max(this.bar.y, sentenceEnd + 2), wBar = this.bar.w;
        const frac = r ? this.anim.prog / r.time : 0;
        inset(g, x0, y0, wBar, 22, PAL.ink, PAL.slate);
        rect(g, x0 + 2, y0 + 2, Math.round((wBar - 4) * frac), 18, PAL.pumpkin);
        rect(g, x0 + 2, y0 + 2, Math.round((wBar - 4) * frac), 6, 0xffffff, 0.25);
        g.fillStyle(PAL.ink, 1).fillTriangle(x0 + wBar + 2, y0 - 2, x0 + wBar + 2, y0 + 24, x0 + wBar + 14, y0 + 11);
        g.fillStyle(r ? PAL.pumpkin : PAL.slate, 1).fillTriangle(x0 + wBar + 4, y0 + 2, x0 + wBar + 4, y0 + 20, x0 + wBar + 12, y0 + 11);
        if (def.fuel) {
            const left = Math.max(0, b.fuel ?? 0);
            bar(g, this.fuelBar.x, this.fuelBar.y, this.fuelBar.w, 10, Math.min(1, left / 50), left > 0 ? PAL.pumpkin : PAL.slate);
        }
        // power (assemblers)
        if (def.use) {
            const graph = buildPowerGraph(this.ctx.farm.buildings());
            const net = graph.netOf.get(b.id);
            const ns = net ? netStats(net, this.ctx.farm.clock.time, sunlight(this.ctx.farm.clock.clock, this.ctx.farm.clock.nightLen)) : null;
            this.powerT.setText(!net ? 'Not connected to power!' : `Power ${Math.round((b.pw ?? 0) * 100)}%  ·  grid makes ${Math.round(ns!.gen)}, uses ${Math.round(ns!.use)}`).setColor(hex(!net || (b.pw ?? 0) < 0.3 ? PAL.berry : PAL.gold));
        } else this.powerT.setText('');
    }

    destroy () { this.win.destroy(); }
}
