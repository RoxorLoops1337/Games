// Build menu: categories on the left, a grid of buildings in the middle, what the chosen one is and costs on the right.

import * as Phaser from 'phaser';
import { BUILD_CATS, BUILD_ORDER, BUILDINGS, BuildCat, BuildingKind, STATION_NAMES } from '../../../shared/data/buildings';
import { HOWTO } from '../../../shared/data/howto';
import { Res, resName } from '../../../shared/data/items';
import { lockedWords } from '../../../shared/data/skills';
import { PAL } from '../../../shared/palette';
import { listedBuildCats } from '../../../shared/sim/listed';
import { canAfford, hasUnlock, have, scaledCost } from '../../../shared/sim/stats';
import { extent } from '../../../shared/blueprint';
import { GridItem, ItemGrid } from '../grid';
import { CostList, deviceText, Footer, forDevice, GAP, icon, onTap, SearchBox, Section, ts, Win } from '../kit';
import { hex, inset, panel, rect, STYLES } from '../px';
import { buildingIcon, buildingTip } from '../tips';
import { layoutPreview, type Preview } from '../preview';
import type { Screen, ScreenCtx } from './types';

export class BuildScreen implements Screen {
    private win: Win;
    private cat: BuildCat = 'craft';
    private selected: BuildingKind | null = null;
    private grid: ItemGrid;
    private catSec: Section;
    private listG: Phaser.GameObjects.Graphics;
    private rowText: Phaser.GameObjects.Text[] = [];
    private rowIcon: Phaser.GameObjects.Image[] = [];
    private rowZone: Phaser.GameObjects.Zone[] = [];
    /** The categories shown: those with at least one building you have unlocked. Others appear as the skill tree opens them. */
    private vis: BuildCat[] = [];
    private bldSec: Section;
    private det: Section;
    private dIcon: Phaser.GameObjects.Image;
    private dDesc: Phaser.GameObjects.Text;
    private dHow: Phaser.GameObjects.Text;
    private dNeeds: Phaser.GameObjects.Text;
    private costs: CostList;
    private prev: Preview | null = null;
    private prevKind = '';
    private foot: Footer;
    private key = '';
    private lastClick = { kind: '' as string, t: 0 };
    private search: SearchBox;
    private readonly rowH: number;

    constructor (private ctx: ScreenCtx) {
        const s = ctx.scene;
        this.win = new Win(s, { size: 'large', title: 'Build', icon: 'k_hammer', accent: PAL.lime, onClose: () => ctx.close() });
        const w = this.win;
        this.foot = w.footer({ primary: { label: 'Build', onClick: () => this.place(), w: 130 }, hint: '' });
        const body = w.body, cy = w.top + w.toolH / 2, sw = 230;
        w.text(deviceText('Pick a building, then Build and click the ground to put it down.', 'Pick a building, then Build and tap the ground to put it down.'), body.x, cy, ts('cap'), PAL.pebble, { origin: [0, 0.5], bold: false, wrap: body.w - sw - 24 });
        this.search = new SearchBox(w, body.x + body.w - sw, cy, sw, () => { this.key = ''; }, deviceText('Search every building  ( / )', 'Search buildings…'));
        const top = w.under.y, h = w.under.h;
        // categories
        this.catSec = w.section(body.x, top, 170, h, 'Categories');
        this.listG = w.put(s.add.graphics(), 0, 0);
        this.rowH = Math.min(36, Math.floor(this.catSec.inner.h / BUILD_CATS.length));
        BUILD_CATS.forEach((c, i) => {
            const y = this.catSec.inner.y + i * this.rowH;
            this.rowIcon.push(w.put(icon(s, c.icon === 'wall_wood' || c.icon === 'chest_b' || c.icon === 'workbench' || c.icon === 'furnace' || c.icon === 'bed' || c.icon === 'lantern' || c.icon === 'fence' || c.icon === 'market' ? c.icon : 'k_hammer', 0, 0, 1), this.catSec.inner.x + 16, y + this.rowH / 2));
            this.rowText.push(w.text(c.name, this.catSec.inner.x + 32, y + this.rowH / 2, ts('body'), PAL.cream, { origin: [0, 0.5] }));
            const z = w.put(s.add.zone(0, 0, this.catSec.inner.w, this.rowH - 2).setOrigin(0).setInteractive({ useHandCursor: true }), this.catSec.inner.x, y);
            this.rowZone.push(z);
            // a row belongs to its own category: hidden ones leave gaps in BUILD_CATS, so `vis[i]` would be some other row's
            onTap(z, () => { if (!this.vis.includes(c.id)) return; this.cat = c.id; this.selected = null; this.key = ''; });
        });
        // the buildings of that category
        const fitG = ItemGrid.fit(326 - 20, h - 47, 46, 4);
        const gw = fitG.cols * 50 - 4 + 10 + 20;
        this.bldSec = w.section(body.x + 170 + GAP, top, gw, h, '', { right: '' });
        this.grid = new ItemGrid(w, this.bldSec.inner.x, this.bldSec.inner.y, fitG.cols, fitG.rows, 46, 4, 'Nothing here.');   // 46px cells: six columns fit left of the details panel
        // what the chosen one is, what it costs and how it is used
        const dx = body.x + 170 + GAP + gw + GAP;
        this.det = w.section(dx, top, body.x + body.w - dx, h, 'Details', { right: '' });
        const di = this.det.inner;
        inset(w.g, di.x, di.y, 64, 64, PAL.deepSea, PAL.slate);
        this.dIcon = w.put(s.add.image(0, 0, 'bed', 0).setScale(2), di.x + 32, di.y + 32);
        this.dDesc = w.text('', di.x + 76, di.y + 1, ts('body'), PAL.cream, { bold: false, wrap: di.w - 80 });
        this.dNeeds = w.text('Needs', di.x, di.y + 76, ts('body'), PAL.pebble, { font: 'head' });
        this.costs = new CostList(w, di.x, di.y + 100, di.w, 6);
        this.dHow = w.text('', di.x, di.y + 160, ts('body'), PAL.lime, { bold: false, wrap: di.w });
    }

