// Give one creature a job: work an island (Lumber, Mining, Farming, Hauling, Guarding), or run a machine or a workshop.

import { critTex } from '../../art/storybook-critters';
import * as Phaser from 'phaser';
import { BUILDINGS } from '../../../shared/data/buildings';
import { AREA_JOBS, ELEMENT_COLOR, ELEMENT_NAME, Pet, spOf, STATUS_INFO, STAR_MAX, starsOf, WORK_INFO, WORK_KINDS, type WorkKind } from '../../../shared/data/creatures';
import { BIOME_DEFS } from '../../../shared/data/biomes';
import { GRID } from '../../../shared/config';
import { PAL } from '../../../shared/palette';
import { areaOk, isWorkplace, stationOk } from '../../../shared/sim/jobs';
import { petsOf } from '../../../shared/sim/petlib';
import type { BuildE, Plot } from '../../../shared/sim/types';
import { aptOf, jobName, jobTip, pips, plotName, secsPerJob, statusOf, stationTip } from '../crew';
import { BTN_H, button, Footer, GAP, icon, onTap, Pager, rowBox, Section, showBtn, TabBar, tipOn, ts, Win } from '../kit';
import { hex, inset, rect, STYLES } from '../px';
import { logical } from '../../res';
import { fitScale } from './creatures';
import type { Screen, ScreenCtx } from './types';

const ROWS = 6;           // machine rows per page
type Tab = 'island' | 'machine';
interface Arg { pet: string; tab?: Tab }

export class JobPostScreen implements Screen {
    private win: Win;
    private petId: string;
    private tab: Tab = 'island';
    private plotI = -1;
    private page = 0;
    private key = '';
    private g: Phaser.GameObjects.Graphics;
    private mapG: Phaser.GameObjects.Graphics;
    private markG: Phaser.GameObjects.Graphics;
    private face: Phaser.GameObjects.Image;
    private card: Section;
    private right: Section;
    private subT: Phaser.GameObjects.Text;
    private nowT: Phaser.GameObjects.Text;
    private skillI: Phaser.GameObjects.Image[] = [];
    private skillT: Phaser.GameObjects.Text[] = [];
    private tabs: TabBar;
    private foot: Footer;
    private selT: Phaser.GameObjects.Text;
    private infoT: Phaser.GameObjects.Text;
    private arrows: ReturnType<typeof button>[] = [];
    private mapZone: Phaser.GameObjects.Zone;
    private jobI: Phaser.GameObjects.Image[] = [];
    private jobT: Phaser.GameObjects.Text[] = [];
    private jobEta: Phaser.GameObjects.Text[] = [];
    private jobZ: Phaser.GameObjects.Zone[] = [];
    private rowI: Phaser.GameObjects.Image[] = [];
    private rowName: Phaser.GameObjects.Text[] = [];
    private rowSub: Phaser.GameObjects.Text[] = [];
    private rowBtn: ReturnType<typeof button>[] = [];
    private pager: Pager;
    private emptyT: Phaser.GameObjects.Text;
    private legendT: Phaser.GameObjects.Text;
    private list: BuildE[] = [];
    private readonly span = 9;                 // plots across the map: the selected island and its neighbours
    private cell = 30;
    private mx = 0;
    private my = 0;
    private jx = 0;
    private jw = 0;
    private jy = 0;
    private rowsH = 0;

