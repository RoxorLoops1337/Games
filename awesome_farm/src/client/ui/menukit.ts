// The shared skeleton of the big meta screens (Esc menu, Journal, Guide, Skill tree, welcome card).
//
// Every one of them is the same page: a ribbon title and the close button (the window), a row of tabs, a header (what this is
// and what it is for), a body in a recessed well, and ONE footer row (a hint on the left, the buttons on the right). The pieces
// live here so the screens line up and read alike: the same tab strip, the same progress bars, the same reward chips and the
// same words for an empty page. Coordinates are window-local, for the large window (936 x 512).

import type * as Phaser from 'phaser';
import { ITEMS, iconOf } from '../../shared/data/items';
import type { Reward } from '../../shared/data/quests';
import { PAL } from '../../shared/palette';
import { isTouchUi } from '../input/layout';
import { button, fit, icon, label, onTap, Slot, tipOn, Win, WIN_SIZES, type Btn, type LabelOpts, type Obj, type TipData } from './kit';
import type { TabDef } from './parts';
import { bar, hex, inset, panel, rect, STYLES } from './px';
import { itemTip } from './tips';
import { PAPER, WOOD } from './theme';

type Text = Phaser.GameObjects.Text;

// ── sizes ────────────────────────────────────────────────────────────────────
/** The three window sizes: pick the smallest that fits and centre it. */
export const SIZE = WIN_SIZES;
export const PAD = 20;
/** Window-local y of the tab strip's centre, the page header's top, the body well, and the footer's centre line. */
export const TAB_Y = 42;
const HEAD_Y = 62;
export const BODY = { x: 16, y: 108, w: 904, h: 346 } as const;
const FOOT_Y = 484;
/** Buttons in rows and tabs, and the ones along the footer (a finger gets a bigger one: the kit draws at least 36). */
export const ROW_H = 28;
export const FOOT_H = 34;

// ── tabs ─────────────────────────────────────────────────────────────────────
/**
 * A row of tabs along the top of the page: left to right in a fixed order, the current one gold, a berry count on a tab that has
 * something waiting. `slots` keeps room for tabs a screen may gain later (the width is worked out for that many).
 */
export class TabStrip {
    private btns = new Map<string, Btn>();
    private badges = new Map<string, { root: Phaser.GameObjects.Container; t: Text }>();
    private cur = '';

    constructor (private win: Win, readonly tabs: TabDef[], private pick: (id: string) => void, o: { slots?: number; y?: number } = {}) {
        const s = win.scene, slots = Math.max(o.slots ?? tabs.length, tabs.length), gap = 6;
        // (a finger's close button is bigger and hangs lower: the last tab keeps clear of it)
        const tw = Math.min(150, Math.floor((win.w - 2 * PAD - (isTouchUi() ? 44 : 0) - gap * (slots - 1)) / slots));
        tabs.forEach((t, i) => {
            const b = button(s, 0, 0, tw, ROW_H, t.label, () => this.pick(t.id), { style: STYLES.dark, size: 13, ink: false });
            const x = PAD + tw / 2 + i * (tw + gap), y = o.y ?? TAB_Y;
            win.put(b.root, x, y);
            if (t.icon) {
                // the kit's own icon is as tall as a button: here a small glyph sits just left of the words
                const txt = b.root.list.find((c) => (c as Text).type === 'Text') as Text | undefined;
                if (txt) {
                    const half = (txt.width + 18) / 2;
                    txt.setX(Math.round(-half + 18 + txt.width / 2));
                    const im = icon(s, t.icon, Math.round(-half + 7), -1, 1);
                    b.root.addAt(im, 2);
                }
            }
            this.btns.set(t.id, b);
        });
    }

    /** Mark the current tab. */
    set (id: string) {
        this.cur = id;
        for (const [k, b] of this.btns) b.setStyle(k === id ? STYLES.gold : STYLES.dark);
    }
    get current () { return this.cur; }

