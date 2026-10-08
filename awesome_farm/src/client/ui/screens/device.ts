// Drills, inserters, power poles, wind turbines and coal generators: status, the power grid
// they're on, contents you can collect or refuel, and their facing and filter.

import * as Phaser from 'phaser';
import { BUILDINGS } from '../../../shared/data/buildings';
import { chuteSells } from '../../../shared/sim/chute';
import { FUEL, ITEM_ORDER, ITEMS, ItemId, iconOf } from '../../../shared/data/items';
import { PAL } from '../../../shared/palette';
import { sunlight } from '../../../shared/daylight';
import { buildPowerGraph, netStats } from '../../../shared/sim/power';
import { statusOf } from '../../../shared/sim/status';
import { countOf } from '../../../shared/sim/stats';
import type { BuildE } from '../../../shared/sim/types';
import { StatusBlock } from '../factoryui';
import { GridItem, ItemGrid } from '../grid';
import { BTN_H, button, deviceText, GAP, onTap, Slot, tipOn, ts, Win, type WinSize } from '../kit';
import { bar, hex, STYLES } from '../px';
import { itemTip } from '../tips';
import type { Screen, ScreenCtx } from './types';

const ARROWS = ['→', '↓', '←', '↑'];
type Content = 'buffer' | 'fuel' | 'filter' | 'none';

export class DeviceScreen implements Screen {
    private win: Win;
    private id: number;
    private g: Phaser.GameObjects.Graphics;
    private status: StatusBlock;
    private powerT: Phaser.GameObjects.Text;
    private slots: Slot[] = [];
    private rotBtns: ReturnType<typeof button>[] = [];
    private fuelGrid: ItemGrid | null = null;
    private filterGrid: ItemGrid | null = null;
    private filterSlot: Slot | null = null;
    private filterT: Phaser.GameObjects.Text | null = null;
    private powerBar = { x: 0, y: 0, w: 0 };
    private key = '';

