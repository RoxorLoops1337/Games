// Between waves of an expedition: three boon cards, pick one (click, or press 1, 2, 3).

import type * as Phaser from 'phaser';
import { BOON_BY_ID, BOON_RARITY, RIFT_PICK_SECONDS, RIFT_TIERS } from '../../../shared/data/rift';
import { PAL } from '../../../shared/palette';
import { deviceText, Footer, icon, ts, Win, onTap } from '../kit';
import { bar, hex, inset, panel, rect } from '../px';
import type { Screen, ScreenCtx } from './types';

const CARD_W = 280, GAP = 16;
const RARE_COL = [PAL.pebble, PAL.sea, PAL.gold];
const RARE_TXT = [PAL.cream, PAL.foam, PAL.gold];

export class BoonScreen implements Screen {
    private win: Win;
    private g: Phaser.GameObjects.Graphics;
    private key = '';
    private icons: Phaser.GameObjects.Image[] = [];
    private nameT: Phaser.GameObjects.Text[] = [];
    private rareT: Phaser.GameObjects.Text[] = [];
    private descT: Phaser.GameObjects.Text[] = [];
    private keyT: Phaser.GameObjects.Text[] = [];
    private foot: Footer;
    private hover = -1;
    private chosen = false;
    private pulse = 0;
    private cardH: number;
    private x0: number;
    private y0: number;

    constructor (private ctx: ScreenCtx) {
        const s = ctx.scene;
        const r = ctx.me().rift;
        const t = r ? RIFT_TIERS[r.tier] : RIFT_TIERS[0];
        this.win = new Win(s, { size: 'large', title: 'Choose a boon', icon: 'star', accent: t.color, closeable: false, sub: `${t.name} · wave ${r?.wave ?? 1} cleared. Take one; it lasts until the expedition ends.`, onClose: () => undefined });
        const w = this.win;
        this.foot = w.footer({ info: '', infoW: 190, hint: deviceText('Click a card, or press 1, 2 or 3.', 'Tap a card to take it.') });
        const body = w.body;
        this.g = w.put(s.add.graphics(), 0, 0);
        this.cardH = body.h - 24;
        this.x0 = body.x + Math.round((body.w - (3 * CARD_W + 2 * GAP)) / 2);
        this.y0 = body.y + 6;
        for (let i = 0; i < 3; i++) {
            const x = this.x0 + i * (CARD_W + GAP), y = this.y0;
            this.icons.push(w.put(icon(s, 'k_star', 0, 0, 4), x + CARD_W / 2, y + 64));
            this.nameT.push(w.text('', x + CARD_W / 2, y + 112, ts('head') + 3, PAL.cream, { origin: [0.5, 0], font: 'head', align: 'center' }));
            this.rareT.push(w.text('', x + CARD_W / 2, y + 112 + Math.round((ts('head') + 3) * 1.2) + 2, ts('cap'), PAL.pebble, { origin: [0.5, 0], bold: false }));
            this.descT.push(w.text('', x + CARD_W / 2, y + 162, ts('body'), PAL.cream, { origin: [0.5, 0], bold: false, wrap: CARD_W - 32, align: 'center' }));
            this.keyT.push(w.text(deviceText(`Press ${i + 1}`, 'Tap to take'), x + CARD_W / 2, y + this.cardH - 26, ts('cap'), PAL.pebble, { origin: [0.5, 0], bold: false }));
            const z = s.add.zone(0, 0, CARD_W, this.cardH).setOrigin(0).setInteractive({ useHandCursor: true });
            w.put(z, x, y);
            z.on('pointerover', () => { this.hover = i; this.key = ''; });
            z.on('pointerout', () => { if (this.hover === i) this.hover = -1; this.key = ''; });
            onTap(z, () => this.choose(i));
        }
    }

    private offer () { return this.ctx.me().rift?.offer; }

    private choose (i: number) {
        const o = this.offer();
        if (this.chosen || !o?.[i]) return;
        this.chosen = true;
        this.ctx.send({ t: 'rift', op: 'pick', i });
        this.ctx.close();
    }

    onKey (k: string) {
        if (k === '1' || k === '2' || k === '3') { this.choose(Number(k) - 1); return true; }
        return k === 'Escape' || k === 'Tab';     // you cannot walk away from a choice
    }

    update (dt: number) {
        const me = this.ctx.me();
        const r = me.rift, o = r?.offer;
        if (!r || !o) { if (!this.chosen) this.ctx.close(); return; }
        this.pulse += dt;
        const k = JSON.stringify([o, this.hover, r.t, Math.floor(this.pulse * 4)]);
        if (k === this.key) return;
        this.key = k;
        const g = this.g, cardH = this.cardH;
        g.clear();
        o.forEach((id, i) => {
            const b = BOON_BY_ID[id];
            const x = this.x0 + i * (CARD_W + GAP), y = this.y0;
            const hov = this.hover === i, up = hov ? 4 : 0;
            const col = RARE_COL[b.rarity];
            panel(g, x, y - up, CARD_W, cardH, { fill: PAL.night, rim: col, hi: hov ? PAL.cream : col, lo: PAL.ink, shadow: true, r: 3 });
            rect(g, x + 6, y + 6 - up, CARD_W - 12, 6, col, b.rarity ? 0.9 : 0.5);
            inset(g, x + CARD_W / 2 - 36, y + 28 - up, 72, 72, PAL.ink, col);
            rect(g, x + 24, y + cardH - 36 - up, CARD_W - 48, 1, PAL.slate, 0.8);
            if (b.rarity === 2 && Math.floor(this.pulse * 4) % 2) rect(g, x + 8, y + 8 - up, CARD_W - 16, 2, PAL.gold, 0.5);
            this.icons[i].setTexture(b.icon, 0).setVisible(true).setScale(3);
            this.win.at(this.icons[i], x + CARD_W / 2, y + 64 - up);
            this.nameT[i].setText(b.name).setColor(hex(RARE_TXT[b.rarity]));
            this.rareT[i].setText(BOON_RARITY[b.rarity]).setColor(hex(col));
            this.descT[i].setText(b.desc);
            this.keyT[i].setColor(hex(hov ? PAL.gold : PAL.pebble));
        });
        this.foot.setInfo(`Choosing for you in ${r.t}s`, r.t < 6 ? PAL.berry : PAL.gold);
        const body = this.win.body;
        bar(g, body.x + body.w / 2 - 150, body.y + body.h - 10, 300, 8, Math.min(1, r.t / RIFT_PICK_SECONDS), r.t < 6 ? PAL.berry : PAL.gold);
    }

    destroy () { this.win.destroy(); }
}
