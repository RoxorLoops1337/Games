// The tooltip card, and the taps that drive it: tipOn (hover, or a tap on a phone), onTap (a press that starts and ends on
// the same thing; a long press with a filling ring is the right-click) and the one hold ring per scene.

import * as Phaser from 'phaser';
import { PAL } from '../../shared/palette';
import { isTouchUi } from '../input/layout';
import { playSfx } from '../juice/sfx';
import { logical, SS } from '../res';
import { HOLD_SECS, HOLD_SLOP, touchWords } from './gestures';
import { panel, STYLES } from './px';
import { fit, H, icon, label, smallScreen, W, type Obj } from './kit';

type Text = Phaser.GameObjects.Text;

// ── tooltip ────────────────────────────────────────────────────────────────
export interface TipLine { t: string; c?: number; size?: number }
export interface TipData {
    title: string;
    color?: number;
    sub?: string;
    subColor?: number;
    icon?: string;
    lines?: TipLine[];
    foot?: string;
}

export class Tooltip {
    private box: Phaser.GameObjects.Container;
    private shown = false;
    private lastKey = '';
    /** The card's size (the box is a container: it has none of its own). */
    private tw = 0;
    private th = 0;

    /** Is a card up right now? */
    get visible () { return this.shown; }

    constructor (private scene: Phaser.Scene) {
        this.box = scene.add.container(0, 0).setDepth(1000).setVisible(false);
    }

    show (d: TipData) {
        if (isTouchUi()) d = { ...d, sub: d.sub && touchWords(d.sub), foot: d.foot && touchWords(d.foot), lines: d.lines?.map((l) => ({ ...l, t: touchWords(l.t) })) };
        const key = JSON.stringify(d);
        if (this.shown && key === this.lastKey) return;
        this.lastKey = key;
        this.shown = true;
        this.box.removeAll(true);
        const s = this.scene;
        const pad = 11, iconW = d.icon ? 30 : 0;
        const items: Text[] = [];
        const big = smallScreen(), wrap = big ? 300 : 250;       // (a phone shows these small: bigger words, a wider card)
        const title = label(s, pad + iconW, pad, d.title, big ? fit(15) : 15, d.color ?? PAL.cream, { font: 'head' });
        items.push(title);
        let y = pad + title.height;
        if (d.sub) { const t = label(s, pad + iconW, y, d.sub, fit(11), d.subColor ?? PAL.pebble, { bold: false }); items.push(t); y += t.height; }
        y = Math.max(y, pad + (d.icon ? 26 : 0)) + 4;
        const body: Text[] = [];
        for (const l of d.lines ?? []) {
            const t = label(s, pad, y, l.t, fit(l.size ?? 12), l.c ?? PAL.cream, { bold: false, wrap });
            body.push(t); y += t.height + 1;
        }
        if (d.foot) { y += 3; const t = label(s, pad, y, d.foot, fit(11), PAL.pebble, { bold: false, wrap }); body.push(t); y += t.height; }
        const w = Math.max(title.x + title.width, ...(d.sub ? [items[1].x + items[1].width] : [0]), ...body.map((t) => t.x + t.width)) + pad;
        const h = y + pad;
        const g = s.add.graphics();
        panel(g, 0, 0, Math.ceil(w), Math.ceil(h), { ...STYLES.dark, shadow: true, r: 2 });
        this.box.add(g);
        if (d.icon) {
            // fitted into its box: a 2x2 building's art would otherwise cover the title
            const fr = s.textures.getFrame(d.icon, 0);
            this.box.add(icon(s, d.icon, pad + 13, pad + 12, Math.min(2, 26 / Math.max(fr.realWidth, fr.realHeight))));
        }
        this.box.add([...items, ...body]);
        this.box.setSize(w, h);
        this.tw = w; this.th = h;
        this.box.setVisible(true);
        this.follow(s.input.activePointer);
    }

    follow (p: Phaser.Input.Pointer) {
        if (!this.shown) return;
        const { tw, th } = this;
        const q = logical(p);
        let x = q.x + 16, y = q.y + 16;
        if (isTouchUi()) { x = q.x - tw / 2; y = q.y - th - 36; }       // a finger covers what is under it: show the card above
        if (x + tw > W - 4) x = q.x - tw - 12;
        if (y + th > H - 4) y = H - th - 4;
        this.box.setPosition(Math.max(4, Math.round(x)), Math.max(4, Math.round(y)));
    }

    hide () {
        if (!this.shown) return;
        this.shown = false;
        this.lastKey = '';
        this.box.setVisible(false);
    }
}

let tooltip: Tooltip | null = null;
export const setTooltip = (t: Tooltip | null) => { tooltip = t; };
export const hideTip = () => tooltip?.hide();

