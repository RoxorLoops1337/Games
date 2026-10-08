// Crafting: pick a workshop along the top, a recipe on the left, what it needs and the Craft button on the right.

import * as Phaser from 'phaser';
import { ORDER_STATIONS, STATION_NAMES, StationId } from '../../../shared/data/buildings';
import { ITEMS, Res, resName } from '../../../shared/data/items';
import { RECIPES, Recipe, recipesFor } from '../../../shared/data/recipes';
import { UNLOCK_INFO } from '../../../shared/data/skills';
import { PAL } from '../../../shared/palette';
import { listedStations } from '../../../shared/sim/listed';
import { affordIn, chestsAround, haveIn, timesIn } from '../../../shared/sim/pool';
import { countOf, hasUnlock } from '../../../shared/sim/stats';
import { GridItem, ItemGrid } from '../grid';
import { CostList, deviceText, Footer, GAP, Section, SearchBox, ts, TabBar, Win } from '../kit';
import { hex, inset, RARITY_TEXT } from '../px';
import { recipeTip } from '../tips';
import { canStaff, stripH, WorkerStrip } from '../workercard';
import type { Screen, ScreenCtx } from './types';

const STATIONS: StationId[] = ['hand', 'workbench', 'anvil', 'kitchen', 'loom', 'alchemy'];
const ICONS: Record<StationId, string> = { hand: 'k_fist', workbench: 'workbench', anvil: 'anvil', kitchen: 'kitchen', loom: 'loom', alchemy: 'alchemy', altar: 'altar', riftforge: 'riftforge' };
const TAB_NAMES: Partial<Record<StationId, string>> = { hand: 'By hand', alchemy: 'Alchemy' };

export class CraftScreen implements Screen {
    private win: Win;
    private station: StationId;
    private selected: string | null = null;
    private grid: ItemGrid;
    private tabs: TabBar;
    private recSec: Section;
    private det: Section;
    private dIcon: Phaser.GameObjects.Image;
    private dDesc: Phaser.GameObjects.Text;
    private dNeeds: Phaser.GameObjects.Text;
    private costs: CostList;
    private foot: Footer;
    private emptyNote: Phaser.GameObjects.Text;
    private bandNote: Phaser.GameObjects.Text;
    private key = '';
    private search: SearchBox;
    private strip: WorkerStrip;

    constructor (private ctx: ScreenCtx, arg?: unknown) {
        const s = ctx.scene;
        const want = (arg as { station?: StationId } | undefined)?.station;
        this.station = want ?? (STATIONS.find((st) => st !== 'hand' && ctx.farm.stationNear(st)) ?? 'hand');
        this.win = new Win(s, { size: 'large', title: 'Crafting', icon: 'k_anvil', accent: PAL.gold, onClose: () => ctx.close() });
        const w = this.win;
        this.foot = w.footer({
            primary: { label: 'Craft', onClick: () => this.craft(1) },
            extras: [{ label: '×5', onClick: () => this.craft(5), w: 56 }, { label: 'Max', onClick: () => this.craft(999), w: 64 }],
            hint: deviceText('Pick a recipe, then Craft. Hover a recipe to see what it needs.', 'Pick a recipe, then Craft.'),
        });
        const body = w.body, cy = w.top + w.toolH / 2;
        // the toolbar: which workshop, and a search through every recipe
        const sw = 190;
        this.tabs = new TabBar(w, body.x, cy, STATIONS.map((st) => ({ id: st, label: TAB_NAMES[st] ?? STATION_NAMES[st], icon: ICONS[st], iconScale: 1 })), this.station, (id) => { this.station = id as StationId; this.selected = null; this.key = ''; }, { maxW: body.w - sw - 16, tip: (id) => this.stationTip(id as StationId) });
        this.search = new SearchBox(w, body.x + body.w - sw, cy, sw, () => { this.key = ''; }, deviceText('Search every recipe  ( / )', 'Search recipes…'));
        // below: the recipes, what the chosen one is and needs, and (at a workshop) the creature working there
        const top = w.under.y, stripY = body.y + body.h - stripH(), h = stripY - GAP - top;
        const g = ItemGrid.fit(476 - 20, h - 47, 46, 4);
        const leftW = g.cols * 50 - 4 + 10 + 20;
        this.recSec = w.section(body.x, top, leftW, h, 'Recipes', { right: '' });
        this.grid = new ItemGrid(w, this.recSec.inner.x, this.recSec.inner.y, g.cols, g.rows, 46, 4, 'No recipes here yet.');
        this.det = w.section(body.x + leftW + GAP, top, body.w - leftW - GAP, h, 'Details', { right: '' });
        const di = this.det.inner;
        inset(w.g, di.x, di.y, 64, 64, PAL.deepSea, PAL.slate);
        this.dIcon = w.put(s.add.image(0, 0, 'i_wood', 0).setScale(4), di.x + 32, di.y + 32);
        this.dDesc = w.text('', di.x + 76, di.y + 1, ts('body'), PAL.cream, { bold: false, wrap: di.w - 80 });
        this.dNeeds = w.text('Needs', di.x, di.y + 76, ts('body'), PAL.pebble, { font: 'head' });
        this.costs = new CostList(w, di.x, di.y + 76 + Math.round(ts('body') * 1.2) + 8, di.w, 5);
        this.emptyNote = w.text('Pick a recipe on the left.', di.x + di.w / 2, di.y + di.h / 2, ts('body'), PAL.pebble, { origin: [0.5, 0.5], align: 'center', bold: false, wrap: di.w - 40 });
        // a creature at this workshop works through orders: the strip along the bottom shows it, and takes the order
        this.strip = new WorkerStrip({
            ctx, win: w, x: body.x, y: stripY, w: body.w,
            bld: () => (ORDER_STATIONS.includes(this.station) ? ctx.farm.stationNear(this.station) : null),
            back: () => ({ name: 'craft', arg: { station: this.station } }),
            recipe: () => this.selected,
        });
        this.bandNote = w.text('', body.x + 12, stripY + stripH() / 2, ts('cap'), PAL.pebble, { origin: [0, 0.5], bold: false, wrap: body.w - 24 });
    }

