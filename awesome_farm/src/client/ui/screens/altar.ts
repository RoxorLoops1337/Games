// The Boss Altar: a card for every boss with what it drops, the sigil recipe, a craft
// button and the summon button. Crafting and summoning are server commands.

import { ensureMobArt } from '../../art/storybook-mobs';
import type * as Phaser from 'phaser';
import { ITEMS, ItemId, iconOf, resName, type Res } from '../../../shared/data/items';
import { BOSS_ORDER, BOSSES, MobKind, MOBS } from '../../../shared/data/mobs';
import { RECIPES } from '../../../shared/data/recipes';
import { PAL } from '../../../shared/palette';
import { countOf } from '../../../shared/sim/stats';
import type { BuildE, MobE } from '../../../shared/sim/types';
import { CostList, Footer, forDevice, GAP, icon, onTap, Section, Slot, tipOn, ts, Win } from '../kit';
import { hex, inset, panel, rect, STYLES } from '../px';
import { itemTip } from '../tips';
import type { Screen, ScreenCtx } from './types';

const TIPS: Record<string, string> = {
    slime: 'Stay out of the red circles. When the little slimes pile up, clear them before the next leap.',
    stone: 'Boulders fall where the red circles appear. Hit it after each slam, when it is catching its breath. If it chains you to a friend, stay within 7 tiles.',
    bog: 'Keep moving: the orbs are slow. The Witch is easiest to hit while she is summoning wisps. If you are hexed, stand next to a friend to pass the curse on.',
    dune: 'Sidestep the charge line, then hit the Pharaoh while it is dizzy. Kill scarabs fast. His curse jumps to a friend you stand beside.',
    frost: 'Weave between the shards. Stay out of the stomp ring and strike right after it lands. If you are frozen, a friend can thaw you: they hold E beside you.',
    heart: 'Everything at once, chains, curses and ice too. Bring friends, keep potions ready, revive and thaw each other.',
};

export class AltarScreen implements Screen {
    private win: Win;
    private id: number;
    private g: Phaser.GameObjects.Graphics;
    private rowsG: Phaser.GameObjects.Graphics;
    private sel = 0;
    private key = '';
    private tabs: { face: Phaser.GameObjects.Image; name: Phaser.GameObjects.Text; sub: Phaser.GameObjects.Text }[] = [];
    private face: Phaser.GameObjects.Image;
    private blurb: Phaser.GameObjects.Text;
    private stats: Phaser.GameObjects.Text;
    private tipT: Phaser.GameObjects.Text;
    private record: Phaser.GameObjects.Text;
    private reward: Slot[] = [];
    private rewardT: Phaser.GameObjects.Text;
    private sigilT: Phaser.GameObjects.Text;
    private costs: CostList;
    private det: Section;
    private foot: Footer;
    private t = 0;
    private rowH: number;
    private list: Section;

