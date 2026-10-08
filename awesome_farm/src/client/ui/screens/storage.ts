// Chests (a shared stash), the Market (sell stuff), and the seed chooser for garden beds.

import * as Phaser from 'phaser';
import { TILE } from '../../../shared/config';
import { BUILDINGS, CROPS, type CropDef, SEED_IDS } from '../../../shared/data/buildings';
import { cropFacts, fmtSecs, rankCrops } from '../../../shared/data/cropfacts';
import { chestIcon, filterLabel, takes } from '../../../shared/data/filters';
import { ITEM_ORDER, ITEMS, ItemId, iconOf } from '../../../shared/data/items';
import { BRANCHES, skillForUnlock } from '../../../shared/data/skills';
import { PAL } from '../../../shared/palette';
import { seasonDef } from '../../../shared/season';
import { STYLES } from '../px';
import { isTouchUi } from '../../input/layout';
import { countOf, derived, hasUnlock } from '../../../shared/sim/stats';
import type { BuildE } from '../../../shared/sim/types';
import { GridItem, ItemGrid } from '../grid';
import { deviceText, Footer, GAP, onTap, QtyChips, rowBox, SearchBox, Section, Slot, TabBar, tipOn, ts, Win, type TipData } from '../kit';
import { ListTools } from '../listtools';
import { qtyAmount } from '../gestures';
import { itemTip } from '../tips';
import type { Screen, ScreenCtx } from './types';
import { storageOf } from '../../../shared/sim/uber';

const ownedItems = (me: ReturnType<ScreenCtx['me']>) => ITEM_ORDER.filter((id) => countOf(me, id) > 0);

// ── chest ──────────────────────────────────────────────────────────────────
export class ChestScreen implements Screen {
    private win: Win;
    private id: number;
    private left: ItemGrid;
    private right: ItemGrid;
    private inSec: Section;
    private bagSec: Section;
    private foot: Footer;
    private key = '';
    private search: SearchBox;
    private tools!: ListTools;
    private grave: boolean;
    /** A chest you can sort: what it takes and the icon it wears (the strip under the list). */
    private strip?: { slot: Slot; text: Phaser.GameObjects.Text };

