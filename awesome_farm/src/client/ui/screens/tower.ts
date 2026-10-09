// The Tower window: a tower's (or spike trap's) level, XP, numbers and perks, and, while a pick waits, three big cards to choose an upgrade
// from. Everything it says comes from data/towerperks.ts (the same pure functions the sim uses); a pick is a `towerpick` command, so the
// window changes nothing itself. Opened by using the tower (E, or a tap on a phone).

import type * as Phaser from 'phaser';
import { TILE, TUNING } from '../../../shared/config';
import { BUILDINGS } from '../../../shared/data/buildings';
import { levelFrac, levelOf, offer, pending, PERK_BY_ID, perksOf, RARITY_NAME, statsOf, towerType, xpAt, xpStep, type PerkDef, type Rarity, type TowerType } from '../../../shared/data/towerperks';
import { PAL } from '../../../shared/palette';
import type { BuildE } from '../../../shared/sim/types';
import { ITEMS, type ItemId } from '../../../shared/data/items';
import { maxHp, regenPerSecond, repairCostOf } from '../../../shared/sim/defense';
import { canAfford } from '../../../shared/sim/stats';
import { isTouchUi } from '../../input/layout';
import { button, GAP, icon, onTap, rowBox, STYLES, ts, Win } from '../kit';
import { inset, rect } from '../px';
import type { Screen, ScreenCtx } from './types';

/** The border colour of each rarity (also the world's pick glow). */
export const RARITY_COLOR: Record<Rarity, number> = { common: PAL.pebble, uncommon: PAL.lime, rare: PAL.sea, legendary: PAL.gold };

export class TowerScreen implements Screen {
    private win: Win;
    private id: number;
    private g: Phaser.GameObjects.Graphics;
    private glow: Phaser.GameObjects.Graphics;
    private key = '';
    private dyn: Phaser.GameObjects.GameObject[] = [];
    private legend: { x: number; y: number; w: number; h: number }[] = [];
    private t = 0;

    constructor (private ctx: ScreenCtx, arg: unknown) {
        this.id = (arg as { id: number }).id;
        const e = ctx.farm.ents[this.id];
        const def = e?.k === 'bld' ? BUILDINGS[e.kind] : null;
        this.win = new Win(ctx.scene, { size: 'large', title: def?.name ?? 'Tower', icon: def?.tex, accent: PAL.gold, onClose: () => ctx.close() });
        this.g = this.win.put(ctx.scene.add.graphics(), 0, 0);
        this.glow = this.win.put(ctx.scene.add.graphics(), 0, 0);
        this.win.footer({ hint: 'Towers level up from what they kill. Every level lets you choose one upgrade.' });
    }

    update (dt: number) {
        const f = this.ctx.farm, e = f.ents[this.id];
        if (!e || e.k !== 'bld' || !towerType(e.kind)) { this.ctx.close(); return; }
        const type = towerType(e.kind)!;
        const owner = e.by ? f.players[e.by] : undefined;
        const k = JSON.stringify([e.xp, e.pk, e.hp, owner?.level, e.pw, this.ctx.me().inv]);
        if (k !== this.key) { this.key = k; this.build(e, type, owner?.level ?? 1, owner?.name ?? 'Nobody'); }
        // the legendary cards glow
        this.t += dt;
        this.glow.clear();
        for (const r of this.legend) {
            const a = 0.25 + 0.2 * Math.sin(this.t * 3);
            this.glow.lineStyle(3, PAL.gold, a + 0.2).strokeRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
            this.glow.lineStyle(2, PAL.snow, a).strokeRect(r.x - 5, r.y - 5, r.w + 10, r.h + 10);
        }
    }

