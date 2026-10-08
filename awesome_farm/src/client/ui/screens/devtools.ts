// The Developer screen (a secret: see ui/devunlock.ts for how it is opened). A big window with five tabs: Player, Items, Spawn, World and Info.
// It only ever sends `devdo` commands: the simulation (shared/sim/dev.ts) decides whether to do them and what to say about it, so this
// screen works the same in solo, in the single-file build and on a server that has unlocked it for you. Everything is plain text and
// numbers and the usual kit buttons, laid out for a phone (big hit areas, bigger text) as well as a mouse.

import type * as Phaser from 'phaser';
import { TILE, UNDER_Y, WORLD_TILES } from '../../../shared/config';
import { BIOME_DEFS } from '../../../shared/data/biomes';
import { SPECIES, SPECIES_LIST, type SpeciesId } from '../../../shared/data/creatures';
import { ITEM_ORDER, ITEMS, RARITY_NAMES, type ItemId } from '../../../shared/data/items';
import { BOSS_KINDS, MOBS, WILD_KINDS, type MobKind } from '../../../shared/data/mobs';
import { NODES, type NodeKind } from '../../../shared/data/nodes';
import { PROTOCOL } from '../../../shared/net/protocol';
import { PAL } from '../../../shared/palette';
import { SEASONS, seasonDay, seasonOf } from '../../../shared/season';
import type { DevCmd } from '../../../shared/sim/dev';
import { countOf, MAX_LEVEL, xpToNextOf } from '../../../shared/sim/stats';
import type { Cmd, PlayerS } from '../../../shared/sim/types';
import { isTouchUi } from '../../input/layout';
import type { GameEvents } from '../../scenes/Game';
import { button, fit, hideTip, onTap, SearchBox, shrinkToFit, Slot, tipOn, Win, type Btn, type Obj, type Placed } from '../kit';
import { panel, STYLES, type PanelStyle } from '../px';
import { itemTip } from '../tips';
import { tutorialApi } from '../tutorial';
import type { Screen, ScreenCtx } from './types';

const W = 936, H = 512;
const GAP = 6;
type Tab = 'player' | 'items' | 'spawn' | 'world' | 'info';
const TABS: { id: Tab; label: string }[] = [
    { id: 'player', label: 'PLAYER' }, { id: 'items', label: 'ITEMS' }, { id: 'spawn', label: 'SPAWN' }, { id: 'world', label: 'WORLD' }, { id: 'info', label: 'INFO' },
];
type Cat = 'mob' | 'boss' | 'creature' | 'node';
const CATS: { id: Cat; label: string; ids: string[]; name: (id: string) => string }[] = [
    { id: 'mob', label: 'Monsters', ids: WILD_KINDS, name: (id) => MOBS[id as MobKind].name },
    { id: 'boss', label: 'Bosses', ids: BOSS_KINDS, name: (id) => MOBS[id as MobKind].name },
    { id: 'creature', label: 'Creatures', ids: SPECIES_LIST, name: (id) => SPECIES[id as SpeciesId].name },
    { id: 'node', label: 'Nodes', ids: Object.keys(NODES), name: (id) => NODES[id as NodeKind].name },
];
const ITEM_CATS: { id: string; label: string; match: (id: ItemId) => boolean }[] = [
    { id: 'all', label: 'All', match: () => true },
    { id: 'gear', label: 'Gear', match: (i) => ITEMS[i].kind === 'gear' },
    { id: 'food', label: 'Food', match: (i) => ITEMS[i].kind === 'food' },
    { id: 'potion', label: 'Potions', match: (i) => ITEMS[i].kind === 'potion' },
    { id: 'material', label: 'Mats', match: (i) => ITEMS[i].kind === 'material' },
    { id: 'seed', label: 'Seeds', match: (i) => ITEMS[i].kind === 'seed' },
    { id: 'misc', label: 'Misc', match: (i) => ITEMS[i].kind === 'misc' },
];
const KIND_NAMES: Record<string, string> = { material: 'Material', food: 'Food', seed: 'Seed', potion: 'Potion', gear: 'Gear', misc: 'Other' };
const ROWS = 8;
const n0 = (n: number) => Math.round(n).toLocaleString('en-US');
type Text = Phaser.GameObjects.Text;

/** One button the screen lays out: what it says, what it does, and (for a switch) when it is on. */
interface Chip { text: string; run: () => void; style?: PanelStyle; on?: () => boolean; label?: () => string; tip?: string }
/** A column being filled from the top. */
interface Flow { x: number; y: number; w: number }

