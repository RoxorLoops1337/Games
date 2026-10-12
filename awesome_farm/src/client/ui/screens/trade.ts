// The trade window: your backpack on the left, what you give in the middle, what they give on the right (live). Any change clears
// both Accepts and locks Accept for a moment (sim/trade.ts), so nothing can be swapped under your nose.

import type * as Phaser from 'phaser';
import { ITEM_ORDER, ITEMS, iconOf, type ItemId } from '../../../shared/data/items';
import { PAL } from '../../../shared/palette';
import { countOf } from '../../../shared/sim/stats';
import { TRADE_STACKS } from '../../../shared/sim/trade';
import { isTouchUi } from '../../input/layout';
import { qtyAmount } from '../gestures';
import { GridItem, ItemGrid } from '../grid';
import { button, deviceText, Footer, GAP, icon, QtyChips, Section, ts, Win, type Btn } from '../kit';
import { STYLES } from '../px';
import { itemTip } from '../tips';
import type { Screen, ScreenCtx } from './types';

export class TradeScreen implements Screen {
    private win: Win;
    private foot: Footer;
    private key = '';
    private bag: ItemGrid;
    private mine: ItemGrid;
    private theirs: ItemGrid;
    private bagSec: Section;
    private mineSec: Section;
    private theirSec: Section;
    private coinT: Phaser.GameObjects.Text;
    private theirCoinT: Phaser.GameObjects.Text;
    private statusT: Phaser.GameObjects.Text;
    private who: string;
    private wasLocked = true;
    private coinBtns: Btn[] = [];

    constructor (private ctx: ScreenCtx) {
        const me = ctx.me();
        const partner = ctx.farm.players[me.trade?.w ?? ''];
        this.who = partner?.name ?? 'your friend';
        const s = ctx.scene, touch = isTouchUi();
        this.win = new Win(s, { size: 'large', title: `Trade with ${this.who}`, icon: 'k_flag', accent: PAL.gold, onClose: () => ctx.close(), sub: 'Both of you see both offers. Changing anything clears the Accepts.' });
        const w = this.win;
        this.foot = w.footer({
            primary: { label: 'Accept', onClick: () => ctx.send({ t: 'trade', op: 'ok' }) },
            secondary: [{ label: 'Cancel trade', onClick: () => ctx.close() }],
            hint: deviceText('Click a thing in your backpack to offer it. Click it in the middle to take it back.', 'Tap a thing to offer it (x1, x10 or All below). Tap it in the middle to take it back.'),
        });
        const body = w.body, cw = Math.floor((body.w - 2 * GAP) / 3);
        this.bagSec = w.section(body.x, body.y, cw, body.h, 'Your backpack', { right: '' });
        this.mineSec = w.section(body.x + cw + GAP, body.y, cw, body.h, 'You give', { right: '' });
        this.theirSec = w.section(body.x + 2 * (cw + GAP), body.y, body.w - 2 * (cw + GAP), body.h, `${this.who} gives`, { right: '' });
        const grid = (sec: Section, rows: number, empty: string) => {
            const g = ItemGrid.fit(sec.inner.w, sec.inner.h - rows, 46, 4);
            return new ItemGrid(w, sec.inner.x, sec.inner.y, g.cols, g.rows, 46, 4, empty);
        };
        this.bag = grid(this.bagSec, touch ? 40 : 0, 'Your pockets are empty.');
        if (touch) {
            w.text('A tap moves:', this.bagSec.inner.x, this.bagSec.inner.y + this.bagSec.inner.h - 20, ts('body'), PAL.pebble, { origin: [0, 0.5], bold: false });
            this.bag.qty = new QtyChips(w, this.bagSec.inner.x + 120, this.bagSec.inner.y + this.bagSec.inner.h - 20, [1, 10, 'all'], 'all');
        }
        this.mine = grid(this.mineSec, 70, 'Nothing yet.\nPick things from your backpack.');
        this.theirs = grid(this.theirSec, 70, `${this.who} has not offered anything yet.`);
        // coins: your offer in steps, theirs shown
        const cy = this.mineSec.inner.y + this.mineSec.inner.h - 56;
        w.put(icon(s, 'i_coin', 0, 0, 2), this.mineSec.inner.x + 14, cy + 10);
        this.coinT = w.text('0', this.mineSec.inner.x + 34, cy + 10, ts('head'), PAL.gold, { origin: [0, 0.5], font: 'head' });
        const add = (label: string, d: number, x: number) => {
            const b = button(s, 0, 0, 52, 26, label, () => this.coins(d), { style: STYLES.dark, size: 12, ink: false });
            w.put(b.root, this.mineSec.inner.x + x, cy + 38);
            this.coinBtns.push(b);
        };
        add('+10', 10, 28); add('+100', 100, 86); add('Clear', -1e9, 144);
        const ty = this.theirSec.inner.y + this.theirSec.inner.h - 56;
        w.put(icon(s, 'i_coin', 0, 0, 2), this.theirSec.inner.x + 14, ty + 10);
        this.theirCoinT = w.text('0', this.theirSec.inner.x + 34, ty + 10, ts('head'), PAL.gold, { origin: [0, 0.5], font: 'head' });
        this.statusT = w.text('', this.theirSec.inner.x, ty + 36, ts('body'), PAL.pebble, { origin: [0, 0.5], bold: false });
    }

