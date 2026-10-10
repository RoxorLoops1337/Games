// The Equipment Bag: what the farmer wears that does not fit on the doll. For now the five rings; the relic satchel joins it next.
// A ring is worn on any free finger: click one in the list to put it on, click a worn one to take it off.

import { ITEM_ORDER, ITEMS, ItemId, RING_SLOTS, RingSlot } from '../../../shared/data/items';
import { modLine, type Mods, type StatKey } from '../../../shared/data/stats';
import { PAL } from '../../../shared/palette';
import { countOf } from '../../../shared/sim/stats';
import { ItemGrid, GridItem } from '../grid';
import { deviceText, onTap, Slot, tipOn, Win, type Footer } from '../kit';
import { itemTip } from '../tips';
import type { Screen, ScreenCtx } from './types';

/** What the worn rings add up to, one line per stat. */
export function ringBonuses (worn: (ItemId | undefined)[]): string[] {
    const sum: Mods = {};
    for (const id of worn) for (const [k, v] of Object.entries(ITEMS[id!]?.gear?.mods ?? {})) sum[k as StatKey] = (sum[k as StatKey] ?? 0) + (v as number);
    return (Object.entries(sum) as [StatKey, number][]).map(([k, v]) => modLine(k, v));
}

export class GearScreen implements Screen {
    private win: Win;
    private fingers = {} as Record<RingSlot, Slot>;
    private grid: ItemGrid;
    private bonus: ReturnType<Win['text']>;
    private foot: Footer;
    private key = '';

    constructor (private ctx: ScreenCtx) {
        const s = ctx.scene;
        this.win = new Win(s, { size: 'large', title: 'Equipment Bag', icon: 'k_bag', accent: PAL.gold, onClose: () => ctx.close(), sub: 'Rings go on your fingers. Five at once, and they all count.' });
        const w = this.win;
        this.foot = w.footer({ info: '', infoW: 110, hint: deviceText('Click a ring to wear it. Click a worn ring to take it off.', 'Tap a ring to wear it. Tap a worn ring to take it off.') });
        const body = w.body, lw = 340, gx = 8;

        // ── left: the five fingers, and what they add up to ──
        const hand = w.section(body.x, body.y, lw, 112, 'Rings worn');
        const size = 52, gap = 8;
        RING_SLOTS.forEach((slot, i) => {
            const sl = new Slot(s, 0, 0, size);
            w.putAt(sl.root, hand.inner.x + 4 + i * (size + gap), hand.inner.y + 8);
            this.fingers[slot] = sl;
            onTap(sl.interactive, () => { if (ctx.me().equip[slot]) ctx.send({ t: 'unequip', slot }); });
            tipOn(sl.interactive, () => {
                const id = ctx.me().equip[slot];
                return id ? itemTip(id, { foot: 'Click to take it off' }) : { title: `Finger ${i + 1}`, color: PAL.pebble, lines: [{ t: 'Free: wear a ring here.', c: PAL.pebble }] };
            });
        });
        const sum = w.section(body.x, hand.y + hand.h + gx, lw, body.h - hand.h - gx, 'Together they give');
        this.bonus = w.text('', sum.inner.x + 4, sum.inner.y + 2, 13, PAL.lime, { wrap: sum.inner.w - 8, bold: false });

        // ── right: the rings you carry ──
        const rx = body.x + lw + gx, rw = body.w - lw - gx;
        const carrying = w.section(rx, body.y, rw, body.h, 'Rings in your backpack');
        const g = ItemGrid.fit(carrying.inner.w, carrying.inner.h, 52, 6);
        this.grid = new ItemGrid(w, carrying.inner.x, carrying.inner.y, g.cols, g.rows, 52, 6, 'No rings yet.\nMake them at the Anvil, or win them from bosses.');
    }

    wheel (dy: number, x: number, y: number) { if (this.grid.contains(x, y)) this.grid.scroll(dy); }

    update () {
        const me = this.ctx.me();
        const k = JSON.stringify([me.inv, me.equip]);
        if (k === this.key) return;
        this.key = k;
        const worn = RING_SLOTS.map((r) => me.equip[r]);
        RING_SLOTS.forEach((r, i) => this.fingers[r].set(worn[i] ? { icon: `i_${worn[i]}`, rarity: ITEMS[worn[i]!].rarity } : { icon: 'i_ring_copper', dim: true }));
        const lines = ringBonuses(worn);
        this.bonus.setText(lines.length ? lines.join('\n') : 'Nothing yet. Wear a ring.');
        const owned = ITEM_ORDER.filter((id) => ITEMS[id].gear?.slot === 'ring' && countOf(me, id) > 0);
        const items: GridItem[] = owned.map((id) => ({
            data: { icon: `i_${id}`, count: countOf(me, id), rarity: ITEMS[id].rarity },
            tip: () => itemTip(id, { count: countOf(me, id), foot: 'Click to wear it' }),
            click: () => this.ctx.send({ t: 'equip', item: id }),
        }));
        this.grid.setItems(items);
        this.foot.setInfo(`${worn.filter(Boolean).length} / ${RING_SLOTS.length} worn`);
    }

    destroy () { this.win.destroy(); }
}