    constructor (private ctx: ScreenCtx, arg: unknown) {
        const s = ctx.scene;
        const a = arg as Arg;
        this.petId = a.pet;
        if (a.tab) this.tab = a.tab;
        this.win = new Win(s, { size: 'large', title: 'Give a job', icon: 'k_paw', accent: PAL.lime, onClose: () => ctx.close() });
        const w = this.win;
        this.foot = w.footer({
            primary: { label: 'Done', w: 130, onClick: () => this.done() },
            secondary: [{ label: 'Call home', w: 130, style: STYLES.gold, onClick: () => ctx.send({ t: 'pet', op: 'unassign', pet: this.petId }) }],
            hint: '',
        });
        const body = w.body, cy = w.top + w.toolH / 2;
        this.tabs = new TabBar(w, body.x + 308, cy, [{ id: 'island', label: 'Island jobs' }, { id: 'machine', label: 'Machines & workshops' }], this.tab, (id) => { this.tab = id as Tab; this.page = 0; this.key = ''; }, { minW: 150 });
        const top = w.under.y, h = w.under.h, lw = 300;
        // ── the creature ──
        const cardTop = body.y;
        this.card = w.section(body.x, cardTop, lw, body.h, '', { right: '' });
        const ci = this.card.inner;
        this.g = w.put(s.add.graphics(), 0, 0);
        inset(w.g, ci.x, ci.y, 88, 88, PAL.deepSea, PAL.slate);
        this.face = w.put(icon(s, 'px', 0, 0, 4), ci.x + 44, ci.y + 44);
        this.subT = w.text('', ci.x + 100, ci.y + 2, ts('cap'), PAL.pebble, { bold: false, wrap: ci.w - 104 });
        this.nowT = w.text('', ci.x + 100, ci.y + 40, ts('cap'), PAL.lime, { bold: false, wrap: ci.w - 104 });
        w.text('What it is good at', ci.x, ci.y + 100, ts('body'), PAL.pebble, { font: 'head' });
        const sy = ci.y + 100 + Math.round(ts('body') * 1.2) + 6, pitch = smallPitch();
        WORK_KINDS.forEach((k, i) => {
            const y = sy + i * pitch;
            this.skillI.push(w.put(icon(s, WORK_INFO[k].icon, 0, 0, 1), ci.x + 10, y + pitch / 2));
            this.skillT.push(w.text(WORK_INFO[k].name, ci.x + 26, y + pitch / 2, ts('body'), PAL.cream, { bold: false, origin: [0, 0.5] }));
        });
        w.text('Fuller squares, quicker work. Experience makes every creature better.', ci.x, sy + WORK_KINDS.length * pitch + 4, ts('cap'), PAL.pebble, { bold: false, wrap: ci.w });
        // ── where it works ──
        const rx = body.x + lw + GAP, rw = body.x + body.w - rx;
        this.right = w.section(rx, top, rw, h);
        const ri = this.right.inner;
        // island tab: pick the island, see it on the map, pick the job
        this.arrows = [
            button(s, 0, 0, 40, BTN_H, '◀', () => this.stepPlot(-1), { style: STYLES.dark, size: 14 }),
            button(s, 0, 0, 40, BTN_H, '▶', () => this.stepPlot(1), { style: STYLES.dark, size: 14 }),
        ];
        w.put(this.arrows[0].root, ri.x + 20, ri.y + 16); w.put(this.arrows[1].root, ri.x + ri.w - 20, ri.y + 16);
        this.selT = w.text('', ri.x + ri.w / 2, ri.y + 16, ts('head'), PAL.cream, { origin: [0.5, 0.5], font: 'head' });
        this.mapG = w.put(s.add.graphics(), 0, 0);
        this.markG = w.put(s.add.graphics(), 0, 0);
        const legendH = Math.round(ts('cap') * 1.2) * 2 + 8;
        this.cell = Math.max(24, Math.min(32, Math.floor((ri.h - 40 - legendH) / this.span)));
        this.mx = ri.x; this.my = ri.y + 40;
        this.mapZone = w.put(s.add.zone(0, 0, this.span * this.cell, this.span * this.cell).setOrigin(0).setInteractive({ useHandCursor: true }), this.mx, this.my);
        onTap(this.mapZone, () => {
            const q = logical(s.input.activePointer), v = this.view();
            const p = ctx.farm.world.plot(v.gx + Math.floor((q.x - w.x - this.mx) / this.cell), v.gy + Math.floor((q.y - w.y - this.my) / this.cell));
            if (p?.owned) { this.plotI = p.i; this.key = ''; }
        });
        this.legendT = w.text('Click an island to pick it. The coloured chips are your creatures at work there.', this.mx, this.my + this.span * this.cell + 6, ts('cap'), PAL.pebble, { bold: false, wrap: this.span * this.cell });
        this.jx = ri.x + this.span * this.cell + 14; this.jw = ri.x + ri.w - this.jx; this.jy = ri.y + 40;
        this.infoT = w.text('', this.jx, this.jy, ts('cap'), PAL.pebble, { bold: false, wrap: this.jw });
        AREA_JOBS.forEach((k) => {
            this.jobI.push(w.put(icon(s, WORK_INFO[k].icon, 0, 0, 2), 0, 0));
            this.jobT.push(w.text(WORK_INFO[k].name, 0, 0, ts('body'), PAL.cream, { font: 'head' }));
            this.jobEta.push(w.text('', 0, 0, ts('cap'), PAL.pebble, { origin: [1, 0], bold: false }));
            const z = s.add.zone(0, 0, this.jw, 36).setOrigin(0).setInteractive({ useHandCursor: true });
            w.put(z, this.jx, this.jy);
            onTap(z, () => this.setJob(k));
            tipOn(z, () => { const p = this.pet(); return p ? jobTip(ctx.me(), p, k) : null; });
            this.jobZ.push(z);
        });
        // machines tab: the workshops it could run
        this.rowsH = Math.floor((ri.h - 40) / ROWS);
        for (let i = 0; i < ROWS; i++) {
            const y = ri.y + i * this.rowsH;
            this.rowI.push(w.put(icon(s, 'workbench', 0, 0, 2), ri.x + 30, y + (this.rowsH - 4) / 2));
            this.rowName.push(w.text('', ri.x + 62, y + 5, ts('body'), PAL.cream, { font: 'head' }));
            this.rowSub.push(w.text('', ri.x + 62, y + 5 + Math.round(ts('body') * 1.2) + 1, ts('cap'), PAL.pebble, { bold: false }));
            const b = button(s, 0, 0, 110, 28, 'Assign', () => this.setStation(i), { style: STYLES.lime, size: 13 });
            w.put(b.root, ri.x + ri.w - 62, y + (this.rowsH - 4) / 2);
            tipOn(b.zone, () => { const p = this.pet(), e = this.list[this.page * ROWS + i]; return p && e ? stationTip(ctx.me(), p, e.kind) : null; });
            this.rowBtn.push(b);
        }
        this.pager = new Pager(w, ri.x + ri.w / 2, ri.y + ri.h - 14, (d) => { this.page = Math.max(0, this.page + d); this.key = ''; });
        this.emptyT = w.text('No machines or workshops nearby that it can run.\n\nWalk up to a Furnace, Sawmill, Millstone, Workbench, Anvil, Kitchen, Loom or Alchemy Table, press E, and choose "Put a creature to work". It works through the chests within nine tiles, so put one next to it.', ri.x + ri.w / 2, ri.y + ri.h / 2, ts('body'), PAL.pebble, { origin: [0.5, 0.5], align: 'center', bold: false, wrap: ri.w - 80 });
    }

