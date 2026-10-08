// The toast stack as drawn: what shows and for how long is ToastQueue's business (ui/slots.ts); this builds the cards and
// glides them into the lane the HUD hands it.

import * as Phaser from 'phaser';
import { PAL } from '../../shared/palette';
import { playSfx } from '../juice/sfx';
import { panel, STYLES } from './px';
import { TOAST_MAX, toastLane, ToastQueue, type ToastItem, type ToastLane } from './slots';
import { fit, forDevice, icon, label, type Obj } from './kit';

// ── toasts ─────────────────────────────────────────────────────────────────
interface ToastView { c: Phaser.GameObjects.Container; w: number; h: number; bump: number }

/**
 * The toast stack. What is on screen and for how long is decided by ToastQueue (ui/slots.ts: three at most, repeats merged,
 * nothing while a window is open); this draws it in the lane it is given, clear of the minimap and the buttons.
 */
export class Toasts {
    private q = new ToastQueue();
    private views = new Map<number, ToastView>();
    /** The part of the lane the toasts on screen take this frame (null when none shows): an obstacle for land plates and captions. */
    rect: { x: number; y: number; w: number; h: number } | null = null;
    private lane: ToastLane = toastLane(false);

    constructor (private scene: Phaser.Scene) {}

    push (text: string, iconKey?: string, color: number = PAL.cream) { this.q.push(text, iconKey, color); }

    private build (it: ToastItem): ToastView {
        const s = this.scene, color = it.color ?? PAL.cream, iconKey = it.icon;
        const t = label(s, 0, 0, forDevice(it.text), Math.min(15, fit(13)), color, { wrap: this.lane.maxW - (iconKey ? 52 : 24) });
        // three have to fit the lane one above the other: a notch smaller until they do, and failing that the words are cut short
        const maxH = Math.floor((this.lane.bottom - this.lane.top - 12) / TOAST_MAX);
        let px = parseFloat(String(t.style.fontSize));
        while (t.height + 14 > maxH && px > 13) t.setFontSize(--px);
        if (t.height + 14 > maxH) t.setMaxLines(Math.max(2, Math.floor((maxH - 14) / (t.height / Math.max(1, t.getWrappedText().length)))));
        const w = Math.min(this.lane.maxW, Math.max(150, Math.ceil(t.width) + (iconKey ? 52 : 24))), h = Math.max(32, Math.ceil(t.height) + 14);
        const g = s.add.graphics();
        panel(g, 0, 0, w, h, { ...STYLES.deep, rim: color, shadow: true });
        t.setPosition(iconKey ? 40 : 12, (h - t.height) / 2);
        const children: Obj[] = [g, t];
        if (iconKey) children.push(icon(s, iconKey, 22, h / 2, 2));
        const c = s.add.container(this.lane.right + 20, this.lane.top, children).setDepth(50).setAlpha(0);
        return { c, w, h, bump: it.bump };
    }

    /** Once a frame. `blocked`: a window is open, so the stack hides and waits. */
    update (dt: number, blocked: boolean, lane: ToastLane) {
        this.lane = lane;
        this.q.update(dt, blocked);
        const shown = this.q.shown;
        const ids = new Set(shown.map((i) => i.id));
        for (const [id, v] of this.views) if (!ids.has(id)) { v.c.destroy(); this.views.delete(id); }
        if (blocked) { for (const v of this.views.values()) v.c.setVisible(false); this.rect = null; return; }
        const k = 1 - Math.exp(-dt * 16);
        let y = lane.top;
        for (const it of shown) {
            let v = this.views.get(it.id);
            if (v && v.bump !== it.bump) {          // a repeat joined this one: the new words, with a little nudge
                const { x, y: vy } = v.c;
                v.c.destroy();
                v = this.build(it);
                v.c.setPosition(x + 14, vy);
                this.views.set(it.id, v);
            } else if (!v) {
                v = this.build(it);
                this.views.set(it.id, v);
                v.c.setPosition(lane.right - v.w + 36, y);
                playSfx('ui');
            }
            const tx = lane.right - v.w;
            v.c.setVisible(true).setAlpha(this.q.alpha(it));
            v.c.setPosition(v.c.x + (tx - v.c.x) * k, v.c.y + (y - v.c.y) * k);
            y += v.h + 6;
        }
        this.rect = shown.length ? { x: lane.right - lane.maxW, y: lane.top, w: lane.maxW, h: y - 6 - lane.top } : null;
    }
}

