// The parts every window is put together from: TabBar, Pager, CostList, StatList, rowBox, the item Slot, SearchBox,
// QtyChips and the slider. kit.ts re-exports them, so screens import everything from there.

import * as Phaser from 'phaser';
import { css, PAL } from '../../shared/palette';
import { isTouchUi } from '../input/layout';
import { logical } from '../res';
import { Qty, qtyLabel } from './gestures';
import { bar as pxBar, hex, inset, rect, slotBox, STYLES } from './px';
import { PAPER, TEXT, WOOD } from './theme';
import { BTN_H, button, FONT_TEXT, icon, label, shrinkToFit, smallScreen, textWidth, ts, type Btn } from './kit';
import { tipOn, type TipData } from './tooltip';
import type { Win } from './win';

type Text = Phaser.GameObjects.Text;

/**
 * The x1 / x10 / All chips of a window on a phone: the quantity a plain tap on an item then moves (a computer has Shift
 * and right-click for that). `value` is read by the window's item list (ItemGrid.qty).
 */
export class QtyChips {
    value: Qty;
    private btns: Btn[] = [];

    constructor (win: Win, x: number, y: number, private opts: Qty[], initial: Qty, w = 50) {
        this.value = initial;
        opts.forEach((q, i) => {
            const b = button(win.scene, 0, 0, w, 30, qtyLabel(q), () => { this.value = q; this.sync(); }, { style: STYLES.dark, size: 13, ink: false, sfx: false });
            win.put(b.root, x + w / 2 + i * (w + 6), y);
            this.btns.push(b);
        });
        this.sync();
    }

    /** Width of the whole row (for the text that sits beside it). */
    get width () { return this.opts.length * 56 - 6; }

    setVisible (on: boolean) {
        for (const b of this.btns) { b.root.setVisible(on); if (b.zone.input) b.zone.input.enabled = on; }
    }

    private sync () { this.opts.forEach((q, i) => this.btns[i].setStyle(q === this.value ? STYLES.gold : STYLES.dark)); }
}

// ── tabs, pager, cost rows, stat rows: the parts every window is put together from ──────────────────────────────────────
export interface TabDef { id: string; label: string; icon?: string; iconScale?: number }

/** A row of tab buttons (the current one gold) for a window's toolbar. Picking one calls `onPick`. */
export class TabBar {
    private btns = new Map<string, Btn>();
    private wd = new Map<string, number>();
    private order: string[];
    private marks = new Map<string, number>();
    private markG: Phaser.GameObjects.Graphics;
    /** The width of the whole row, so a search box can sit at the right of it. */
    width = 0;
    current: string;

    constructor (private win: Win, private x: number, private cy: number, tabs: TabDef[], current: string, private onPick: (id: string) => void, o: { maxW?: number; minW?: number; tip?: (id: string) => TipData | null } = {}) {
        this.current = current;
        const s = win.scene, touch = isTouchUi(), size = touch ? 14 : 13;
        const min = o.minW ?? (touch ? 76 : 64);
        this.markG = win.put(s.add.graphics(), 0, 0);
        let ws = tabs.map((t) => Math.max(min, Math.ceil(textWidth(s, t.label, size, true)) + 24 + (t.icon ? 22 * (t.iconScale ?? 2) / 2 : 0)));
        const total = () => ws.reduce((a, b) => a + b, 0) + (tabs.length - 1) * 4;
        if (o.maxW && total() > o.maxW) { const k = (o.maxW - (tabs.length - 1) * 4) / ws.reduce((a, b) => a + b, 0); ws = ws.map((v) => Math.floor(v * k)); }
        tabs.forEach((t, i) => {
            const b = button(s, 0, 0, ws[i], BTN_H, t.label, () => this.pick(t.id), { style: STYLES.dark, size, icon: t.icon, iconScale: t.iconScale });
            win.put(b.root, x, cy);
            if (o.tip) tipOn(b.zone, () => o.tip!(t.id));
            this.btns.set(t.id, b);
            this.wd.set(t.id, ws[i]);
        });
        this.order = tabs.map((t) => t.id);
        this.layout();
    }

