// Your creatures: the roster with everything about the selected one, the workforce (who is working where, and how it is
// going), and a bestiary of every species with where to find it and what it is good at.

import { critTex } from '../../art/storybook-critters';
import type * as Phaser from 'phaser';
import {
    AWAKENINGS, catchChance, ELEMENT_COLOR, ELEMENT_NAME, PET_MAX_LEVEL, petAtk, petMaxHp, Pet, petXpNeed, POD_POWER, RARITY_COLORS, RARITY_NAMES,
    SPECIES_LIST, spOf, STAR_MAX, STAR_POWER, STAR_WORK, starsOf, STATUS_INFO, TRAITS, WORK_INFO, WORK_KINDS, workCycle, FIELD_INFO, FIELD_TASKS, type WorkKind,
} from '../../../shared/data/creatures';
import { BIOME_DEFS } from '../../../shared/data/biomes';
import { AFFECTION_MAX, levelInfo } from '../../../shared/data/bond';
import { BUILDINGS } from '../../../shared/data/buildings';
import { ITEMS, ItemId, iconOf } from '../../../shared/data/items';
import { SKILL_LIST } from '../../../shared/data/skills';
import { PAL } from '../../../shared/palette';
import { isWorking, petsOf, rosterCap, workSlots } from '../../../shared/sim/petlib';
import { countOf, derived } from '../../../shared/sim/stats';
import { isTouchUi } from '../../input/layout';
import { postText, statusOf } from '../crew';
import { button, Footer, GAP, icon, onTap, rowBox, Section, showBtn, smallScreen, TabBar, tipOn, ts, Win } from '../kit';
import { bar, hex, inset, rect, STYLES } from '../px';
import { LOCKED } from '../theme';
import { itemTip } from '../tips';
import type { Screen, ScreenCtx } from './types';

const COLS = 6, CELL = 58, GAPC = 4, CROWS = 5;
const WROWS = 9;
/** The first skill that adds job slots (the Workforce count names it, so the cap explains itself). */
const SLOT_SKILL = SKILL_LIST.find((s) => (s.mods?.creatureSlots ?? 0) > 0)?.name ?? '';
type Tab = 'roster' | 'work' | 'dex';

/** Fit a creature texture into a square of `px` pixels (whole-number scales keep it crisp). */
export function fitScale (scene: Phaser.Scene, key: string, px: number, max = 4) {
    const f = scene.textures.getFrame(key, 0);
    return Math.max(1, Math.min(max, Math.floor(px / Math.max(f.realWidth, f.realHeight))));
}

export class CreatureScreen implements Screen {
    private win!: Win;
    private g!: Phaser.GameObjects.Graphics;
    private tab: Tab = 'roster';
    private sel = 0;
    private dexSel = 0;
    private key = '';
    private tabs!: TabBar;
    private capT!: Phaser.GameObjects.Text;
    private cells: { img: Phaser.GameObjects.Image; lv: Phaser.GameObjects.Text; zone: Phaser.GameObjects.Zone }[] = [];
    private layerA!: Phaser.GameObjects.Graphics;
    private layerB!: Phaser.GameObjects.Graphics;
    private listSec!: Section;
    private detSec!: Section;
    private workSec!: Section;
    private foot!: Footer;
    private face!: Phaser.GameObjects.Image;
    private nameT!: Phaser.GameObjects.Text;
    private subT!: Phaser.GameObjects.Text;
    private lvT!: Phaser.GameObjects.Text;
    private statT!: Phaser.GameObjects.Text;
    private affT!: Phaser.GameObjects.Text;
    private statusT!: Phaser.GameObjects.Text;
    private descT!: Phaser.GameObjects.Text;
    private traitT: Phaser.GameObjects.Text[] = [];
    private workT: Phaser.GameObjects.Text[] = [];
    private workI: Phaser.GameObjects.Image[] = [];
    private taskT: Phaser.GameObjects.Text[] = [];
    private workZ: Phaser.GameObjects.Zone[] = [];
    private btns: Record<string, ReturnType<typeof button>> = {};
    private feedIcons: Phaser.GameObjects.Image[] = [];
    private feedZones: Phaser.GameObjects.Zone[] = [];
    private feedItems: ItemId[] = [];
    private feedT!: Phaser.GameObjects.Text;
    private skillNote!: Phaser.GameObjects.Text;
    // the workforce tab
    private wEmptyT!: Phaser.GameObjects.Text;
    private wHead: Phaser.GameObjects.Text[] = [];
    private wRows: { face: Phaser.GameObjects.Image; name: Phaser.GameObjects.Text; sub: Phaser.GameObjects.Text; job: Phaser.GameObjects.Text; stat: Phaser.GameObjects.Text; made: Phaser.GameObjects.Text; change: ReturnType<typeof button>; home: ReturnType<typeof button> }[] = [];
    private t = 0;
    private armUntil = 0;       // release needs a second tap before this time
    private dx!: number;
    private dy!: number;
    private dw!: number;
    private wy!: number;
    private wcols: number[] = [];