/**
 * Show a tooltip while the pointer is over `o` (must be interactive). `get` may return null for none. It is asked when the
 * pointer arrives and after a click (a click can change what the card says), not on every mouse move; an object whose
 * card depends on where over it the pointer is gives `sub`, a cheap key of the part under the pointer, and is asked again
 * when that changes.
 */
export function tipOn (o: Obj, get: () => TipData | null, sub?: () => unknown) {
    const show = () => { const d = get(); if (d) tooltip?.show(d); else tooltip?.hide(); };
    let at: unknown;
    o.on('pointerover', () => { at = sub?.(); show(); });
    if (sub) o.on('pointermove', () => { const k = sub(); if (k !== at) { at = k; show(); } });
    o.on('pointerout', () => tooltip?.hide());
    o.on('pointerup', () => { if (tooltip?.visible) show(); });
}

// ── input helper ───────────────────────────────────────────────────────────
/**
 * The ring that fills while a finger rests on an item: after HOLD_SECS it counts as a right-click. One per scene.
 * It is drawn around the fingertip (a finger hides what is under it), so the arc shows past its edge.
 */
class HoldRing {
    private g: Phaser.GameObjects.Graphics;
    private tw: Phaser.Tweens.Tween | null = null;

    constructor (private scene: Phaser.Scene) {
        this.g = scene.add.graphics().setDepth(1200).setVisible(false);
    }

    start (p: Phaser.Input.Pointer, done: () => void) {
        this.cancel();
        const q = logical({ x: p.downX, y: p.downY });
        const g = this.g.setVisible(true).setPosition(q.x, q.y);
        this.tw = this.scene.tweens.addCounter({
            from: 0, to: 1, duration: HOLD_SECS * 1000,
            onUpdate: (tw) => {
                if (!p.isDown || p.getDistance() > HOLD_SLOP * SS) { this.cancel(); return; }       // let go, or it turned into a scroll
                const f = tw.getValue() ?? 0;
                g.clear();
                g.fillStyle(PAL.ink, 0.28 * f).fillCircle(0, 0, 33);
                g.lineStyle(7, PAL.ink, 0.5 * Math.min(1, f * 4)).strokeCircle(0, 0, 33);
                g.lineStyle(4, PAL.gold, 1).beginPath().arc(0, 0, 33, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f, false).strokePath();
            },
            onComplete: () => {
                this.tw = null;
                g.clear().lineStyle(5, PAL.cream, 1).strokeCircle(0, 0, 33);
                this.scene.tweens.add({ targets: g, alpha: { from: 1, to: 0 }, scale: { from: 1, to: 1.5 }, duration: 160, onComplete: () => { g.setVisible(false).setAlpha(1).setScale(1); } });
                try { navigator.vibrate?.(14); } catch { /* not everywhere */ }
                playSfx('ui', 1.3);
                done();
            },
        });
    }

    /** False once the scene has been torn down (its graphics are gone with it). */
    get alive () { return !!this.g.scene; }

    cancel () {
        this.tw?.stop();
        this.tw = null;
        if (this.alive) this.g.clear().setVisible(false);
    }
}
const rings = new WeakMap<Phaser.Scene, HoldRing>();
function ringOf (scene: Phaser.Scene) {
    let r = rings.get(scene);
    if (!r || !r.alive) { r = new HoldRing(scene); rings.set(scene, r); }
    return r;
}

/**
 * Fire fn only for a press that starts AND ends on this object. Right clicks go to onRight. On a touch screen a long
 * press (about 0.4 s, with a ring that fills) is the right click: there is no other way to do it with a finger.
 * `canHold` says whether the thing under the finger has a long-press action right now (it defaults to onRight existing).
 */
export function onTap (obj: Obj, fn: (shift: boolean) => void, onRight?: () => void, canHold?: () => boolean) {
    let armed = false;
    obj.on('pointerdown', (p: Phaser.Input.Pointer) => {
        armed = !p.rightButtonDown();
        if (armed && onRight && p.wasTouch && (!canHold || canHold())) {
            ringOf(obj.scene).start(p, () => { if (!armed) return; armed = false; onRight(); });
        }
    });
    obj.on('pointerout', () => { if (!isTouchUi()) armed = false; });          // (a thumb wobbles off the edge; a drag is caught below)
    obj.on('pointerup', (p: Phaser.Input.Pointer) => {
        if (onRight && p.wasTouch) { const r = rings.get(obj.scene); if (r?.alive) r.cancel(); }
        if (p.rightButtonReleased() && onRight) { onRight(); return; }
        if (!armed) return;
        armed = false;
        if (p.getDistance() > 14 * SS) return;                                    // it was a drag (scrolling a list), not a tap
        fn(!!p.event && (p.event as MouseEvent).shiftKey);
    });
}