    /** Lay the tabs out left to right; only the ones in `ids` (default: all of them) are shown. */
    layout (ids: string[] = this.order) {
        let px = this.x;
        this.shown = ids;
        for (const [id, b] of this.btns) {
            const on = ids.includes(id);
            b.root.setVisible(on);
            if (b.zone.input) b.zone.input.enabled = on;
        }
        for (const id of ids) {
            const b = this.btns.get(id)!, w = this.wd.get(id)!;
            this.win.at(b.root, px + w / 2, this.cy);
            px += w + 4;
        }
        this.width = Math.max(0, px - this.x - 4);
        this.sync();
    }
    private shown: string[] = [];

    private pick (id: string) {
        if (id === this.current) return;
        this.current = id;
        this.sync();
        this.onPick(id);
    }

    /** Change the current tab without calling `onPick`. */
    set (id: string) { if (id !== this.current) { this.current = id; this.sync(); } }
    setLabel (id: string, text: string) { this.btns.get(id)?.setLabel(text); }
    setEnabled (id: string, on: boolean) { this.btns.get(id)?.setEnabled(on); }
    /** A tab that is not available right now looks faded (it can still be picked). */
    setDim (id: string, on: boolean) { this.btns.get(id)?.root.setAlpha(on ? 0.7 : 1); }
    /** A small coloured dot on a tab (green for "you can use this one"); `null` takes it off. */
    setMark (id: string, color: number | null) {
        if (color === null) this.marks.delete(id); else this.marks.set(id, color);
        this.drawMarks();
    }
    setVisible (on: boolean) { for (const b of this.btns.values()) { b.root.setVisible(on); if (b.zone.input) b.zone.input.enabled = on; } if (on) this.layout(this.shown); }
    private sync () { for (const [id, b] of this.btns) b.setStyle(id === this.current ? STYLES.gold : STYLES.dark); this.drawMarks(); }
    private drawMarks () {
        const g = this.markG;
        g.clear();
        this.win.root.bringToTop(g);          // (over the buttons)
        for (const [id, c] of this.marks) {
            const b = this.btns.get(id);
            if (!b || !b.root.visible) continue;
            // at the tab's top-right corner, past the label (which runs nearly to the edge of a tight tab)
            const bh = isTouchUi() ? Math.max(BTN_H, 36) : BTN_H;
            const x = b.root.x + this.win.w / 2 + this.wd.get(id)! / 2 - 5, y = b.root.y + this.win.h / 2 - bh / 2 + 5;
            g.fillStyle(PAL.ink, 1).fillCircle(x, y, 4.5);
            g.fillStyle(c, 1).fillCircle(x, y, 3.2);
        }
    }
}

/** "◀ 1 / 3 ▶" for a list that runs over several pages; hidden while one page is enough. */
export class Pager {
    private btns: Btn[];
    private t: Text;

    constructor (win: Win, cx: number, cy: number, onStep: (d: -1 | 1) => void) {
        const s = win.scene, touch = isTouchUi(), bw = touch ? 44 : 36;
        this.btns = (['◀', '▶'] as const).map((l, i) => {
            const b = button(s, 0, 0, bw, BTN_H, l, () => onStep(i ? 1 : -1), { style: STYLES.dark, size: 13 });
            win.put(b.root, cx + (i ? 1 : -1) * (bw / 2 + 36), cy);
            return b;
        });
        this.t = win.text('', cx, cy, ts('cap'), PAL.pebble, { origin: [0.5, 0.5], bold: false });
        this.set(0, 1);
    }

    set (page: number, pages: number) {
        const on = pages > 1;
        this.t.setVisible(on).setText(`${page + 1} / ${pages}`);
        this.btns.forEach((b, i) => { b.root.setVisible(on); b.setEnabled(i ? page < pages - 1 : page > 0); });
    }
}

interface CostRow { /** An item or `coin`: its picture. */ res: string; name: string; have: number; need: number }