    constructor (private ctx: ScreenCtx, arg: unknown) {
        const a = (arg ?? {}) as { tab?: Tab; pet?: string };
        if (a.tab) this.tab = a.tab;
        if (a.pet) this.sel = Math.max(0, petsOf(ctx.me()).findIndex((p) => p.id === a.pet));
        this.buildFrame();
        this.buildRoster();
        this.buildDetail();
        this.buildWorkforce();
    }

    /** The window, its footer buttons, the tab bar and the framed sections (the roster and the detail pane share one layer, the workforce has its own). */
    private buildFrame () {
        const ctx = this.ctx, s = ctx.scene;
        this.win = new Win(s, { size: 'large', title: 'Creatures', icon: 'k_paw', accent: PAL.blossom, onClose: () => ctx.close() });
        const w = this.win;
        this.foot = w.footer({
            primary: { label: 'Give a job…', w: 150, onClick: () => this.job() },
            extras: [{ label: 'Call home', w: 120, onClick: () => this.pet('unassign') }, { label: 'Awaken', w: 130, onClick: () => { const p = this.cur(); if (p) ctx.send({ t: 'pet', op: 'awaken', pet: p.id }); } }, { label: 'Take along', w: 130, style: STYLES.lime, onClick: () => this.pet('companion') }],
            secondary: [{ label: 'Rename', w: 100, onClick: () => this.rename() }, { label: 'Release', w: 100, style: STYLES.berry, onClick: () => this.pet('release') }],
            hint: '',
        });
        this.btns = { job: this.foot.primary!, unassign: this.foot.extras[0], awaken: this.foot.extras[1], companion: this.foot.extras[2], rename: this.foot.secondary[0], release: this.foot.secondary[1] };
        const body = w.body, cy = w.top + w.toolH / 2;
        this.tabs = new TabBar(w, body.x, cy, [{ id: 'roster', label: 'Roster' }, { id: 'work', label: 'Workforce' }, { id: 'dex', label: 'Bestiary' }], this.tab, (id) => { this.tab = id as Tab; this.key = ''; }, { minW: 110 });
        this.capT = w.text('', body.x + body.w, cy, ts('body'), PAL.pebble, { origin: [1, 0.5], font: 'head' });
        // two layers for the frames, so a tab can take its own away
        this.layerA = w.put(s.add.graphics(), 0, 0);
        this.layerB = w.put(s.add.graphics(), 0, 0);
        const top = w.under.y, h = w.under.h, lw = COLS * (CELL + GAPC) - GAPC + 20;
        this.listSec = w.section(body.x, top, lw, h, 'Your creatures', { right: '', layer: this.layerA });
        this.detSec = w.section(body.x + lw + GAP, top, body.w - lw - GAP, h, undefined, { layer: this.layerA });
        this.workSec = w.section(body.x, top, body.w, h, 'Working creatures', { right: '', layer: this.layerB });
        this.g = w.put(s.add.graphics(), 0, 0);
    }

    /** The roster cells (the Bestiary uses the same cells for its species). */
    private buildRoster () {
        const ctx = this.ctx, s = ctx.scene, w = this.win;
        const li = this.listSec.inner;
        for (let i = 0; i < COLS * CROWS; i++) {
            const x = li.x + (i % COLS) * (CELL + GAPC), y = li.y + Math.floor(i / COLS) * (CELL + GAPC);
            const img = w.put(icon(s, 'px', 0, 0, 2), x + CELL / 2, y + CELL / 2 - 4).setVisible(false);
            const lv = w.text('', x + CELL - 5, y + CELL - 4, ts('cap'), PAL.cream, { origin: [1, 1], stroke: 3, dark: true });
            const zone = s.add.zone(0, 0, CELL, CELL).setOrigin(0).setInteractive({ useHandCursor: true });
            w.put(zone, x, y);
            this.cells.push({ img, lv, zone });
            onTap(zone, () => { if (this.tab === 'roster') this.sel = i; else this.dexSel = Math.min(i, SPECIES_LIST.length - 1); this.key = ''; });
            tipOn(zone, () => {
                if (this.tab === 'roster') {
                    const p = petsOf(ctx.me())[i];
                    if (!p) return null;
                    const job = p.post ? `${postText(ctx.farm.world.plots, ctx.farm.ents, p)}: ${STATUS_INFO[statusOf(p)].text}` : p.den !== undefined ? 'Working in a den' : ctx.me().comp === p.id ? 'Your companion' : 'Resting';
                    const bond = levelInfo(p);
                    return { title: p.name, color: ELEMENT_COLOR[spOf(p.sp).element], sub: `${spOf(p.sp).name} · Lv ${p.lv}`, lines: [{ t: job, c: PAL.pebble }, { t: `${bond.level.name}  ${bond.aff} / ${AFFECTION_MAX}`, c: bond.level.color }] };
                }
                const id = SPECIES_LIST[i];
                if (!id) return null;
                return (ctx.me().dex ?? []).includes(id) ? { title: spOf(id).name, color: RARITY_COLORS[spOf(id).rarity], sub: RARITY_NAMES[spOf(id).rarity] } : { title: '???', color: PAL.pebble, lines: [{ t: 'You have not befriended this one yet.', c: PAL.pebble }] };
            });
        }
    }