    constructor (private ctx: ScreenCtx, arg: unknown) {
        const s = ctx.scene;
        this.id = (arg as { id: number }).id;
        this.win = new Win(s, { size: 'large', title: 'Boss Altar', icon: 'altar', accent: PAL.plum, sub: 'Craft a sigil from the ingredients, then summon the boss it belongs to.', onClose: () => ctx.close() });
        const w = this.win;
        this.foot = w.footer({
            primary: { label: 'Summon', w: 240, onClick: () => { ctx.send({ t: 'summon', id: this.id, boss: BOSS_ORDER[this.sel] }); ctx.close(); } },
            secondary: [{ label: 'Craft sigil', style: STYLES.lime, onClick: () => ctx.send({ t: 'craft', recipe: `altar:${BOSSES[BOSS_ORDER[this.sel]].info.sigil}`, n: 1 }) }],
            hint: '',
        });
        const body = w.body, lw = 280;
        this.g = w.put(s.add.graphics(), 0, 0);
        this.rowsG = w.put(s.add.graphics(), 0, 0);
        // ── the bosses, one under the other ──
        this.list = w.section(body.x, body.y, lw, body.h, 'The bosses', { right: '' });
        this.rowH = Math.floor(this.list.inner.h / BOSS_ORDER.length);
        BOSS_ORDER.forEach((id, i) => {
            const y = this.list.inner.y + i * this.rowH;
            ensureMobArt(s);
            const face = w.put(icon(s, MOBS[BOSSES[id].kind as MobKind].tex, 0, 0, 1), this.list.inner.x + 28, y + this.rowH / 2);
            const name = w.text('', this.list.inner.x + 62, y + this.rowH / 2 - Math.round(ts('body') * 0.9) - 2, ts('body'), PAL.cream, { font: 'head' });
            const sub = w.text('', this.list.inner.x + 62, y + this.rowH / 2 + 2, ts('cap'), PAL.pebble, { bold: false });
            this.tabs.push({ face, name, sub });
            const zone = s.add.zone(0, 0, this.list.inner.w, this.rowH - 4).setOrigin(0).setInteractive({ useHandCursor: true });
            w.put(zone, this.list.inner.x, y);
            onTap(zone, () => { this.sel = i; this.key = ''; });
        });
        // ── the chosen boss ──
        const dx = body.x + lw + GAP, dw = body.x + body.w - dx;
        this.det = w.section(dx, body.y, dw, body.h, '', { right: '' });
        const di = this.det.inner, cw = Math.floor((di.w - 16) / 2);
        // left column: the portrait, what it is like and how to beat it
        this.face = icon(s, 'slimeking', 0, 0, 1);
        w.put(this.face, di.x + 58, di.y + 58);
        this.stats = w.text('', di.x + 126, di.y + 4, ts('body'), PAL.foam, { bold: false, wrap: cw - 126 });
        this.blurb = w.text('', di.x, di.y + 124, ts('body'), PAL.cream, { bold: false, wrap: cw });
        this.tipT = w.text('', di.x, di.y + 164, ts('body'), PAL.pebble, { bold: false, wrap: cw });
        this.record = w.text('', di.x, di.y + di.h - Math.round(ts('cap') * 1.2), ts('cap'), PAL.pebble, { bold: false, wrap: cw });
        // right column: what it drops, and the sigil that calls it
        const cx = di.x + cw + 16;
        w.text('It drops', cx, di.y + 2, ts('body'), PAL.pebble, { font: 'head' });
        for (let i = 0; i < 4; i++) {
            const sl = new Slot(s, 0, 0, 46);
            w.putAt(sl.root, cx + i * 50, di.y + 26);
            this.reward.push(sl);
            tipOn(sl.interactive, () => {
                const id = this.rewards()[i];
                return id ? itemTip(id, { foot: i === 0 ? 'Dropped for everyone who fights' : 'A chance at more, and guaranteed on a first win' }) : null;
            });
        }
        this.rewardT = w.text('', cx, di.y + 78, ts('cap'), PAL.pebble, { bold: false, wrap: cw });
        this.sigilT = w.text('', cx, di.y + 110, ts('body'), PAL.pebble, { font: 'head', wrap: cw });
        this.costs = new CostList(w, cx, di.y + 136, cw, 5);
    }

    private rewards (): ItemId[] {
        const info = BOSSES[BOSS_ORDER[this.sel]].info;
        return [info.trophy, ...info.gear];
    }

    private altar (): BuildE | null {
        const e = this.ctx.farm.ents[this.id];
        return e && e.k === 'bld' ? e : null;
    }