export class DevToolsScreen implements Screen {
    private win: Win;
    private tab: Tab = 'player';
    private page: Obj[] = [];
    private live: (() => void)[] = [];
    private tabBtns: Btn[] = [];
    private status: Text;
    private statusT = 0;
    private dirty = false;
    private acc = 0;
    private touch = isTouchUi();
    private bh = this.touch ? 38 : 30;
    private fs = this.touch ? 14 : 13;
    private small = fit(12);
    // what the pickers hold between visits to a tab
    private lvTo: number;
    private dayTo: number;
    private tx: number;
    private ty: number;
    private cat: Cat = 'mob';
    private pick: Record<Cat, string> = { mob: WILD_KINDS[0], boss: BOSS_KINDS[0], creature: SPECIES_LIST[0], node: 'tree' };
    private count = 1;
    private lv = 0;
    private at: 'front' | 'feet' = 'front';
    private elite = false;
    // the items tab
    private itemCat = 'all';
    private query = '';
    private itemList: ItemId[] = [];
    private itemOff = 0;
    private search: SearchBox | null = null;
    private rows: { id: ItemId | null; key: string; slot: Slot; name: Text; sub: Text; btns: Btn[] }[] = [];
    private emptyT: Text | null = null;
    private bar: Phaser.GameObjects.Graphics | null = null;
    private onFloat = (d: GameEvents['hud:float']) => this.say(d.text);
    private onToast = (d: GameEvents['hud:toast']) => this.say(d.text);
    private onBanner = (d: GameEvents['hud:banner']) => this.say(d.text);

    constructor (private ctx: ScreenCtx) {
        const s = ctx.scene, me = ctx.me();
        this.lvTo = Math.min(MAX_LEVEL, me.level + 5);
        this.dayTo = ctx.farm.clock.day + 1;
        this.tx = Math.floor(me.x / TILE); this.ty = Math.floor(me.y / TILE);
        this.win = new Win(s, { size: 'large', title: 'Developer', icon: 'k_gear', accent: PAL.plum, onClose: () => ctx.close() });
        const w = this.win;
        const g = s.add.graphics();
        w.put(g, 0, 0);
        panel(g, 14, 74, W - 28, 408, { ...STYLES.deep, rim: PAL.night });
        const tw = Math.floor((W - 28 - (TABS.length - 1) * GAP) / TABS.length);
        TABS.forEach((t, i) => {
            const b = button(s, 0, 0, tw, this.touch ? 38 : 32, t.label, () => { this.tab = t.id; this.dirty = true; }, { style: STYLES.dark, size: this.touch ? 15 : 14 });
            w.put(b.root, 14 + i * (tw + GAP) + tw / 2, 54);
            this.tabBtns.push(b);
        });
        this.status = w.text('', 22, H - 22, this.small, PAL.lime, { origin: [0, 0.5], bold: false });
        ctx.farm.events.on('hud:float', this.onFloat);
        ctx.farm.events.on('hud:toast', this.onToast);
        ctx.farm.events.on('hud:banner', this.onBanner);
        this.build();
    }

    // ── building a tab ──────────────────────────────────────────────────────
    private clear () {
        hideTip();
        this.search?.destroy(); this.search = null;
        for (const o of this.page) o.destroy();
        this.page = []; this.live = []; this.rows = []; this.bar = null; this.emptyT = null;
    }

    private build () {
        this.clear();
        this.tabBtns.forEach((b, i) => b.setStyle(TABS[i].id === this.tab ? STYLES.plum : STYLES.dark));
        if (this.tab === 'player') this.buildPlayer();
        else if (this.tab === 'items') this.buildItems();
        else if (this.tab === 'spawn') this.buildSpawn();
        else if (this.tab === 'world') this.buildWorld();
        else this.buildInfo();
        this.refresh();
    }

    private get pitch () { return this.bh + 5; }
    private cols (): Flow[] {
        const w = Math.floor((W - 56 - 2 * 14) / 3);
        return [0, 1, 2].map((i) => ({ x: 28 + i * (w + 14), y: 84, w }));
    }

    private put<T extends Placed> (o: T, x: number, y: number): T { this.page.push(o); return this.win.put(o, x, y); }
    private text (s: string, x: number, y: number, size: number, color: number, o: Parameters<Win['text']>[5] = {}) {
        const t = this.win.text(s, x, y, size, color, o);
        this.page.push(t);
        return t;
    }
    private head (f: Flow, s: string) { this.text(s, f.x, f.y, this.fs, PAL.gold, { font: 'head' }); f.y += 20; }
    /** A line that is re-read a few times a second (a number that changes as you press things). */
    private line (f: Flow, get: () => string, color: number = PAL.cream, size = this.small, lines = 1) {
        const t = this.text('', f.x, f.y, size, color, { bold: false, wrap: f.w });
        this.live.push(() => { const s = get(); if (t.text !== s) t.setText(s); });
        f.y += Math.ceil(size * 1.45) * lines + 6;
    }