    constructor (private ctx: ScreenCtx, arg: unknown) {
        this.id = (arg as { id: number }).id;
        const b = this.ent()!;
        const def = BUILDINGS[b.kind];
        this.grave = !!def.grave;
        const sortable = !!def.storage && !def.pets && !this.grave;
        this.win = new Win(ctx.scene, { size: 'large', title: def.name, icon: def.tex, accent: PAL.sand, onClose: () => ctx.close() });
        const w = this.win, touch = isTouchUi();
        this.foot = w.footer({
            ...(this.grave ? { primary: { label: 'Take all', onClick: () => this.takeAll() } } : {}),
            ...(sortable ? { secondary: [{ label: 'Sort & label…', onClick: () => ctx.open('chestcfg', { id: this.id }) }, { label: 'Quick stack', onClick: () => this.quickStack() }] } : {}),
            hint: this.grave ? 'It was yours: take it all back. A friend can fetch it for you.' : deviceText('Click an item to move the whole stack across. Right-click moves just one.', 'Tap an item to move it across (x1, x10 or All below). Hold moves just one.'),
        });
        const body = w.body, cy = w.top + w.toolH / 2, sw = 230;
        // sort and filter both lists: Sort walks through the orders, the chips narrow it to one kind of thing
        this.tools = new ListTools(w, this.grave ? 'grave' : 'chest', () => { this.key = ''; });
        const sortW = this.tools.addSort(body.x, cy);
        this.tools.addChips(body.x + sortW + 12, cy, body.w - sw - sortW - 24);
        this.search = new SearchBox(w, body.x + body.w - sw, cy, sw, () => { this.key = ''; }, deviceText('Search both lists  ( / )', 'Search both lists…'));
        // two lists side by side: what is in the chest, and what you carry
        const top = w.under.y, h = w.under.h, cw = Math.floor((body.w - GAP) / 2);
        this.inSec = w.section(body.x, top, cw, h, this.grave ? 'What was dropped' : 'In the chest', { right: '' });
        this.bagSec = w.section(body.x + cw + GAP, top, body.w - cw - GAP, h, 'Your backpack', { right: '' });
        const bandH = 52, gi = ItemGrid.fit(this.inSec.inner.w, this.inSec.inner.h - bandH, 48, 4);
        this.left = new ItemGrid(w, this.inSec.inner.x, this.inSec.inner.y, gi.cols, gi.rows, 48, 4, this.grave ? 'All taken.' : 'Empty. Put things in!');
        this.right = new ItemGrid(w, this.bagSec.inner.x, this.bagSec.inner.y, gi.cols, gi.rows, 48, 4, 'Your pockets are empty.');
        const by = this.inSec.inner.y + this.inSec.inner.h - 44;
        if (touch) {
            // no Shift or right-click on a phone: the chips say how many a tap moves, a long press moves one
            w.text('A tap moves:', this.bagSec.inner.x, by + 22, ts('body'), PAL.pebble, { origin: [0, 0.5], bold: false });
            this.left.qty = this.right.qty = new QtyChips(w, this.bagSec.inner.x + 120, by + 22, [1, 10, 'all'], 'all');
        }
        if (sortable) {
            // the sorting strip: the icon the chest wears, and what it takes
            const slot = new Slot(ctx.scene, 0, 0, 44);
            w.putAt(slot.root, this.inSec.inner.x, by);
            w.text('Takes', this.inSec.inner.x + 54, by + 4, ts('cap'), PAL.pebble, { bold: false });
            const text = w.text('', this.inSec.inner.x + 54, by + 22, ts('body'), PAL.cream, { font: 'head' });
            onTap(slot.interactive, () => ctx.open('chestcfg', { id: this.id }));
            tipOn(slot.interactive, () => ({ title: 'Label this chest', color: PAL.gold, lines: [{ t: 'Choose what it takes, and the icon everybody sees over it.', c: PAL.pebble }], foot: 'Click to set it up' }));
            tipOn(this.foot.secondary[0].zone, () => ({ title: 'Sort & label', color: PAL.gold, lines: [{ t: 'A chest set to take only ores (say) refuses everything else, and creature sorters and inserters use it as home for exactly that.', c: PAL.pebble }] }));
            this.strip = { slot, text };
        }
    }

    private ent (): BuildE | null {
        const e = this.ctx.farm.ents[this.id];
        return e && e.k === 'bld' ? e : null;
    }

    wheel (dy: number, x: number, y: number) { if (this.left.contains(x, y)) this.left.scroll(dy); else if (this.right.contains(x, y)) this.right.scroll(dy); }

    /** Put away everything in your pockets that this chest already holds, or is set to take. */
    private quickStack () {
        const b = this.ent(), me = this.ctx.me();
        if (!b) return;
        let moved = 0;
        for (const id of ownedItems(me)) {
            const here = (b.inv?.[id] ?? 0) > 0, named = !!b.fl?.length && takes(b.fl, id);
            if (!takes(b.fl, id) || !(here || named)) continue;
            this.ctx.send({ t: 'xfer', id: this.id, item: id, n: countOf(me, id), dir: 'put', part: 'inv' });
            moved++;
        }
        this.ctx.toast(moved ? `Put away ${moved} kind${moved === 1 ? '' : 's'} of things` : 'Nothing to stack: this chest does not hold anything like what you carry', undefined, moved ? PAL.lime : PAL.pebble);
    }

    private takeAll () {
        const b = this.ent();
        if (!b) return;
        for (const [item, n] of Object.entries(b.inv ?? {}) as [ItemId, number][]) if (n > 0) this.ctx.send({ t: 'xfer', id: this.id, item, n, dir: 'take', part: 'inv' });
    }

