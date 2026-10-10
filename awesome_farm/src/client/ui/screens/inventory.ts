// Backpack & equipment: what you wear, your stats, a filterable item grid and the hotbar.

import { ensureFarmer } from '../../art/storybook-chars';
import * as Phaser from 'phaser';
import { TILE, TUNING } from '../../../shared/config';
import { GEAR_SLOTS, GearSlot, ITEM_ORDER, ITEMS, ItemId, SLOT_NAMES } from '../../../shared/data/items';
import { PAL } from '../../../shared/palette';
import { countOf, derived, itemCap, xpToNextOf } from '../../../shared/sim/stats';
import { HOT_SLOTS, hotbarOf, hotKind } from '../../../shared/sim/hotbar';
import { ItemGrid, GridItem } from '../grid';
import { deviceText, onTap, SearchBox, Section, Slot, StatList, tipOn, Win, type Footer } from '../kit';
import { ListTools } from '../listtools';
import { inset, rect } from '../px';
import { itemTip } from '../tips';
import type { Screen, ScreenCtx } from './types';

type Slot6 = Exclude<GearSlot, 'ring'>;
const PLACEHOLDER: Record<Slot6, string> = { head: 'i_cap_cloth', body: 'i_tunic_cloth', charm: 'i_charm_lucky', tool: 'i_pick_flint', weapon: 'i_club', bag: 'i_bag_satchel' };
/** Where each piece goes: three across, two rows (what goes on the head, body and charm; then the tool, weapon and bag). */
const SLOT_AT: Record<Slot6, [number, number]> = { head: [0, 0], body: [1, 0], charm: [2, 0], tool: [0, 1], weapon: [1, 1], bag: [2, 1] };
const STAT_LABELS = ['Hearts', 'Energy', 'Level', 'Mining power', 'Weapon damage', 'Armor', 'Move speed', 'Reach', 'Luck', 'Critical', 'XP gain', 'Skill points'];

export class InventoryScreen implements Screen {
    private win: Win;
    private grid: ItemGrid;
    private tools!: ListTools;
    private equipSlots = {} as Record<Slot6, Slot>;
    private stats: StatList;
    private key = '';
    private strip: Slot[] = [];
    private search: SearchBox;
    private doll: Partial<Record<'cloak' | 'packBack' | 'base' | 'body' | 'charm' | 'head' | 'pack', Phaser.GameObjects.Image>> = {};
    private foot: Footer;
    private carrying: Section;
    /** The hotbar slot waiting for an item (click a slot, then click the item you want in it). */
    private armed = -1;