    private chip (x: number, y: number, w: number, c: Chip): Btn {
        const b = button(this.ctx.scene, 0, 0, w, this.bh, c.text, c.run, { style: c.style ?? STYLES.dark, size: this.fs });
        shrinkToFit(b.root.list[1] as Text, w - 12, 11);
        this.put(b.root, x + w / 2, y + this.bh / 2);
        if (c.tip) tipOn(b.zone, () => ({ title: c.text, lines: [{ t: c.tip!, c: PAL.pebble }] }));
        if (c.on || c.label) {
            this.live.push(() => {
                if (c.on) b.setStyle(c.on() ? STYLES.lime : STYLES.dark);
                if (c.label) { const s = c.label(); const t = b.root.list[1] as Text; if (t.text !== s) { b.setLabel(s); shrinkToFit(t, w - 12, 11); } }
            });
        }
        return b;
    }

    /** A row (or rows) of equal buttons, `per` to a row. */
    private row (f: Flow, chips: Chip[], per = chips.length) {
        const cw = Math.floor((f.w - (per - 1) * GAP) / per);
        chips.forEach((c, i) => this.chip(f.x + (i % per) * (cw + GAP), f.y + Math.floor(i / per) * this.pitch, cw, c));
        f.y += Math.ceil(chips.length / per) * this.pitch;
    }

    /** − − value + +: the value is a button of its own (what it does is `run`). */
    private stepper (f: Flow, o: { get: () => number; set: (n: number) => void; min: number; max: number; steps: [number, number]; center: (n: number) => string; run?: (n: number) => void; style?: PanelStyle }) {
        const bw = this.touch ? 44 : 42, mid = f.w - 4 * bw - 4 * GAP;
        const set = (d: number) => { o.set(Math.max(o.min, Math.min(o.max, o.get() + d))); centre.setLabel(o.center(o.get())); };
        const at = (i: number) => f.x + (i < 2 ? i * (bw + GAP) : i === 2 ? 2 * (bw + GAP) : 2 * (bw + GAP) + mid + GAP + (i - 3) * (bw + GAP));
        this.chip(at(0), f.y, bw, { text: `-${o.steps[0]}`, run: () => set(-o.steps[0]) });
        this.chip(at(1), f.y, bw, { text: `-${o.steps[1]}`, run: () => set(-o.steps[1]) });
        const centre = this.chip(at(2), f.y, mid, { text: o.center(o.get()), run: () => o.run?.(o.get()), style: o.style ?? STYLES.dark });
        this.chip(at(3), f.y, bw, { text: `+${o.steps[1]}`, run: () => set(o.steps[1]) });
        this.chip(at(4), f.y, bw, { text: `+${o.steps[0]}`, run: () => set(o.steps[0]) });
        f.y += this.pitch;
    }

    // ── sending ─────────────────────────────────────────────────────────────
    /** Ask for an op. The answer (floats, toasts, banners) is echoed on the status line, since toasts wait while a window is open. */
    private op (c: Omit<DevCmd, 't'>) {
        this.ctx.send({ t: 'devdo', ...c } as Cmd);
    }
    private say (s: string) {
        if (!this.status.active) return;
        this.status.setText(`› ${s}`).setAlpha(1);
        this.statusT = 4;
    }
    private doOp (c: Omit<DevCmd, 't'>) { return () => this.op(c); }
    private me (): PlayerS { return this.ctx.me(); }