    update () {
        const b = this.ent();
        if (!b) { this.ctx.close(); return; }
        const me = this.ctx.me();
        const k = JSON.stringify([b.inv, b.cap, me.inv, this.search.value, b.fl, b.ic, this.tools.prefs]);
        if (k === this.key) return;
        this.key = k;
        const cap = storageOf(b);
        if (this.strip) {
            const ic = chestIcon(b);
            this.strip.slot.set(ic ? { icon: iconOf(ic), rarity: ITEMS[ic].rarity } : null);
            this.strip.text.setText(filterLabel(b.fl));
        }
        const stored = (Object.entries(b.inv ?? {}) as [ItemId, number][]).filter(([id, n]) => n > 0 && this.search.matches(ITEMS[id].name));
        const mineAll = ownedItems(me).filter((id) => this.search.matches(ITEMS[id].name));
        this.tools.present([...new Set([...stored.map(([id]) => id), ...mineAll])]);
        const inv = this.tools.apply(stored.map(([id]) => id), (id) => b.inv?.[id] ?? 0).map((id): [ItemId, number] => [id, b.inv?.[id] ?? 0]);
        const none = this.tools.filtering || this.search.value ? 'Nothing of this kind.\nTry another kind or All.' : null;
        this.left.setEmptyText(none ?? (this.grave ? 'All taken.' : 'Empty. Put things in!'));
        this.right.setEmptyText(none ?? 'Your pockets are empty.');
        const held = Object.values(b.inv ?? {}).reduce((a, n) => a + (n ?? 0), 0);
        this.inSec.setRight(this.grave ? '' : `${held} / ${cap} items`, !this.grave && held >= cap ? PAL.berry : PAL.pebble);
        const send = this.ctx.send;
        this.left.setItems(inv.map(([id, n]): GridItem => ({
            data: { icon: iconOf(id), count: n, rarity: ITEMS[id].rarity },
            tip: () => itemTip(id, { count: n, foot: deviceText('Click: take all · Right-click: take one', 'Tap: take (x1, x10 or All below) · Hold: take one') }),
            click: (shift, q) => send({ t: 'xfer', id: this.id, item: id, n: qtyAmount(q, n, shift, 'all'), dir: 'take', part: 'inv' }),
            right: () => send({ t: 'xfer', id: this.id, item: id, n: 1, dir: 'take', part: 'inv' }),
        })));
        const mine = this.tools.apply(mineAll, (id) => countOf(me, id));
        this.bagSec.setRight(`${mine.length} kind${mine.length === 1 ? '' : 's'}`);
        this.right.setItems(mine.map((id): GridItem => ({
            data: { icon: iconOf(id), count: countOf(me, id), rarity: ITEMS[id].rarity, dim: this.grave || !takes(b.fl, id) },
            tip: () => itemTip(id, { count: countOf(me, id), foot: this.grave ? 'A lost backpack only gives' : takes(b.fl, id) ? deviceText('Click: store all · Right-click: store one', 'Tap: store (x1, x10 or All below) · Hold: store one') : `This chest only takes ${filterLabel(b.fl).toLowerCase()}` }),
            click: (shift, q) => { if (!this.grave) send({ t: 'xfer', id: this.id, item: id, n: qtyAmount(q, countOf(me, id), shift, 'all'), dir: 'put', part: 'inv' }); },
            right: () => { if (!this.grave) send({ t: 'xfer', id: this.id, item: id, n: 1, dir: 'put', part: 'inv' }); },
        })));
    }

    focusSearch () { this.search.focus(); }

    destroy () { this.search.destroy(); this.win.destroy(); }
}

