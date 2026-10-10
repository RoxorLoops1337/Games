// The Equipment Bag: what the farmer wears that does not fit on the doll.
//   * the five rings (any free finger; click one in the list to put it on, a worn one to take it off);
//   * the Relic Satchel, the other bag: relics are puzzled into its grid, and how they touch decides what they give (data/relics.ts).
//     Pick a relic in the list, click a cell to lay it (R turns it); click a laid relic to pick it up again.

import * as Phaser from 'phaser';
import { ITEM_ORDER, ITEMS, ItemId, RING_SLOTS, RingSlot } from '../../../shared/data/items';
import { cellsOf, fits, satchelDims, satchelResult, TAG_INFO, type RelicDef } from '../../../shared/data/relics';
import { modLine, type Mods, type StatKey } from '../../../shared/data/stats';
import { PAL } from '../../../shared/palette';
import { countOf, ringTags } from '../../../shared/sim/stats';
import { ItemGrid, GridItem } from '../grid';
import { deviceText, onTap, Slot, tipOn, Win, type Footer } from '../kit';
import { logical } from '../../res';
import { itemTip } from '../tips';
import type { Screen, ScreenCtx } from './types';

const CELL = 46;
const relicOf = (it: string): RelicDef | undefined => (ITEMS as Record<string, { relic?: RelicDef }>)[it]?.relic;
const lines = (m: Mods) => (Object.entries(m) as [StatKey, number][]).filter(([, v]) => v).map(([k, v]) => modLine(k, v));

/** What the worn rings add up to, one line per stat. */
export function ringBonuses (worn: (ItemId | undefined)[]): string[] {
    const sum: Mods = {};
    for (const id of worn) for (const [k, v] of Object.entries(ITEMS[id!]?.gear?.mods ?? {})) sum[k as StatKey] = (sum[k as StatKey] ?? 0) + (v as number);
    return lines(sum);
}

export class GearScreen implements Screen {
    private win: Win;
    private fingers = {} as Record<RingSlot, Slot>;
    private grid: ItemGrid;
    private bonus: ReturnType<Win['text']>;
    private foot: Footer;
    private key = '';
    // the satchel
    private sg: Phaser.GameObjects.Graphics;
    private icons: Phaser.GameObjects.Image[] = [];
    private gx = 0;
    private gy = 0;
    private held: ItemId | null = null;
    private rot: 0 | 1 = 0;
    private hover: [number, number] | null = null;
    private satTitle: ReturnType<Win['section']>;

    constructor (private ctx: ScreenCtx) {
        const s = ctx.scene;
        this.win = new Win(s, { size: 'large', title: 'Equipment Bag', icon: 'k_bag', accent: PAL.gold, onClose: () => ctx.close(), sub: 'Rings on your fingers, relics puzzled into the satchel: how they touch decides what they give.' });
        const w = this.win;
        this.foot = w.footer({
            info: '', infoW: 110,
            secondary: [{ label: 'Turn  (R)', onClick: () => this.turn() }],
            hint: deviceText('Pick a ring or relic on the right. Click a cell to lay a relic; click a laid one to take it back.', 'Tap a ring or relic on the right. Tap a cell to lay a relic; tap a laid one to take it back.'),
        });
        const body = w.body, lw = 300, gx = 8;

        // ── left: the five fingers, and what everything adds up to ──
        const hand = w.section(body.x, body.y, lw, 92, 'Rings worn');
        const size = 48, gap = 6;
        RING_SLOTS.forEach((slot, i) => {
            const sl = new Slot(s, 0, 0, size);
            w.putAt(sl.root, hand.inner.x + 2 + i * (size + gap), hand.inner.y + 6);
            this.fingers[slot] = sl;
            onTap(sl.interactive, () => { if (ctx.me().equip[slot]) ctx.send({ t: 'unequip', slot }); });
            tipOn(sl.interactive, () => {
                const id = ctx.me().equip[slot];
                return id ? itemTip(id, { foot: 'Click to take it off' }) : { title: `Finger ${i + 1}`, color: PAL.pebble, lines: [{ t: 'Free: wear a ring here.', c: PAL.pebble }] };
            });
        });
        const sum = w.section(body.x, hand.y + hand.h + gx, lw, body.h - hand.h - gx, 'Together they give');
        this.bonus = w.text('', sum.inner.x + 4, sum.inner.y + 2, 12, PAL.lime, { wrap: sum.inner.w - 8, bold: false });

        // ── middle: the Relic Satchel ──
        const mw = 5 * CELL + 24;
        this.satTitle = w.section(body.x + lw + gx, body.y, mw, body.h, 'Relic Satchel', { right: '' });
        this.gx = this.satTitle.inner.x + 6; this.gy = this.satTitle.inner.y + 6;
        this.sg = w.put(s.add.graphics(), 0, 0) as Phaser.GameObjects.Graphics;
        const zone = s.add.zone(0, 0, 5 * CELL, 5 * CELL).setOrigin(0).setInteractive({ useHandCursor: true });
        w.put(zone, this.gx, this.gy);
        zone.on('pointermove', (p: Phaser.Input.Pointer) => this.look(p));
        zone.on('pointerout', () => { this.hover = null; this.key = ''; });
        onTap(zone, () => this.click());
        tipOn(zone, () => this.cellTip());

        // ── right: the rings and relics you carry ──
        const rx = body.x + lw + gx + mw + gx, rw = body.w - lw - mw - 2 * gx;
        const carrying = w.section(rx, body.y, rw, body.h, 'Rings and relics you carry');
        const g = ItemGrid.fit(carrying.inner.w, carrying.inner.h, 48, 4);
        this.grid = new ItemGrid(w, carrying.inner.x, carrying.inner.y, g.cols, g.rows, 48, 4, 'Nothing to wear yet.\nRings: the Anvil and bosses.\nRelics: the Alchemy table and crates.');
    }

