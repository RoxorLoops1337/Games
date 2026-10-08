// The "Starter layouts" half of the Blueprint screen: a handful of small production lines that work
// as they stand. Pick one, read what it does and what it needs, press Place and drop it with the
// ordinary blueprint ghost (so the usual costs, range and unlock rules apply).

import type * as Phaser from 'phaser';
import { totalCost } from '../../../shared/blueprint';
import { BUILDINGS } from '../../../shared/data/buildings';
import { Res, resName } from '../../../shared/data/items';
import { layoutBlueprint, layoutReq, STARTER_LAYOUTS, type StarterLayout } from '../../../shared/data/layouts';
import { SKILL_LIST } from '../../../shared/data/skills';
import { PAL } from '../../../shared/palette';
import { hasUnlock, have, scaledCost } from '../../../shared/sim/stats';
import { CostList, Footer, GAP, icon, onTap, Rect, Section, shrinkToFit, ts, Win } from '../kit';
import { layoutPreview, type Preview } from '../preview';
import { hex, inset, panel, rect, STYLES } from '../px';
import type { ScreenCtx } from './types';

const skillName = (token: string) => SKILL_LIST.find((s) => s.unlock?.includes(token))?.name ?? token;

/** Things counted by the piece take an s; wood, stone and the like do not. */
const UNCOUNTED = new Set(['Wood', 'Stone', 'Coal', 'Sand', 'Clay', 'Glass', 'Cloth', 'Steel', 'Wheat', 'Rope', 'Wire', 'Fiber', 'Coins', 'Flour', 'Peat']);
const plural = (name: string, n: number) => (n === 1 || UNCOUNTED.has(name) ? name : `${name}s`);
/** "Short of 4 iron bars", or "Short of 4 iron bars and more" when more than one thing is missing. */
const shortWords = (lack: [Res, number][]) => `Short of ${lack[0][1]} ${plural(resName(lack[0][0]), lack[0][1]).toLowerCase()}${lack.length > 1 ? ' and more' : ''}`;

export class StarterPanel {
    private g: Phaser.GameObjects.Graphics;
    private objs: (Phaser.GameObjects.GameObject & { setVisible (v: boolean): unknown })[] = [];
    private rowIcon: Phaser.GameObjects.Image[] = [];
    private rowName: Phaser.GameObjects.Text[] = [];
    private rowSub: Phaser.GameObjects.Text[] = [];
    private zones: Phaser.GameObjects.Zone[] = [];
    private list: Section;
    private det: Section;
    private fields: Phaser.GameObjects.Text[] = [];
    private bodies: Phaser.GameObjects.Text[] = [];
    private costs: CostList;
    private costHead: Phaser.GameObjects.Text;
    private prev: Preview | null = null;
    private sel = 0;
    /** The size a row's second line starts at (it is raised on a small screen) before it is shrunk to fit. */
    private subPx = 13;
    private rowH: number;
    private shown = false;
    private key = '';

    constructor (private ctx: ScreenCtx, private win: Win, area: Rect, layer: Phaser.GameObjects.Graphics, private foot: Footer) {
        const s = ctx.scene, w = win;
        const lw = 250;
        this.list = w.section(area.x, area.y, lw, area.h, 'Starter layouts', { right: `${STARTER_LAYOUTS.length}`, layer });
        this.det = w.section(area.x + lw + GAP, area.y, area.w - lw - GAP, area.h, '', { layer });
        this.objs.push(this.list.head!, this.list.right!, this.det.head!);
        this.g = w.put(s.add.graphics(), 0, 0);
        this.objs.push(this.g);
        const li = this.list.inner;
        this.rowH = Math.min(54, Math.floor(li.h / STARTER_LAYOUTS.length));
        STARTER_LAYOUTS.forEach((l, i) => {
            const y = li.y + i * this.rowH;
            this.rowIcon.push(w.put(icon(s, BUILDINGS[l.icon as keyof typeof BUILDINGS].tex, 0, 0, 1), li.x + 22, y + this.rowH / 2));
            this.rowName.push(w.text(l.name, li.x + 46, y + 6, ts('body'), PAL.cream, { font: 'head' }));
            this.rowSub.push(w.text('', li.x + 46, y + 6 + Math.round(ts('body') * 1.2) + 1, ts('cap'), PAL.pebble, { bold: false }));
            this.subPx = parseFloat(String(this.rowSub[i].style.fontSize));
            const z = w.put(s.add.zone(0, 0, li.w, this.rowH - 4).setOrigin(0).setInteractive({ useHandCursor: true }), li.x, y);
            onTap(z, () => this.select(i));
            this.zones.push(z);
            this.objs.push(this.rowIcon[i], this.rowName[i], this.rowSub[i], z);
        });
        // the chosen layout: a picture and what it costs on the left, what it does and how to use it on the right
        const di = this.det.inner, colA = 300;
        inset(w.g, di.x, di.y, colA, 164, PAL.grass, PAL.pine);
        this.costHead = w.text('Materials', di.x, di.y + 172, ts('body'), PAL.pebble, { font: 'head' });
        this.objs.push(this.costHead);
        this.costs = new CostList(w, di.x, di.y + 172 + Math.round(ts('body') * 1.2) + 6, colA, 8, { cols: 2 });
        const bx = di.x + colA + 14, bw = di.w - colA - 14;
        let by = di.y;
        (['What it does', 'You need', 'Where', 'Then'] as const).forEach((f, i) => {
            this.fields.push(w.text(f, bx, by, ts('cap'), PAL.gold, { font: 'head' }));
            this.bodies.push(w.text('', bx, by + Math.round(ts('cap') * 1.3) + 2, ts('body'), PAL.cream, { bold: false, wrap: bw }));
            this.objs.push(this.fields[i], this.bodies[i]);
            by += 70;
        });
        this.setVisible(false);
    }