// ── market ─────────────────────────────────────────────────────────────────
const MARKET_TABS: { id: string; name: string; match: (id: ItemId) => boolean }[] = [
    { id: 'all', name: 'Everything', match: () => true },
    { id: 'mat', name: 'Materials', match: (i) => ITEMS[i].kind === 'material' },
    { id: 'food', name: 'Food', match: (i) => ITEMS[i].kind === 'food' || ITEMS[i].kind === 'potion' },
    { id: 'gear', name: 'Gear', match: (i) => ITEMS[i].kind === 'gear' },
    { id: 'trader', name: 'Trader', match: () => true },
];

/** The sell tab with nothing to sell (the trader tab has its own words). */
const SELL_EMPTY = 'Nothing to sell yet.\nBring wood, ore, berries or crops!';

export class MarketScreen implements Screen {
    private win: Win;
    private grid: ItemGrid;
    private tab = 'all';

    private sec: Section;
    private foot: Footer;
    /** Phones: how many a tap sells (x1 / x10 / All) and, on the trader tab, buys (x1 / x5 / x10). */
    private sellQty?: QtyChips;
    private buyQty?: QtyChips;
    private key = '';
    private search: SearchBox;
    private tools!: ListTools;

    constructor (private ctx: ScreenCtx) {
        const s = ctx.scene;
        this.win = new Win(s, { size: 'medium', title: 'Market', icon: 'market', accent: PAL.gold, onClose: () => ctx.close() });
        const w = this.win;
        this.foot = w.footer({ info: '', infoW: 130, hint: '' });
        const body = w.body, cy = w.top + w.toolH / 2, sw = 150;
        this.tools = new ListTools(w, 'market', () => { this.key = ''; }, ['type', 'name', 'amount', 'value']);
        const sortW = 110 + 34;
        new TabBar(w, body.x, cy, MARKET_TABS.map((t) => ({ id: t.id, label: t.name })), this.tab, (id) => { this.tab = id; this.key = ''; this.syncTabs(); }, { maxW: body.w - sw - sortW - 24, minW: 52 });
        this.tools.addSort(body.x + body.w - sw - sortW - 8, cy);
        this.search = new SearchBox(w, body.x + body.w - sw, cy, sw, () => { this.key = ''; }, deviceText('Search  ( / )', 'Search…'));
        this.sec = w.section(body.x, w.under.y, body.w, w.under.h, 'Sell to the market', { right: 'The gold number is the price each' });
        const bandH = isTouchUi() ? 40 : 0, gi = ItemGrid.fit(this.sec.inner.w, this.sec.inner.h - bandH, 46, 4);
        this.grid = new ItemGrid(w, this.sec.inner.x, this.sec.inner.y, gi.cols, gi.rows, 46, 4, SELL_EMPTY);
        if (isTouchUi()) {
            // no Shift or right-click on a phone: the chips say how many a tap moves, a long press does the "10"
            const by = this.sec.inner.y + this.sec.inner.h - 20;
            w.text('A tap moves:', this.sec.inner.x, by, ts('body'), PAL.pebble, { origin: [0, 0.5], bold: false });
            this.sellQty = new QtyChips(w, this.sec.inner.x + 130, by, [1, 10, 'all'], 1);
            this.buyQty = new QtyChips(w, this.sec.inner.x + 130, by, [1, 5, 10], 1);
        }
        this.syncTabs();
    }