    private place () {
        if (!this.selected) return;
        const me = this.ctx.me(), def = BUILDINGS[this.selected];
        if (!hasUnlock(me, def.req) || !canAfford(me, scaledCost(me, def.cost))) return;
        const kind = this.selected;
        this.ctx.close();
        this.ctx.farm.startPlacing(kind);
    }

    wheel (dy: number, x: number, y: number) { if (this.grid.contains(x, y)) this.grid.scroll(dy); }

    onKey (k: string) {
        if (k === 'Enter') { this.place(); return true; }
        return false;
    }

    focusSearch () { this.search.focus(); }

    update () {
        const me = this.ctx.me();
        const vis = listedBuildCats(me);
        const k = JSON.stringify([me.inv, me.coins, me.skills, this.cat, this.selected, this.search.value, vis]);
        if (k === this.key) return;
        this.key = k;
        this.vis = vis;
        if (!this.vis.includes(this.cat)) { this.cat = this.vis[0] ?? 'craft'; this.selected = null; }
        const g = this.listG, ci = this.catSec.inner;
        g.clear();
        BUILD_CATS.forEach((c, i) => {
            const vi = vis.indexOf(c.id), shown = vi >= 0;
            this.rowIcon[i].setVisible(shown); this.rowText[i].setVisible(shown); this.rowZone[i].setVisible(shown);
            if (this.rowZone[i].input) this.rowZone[i].input!.enabled = shown;
            if (!shown) return;
            const y = ci.y + vi * this.rowH, on = c.id === this.cat && !this.search.value;
            this.win.at(this.rowIcon[i], ci.x + 16, y + this.rowH / 2); this.win.at(this.rowText[i], ci.x + 32, y + this.rowH / 2); this.win.at(this.rowZone[i], ci.x, y);
            if (on) panel(g, ci.x, y, ci.w, this.rowH - 2, { ...STYLES.gold, r: 2 }); else rect(g, ci.x + 4, y + this.rowH - 2, ci.w - 8, 1, PAL.slate, 0.3);
            this.rowText[i].setColor(hex(on ? PAL.ink : PAL.cream)).setShadow(on ? 0 : 1, on ? 0 : 1, hex(PAL.ink), 0, false, !on);
        });
        const kinds = this.search.value ? BUILD_ORDER.filter((b) => this.search.matches(BUILDINGS[b].name, BUILDINGS[b].desc)) : BUILD_ORDER.filter((b) => BUILDINGS[b].cat === this.cat);
        if (!this.selected || !kinds.includes(this.selected)) this.selected = kinds[0] ?? null;
        const tex = this.ctx.scene.textures;
        const items: GridItem[] = kinds.map((kind) => {
            const def = BUILDINGS[kind];
            const locked = !hasUnlock(me, def.req);
            const ok = !locked && canAfford(me, scaledCost(me, def.cost));
            const src = { width: tex.get(buildingIcon(def)).get(0).realWidth, height: tex.get(buildingIcon(def)).get(0).realHeight };
            const scale = Math.max(1, Math.min(3, Math.floor(40 / Math.max(src.width, src.height))));
            return {
                data: { icon: buildingIcon(def), scale, dim: !ok, overlay: locked ? 'k_lock' : undefined, rarity: 0 },
                tip: () => buildingTip(me, kind),
                click: () => {
                    const now = this.ctx.scene.time.now;
                    if (this.selected === kind && this.lastClick.kind === kind && now - this.lastClick.t < 400) { this.place(); return; }
                    this.lastClick = { kind, t: now };
                    this.selected = kind; this.key = '';
                },
            };
        });
        this.bldSec.setTitle(this.search.value ? 'Search results' : BUILD_CATS.find((c) => c.id === this.cat)?.name ?? 'Buildings');
        this.bldSec.setRight(`${kinds.length}`);
        this.grid.setItems(items);
        this.drawDetail(me);
    }