    private build (e: BuildE, type: TowerType, ownerLevel: number, ownerName: string) {
        const win = this.win, s = this.ctx.scene, g = this.g, body = win.body;
        g.clear();
        for (const o of this.dyn) o.destroy();
        this.dyn = []; this.legend = [];
        const def = BUILDINGS[e.kind];
        const lv = levelOf(e.xp), top = lv >= TUNING.towers.maxLevel;
        const st = statsOf(type, e.pk, ownerLevel);
        const have = perksOf(e.pk);
        const left = Math.floor(body.w * 0.34), gap = GAP;
        // ── the tower ──
        const sec = win.section(body.x, body.y, left, body.h, def.name, { right: `built by ${ownerName}` });
        const ix = sec.inner.x, iy = sec.inner.y;
        const im = win.put(icon(s, def.tex, 0, 0, 2), ix + 28, iy + 40);
        this.dyn.push(im);
        this.dyn.push(win.text(`Level ${lv}${top ? ' (top)' : ''}`, ix + 66, iy + 6, ts('title'), PAL.gold, { font: 'head' }));
        // the XP bar
        const bx = ix + 66, bw = sec.inner.w - 66, by = iy + 36;
        inset(g, bx, by, bw, 14, PAL.ink, PAL.slate);
        rect(g, bx + 2, by + 2, Math.max(0, Math.round((bw - 4) * levelFrac(e.xp))), 10, top ? PAL.gold : PAL.lime);
        const into = Math.round((e.xp ?? 0) - xpAt(lv));
        this.dyn.push(win.text(top ? `${Math.round(e.xp ?? 0)} XP` : `${into} / ${xpStep(lv + 1)} XP`, bx + bw / 2, by + 7, ts('cap'), PAL.cream, { origin: [0.5, 0.5], dark: true, font: 'head' }));
        // the numbers
        const rows: [string, string][] = [];
        rows.push(['Damage', `${Math.round(st.dmg * 10) / 10}${type === 'tesla' ? ' per monster' : ''}`]);
        if (type !== 'spike') {
            rows.push(['Range', `${Math.round((st.range / TILE) * 10) / 10} tiles`]);
            rows.push(['Fire rate', `${Math.round((1 / st.every) * 100) / 100} per second`]);
            rows.push(['Health', `${Math.ceil(e.hp ?? maxHp(e))} / ${maxHp(e)}`]);
            if (type === 'tesla') rows.push(['Chain', `${st.chain} monsters${(e.pw ?? 0) <= 0.01 ? '  (no power!)' : ''}`]);
        } else rows.push(['Bites', `every ${Math.round(st.every * 100) / 100} s`]);
        if (st.crit > 0) rows.push(['Critical', `${Math.round(st.crit * 100)}%`]);
        let y = iy + 92;
        const lh = Math.round(ts('body') * 1.45);
        for (const [a, b] of rows) {
            this.dyn.push(win.text(a, ix + 4, y, ts('body'), PAL.pebble, { bold: false }));
            this.dyn.push(win.text(b, ix + sec.inner.w - 4, y, ts('body'), PAL.cream, { origin: [1, 0], bold: false }));
            y += lh;
        }
        // regeneration and the repair button (a trap on the floor has no health to mend)
        if (maxHp(e) > 0) {
            const hurt = e.hp !== undefined, per = regenPerSecond(e);
            this.dyn.push(win.text(hurt ? `Regenerating ${Math.round(per * 10) / 10}/s` : `Heals ${Math.round(per * 10) / 10}/s when hurt`, ix + 4, y, ts('cap'), hurt ? PAL.lime : PAL.pebble, { bold: false }));
            y += Math.round(ts('cap') * 1.5);
            const cost = repairCostOf(e) as Record<ItemId, number>;
            const words = Object.entries(cost).map(([r, n]) => `${n} ${ITEMS[r as ItemId]?.name ?? r}`).join(', ');
            const can = hurt && canAfford(this.ctx.me(), cost);
            const btn = button(s, 0, 0, sec.inner.w - 8, isTouchUi() ? 38 : 30, hurt ? `Repair: ${words}` : 'Nothing to repair', () => this.ctx.send({ t: 'towerrepair', id: e.id }), { style: STYLES.gold, size: isTouchUi() ? 14 : 13 });
            btn.setEnabled(can);
            win.put(btn.root, ix + sec.inner.w / 2, sec.y + sec.h - (isTouchUi() ? 30 : 26));
            this.dyn.push(btn.root);
        }
        // the perks it has
        y += 6;
        this.dyn.push(win.text(have.length ? 'Upgrades' : 'No upgrades yet', ix + 4, y, ts('head'), PAL.cream, { font: 'head' }));
        y += Math.round(ts('head') * 1.3) + 2;
        const seen = new Map<string, number>();
        for (const id of have) seen.set(id, (seen.get(id) ?? 0) + 1);
        let px = ix + 4;
        for (const [id, n] of seen) {
            const d = PERK_BY_ID[id];
            if (px + 34 > ix + sec.inner.w) { px = ix + 4; y += 38; }
            inset(g, px, y, 32, 32, PAL.ink, RARITY_COLOR[d.rarity]);
            this.dyn.push(win.put(icon(s, d.icon, 0, 0, 2), px + 16, y + 16));
            if (n > 1) this.dyn.push(win.text(`x${n}`, px + 30, y + 30, ts('cap'), PAL.cream, { origin: [1, 1], dark: true, font: 'head' }));
            px += 36;
        }
        // ── the right side: the choice, or what it has ──
        const rx = body.x + left + gap, rw = body.w - left - gap;
        const wait = pending(e);
        if (wait > 0) {
            const type2 = type;
            const cards = offer(this.ctx.farm.serverSeed(), e.id, type2, e);
            this.dyn.push(win.text(`Choose an upgrade${wait > 1 ? `  (${wait} waiting)` : ''}`, rx + rw / 2, body.y + 2, ts('title'), PAL.gold, { origin: [0.5, 0], font: 'head' }));
            const cy = body.y + 36, ch = Math.min(body.h - 40, 280), cw = Math.floor((rw - gap * (cards.length - 1)) / Math.max(1, cards.length));
            cards.forEach((id, i) => this.card(PERK_BY_ID[id], i, rx + i * (cw + gap), cy, cw, ch, have));
        } else {
            const sec2 = win.section(rx, body.y, rw, body.h, have.length ? 'What it has learned' : 'Upgrades', { right: top ? 'top level' : `next: level ${lv + 1}` });
            let yy = sec2.inner.y;
            if (!have.length) this.dyn.push(win.text('Every level it reaches lets you choose one of three upgrades. Kills earn it XP: elites and bosses a lot.', sec2.inner.x + 4, yy, ts('body'), PAL.pebble, { wrap: sec2.inner.w - 8, bold: false }));
            for (const [id, n] of seen) {
                const d = PERK_BY_ID[id];
                const rh = Math.round(ts('body') * 1.3) * 2 + 10;
                if (yy + rh > sec2.inner.y + sec2.inner.h) break;
                rowBox(g, sec2.inner.x, yy, sec2.inner.w, rh, { on: true, accent: RARITY_COLOR[d.rarity] });
                this.dyn.push(win.put(icon(s, d.icon, 0, 0, 2), sec2.inner.x + 22, yy + rh / 2));
                this.dyn.push(win.text(`${d.name}${n > 1 ? `  x${n}` : ''}`, sec2.inner.x + 44, yy + 4, ts('body'), RARITY_COLOR[d.rarity], { font: 'head' }));
                this.dyn.push(win.text(d.desc, sec2.inner.x + 44, yy + 6 + Math.round(ts('body') * 1.3), ts('cap'), PAL.cream, { bold: false, wrap: sec2.inner.w - 54 }));
                yy += rh + 4;
            }
        }
    }