    constructor (private ctx: ScreenCtx) {
        const s = ctx.scene;
        this.win = new Win(s, { size: 'large', title: 'Backpack', icon: 'k_bag', accent: PAL.gold, onClose: () => ctx.close() });
        const w = this.win;
        this.foot = w.footer({ info: '', infoW: 110, secondary: [{ label: 'Rings  (G)', onClick: () => ctx.open('gear'), icon: 'i_ring_copper' }], hint: deviceText('Click an item to equip, eat or open it. Hover for what it does.', 'Tap an item to equip, eat or open it.') });
        const body = w.body, lw = 300, gx = 8;

        // ── left: what you wear, and your stats ──
        const wear = w.section(body.x, body.y, lw, 140, 'Wearing');
        const frame = { x: wear.inner.x + 2, y: wear.inner.y - 2, w: 92, h: 92 };
        inset(w.g, frame.x, frame.y, frame.w, frame.h, PAL.deepSea, PAL.slate);
        rect(w.g, frame.x + 1, frame.y + 56, frame.w - 2, frame.h - 57, PAL.grass, 0.9);
        rect(w.g, frame.x + 1, frame.y + 56, frame.w - 2, 2, PAL.lime, 0.8);
        // the farmer, in whatever they are wearing: cloak behind, then the body, armor, charm and hat in front
        const dollKey = ensureFarmer(s, ctx.me().look, ctx.me().color);          // the look chosen in the character creator
        const dx = frame.x + frame.w / 2, dy = frame.y + frame.h - 6;
        this.doll.packBack = w.put(s.add.image(0, 0, dollKey, 0).setOrigin(0.5, 1).setScale(6).setVisible(false), dx, dy) as Phaser.GameObjects.Image;
        this.doll.cloak = w.put(s.add.image(0, 0, dollKey, 0).setOrigin(0.5, 1).setScale(6).setVisible(false), dx, dy) as Phaser.GameObjects.Image;
        this.doll.base = w.put(s.add.image(0, 0, dollKey, 0).setOrigin(0.5, 1).setScale(6), dx, dy) as Phaser.GameObjects.Image;
        for (const k of ['body', 'charm', 'pack', 'head'] as const) this.doll[k] = w.put(s.add.image(0, 0, dollKey, 0).setOrigin(0.5, 1).setScale(6).setVisible(false), dx, dy) as Phaser.GameObjects.Image;
        const sx = frame.x + frame.w + 12;
        for (const slot of GEAR_SLOTS) {
            const [c, r] = SLOT_AT[slot];
            const sl = new Slot(s, 0, 0, 44);
            w.putAt(sl.root, sx + c * 48, frame.y + r * 48);
            this.equipSlots[slot] = sl;
            onTap(sl.interactive, () => { if (ctx.me().equip[slot]) ctx.send({ t: 'unequip', slot }); });
            tipOn(sl.interactive, () => {
                const id = ctx.me().equip[slot];
                return id ? itemTip(id, { foot: 'Click to unequip' }) : { title: `${SLOT_NAMES[slot]} slot`, color: PAL.pebble, lines: [{ t: 'Nothing equipped.', c: PAL.pebble }] };
            });
        }
        const stat = w.section(body.x, wear.y + wear.h + gx, lw, body.h - wear.h - gx, 'Stats');
        this.stats = new StatList(w, stat.inner.x, stat.inner.y, stat.inner.w, Math.floor(stat.inner.h / STAT_LABELS.length), STAT_LABELS);

        // ── right: tabs and search, the items, the hotbar ──
        const rx = body.x + lw + gx, rw = body.w - lw - gx;
        const cy = w.top + w.toolH / 2;
        const sw = 150;
        this.tools = new ListTools(w, 'backpack', () => { this.key = ''; });
        this.tools.addSort(rx, cy);
        this.search = new SearchBox(w, rx + rw - sw, cy, sw, () => { this.key = ''; }, deviceText('Search  ( / )', 'Search…'));
        const hotH = 86, top = w.under.y;
        this.carrying = w.section(rx, top, rw, body.y + body.h - hotH - gx - top, 'Carrying', { right: '' });
        // the category chips run along the top of the list, then the items
        const chipsH = 34, chipsY = this.carrying.inner.y + 14;
        this.tools.addChips(this.carrying.inner.x, chipsY, this.carrying.inner.w - 10);
        const g = ItemGrid.fit(this.carrying.inner.w, this.carrying.inner.h - chipsH, 44, 4);
        this.grid = new ItemGrid(w, this.carrying.inner.x, this.carrying.inner.y + chipsH, g.cols, g.rows, 44, 4, 'Nothing here yet.\nGo harvest something!');
        w.keep(s.add.zone(0, 0, 1, 1));
        // the hotbar, editable: click a slot, then an item (or right-click an item to pin it; on a phone, hold it)
        const hot = w.section(rx, body.y + body.h - hotH, rw, hotH, 'Hotbar', { right: deviceText('Click a slot, then an item.  Right-click an item to pin or unpin it.', 'Tap a slot, then an item.  Hold an item to pin or unpin it.') });
        for (let i = 0; i < HOT_SLOTS; i++) {
            const sl = new Slot(s, 0, 0, 40);
            w.putAt(sl.root, hot.inner.x + i * 44, hot.inner.y + 2);
            this.strip.push(sl);
            onTap(sl.interactive, () => { this.armed = this.armed === i ? -1 : i; this.key = ''; }, () => { ctx.send({ t: 'hot', slot: i, item: null }); if (this.armed === i) this.armed = -1; this.key = ''; });
            tipOn(sl.interactive, () => {
                const id = hotbarOf(ctx.me())[i];
                const foot = this.armed === i ? 'Now click an item to put here' : 'Click to choose an item for this slot  ·  right-click to clear';
                return id ? itemTip(id, { count: countOf(ctx.me(), id), foot: `Key ${i + 1}  ·  ${foot}` }) : { title: `Hotbar slot ${i + 1}`, color: PAL.pebble, lines: [{ t: foot, c: PAL.pebble }] };
            });
        }
    }

    private dress (me: ReturnType<ScreenCtx['me']>) {
        const show = (slot: 'cloak' | 'packBack' | 'body' | 'charm' | 'pack' | 'head', key: string | null) => {
            const im = this.doll[slot];
            if (!im) return;
            const ok = !!key && this.ctx.scene.textures.exists(key);
            im.setVisible(ok);
            if (ok) im.setTexture(key!, 0);
        };
        const e = me.equip;
        show('packBack', e.bag ? `worn_back_${e.bag}` : null);
        show('cloak', e.body ? `worn_back_${e.body}` : null);
        show('body', e.body ? `worn_${e.body}` : null);
        show('charm', e.charm ? `worn_${e.charm}` : null);
        show('pack', e.bag ? `worn_${e.bag}` : null);
        show('head', e.head ? `worn_${e.head}` : null);
    }