    private showTrader (me: ReturnType<ScreenCtx['me']>) {
        const send = this.ctx.send;
        const shop = this.ctx.farm.shop();
        const known = hasUnlock(me, 'trader');
        const left = shop ? Math.max(1, shop.day + 2 - this.ctx.farm.clock.day) : 0;
        const restock = shop ? `The trader restocks in ${left} ${left === 1 ? 'day' : 'days'}.` : '';
        const skill = skillForUnlock('trader')?.name ?? 'Merchant Contacts';
        this.foot.setHint(!known ? `Learn ${skill} (${BRANCHES.explore.name} branch) to trade with the travelling trader.`
            : shop ? deviceText(`${restock} Click: buy 1 · Shift: buy 5 · Right-click: buy 10`, `${restock} Tap buys x1, x5 or x10 as picked · Hold: buy 10`) : 'The trader has not come by yet.', !known ? PAL.berry : PAL.foam);
        const items = known && shop ? shop.stock.map((st, i): GridItem => ({
            data: { icon: iconOf(st.item), count: st.n, rarity: ITEMS[st.item].rarity, badge: `${st.price}`, dim: st.n <= 0 || me.coins < st.price },
            tip: () => itemTip(st.item, { count: st.n, foot: `${st.price} coins each · ${st.n} left` }),
            click: (shift, q) => send({ t: 'shop', i, n: shift ? 5 : qtyAmount(q, 99, false, 1) }),
            right: () => send({ t: 'shop', i, n: 10 }),
        })) : [];
        this.sec.setRight(items.length ? `${items.length} for sale` : '');
        this.grid.setEmptyText(!known ? `The trader only deals with farmers they know.\nLearn ${skill} (${BRANCHES.explore.name} branch) in the skill tree.` : 'The trader has not come by yet.\nThey call at your Market Stall every few days.');
        this.grid.setItems(items);
    }

    private syncTabs () {
        const buying = this.tab === 'trader';
        this.sec.setTitle(buying ? 'Buy from the travelling trader' : 'Sell to the market');
        if (!this.sellQty || !this.buyQty) return;
        this.sellQty.setVisible(!buying);
        this.buyQty.setVisible(buying);
        this.grid.qty = buying ? this.buyQty : this.sellQty;
    }

    wheel (dy: number, x: number, y: number) { if (this.grid.contains(x, y)) this.grid.scroll(dy); }

    update () {
        const me = this.ctx.me();
        const k = JSON.stringify([me.inv, me.coins, me.skills, this.tab, this.ctx.farm.shop(), this.ctx.farm.clock.day, this.search.value, this.tools.prefs]);
        if (k === this.key) return;
        this.key = k;
        const mul = derived(me).sellMul;
        const tab = MARKET_TABS.find((t) => t.id === this.tab)!;
        const send = this.ctx.send;
        this.foot.setInfo(`${me.coins} coins`);
        if (this.tab === 'trader') { this.showTrader(me); return; }
        this.foot.setHint(deviceText('Click: sell 1 · Shift: sell all · Right-click: sell 10', 'Tap sells x1, x10 or All as picked · Hold: sell 10'));
        this.grid.setEmptyText(SELL_EMPTY);
        const list = this.tools.apply(ownedItems(me).filter((id) => ITEMS[id].sell > 0 && tab.match(id) && this.search.matches(ITEMS[id].name)), (id) => countOf(me, id));
        this.sec.setRight(list.length ? 'The gold number is the price each' : '');
        this.grid.setItems(list.map((id): GridItem => ({
            data: { icon: iconOf(id), count: countOf(me, id), rarity: ITEMS[id].rarity, badge: `${Math.round(ITEMS[id].sell * mul)}` },
            tip: () => itemTip(id, { count: countOf(me, id), sellMul: mul, foot: deviceText('Click: sell 1 · Shift: sell all · Right-click: sell 10', 'Tap: sell (x1, x10 or All below) · Hold: sell 10') }),
            click: (shift, q) => send({ t: 'sell', item: id, n: qtyAmount(q, countOf(me, id), shift, 1) }),
            right: () => send({ t: 'sell', item: id, n: 10 }),
        })));
    }

    focusSearch () { this.search.focus(); }

    destroy () { this.search.destroy(); this.win.destroy(); }
}

// ── seed chooser ───────────────────────────────────────────────────────────
const LAST_SEED = 'awesome_farm_lastseed_v1';
const readLast = (): ItemId | null => { try { const v = localStorage.getItem(LAST_SEED); return v && v in CROPS ? (v as ItemId) : null; } catch { return null; } };
const writeLast = (id: ItemId) => { try { localStorage.setItem(LAST_SEED, id); } catch { /* private mode */ } };