    wheel (dy: number, x: number, y: number) { if (this.grid.contains(x, y)) this.grid.scroll(dy); }

    onKey (k: string) {
        if (k === 'r' || k === 'R') { this.turn(); return true; }
        if (k === 'Escape' && this.held) { this.held = null; this.key = ''; return true; }
        return false;
    }

    private turn () { this.rot = this.rot ? 0 : 1; this.key = ''; }

    /** The cell under the pointer (inside the grid the farmer has), or null. */
    private look (p: Phaser.Input.Pointer) {
        const q = logical(p), dim = satchelDims(this.ctx.me().level);
        const cx = Math.floor((q.x - (this.win.x + this.gx)) / CELL), cy = Math.floor((q.y - (this.win.y + this.gy)) / CELL);
        const next: [number, number] | null = cx >= 0 && cy >= 0 && cx < dim.w && cy < dim.h ? [cx, cy] : null;
        if (next?.[0] !== this.hover?.[0] || next?.[1] !== this.hover?.[1]) { this.hover = next; this.key = ''; }
    }

    /** The laid relic (index) on a cell, or -1. */
    private at (cx: number, cy: number) {
        const list = this.ctx.me().satchel ?? [];
        return list.findIndex((r) => { const d = relicOf(r.it); return !!d && cellsOf(d.size, r.x, r.y, r.r).some(([x, y]) => x === cx && y === cy); });
    }

    private click () {
        const me = this.ctx.me();
        if (!this.hover) return;
        const [cx, cy] = this.hover;
        if (this.held) {
            if (countOf(me, this.held) < 1) { this.held = null; this.key = ''; return; }
            this.ctx.send({ t: 'satchel', op: 'put', item: this.held, x: cx, y: cy, ...(this.rot ? { r: 1 as const } : {}) });
            return;
        }
        const i = this.at(cx, cy);
        if (i >= 0) this.ctx.send({ t: 'satchel', op: 'take', i });
    }

    private cellTip () {
        const me = this.ctx.me(), list = me.satchel ?? [];
        if (!this.hover) return null;
        const i = this.at(this.hover[0], this.hover[1]);
        if (i < 0) return null;
        const res = satchelResult(relicOf, list, ringTags(me));
        const d = relicOf(list[i].it)!, e = res.each[i], info = TAG_INFO[d.tag];
        const ls = [{ t: `${info.name}: ${modLine(info.mod as StatKey, info.per * e.area * e.mult)}`, c: info.color }];
        if (e.mult > 1) ls.push({ t: `x${Math.round(e.mult * 10) / 10} from neighbours and rings of its kind`, c: PAL.lime });
        for (const c of res.combos) if (c.a === i || c.b === i) ls.push({ t: `${c.name}: ${lines(c.mods).join(', ')}`, c: PAL.gold });
        const tip = itemTip(list[i].it, { foot: 'Click to take it back' });
        (tip.lines ?? (tip.lines = [])).push(...ls);
        return tip;
    }

    update () {
        const me = this.ctx.me();
        const k = JSON.stringify([me.inv, me.equip, me.satchel, me.level, this.held, this.rot, this.hover]);
        if (k === this.key) return;
        this.key = k;
        const worn = RING_SLOTS.map((r) => me.equip[r]);
        RING_SLOTS.forEach((r, i) => this.fingers[r].set(worn[i] ? { icon: `i_${worn[i]}`, rarity: ITEMS[worn[i]!].rarity } : { icon: 'i_ring_copper', dim: true }));
        // what it all gives
        const list = me.satchel ?? [], res = satchelResult(relicOf, list, ringTags(me));
        const text: string[] = [];
        const rb = ringBonuses(worn);
        if (rb.length) text.push('Rings', ...rb.map((l) => '  ' + l));
        const sb = lines(res.mods);
        if (sb.length) text.push('Satchel', ...sb.map((l) => '  ' + l));
        if (res.combos.length) text.push('Combos', ...[...new Set(res.combos.map((c) => `  ${c.name}: ${lines(c.mods).join(', ')}`))]);
        this.bonus.setText(text.length ? text.join('\n') : 'Nothing yet. Wear a ring, lay a relic.');
        // the carried
        const owned = ITEM_ORDER.filter((id) => (ITEMS[id].gear?.slot === 'ring' || ITEMS[id].relic) && countOf(me, id) > 0);
        if (this.held && countOf(me, this.held) < 1) this.held = null;
        const items: GridItem[] = owned.map((id) => ({
            data: { icon: `i_${id}`, count: countOf(me, id), rarity: ITEMS[id].rarity, ...(this.held === id ? {} : {}) },
            tip: () => itemTip(id, { count: countOf(me, id), foot: ITEMS[id].relic ? 'Click to pick it up, then click a cell' : 'Click to wear it' }),
            click: () => { if (ITEMS[id].relic) this.held = this.held === id ? null : id; else this.ctx.send({ t: 'equip', item: id }); this.key = ''; },
        }));
        this.grid.setItems(items);
        this.drawSatchel(me, res);
        this.satTitle.setRight(this.held ? `holding ${ITEMS[this.held].name}${this.rot ? ' (turned)' : ''}` : `${list.length} laid`);
        this.foot.setInfo(`${worn.filter(Boolean).length} / ${RING_SLOTS.length} rings`);
    }