    constructor (private ctx: ScreenCtx, arg: unknown) {
        const s = ctx.scene;
        this.id = (arg as { id: number }).id;
        const b = this.ent()!;
        const def = BUILDINGS[b.kind];
        const content: Content = b.kind === 'inserter' || b.kind === 'sorter' || b.kind === 'chute' ? 'filter' : b.kind === 'drill' ? 'buffer' : def.fuel ? 'fuel' : 'none';
        const size: WinSize = content === 'filter' ? 'large' : content === 'none' && !def.dir ? 'small' : 'medium';
        this.win = new Win(s, { size, title: def.name, icon: def.tex, accent: PAL.gold, sub: def.desc, onClose: () => ctx.close() });
        const w = this.win;
        w.footer({ hint: content === 'buffer' ? deviceText('Click a slot to take what has piled up.', 'Tap a slot to take what has piled up.') : content === 'fuel' ? deviceText('Click your fuel to add 5. Shift-click adds all of it.', 'Tap your fuel to add 5. Hold adds all of it.') : content === 'filter' ? (b.kind === 'chute' ? 'Pick an item to sell only that, or click the box to sell anything it can.' : 'Pick an item to move only that, or click the box to move anything.') : '' });
        this.g = w.put(s.add.graphics(), 0, 0);
        const body = w.body, two = content !== 'none';
        const lw = two ? (size === 'large' ? 300 : 296) : body.w;
        const facingH = def.dir ? Math.round(ts('head') * 1.2) + 12 + 4 + BTN_H + 14 : 0;
        // ── what it is doing ──
        const sec = w.section(body.x, body.y, lw, body.h - (facingH ? facingH + GAP : 0));
        this.status = new StatusBlock(w, sec.inner.x, sec.inner.y, sec.inner.w);
        this.powerT = w.text('', sec.inner.x, sec.inner.y, ts('body'), PAL.gold, { bold: false, wrap: sec.inner.w });
        this.powerBar = { x: sec.inner.x, y: sec.inner.y + sec.inner.h - 12, w: sec.inner.w };
        // ── which way it faces ──
        if (def.dir) {
            const fy = body.y + body.h - facingH;
            const f = w.section(body.x, fy, lw, facingH, 'Facing');
            const bw = Math.min(64, Math.floor((f.inner.w - 3 * 8) / 4));
            ARROWS.forEach((a, i) => {
                const btn = button(s, 0, 0, bw, BTN_H, a, () => ctx.send({ t: 'config', id: this.id, rot: i }), { style: STYLES.dark, size: 18 });
                w.put(btn.root, f.inner.x + bw / 2 + i * (bw + 8), f.inner.y + 2 + BTN_H / 2);
                this.rotBtns.push(btn);
            });
        }
        // ── what is inside, and what you could add ──
        const rx = body.x + lw + GAP, rw = body.w - lw - GAP;
        if (content === 'buffer' || content === 'fuel') {
            const which = b.kind === 'drill' ? 'out' : 'fin';
            const part = which === 'fin' ? 'fuel' : 'out';
            const box = w.section(rx, body.y, rw, body.h, b.kind === 'drill' ? 'Ore waiting' : 'Fuel in it');
            for (let i = 0; i < 4; i++) {
                const sl = new Slot(s, 0, 0, 46);
                w.putAt(sl.root, box.inner.x + i * 50, box.inner.y + 2);
                this.slots.push(sl);
                onTap(sl.interactive, () => { const it = this.list(which)[i]; if (it) ctx.send({ t: 'xfer', id: this.id, item: it[0], n: it[1], dir: 'take', part }); });
                tipOn(sl.interactive, () => { const it = this.list(which)[i]; return it ? itemTip(it[0], { count: it[1], foot: 'Click: take' }) : null; });
            }
            if (content === 'fuel') {
                w.text(deviceText('Your fuel: click to add', 'Your fuel: tap to add 5, hold for all'), box.inner.x, box.inner.y + 64, ts('body'), PAL.pebble, { font: 'head' });
                const gy = box.inner.y + 64 + Math.round(ts('body') * 1.2) + 8, gi = ItemGrid.fit(box.inner.w, box.inner.y + box.inner.h - gy, 44, 4);
                this.fuelGrid = new ItemGrid(w, box.inner.x, gy, gi.cols, gi.rows, 44, 4, 'No fuel on you.');
            } else {
                w.text('Miners fill this up by themselves. Take the ore out, or let a belt or an inserter do it.', box.inner.x, box.inner.y + 64, ts('cap'), PAL.pebble, { bold: false, wrap: box.inner.w });
            }
        } else if (content === 'filter') {
            const box = w.section(rx, body.y, rw, body.h, b.kind === 'sorter' ? 'Straight on…' : b.kind === 'chute' ? 'Only sell…' : 'Only move…');
            this.filterSlot = new Slot(s, 0, 0, 46);
            w.putAt(this.filterSlot.root, box.inner.x, box.inner.y + 2);
            onTap(this.filterSlot.interactive, () => ctx.send({ t: 'config', id: this.id, flt: null }));
            tipOn(this.filterSlot.interactive, () => (this.ent()?.flt ? itemTip(this.ent()!.flt!, { foot: 'Click to clear the filter' }) : { title: 'No filter', color: PAL.pebble, lines: [{ t: this.ent()?.kind === 'sorter' ? 'Everything carries straight on.' : this.ent()?.kind === 'chute' ? 'Sells anything that can be sold.' : 'Moves anything the target will accept.', c: PAL.pebble }] }));
            this.filterT = w.text('', box.inner.x + 58, box.inner.y + 2, ts('body'), PAL.cream, { font: 'head', wrap: box.inner.w - 60 });
            w.text(deviceText('Click the box to clear it. Pick an item below to filter on it.', 'Tap the box to clear it. Pick an item below to filter on it.'), box.inner.x + 58, box.inner.y + 26, ts('cap'), PAL.pebble, { bold: false, wrap: box.inner.w - 60 });
            const gy = box.inner.y + 62, gi = ItemGrid.fit(box.inner.w, box.inner.y + box.inner.h - gy, 40, 4);
            this.filterGrid = new ItemGrid(w, box.inner.x, gy, gi.cols, gi.rows, 40, 4, '');
        }
    }

    private ent (): BuildE | null {
        const e = this.ctx.farm.ents[this.id];
        return e && e.k === 'bld' ? e : null;
    }

    private list (which: 'out' | 'fin'): [ItemId, number][] {
        const inv = this.ent()?.[which] ?? {};
        return (Object.entries(inv) as [ItemId, number][]).filter(([, n]) => n > 0);
    }