/**
 * Planting: only the seeds you actually have, as cards that say what each one gives (how long it takes this season, how many, what that
 * is worth), with the one you used last already chosen. One click plants it; Enter plants the chosen one; a switch plants it in every
 * empty bed you can reach. Seeds you have not found yet wait in a quiet row underneath.
 */
export class BedScreen implements Screen {
    private win: Win;
    private id: number;
    private owned: { id: ItemId; crop: CropDef }[] = [];
    private sel = 0;
    private all = false;
    private key = '';
    private hl: Phaser.GameObjects.Graphics;
    private foot: Footer;
    private cards: { id: ItemId; x: number; y: number; w: number; h: number; slot: Slot; name: Phaser.GameObjects.Text; count: Phaser.GameObjects.Text; facts: Phaser.GameObjects.Text; sub: Phaser.GameObjects.Text; badge: Phaser.GameObjects.Text }[] = [];
    private more!: Phaser.GameObjects.Text;
    private moreSlots: Slot[] = [];
    private sec: Section;
    private cols: number;

    constructor (private ctx: ScreenCtx, arg: unknown) {
        this.id = (arg as { id: number }).id;
        const s = ctx.scene, me = ctx.me(), season = seasonDef(ctx.farm.clock.day);
        this.owned = SEED_IDS.flatMap((id) => { const crop = CROPS[id]; return crop && countOf(me, id) > 0 ? [{ id, crop }] : []; });
        const last = readLast();
        this.sel = Math.max(0, last ? this.owned.findIndex((o) => o.id === last) : 0);
        const touch = isTouchUi();
        this.win = new Win(s, { size: 'medium', title: 'Plant a seed', icon: 'bed', accent: PAL.lime, sub: 'Pick what to grow in this bed.', onClose: () => ctx.close() });
        const w = this.win;
        this.foot = w.footer({
            primary: { label: 'Plant', onClick: () => this.plant(this.owned[this.sel]?.id) },
            secondary: [{ label: 'All beds: off', onClick: () => { this.all = !this.all; this.key = ''; }, w: 130 }],
            hint: touch ? 'Tap a seed to plant it.' : 'Click a seed or press its number.',
        });
        const body = w.body, moreH = 52;
        const growWords = season.grow === 1 ? 'normal growth' : season.grow > 1 ? `crops grow ${Math.round((season.grow - 1) * 100)}% faster` : `crops grow ${Math.round((1 - season.grow) * 100)}% slower`;
        this.sec = w.section(body.x, body.y, body.w, body.h - moreH - GAP, 'Your seeds', { right: `${season.name}: ${growWords}${season.yield ? ', harvests give more' : ''}` });
        this.hl = w.put(s.add.graphics(), 0, 0);
        const inner = this.sec.inner, gap = 6;
        this.cols = Math.max(2, Math.min(4, Math.floor((inner.w + gap) / 150)));
        const rows = Math.max(1, Math.ceil(Math.max(this.owned.length, 1) / this.cols));
        const cw = Math.floor((inner.w - gap * (this.cols - 1)) / this.cols), ch = Math.min(96, Math.floor((inner.h - gap * (rows - 1)) / rows));
        this.owned.forEach(({ id, crop }, i) => {
            const col = i % this.cols, row = Math.floor(i / this.cols), x = inner.x + col * (cw + gap), y = inner.y + row * (ch + gap);
            const slot = new Slot(s, 0, 0, 48);
            w.putAt(slot.root, x + 6, y + 6);
            const line = Math.round(ts('head') * 1.35);
            const name = w.text(crop.name, x + 60, y + 6, ts('head'), PAL.cream);
            const count = w.text('', x + cw - 6, y + 8, ts('cap'), PAL.pebble, { origin: [1, 0], bold: false });
            const facts = w.text('', x + 60, y + 6 + line, ts('body'), PAL.foam, { bold: false });
            const sub = w.text('', x + 60, y + 6 + line + Math.round(ts('body') * 1.3), ts('cap'), PAL.pebble, { bold: false });
            const badge = w.text('', x + 6, y + ch - 6 - Math.round(ts('cap') * 1.2), ts('cap'), PAL.gold, { bold: false });
            const zone = s.add.zone(0, 0, cw, ch).setOrigin(0).setInteractive({ useHandCursor: true });
            w.put(zone, x, y);
            onTap(zone, () => { this.sel = i; this.key = ''; this.plant(id); });
            zone.on('pointerover', () => { if (this.sel !== i) { this.sel = i; this.key = ''; } });
            tipOn(zone, () => this.tip(id, crop));
            this.cards.push({ id, x, y, w: cw, h: ch, slot, name, count, facts, sub, badge });
        });
        // the seeds not found yet, quietly
        const my = body.y + body.h - moreH;
        this.more = w.text('', body.x + 4, my + 4, ts('cap'), PAL.pebble, { bold: false });
        const unfound = SEED_IDS.flatMap((id) => { const crop = CROPS[id]; return crop && !this.owned.some((o) => o.id === id) ? [{ id, crop }] : []; });
        unfound.forEach(({ id, crop }, i) => {
            const sl = new Slot(s, 0, 0, 30);
            w.putAt(sl.root, body.x + 4 + i * 34, my + 22);
            sl.set({ icon: iconOf(id), dim: true });
            tipOn(sl.interactive, () => ({ title: `${crop.name} seeds`, color: PAL.pebble, icon: iconOf(id), lines: [{ t: 'Not found yet. Harvest crops and wild plants: seeds turn up now and then.', c: PAL.pebble }] }));
            this.moreSlots.push(sl);
        });
        this.more.setText(unfound.length ? `${unfound.length} more kind${unfound.length === 1 ? '' : 's'} to find: harvest crops and wild plants.` : 'You have found every seed.');
    }