/**
 * What something costs, as rows that show what you have against what it needs: green when there is enough, red when not.
 * The same everywhere (Craft, Build, the altar's sigil, blueprints).
 */
export class CostList {
    private g: Phaser.GameObjects.Graphics;
    private rows: { im: Phaser.GameObjects.Image; name: Text; num: Text }[] = [];
    private cols: number;
    private base: number;
    /** The height of one row. */
    readonly pitch = smallScreen() ? 30 : 26;

    /** `cols`: 2 puts the rows in two columns (the rows run left to right, then down). */
    constructor (private win: Win, private x: number, private y: number, private w: number, max = 6, o: { cols?: number } = {}) {
        this.cols = o.cols ?? 1;
        this.g = win.put(win.scene.add.graphics(), 0, 0);
        for (let i = 0; i < max; i++) {
            const im = win.put(icon(win.scene, 'i_wood', 0, 0, 2).setVisible(false), 0, 0);
            const name = win.text('', 0, 0, ts('body'), PAL.cream);
            const num = win.text('', 0, 0, ts('body'), PAL.cream, { origin: [1, 0] });
            this.rows.push({ im, name, num });
        }
        this.base = ts('body');
    }

    /** Show these rows (from y downward); returns the height used. */
    set (rows: CostRow[], y = this.y) {
        const g = this.g;
        g.clear();
        const p = this.pitch, rw = Math.floor((this.w - (this.cols - 1) * 8) / this.cols);
        this.rows.forEach((r, i) => {
            const c = rows[i];
            r.im.setVisible(!!c); r.name.setVisible(!!c); r.num.setVisible(!!c);
            if (!c) return;
            const ok = c.have >= c.need, col = i % this.cols, rx = this.x + col * (rw + 8), ry = y + Math.floor(i / this.cols) * p;
            rect(g, rx, ry, rw, p - 4, ok ? PAL.pine : PAL.bark, 0.28);
            r.im.setTexture(c.res === 'coin' ? 'i_coin' : `i_${c.res}`, 0);
            this.win.at(r.im, rx + 18, ry + (p - 4) / 2);
            r.num.setFontSize(this.base).setText(`${c.have} / ${c.need}`).setColor(hex(ok ? PAL.lime : PAL.berry));
            r.name.setFontSize(this.base).setText(c.name);
            shrinkToFit(r.name, rw - 38 - Math.ceil(r.num.width) - 14, 10);
            this.win.at(r.name, rx + 36, ry + (p - 4) / 2 - r.name.height / 2);
            this.win.at(r.num, rx + rw - 8, ry + (p - 4) / 2 - r.num.height / 2);
        });
        return Math.ceil(rows.length / this.cols) * p;
    }

    setVisible (on: boolean) { this.g.setVisible(on); for (const r of this.rows) { r.im.setVisible(on); r.name.setVisible(on); r.num.setVisible(on); } }
}

/** Rows of "label … value": the label at the left, the value at the right, a faint rule between. */
export class StatList {
    private g: Phaser.GameObjects.Graphics;
    private names: Text[] = [];
    private vals: Text[] = [];

    constructor (win: Win, x: number, y: number, w: number, pitch: number, labels: string[], size = ts('body')) {
        this.g = win.put(win.scene.add.graphics(), 0, 0);
        labels.forEach((l, i) => {
            this.names.push(win.text(l, x, y + i * pitch + 1, size, PAL.pebble, { bold: false }));
            this.vals.push(win.text('', x + w, y + i * pitch + 1, size, PAL.cream, { origin: [1, 0], font: 'head' }));
            rect(this.g, x, y + (i + 1) * pitch - 2, w, 1, PAL.slate, 0.22);
        });
    }

    set (i: number, value: string, color: number = PAL.cream) { this.vals[i].setText(value).setColor(hex(color)); }
}

/** A list row's frame: a recess that is lit when picked, tinted red when something is wrong. */
export function rowBox (g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, o: { on?: boolean; bad?: boolean; off?: boolean; accent?: number } = {}) {
    inset(g, x, y, w, h, o.off ? PAL.ink : o.on ? PAL.dusk : PAL.night, o.on ? (o.accent ?? PAL.gold) : o.bad ? PAL.pumpkin : PAL.slate);
}