    wheel (dy: number, x: number, y: number) {
        if (this.fuelGrid?.contains(x, y)) this.fuelGrid.scroll(dy);
        if (this.filterGrid?.contains(x, y)) this.filterGrid.scroll(dy);
    }

    update () {
        const b = this.ent();
        if (!b) { this.ctx.close(); return; }
        const me = this.ctx.me();
        const k = JSON.stringify([b.out, b.fin, b.fuel, b.rot, b.flt, b.hand, b.pw, b.act, Math.round(this.ctx.farm.clock.time / 3), me.inv, Math.round((b.chg ?? 0) / 30)]);
        if (k === this.key) return;
        this.key = k;
        const def = BUILDINGS[b.kind];
        const g = this.g;
        g.clear();
        const graph = buildPowerGraph(this.ctx.farm.buildings());
        const net = graph.netOf.get(b.id);
        const sun = sunlight(this.ctx.farm.clock.clock, this.ctx.farm.clock.nightLen);
        const st = net ? netStats(net, this.ctx.farm.clock.time, sun) : null;
        // status line: what it is doing, what to do about it
        const stat = statusOf(b, this.ctx.farm.fv.statusEnv);
        const { bottom } = this.status.set(stat);
        // power block
        if (def.use && !net) this.powerT.setText('Not connected to a power pole!').setColor(hex(PAL.berry));
        else if (net && st) {
            this.powerT.setText(`Power grid: ${Math.round(st.gen)} made · ${Math.round(st.use)} wanted${def.use ? ` · this uses ${def.use}` : ''}`).setColor(hex(st.ratio < 0.5 ? PAL.berry : PAL.gold));
            bar(g, this.powerBar.x, this.powerBar.y, this.powerBar.w, 12, st.ratio, st.ratio < 0.5 ? PAL.berry : PAL.gold, { ticks: 10 });
        } else this.powerT.setText('');
        this.win.at(this.powerT, this.powerBar.x, Math.max(bottom + 10, this.powerBar.y - Math.ceil(this.powerT.height) - 6));
        // facing buttons
        this.rotBtns.forEach((btn, i) => btn.setStyle(i === (b.rot & 3) ? STYLES.gold : STYLES.dark));
        // buffers
        if (this.slots.length) {
            const which = b.kind === 'drill' ? 'out' : 'fin';
            const list = this.list(which);
            this.slots.forEach((sl, i) => { const it = list[i]; sl.set(it ? { icon: iconOf(it[0]), count: it[1], rarity: ITEMS[it[0]].rarity } : null); });
        }
        if (this.fuelGrid) {
            this.fuelGrid.setItems(ITEM_ORDER.filter((i) => FUEL[i] && countOf(me, i) > 0).map((id): GridItem => ({
                data: { icon: iconOf(id), count: countOf(me, id), rarity: ITEMS[id].rarity },
                tip: () => itemTip(id, { count: countOf(me, id), foot: deviceText('Click: add 5 · Shift: add all', 'Tap: add 5 · Hold: add all') }),
                holdIsShift: true,                       // (a long press is the Shift-click on a phone)
                click: (shift) => this.ctx.send({ t: 'xfer', id: this.id, item: id, n: shift ? countOf(me, id) : 5, dir: 'put', part: 'fuel' }),
            })));
        }
        if (this.filterGrid && this.filterSlot) {
            this.filterSlot.set(b.flt ? { icon: iconOf(b.flt), rarity: ITEMS[b.flt].rarity } : null);
            this.filterT?.setText(b.flt ? ITEMS[b.flt].name : b.kind === 'sorter' ? 'Everything carries straight on' : b.kind === 'chute' ? 'Anything that can be sold' : 'Anything the target accepts');
            this.filterGrid.setItems(ITEM_ORDER.filter((id) => b.kind !== 'chute' || chuteSells(id)).map((id): GridItem => ({
                data: { icon: iconOf(id), rarity: ITEMS[id].rarity, dim: b.flt !== undefined && b.flt !== id },
                tip: () => itemTip(id, { foot: b.kind === 'sorter' ? 'Click: send this straight on' : b.kind === 'chute' ? 'Click: sell only this' : 'Click: only move this' }),
                click: () => this.ctx.send({ t: 'config', id: this.id, flt: id }),
            })));
        }
    }

    destroy () { this.win.destroy(); }
}
