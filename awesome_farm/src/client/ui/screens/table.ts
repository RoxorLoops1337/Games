// The potluck table's window. Left: the dishes on the table (up to four), each with its portions, its cook and its buff, and Take
// buttons on your own. Right: the dishes in your pockets (anything with a buff): a tap sets one out. The gold button feasts now (one
// portion of each dish that helps you); pressing USE at the table does the same without opening this. See sim/potluck.ts.

import type * as Phaser from 'phaser';
import { TUNING } from '../../../shared/config';
import { ITEMS, iconOf, type ItemId } from '../../../shared/data/items';
import { BUFFS } from '../../../shared/data/stats';
import { PAL } from '../../../shared/palette';
import { cookName, DISHES, feastLine, plan, rowsOf, whyNotFeast } from '../../../shared/sim/potluck';
import { countOf } from '../../../shared/sim/stats';
import type { BuildE } from '../../../shared/sim/types';
import { isTouchUi } from '../../input/layout';
import { GridItem, ItemGrid } from '../grid';
import { qtyAmount } from '../gestures';
import { button, deviceText, Footer, GAP, icon, QtyChips, rowBox, Section, tipOn, ts, Win, type Btn } from '../kit';
import { STYLES } from '../px';
import { itemTip } from '../tips';
import type { Screen, ScreenCtx } from './types';

export class TableScreen implements Screen {
    private win: Win;
    private id: number;
    private foot: Footer;
    private key = '';
    private g: Phaser.GameObjects.Graphics;
    private dyn: Phaser.GameObjects.GameObject[] = [];
    private btns: Btn[] = [];
    private bag: ItemGrid;
    private tableSec: Section;
    private bagSec: Section;

    constructor (private ctx: ScreenCtx, arg: unknown) {
        this.id = (arg as { id: number }).id;
        const s = ctx.scene, touch = isTouchUi();
        this.win = new Win(s, {
            size: touch ? 'large' : 'medium', title: 'Potluck table', icon: 'table', accent: PAL.gold,
            sub: deviceText(`Put out up to ${TUNING.tableDishes} different dishes. Everyone who presses E here eats a portion of each.`, `Put out up to ${TUNING.tableDishes} different dishes. Everyone who taps USE here eats a portion of each.`),
            onClose: () => ctx.close(),
        });
        const w = this.win;
        this.g = w.put(s.add.graphics(), 0, 0);
        this.foot = w.footer({ primary: { label: 'Feast now', onClick: () => this.feast() }, hint: '' });
        const body = w.body;       // (after the footer: the body stops above it)
        const lw = touch ? Math.floor(body.w * 0.58) : Math.min(380, Math.floor(body.w * 0.6));       // (a phone's bigger words get the bigger window)
        this.tableSec = w.section(body.x, body.y, lw, body.h, 'On the table', { right: '' });
        this.bagSec = w.section(body.x + lw + GAP, body.y, body.w - lw - GAP, body.h, 'Your dishes', { right: '' });
        const bi = this.bagSec.inner, band = touch ? 40 : 0, gi = ItemGrid.fit(bi.w, bi.h - band, 48, 4);
        this.bag = new ItemGrid(w, bi.x, bi.y, gi.cols, gi.rows, 48, 4, 'No dishes in your pockets.\nCook a stew or a pie, or brew a potion: anything with a buff.');
        if (touch) {
            w.text('A tap sets out:', bi.x, bi.y + bi.h - 18, ts('body'), PAL.pebble, { origin: [0, 0.5], bold: false });
            this.bag.qty = new QtyChips(w, bi.x + 120, bi.y + bi.h - 18, [1, 5, 'all'], 'all', 44);
        }
    }

    private ent (): BuildE | null { const e = this.ctx.farm.ents[this.id]; return e && e.k === 'bld' && e.kind === 'table' ? e : null; }
    private nameOf = (id: string) => cookName(this.ctx.farm.players, id);

    private feast () {
        const b = this.ent();
        if (!b) return;
        const why = whyNotFeast(this.ctx.me(), b, this.ctx.farm.clock.time);
        if (why) { this.ctx.toast(why, undefined, PAL.pebble); return; }
        this.ctx.send({ t: 'potluck', op: 'feast', id: this.id });
        this.ctx.close();                                   // (the banner with the cooks' names waits for a free screen)
    }

    /** Why this dish cannot go on the table right now (null when it can). Mirrors sim/potluck.ts; the sim has the last word. */
    private whyNotPut (b: BuildE, it: ItemId): string | null {
        const rows = rowsOf(b), row = rows.find((r) => r.it === it), me = this.ctx.me();
        if (row && row.by !== me.id) return `${this.nameOf(row.by)} already brought ${ITEMS[it].name}`;
        if (!row && rows.length >= TUNING.tableDishes) return `The table is full: ${TUNING.tableDishes} different dishes`;
        if ((row?.n ?? 0) >= TUNING.tablePortions) return `That dish is full: ${TUNING.tablePortions} portions`;
        return null;
    }

    private put (b: BuildE, it: ItemId, n: number) {
        if (n < 1) return;
        const why = this.whyNotPut(b, it);
        if (why) { this.ctx.toast(why, `i_${it}`, PAL.pebble); return; }
        this.ctx.send({ t: 'potluck', op: 'put', id: this.id, item: it, n });
    }

    wheel (dy: number, x: number, y: number) { if (this.bag.contains(x, y)) this.bag.scroll(dy); }