    // ── PLAYER ──────────────────────────────────────────────────────────────
    private buildPlayer () {
        const [a, b, c] = this.cols();
        // level, points, coins
        this.head(a, 'LEVEL AND XP');
        this.line(a, () => { const m = this.me(); return `Level ${m.level}${m.level >= MAX_LEVEL ? ' (top)' : `  ·  XP ${Math.floor(m.xp)} / ${xpToNextOf(m)}`}\nSkill points ${m.points}  ·  Coins ${n0(m.coins)}`; }, PAL.cream, fit(13), 2);
        this.row(a, [{ text: '+1 level', run: this.doOp({ op: 'level', n: 1 }) }, { text: '+5', run: this.doOp({ op: 'level', n: 5 }) }, { text: '+10', run: this.doOp({ op: 'level', n: 10 }) }]);
        this.stepper(a, { get: () => this.lvTo, set: (n) => { this.lvTo = n; }, min: 1, max: MAX_LEVEL, steps: [10, 1], center: (n) => `Set level ${n}`, run: (n) => this.op({ op: 'levelTo', n }), style: STYLES.gold });
        this.row(a, [{ text: '+100 XP', run: this.doOp({ op: 'xp', n: 100 }) }, { text: '+1k', run: this.doOp({ op: 'xp', n: 1000 }) }, { text: '+10k', run: this.doOp({ op: 'xp', n: 10000 }) }]);
        this.row(a, [{ text: '+1 point', run: this.doOp({ op: 'points', n: 1 }) }, { text: '+5', run: this.doOp({ op: 'points', n: 5 }) }, { text: '+20', run: this.doOp({ op: 'points', n: 20 }) }]);
        this.row(a, [{ text: '+1k coins', run: this.doOp({ op: 'coins', n: 1000 }) }, { text: '+100k', run: this.doOp({ op: 'coins', n: 100000 }) }, { text: '+10M', run: this.doOp({ op: 'coins', n: 10000000 }) }]);
        // body
        this.head(b, 'BODY');
        this.row(b, [{ text: 'Full heal', run: this.doOp({ op: 'heal' }), tip: 'Full hearts and energy (and back on your feet).' }, { text: 'Revive me', run: this.doOp({ op: 'revive' }) }], 2);
        this.row(b, [
            { text: 'God mode', label: () => `God mode: ${this.me().buffs.some((x) => x.id === 'devgod') ? 'ON' : 'off'}`, on: () => this.me().buffs.some((x) => x.id === 'devgod'), run: this.doOp({ op: 'god' }), tip: 'Nothing can hurt you.' },
            { text: 'Speed', label: () => `Speed x2: ${this.me().buffs.some((x) => x.id === 'devspeed') ? 'ON' : 'off'}`, on: () => this.me().buffs.some((x) => x.id === 'devspeed'), run: this.doOp({ op: 'speed' }), tip: 'Twice as fast on your feet and with your tool.' },
        ], 2);
        this.row(b, [{ text: 'Hurt me', run: this.doOp({ op: 'hurt', n: 1 }), tip: 'One heart of damage, with your armour counted (does nothing in god mode).' }, { text: 'Knock me out', run: this.doOp({ op: 'down' }), style: STYLES.berry }], 2);
        this.row(b, [
            { text: 'Freeze me', run: this.doOp({ op: 'co', id: 'frozen' }), tip: 'Frozen solid as a boss would: a friend thaws you, or you thaw by yourself in a few seconds.' }, { text: 'Hex me', run: this.doOp({ op: 'co', id: 'hexed' }), tip: 'A curse that ticks and gets worse: stand next to a friend to pass it on.' },
            { text: 'Chain me', run: this.doOp({ op: 'co', id: 'tether' }), tip: 'Chained to the nearest friend who is free.' }, { text: 'Clear', run: this.doOp({ op: 'co', id: 'clear' }) },
        ], 2);
        this.row(b, [{ text: 'Best gear on', run: this.doOp({ op: 'gear' }), tip: 'The strongest pick, weapon, hat, armour, charm and pack in the game, all worn.' }, { text: 'Starter kit', run: this.doOp({ op: 'kit' }), tip: 'Tools, food, potions, building materials, seeds and pods.' }], 2);
        this.row(b, [{ text: 'Empty backpack', run: this.doOp({ op: 'wipe' }), style: STYLES.berry, tip: 'Everything you carry goes (what you wear stays).' }, { text: 'Add a pet…', run: () => { this.tab = 'spawn'; this.cat = 'creature'; this.dirty = true; }, tip: 'Pick a creature on the Spawn tab and press "Add as pet".' }], 2);
        this.row(b, [{ text: 'Pet: Fond', run: this.doOp({ op: 'affection', n: 40 }), tip: 'Your companion is Fond of you (40) with a fresh day: pet it once and it digs up a gift.' }, { text: 'Pet: Shy', run: this.doOp({ op: 'affection', n: 0 }), tip: 'Back to no affection at all.' }], 2);
        // unlocks
        this.head(c, 'UNLOCK');
        this.row(c, [{ text: 'Every skill', run: this.doOp({ op: 'skills' }), tip: 'Every skill at its top rank, for free.' }, { text: 'Refund skills', run: this.doOp({ op: 'respec' }), tip: 'Take every skill back and get the points.' }], 2);
        this.row(c, [{ text: 'Next chapter', run: this.doOp({ op: 'story' }), tip: 'Finish the current story chapter (its reward is paid).' }, { text: 'Whole story', run: this.doOp({ op: 'story', id: 'all' }) }], 2);
        this.row(c, [{ text: 'All medals', run: this.doOp({ op: 'medals' }) }, { text: 'All bosses beaten', run: this.doOp({ op: 'bosses' }), tip: 'Opens every expedition tier.' }], 2);
        this.row(c, [{ text: 'All creatures met', run: this.doOp({ op: 'dex' }) }, { text: 'Refresh dailies', run: this.doOp({ op: 'refresh' }), tip: 'A free wheel spin, the rift of the day and new bounties.' }], 2);
        this.row(c, [
            { text: 'Replay tutorial', run: () => { tutorialApi.replay(); this.say('Tutorial restarted'); }, tip: 'Starts the coach cards again from the first step.' },
            { text: 'Forget tips', run: () => { try { localStorage.removeItem('awesome_farm_hints_v1'); this.say('Tips and hints forgotten (they show again after a reload)'); } catch { /* private mode */ } } },
        ], 2);
        this.row(c, [{ text: 'Lay a potluck table', run: this.doOp({ op: 'feast' }), tip: 'A Table in front of you with four dishes (or restock the one beside you). Press E at it to feast.' }], 2);
    }