    get layout (): StarterLayout { return STARTER_LAYOUTS[this.sel]; }

    setVisible (on: boolean) {
        this.shown = on;
        for (const o of this.objs) o.setVisible(on);
        this.prev?.root.setVisible(on);
        this.costs.setVisible(on);
        for (const z of this.zones) if (z.input) z.input.enabled = on;
        this.key = '';
        if (on) this.update();
    }

    private select (i: number) {
        if (i === this.sel && this.prev) return;
        this.sel = i;
        this.key = '';
        this.buildPreview();
    }

    /** The primary button of the window was pressed on this tab. */
    use () {
        const l = this.layout, me = this.ctx.me();
        if (layoutReq(l).some((t) => !hasUnlock(me, t))) return;
        this.ctx.close();
        this.ctx.farm.bp.startPaste(layoutBlueprint(l));
    }

    private buildPreview () {
        this.prev?.root.destroy();
        const l = this.layout, di = this.det.inner;
        const p = layoutPreview(this.ctx.scene, l.items, { scale: 2, marks: l.marks });
        const x = di.x + Math.round((300 - p.w) / 2), y = di.y + 6 + p.pad + Math.max(0, Math.round((152 - p.pad - p.h) / 2));
        this.win.putAt(p.root, x, y);
        p.root.setVisible(this.shown);
        this.prev = p;
    }

    update () {
        if (!this.shown) return;
        const me = this.ctx.me();
        const k = JSON.stringify([this.sel, me.inv, me.coins, me.skills]);
        if (k === this.key) return;
        this.key = k;
        if (!this.prev) this.buildPreview();
        const g = this.g, li = this.list.inner;
        g.clear();
        STARTER_LAYOUTS.forEach((l, i) => {
            const y = li.y + i * this.rowH, on = i === this.sel;
            if (on) panel(g, li.x, y, li.w, this.rowH - 4, { ...STYLES.gold, r: 2 }); else rect(g, li.x + 4, y + this.rowH - 3, li.w - 8, 1, PAL.slate, 0.35);
            const locked = layoutReq(l).filter((t) => !hasUnlock(me, t));
            const lack = this.lacking(l, me), short = lack.length > 0;
            this.rowName[i].setColor(hex(on ? PAL.ink : PAL.cream));
            const sub = this.rowSub[i];
            sub.setFontSize(this.subPx).setText(locked.length ? `Needs ${locked.map(skillName).join(', ')}` : short ? shortWords(lack) : 'Ready to place')
                .setColor(hex(on ? PAL.ink : locked.length ? PAL.berry : short ? PAL.pumpkin : PAL.lime));
            shrinkToFit(sub, li.w - 54, 10);          // (a long list of skills must not run out of its row)
        });
        const l = this.layout;
        this.det.setTitle(l.name);
        [l.what, l.need, l.where, l.then].forEach((t, i) => this.bodies[i].setText(t));
        const cost = Object.entries(scaledCost(me, totalCost(l.items))) as [Res, number][];
        cost.sort((a, b) => b[1] - a[1]);
        this.costs.set(cost.map(([res, need]) => ({ res, name: resName(res), have: have(me, res), need })));
        const locked = layoutReq(l).filter((t) => !hasUnlock(me, t));
        this.foot.primary!.setEnabled(!locked.length);
        this.foot.primary!.setLabel(locked.length ? 'Locked' : 'Place it');
        this.foot.setHint(locked.length ? `Learn ${locked.map(skillName).join(' and ')} in the skill tree (K) first.` : this.short(l, me) ? 'Short of materials: the red numbers. You can still place what you can afford.' : 'Press Place it, aim the ghost and click.', locked.length ? PAL.berry : this.short(l, me) ? PAL.pumpkin : PAL.pebble);
    }

    private short (l: StarterLayout, me: ReturnType<ScreenCtx['me']>) { return this.lacking(l, me).length > 0; }

    /** What is still missing for a layout, biggest gap first: [resource, how many more]. */
    private lacking (l: StarterLayout, me: ReturnType<ScreenCtx['me']>): [Res, number][] {
        return (Object.entries(scaledCost(me, totalCost(l.items))) as [Res, number][]).filter(([r, n]) => have(me, r) < n).map(([r, n]): [Res, number] => [r, n - have(me, r)]).sort((a, b) => b[1] - a[1]);
    }

    destroy () { /* the window owns every object (the preview included) */ }
}