    /** The chosen creature: portrait, name and level, stats, traits, the work table, the status line and the feed row. */
    private buildDetail () {
        const ctx = this.ctx, s = ctx.scene, w = this.win;
        const di = this.detSec.inner;
        this.dx = di.x; this.dy = di.y; this.dw = di.w;
        inset(w.g, di.x, di.y, 112, 112, PAL.deepSea, PAL.slate);
        this.face = w.put(icon(s, 'px', 0, 0, 4), di.x + 56, di.y + 56);
        const tx = di.x + 126;
        this.nameT = w.text('', tx, di.y - 2, 20, PAL.cream, { font: 'head' });
        this.subT = w.text('', tx, di.y + 26, ts('body'), PAL.pebble, { bold: false });
        this.lvT = w.text('', tx, di.y + 26 + Math.round(ts('body') * 1.2) + 2, ts('body'), PAL.cream, { bold: false });
        this.statT = w.text('', tx, di.y + 84, ts('body'), PAL.foam, { bold: false, wrap: di.w - 130 });
        this.affT = w.text('', di.x + di.w - 2, di.y + 2, ts('body'), PAL.blossom, { font: 'head', origin: [1, 0] });
        for (let i = 0; i < 2; i++) this.traitT.push(w.text('', tx + i * 160, di.y + 84 + Math.round(ts('body') * 1.2) + 2, ts('cap'), PAL.gold, { bold: false }));
        this.descT = w.text('', di.x, di.y + 120, ts('cap'), PAL.pebble, { bold: false, wrap: di.w });
        this.wy = di.y + 176;
        const colW = Math.floor(di.w / 2);
        for (let i = 0; i < WORK_KINDS.length; i++) {
            const col = Math.floor(i / 4), row = i % 4, x = di.x + col * colW, y = this.wy + row * 24;
            const kind = WORK_KINDS[i];
            this.workI.push(w.put(icon(s, WORK_INFO[kind].icon, 0, 0, 1), x + 12, y + 10));
            this.workT.push(w.text('', x + 26, y + 10, ts('body'), PAL.cream, { bold: false, origin: [0, 0.5] }));
            this.taskT.push(w.text('', x + colW - 64, y + 10, ts('cap'), PAL.pebble, { origin: [1, 0.5], bold: false }));
            const z = s.add.zone(0, 0, colW - 6, 22).setOrigin(0).setInteractive({ useHandCursor: true });
            w.put(z, x, y - 1);
            onTap(z, () => this.setTask(kind));
            tipOn(z, () => this.taskTip(kind));
            z.input!.enabled = false;
            this.workZ.push(z);
        }
        this.skillNote = w.text('', di.x, this.wy + 4 * 24 + 2, ts('cap'), PAL.pebble, { bold: false, wrap: di.w });
        this.statusT = w.text('', di.x, this.wy + 4 * 24 + (smallScreen() ? 6 : 22), ts('body'), PAL.cream, { bold: false, wrap: di.w });
        tipOn(this.btns.awaken.zone, () => {
            const p = this.cur();
            if (!p) return null;
            const star = starsOf(p), next = AWAKENINGS[star];
            if (!next) return { title: 'Fully awakened', color: PAL.gold, lines: [{ t: `${p.name} shines with all three stars.`, c: PAL.cream }] };
            const me = ctx.me();
            const lines = [
                { t: `Level ${next.lv}   (now ${p.lv})`, c: p.lv >= next.lv ? PAL.lime : PAL.berry },
                ...(Object.entries(next.cost) as [ItemId, number][]).map(([item, n]) => ({ t: `${n} ${ITEMS[item].name}   (you have ${countOf(me, item)})`, c: countOf(me, item) >= n ? PAL.lime : PAL.berry })),
                { t: `+${Math.round((STAR_POWER[star + 1] - STAR_POWER[star]) * 100)}% attack, +${Math.round((STAR_WORK[star + 1] - STAR_WORK[star]) * 100)}% work speed${star === 0 || star === 2 ? ', and a new trait' : ''}`, c: PAL.gold },
            ];
            return { title: `Awaken to ${'★'.repeat(star + 1)}`, color: PAL.gold, lines, foot: 'The stronger it gets, the more it can do' };
        });
        tipOn(this.btns.job.zone, () => ({ title: 'Give it a job', color: PAL.lime, lines: [{ t: 'Put it on an island to farm, chop, mine, haul or guard, or at a furnace, sawmill, workbench and the like. It works on its own, even while you are away.', c: PAL.cream }] }));
        tipOn(this.btns.companion.zone, () => ({ title: 'Take it along', color: PAL.lime, lines: [{ t: 'It walks beside you, fights with you and does its field task.', c: PAL.cream }] }));
        this.feedT = w.text('Feed:', di.x, di.y + di.h - 22, ts('body'), PAL.pebble, { font: 'head', origin: [0, 0.5] });
        for (let i = 0; i < 8; i++) {
            const im = w.put(icon(s, 'i_treat', 0, 0, 2), di.x + 62 + i * 40, di.y + di.h - 22);
            const zone = s.add.zone(0, 0, 36, 34).setOrigin(0.5).setInteractive({ useHandCursor: true });
            w.put(zone, di.x + 62 + i * 40, di.y + di.h - 22);
            this.feedIcons.push(im); this.feedZones.push(zone);
            onTap(zone, () => { const it = this.feedItems[i]; const p = this.cur(); if (it && p) ctx.send({ t: 'pet', op: 'feed', pet: p.id, item: it }); });
            tipOn(zone, () => { const it = this.feedItems[i]; return it ? itemTip(it, { count: countOf(ctx.me(), it), foot: 'Click to feed' }) : null; });
        }
    }