    // ── ITEMS ───────────────────────────────────────────────────────────────
    private buildItems () {
        const s = this.ctx.scene, w = this.win;
        const top = 86;
        this.search = new SearchBox(w, 30, top + this.bh / 2, 240, (q) => { this.query = q; this.itemOff = 0; this.fillItems(); }, this.touch ? 'Search items' : 'Search items ( / )');
        this.search.value = this.query;
        this.search.el.value = this.query;
        const kit = this.touch ? 118 : 104, x0 = 28 + 252, avail = W - 28 - kit - 12 - x0, catW = Math.floor((avail - (ITEM_CATS.length - 1) * GAP) / ITEM_CATS.length);
        ITEM_CATS.forEach((c, i) => this.chip(x0 + i * (catW + GAP), top, catW, { text: c.label, run: () => { this.itemCat = c.id; this.itemOff = 0; this.fillItems(); }, on: () => this.itemCat === c.id }));
        this.chip(W - 28 - kit, top, kit, { text: 'Starter kit', run: this.doOp({ op: 'kit' }), style: STYLES.lime, tip: 'Tools, food, potions, building materials, seeds and pods.' });
        const y0 = top + this.bh + 10, rowH = this.touch ? 46 : 44;
        this.bar = this.put(s.add.graphics(), 0, 0);
        for (let i = 0; i < ROWS; i++) {
            const y = y0 + i * rowH;
            const slot = new Slot(s, 0, 0, this.touch ? 40 : 38);
            this.page.push(slot.root);
            w.putAt(slot.root, 30, y + 2);
            const name = this.text('', 78, y + 2, fit(14), PAL.cream, { font: 'head' });
            const sub = this.text('', 78, y + 22, this.small, PAL.pebble, { bold: false });
            const row = { id: null as ItemId | null, key: '', slot, name, sub, btns: [] as Btn[] };
            const amounts = [1, 10, 100, 999];
            const bw = this.touch ? 66 : 62;
            amounts.forEach((n, k) => {
                const b = this.chip(W - 28 - (amounts.length - k) * (bw + GAP) + GAP, y + 2, bw, { text: `+${n}`, run: () => { if (row.id) this.op({ op: 'item', id: row.id, n }); } });
                row.btns.push(b);
            });
            onTap(slot.interactive, () => { if (row.id) this.op({ op: 'item', id: row.id, n: 1 }); });
            tipOn(slot.interactive, () => (row.id ? itemTip(row.id, { count: countOf(this.me(), row.id), foot: 'Click to take one' }) : null));
            this.rows.push(row);
        }
        this.live.push(() => this.fillItems(true));
        this.fillItems();
    }

    private fillItems (countsOnly = false) {
        const q = this.query;
        if (!countsOnly) {
            const cat = ITEM_CATS.find((c) => c.id === this.itemCat) ?? ITEM_CATS[0];
            this.itemList = ITEM_ORDER.filter((id) => cat.match(id) && (!q || ITEMS[id].name.toLowerCase().includes(q) || id.includes(q)));
            this.itemOff = Math.max(0, Math.min(this.itemOff, this.itemList.length - ROWS));
        }
        const me = this.me();
        this.rows.forEach((r, i) => {
            const id = this.itemList[this.itemOff + i] ?? null;
            r.id = id;
            r.slot.root.setVisible(!!id);
            r.name.setVisible(!!id); r.sub.setVisible(!!id);
            for (const b of r.btns) { b.root.setVisible(!!id); if (b.zone.input) b.zone.input.enabled = !!id; }
            if (!id) return;
            const it = ITEMS[id], have = countOf(me, id);
            const key = `${id}:${have}`;
            if (r.key !== key) { r.key = key; r.slot.set({ icon: `i_${id}`, rarity: it.rarity, count: have }); }
            if (r.name.text !== it.name) r.name.setText(it.name);
            const sub = `${KIND_NAMES[it.kind]} · ${RARITY_NAMES[it.rarity]}  ·  you have ${n0(have)}`;
            if (r.sub.text !== sub) r.sub.setText(sub);
        });
        this.drawBar();
        if (!this.itemList.length && !this.emptyT) this.emptyT = this.text('No item matches.', W / 2, 250, 14, PAL.pebble, { origin: [0.5, 0.5] });
        this.emptyT?.setVisible(!this.itemList.length);
    }
    private drawBar () {
        const g = this.bar;
        if (!g) return;
        g.clear();
        const total = this.itemList.length, top = 86 + this.bh + 10, h = ROWS * (this.touch ? 46 : 44) - 6, x = W - 22;
        if (total <= ROWS) return;
        g.fillStyle(PAL.ink, 1).fillRect(x, top, 5, h);
        const th = Math.max(14, Math.round((ROWS / total) * h)), ty = Math.round((this.itemOff / (total - ROWS)) * (h - th));
        g.fillStyle(PAL.cream, 0.85).fillRect(x + 1, top + ty, 3, th);
    }