    /** A count on a tab (0 removes it). */
    badge (id: string, n: number) {
        const b = this.btns.get(id);
        if (!b) return;
        let bd = this.badges.get(id);
        if (!bd) {
            const g = this.win.scene.add.graphics();
            g.fillStyle(PAL.ink, 1).fillCircle(0, 0, 9).fillStyle(PAL.berry, 1).fillCircle(0, 0, 7.5);
            const t = label(this.win.scene, 0, 0, '', 11, PAL.snow, { origin: [0.5, 0.5], dark: true, font: 'head', shadow: false });
            const root = this.win.scene.add.container(Math.round(b.w / 2 - 8), -ROW_H / 2 + 1, [g, t]);
            b.root.add(root);
            bd = { root, t };
            this.badges.set(id, bd);
        }
        bd.root.setVisible(n > 0);
        bd.t.setText(n > 99 ? '99' : `${n}`);
    }
}

// ── page header ──────────────────────────────────────────────────────────────
/** The title of the page, one line saying what it is for, and a count at the right. */
export class Header {
    private t: Text;
    private p: Text;
    private s: Text;

    constructor (win: Win, x = PAD, y = HEAD_Y) {
        this.t = win.text('', x, y, 20, PAL.gold, { font: 'head' });
        this.p = win.text('', x, y + 27, fit(12), PAL.pebble, { bold: false, wrap: win.w - 2 * PAD - 190 });
        this.s = win.text('', win.w - PAD, y + 5, 14, PAL.gold, { origin: [1, 0], font: 'head' });
    }

    set (title: string, purpose: string, summary = '', color: number = PAL.gold) {
        this.t.setText(title);
        this.p.setText(purpose);
        this.s.setText(summary).setColor(hex(color));
        return this;
    }
}

// ── a page you can wipe and rebuild ──────────────────────────────────────────
/**
 * The body of a tab: one Graphics for rectangles and every object put on it. `clear()` wipes it all so a tab can be rebuilt from
 * its data whenever that changes (the screens do this on a state key, never every frame).
 */
export class Pane {
    readonly g: Phaser.GameObjects.Graphics;
    private objs: Obj[] = [];

    constructor (readonly win: Win) {
        this.g = win.scene.add.graphics();
        win.put(this.g, 0, 0);
    }

    clear () {
        this.g.clear();
        for (const o of this.objs) o.destroy();
        this.objs = [];
    }

    add<T extends Obj> (o: T): T { this.objs.push(o); return o; }

    text (s: string, x: number, y: number, size = 12, color: number = PAL.cream, o: LabelOpts = {}) { return this.add(this.win.text(s, x, y, size, color, o)); }

    icon (key: string, x: number, y: number, scale = 1) { return this.add(this.win.put(icon(this.win.scene, key, 0, 0, scale), x, y)); }

    button (x: number, y: number, w: number, h: number, text: string, onClick: () => void, o: Parameters<typeof button>[7] = {}) {
        const b = button(this.win.scene, 0, 0, w, h, text, onClick, o);
        this.win.put(b.root, x, y);
        this.add(b.root);
        return b;
    }

    /** A hit area over (x, y, w, h): a tooltip while the pointer rests on it, `onClick` for a tap. */
    zone (x: number, y: number, w: number, h: number, tip?: () => TipData | null, onClick?: () => void, onOver?: () => void, onOut?: () => void) {
        const z = this.win.scene.add.zone(0, 0, w, h).setOrigin(0).setInteractive({ useHandCursor: !!onClick });
        this.win.put(z, x, y);
        if (tip) tipOn(z, tip);
        if (onOver) z.on('pointerover', onOver);
        if (onOut) z.on('pointerout', onOut);
        if (onClick) onTap(z, () => onClick());
        return this.add(z);
    }

    /** The recessed well a page sits in. */
    well (x: number, y: number, w: number, h: number, rim: number = PAL.night) { panel(this.g, x, y, w, h, { ...STYLES.deep, rim }); }

