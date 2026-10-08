// Sorting a chest: what it takes (whole categories, or single items) and the icon it wears for everyone to see.

import * as Phaser from 'phaser';
import { BUILDINGS } from '../../../shared/data/buildings';
import { chestIcon, FILTER_CATS, filterLabel, MAX_FILTER, takes } from '../../../shared/data/filters';
import { ITEM_ORDER, ITEMS, ItemId, iconOf } from '../../../shared/data/items';
import { PAL } from '../../../shared/palette';
import type { BuildE } from '../../../shared/sim/types';
import { GridItem, ItemGrid } from '../grid';
import { BTN_H, button, deviceText, SearchBox, TabBar, tipOn, ts, Win } from '../kit';
import { STYLES } from '../px';
import { itemTip } from '../tips';
import type { Screen, ScreenCtx } from './types';

type Tab = 'items' | 'icon';

export class ChestSetupScreen implements Screen {
    private win: Win;
    private id: number;
    private chips: { id: string; btn: ReturnType<typeof button> }[] = [];
    private tabs: TabBar;
    private grid: ItemGrid;
    private search: SearchBox;
    private summary: Phaser.GameObjects.Text;
    private iconT: Phaser.GameObjects.Text;
    private iconImg: Phaser.GameObjects.Image;
    private auto: ReturnType<typeof button>;
    private tab: Tab = 'items';
    private key = '';
    /** What we last asked for: shown at once, and kept until the server has caught up. */
    private fl: string[] = [];
    private ic: string | undefined;
    private until = 0;

    constructor (private ctx: ScreenCtx, arg: unknown) {
        this.id = (arg as { id: number }).id;
        const b = this.ent();
        const def = BUILDINGS[b?.kind ?? 'chest'];
        this.fl = [...(b?.fl ?? [])];
        this.ic = b?.ic;
        const s = ctx.scene;
        const back = () => ctx.open('chest', { id: this.id });
        this.win = new Win(s, { size: 'large', title: 'Sort this chest', icon: def.tex, accent: PAL.sand, onClose: back });
        const w = this.win;
        w.footer({ primary: { label: 'Done', onClick: back }, hint: 'Anything already inside stays. A creature sorter will move it to where it belongs.' });
        const body = w.body, lw = 336;

        // ── left: whole categories ──
        const left = w.section(body.x, body.y, lw, body.h, 'What it takes', { right: `up to ${MAX_FILTER}` });
        const li = left.inner, bw = Math.floor((li.w - 8) / 2), rowH = BTN_H + 8;
        FILTER_CATS.forEach((c, i) => {
            const col = i % 2, row = Math.floor(i / 2);
            const btn = button(s, 0, 0, bw, BTN_H, c.name, () => this.toggle('#' + c.id), { style: STYLES.dark, size: 13, icon: iconOf(c.icon) });
            w.put(btn.root, li.x + bw / 2 + col * (bw + 8), li.y + 4 + BTN_H / 2 + row * rowH);
            tipOn(btn.zone, () => ({ title: c.name, color: PAL.gold, icon: iconOf(c.icon), lines: [{ t: c.desc, c: PAL.pebble }], foot: 'Click to take it, or stop taking it' }));
            this.chips.push({ id: '#' + c.id, btn });
        });
        const y = li.y + 4 + Math.ceil(FILTER_CATS.length / 2) * rowH + 4;
        const clear = button(s, 0, 0, li.w, BTN_H, 'Take everything again', () => this.set([]), { style: STYLES.dark, size: 13 });
        w.put(clear.root, li.x + li.w / 2, y + BTN_H / 2);
        this.summary = w.text('', li.x, y + BTN_H + 12, ts('body'), PAL.cream, { font: 'head', wrap: li.w });

        // ── right: single items, or the icon over the chest ──
        const rx = body.x + lw + 8;
        const right = w.section(rx, body.y, body.x + body.w - rx, body.h);
        const ri = right.inner, sw = 190;
        this.tabs = new TabBar(w, ri.x, ri.y + 4 + BTN_H / 2, [{ id: 'items', label: 'Single items' }, { id: 'icon', label: 'Icon over the chest' }], this.tab, (id) => this.setTab(id as Tab), { maxW: ri.w - sw - 12 });
        this.search = new SearchBox(w, ri.x + ri.w - sw, ri.y + 4 + BTN_H / 2, sw, () => { this.key = ''; }, deviceText('Search items  ( / )', 'Search items…'));
        const row2 = ri.y + BTN_H + 14;
        this.iconT = w.text('', ri.x, row2 + 4, ts('cap'), PAL.pebble, { bold: false, wrap: ri.w - 240 });
        this.auto = button(s, 0, 0, 150, BTN_H, 'Automatic icon', () => this.pickIcon(undefined), { style: STYLES.dark, size: 13 });
        w.put(this.auto.root, ri.x + ri.w - 75, row2 + 12);
        this.iconImg = s.add.image(0, 0, '__DEFAULT').setVisible(false);
        w.put(this.iconImg, ri.x + ri.w - 150 - 24, row2 + 12);
        const gy = row2 + 40, gi = ItemGrid.fit(ri.w, ri.y + ri.h - gy, 42, 4);
        this.grid = new ItemGrid(w, ri.x, gy, gi.cols, gi.rows, 42, 4, 'No items match.');
        this.setTab('items');
    }