    // ── SPAWN ───────────────────────────────────────────────────────────────
    private buildSpawn () {
        const cat = CATS.find((c) => c.id === this.cat)!;
        const left: Flow = { x: 28, y: 84, w: 122 }, mid: Flow = { x: 162, y: 84, w: 488 }, right: Flow = { x: 664, y: 84, w: W - 28 - 664 };
        this.head(left, 'WHAT');
        for (const c of CATS) this.row(left, [{ text: c.label, run: () => { this.cat = c.id; if (c.id === 'boss') this.count = 1; this.dirty = true; }, on: () => this.cat === c.id }]);
        this.text(this.touch ? 'Pick one, set the amount, press Spawn.' : 'Pick one, set the amount and press Spawn.', left.x, left.y + 6, this.small, PAL.pebble, { bold: false, wrap: left.w });
        // the kinds
        this.head(mid, cat.label.toUpperCase());
        const per = 4, cw = Math.floor((mid.w - (per - 1) * GAP) / per);
        cat.ids.forEach((id, i) => this.chip(mid.x + (i % per) * (cw + GAP), mid.y + Math.floor(i / per) * this.pitch, cw, {
            text: cat.name(id), run: () => { this.pick[cat.id] = id; this.dirty = true; }, on: () => this.pick[cat.id] === id, tip: this.describe(cat.id, id),
        }));
        // what is picked, and how
        const id = this.pick[cat.id];
        this.text(cat.name(id), right.x, right.y, fit(17), PAL.cream, { font: 'head' });
        right.y += this.touch ? 26 : 24;
        const about = this.text(this.describe(cat.id, id), right.x, right.y, this.small, PAL.pebble, { bold: false, wrap: right.w });
        right.y += Math.ceil(about.height) + 8;
        if (cat.id !== 'boss') {
            this.head(right, 'HOW MANY');
            const max = cat.id === 'mob' ? 50 : cat.id === 'creature' ? 20 : 30;
            this.count = Math.min(this.count, max);
            this.stepper(right, { get: () => this.count, set: (n) => { this.count = n; }, min: 1, max, steps: [5, 1], center: (n) => `${n}` });
        }
        if (cat.id === 'mob' || cat.id === 'creature') {
            this.head(right, 'LEVEL');
            const auto = cat.id === 'mob', max = cat.id === 'mob' ? MAX_LEVEL : 30;
            this.lv = Math.max(auto ? 0 : 1, Math.min(this.lv, max));
            this.stepper(right, { get: () => this.lv, set: (n) => { this.lv = n; }, min: auto ? 0 : 1, max, steps: [10, 1], center: (n) => (n ? `Lv ${n}` : 'auto') });
        }
        if (cat.id !== 'boss') {
            this.row(right, [
                { text: 'In front', run: () => { this.at = 'front'; }, on: () => this.at === 'front' },
                { text: 'At my feet', run: () => { this.at = 'feet'; }, on: () => this.at === 'feet' },
            ], 2);
        }
        if (cat.id === 'mob') this.row(right, [{ text: 'Elite', label: () => `Elite: ${this.elite ? 'yes' : 'no'}`, on: () => this.elite, run: () => { this.elite = !this.elite; } }]);
        const go = () => this.op({ op: cat.id, id: this.pick[cat.id], n: this.count, lv: this.lv, at: this.at, elite: this.elite });
        this.row(right, [{ text: cat.id === 'boss' ? 'Summon boss' : 'Spawn', run: go, style: STYLES.gold }]);
        if (cat.id === 'creature') this.row(right, [{ text: 'Add as pet', run: () => this.op({ op: 'pet', id: this.pick.creature, lv: Math.max(1, this.lv) }), style: STYLES.lime, tip: 'Straight into your roster (it counts for the quests, as a catch does).' }]);
    }

    private describe (cat: Cat, id: string): string {
        if (cat === 'mob' || cat === 'boss') { const d = MOBS[id as MobKind]; return `${d.desc} HP ${d.hp}, hits for ${d.dmg}, tier ${d.tier}.`; }
        if (cat === 'creature') { const d = SPECIES[id as SpeciesId]; return `${d.desc}  ${['Common', 'Uncommon', 'Rare', 'Legendary'][d.rarity]} ${d.element}.`; }
        const d = NODES[id as NodeKind];
        return `${d.name}: ${d.hp} hit${d.hp > 1 ? 's' : ''} to break, ${d.xp} XP.`;
    }