    /** A thin ruled line. */
    rule (x: number, y: number, w: number) { rect(this.g, x, y, w, 1, PAPER.edge, 0.9); }

    /** A sunken row or card (an `inset` with the same border colour rules everywhere): `hot` rims it in lime, `dim` fades it. */
    card (x: number, y: number, w: number, h: number, o: { hot?: boolean; gold?: boolean; dim?: boolean } = {}) {
        inset(this.g, x, y, w, h, o.dim ? PAL.ink : PAL.night, o.hot ? PAL.lime : o.gold ? PAL.gold : PAL.slate);
    }

    /** Progress, drawn one way everywhere: gold while it is under way, lime once it is complete, grey once it is banked. */
    meter (x: number, y: number, w: number, h: number, have: number, need: number, phase: Phase = 'todo') {
        bar(this.g, x, y, w, h, need > 0 ? have / need : 0, PHASE_COLOR[phase]);
    }

    /** "3 / 8" with its right edge at x: numbers line up down a column. */
    count (x: number, y: number, have: number, need: number, phase: Phase = 'todo', size = 12) {
        return this.text(`${Math.floor(have)} / ${need}`, x, y, size, phase === 'ready' ? PAL.lime : phase === 'done' ? PAL.pebble : PAL.cream, { origin: [1, 0], bold: false });
    }

    /** The tick box in front of an objective. */
    check (x: number, y: number, on: boolean) {
        rect(this.g, x, y, 16, 16, WOOD[0]);
        rect(this.g, x + 1, y + 1, 14, 14, on ? PAL.leaf : PAPER.deep);
        if (on) { rect(this.g, x + 4, y + 7, 3, 3, PAL.ink); rect(this.g, x + 6, y + 9, 5, 2, PAL.ink); rect(this.g, x + 8, y + 5, 2, 5, PAL.ink); }
    }

    /**
     * What you get, written the same way on every screen: coins, skill points and xp as little chips, then the items in slots.
     * Returns the x where it ends. `caption` (the word before it) is drawn unless it is null.
     */
    reward (x: number, y: number, r: Reward, o: { caption?: string | null; size?: number; slot?: number; items?: boolean } = {}): number {
        const size = o.size ?? 12;
        let cx = x;
        const cap = o.caption === undefined ? 'Reward' : o.caption;
        if (cap) { const t = this.text(cap, cx, y, size, PAL.pebble, { bold: false }); cx += t.width + 10; }
        const chip = (ic: string | null, text: string, color: number) => {
            if (ic) { this.icon(ic, cx + 7, y + 8, 1); cx += 19; }
            const t = this.text(text, cx, y, size, color, { font: 'head' });
            cx += t.width + 14;
        };
        if (r.coin) chip('k_coin', `${r.coin}`, PAL.gold);
        if (r.points) chip('k_star', `${r.points} skill point${r.points > 1 ? 's' : ''}`, PAL.gold);
        if (r.xp) chip(null, `${r.xp} xp`, PAL.plum);
        if (o.items !== false) {
            const sz = o.slot ?? 36;
            for (const [id, n] of r.items ?? []) {
                const sl = new Slot(this.win.scene, 0, 0, sz);
                sl.set({ icon: iconOf(id), count: n, rarity: ITEMS[id].rarity });
                this.win.putAt(sl.root, cx, y + 8 - sz / 2);
                this.add(sl.root);
                tipOn(sl.interactive, () => itemTip(id, { count: n, foot: 'Reward' }));
                cx += sz + 6;
            }
        }
        return cx;
    }
}

export type Phase = 'todo' | 'ready' | 'done';
const PHASE_COLOR: Record<Phase, number> = { todo: PAL.gold, ready: PAL.lime, done: PAL.pebble };