    /** The Workforce tab: a row per working creature with its job, how it is going, what it made, and the Change and Home buttons. */
    private buildWorkforce () {
        const ctx = this.ctx, s = ctx.scene, w = this.win;
        const wi = this.workSec.inner;
        this.wcols = [wi.x + 8, wi.x + 230, wi.x + 430, wi.x + 590];
        this.wHead = [['Creature', 0], ['Job', 1], ['How it is going', 2], ['Made', 3]].map(([t, c]) => w.text(t as string, this.wcols[c as number] + (c === 0 ? 46 : 0), wi.y + 2, ts('cap'), PAL.pebble, { bold: false }));
        this.wEmptyT = w.text('Nobody is working yet.\n\nPick a creature on the Roster tab and press  Give a job…\nPut it on an island to farm, chop or mine, or at a furnace, sawmill or workbench.\nIt works on its own, even while you are away.', wi.x + wi.w / 2, wi.y + wi.h / 2, ts('body'), PAL.pebble, { origin: [0.5, 0.5], align: 'center', bold: false, wrap: 560 });
        const rh = Math.min(36, Math.floor((wi.h - 24) / WROWS));
        for (let i = 0; i < WROWS; i++) {
            const y = wi.y + 24 + i * rh;
            const face = w.put(icon(s, 'px', 0, 0, 2), wi.x + 28, y + rh / 2).setVisible(false);
            const name = w.text('', this.wcols[0] + 46, y + 3, ts('body'), PAL.cream, { font: 'head' });
            const sub = w.text('', this.wcols[0] + 46, y + 3 + Math.round(ts('body') * 1.2), ts('cap'), PAL.pebble, { bold: false });
            const job = w.text('', this.wcols[1], y + rh / 2, ts('body'), PAL.cream, { bold: false, origin: [0, 0.5], wrap: 190 });
            const stat = w.text('', this.wcols[2], y + rh / 2, ts('body'), PAL.pebble, { bold: false, origin: [0, 0.5], wrap: 150 });
            const made = w.text('', this.wcols[3], y + rh / 2, ts('body'), PAL.pebble, { bold: false, origin: [0, 0.5] });
            const change = button(s, 0, 0, 76, 26, 'Change', () => { const p = this.workers()[i]; if (p) ctx.open('jobpost', { pet: p.id }); }, { style: STYLES.dark, size: 12 });
            w.put(change.root, wi.x + wi.w - 108, y + rh / 2);
            const home = button(s, 0, 0, 64, 26, 'Home', () => { const p = this.workers()[i]; if (p) ctx.send({ t: 'pet', op: 'unassign', pet: p.id }); }, { style: STYLES.gold, size: 12 });
            w.put(home.root, wi.x + wi.w - 34, y + rh / 2);
            this.wRows.push({ face, name, sub, job, stat, made, change, home });
        }
    }

    private cur (): Pet | undefined { return petsOf(this.ctx.me())[this.sel]; }
    private workers (): Pet[] { return petsOf(this.ctx.me()).filter(isWorking); }

    private job () {
        const p = this.cur();
        if (p) this.ctx.open('jobpost', { pet: p.id });
    }

    /** Click a field job to give it to this creature (it comes along and works beside you); click it again to stop. */
    private setTask (kind: WorkKind) {
        const p = this.cur();
        if (!p || this.tab !== 'roster' || !FIELD_TASKS.includes(kind) || !(spOf(p.sp).work[kind] ?? 0)) return;
        this.ctx.send({ t: 'pet', op: 'task', pet: p.id, task: p.task === kind ? null : kind });
    }

    private taskTip (kind: WorkKind) {
        const p = this.cur();
        if (!p || this.tab !== 'roster') return null;
        const apt = spOf(p.sp).work[kind] ?? 0;
        const info = WORK_INFO[kind];
        if (!apt) return { title: info.name, color: PAL.pebble, lines: [{ t: `${spOf(p.sp).name} is no good at this.`, c: PAL.pebble }] };
        if (!FIELD_TASKS.includes(kind)) return { title: info.name, color: info.color, lines: [{ t: info.desc, c: PAL.cream }], foot: 'Press  Give a job…  to put it on this' };
        return { title: `Task: ${info.name}`, color: info.color, lines: [{ t: FIELD_INFO[kind], c: PAL.cream }], foot: p.task === kind ? 'Click to stop (back to your heels)' : `Click to have ${p.name} do this beside you` };
    }
    private pet (op: 'companion' | 'rest' | 'unassign' | 'release') {
        const p = this.cur();
        if (!p) return;
        if (op === 'companion' && this.ctx.me().comp === p.id) { this.ctx.send({ t: 'pet', op: 'rest', pet: p.id }); return; }
        // a favourite asks for a second tap (a browser dialog would not work on phones or in embedded views)
        if (op === 'release' && (starsOf(p) > 0 || p.lv >= 15) && this.t >= this.armUntil) { this.armUntil = this.t + 3; this.key = ''; return; }
        this.armUntil = 0;
        this.ctx.send({ t: 'pet', op, pet: p.id });
        if (op === 'release') this.sel = Math.max(0, this.sel - 1);
    }
    private rename () {
        const p = this.cur();
        if (!p) return;
        const name = window.prompt(`Rename ${p.name}`, p.name);
        if (name) this.ctx.send({ t: 'pet', op: 'rename', pet: p.id, name });
    }