    private pet (): Pet | undefined { return petsOf(this.ctx.me()).find((p) => p.id === this.petId); }

    private done () { this.ctx.open('creatures', { tab: 'roster', pet: this.petId }); }

    /** The window of the world the map shows: centred on the chosen island. */
    private view () {
        const plot = this.ctx.farm.world.plots[this.plotI];
        const half = Math.floor(this.span / 2), max = GRID - this.span;
        return { gx: Math.max(0, Math.min(max, (plot?.gx ?? 0) - half)), gy: Math.max(0, Math.min(max, (plot?.gy ?? 0) - half)), span: this.span };
    }

    private plots (): Plot[] {
        const f = this.ctx.farm, me = this.ctx.me();
        const here = f.world.plotAtPx(me.x, me.y);
        const own = f.world.plots.filter((p) => p.owned);
        return own.sort((a, b) => (a === here ? -1e9 : 0) + Math.hypot(a.gx - (here?.gx ?? 0), a.gy - (here?.gy ?? 0)) - ((b === here ? -1e9 : 0) + Math.hypot(b.gx - (here?.gx ?? 0), b.gy - (here?.gy ?? 0))));
    }

    private stepPlot (d: number) {
        const list = this.plots();
        if (!list.length) return;
        const i = Math.max(0, list.findIndex((p) => p.i === this.plotI));
        this.plotI = list[(i + d + list.length) % list.length].i;
        this.key = '';
    }