// ── empty pages ──────────────────────────────────────────────────────────────
/** Nothing here yet: say so, and say what to do about it. Centred on `cx`, starting at `y`. */
export function emptyState (pane: Pane, cx: number, y: number, w: number, ic: string, title: string, body: string) {
    pane.icon(ic, cx, y + 26, 4).setAlpha(0.6);
    pane.text(title, cx, y + 66, 16, PAL.gold, { origin: [0.5, 0], font: 'head' });
    pane.text(body, cx, y + 92, fit(12), PAL.pebble, { origin: [0.5, 0], align: 'center', wrap: w, bold: false });
}

// ── footer ───────────────────────────────────────────────────────────────────
/**
 * A footer button. `side` is the edge it hangs from; `offset` is how much of that edge the buttons already there use (their widths
 * and the gaps), so two on one side sit side by side. The primary action is gold and goes bottom right; a secondary one bottom left.
 */
export function footButton (win: Win, side: 'left' | 'right', w: number, text: string, onClick: () => void, o: { style?: typeof STYLES.gold; ink?: boolean; icon?: string; offset?: number } = {}): Btn {
    const b = button(win.scene, 0, 0, w, FOOT_H, text, onClick, { style: o.style ?? STYLES.gold, size: 14, ...(o.ink === undefined ? {} : { ink: o.ink }), ...(o.icon ? { icon: o.icon } : {}) });
    const off = o.offset ?? 0;
    win.put(b.root, side === 'right' ? win.w - PAD - off - w / 2 : PAD + off + w / 2, FOOT_Y);
    return b;
}

/** The left-over text of the footer: a hint in pebble between the buttons. `x` is its left edge, or its middle when centred. */
export function footHint (win: Win, x: number, w: number, centre = false) {
    return win.text('', x, FOOT_Y, fit(12), PAL.pebble, { origin: [centre ? 0.5 : 0, 0.5], bold: false, wrap: w, align: centre ? 'center' : 'left' });
}

/**
 * Previous / next with "2 / 5" between, hanging from the footer's right edge. `word` goes before the numbers ("Chapter 2 / 16");
 * `textW` is the room the words need, so the buttons sit just outside them.
 */
export class Pager {
    private prev: Btn;
    private next: Btn;
    private t: Text;
    private page = 0;
    private pages = 1;
    private on = true;

    constructor (win: Win, private change: (page: number) => void, o: { textW?: number } = {}) {
        const tw = o.textW ?? 64, bw = 44, gap = 6, y = FOOT_Y;
        const xNext = win.w - PAD - bw / 2, xText = xNext - bw / 2 - gap - tw / 2, xPrev = xText - tw / 2 - gap - bw / 2;
        const mk = (text: string, x: number, d: number) => {
            const b = button(win.scene, 0, 0, bw, FOOT_H, text, () => { if (this.on) this.go(this.page + d); }, { style: STYLES.dark, size: 14, ink: false });
            win.put(b.root, x, y);
            return b;
        };
        this.left = xPrev - bw / 2;
        this.prev = mk('◀', xPrev, -1);
        this.next = mk('▶', xNext, 1);
        this.t = win.text('', xText, y, 13, PAL.pebble, { origin: [0.5, 0.5], bold: false });
    }

    /** The x where the controls begin (what is left of this is free for a hint). */
    readonly left: number;

    private go (p: number) {
        const n = Math.max(0, Math.min(this.pages - 1, p));
        if (n !== this.page) { this.page = n; this.change(n); }
    }

    /** Show page `page` (0-based) of `pages`; one page or none hides the controls. */
    set (page: number, pages: number, word = '') {
        this.page = page; this.pages = Math.max(1, pages);
        this.on = pages > 1;
        for (const b of [this.prev, this.next]) { b.root.setVisible(this.on); b.zone.input!.enabled = this.on; }
        this.t.setVisible(this.on).setText(`${word ? word + ' ' : ''}${page + 1} / ${pages}`);
        this.prev.setEnabled(page > 0);
        this.next.setEnabled(page < pages - 1);
    }
}