    update (dt: number) {
        this.t += dt;
        if (this.armUntil && this.t >= this.armUntil) { this.armUntil = 0; this.key = ''; }
        const me = this.ctx.me();
        const k = JSON.stringify([this.tab, this.sel, this.dexSel, petsOf(me), me.comp, me.dex, me.inv, me.skills]);
        this.face.setY(Math.round(this.face.y + Math.sin(this.t * 3) * 0.1));
        if (k === this.key) return;
        this.key = k;
        const pets = petsOf(me);
        if (this.sel >= pets.length) this.sel = Math.max(0, pets.length - 1);
        const g = this.g;
        g.clear();
        this.tabs.set(this.tab);
        const roster = this.tab !== 'work';
        this.setTabVisible(roster);
        this.capT.setText(this.tab === 'roster' ? `${pets.length} / ${rosterCap(me)} creatures` : this.tab === 'dex' ? `${(me.dex ?? []).length} / ${SPECIES_LIST.length} found` : '');
        if (this.tab === 'work') { this.showWork(); return; }
        this.hideWork();
        const li = this.listSec.inner;
        this.listSec.setTitle(this.tab === 'roster' ? 'Your creatures' : 'Every species');
        this.listSec.setRight(this.tab === 'roster' ? `${pets.length} of ${rosterCap(me)}` : `${(me.dex ?? []).length} found`);
        // grid
        const cap = rosterCap(me);
        this.cells.forEach((c, i) => {
            const x = li.x + (i % COLS) * (CELL + GAPC), y = li.y + Math.floor(i / COLS) * (CELL + GAPC);
            const isDex = this.tab === 'dex';
            const p = isDex ? undefined : pets[i];
            const spId = isDex ? SPECIES_LIST[i] : p?.sp;
            const known = isDex ? !!spId && (me.dex ?? []).includes(spId) : !!p;
            const selected = isDex ? i === this.dexSel && !!spId : i === this.sel && !!p;
            const locked = !isDex && i >= cap;
            rowBox(g, x, y, CELL, CELL, { off: locked || (isDex && !spId), on: selected });
            if (spId) {
                const sp = spOf(spId);
                c.img.setVisible(true).setTexture(critTex(this.ctx.scene, spId), 0);
                c.img.setScale(fitScale(this.ctx.scene, critTex(this.ctx.scene, spId), CELL - 14, 3));
                if (isDex && !known) c.img.setTint(PAL.ink).setAlpha(0.8); else c.img.clearTint().setAlpha(1);
                if (known) rect(g, x + 3, y + CELL - 6, CELL - 6, 3, ELEMENT_COLOR[sp.element]);
                if (p && me.comp === p.id) rect(g, x + 4, y + 4, 6, 6, PAL.gold);
                if (p && isWorking(p)) rect(g, x + 4, y + 4, 6, 6, p.post && STATUS_INFO[statusOf(p)].bad ? PAL.berry : PAL.lime);
                if (p) for (let n = 0; n < starsOf(p); n++) rect(g, x + CELL - 9 - n * 6, y + 5, 5, 5, PAL.gold);
            } else c.img.setVisible(false);
            c.lv.setText(p ? `${p.lv}` : '');
        });
        if (this.tab === 'roster') this.showPet(pets[this.sel]); else this.showSpecies(SPECIES_LIST[this.dexSel]);
    }

    /** The roster and bestiary share one set of widgets; the workforce tab has its own. */
    private setTabVisible (roster: boolean) {
        this.layerA.setVisible(roster); this.layerB.setVisible(!roster);
        this.listSec.setVisible(roster); this.detSec.setVisible(roster); this.workSec.setVisible(!roster);
        for (const c of this.cells) { c.zone.input && (c.zone.input.enabled = roster); if (!roster) { c.img.setVisible(false); c.lv.setText(''); } }
        for (const o of [this.face, this.nameT, this.subT, this.lvT, this.statT, this.affT, this.statusT, this.descT, this.feedT, this.skillNote, ...this.traitT, ...this.workT, ...this.workI, ...this.taskT]) o.setVisible(roster);
        const rosterTab = this.tab === 'roster';
        for (const b of Object.values(this.btns)) showBtn(b, rosterTab);
        this.foot.setHint(this.tab === 'roster' ? '' : this.tab === 'dex' ? 'Every kind of creature in the world. The ones you have befriended show what they are good at.' : 'Everyone who has a standing job, and how it is going. Press Change to move one, Home to rest it.');
        for (const z of this.workZ) if (z.input) z.input.enabled = false;
        this.feedIcons.forEach((im) => im.setVisible(false));
        for (const z of this.feedZones) if (z.input) z.input.enabled = false;
        this.g.setVisible(true);
    }

