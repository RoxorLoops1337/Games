// Loot reveal: a crate shakes and pops, then the prizes appear one by one with a sound and a sparkle that grow with
// how rare they are. Also shows what a buried treasure held and the message in a bottle.

import type * as Phaser from 'phaser';
import { ITEMS, iconOf, RARITY_NAMES, type ItemId } from '../../../shared/data/items';
import { CRATE_ITEM, CRATES, type CrateTier } from '../../../shared/data/loot';
import { PAL } from '../../../shared/palette';
import { countOf } from '../../../shared/sim/stats';
import type { SimEvent } from '../../../shared/sim/types';
import { Fx } from '../../juice/fx';
import { playSfx } from '../../juice/sfx';
import { deviceText, icon, inset, RARITY_COLORS, Slot, tipOn, ts, Win } from '../kit';
import { RARITY_TEXT } from '../px';
import { itemTip } from '../tips';
import type { Screen, ScreenCtx } from './types';

type LootArg = Extract<SimEvent, { e: 'loot' }> & { back?: string };

const CARD = 62, GAP = 12;

export class LootScreen implements Screen {
    private win: Win;
    private fx: Fx;
    private hero: Phaser.GameObjects.Image;
    private glow: Phaser.GameObjects.Graphics;
    private cards: { slot: Slot; name: Phaser.GameObjects.Text; sub: Phaser.GameObjects.Text; ring: Phaser.GameObjects.Graphics }[] = [];
    private shown = 0;
    private t = 0;
    private popped = false;
    private tier?: CrateTier;
    private lead: Phaser.GameObjects.Text;
    private back: string;
    private e: LootArg;
    private cx: number;
    private cy: number;

    constructor (private ctx: ScreenCtx, arg: unknown) {
        const e = arg as LootArg;
        this.e = e;
        const s = ctx.scene;
        this.back = e.back ?? '';
        this.tier = e.tier as CrateTier | undefined;
        const crate = this.tier ? CRATES[this.tier] : null;
        const title = e.src === 'crate' ? crate!.name : e.src === 'dig' ? 'Buried treasure!' : e.src === 'bottle' ? 'Message in a bottle' : 'Prize';
        const accent = crate ? crate.color : e.src === 'dig' ? PAL.dirt : PAL.foam;
        this.win = new Win(s, { size: e.text ? 'large' : 'medium', title, icon: e.src === 'crate' ? iconOf(CRATE_ITEM[this.tier!]) : e.src === 'bottle' ? 'i_bottle' : 'k_chest', accent, onClose: () => this.done() });
        const w = this.win;
        const again = this.again();
        w.footer({
            primary: { label: 'Nice!', w: 160, onClick: () => this.press() },
            ...(again ? { secondary: [{ label: `Open another (${countOf(ctx.me(), again)})`, w: 210, onClick: () => this.openAgain(again) }] } : {}),
            hint: deviceText('Press Enter or E to carry on.', 'Tap Nice! to carry on.'),
        });
        const body = w.body;
        this.fx = new Fx(s, 3);
        this.cx = w.w / 2;
        this.cy = body.y + 52;
        // the stage: a glow behind the crate that grows with the best thing in it
        this.glow = s.add.graphics();
        w.put(this.glow, 0, 0);
        const heroKey = e.src === 'crate' ? iconOf(CRATE_ITEM[this.tier!]) : e.src === 'bottle' ? 'i_bottle' : 'mound';
        this.hero = icon(s, heroKey, 0, 0, e.src === 'dig' ? 4 : 5);
        w.put(this.hero, this.cx, this.cy);
        this.lead = w.text(e.src === 'crate' ? 'Opening…' : e.src === 'dig' ? 'You dug something up…' : 'You pull the cork…', this.cx, this.cy + 52, ts('body'), PAL.pebble, { origin: [0.5, 0], bold: false });
        // the message
        let top = this.cy + 82;
        if (e.text) {
            inset(w.g, body.x + 30, top, body.w - 60, 118, PAL.cream, PAL.wood);
            const t = w.text(e.text, this.cx, top + 59, ts('body'), PAL.ink, { origin: [0.5, 0.5], align: 'center', wrap: body.w - 100, dark: false });
            t.setAlpha(0);
            s.tweens.add({ targets: t, alpha: 1, duration: 600, delay: 900 });
            top += 134;
        }
        // the cards
        const n = Math.min(8, e.items.length);
        const x0 = this.cx - (n * CARD + (n - 1) * GAP) / 2;
        e.items.slice(0, n).forEach(([res, count, rarity], i) => {
            const x = x0 + i * (CARD + GAP);
            const ring = s.add.graphics();
            w.put(ring, x + CARD / 2, top + CARD / 2);
            const slot = new Slot(s, 0, 0, CARD, { iconScale: 3 });
            w.putAt(slot.root, x, top);
            slot.set({ icon: res === 'coin' ? 'i_coin' : iconOf(res as ItemId), count: count, rarity: rarity as never });
            slot.root.setVisible(false);
            if (res !== 'coin') tipOn(slot.interactive, () => itemTip(res as ItemId, { count }));
            const name = w.text(res === 'coin' ? 'Coins' : ITEMS[res as ItemId].name, x + CARD / 2, top + CARD + 4, ts('cap'), PAL.ink, { origin: [0.5, 0], align: 'center', wrap: CARD + GAP, bold: false }).setVisible(false);
            const sub = w.text(RARITY_NAMES[rarity as 0], x + CARD / 2, top + CARD + 4 + Math.round(ts('cap') * 1.2) * 2 + 2, ts('cap'), RARITY_TEXT[rarity], { origin: [0.5, 0], bold: false }).setVisible(false);
            this.cards.push({ slot, name, sub, ring });
        });
        if (!e.items.length) w.text('Nothing but dust.', this.cx, top + 20, ts('body'), PAL.pebble, { origin: [0.5, 0], bold: false });
        this.drawGlow(0.15);
    }