    // ── WORLD ───────────────────────────────────────────────────────────────
    private buildWorld () {
        const [a, b, c] = this.cols();
        const f = this.ctx.farm;
        this.head(a, 'TIME OF DAY');
        this.row(a, [{ text: 'Dawn', run: this.doOp({ op: 'time', id: 'dawn' }) }, { text: 'Noon', run: this.doOp({ op: 'time', id: 'noon' }) }, { text: 'Dusk', run: this.doOp({ op: 'time', id: 'dusk' }) }, { text: 'Midnight', run: this.doOp({ op: 'time', id: 'midnight' }) }], 2);
        this.head(a, 'DAY');
        this.line(a, () => { const d = f.clock.day, s = SEASONS[seasonOf(d)]; return `Day ${d}  ·  ${s.name} ${seasonDay(d)} of 7  ·  ${f.clock.night ? 'night' : 'day'}`; });
        this.row(a, [{ text: 'Next day', run: () => this.op({ op: 'day', n: f.clock.day + 1 }) }, { text: '+7', run: () => this.op({ op: 'day', n: f.clock.day + 7 }) }, { text: '+30', run: () => this.op({ op: 'day', n: f.clock.day + 30 }) }]);
        this.stepper(a, { get: () => this.dayTo, set: (n) => { this.dayTo = n; }, min: 1, max: 9999, steps: [10, 1], center: (n) => `Go to day ${n}`, run: (n) => this.op({ op: 'day', n }), style: STYLES.gold });
        this.head(a, 'NIGHT EVENTS');
        this.row(a, [{ text: 'Blood Moon', run: this.doOp({ op: 'event', id: 'bloodmoon' }), style: STYLES.berry }, { text: 'Meteors', run: this.doOp({ op: 'event', id: 'meteors' }) }, { text: 'Fairies', run: this.doOp({ op: 'event', id: 'fairies' }) }], 3);
        this.head(b, 'CLEAN UP');
        this.row(b, [{ text: 'Kill monsters near', run: this.doOp({ op: 'killNear' }) }, { text: 'Kill every monster', run: this.doOp({ op: 'killAll' }), tip: 'Bosses and wardens too (no rewards). Expedition monsters stay.' }], 2);
        this.row(b, [{ text: 'Clear dropped items', run: this.doOp({ op: 'clearDrops' }) }]);
        this.head(b, 'FREE LAND');
        this.line(b, () => `${f.world.ownedPlots().length} plot${f.world.ownedPlots().length === 1 ? '' : 's'} raised, ${this.me().plotsBought} bought by you`, PAL.pebble);
        this.row(b, [{ text: '+1 plot', run: this.doOp({ op: 'land', n: 1 }) }, { text: '+5', run: this.doOp({ op: 'land', n: 5 }) }, { text: '+10', run: this.doOp({ op: 'land', n: 10 }) }]);
        this.head(b, 'PLACES');
        this.row(b, [{ text: 'Home', run: this.doOp({ op: 'tp', id: 'home' }) }, { text: 'Old Heart', run: this.doOp({ op: 'tp', id: 'heart' }), tip: 'The middle of the world. If nobody has raised it yet it is raised for the visit.' }, { text: 'Caves (here)', run: this.doOp({ op: 'tp', id: 'cave' }), tip: 'Down through a mine shaft if you stand beside one, else straight in under this spot.' }, { text: 'Surface', run: this.doOp({ op: 'tp', id: 'surface' }) }], 2);
        this.head(c, 'DREAD REACHES');
        this.row(c, [0, 1, 2, 3].map((n) => ({ text: `${n + 1}`, run: this.doOp({ op: 'tp', id: 'dread', n }), tip: `Dread block ${n + 1}, a little south of its warden.` })));
        this.head(c, 'RIFT ISLANDS');
        this.row(c, [0, 1, 2, 3].map((n) => ({ text: `${n + 1}`, run: this.doOp({ op: 'tp', id: 'rift', n }) })));
        this.head(c, 'FRIENDS');
        const others = Object.values(f.players).filter((p) => p.id !== f.me && p.online).slice(0, 4);
        if (others.length) this.row(c, others.map((p) => ({ text: p.name.slice(0, 9), run: this.doOp({ op: 'tp', id: 'player', who: p.id }) })), Math.min(4, others.length));
        else { this.text('Nobody else is here.', c.x, c.y + 2, this.small, PAL.pebble, { bold: false }); c.y += this.pitch; }
        this.head(c, 'COORDINATES (TILES)');
        this.stepper(c, { get: () => this.tx, set: (n) => { this.tx = n; }, min: 0, max: WORLD_TILES - 1, steps: [25, 1], center: (n) => `X ${n}` });
        this.stepper(c, { get: () => this.ty, set: (n) => { this.ty = n; }, min: 0, max: UNDER_Y + WORLD_TILES - 1, steps: [25, 1], center: (n) => `Y ${n}` });
        this.row(c, [{ text: 'Go', run: () => this.op({ op: 'tp', id: 'xy', x: this.tx, y: this.ty }), style: STYLES.gold, tip: `Y from ${UNDER_Y} down is the caves.` }, { text: 'Use my spot', run: () => { const m = this.me(); this.tx = Math.floor(m.x / TILE); this.ty = Math.floor(m.y / TILE); this.dirty = true; } }], 2);
    }