    update () {
        const b = this.ent();
        if (!b) { this.ctx.close(); return; }
        const me = this.ctx.me(), now = this.ctx.farm.clock.time;
        const pl = plan(me, b, now), wait = Math.ceil(pl.wait);
        const mine = DISHES.filter((it) => countOf(me, it) > 0);
        const k = JSON.stringify([rowsOf(b), wait, pl.eat.map((d) => d.it), mine.map((it) => [it, countOf(me, it)]), rowsOf(b).map((d) => this.nameOf(d.by))]);
        if (k === this.key) return;
        this.key = k;
        this.drawTable(b, me.id);
        this.drawBag(b, mine);
        // the gold button: what a feast would be, or why it cannot be
        const why = whyNotFeast(me, b, now);
        this.foot.primary?.setEnabled(!why);
        this.foot.setHint(why ?? `You would eat: ${feastLine(pl.eat, this.nameOf, 90)}`, why ? PAL.pebble : PAL.lime);
    }

    private drawTable (b: BuildE, meId: string) {
        const w = this.win, s = this.ctx.scene, g = this.g, inner = this.tableSec.inner;
        g.clear();
        for (const o of this.dyn) o.destroy();
        for (const bt of this.btns) bt.root.destroy();
        this.dyn = []; this.btns = [];
        const rows = rowsOf(b), slots = TUNING.tableDishes, gap = 5;
        this.tableSec.setRight(`${rows.length} / ${slots} dishes`);
        const rowH = Math.floor((inner.h - gap * (slots - 1)) / slots);
        const touch = isTouchUi();
        for (let i = 0; i < slots; i++) {
            const y = inner.y + i * (rowH + gap), d = rows[i];
            if (!d) {
                rowBox(g, inner.x, y, inner.w, rowH, { off: true });
                this.dyn.push(w.text(i === 0 ? 'Nothing out yet. Set out a dish from your pockets.' : i === rows.length ? deviceText('Click a dish on the right to put it out here', 'Tap a dish on the right to put it out here') : 'A free place', inner.x + inner.w / 2, y + rowH / 2, ts('body'), PAL.pebble, { origin: [0.5, 0.5], bold: false, wrap: inner.w - 24, align: 'center' }));
                continue;
            }
            const def = ITEMS[d.it], buff = BUFFS[def.buff!.id], cook = this.nameOf(d.by), own = d.by === meId;
            rowBox(g, inner.x, y, inner.w, rowH, { on: own, accent: PAL.gold });
            this.dyn.push(w.put(icon(s, iconOf(d.it), 0, 0, 2), inner.x + 28, y + rowH / 2 - 4));
            this.dyn.push(w.text(`×${d.n}`, inner.x + 28, y + rowH - 4, ts('cap'), PAL.cream, { origin: [0.5, 1], font: 'head' }));
            const tx = inner.x + 58, line = Math.round(ts('body') * 1.2);
            this.dyn.push(w.text(def.name, tx, y + 5, ts('body'), PAL.cream, { font: 'head', wrap: 150 }));
            this.dyn.push(w.text(`${cook}'s`, tx, y + 5 + line, ts('cap'), PAL.gold, { bold: false }));
            this.dyn.push(w.text(`${buff.name}  ·  ${Math.round(def.buff!.secs)}s`, tx, y + 5 + line + Math.round(ts('cap') * 1.25), ts('cap'), PAL.foam, { bold: false }));
            // a tap or hover on the row says what the dish does
            const zone = w.put(s.add.zone(0, 0, inner.w, rowH).setOrigin(0).setInteractive(), inner.x, y);
            zone.setDepth(-1);
            this.dyn.push(zone);
            const foot = own ? 'Cooked by you' : `Cooked by ${cook}: only ${cook} can take it back`;
            tipOn(zone, () => itemTip(d.it, { count: d.n, foot }));
            if (own) {
                const bw = touch ? 74 : 64;
                const one = button(s, 0, 0, bw, 28, 'Take 1', () => this.ctx.send({ t: 'potluck', op: 'take', id: this.id, item: d.it, n: 1 }), { style: STYLES.dark, size: 13, ink: false });
                const all = button(s, 0, 0, bw, 28, 'Take all', () => this.ctx.send({ t: 'potluck', op: 'take', id: this.id, item: d.it, n: d.n }), { style: STYLES.dark, size: 13, ink: false });
                w.put(one.root, inner.x + inner.w - bw * 1.5 - 14, y + rowH / 2);
                w.put(all.root, inner.x + inner.w - bw / 2 - 8, y + rowH / 2);
                this.btns.push(one, all);
            } else {
                this.dyn.push(w.text(`Only ${cook} can\ntake it back`, inner.x + inner.w - 12, y + rowH / 2, ts('cap'), PAL.pebble, { origin: [1, 0.5], align: 'right', bold: false }));
            }
        }
    }

    private drawBag (b: BuildE, mine: ItemId[]) {
        const me = this.ctx.me();
        this.bagSec.setRight(`${mine.length} kind${mine.length === 1 ? '' : 's'}`);
        this.bag.setItems(mine.map((it): GridItem => {
            const why = this.whyNotPut(b, it), have = countOf(me, it);
            return {
                data: { icon: iconOf(it), count: have, rarity: ITEMS[it].rarity, dim: !!why },
                tip: () => itemTip(it, { count: have, foot: why ?? deviceText('Click: set out all you can · Right-click: set out one', 'Tap: set out (x1, x5 or All below) · Hold: set out one') }),
                click: (shift, q) => this.put(b, it, qtyAmount(q, have, shift, 'all')),
                right: () => this.put(b, it, 1),
            };
        }));
    }

    destroy () { for (const bt of this.btns) bt.root.destroy(); this.win.destroy(); }
}