    update (dt: number) {
        const a = this.altar();
        if (!a) { this.ctx.close(); return; }
        this.t += dt;
        const me = this.ctx.me();
        const fighting = Object.values(this.ctx.farm.ents).some((e): e is MobE => e.k === 'mob' && e.alt === a.id);
        const k = JSON.stringify([this.sel, me.inv, me.boss, this.ctx.farm.world.plotAt(a.tx, a.ty)?.heart, fighting]);
        // portrait bobs
        this.face.setY(Math.round(this.face.y + Math.sin(this.t * 2.2) * 0.12));
        if (k === this.key) return;
        this.key = k;
        const id = BOSS_ORDER[this.sel];
        const { kind, info } = BOSSES[id];
        const def = MOBS[kind as MobKind];
        const g = this.g, rg = this.rowsG, li = this.list.inner, di = this.det.inner;
        g.clear(); rg.clear();
        // the list: the chosen one is lifted onto a card in its own colour
        const beaten = BOSS_ORDER.filter((b) => (me.boss?.[b] ?? 0) > 0).length;
        this.list.setRight(`${beaten} / ${BOSS_ORDER.length} defeated`);
        BOSS_ORDER.forEach((bid, i) => {
            const b = BOSSES[bid], d = MOBS[b.kind as MobKind];
            const tab = this.tabs[i];
            const kills = me.boss?.[bid] ?? 0;
            const y = li.y + i * this.rowH;
            const on = i === this.sel;
            if (on) panel(rg, li.x, y, li.w, this.rowH - 4, { ...STYLES.dark, rim: b.info.color, hi: b.info.color });
            else rect(rg, li.x + 4, y + this.rowH - 3, li.w - 8, 1, PAL.slate, 0.3);
            tab.face.setTexture(d.tex, 0);
            const fr = tab.face.frame;
            tab.face.setScale(Math.min(1.4, 38 / Math.max(fr.width, fr.height))).setAlpha(kills ? 1 : 0.8);
            this.win.at(tab.face, li.x + 28, y + this.rowH / 2 - 2);
            tab.name.setText(b.info.title).setColor(hex(kills ? b.info.color : PAL.cream));
            tab.sub.setText(kills ? `Defeated ×${kills}` : bid === 'heart' ? 'The final fight' : 'Not defeated').setColor(hex(kills ? PAL.lime : PAL.pebble));
            if (kills) { rect(rg, li.x + li.w - 20, y + 8, 12, 12, PAL.lime); rect(rg, li.x + li.w - 18, y + 14, 3, 2, PAL.ink); rect(rg, li.x + li.w - 16, y + 12, 3, 4, PAL.ink); }
        });
        // the boss
        this.det.setTitle(info.title);
        this.det.head?.setColor(hex(info.color));
        const mine = me.boss?.[id] ?? 0;
        this.det.setRight(mine ? `Defeated ${mine} time${mine > 1 ? 's' : ''}` : 'Not defeated yet', mine ? PAL.lime : PAL.pebble);
        this.face.setTexture(def.tex, 0);
        const fr = this.face.frame;
        this.face.setScale(Math.min(3, 104 / Math.max(fr.width, fr.height)));
        inset(g, di.x, di.y, 116, 116, PAL.deepSea, PAL.slate); rect(g, di.x + 2, di.y + 2, 112, 2, info.color, 0.8);
        this.win.at(this.face, di.x + 58, di.y + 62);
        const players = this.ctx.farm.meS ? Object.keys(this.ctx.farm.players).length : 1;
        this.stats.setText(`Health ${def.hp}${players > 1 ? '+' : ''}\n${info.phases.length} phases\nHits for ${def.dmg} ♥\nArena ${Math.round(info.arena / 16)} tiles`);
        this.blurb.setText(info.blurb);
        this.win.at(this.blurb, di.x, di.y + 124);
        this.tipT.setText(forDevice(`How to win: ${TIPS[id]}`));
        this.win.at(this.tipT, di.x, di.y + 124 + Math.ceil(this.blurb.height) + 10);
        this.record.setText(mine ? '' : 'The first victory brings its signature gear.');
        // what it drops
        const rw = this.rewards();
        this.reward.forEach((sl, i) => { const it = rw[i]; sl.set(it ? { icon: iconOf(it), rarity: ITEMS[it].rarity } : null); });
        this.rewardT.setText(`And +${info.points} skill points, coins and XP.`);
        // the sigil: what it needs, have against need
        const rec = RECIPES[`altar:${info.sigil}`];
        const have = countOf(me, info.sigil);
        this.sigilT.setText(`${ITEMS[info.sigil].name}${have ? ` (you have ${have})` : ''}`);
        const needs = Object.entries(rec.in) as [ItemId, number][];
        this.costs.set(needs.map(([it, n]) => ({ res: it, name: resName(it as Res), have: countOf(me, it), need: n })));
        const canCraft = needs.every(([it, n]) => countOf(me, it) >= n);
        this.foot.secondary[0].setEnabled(canCraft);
        // summon
        const heartOk = !info.heartOnly || !!this.ctx.farm.world.plotAt(a.tx, a.ty)?.heart;
        let why = '';
        if (fighting) why = 'A fight is already underway at this altar.';
        else if (!heartOk) why = 'The Old Heart can only be woken at the centre of the world.';
        else if (have < 1) why = `You need a ${ITEMS[info.sigil].name}: craft it from the ingredients on the right.`;
        this.foot.primary!.setLabel(`Summon ${def.name}`);
        this.foot.primary!.setEnabled(!why);
        this.foot.setHint(why || 'Everything is ready. Stand clear of the altar: the boss comes out fighting.', why ? PAL.berry : PAL.lime);
    }

    destroy () { this.win.destroy(); }
}