    // ── INFO ────────────────────────────────────────────────────────────────
    private buildInfo () {
        const f = this.ctx.farm;
        const wide = Math.floor((W - 56 - 28) / 2);
        const half: Flow = { x: 28, y: 84, w: wide }, right: Flow = { x: 28 + wide + 28, y: 84, w: wide };
        const size = fit(14), pitch = Math.ceil(size * 1.35) + 4;
        const lines = (fl: Flow, title: string, list: [string, () => string][]) => {
            this.head(fl, title);
            for (const [k, get] of list) {
                this.text(k, fl.x, fl.y, size, PAL.pebble, { bold: false });
                const v = this.text('', fl.x + fl.w, fl.y, size, PAL.cream, { origin: [1, 0], bold: false });
                this.live.push(() => { const s = get(); if (v.text !== s) v.setText(s); });
                fl.y += pitch;
            }
        };
        const ents = () => { const n: Record<string, number> = {}; for (const e of Object.values(f.ents)) n[e.k] = (n[e.k] ?? 0) + 1; return n; };
        lines(half, 'LIVE', [
            ['Frames per second', () => `${Math.round(f.game.loop.actualFps)}`],
            ['Simulation, per frame', () => { const ms = (f.conn as { stepMs?: number }).stepMs; return ms === undefined ? 'on the server' : `${ms.toFixed(2)} ms`; }],
            ['Things the game knows about', () => `${Object.keys(f.ents).length}`],
            ['  resource nodes / buildings', () => `${ents().node ?? 0} / ${ents().bld ?? 0}`],
            ['  monsters / creatures', () => `${ents().mob ?? 0} / ${ents().crit ?? 0}`],
            ['  dropped items / shots', () => `${ents().drop ?? 0} / ${ents().proj ?? 0}`],
            ['Farmers online', () => `${Object.values(f.players).filter((p) => p.online).length}`],
            ['You are at (tile)', () => { const m = this.me(); const x = Math.floor(m.x / TILE), y = Math.floor(m.y / TILE); return `${x}, ${y}${m.y >= UNDER_Y * TILE ? '  (caves)' : ''}`; }],
            ['You are on', () => { const m = this.me(), p = f.world.plotAtPx(m.x, m.y); return m.y >= UNDER_Y * TILE ? 'the caves' : p ? `${BIOME_DEFS[p.biome].name}${p.heart ? ' (the Old Heart)' : ''}` : 'the sea'; }],
        ]);
        lines(right, 'WORLD', [
            ['Where', () => (f.conn.mode === 'solo' ? 'Solo, in this browser' : `Online: ${f.conn.label}`)],
            ['Server name', () => f.serverName || '-'],
            ['Protocol', () => `${PROTOCOL}`],
            ['Seed', () => f.world.seed || '-'],
            ['Day', () => { const d = f.clock.day; return `${d}  (${SEASONS[seasonOf(d)].name} ${seasonDay(d)})`; }],
            ['Clock', () => `${Math.floor(f.clock.clock)} s into the ${f.clock.night ? 'night' : 'day'}`],
            ['Plots raised / bought by you', () => `${f.world.ownedPlots().length} / ${this.me().plotsBought}`],
            ['God mode / speed boost', () => `${this.me().buffs.some((x) => x.id === 'devgod') ? 'on' : 'off'} / ${this.me().buffs.some((x) => x.id === 'devspeed') ? 'on' : 'off'}`],
            ['Build', () => (import.meta.env.DEV ? 'development' : 'release')],
        ]);
    }

    // ── per frame ───────────────────────────────────────────────────────────
    private refresh () { for (const f of this.live) f(); }

    update (dt: number) {
        if (this.dirty) { this.dirty = false; this.build(); }
        this.acc += dt;
        if (this.acc >= 0.2) { this.acc = 0; this.refresh(); }
        if (this.statusT > 0) { this.statusT -= dt; this.status.setAlpha(Math.min(1, this.statusT)); }
        if (!this.me().dev) this.ctx.close();                  // the unlock is gone (the connection was replaced): nothing here would work
    }

    wheel (dy: number) {
        if (this.tab !== 'items') return;
        const max = Math.max(0, this.itemList.length - ROWS), next = Math.max(0, Math.min(max, this.itemOff + (dy > 0 ? 1 : -1)));
        if (next !== this.itemOff) { this.itemOff = next; this.fillItems(); }
    }

    focusSearch () { this.search?.focus(); }

    onKey (k: string) {
        if (k === 'ArrowRight' || k === 'ArrowLeft') {
            const i = TABS.findIndex((t) => t.id === this.tab);
            this.tab = TABS[(i + (k === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length].id;
            this.dirty = true;
            return true;
        }
        if (this.tab === 'items' && (k === 'ArrowDown' || k === 'ArrowUp')) { this.wheel(k === 'ArrowDown' ? 1 : -1); return true; }
        return false;
    }

    destroy () {
        this.ctx.farm.events.off('hud:float', this.onFloat);
        this.ctx.farm.events.off('hud:toast', this.onToast);
        this.ctx.farm.events.off('hud:banner', this.onBanner);
        this.clear();
        this.win.destroy();
    }
}