    private setJob (kind: WorkKind) {
        const p = this.pet();
        if (!p || this.tab !== 'island' || this.plotI < 0 || !areaOk(p, kind)) return;
        this.ctx.send({ t: 'pet', op: 'post', pet: p.id, at: { plot: this.plotI, job: kind } });
    }

    private setStation (row: number) {
        const p = this.pet(), e = this.list[this.page * ROWS + row];
        if (!p || !e) return;
        this.ctx.send({ t: 'pet', op: 'post', pet: p.id, at: { bld: e.id } });
    }

    update () {
        const me = this.ctx.me(), p = this.pet();
        if (!p) { this.done(); return; }
        if (this.plotI < 0) {
            const post = p.post;
            this.plotI = post?.k === 'plot' ? post.plot : this.plots()[0]?.i ?? -1;
        }
        const f = this.ctx.farm;
        const k = JSON.stringify([this.tab, this.plotI, this.page, p.post, p.ps, p.lv, p.pn, petsOf(me).map((q) => [q.id, q.post]), Object.values(f.ents).filter((e) => e.k === 'bld' && isWorkplace(e.kind)).length, me.skills]);
        if (k === this.key) return;
        this.key = k;
        this.draw(p);
    }

    private draw (p: Pet) {
        const me = this.ctx.me(), f = this.ctx.farm, g = this.g, ci = this.card.inner;
        const sp = spOf(p.sp), st = STATUS_INFO[statusOf(p)];
        g.clear();
        rect(g, ci.x + 2, ci.y + 2, 84, 2, ELEMENT_COLOR[sp.element], 0.8);
        this.face.setTexture(critTex(this.ctx.scene, p.sp), 0).setScale(fitScale(this.ctx.scene, critTex(this.ctx.scene, p.sp), 72, 4)).clearTint();
        this.win.at(this.face, ci.x + 44, ci.y + 46);
        const stars = starsOf(p);
        this.card.setTitle(p.name);
        this.card.head?.setColor(hex(ELEMENT_COLOR[sp.element]));
        this.card.setRight(`Lv ${p.lv}${stars ? '  ' + '★'.repeat(stars) + '☆'.repeat(STAR_MAX - stars) : ''}`);
        this.subT.setText(`${sp.name}\n${ELEMENT_NAME[sp.element]}`);
        const here = p.post
            ? `On duty: ${p.post.k === 'plot' ? `${jobName(p.post.job)}, ${f.world.plots[p.post.plot] ? plotName(f.world.plots[p.post.plot]) : ''}` : (() => { const b = f.ents[p.post.id]; return b && b.k === 'bld' ? BUILDINGS[b.kind].name : 'a workshop'; })()}\n${st.text}`
            : p.den !== undefined ? 'Living in a den' : me.comp === p.id ? 'Walking beside you' : 'Resting at home';
        this.nowT.setText(here).setColor(hex(p.post ? st.color : PAL.pebble));
        const sy = ci.y + 100 + Math.round(ts('body') * 1.2) + 6, pitch = smallPitch();
        WORK_KINDS.forEach((kind, i) => {
            const y = sy + i * pitch, apt = aptOf(p, kind);
            this.skillI[i].setAlpha(apt ? 1 : 0.3);
            this.skillT[i].setColor(hex(apt ? PAL.cream : PAL.slate));
            pips(g, ci.x + ci.w - 52, y + pitch / 2 - 4, apt, WORK_INFO[kind].color, 7);
            if (p.post?.k === 'plot' && p.post.job === kind) rect(g, ci.x, y, ci.w, pitch - 1, WORK_INFO[kind].color, 0.2);
            if (p.post?.k === 'stn') { const e = f.ents[p.post.id]; if (e && e.k === 'bld' && BUILDINGS[e.kind].work === kind) rect(g, ci.x, y, ci.w, pitch - 1, WORK_INFO[kind].color, 0.2); }
        });
        showBtn(this.foot.secondary[0], !!p.post || p.den !== undefined);
        this.tabs.set(this.tab);
        const island = this.tab === 'island';
        this.mapZone.input && (this.mapZone.input.enabled = island);
        for (const o of [this.selT, this.infoT, this.legendT, this.mapG, this.markG, ...this.arrows.map((b) => b.root), ...this.jobI, ...this.jobT, ...this.jobEta]) (o as Phaser.GameObjects.GameObject & { setVisible (v: boolean): unknown }).setVisible(island);
        for (const z of this.jobZ) if (z.input) z.input.enabled = island;
        for (const b of this.arrows) if (b.zone.input) b.zone.input.enabled = island;
        for (let i = 0; i < ROWS; i++) { this.rowI[i].setVisible(false); this.rowName[i].setVisible(false); this.rowSub[i].setVisible(false); showBtn(this.rowBtn[i], false); }
        this.pager.set(0, 1); this.emptyT.setVisible(false);
        if (island) this.drawIsland(p); else this.drawMachines(p);
    }