    private stationTip (st: StationId) {
        const near = st === 'hand' || !!this.ctx.farm.stationNear(st);
        const lines = [{ t: near ? 'Available — you are close enough to use it.' : `Build a ${STATION_NAMES[st]} and stand next to it.`, c: near ? PAL.lime : PAL.berry }];
        return { title: STATION_NAMES[st], color: PAL.cream, lines };
    }

    private craft (n: number) {
        const r = this.selected ? RECIPES[this.selected] : null;
        if (!r) return;
        const me = this.ctx.me();
        let max = n;
        if (n > 25) {
            max = Math.min(25, timesIn(me, chestsAround(Object.values(this.ctx.farm.ents), me.x, me.y), r.in));
            if (max <= 0) max = 1;
        }
        this.ctx.send({ t: 'craft', recipe: r.id, n: max });
    }

    wheel (dy: number, x: number, y: number) { if (this.grid.contains(x, y)) this.grid.scroll(dy); }

    update () {
        this.strip.update();
        const me = this.ctx.me(), f = this.ctx.farm;
        const near = Object.fromEntries(STATIONS.map((st) => [st, st === 'hand' || !!f.stationNear(st)]));
        // a station is listed once its building is unlocked in the skill tree (the Workbench and your hands always are), or when you stand at one
        const vis = listedStations(me, STATIONS, (st) => near[st]);
        const chests = chestsAround(Object.values(f.ents), me.x, me.y);
        const k = JSON.stringify([me.inv, me.points, Object.keys(me.skills).length, this.station, this.selected, near, this.search.value, vis, chests.map((c) => [c.id, c.inv])]);
        if (k === this.key) return;
        this.key = k;
        if (!vis.includes(this.station) && !this.search.value) { this.station = vis[0] ?? 'hand'; this.selected = null; }
        // the workshops along the top: only the ones you have, a green dot on the one you stand next to
        this.tabs.layout(vis);
        this.tabs.set(this.search.value ? '' : this.station);
        for (const st of STATIONS) { this.tabs.setMark(st, st !== 'hand' && near[st] ? PAL.lime : null); this.tabs.setDim(st, !near[st]); }
        // recipes
        // a search looks through every station's recipes (by what it makes or what it needs)
        const list = this.search.value
            ? STATIONS.flatMap((st) => recipesFor(st)).filter((r) => this.search.matches(ITEMS[r.out].name, ...Object.keys(r.in).map((res) => resName(res as Res))))
            : recipesFor(this.station);
        const items: GridItem[] = list.map((r) => {
            const ok = affordIn(me, chests, r.in) && hasUnlock(me, r.req) && near[r.station];
            const locked = !hasUnlock(me, r.req);
            return {
                data: { icon: `i_${r.out}`, count: r.n > 1 ? r.n : undefined, rarity: ITEMS[r.out].rarity, dim: !ok, overlay: locked ? 'k_lock' : undefined },
                tip: () => recipeTip(me, r),
                click: () => { this.selected = r.id; this.key = ''; },
            };
        });
        if (!this.selected || !list.find((r) => r.id === this.selected)) this.selected = list[0]?.id ?? null;
        this.recSec.setTitle(this.search.value ? 'Search results' : `${STATION_NAMES[this.station]} recipes`);
        this.recSec.setRight(`${list.length} recipe${list.length === 1 ? '' : 's'}`);
        this.grid.setItems(items);
        this.drawDetail(me, near, chests);
        // under the lists: the worker's strip at a workshop, and otherwise what a workshop is for
        // (a farmer with no creature and no Taming yet is not told about workers at all: nothing they could act on)
        const staff = canStaff(me);
        const stripOn = staff && ORDER_STATIONS.includes(this.station) && !!f.stationNear(this.station);
        this.bandNote.setVisible(!stripOn).setText(this.station === 'hand' ? `No workshop needed: these you can make anywhere.${staff ? ' Build a workshop and a creature can run it for you.' : ''}` : staff ? `A creature can run the ${STATION_NAMES[this.station]} for you: open it (stand next to it, ${deviceText('press E', 'tap USE')}) and choose "Put a creature to work".` : '');
    }

