// The window: a framed modal in one of three sizes with the red ribbon title, the close button, sections (recessed panels
// with a heading) and ONE footer row. Everything a screen puts in it is panel-local; see the house style in CLAUDE.md.

import * as Phaser from 'phaser';
import { PAL } from '../../shared/palette';
import { isTouchUi } from '../input/layout';
import { hex, panel, PanelStyle, rect, ribbon, STYLES } from './px';
import { PAPER, TEXT } from './theme';
import { BTN_H, button, GAP, H, icon, label, PAD, textWidth, ts, W, WIN_SIZES, type Btn, type LabelOpts, type Obj, type Placed, type Rect, type WinSize } from './kit';
import { hideTip } from './tooltip';

type Text = Phaser.GameObjects.Text;

// ── windows ────────────────────────────────────────────────────────────────
interface SectionOpts {
    /** The accent line inside the frame (a colour for a boss, an element…). */
    accent?: number;
    /** A value at the right of the heading, such as "12 / 40". */
    right?: string;
    /** Draw the frame on this graphics layer instead of the window's own (a tab's sections share one layer to hide with it). */
    layer?: Phaser.GameObjects.Graphics;
}
export interface Section {
    x: number; y: number; w: number; h: number;
    /** Where the content goes: inside the frame, under the heading. */
    inner: Rect;
    head: Text | null;
    right: Text | null;
    setRight (s: string, color?: number): void;
    setTitle (s: string): void;
    /** Show or hide the heading and its value (the frame belongs to the layer it was drawn on). */
    setVisible (on: boolean): void;
}
interface FootBtn { label: string; onClick: () => void; style?: PanelStyle; icon?: string; w?: number; ink?: boolean }
interface FooterOpts {
    /** The action this window is for: gold, bottom-right. */
    primary?: FootBtn;
    /** Variants of the primary action (x5, Max), just left of it. */
    extras?: FootBtn[];
    /** Back / cancel / the other things you can do: bottom-left. */
    secondary?: FootBtn[];
    /** A short note at the far left, such as how many coins you have. */
    info?: string;
    /** The room kept for it when its words change (about 12 units a letter). */
    infoW?: number;
    /** Small pebble text between: what to do next, or why the primary is greyed out. */
    hint?: string;
}
export interface Footer {
    primary?: Btn;
    extras: Btn[];
    secondary: Btn[];
    info: Text | null;
    hint: Text | null;
    setHint (s: string, color?: number): void;
    setInfo (s: string, color?: number): void;
}

interface WinOpts {
    /** One of the three house sizes (`small`, `medium`, `large`). `w` and `h` are for the one odd size left (the character creator, 700×410). */
    size?: WinSize;
    w?: number;
    h?: number;
    title: string;
    icon?: string;
    accent?: number;
    style?: PanelStyle;
    closeable?: boolean;
    /** One line under the title saying what the window is for (the content then starts a little lower). */
    sub?: string;
    onClose: () => void;
}

/** A framed modal window. Add children with `win.put(obj, x, y)` using panel-local coordinates. */
export class Win {
    readonly root: Phaser.GameObjects.Container;
    readonly g: Phaser.GameObjects.Graphics;       // panel-local drawing surface
    readonly w: number;
    readonly h: number;
    readonly x: number;
    readonly y: number;
    /** The padding around the content (16). */
    readonly pad = PAD;
    /** The first y under the title ribbon (and its one-line subtitle): a toolbar of tabs and search starts here. */
    readonly top: number;
    /** The height of a toolbar row. */
    readonly toolH: number;
    /** The height of the footer band at the bottom (its rule, and the buttons and hint inside). */
    readonly footH: number;
    private dim: Phaser.GameObjects.Rectangle;
    private extra: Obj[] = [];
    private footed = false;