export function lighten (c: number, amt = 0.18) {
    const r = Math.min(255, ((c >> 16) & 255) + 255 * amt), g = Math.min(255, ((c >> 8) & 255) + 255 * amt), b = Math.min(255, (c & 255) + 255 * amt);
    return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

// ── item slot ──────────────────────────────────────────────────────────────
export interface SlotData { icon: string; count?: number; rarity?: number; dim?: boolean; badge?: string; bad?: boolean; overlay?: string; scale?: number }

export class Slot {
    readonly root: Phaser.GameObjects.Container;
    private g: Phaser.GameObjects.Graphics;
    private im: Phaser.GameObjects.Image;
    private cnt: Text;
    private badge: Text;
    private ov: Phaser.GameObjects.Image;
    private baseScale: number;
    private zone: Phaser.GameObjects.Zone;
    private data: SlotData | null = null;
    private hover = false;
    selected = false;

    constructor (scene: Phaser.Scene, x: number, y: number, readonly size = 44, o: { iconScale?: number } = {}) {
        this.g = scene.add.graphics();
        this.im = scene.add.image(size / 2, size / 2 - 1, '__DEFAULT', 0).setVisible(false).setScale(o.iconScale ?? Math.max(1, Math.floor((size - 10) / 14)));
        this.cnt = label(scene, size - 3, size - 3, '', 12, PAL.cream, { origin: [1, 1], stroke: 3 });
        this.baseScale = o.iconScale ?? Math.max(1, Math.floor((size - 10) / 14));
        this.badge = label(scene, 3, 2, '', 11, PAL.gold, { stroke: 3 });
        this.ov = scene.add.image(size - 8, 8, '__DEFAULT', 0).setVisible(false);
        this.zone = scene.add.zone(0, 0, size, size).setOrigin(0).setInteractive({ useHandCursor: true });
        this.root = scene.add.container(x, y, [this.g, this.im, this.cnt, this.badge, this.ov, this.zone]);
        this.zone.on('pointerover', () => { this.hover = true; this.draw(); });
        this.zone.on('pointerout', () => { this.hover = false; this.draw(); });
        this.draw();
    }

    get interactive () { return this.zone; }

    /** Show this (or nothing). The hotbar sets its slots every frame, so the same thing again costs nothing: only what changed is touched. */
    set (d: SlotData | null) {
        const o = this.data;
        if (!d && !o) return;
        if (d && o && d.icon === o.icon && d.count === o.count && d.rarity === o.rarity && d.dim === o.dim && d.badge === o.badge && d.bad === o.bad && d.overlay === o.overlay && d.scale === o.scale) return;
        const boxChanged = !d !== !o || (d?.rarity ?? 0) !== (o?.rarity ?? 0);
        this.data = d;
        if (d) {
            if (this.im.texture.key !== d.icon) this.im.setTexture(d.icon, 0);
            this.im.setVisible(true).setAlpha(d.dim ? 0.35 : 1).setScale(d.scale ?? this.baseScale);
            if (d.overlay) { if (this.ov.texture.key !== d.overlay) this.ov.setTexture(d.overlay, 0); this.ov.setVisible(true); } else this.ov.setVisible(false);
            this.cnt.setText(d.count && d.count > 1 ? `${d.count}` : '');
            if (!!d.bad !== !!o?.bad) this.cnt.setColor(hex(d.bad ? PAL.berry : PAL.cream));       // (setColor draws the text again even when the colour is the same)
            this.badge.setText(d.badge ?? '');
        } else {
            this.im.setVisible(false);
            this.ov.setVisible(false);
            this.cnt.setText('');
            this.badge.setText('');
        }
        if (boxChanged) this.draw();
    }

    setSelected (on: boolean) { if (this.selected === on) return; this.selected = on; this.draw(); }
    get empty () { return !this.data; }

    private draw () {
        this.g.clear();
        slotBox(this.g, 0, 0, this.size, this.data?.rarity ?? 0, { hover: this.hover, empty: !this.data, selected: this.selected });
    }
}

// ── search ─────────────────────────────────────────────────────────────────
/**
 * A search field for a window: type to filter what the window lists. It is a real text input floating over
 * the page (so phones get their keyboard), and it swallows key presses so typing never triggers hotkeys.
 * Click it, or press / in the window, to type. Esc clears it, then lets go.
 */
export class SearchBox {
    readonly el: HTMLInputElement;
    private dom: Phaser.GameObjects.DOMElement;
    /** What is typed, trimmed and lower-case. */
    value = '';

    constructor (win: Win, x: number, y: number, w: number, private onChange: (q: string) => void, placeholder = 'Search…  ( / )') {
        const el = document.createElement('input');
        el.type = 'text'; el.placeholder = placeholder; el.maxLength = 30; el.spellcheck = false; el.autocomplete = 'off';
        const touch = isTouchUi();
        Object.assign(el.style, {
            width: `${w}px`, height: touch ? '34px' : `${BTN_H}px`, boxSizing: 'border-box', padding: '0 9px', font: `${touch ? 19 : 15}px ${FONT_TEXT}`,
            color: css(TEXT.ink), background: css(PAPER.hi), border: `3px solid ${css(WOOD[1])}`, borderRadius: '4px', outline: 'none',
        });
        el.addEventListener('keydown', (ev) => {
            ev.stopPropagation();
            if (ev.key === 'Escape') { if (el.value) { el.value = ''; this.set(''); } else el.blur(); }
            else if (ev.key === 'Enter') el.blur();
        });
        el.addEventListener('input', () => this.set(el.value));
        this.el = el;
        this.dom = win.scene.add.dom(win.x + x, win.y + y, el).setOrigin(0, 0.5).setDepth(20);
    }

    /** Keep a window's extra camera from drawing this field (a DOM element is placed by the LAST camera that draws it). */
    hideFrom (cam: Phaser.Cameras.Scene2D.Camera) { cam.ignore(this.dom); }
    private set (v: string) { this.value = v.trim().toLowerCase(); this.onChange(this.value); }
    /** Does any of these names contain what was typed? (Everything matches an empty search.) */
    matches (...names: (string | undefined)[]) { return !this.value || names.some((n) => !!n && n.toLowerCase().includes(this.value)); }
    focus () { this.el.focus(); this.el.select(); }
    destroy () { this.dom.destroy(); }
}

// ── slider ─────────────────────────────────────────────────────────────────
export function slider (scene: Phaser.Scene, x: number, y: number, w: number, value: number, onChange: (v: number) => void, color: number = PAL.gold) {
    const g = scene.add.graphics();
    const zone = scene.add.zone(0, -10, w + 16, 22).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    const root = scene.add.container(x, y, [g, zone]);
    let v = value, drag = false;
    const draw = () => {
        g.clear();
        pxBar(g, 0, -4, w, 8, v, color);
        const kx = Math.round(4 + (w - 8) * v);
        rect(g, kx - 4, -9, 8, 18, WOOD[0]);
        rect(g, kx - 3, -8, 6, 16, PAPER.base);
        rect(g, kx - 3, -8, 6, 3, 0xffffff, 0.6);
        rect(g, kx - 3, 6, 6, 2, PAPER.edge);
    };
    const setFrom = (p: Phaser.Input.Pointer) => {
        const local = logical(p).x - root.getWorldTransformMatrix().tx;
        v = Math.max(0, Math.min(1, (local - 4) / (w - 8)));
        draw(); onChange(v);
    };
    // the scene-wide move listener lives only for the length of one drag (a window opened again and again must not pile them up)
    const move = (p: Phaser.Input.Pointer) => { if (drag && p.isDown) setFrom(p); };
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (drag) return;
        drag = true; setFrom(p);
        scene.input.on('pointermove', move);
        scene.input.once('pointerup', () => { drag = false; scene.input.off('pointermove', move); });
    });
    draw();
    return { root, set (nv: number) { v = nv; draw(); } };
}