    private drawIsland (p: Pet) {
        const me = this.ctx.me(), f = this.ctx.farm, g = this.g;
        const plot = f.world.plots[this.plotI];
        const v = this.view();
        this.mapG.clear();
        this.ctx.drawMap(this.mapG, this.mx, this.my, this.cell, undefined, v);
        const mk = this.markG;
        mk.clear();
        const at = (q: Plot) => ({ x: this.mx + (q.gx - v.gx) * this.cell, y: this.my + (q.gy - v.gy) * this.cell });
        const inView = (q: Plot) => q.gx >= v.gx && q.gy >= v.gy && q.gx < v.gx + v.span && q.gy < v.gy + v.span;
        // your creatures at work: a coloured chip in the corner of their island for each, in the colour of the job
        const per = new Map<number, WorkKind[]>();
        for (const q of petsOf(me)) if (q.post?.k === 'plot') per.set(q.post.plot, [...(per.get(q.post.plot) ?? []), q.post.job]);
        for (const [i, jobs] of per) {
            const q = f.world.plots[i];
            if (!q || !inView(q)) continue;
            const c = at(q);
            jobs.slice(0, 4).forEach((j, n) => { rect(mk, c.x + 3 + n * 7, c.y + this.cell - 9, 6, 6, PAL.ink); rect(mk, c.x + 4 + n * 7, c.y + this.cell - 8, 4, 4, WORK_INFO[j].color); });
        }
        if (plot && inView(plot)) { const c = at(plot); mk.lineStyle(3, PAL.gold, 1).strokeRect(c.x + 0.5, c.y + 0.5, this.cell - 1, this.cell - 1); }
        this.selT.setText(plot ? `${plotName(plot)} · ${BIOME_DEFS[plot.biome].name}` : 'No island');
        const mine = petsOf(me).filter((q) => q.post?.k === 'plot' && q.post.plot === this.plotI);
        this.infoT.setText(plot
            ? `${plot.nodes} resources left to gather. ${mine.length ? `Working here: ${mine.map((q) => `${q.name} (${jobName((q.post as { job: WorkKind }).job)})`).join(', ')}.` : 'Nobody of yours works here yet.'}`
            : 'You do not own an island yet.');
        const jy = this.jy + Math.ceil(this.infoT.height) + 8, avail = this.right.inner.y + this.right.inner.h - jy, jh = Math.max(28, Math.min(38, Math.floor(avail / AREA_JOBS.length) - 4));
        AREA_JOBS.forEach((kind, i) => {
            const apt = aptOf(p, kind), cur = p.post?.k === 'plot' && p.post.plot === this.plotI && p.post.job === kind;
            const y = jy + i * (jh + 4), ok = apt > 0 && !!plot;
            rowBox(g, this.jx, y, this.jw, jh, { on: cur, accent: PAL.lime, off: !ok });
            this.win.at(this.jobI[i], this.jx + 22, y + jh / 2);
            this.jobI[i].setAlpha(ok ? 1 : 0.35);
            this.jobT[i].setText(cur ? `${WORK_INFO[kind].name}: on duty` : WORK_INFO[kind].name).setColor(hex(ok ? (cur ? PAL.lime : PAL.cream) : PAL.pebble));
            this.win.at(this.jobT[i], this.jx + 42, y + jh / 2 - this.jobT[i].height / 2);
            pips(g, this.jx + this.jw - 108, y + jh / 2 - 4, apt, WORK_INFO[kind].color, 7);
            this.jobEta[i].setText(apt ? `${secsPerJob(me, p, kind)}s` : '').setColor(hex(PAL.pebble));
            this.win.at(this.jobEta[i], this.jx + this.jw - 8, y + jh / 2 - this.jobEta[i].height / 2);
            this.win.at(this.jobZ[i], this.jx, y);
        });
        this.foot.setHint(plot ? 'Click a job to put it to work here. Put a Chest on the island: that is where it stores what it gets and finds seeds.' : 'Buy an island first: creatures work on land you own.');
    }