    constructor (readonly scene: Phaser.Scene, o: WinOpts) {
        const dims = o.size ? WIN_SIZES[o.size] : { w: o.w ?? WIN_SIZES.medium.w, h: o.h ?? WIN_SIZES.medium.h };
        this.w = dims.w; this.h = dims.h;
        const touch = isTouchUi();
        // a one-line subtitle (two on a phone, where the words are bigger) hangs under the ribbon and pushes the content down
        const subT = o.sub ? label(scene, 0, 0, o.sub, ts('cap'), PAL.pebble, { origin: [0.5, 0], bold: false, wrap: dims.w - 200, align: 'center' }) : null;
        this.top = subT ? 24 + Math.ceil(subT.height) + (touch ? 12 : 8) : touch ? 44 : 38;
        this.toolH = touch ? 36 : BTN_H;
        this.footH = touch ? 62 : 54;
        this.x = Math.round((W - this.w) / 2); this.y = Math.max(16, Math.round((H - this.h) / 2));   // tall windows drop a little so the title ribbon stays on screen
        this.dim = scene.add.rectangle(0, 0, W, H, PAL.ink, 0.62).setOrigin(0).setInteractive().setDepth(10);
        this.dim.on('pointerdown', () => { /* swallow clicks outside */ });
        this.root = scene.add.container(this.x + this.w / 2, this.y + this.h / 2).setDepth(11);
        this.g = scene.add.graphics().setPosition(-this.w / 2, -this.h / 2);
        this.root.add(this.g);
        panel(this.g, 0, 0, this.w, this.h, { ...(o.style ?? STYLES.dark), shadow: true, r: 3 });
        // title ribbon: as wide as the title needs, with room for the picture left of the words (a short title keeps clear of it)
        const t = label(scene, this.w / 2, 1, o.title, ts('title'), TEXT.cream, { origin: [0.5, 0.5], dark: true, font: 'head' });
        const room = o.icon ? 46 : 26;
        const tw = Math.max(130, Math.ceil(t.width) + 2 * room + 14);
        ribbon(this.g, this.w / 2, 1, tw, 24);
        this.put(t, this.w / 2, 1);
        if (o.icon) {
            const fr = scene.textures.getFrame(o.icon, 0);
            const ix = this.w / 2 - t.width / 2 - 20;
            this.put(icon(scene, o.icon, ix, 1, Math.min(2, 22 / Math.max(fr.realWidth, fr.realHeight))), ix, 1);
        }
        if (subT) this.put(subT, this.w / 2, 24);
        if (o.closeable !== false) {
            const big = touch;
            const c = button(scene, this.w - 22, 14, big ? 38 : 24, big ? 38 : 24, '×', o.onClose, { style: STYLES.berry, size: big ? 22 : 16, ink: false });
            this.put(c.root, big ? this.w - 24 : this.w - 22, big ? 18 : 14);
        }
        // pop-in
        this.root.setScale(0.9).setAlpha(0);
        scene.tweens.add({ targets: this.root, scale: 1, alpha: 1, duration: 150, ease: 'Back.easeOut' });
        this.dim.setAlpha(0);
        scene.tweens.add({ targets: this.dim, alpha: 0.62, duration: 150 });
    }

    /** The content area between the ribbon and the footer (panel-local). Without a footer it runs to the bottom padding. */
    get body (): Rect {
        const bottom = this.footed ? this.h - this.footH - GAP : this.h - PAD;
        return { x: PAD, y: this.top, w: this.w - 2 * PAD, h: bottom - this.top };
    }

    /** The content area under the toolbar row (tabs and search sit in the row above it). */
    get under (): Rect {
        const b = this.body, dy = this.toolH + GAP + 2;
        return { x: b.x, y: b.y + dy, w: b.w, h: b.h - dy };
    }


    /**
     * A section: a recessed panel with a heading (and, at the right of it, a value such as a count). Returns the rectangle
     * inside it where the content goes. Draw everything that belongs to one idea in one section.
     */
    section (x: number, y: number, w: number, h: number, title?: string, o: SectionOpts = {}): Section {
        const gg = o.layer ?? this.g;
        panel(gg, x, y, w, h, { ...STYLES.deep, rim: o.accent ?? PAL.night });
        let head: Text | null = null, right: Text | null = null;
        const headH = title !== undefined || o.right !== undefined ? Math.round(ts('head') * 1.2) + 12 : 0;
        if (title !== undefined) head = this.text(title, x + 12, y + 8, ts('head'), PAL.cream, { font: 'head' });
        if (o.right !== undefined) right = this.text(o.right, x + w - 12, y + 9, ts('cap'), PAL.pebble, { origin: [1, 0], bold: false });
        if (headH) rect(gg, x + 10, y + headH - 2, w - 20, 1, PAPER.edge, 0.8);
        const top = headH ? headH + 4 : 8;       // (a section without a heading starts its content a little lower)
        const inner = { x: x + 10, y: y + top, w: w - 20, h: h - top - 10 };
        const sec: Section = {
            x, y, w, h, inner, head, right,
            setRight (s, c) { right?.setText(s); if (c !== undefined) right?.setColor(hex(c)); },
            setTitle (s) { head?.setText(s); },
            setVisible (on) { head?.setVisible(on); right?.setVisible(on); },
        };
        return sec;
    }