    private hideWork () {
        this.wEmptyT.setVisible(false);
        for (const t of this.wHead) t.setVisible(false);
        for (const r of this.wRows) { r.face.setVisible(false); for (const t of [r.name, r.sub, r.job, r.stat, r.made]) t.setVisible(false); r.change.root.setVisible(false); r.home.root.setVisible(false); }
    }

    private showWork () {
        const g = this.g, me = this.ctx.me(), f = this.ctx.farm, wi = this.workSec.inner;
        const list = this.workers();
        const bad = list.filter((p) => p.post && STATUS_INFO[statusOf(p)].bad).length;
        this.workSec.setRight(`${list.length} of ${workSlots(me)} job slots used${SLOT_SKILL ? ` (${SLOT_SKILL} adds more)` : ''}${bad ? `   ·   ${bad} need${bad === 1 ? 's' : ''} help` : ''}${list.length > WROWS ? `   (showing ${WROWS})` : ''}`, bad ? PAL.pumpkin : PAL.pebble);
        this.wEmptyT.setVisible(list.length === 0);
        for (const t of this.wHead) t.setVisible(list.length > 0);
        const rh = Math.min(36, Math.floor((wi.h - 24) / WROWS));
        this.wRows.forEach((r, i) => {
            const p = list[i], y = wi.y + 24 + i * rh;
            const on = !!p;
            r.face.setVisible(on); for (const t of [r.name, r.sub, r.job, r.stat, r.made]) t.setVisible(on);
            r.change.root.setVisible(on); r.home.root.setVisible(on);
            if (!p) return;
            const sp = spOf(p.sp), st = STATUS_INFO[p.post ? statusOf(p) : 'work'];
            rowBox(g, wi.x, y, wi.w, rh - 2, { bad: !!p.post && st.bad });
            r.face.setTexture(critTex(this.ctx.scene, p.sp), 0).setScale(fitScale(this.ctx.scene, critTex(this.ctx.scene, p.sp), rh - 6, 2));
            this.win.at(r.face, wi.x + 28, y + (rh - 2) / 2);
            r.name.setText(`${p.name}  Lv ${p.lv}`).setColor(hex(ELEMENT_COLOR[sp.element]));
            r.sub.setText(sp.name);
            r.job.setText(postText(f.world.plots, f.ents, p) || 'In a den');
            r.stat.setText(p.post ? st.text : 'Tending the den').setColor(hex(p.post ? st.color : PAL.lime));
            r.made.setText(p.post ? `${p.pn ?? 0}` : '');
            r.change.root.setVisible(!!p.post || p.den !== undefined);
            r.change.setLabel(p.post ? 'Change' : 'Job…');
        });
    }

    private clearDetail (showBtns: boolean) {
        for (const t of this.traitT) t.setText('');
        this.feedT.setVisible(showBtns);
        this.taskT.forEach((t) => t.setText(''));
        this.workZ.forEach((z) => { if (z.input) z.input.enabled = false; });
        this.feedIcons.forEach((im) => im.setVisible(false));
        this.feedZones.forEach((z) => z.input && (z.input.enabled = showBtns));
    }