    private drawDetail (me: ReturnType<ScreenCtx['me']>, near: Record<string, boolean>, chests: ReturnType<typeof chestsAround>) {
        const r: Recipe | null = this.selected ? RECIPES[this.selected] : null;
        this.costs.set([]);
        for (const b of [this.foot.primary!, ...this.foot.extras]) b.setEnabled(false);
        this.dNeeds.setVisible(!!r); this.dDesc.setVisible(!!r); this.dIcon.setVisible(!!r);
        this.emptyNote.setVisible(!r);
        if (!r) {
            this.det.setTitle('Details'); this.det.setRight('');
            this.foot.setHint('Pick a recipe on the left.');
            return;
        }
        const def = ITEMS[r.out];
        this.det.setTitle(`${r.n > 1 ? r.n + '× ' : ''}${def.name}`);
        this.det.head?.setColor(hex(RARITY_TEXT[def.rarity]));
        this.det.setRight(`${STATION_NAMES[r.station]}${def.gear ? ` · ${def.gear.slot}` : ''}`);
        this.dIcon.setTexture(`i_${r.out}`, 0);
        const lines = [def.desc];
        const have = countOf(me, r.out);
        if (def.gear?.power) lines.push(`Mining power ${def.gear.power}`);
        if (def.gear?.dmg) lines.push(`Damage ${def.gear.dmg} (${def.gear.wtype})`);
        if (def.food) lines.push(`Restores ${def.food} energy`);
        if (def.heal) lines.push(`Heals ${def.heal} ♥`);
        if (have > 0) lines.push(`You have ${have}`);
        this.dDesc.setText(lines.join('\n'));
        // what it needs, have against need
        const entries = Object.entries(r.in) as [Res, number][];
        const below = this.det.inner.y + Math.max(76, Math.ceil(this.dDesc.height) + 12);
        this.win.at(this.dNeeds, this.det.inner.x, below);
        this.costs.set(entries.map(([res, need]) => ({ res, name: resName(res), have: haveIn(me, chests, res), need })), below + Math.round(ts('body') * 1.2) + 8);
        const locked = !hasUnlock(me, r.req);
        const atStation = near[r.station];
        const afford = affordIn(me, chests, r.in);
        const viaChests = entries.some(([res, need]) => res !== 'coin' && haveIn(me, [], res) < need && haveIn(me, chests, res) >= need);
        const note = locked ? `Locked: ${UNLOCK_INFO[r.req!] ?? r.req}` : !atStation ? `Stand next to a ${STATION_NAMES[r.station]} to craft this.` : !afford ? 'Not enough materials yet: the red numbers show what is missing.' : '';
        this.foot.setHint(note || (viaChests ? 'Uses what is in the chests nearby.' : deviceText('Craft one, ×5, or as many as you can (Max).', 'Craft one, ×5, or as many as you can (Max).')), note ? PAL.berry : viaChests ? PAL.lime : PAL.pebble);
        const can = !locked && atStation && afford;
        for (const b of [this.foot.primary!, ...this.foot.extras]) b.setEnabled(can);
    }

    focusSearch () { this.search.focus(); }

    destroy () { this.search.destroy(); this.win.destroy(); }
}
