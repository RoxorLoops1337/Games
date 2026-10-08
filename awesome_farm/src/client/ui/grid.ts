// A scrollable grid of item slots (virtual: a fixed pool of Slots shows a window of items).

import * as Phaser from 'phaser';
import { PAL } from '../../shared/palette';
import { onTap, QtyChips, Slot, SlotData, TipData, tipOn, ts, Win } from './kit';
import { inset, rect } from './px';
import type { Qty } from './gestures';

export interface GridItem {
    data: SlotData;
    tip?: () => TipData | null;
    /** `shift`: Shift was held (a computer). `qty`: the window's x1 / x10 / All chip (a phone), if it has chips. */
    click?: (shift: boolean, qty?: Qty) => void;
    /** Right-click on a computer, a long press on a phone. */
    right?: () => void;
    /** No right-click action, but Shift does something: a long press on a phone does that (click with shift held). */
    holdIsShift?: boolean;
}

export class ItemGrid {
    private slots: Slot[] = [];
    private items: GridItem[] = [];
    private offset = 0;                       // first visible row
    private bar: Phaser.GameObjects.Graphics;
    private empty: Phaser.GameObjects.Text | null = null;
    /** The window's quantity chips (phones): what a plain tap moves. */
    qty?: QtyChips;
    readonly px: number;
    readonly py: number;
    readonly w: number;
    readonly h: number;

    constructor (private win: Win, x: number, y: number, readonly cols: number, readonly rows: number, readonly size = 44, readonly gap = 4, emptyText = '') {
        this.px = x; this.py = y;
        this.w = cols * (size + gap) - gap + 10;
        this.h = rows * (size + gap) - gap;
        this.bar = win.scene.add.graphics();
        win.put(this.bar, x + this.w - 6, y);
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const slot = new Slot(win.scene, 0, 0, size);
                win.putAt(slot.root, x + c * (size + gap), y + r * (size + gap));
                const i = r * cols + c;
                const at = () => this.items[this.offset * cols + i];
                onTap(slot.interactive, (shift) => at()?.click?.(shift, this.qty?.value), () => { const it = at(); if (it?.right) it.right(); else if (it?.holdIsShift) it.click?.(true, this.qty?.value); }, () => { const it = at(); return !!it && (!!it.right || !!it.holdIsShift); });
                tipOn(slot.interactive, () => this.items[this.offset * cols + i]?.tip?.() ?? null);
                this.slots.push(slot);
            }
        }
        if (emptyText) {
            this.empty = win.text(emptyText, x + (this.w - 10) / 2, y + this.h / 2, ts('body'), PAL.pebble, { origin: [0.5, 0.5], align: 'center', bold: false, wrap: Math.max(120, this.w - 40) }).setVisible(false);
        }
    }

    /** How many columns and rows of slots fit in a rectangle (a scroll bar takes 10 from the width). */
    static fit (w: number, h: number, size = 44, gap = 4) {
        return { cols: Math.max(1, Math.floor((w - 10 + gap) / (size + gap))), rows: Math.max(1, Math.floor((h + gap) / (size + gap))) };
    }

    /** What the empty grid says ("Nothing of this kind" while a filter is on, the usual words otherwise). */
    setEmptyText (s: string) { if (this.empty && this.empty.text !== s) this.empty.setText(s); }

    get totalRows () { return Math.max(1, Math.ceil(this.items.length / this.cols)); }

    setItems (items: GridItem[]) {
        this.items = items;
        this.offset = Math.min(this.offset, Math.max(0, this.totalRows - this.rows));
        this.refresh();
    }

    scroll (dy: number) {
        const max = Math.max(0, this.totalRows - this.rows);
        const next = Math.max(0, Math.min(max, this.offset + Math.sign(dy)));
        if (next !== this.offset) { this.offset = next; this.refresh(); }
    }

    contains (x: number, y: number) {
        const lx = x - this.win.x, ly = y - this.win.y;
        return lx >= this.px && lx <= this.px + this.w && ly >= this.py && ly <= this.py + this.h;
    }

    private refresh () {
        const start = this.offset * this.cols;
        // nothing to list and something to say about it: the words take the place of a field of empty slots
        const none = !!this.empty && this.items.length === 0;
        // rows past the items are not shown, but one empty row after the last item (so a thing can be put there), and every row of a grid with no words
        const left = this.items.length - start;
        const shown = none ? 0 : this.items.length === 0 ? this.rows : Math.min(this.rows, Math.ceil(Math.max(0, left) / this.cols) + 1);
        this.slots.forEach((slot, i) => {
            slot.set(this.items[start + i]?.data ?? null);
            const on = i < shown * this.cols;
            slot.root.setVisible(on);
            if (slot.interactive.input) slot.interactive.input.enabled = on;
        });
        this.empty?.setVisible(none);
        // scrollbar
        const g = this.bar;
        g.clear();
        const total = this.totalRows;
        if (total > this.rows) {
            inset(g, 0, 0, 6, this.h, PAL.ink, PAL.night);
            const th = Math.max(12, Math.round((this.rows / total) * (this.h - 4)));
            const ty = 2 + Math.round((this.offset / (total - this.rows)) * (this.h - 4 - th));
            rect(g, 2, ty, 2, th, PAL.cream, 0.85);
        }
    }
}