    /**
     * The footer row: the notes and secondary buttons on the left, the hint in between, the primary action (gold) on the
     * right with its variants (`extras`, such as x5 or Max) just before it. Same place in every window.
     */
    footer (o: FooterOpts = {}): Footer {
        this.footed = true;
        const s = this.scene, touch = isTouchUi(), cy = this.h - this.footH / 2 + 2;
        rect(this.g, PAD, this.h - this.footH, this.w - 2 * PAD, 1, PAPER.edge, 0.9);
        rect(this.g, PAD, this.h - this.footH + 1, this.w - 2 * PAD, 1, PAPER.hi, 0.7);
        const mk = (b: FootBtn, st: PanelStyle) => {
            const size = touch ? 15 : 14, w0 = b.w ?? Math.max(touch ? 84 : 76, Math.ceil(textWidth(s, b.label, size, true)) + 28 + (b.icon ? 24 : 0));
            const btn = button(s, 0, 0, w0, BTN_H, b.label, b.onClick, { style: b.style ?? st, size, icon: b.icon, ink: b.ink });
            return { btn, w: w0 };
        };
        const out: Footer = {
            extras: [], secondary: [], info: null, hint: null,
            setHint: () => undefined, setInfo: () => undefined,
        };
        const lefts: { btn: Btn; w: number }[] = [], rights: { btn: Btn; w: number }[] = [];
        let right = this.w - PAD, left = PAD;
        if (o.primary) {
            const { btn, w } = mk(o.primary, STYLES.gold);
            this.put(btn.root, right - w / 2, cy);
            right -= w + GAP; out.primary = btn; rights.push({ btn, w });
        }
        for (const b of [...(o.extras ?? [])].reverse()) {
            const { btn, w } = mk(b, STYLES.dark);
            this.put(btn.root, right - w / 2, cy);
            right -= w + GAP; out.extras.unshift(btn); rights.push({ btn, w });
        }
        let infoW = 0;
        if (o.info !== undefined) {
            const t = this.text(o.info, left, cy, ts('body'), PAL.gold, { origin: [0, 0.5], font: 'head' });
            infoW = (o.infoW ?? Math.ceil(t.width)) + GAP * 2; left += infoW; out.info = t;
            out.setInfo = (str, c) => { t.setText(str); if (c !== undefined) t.setColor(hex(c)); };
        }
        for (const b of o.secondary ?? []) {
            const { btn, w } = mk(b, STYLES.dark);
            this.put(btn.root, left + w / 2, cy);
            left += w + GAP; out.secondary.push(btn); lefts.push({ btn, w });
        }
        // the hint takes the room between what is shown at the left and what is shown at the right (so hidden buttons give it back)
        const hint = this.text(o.hint ?? '', PAD, cy, ts('cap'), PAL.pebble, { origin: [0, 0.5], bold: false });
        const base = parseFloat(String(hint.style.fontSize));
        const room = this.footH - 10;
        out.hint = hint;
        out.setHint = (str, c) => {
            let l = PAD + infoW, r = this.w - PAD;
            for (const it of lefts) if (it.btn.root.visible) l += it.w + GAP;
            for (const it of rights) if (it.btn.root.visible) r -= it.w + GAP;
            hint.setX(Math.round(l - this.w / 2)).setWordWrapWidth(Math.max(60, r - l - GAP));
            hint.setFontSize(base).setText(str).setColor(hex(c ?? PAL.pebble));
            let px = base;
            while (hint.height > room && px > 10) hint.setFontSize(--px);
        };
        out.setHint(o.hint ?? '');
        return out;
    }


    /** Position an object at panel-local (x, y) and add it to the window. */
    put<T extends Placed> (obj: T, x: number, y: number): T {
        obj.setPosition(Math.round(x - this.w / 2), Math.round(y - this.h / 2));
        this.root.add(obj);
        return obj;
    }

    /** Reposition an object already in the window to panel-local (x, y). */
    at<T extends Placed> (obj: T, x: number, y: number): T {
        obj.setPosition(Math.round(x - this.w / 2), Math.round(y - this.h / 2));
        return obj;
    }

    /** Add an already-positioned container (its own children are panel-local) — offsets by -w/2,-h/2. */
    putAt<T extends Phaser.GameObjects.Container> (c: T, x: number, y: number): T {
        c.setPosition(Math.round(x - this.w / 2), Math.round(y - this.h / 2));
        this.root.add(c);
        return c;
    }

    /** Text on the page. A stroke (asked for by older screens) turns into the heading face; `dark` keeps it for text on a picture. */
    text (s: string, x: number, y: number, size = 14, color: number = PAL.cream, o: LabelOpts = {}) {
        const opts = o.stroke && !o.dark ? { ...o, stroke: undefined, font: o.font ?? ('head' as const) } : o;
        return this.put(label(this.scene, 0, 0, s, size, color, opts), x, y);
    }

    keep (o: Obj) { this.extra.push(o); return o; }

    destroy () {
        hideTip();
        this.scene.tweens.killTweensOf([this.root, this.dim]);
        this.root.destroy();
        this.dim.destroy();
        for (const o of this.extra) o.destroy();
    }
}