    private card (d: PerkDef, i: number, x: number, y: number, w: number, h: number, _have: string[]) {
        const win = this.win, s = this.ctx.scene, g = this.g;
        const col = RARITY_COLOR[d.rarity], legend = d.rarity === 'legendary';
        rowBox(g, x, y, w, h, { on: true, accent: col });
        rect(g, x + 3, y + 3, w - 6, 4, col, legend ? 1 : 0.7);
        if (legend) this.legend.push({ x, y, w, h });
        const cx = x + w / 2;
        inset(g, cx - 30, y + 18, 60, 60, PAL.ink, col);
        this.dyn.push(win.put(icon(s, d.icon, 0, 0, 5), cx, y + 48));
        this.dyn.push(win.text(d.name, cx, y + 88, ts('head'), PAL.cream, { origin: [0.5, 0], font: 'head', wrap: w - 16, align: 'center' }));
        this.dyn.push(win.text(RARITY_NAME[d.rarity], cx, y + 88 + Math.round(ts('head') * 1.3) + 2, ts('cap'), col, { origin: [0.5, 0], font: 'head' }));
        this.dyn.push(win.text(d.desc, cx, y + 88 + Math.round(ts('head') * 1.3) + 24, ts('body'), PAL.foam, { origin: [0.5, 0], wrap: w - 22, align: 'center', bold: false }));
        const b = button(s, 0, 0, w - 32, isTouchUi() ? 38 : 30, 'Take it', () => this.ctx.send({ t: 'towerpick', id: this.id, i }), { style: legend ? STYLES.gold : STYLES.lime, size: 15 });
        win.put(b.root, cx, y + h - 26);
        this.dyn.push(b.root);
        // the whole card is the button
        const z = s.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true });
        win.put(z, cx, y + h / 2);
        onTap(z, () => this.ctx.send({ t: 'towerpick', id: this.id, i }));
        this.dyn.push(z);
    }

    destroy () { this.win.destroy(); }
}