    private env () {
        const me = this.ctx.me(), d = derived(me), season = seasonDef(this.ctx.farm.clock.day);
        return { growMul: d.growMul, seasonGrow: season.grow, seasonYield: season.yield, sellMul: d.sellMul };
    }

    private tip (id: ItemId, crop: CropDef): TipData {
        const f = cropFacts(id, this.env())!, me = this.ctx.me();
        return {
            title: `${f.name} seeds`, color: PAL.lime, icon: iconOf(id),
            lines: [
                { t: `Ripe in about ${fmtSecs(f.secs)} (this season, with your skills)`, c: PAL.foam },
                { t: `Gives ${f.yieldMin}${f.yieldMax > f.yieldMin ? `–${f.yieldMax}` : ''} ${ITEMS[crop.out].name.toLowerCase()}, worth about ${Math.round(f.coins)} coins at the market`, c: PAL.cream },
                { t: `Earns about ${f.perMin.toFixed(f.perMin < 10 ? 1 : 0)} coins a minute, ${f.xp} XP, ${Math.round(f.seedBack * 100)}% chance of a seed back`, c: PAL.pebble },
                { t: `You have ${countOf(me, id)}`, c: PAL.pebble },
            ],
        };
    }

    /** The empty beds you can reach from where you stand, nearest first (the same reach the server uses). */
    private nearBeds (): number[] {
        const me = this.ctx.me(), farm = this.ctx.farm, pos = farm.playerPos, reach = derived(me).reach + 20 - 6;
        const [w, h] = BUILDINGS.bed.size;
        const out: { id: number; d: number }[] = [];
        for (const e of Object.values(farm.ents)) {
            if (e.k !== 'bld' || e.kind !== 'bed' || (e.crop ?? -1) >= 0) continue;
            const dx = Math.max(e.tx * TILE - pos.x, 0, pos.x - (e.tx + w) * TILE), dy = Math.max(e.ty * TILE - (pos.y - 4), 0, (pos.y - 4) - (e.ty + h) * TILE);
            const d = Math.hypot(dx, dy);
            if (d <= reach) out.push({ id: e.id, d });
        }
        return out.sort((a, b) => a.d - b.d || a.id - b.id).map((o) => o.id);
    }