    private again (): ItemId | null {
        if (this.e.src !== 'crate' || !this.tier) return null;
        const it = CRATE_ITEM[this.tier];
        return countOf(this.ctx.me(), it) > 0 ? it : null;
    }

    private openAgain (item: ItemId) {
        this.ctx.send({ t: 'crate', item });
    }

    private drawGlow (k: number) {
        const g = this.glow;
        g.clear();
        const col = RARITY_COLORS[this.e.rare] ?? PAL.gold;
        for (let i = 0; i < 5; i++) g.fillStyle(col, 0.06 + k * 0.025).fillCircle(this.cx, this.cy, 22 + i * 9 * (0.6 + k * 0.35));
    }

    private reveal (i: number, quiet = false) {
        const c = this.cards[i];
        if (!c || i < this.shown) return;
        this.shown = i + 1;
        const s = this.ctx.scene, rarity = this.e.items[i][2];
        c.slot.root.setVisible(true).setScale(0.2).setAlpha(0);
        c.name.setVisible(true); c.sub.setVisible(true);
        s.tweens.add({ targets: c.slot.root, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
        const x = this.win.x + c.slot.root.x + CARD / 2 + this.win.w / 2, y = this.win.y + c.slot.root.y + CARD / 2 + this.win.h / 2;
        const col = RARITY_COLORS[rarity];
        c.ring.clear().lineStyle(3, col, rarity >= 2 ? 1 : 0.5).strokeRect(-CARD / 2 - 2, -CARD / 2 - 2, CARD + 4, CARD + 4);
        if (rarity >= 2) s.tweens.add({ targets: c.ring, alpha: { from: 1, to: 0.35 }, duration: 700, yoyo: true, repeat: -1 });
        if (quiet) return;
        if (rarity <= 1) playSfx('pop', 1 + i * 0.07);
        else if (rarity === 2) this.fx.play('lucky', x, y);
        else if (rarity === 3) this.fx.play('rare', x, y);
        else { this.fx.play('jackpot', x, y); s.cameras.main.flash(260, 255, 230, 150); }
    }

    private pop () {
        if (this.popped) return;
        this.popped = true;
        const s = this.ctx.scene;
        const x = this.win.x + this.cx, y = this.win.y + this.cy;
        this.fx.play(this.e.src === 'dig' ? 'dig' : 'crateOpen', x, y);
        s.tweens.add({ targets: this.hero, scale: 0.1, alpha: 0, duration: 220, ease: 'Back.easeIn' });
        this.drawGlow(1 + this.e.rare * 0.4);
        this.lead.setText(this.e.items.length ? (this.e.src === 'bottle' ? 'Inside:' : 'You got:') : '');
    }

    private press () {
        if (this.shown < this.cards.length || !this.popped) {
            this.pop();
            for (let i = 0; i < this.cards.length; i++) this.reveal(i, true);
            return;
        }
        this.done();
    }

    private done () {
        if (this.back) this.ctx.open(this.back); else this.ctx.close();
    }

    onKey (k: string) {
        if (k === 'Enter' || k === ' ' || k === 'e' || k === 'E') { this.press(); return true; }
        return false;
    }

    update (dt: number) {
        this.t += dt;
        // the crate shakes harder and harder, then pops
        if (!this.popped) {
            const p = Math.min(1, this.t / 0.9);
            this.hero.setAngle(Math.sin(this.t * 38) * (3 + p * 14)).setScale((this.e.src === 'dig' ? 4 : 5) * (1 + p * 0.25));
            if (this.t >= 0.9) this.pop();
        } else {
            const since = this.t - 0.9;
            while (this.shown < this.cards.length && since >= 0.25 + this.shown * 0.3) this.reveal(this.shown);
        }
    }

    destroy () { this.win.destroy(); this.fx.destroy(); }
}