    private drawDetail (me: ReturnType<ScreenCtx['me']>) {
        this.costs.set([]);
        const none = !this.selected;
        this.dIcon.setVisible(!none); this.dDesc.setVisible(!none); this.dNeeds.setVisible(!none); this.dHow.setVisible(!none);
        if (!this.selected) { this.foot.primary!.setEnabled(false); this.foot.setHint('Nothing to build here yet: learn more in the skill tree.'); this.det.setTitle('Details'); this.det.setRight(''); return; }
        const kind = this.selected, def = BUILDINGS[kind], di = this.det.inner;
        const tx = this.ctx.scene.textures;
        const fr = tx.get(buildingIcon(def)).get(0);
        this.dIcon.setTexture(buildingIcon(def), 0).setScale(Math.max(1, Math.min(3, Math.floor(56 / Math.max(fr.realWidth, fr.realHeight)))));
        this.det.setTitle(def.name);
        this.det.setRight(`${def.size[0]}×${def.size[1]} tiles${def.station && STATION_NAMES[def.station] !== def.name ? ` · ${STATION_NAMES[def.station]} recipes` : ''}`);
        this.dDesc.setText(forDevice(def.desc));
        // the costs, have against need
        const cost = scaledCost(me, def.cost);
        const entries = Object.entries(cost) as [Res, number][];
        let y = di.y + Math.max(76, Math.ceil(this.dDesc.height) + 12);
        this.win.at(this.dNeeds, di.x, y);
        y += Math.round(ts('body') * 1.2) + 8;
        this.costs.set(entries.map(([res, need]) => ({ res, name: resName(res), have: have(me, res), need })), y);
        y += entries.length * this.costs.pitch + 4;
        // how it is used, in one line, and (for the automation buildings) a tiny floor plan of it at work
        const how = HOWTO[kind];
        this.dHow.setText(how ? `How to use: ${forDevice(how.how)}` : '');
        this.win.at(this.dHow, di.x, y);
        y += how ? Math.ceil(this.dHow.height) + 6 : 0;
        if (this.prevKind !== kind) {
            this.prev?.root.destroy(); this.prev = null;
            this.prevKind = kind;
        }
        if (how?.example) {
            // the biggest picture that fits between the costs and the bottom of the section
            const room = di.y + di.h - (y + 2);
            let scale = 2, size = { w: 0, h: 0 };
            for (; scale >= 1; scale--) { size = { w: extent(how.example.items).w * 16 * scale, h: extent(how.example.items).h * 16 * scale + (scale < 2 ? 26 : 14) }; if (size.w <= di.w && size.h <= room) break; }
            if (!this.prev) {
                this.prev = layoutPreview(this.ctx.scene, how.example.items, { scale: Math.max(1, scale), marks: how.example.marks });
                this.win.putAt(this.prev.root, di.x + Math.round((di.w - this.prev.w) / 2), y + 2 + this.prev.pad);
            }
        }
        const locked = !hasUnlock(me, def.req);
        const afford = canAfford(me, cost);
        this.foot.setHint(locked ? lockedWords(def.req) : !afford ? 'Not enough materials yet: the red numbers show what is missing.' : how?.example ? deviceText('Ready: press Build, then click where it should go.', 'Ready: tap Build, then tap where it should go.') : deviceText('Double-click a building to place it fast.', 'Double-tap a building to place it fast.'), locked || !afford ? PAL.berry : PAL.pebble);
        this.foot.primary!.setEnabled(!locked && afford);
    }

    destroy () { this.search.destroy(); this.win.destroy(); }
}