    private plant (id: ItemId | undefined) {
        if (!id) return;
        const me = this.ctx.me(), have = countOf(me, id);
        if (have <= 0) return;
        writeLast(id);
        const beds = this.all ? this.nearBeds() : [this.id];
        const list = (beds.includes(this.id) ? [this.id, ...beds.filter((b) => b !== this.id)] : [this.id, ...beds]).slice(0, Math.max(1, have));
        for (const bed of list) this.ctx.send({ t: 'use', id: bed, seed: id });
        this.ctx.close();
    }

    onKey (k: string) {
        const n = this.owned.length;
        if (!n) return false;
        const digit = Number(k);
        if (digit >= 1 && digit <= Math.min(9, n)) { this.sel = digit - 1; this.plant(this.owned[this.sel].id); return true; }
        const move = (d: number) => { this.sel = (this.sel + d + n) % n; this.key = ''; return true; };
        if (k === 'ArrowRight') return move(1);
        if (k === 'ArrowLeft') return move(-1);
        if (k === 'ArrowDown') return move(Math.min(this.cols, n - 1) || 1);
        if (k === 'ArrowUp') return move(-(Math.min(this.cols, n - 1) || 1));
        if (k === 'Enter' || k === ' ') { this.plant(this.owned[this.sel].id); return true; }
        if (k === 'a' || k === 'A') { this.all = !this.all; this.key = ''; return true; }
        return false;
    }

    update () {
        const me = this.ctx.me();
        const beds = this.nearBeds();
        const k = JSON.stringify([me.inv, this.sel, this.all, beds.length, this.ctx.farm.clock.day]);
        if (k === this.key) return;
        this.key = k;
        const env = this.env(), facts = this.owned.map((o) => cropFacts(o.id, env)!), rank = rankCrops(facts), last = readLast();
        const g = this.hl; g.clear();
        this.cards.forEach((c, i) => {
            const f = facts[i], on = i === this.sel;
            rowBox(g, c.x, c.y, c.w, c.h, { on, accent: PAL.lime });
            c.slot.set({ icon: iconOf(c.id), rarity: 0 });
            c.count.setText(`×${countOf(me, c.id)}`);
            c.facts.setText(`Ripe in ${fmtSecs(f.secs)}`);
            c.sub.setText(`${f.yieldMin}${f.yieldMax > f.yieldMin ? `–${f.yieldMax}` : ''} crops · ~${Math.round(f.coins)} coins`);
            const tags = [last === c.id ? 'Last planted' : '', rank?.fastest === c.id ? 'Fastest' : '', rank?.best === c.id ? 'Best value' : ''].filter(Boolean);
            c.badge.setText(tags.join('  ·  '));
            c.badge.setColor(rank?.best === c.id ? '#ffd966' : rank?.fastest === c.id ? '#d4f08a' : '#9ec4d4');
            c.name.setColor(on ? '#fff6e0' : '#e9dcc0');
        });
        const sel = this.owned[this.sel];
        this.foot.primary?.setLabel(sel ? `Plant ${sel.crop.name}` : 'Plant');
        this.foot.secondary[0].setLabel(beds.length > 1 ? `All ${beds.length} beds: ${this.all ? 'on' : 'off'}` : 'All beds: off');
        this.foot.secondary[0].setEnabled(beds.length > 1);
        this.foot.secondary[0].setStyle(this.all && beds.length > 1 ? STYLES.lime : STYLES.dark);
        this.foot.setHint(this.all && beds.length > 1 ? `Plants the chosen seed in all ${beds.length} empty beds you can reach.` : isTouchUi() ? 'Tap a seed to plant it.' : 'Click a seed or press its number.');
    }

    destroy () { this.win.destroy(); }
}