    private showPet (p: Pet | undefined) {
        const g = this.g, me = this.ctx.me(), f = this.ctx.farm;
        this.clearDetail(!!p);
        for (const b of Object.values(this.btns)) showBtn(b, !!p);
        this.skillNote.setText('');
        if (!p) {
            this.face.setVisible(false);
            this.nameT.setText('No creatures yet');
            this.affT.setText('');
            this.subT.setText('');
            this.lvT.setText('');
            this.statT.setText('');
            this.descT.setText('Throw a Taming Pod (T) at a wild creature to make a friend.\nLearn Taming in the skill tree (K) and craft pods at a Workbench.');
            this.statusT.setText('');
            this.workT.forEach((t) => t.setText('')); this.workI.forEach((i) => i.setVisible(false)); this.taskT.forEach((t) => t.setText(''));
            this.foot.setHint('Your creatures live here. Tame your first one to begin.');
            return;
        }
        const sp = spOf(p.sp);
        inset(g, this.dx, this.dy, 112, 112, PAL.deepSea, PAL.slate); rect(g, this.dx + 2, this.dy + 2, 108, 2, ELEMENT_COLOR[sp.element], 0.8);
        this.face.setVisible(true).setTexture(critTex(this.ctx.scene, p.sp), 0).setScale(fitScale(this.ctx.scene, critTex(this.ctx.scene, p.sp), 84, 4)).clearTint();
        this.win.at(this.face, this.dx + 56, this.dy + 56);
        this.nameT.setText(p.name).setColor(hex(ELEMENT_COLOR[sp.element]));
        this.subT.setText(`${sp.name} · ${ELEMENT_NAME[sp.element]} · ${RARITY_NAMES[sp.rarity]}`).setColor(hex(RARITY_COLORS[sp.rarity]));
        const need = petXpNeed(p.lv);
        const stars = starsOf(p);
        const starText = `   ${'★'.repeat(stars)}${'☆'.repeat(STAR_MAX - stars)}`;
        this.lvT.setText((p.lv >= PET_MAX_LEVEL ? `Level ${p.lv} (max)` : `Level ${p.lv}   ${Math.floor(p.xp)} / ${need} xp`) + (stars ? starText : ''));
        bar(g, this.dx + 126, this.dy + 26 + Math.round(ts('body') * 1.2) * 2 + 8, Math.min(300, this.dw - 130), 10, p.lv >= PET_MAX_LEVEL ? 1 : p.xp / need, PAL.blossom);
        this.statT.setText(`Health ${petMaxHp(p)}   ·   Attack ${Math.round(petAtk(p) * (1 + (derived(me).mods.companionDmg ?? 0)) * 10) / 10}`);
        const bond = levelInfo(p);
        this.affT.setText(`♥ ${bond.level.name}  ${bond.aff}/${AFFECTION_MAX}`).setColor(hex(bond.level.color));
        p.traits.forEach((t, i) => this.traitT[i]?.setText(`★ ${TRAITS[t].name}`));
        const bondLine = `${bond.level.line}${bond.next ? ` (${bond.next.at - bond.aff} more to ${bond.next.name}: ${isTouchUi() ? 'tap USE' : 'press E'} beside it to pet it)` : ''}`;
        const line1 = sp.desc + (p.traits.length ? '\n' + p.traits.map((t) => `${TRAITS[t].name}: ${TRAITS[t].desc}`).join('   ') : '');
        this.descT.setText(line1 + '\n' + bondLine);
        const ownerWork = derived(me).mods.work ?? 0;
        const colW = Math.floor(this.dw / 2);
        WORK_KINDS.forEach((kind, i) => {
            const apt = sp.work[kind] ?? 0;
            const col = Math.floor(i / 4), row = i % 4, x = this.dx + col * colW, y = this.wy + row * 24;
            const info = WORK_INFO[kind];
            this.workI[i].setVisible(true).setAlpha(apt ? 1 : 0.3);
            const cyc = workCycle(p, kind, ownerWork);
            this.workT[i].setText(apt ? `${info.name}  ${Math.round(kind === 'guard' ? cyc / 4 : cyc)}s` : info.name).setColor(hex(apt ? PAL.cream : PAL.slate));
            const field = FIELD_TASKS.includes(kind) && apt > 0;
            const here = (p.post?.k === 'plot' && p.post.job === kind) || (p.post?.k === 'stn' && (() => { const e = f.ents[(p.post as { id: number }).id]; return !!e && e.k === 'bld' && e.kind !== undefined && kindSkill(e.kind) === kind; })());
            if (p.task === kind || here) rect(g, x, y - 1, colW - 6, 22, info.color, 0.2);
            this.taskT[i].setText(p.task === kind ? 'ON DUTY' : here ? 'its job' : field ? '●' : '').setColor(hex(p.task === kind || here ? PAL.gold : PAL.gold));
            this.win.at(this.taskT[i], x + colW - 64, y + 10 - this.taskT[i].height / 2);
            if (this.workZ[i].input) this.workZ[i].input!.enabled = field;
            for (let n = 0; n < 5; n++) rect(g, x + colW - 58 + n * 9, y + 6, 7, 9, n < apt ? info.color : LOCKED, 1);
        });
        this.skillNote.setText(smallScreen() ? '' : '● Click a dotted skill to have it do that beside you. Fuller bars, quicker work.');
        const st = STATUS_INFO[statusOf(p)];
        const here = p.post ? `On duty: ${postText(f.world.plots, f.ents, p)}.  ${st.text}${st.bad ? ': ' + st.hint : ''}` : p.den !== undefined ? 'Working at a Den' : me.comp === p.id ? (p.task ? `Beside you: ${WORK_INFO[p.task].name.toLowerCase()} duty, and it still helps in fights` : 'Walking beside you — helps in fights') : p.task ? `Resting. Its task (${WORK_INFO[p.task].name.toLowerCase()}) starts when you take it along` : 'Resting at home';
        this.statusT.setText(here).setColor(hex(p.post ? st.color : p.den !== undefined ? PAL.lime : me.comp === p.id ? PAL.gold : PAL.pebble));
        this.win.at(this.statusT, this.dx, this.wy + 4 * 24 + (smallScreen() ? 6 : 22));
        this.btns.companion.setLabel(me.comp === p.id ? 'Send home' : 'Take along');
        this.btns.companion.setEnabled(true);
        this.btns.job.setLabel(p.post ? 'Change job…' : 'Give a job…');
        const nextStar = AWAKENINGS[starsOf(p)];
        const ready = !!nextStar && p.lv >= nextStar.lv && (Object.entries(nextStar.cost) as [ItemId, number][]).every(([item, n]) => countOf(me, item) >= n);
        this.btns.awaken.setLabel(nextStar ? `Awaken ${'★'.repeat(starsOf(p) + 1)}` : 'Awakened');
        this.btns.awaken.setEnabled(ready);
        this.btns.release.setLabel(this.t < this.armUntil ? 'Sure?' : 'Release');
        showBtn(this.btns.unassign, isWorking(p));
        showBtn(this.btns.companion, p.den === undefined);
        // food
        const foods = (Object.keys(ITEMS) as ItemId[]).filter((id) => countOf(me, id) > 0 && (id === 'treat' || !!ITEMS[id].food)).sort((a, b) => (a === 'treat' ? -1 : b === 'treat' ? 1 : (ITEMS[b].food ?? 0) - (ITEMS[a].food ?? 0))).slice(0, 8);
        this.feedItems = foods;
        this.feedIcons.forEach((im, i) => {
            const it = foods[i];
            im.setVisible(!!it);
            if (it) im.setTexture(iconOf(it), 0);
            const z = this.feedZones[i]; if (z.input) z.input.enabled = !!it;
        });
        // with nothing to offer, the Feed row itself says so (the footer is full of buttons on this tab, so a hint there would wrap and clip)
        this.feedT.setText(foods.length ? 'Feed:' : 'Feed:  nothing to give yet. Treats come from a Kitchen.');
        this.foot.setHint('');
    }