    /** Pin an item to the armed slot, else the next free one; pin an already pinned item again to take it off. */
    private pin (id: ItemId) {
        const bar = hotbarOf(this.ctx.me());
        const at = bar.indexOf(id);
        if (this.armed >= 0) this.ctx.send({ t: 'hot', slot: this.armed, item: id });
        else if (at >= 0) this.ctx.send({ t: 'hot', slot: at, item: null });
        else { const free = bar.indexOf(null); this.ctx.send({ t: 'hot', slot: free >= 0 ? free : HOT_SLOTS - 1, item: id }); }
        this.armed = -1;
        this.key = '';
    }

    wheel (dy: number, x: number, y: number) { if (this.grid.contains(x, y)) this.grid.scroll(dy); }

    update () {
        const me = this.ctx.me();
        const k = JSON.stringify([me.inv, me.equip, me.hot, me.coins, me.level, me.xp | 0, me.skills, me.buffs.length, this.tools.prefs, me.points, this.armed, this.search.value]);
        if (k === this.key) return;
        this.key = k;
        const send = this.ctx.send;
        const owned = ITEM_ORDER.filter((id) => countOf(me, id) > 0 && this.search.matches(ITEMS[id].name, id.replace(/_/g, ' ')));
        this.tools.present(owned);
        const shown = this.tools.apply(owned, (id) => countOf(me, id));
        this.grid.setEmptyText(this.tools.filtering || this.search.value ? 'Nothing of this kind.\nPick All to see everything.' : 'Nothing here yet.\nGo harvest something!');
        const items: GridItem[] = shown.map((id) => ({
            data: { icon: `i_${id}`, count: countOf(me, id), rarity: ITEMS[id].rarity },
            tip: () => itemTip(id, { count: countOf(me, id), sellMul: derived(me).sellMul, foot: this.armed >= 0 ? `Click to put it in hotbar slot ${this.armed + 1}` : ITEMS[id].open ? 'Click to open it' : hotbarOf(this.ctx.me()).includes(id) ? 'Right-click to unpin from the hotbar' : 'Right-click to pin to the hotbar' }),
            click: (shift) => {
                if (this.armed >= 0 || shift) { this.pin(id); return; }
                const def = ITEMS[id];
                if (def.gear) send({ t: 'equip', item: id });
                else if (def.food || def.heal || def.buff) send({ t: 'eat', item: id });
                else if (def.open) send({ t: 'crate', item: id });
            },
            right: () => this.pin(id),
        }));
        this.grid.setItems(items);
        this.carrying.setRight(`${items.length} kind${items.length === 1 ? '' : 's'}  ·  up to ${itemCap(me, 'wood')} of each`);
        this.dress(me);
        const bar = hotbarOf(me);
        this.strip.forEach((sl, i) => {
            const id = bar[i];
            const equipped = !!id && Object.values(me.equip).includes(id);
            const n = id ? countOf(me, id) : 0;
            sl.setSelected(i === this.armed);
            sl.set(id ? { icon: `i_${id}`, count: hotKind(id) === 'gear' ? 0 : n, rarity: ITEMS[id].rarity, dim: n === 0 && !equipped } : null);
        });
        for (const slot of GEAR_SLOTS) {
            const id = me.equip[slot];
            this.equipSlots[slot].set(id ? { icon: `i_${id}`, rarity: ITEMS[id].rarity } : { icon: PLACEHOLDER[slot], dim: true });
        }
        this.foot.setInfo(`${me.coins} coins`);
        this.fillStats(me);
    }

    private fillStats (me: ReturnType<ScreenCtx['me']>) {
        const d = derived(me);
        const rows: [string, number][] = [
            [`${(Math.round(me.hearts * 2) / 2)} / ${d.maxHearts}`, PAL.blossom],
            [`${Math.floor(me.energy)} / ${d.maxEnergy}`, PAL.gold],
            [`${me.level}  (${Math.floor(me.xp)} / ${xpToNextOf(me)} xp)`, PAL.plum],
            [`${d.toolPower}`, PAL.lime],
            [`${(Math.round(d.weapon.dmg * 10) / 10)}  (${d.weapon.wtype})`, PAL.berry],
            [`${Math.round(d.armor * 100) / 100}`, PAL.foam],
            [`${Math.round((d.speed / TUNING.moveSpeed) * 100)}%`, PAL.cream],
            [`${(Math.round((d.reach / TILE) * 10) / 10).toFixed(1)} tiles`, PAL.cream],
            [`${Math.round(d.luck * 100)}%`, PAL.lime],
            [`${Math.round(d.crit * 100)}%`, PAL.gold],
            [`+${Math.round((d.xpMul - 1) * 100)}%`, PAL.plum],
            [`${me.points} unspent`, PAL.gold],
        ];
        rows.forEach(([v, c], i) => this.stats.set(i, v, c));
    }

    focusSearch () { this.search.focus(); }

    destroy () { this.search.destroy(); this.win.destroy(); }
}