    private drawSatchel (me: ReturnType<ScreenCtx['me']>, res: ReturnType<typeof satchelResult>) {
        const g = this.sg, dim = satchelDims(me.level), list = me.satchel ?? [];
        const ox = this.gx, oy = this.gy;
        g.clear();
        for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
            const inside = x < dim.w && y < dim.h;
            g.fillStyle(inside ? 0x35305c : 0x2a1d2c, inside ? 0.9 : 0.35).fillRect(ox + x * CELL + 1, oy + y * CELL + 1, CELL - 2, CELL - 2);
            if (!inside) g.lineStyle(1, 0x666b86, 0.4).strokeRect(ox + x * CELL + 3, oy + y * CELL + 3, CELL - 6, CELL - 6);
        }
        // the laid relics
        list.forEach((r, i) => {
            const d = relicOf(r.it); if (!d) return;
            const cs = cellsOf(d.size, r.x, r.y, r.r), col = TAG_INFO[d.tag].color;
            for (const [x, y] of cs) g.fillStyle(col, 0.35).fillRect(ox + x * CELL + 2, oy + y * CELL + 2, CELL - 4, CELL - 4).lineStyle(2, col, 0.95).strokeRect(ox + x * CELL + 2, oy + y * CELL + 2, CELL - 4, CELL - 4);
            const lit = res.each[i]?.mult ?? 1;
            if (lit > 1) for (const [x, y] of cs) g.lineStyle(1, 0xffffff, 0.5).strokeRect(ox + x * CELL + 5, oy + y * CELL + 5, CELL - 10, CELL - 10);
        });
        // the touching: a gold bar where a combo is, a soft one in the tag's colour where two of a kind meet
        const mid = (i: number) => { const r = list[i], d = relicOf(r.it)!, cs = cellsOf(d.size, r.x, r.y, r.r); return [ox + (cs.reduce((a, c) => a + c[0], 0) / cs.length + 0.5) * CELL, oy + (cs.reduce((a, c) => a + c[1], 0) / cs.length + 0.5) * CELL]; };
        for (const [a, b] of res.links) {
            const [x1, y1] = mid(a), [x2, y2] = mid(b), combo = res.combos.some((c) => c.a === a && c.b === b);
            g.lineStyle(combo ? 4 : 3, combo ? 0xffd966 : TAG_INFO[relicOf(list[a].it)!.tag].color, combo ? 0.95 : 0.6).lineBetween(x1, y1, x2, y2);
        }
        // the icons
        let n = 0;
        list.forEach((r) => {
            const d = relicOf(r.it); if (!d) return;
            const cs = cellsOf(d.size, r.x, r.y, r.r);
            const cx = ox + (cs.reduce((a, c) => a + c[0], 0) / cs.length + 0.5) * CELL, cy = oy + (cs.reduce((a, c) => a + c[1], 0) / cs.length + 0.5) * CELL;
            let im = this.icons[n]; if (!im) { im = this.win.put(this.ctx.scene.add.image(0, 0, '__DEFAULT', 0).setScale(2), 0, 0) as Phaser.GameObjects.Image; this.icons.push(im); }
            im.setTexture(`i_${r.it}`, 0).setPosition(cx, cy).setVisible(true);
            n++;
        });
        for (; n < this.icons.length; n++) this.icons[n].setVisible(false);
        // the ghost of what is held, green where it fits and red where it does not
        if (this.held && this.hover) {
            const d = relicOf(this.held)!, ok = fits(relicOf, dim, list, this.held, this.hover[0], this.hover[1], this.rot ? 1 : undefined);
            for (const [x, y] of cellsOf(d.size, this.hover[0], this.hover[1], this.rot ? 1 : undefined)) {
                if (x >= 5 || y >= 5) continue;
                g.fillStyle(ok ? 0x92d364 : 0xe85d62, 0.45).fillRect(ox + x * CELL + 2, oy + y * CELL + 2, CELL - 4, CELL - 4);
            }
        }
    }

    destroy () { this.win.destroy(); }
}