    private coins (d: number) {
        const t = this.ctx.me().trade;
        if (t) this.ctx.send({ t: 'trade', op: 'coins', n: Math.max(0, t.c + d) });
    }

    private offer (item: ItemId, n: number) {
        const t = this.ctx.me().trade;
        if (!t) return;
        if (!t.o.some(([i]) => i === item) && t.o.length >= TRADE_STACKS) { this.ctx.toast(`${TRADE_STACKS} kinds at a time`, undefined, PAL.pebble); return; }
        const cur = t.o.find(([i]) => i === item)?.[1] ?? 0;
        this.ctx.send({ t: 'trade', op: 'set', item, n: cur + n });
    }

    wheel (dy: number, x: number, y: number) { for (const g of [this.bag, this.mine, this.theirs]) if (g.contains(x, y)) g.scroll(dy); }

    update () {
        const me = this.ctx.me(), t = me.trade;
        if (!t) { this.ctx.close(); return; }
        const them = this.ctx.farm.players[t.w]?.trade;
        const now = this.ctx.farm.clock.time;
        const locked = now < t.lock;
        const k = JSON.stringify([t, them, me.inv, me.coins, locked]);
        if (k === this.key) return;
        this.key = k;
        const left = (id: ItemId) => countOf(me, id) - (t.o.find(([i]) => i === id)?.[1] ?? 0);
        const ids = ITEM_ORDER.filter((id) => countOf(me, id) > 0);
        this.bagSec.setRight(`${ids.length} kind${ids.length === 1 ? '' : 's'}`);
        this.bag.setItems(ids.map((id): GridItem => ({
            data: { icon: iconOf(id), count: left(id), rarity: ITEMS[id].rarity, dim: left(id) <= 0 },
            tip: () => itemTip(id, { count: left(id), foot: deviceText('Click: offer all · Right-click: offer one', 'Tap offers x1, x10 or All as picked · Hold: offer one') }),
            click: (shift, q) => this.offer(id, Math.min(left(id), qtyAmount(q, left(id), shift, 'all'))),
            right: () => this.offer(id, 1),
        })));
        const row = ([id, n]: [ItemId, number], mineSide: boolean): GridItem => ({
            data: { icon: iconOf(id), count: n, rarity: ITEMS[id].rarity },
            tip: () => itemTip(id, { count: n, foot: mineSide ? deviceText('Click to take it back', 'Tap to take it back') : `${this.who} offers this` }),
            ...(mineSide ? { click: () => this.ctx.send({ t: 'trade', op: 'set', item: id, n: 0 }) } : {}),
        });
        this.mine.setItems(t.o.map((r) => row(r, true)));
        this.theirs.setItems((them?.o ?? []).map((r) => row(r, false)));
        this.mineSec.setRight(t.ok ? 'Accepted' : '', PAL.lime);
        this.theirSec.setRight(them?.ok ? 'Accepted' : '', PAL.lime);
        this.coinT.setText(`${t.c}`);
        this.theirCoinT.setText(`${them?.c ?? 0}`);
        for (const b of this.coinBtns) b.setEnabled(true);
        this.foot.primary?.setLabel(t.ok ? 'Accepted (undo)' : locked ? 'Accept…' : 'Accept');
        this.foot.primary?.setEnabled(t.ok ? true : !locked);
        this.statusT.setText(t.ok && them?.ok ? 'Swapping…' : t.ok ? `Waiting for ${this.who}` : them?.ok ? `${this.who} has accepted` : '').setColor(them?.ok ? '#b8e07a' : '#9ec4d4');
        // Accept unlocks a moment after the last change, with nothing else changing: look again then
        if (locked !== this.wasLocked) this.wasLocked = locked;
        if (locked) this.key = '';
    }

    destroy () {
        if (this.ctx.me().trade) this.ctx.send({ t: 'trade', op: 'cancel' });
        this.win.destroy();
    }
}