    private drawMachines (p: Pet) {
        const f = this.ctx.farm, me = this.ctx.me(), ri = this.right.inner;
        const mine = new Map<number, string>();
        for (const q of petsOf(me)) if (q.post?.k === 'stn') mine.set(q.post.id, q.name);
        this.list = f.buildings().filter((b) => isWorkplace(b.kind) && stationOk(p, b.kind))
            .sort((a, b) => Math.hypot((a.tx + 1) * 16 - me.x, (a.ty + 1) * 16 - me.y) - Math.hypot((b.tx + 1) * 16 - me.x, (b.ty + 1) * 16 - me.y));
        const pages = Math.max(1, Math.ceil(this.list.length / ROWS));
        this.page = Math.min(this.page, pages - 1);
        this.emptyT.setVisible(this.list.length === 0);
        this.pager.set(this.page, pages);
        for (let i = 0; i < ROWS; i++) {
            const e = this.list[this.page * ROWS + i], y = ri.y + i * this.rowsH;
            if (!e) continue;
            rowBox(this.g, ri.x, y, ri.w, this.rowsH - 4);
            const def = BUILDINGS[e.kind];
            const cur = p.post?.k === 'stn' && p.post.id === e.id, keeper = mine.get(e.id);
            this.rowI[i].setVisible(true).setTexture(def.tex, 0).setScale(fitScale(this.ctx.scene, def.tex, 32, 2));
            this.win.at(this.rowI[i], ri.x + 30, y + (this.rowsH - 4) / 2);
            this.rowName[i].setVisible(true).setText(def.name).setColor(hex(PAL.cream));
            const plot = f.world.plotAt(e.tx, e.ty);
            const skill = def.work!;
            this.rowSub[i].setVisible(true).setText(`${plot ? plotName(plot) : 'at sea'} · ${WORK_INFO[skill].name} ${'●'.repeat(aptOf(p, skill))}${keeper && !cur ? `   ·   ${keeper} works here` : ''}`).setColor(hex(cur ? PAL.lime : PAL.pebble));
            const b = this.rowBtn[i];
            showBtn(b, true);
            b.setLabel(cur ? 'On duty' : keeper ? 'Swap in' : 'Assign');
            b.setStyle(cur ? STYLES.dark : STYLES.lime);
            b.setEnabled(!cur);
        }
        this.foot.setHint(this.list.length ? 'The nearest come first. A creature runs one machine or workshop at a time.' : 'Nothing nearby for it to run yet.');
    }

    destroy () { this.win.destroy(); }
}

/** The height of one row in the list of what a creature is good at. */
const smallPitch = () => (ts('body') > 12 ? 24 : 21);