    private showSpecies (id: string | undefined) {
        const g = this.g, me = this.ctx.me();
        this.clearDetail(false);
        for (const b of Object.values(this.btns)) showBtn(b, false);
        this.skillNote.setText('');
        if (!id) return;
        const sp = spOf(id);
        const known = (me.dex ?? []).includes(id);
        inset(g, this.dx, this.dy, 112, 112, PAL.deepSea, PAL.slate); rect(g, this.dx + 2, this.dy + 2, 108, 2, known ? ELEMENT_COLOR[sp.element] : LOCKED, 0.8);
        this.face.setVisible(true).setTexture(critTex(this.ctx.scene, id), 0).setScale(fitScale(this.ctx.scene, critTex(this.ctx.scene, id), 84, 4));
        if (known) this.face.clearTint(); else this.face.setTint(PAL.ink);
        this.win.at(this.face, this.dx + 56, this.dy + 56);
        this.nameT.setText(known ? sp.name : '???').setColor(hex(known ? ELEMENT_COLOR[sp.element] : PAL.pebble));
        this.affT.setText('');        // (a species has no bond: the last pet's must not stay up here)
        this.subT.setText(known ? `${ELEMENT_NAME[sp.element]} · ${RARITY_NAMES[sp.rarity]}` : 'Not yet befriended').setColor(hex(known ? RARITY_COLORS[sp.rarity] : PAL.pebble));
        this.lvT.setText('');
        const where = sp.biomes === 'any' ? 'Anywhere' : sp.biomes.map((b) => BIOME_DEFS[b].name).join(', ');
        const when = sp.when === 'night' ? 'After dark' : sp.when === 'day' ? 'In daylight' : 'Day or night';
        this.statT.setText(known ? `Found in: ${where}\n${when}` : `Found in: ${where}`);
        this.descT.setText(known ? sp.desc : 'Befriend one to learn what it is good at.');
        const colW = Math.floor(this.dw / 2);
        const bonus = derived(me).mods.catch ?? 0;
        this.workT.forEach((t, i) => {
            const kind = WORK_KINDS[i];
            const apt = sp.work[kind] ?? 0;
            const info = WORK_INFO[kind];
            const col = Math.floor(i / 4), row = i % 4, x = this.dx + col * colW, y = this.wy + row * 24;
            this.workI[i].setVisible(known).setAlpha(apt ? 1 : 0.3);
            t.setText(known ? info.name : '').setColor(hex(apt ? PAL.cream : PAL.slate));
            if (known) for (let n = 0; n < 5; n++) rect(g, x + colW - 58 + n * 9, y + 6, 7, 9, n < apt ? info.color : LOCKED, 1);
        });
        // one number when every pod gives the same (the chance is capped), the three pods otherwise
        const pods = ['pod', 'pod_great', 'pod_ultra'] as const;
        const pct = pods.map((pod) => Math.round(catchChance(sp.rarity, 1, POD_POWER[pod], bonus) * 100));
        const odds = pct.every((v) => v === pct[0]) ? `${pct[0]}% with any pod` : pods.map((pod, i) => `${ITEMS[pod].name}: ${pct[i]}%`).join('    ');
        this.statusT.setText(`Catch chance:  ${odds}`).setColor(hex(PAL.foam));
        this.win.at(this.statusT, this.dx, known ? this.wy + 4 * 24 + (smallScreen() ? 6 : 22) : this.dy + 128 + Math.ceil(this.descT.height) + 12);
        this.foot.setHint('Throw a Taming Pod at a wild one to befriend it.');
    }

    wheel () { /* fixed-size grid */ }

    destroy () { this.win.destroy(); }
}

const kindSkill = (kind: keyof typeof BUILDINGS) => BUILDINGS[kind]?.work;