    private ent (): BuildE | null {
        const e = this.ctx.farm.ents[this.id];
        return e && e.k === 'bld' ? e : null;
    }

    private setTab (t: Tab) {
        this.tab = t;
        this.tabs.set(t);
        this.auto.root.setVisible(t === 'icon');
        if (this.auto.zone.input) this.auto.zone.input.enabled = t === 'icon';
        this.key = '';
    }

    private set (fl: string[]) {
        this.fl = fl.slice(0, MAX_FILTER);
        this.until = this.ctx.scene.time.now + 900;
        this.ctx.send({ t: 'config', id: this.id, fl: this.fl });
        this.key = '';
    }

    private toggle (entry: string) {
        if (this.fl.includes(entry)) this.set(this.fl.filter((f) => f !== entry));
        else if (this.fl.length >= MAX_FILTER) this.ctx.toast(`At most ${MAX_FILTER} things per chest`, undefined, PAL.berry);
        else this.set([...this.fl, entry]);
    }

    private pickIcon (item: ItemId | undefined) {
        this.ic = item;
        this.until = this.ctx.scene.time.now + 900;
        this.ctx.send({ t: 'config', id: this.id, ic: item ?? null });
        this.key = '';
    }

    wheel (dy: number, x: number, y: number) { if (this.grid.contains(x, y)) this.grid.scroll(dy); }

    update () {
        const b = this.ent();
        if (!b) { this.ctx.close(); return; }
        if (this.ctx.scene.time.now > this.until) {            // the server's word wins once our own change has had time to arrive
            const fl = b.fl ?? [];
            if (JSON.stringify(fl) !== JSON.stringify(this.fl) || b.ic !== this.ic) { this.fl = [...fl]; this.ic = b.ic; this.key = ''; }
        }
        const k = JSON.stringify([this.fl, this.ic, this.tab, this.search.value]);
        if (k === this.key) return;
        this.key = k;
        for (const c of this.chips) c.btn.setStyle(this.fl.includes(c.id) ? STYLES.gold : STYLES.dark);
        const shown = { fl: this.fl, ic: this.ic };
        this.summary.setText(`Takes: ${filterLabel(this.fl)}`);
        const ic = chestIcon(shown);
        this.iconT.setText(this.tab === 'icon' ? (this.ic ? `Wearing ${ITEMS[this.ic as ItemId]?.name ?? 'an icon'}. Pick another, or let it choose.` : ic ? `Automatic: wearing ${ITEMS[ic].name}. Pick something else to change it.` : 'No icon yet. Pick something to hang over the chest.') : 'Click an item to add it to (or take it off) the list.');
        this.iconImg.setVisible(this.tab === 'icon' && !!ic);
        if (ic) this.iconImg.setTexture(iconOf(ic)).setScale(1);
        const items = ITEM_ORDER.filter((id) => this.search.matches(ITEMS[id].name));
        this.grid.setItems(items.map((id): GridItem => {
            if (this.tab === 'icon') {
                const on = (this.ic ?? '') === id;
                return {
                    data: { icon: iconOf(id), rarity: ITEMS[id].rarity, badge: on ? '✓' : undefined },
                    tip: () => itemTip(id, { foot: 'Click: hang this over the chest' }),
                    click: () => this.pickIcon(id),
                };
            }
            const named = this.fl.includes(id), covered = !named && takes(this.fl.length ? this.fl : undefined, id) && this.fl.length > 0;
            return {
                data: { icon: iconOf(id), rarity: ITEMS[id].rarity, badge: named ? '✓' : covered ? '·' : undefined, dim: !named && !covered && this.fl.length > 0 },
                tip: () => itemTip(id, { foot: named ? 'Click: stop taking it' : covered ? 'Already taken through a category. Click to name it too.' : 'Click: this chest takes it' }),
                click: () => this.toggle(id),
            };
        }));
    }

    focusSearch () { this.search.focus(); }

    onKey (k: string) {
        if (k === 'Escape') { this.ctx.open('chest', { id: this.id }); return true; }
        return false;
    }

    destroy () { this.search.destroy(); this.win.destroy(); }
}
